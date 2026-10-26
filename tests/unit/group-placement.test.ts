import { describe, expect, it } from 'vitest';
import { createOperationQueue } from '../../src/background/operation-queue';
import { createGroupPlacementService, type GroupPlacementPort } from '../../src/execution/group-placement';
import type { DestinationGroup, DestinationTab, GroupRequest } from '../../src/planning/group-destination';

const request: GroupRequest = { tabId: 1, windowId: 10, incognito: false, title: 'BarTab' };
const tab = (change: Partial<DestinationTab> = {}): DestinationTab => ({ id: 1, windowId: 10, index: 5, groupId: -1, pinned: false, incognito: false, ...change });
function gate() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function world(tabs: DestinationTab[] = [tab()], groups: DestinationGroup[] = []) {
  const state = { tabs, groups };
  const events: string[] = [];
  let readCount = 0, nextId = 20;
  const hooks: { read?: (count: number) => void | Promise<void>; group?: () => void | Promise<void>; title?: () => void | Promise<void> } = {};
  const port: GroupPlacementPort = {
    async read(windowId) { events.push(`read:${windowId}`); await hooks.read?.(++readCount); return structuredClone(state); },
    async groupTab(tabId, destination) {
      events.push(`group:${destination.kind}`);
      await hooks.group?.();
      const id = destination.kind === 'new' ? nextId++ : destination.groupId;
      if (destination.kind === 'new') state.groups.push({ id, windowId: destination.windowId });
      state.tabs = state.tabs.map(t => t.id === tabId ? { ...t, groupId: id } : t);
      return id;
    },
    async setTitle(id, title) { events.push(`title:${id}`); await hooks.title?.(); state.groups = state.groups.map(g => g.id === id ? { ...g, title } : g); },
  };
  return { state, events, hooks, port, service: createGroupPlacementService({ port, queue: createOperationQueue() }) };
}
const reused = { kind: 'placed', windowId: 10, groupId: 7, action: 'reused' };
const created = { kind: 'placed', windowId: 10, groupId: 20, action: 'created' };
const member = () => tab({ id: 2, groupId: 7, index: 0 });
const group = () => ({ id: 7, windowId: 10, title: 'BarTab' });

