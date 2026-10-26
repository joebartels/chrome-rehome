import { describe, expect, it } from 'vitest';
import { selectCandidates, type CandidateNavigation, type CandidateTab, type NavigationView } from '../../src/planning/candidates';
import { compileDuplicateRules } from '../../src/rules/duplicates';
import { createNavigationTracker } from '../../src/background/navigation';

const epoch = Symbol();
function navigation(overrides: Partial<CandidateNavigation> = {}): CandidateNavigation {
  return Object.freeze({ epoch, tabId: 7, generation: 1, observedSequence: 1, documentId: 'doc', url: 'https://example.com/a', ...overrides });
}
function tab(overrides: Partial<Record<keyof CandidateTab, unknown>> = {}): CandidateTab {
  return Object.freeze({ id: 7, windowId: 1, index: 0, groupId: -1, pinned: false, incognito: false, url: 'https://example.com/a', ...overrides }) as CandidateTab;
}
function view(navigations: readonly CandidateNavigation[] = [navigation()], overrides: Partial<NavigationView> = {}): NavigationView {
  return Object.freeze({ epoch, revision: 1, navigations: Object.freeze([...navigations]), blockedTabIds: Object.freeze([]), ...overrides });
}
function identity(relaxed = false) {
  const compiled = compileDuplicateRules(relaxed ? [{ origin: 'https://example.com', ignoreQueryParameters: ['tracking'],
    ignoreFragment: true, ignoreTrailingSlash: true, sortQueryParameters: true }] : []);
  if (compiled.kind !== 'ready') throw Error('invalid test rules');
  return compiled;
}
const snapshots = Object.freeze([tab(), tab({ id: 8, index: 1 })]);

describe('pure candidate selection', () => {
  it('selects the trigger and passive duplicate through the actual compiler', () => {
    const event = navigation();
    const result = selectCandidates(event, snapshots, view([event]), identity());
    expect(result).toMatchObject({ kind: 'selected', epoch, revision: 1, winner: { id: 7 }, navigation: event,
      anchor: { id: 8 }, duplicates: [{ id: 8 }] });
    if (result.kind !== 'selected') throw Error('selection missing');
    expect(result.winner).not.toBe(snapshots[0]);
    expect(result.navigation).not.toBe(event);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.winner)).toBe(true);
    expect(Object.isFrozen(result.anchor)).toBe(true);
    expect(Object.isFrozen(result.navigation)).toBe(true);
    expect(Object.isFrozen(result.duplicates)).toBe(true);
  });

  it('uses latest observed sequence despite a lower browser timestamp, with tab ID ties', () => {
    const older = Object.freeze({ ...navigation(), browserTimeStamp: 900 });
    const newer = Object.freeze({ ...navigation({ tabId: 8, generation: 2, observedSequence: 2 }), browserTimeStamp: 100 });
    for (const events of [[older, newer], [newer, older]]) {
      expect(selectCandidates(older, snapshots, view(events), identity())).toEqual({ kind: 'skip', reason: 'superseded' });
      expect(selectCandidates(newer, snapshots, view(events), identity())).toMatchObject({ kind: 'selected', winner: { id: 8 } });
    }
    const tie = navigation({ tabId: 8 });
    expect(selectCandidates(tie, snapshots, view([tie, navigation()]), identity())).toEqual({ kind: 'skip', reason: 'superseded' });
  });

  it.each([
    { epoch: Symbol() }, { generation: 2 }, { documentId: 'changed' }, { observedSequence: 2 }, { url: 'https://example.com/a#changed' },
  ])('requires the complete trigger observation to match %j', (change) => {
    expect(selectCandidates(navigation(change), snapshots, view(), identity(true))).toEqual({ kind: 'skip', reason: 'stale-trigger' });
  });

  it('rejects an absent current trigger', () => {
    expect(selectCandidates(navigation(), snapshots, view([]), identity())).toEqual({ kind: 'skip', reason: 'stale-trigger' });
  });

  it('native href permits equivalent spelling but relaxed identity cannot hide stale URLs', () => {
    const event = navigation({ url: 'https://EXAMPLE.com:443/a' });
    expect(selectCandidates(event, snapshots, view([event]), identity())).toMatchObject({ kind: 'selected' });
    const changed = [tab({ url: 'https://example.com/a?tracking=new' }), snapshots[1]!];
    expect(selectCandidates(navigation(), changed, view(), identity(true))).toEqual({ kind: 'skip', reason: 'unavailable-trigger' });
  });

  it.each([{ pinned: true }, { pendingUrl: '' }, { pendingUrl: 'https://example.com/a' },
    { url: undefined }, { url: 'chrome://settings' }, { url: 'https://user:pass@example.com/a' },
    { url: 'https://example.com/a b' }])('excludes unavailable trigger snapshots %j', (change) => {
    expect(selectCandidates(navigation(), [tab(change), snapshots[1]!], view(), identity()))
      .toEqual({ kind: 'skip', reason: 'unavailable-trigger' });
  });

  it('excludes blocked trigger and absent trigger snapshots', () => {
    expect(selectCandidates(navigation(), snapshots, view(undefined, { blockedTabIds: [7] }), identity()))
      .toEqual({ kind: 'skip', reason: 'unavailable-trigger' });
    expect(selectCandidates(navigation(), [snapshots[1]!], view(), identity())).toEqual({ kind: 'skip', reason: 'unavailable-trigger' });
  });

  it.each([{ pinned: true }, { pendingUrl: '' }, { pendingUrl: 'https://example.com/a' }, { incognito: true },
    { url: undefined }, { url: 'https://other.example/a' }, { url: 'https://user:pass@example.com/a' }])
  ('excludes unavailable/passive cross-context duplicates %j', (change) => {
    expect(selectCandidates(navigation(), [snapshots[0]!, tab({ id: 8, ...change })], view(), identity()))
      .toEqual({ kind: 'skip', reason: 'no-duplicates' });
  });

  it('excludes blocked or snapshot-inconsistent current competitors even with relaxed identity', () => {
    const competing = navigation({ tabId: 8, observedSequence: 2, generation: 2, url: 'https://example.com/a?tracking=old' });
    expect(selectCandidates(navigation(), snapshots, view([navigation(), competing]), identity(true)))
      .toEqual({ kind: 'skip', reason: 'no-duplicates' });
    expect(selectCandidates(navigation(), snapshots, view(undefined, { blockedTabIds: [8] }), identity()))
      .toEqual({ kind: 'skip', reason: 'no-duplicates' });
  });

  it('uses compiled identity without normalizing the returned actual URL', () => {
    const actual = 'https://example.com/a/?tracking=old#hash';
    expect(selectCandidates(navigation(), [snapshots[0]!, tab({ id: 8, url: actual })], view(), identity(true)))
      .toMatchObject({ kind: 'selected', anchor: { id: 8, url: actual } });
    const privateTabs = snapshots.map((entry) => tab({ ...entry, incognito: true }));
    expect(selectCandidates(navigation(), privateTabs, view(), identity())).toMatchObject({ kind: 'selected', winner: { incognito: true } });
  });

  it('orders anchor by winner window, window ID, index and tab ID independently of permutations', () => {
    const tabs = [tab({ windowId: 9 }), tab({ id: 8, windowId: 1, index: 0 }), tab({ id: 9, windowId: 9, index: 2 }),
      tab({ id: 10, windowId: 9, index: 1 }), tab({ id: 11, windowId: 9, index: 1 }), tab({ id: 12, windowId: 2, index: 0 })];
    for (const entries of [tabs, [...tabs].reverse(), [...tabs.slice(2), ...tabs.slice(0, 2)]]) {
      const result = selectCandidates(navigation(), Object.freeze(entries), view(), identity());
      expect(result).toMatchObject({ kind: 'selected', anchor: { id: 10 } });
      if (result.kind === 'selected') expect(result.duplicates.map((duplicate) => duplicate.id)).toEqual([10, 11, 9, 8, 12]);
    }
  });

  it.each([{ id: -1 }, { windowId: 1.5 }, { index: -1 }, { groupId: -2 }, { pinned: undefined }, { incognito: undefined }])
  ('rejects malformed snapshot structure %j', (change) => {
    expect(selectCandidates(navigation(), [tab(change), snapshots[1]!], view(), identity())).toEqual({ kind: 'skip', reason: 'invalid-input' });
  });

  it.each([{ generation: 0 }, { observedSequence: Number.MAX_SAFE_INTEGER + 1 }, { documentId: '' }, { epoch: Symbol() }, { tabId: -1 }])
  ('rejects malformed or foreign current observations %j', (change) => {
    expect(selectCandidates(navigation(), snapshots, view([navigation(change)]), identity())).toEqual({ kind: 'skip', reason: 'invalid-input' });
  });

  it('rejects duplicate snapshot and navigation IDs, even identical records', () => {
    for (const duplicate of [tab(), tab({ url: 'https://example.com/conflict' })]) {
      expect(selectCandidates(navigation(), [...snapshots, duplicate], view(), identity())).toEqual({ kind: 'skip', reason: 'invalid-input' });
    }
    expect(selectCandidates(navigation(), snapshots, view([navigation(), navigation()]), identity())).toEqual({ kind: 'skip', reason: 'invalid-input' });
  });

  it('rejects malformed view counters and blocked IDs', () => {
    for (const change of [{ revision: -1 }, { revision: Number.MAX_SAFE_INTEGER + 1 }, { blockedTabIds: [-1] }, { blockedTabIds: [8, 8] }]) {
      expect(selectCandidates(navigation(), snapshots, view(undefined, change), identity())).toEqual({ kind: 'skip', reason: 'invalid-input' });
    }
  });

  it('requires capture before browser read and detects invalidation of an unobserved anchor', async () => {
    const tracker = createNavigationTracker();
    const event = tracker.observe({ tabId: 7, frameId: 0, kind: 'committed', url: 'https://example.com/a', timeStamp: 100,
      transitionType: 'typed', transitionQualifiers: [], documentLifecycle: 'active', documentId: 'doc' })!;
    const captured = tracker.view();
    const read = Promise.resolve(snapshots).then((tabs) => { tracker.invalidate(8); return tabs; });
    const tabs = await read;
    expect(selectCandidates(event, tabs, captured, identity())).toMatchObject({ kind: 'selected' });
    expect(tracker.isViewCurrent(captured)).toBe(false);
  });
});