describe('group placement service', () => {
  it('observes twice, groups a real tab, names it, and verifies before success', async () => {
    const w = world();
    expect(await w.service.place(request)).toEqual(created);
    expect(w.state.tabs[0]?.groupId).toBe(20);
    expect(w.state.groups).toEqual([{ id: 20, windowId: 10, title: 'BarTab' }]);
    expect(w.events).toEqual(['read:10', 'read:10', 'group:new', 'read:10', 'title:20', 'read:10']);
  });
  it('reuses without updating group attributes and verifies membership/title', async () => {
    const w = world([tab(), member()], [group()]);
    expect(await w.service.place(request)).toEqual(reused);
    expect(w.events).toEqual(['read:10', 'read:10', 'group:existing', 'read:10']);
  });
  it('requires a fresh already-grouped observation without mutation', async () => {
    const w = world([tab({ groupId: 7 })], [group()]);
    expect(await w.service.place(request)).toEqual({ ...reused, action: 'already-grouped' });
    expect(w.events).toEqual(['read:10', 'read:10']);
  });
  it.each([{ tabId: -1 }, { windowId: -2 }, { title: '' }, { title: 'x\u0080' }, { title: ' x' }, { title: 'x'.repeat(81) }, { incognito: null }])('validates before any port call: %j', async change => {
    const w = world();
    expect(await w.service.place({ ...request, ...change } as GroupRequest)).toEqual({ kind: 'skipped', reason: 'invalid-request' });
    expect(w.events).toEqual([]);
  });
  it.each([
    [(w: ReturnType<typeof world>) => { w.state.tabs = []; }, 'tab-missing'],
    [(w: ReturnType<typeof world>) => { w.state.tabs = [tab({ pinned: true })]; }, 'pinned'],
    [(w: ReturnType<typeof world>) => { w.state.tabs = [tab({ windowId: 11 })]; }, 'window-changed'],
    [(w: ReturnType<typeof world>) => { w.state.tabs = [tab({ incognito: true })]; }, 'context-changed'],
    [(w: ReturnType<typeof world>) => { w.state.groups = [group()]; }, 'inconsistent-snapshot'],
  ] as const)('latest skip prevents mutation', async (change, reason) => {
    const w = world(); w.hooks.read = n => { if (n === 2) change(w); };
    expect(await w.service.place(request)).toEqual({ kind: 'skipped', reason });
    expect(w.events).toEqual(['read:10', 'read:10']);
  });
  it('recovers a torn first snapshot from one newer coherent observation', async () => {
    const w = world([tab()], [group()]);
    w.hooks.read = n => { if (n === 2) w.state.tabs.push(member()); };
    expect(await w.service.place(request)).toEqual(reused);
  });
  it('recovers a missing first tab from a newer observation', async () => {
    const w = world([]); w.hooks.read = n => { if (n === 2) w.state.tabs.push(tab()); };
    expect(await w.service.place(request)).toEqual(created);
  });
  it.each(['deleted', 'renamed', 'last-member'] as const)('replans after %s before mutation', async kind => {
    const w = world([tab(), member()], [group()]), entered = gate(), release = gate();
    w.hooks.read = async n => { if (n === 2) { entered.resolve(); await release.promise; } };
    const placing = w.service.place(request); await entered.promise;
    if (kind === 'renamed') w.state.groups = [{ ...group(), title: 'Other' }];
    else { w.state.groups = []; w.state.tabs = [tab()]; }
    release.resolve();
    expect(await placing).toEqual(created);
    expect(w.events).toContain('group:new');
  });
  it('replans to a newly available current group', async () => {
    const w = world(); w.hooks.read = n => { if (n === 2) { w.state.tabs = [tab({ groupId: 7 })]; w.state.groups = [group()]; } };
    expect(await w.service.place(request)).toEqual({ ...reused, action: 'already-grouped' });
    expect(w.events).toEqual(['read:10', 'read:10']);
  });
  it.each([1, 2])('preserves original read rejection before mutation at read %i', async at => {
    const w = world(), cause = { read: at }; w.hooks.read = n => { if (n === at) throw cause; };
    const result = await w.service.place(request);
    expect(result).toEqual({ kind: 'failed', stage: 'read', cause, effect: 'not-started' });
    expect(result.kind === 'failed' && result.cause).toBe(cause);
    expect(w.events.some(x => x.startsWith('group'))).toBe(false);
  });
  it('reports uncertain effects after a rejected grouping call without retry', async () => {
    const w = world(), cause = new Error('group'); w.hooks.group = () => { w.state.tabs = [tab({ groupId: 99 })]; throw cause; };
    const result = await w.service.place(request);
    expect(result).toEqual({ kind: 'failed', stage: 'group', cause, effect: 'uncertain' });
    expect(result.kind === 'failed' && result.cause).toBe(cause);
    expect(w.state.tabs[0]?.groupId).toBe(99);
    expect(w.events).toEqual(['read:10', 'read:10', 'group:new']);
  });
  it('reports original title rejection and leaves the created membership intact', async () => {
    const w = world(), cause = { title: 'failure' }; w.hooks.title = () => { throw cause; };
    const result = await w.service.place(request);
    expect(result).toEqual({ kind: 'failed', stage: 'title', cause, effect: 'grouped', groupId: 20 });
    expect(result.kind === 'failed' && result.cause).toBe(cause);
    expect(w.state.tabs[0]?.groupId).toBe(20); expect(w.state.groups[0]?.title).toBeUndefined();
    expect(w.events.filter(x => x.startsWith('title'))).toHaveLength(1);
  });
  it.each([3, 4])('preserves post-mutation read failures at %i', async at => {
    const w = world(), cause = new Error('verify'); w.hooks.read = n => { if (n === at) throw cause; };
    const result = await w.service.place(request);
    expect(result).toEqual({ kind: 'failed', stage: 'verify', cause, effect: at === 3 ? 'grouped' : 'titled', groupId: 20 });
    expect(result.kind === 'failed' && result.cause).toBe(cause);
  });
  it.each(['missing', 'moved', 'context', 'pinned', 'membership', 'deleted', 'renamed'] as const)('fails verification after reuse when %s changes', async kind => {
    const w = world([tab(), member()], [group()]);
    w.hooks.read = n => {
      if (n !== 3) return;
      const current = w.state.tabs[0]!;
      if (kind === 'missing') w.state.tabs = [member()];
      if (kind === 'moved') w.state.tabs[0] = { ...current, windowId: 11 };
      if (kind === 'context') w.state.tabs[0] = { ...current, incognito: true };
      if (kind === 'pinned') w.state.tabs[0] = { ...current, pinned: true };
      if (kind === 'membership') w.state.tabs[0] = { ...current, groupId: -1 };
      if (kind === 'deleted') w.state.groups = [];
      if (kind === 'renamed') w.state.groups = [{ ...group(), title: 'Other' }];
    };
    expect(await w.service.place(request)).toEqual({ kind: 'failed', stage: 'verify', cause: new Error('Group placement state changed'), effect: 'grouped', groupId: 7 });
    expect(w.events.filter(x => x.startsWith('group'))).toHaveLength(1);
  });
  it('does not overwrite a nonempty external title supplied before naming', async () => {
    const w = world(); w.hooks.read = n => { if (n === 3) w.state.groups[0] = { id: 20, windowId: 10, title: 'External' }; };
    expect(await w.service.place(request)).toMatchObject({ kind: 'failed', stage: 'verify', effect: 'grouped', groupId: 20 });
    expect(w.state.groups[0]?.title).toBe('External'); expect(w.events).not.toContain('title:20');
  });
  it('accepts the already exact external title without calling update', async () => {
    const w = world(); w.hooks.read = n => { if (n === 3) w.state.groups[0] = { id: 20, windowId: 10, title: 'BarTab' }; };
    expect(await w.service.place(request)).toEqual(created); expect(w.events).not.toContain('title:20');
  });
  it('accepts an empty title for naming', async () => {
    const w = world(); w.hooks.read = n => { if (n === 3) w.state.groups[0] = { id: 20, windowId: 10, title: '' }; };
    expect(await w.service.place(request)).toEqual(created);
  });
  it.each(['deleted', 'renamed', 'pinned', 'last-member'] as const)('detects %s after title instead of claiming success', async kind => {
    const w = world(); w.hooks.read = n => {
      if (n !== 4) return;
      if (kind === 'deleted') w.state.groups = [];
      if (kind === 'renamed') w.state.groups[0] = { id: 20, windowId: 10, title: 'Other' };
      if (kind === 'pinned') w.state.tabs[0] = tab({ pinned: true, groupId: 20 });
      if (kind === 'last-member') { w.state.tabs = [tab()]; w.state.groups = []; }
    };
    expect(await w.service.place(request)).toMatchObject({ kind: 'failed', stage: 'verify', effect: 'titled', groupId: 20 });
  });
  it('serializes simultaneous requests through final verification, creating one group', async () => {
    const w = world([tab(), tab({ id: 2 })]), entered = gate(), release = gate();
    w.hooks.read = async n => { if (n === 4) { entered.resolve(); await release.promise; } };
    const first = w.service.place(request); await entered.promise;
    const second = w.service.place({ ...request, tabId: 2 });
    await Promise.resolve();
    expect(w.events).toEqual(['read:10', 'read:10', 'group:new', 'read:10', 'title:20', 'read:10']);
    release.resolve();
    expect(await first).toEqual(created);
    expect(await second).toEqual({ ...created, action: 'reused' });
    expect(w.state.groups).toHaveLength(1); expect(w.state.tabs.every(t => t.groupId === 20)).toBe(true);
  });
  it('recovers after failure without treating an unnamed partial group as the title', async () => {
    const w = world([tab(), tab({ id: 2 })]); w.hooks.title = () => { throw new Error('title'); };
    expect(await w.service.place(request)).toMatchObject({ kind: 'failed', stage: 'title' });
    delete w.hooks.title;
    expect(await w.service.place({ ...request, tabId: 2 })).toEqual({ ...created, groupId: 21 });
    expect(w.state.groups.map(g => g.title)).toEqual([undefined, 'BarTab']);
  });
});
