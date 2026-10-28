import { createControlService } from '../../src/background/controls';
import { createConfigRepository } from '../../src/config/repository';
import { protectionFixture } from '../fixtures/protections';
import { deferred } from '../fixtures/replacement';
import { expect, test } from 'vitest';
import { selectCandidates } from '../../src/planning/candidates';
import { planReplacement } from '../../src/planning/replacement';
import { createReplacementExecutor } from '../../src/execution/replacement';
import { navigation, view, identity, tab, doc } from '../fixtures/placement';
import { replacementFixture } from '../fixtures/replacement';
const protectedTabs = [{ tabId: 1, incognito: false }];
test.each(['audible', 'protected'])('incoming %s tab skips grouping and closure', kind => {
  if (identity.kind !== 'ready') throw Error('rules');
  const tabs = [tab(1, 0, { audible: kind === 'audible' }), tab(2, 1)];
  expect(selectCandidates(navigation, tabs, view, identity, { allowNoDuplicates: true, protectedTabs: kind === 'protected' ? protectedTabs : [] }).kind).toBe('skip');
});
test.each([2, 3])('protected older duplicate %i retains priority and forbids every closure', id => {
  if (identity.kind !== 'ready') throw Error('rules');
  const tabs = [tab(1, 0), tab(2, 1), tab(3, 0, { windowId: 20 })];
  const protections = [{ tabId: id, incognito: false }];
  const selection = selectCandidates(navigation, tabs, view, identity, { allowNoDuplicates: true, protectedTabs: protections });
  expect(selection).toMatchObject({ kind: 'selected', anchor: { id: 2 }, closureEligible: false });
  if (selection.kind === 'skip') throw Error('selection');
  const plan = planReplacement({ selection, snapshot: { tabs, groups: [] }, view, identity, documents: [doc(1), doc(2)], configRevision: 1, protectedTabs: protections });
  expect(plan).toMatchObject({ kind: 'place', anchorTabId: 2, closureEligible: false });
  // A caller cannot upgrade the original all-or-none retention decision during re-selection.
  expect(planReplacement({ selection, snapshot: { tabs, groups: [] }, view, identity, documents: [doc(1), doc(2)], configRevision: 1, protectedTabs: [] })).toMatchObject({ kind: 'place', closureEligible: false });
});
test.each([2, 3])('audible older duplicate %i permits placement but retains every duplicate', async id => {
  const f = replacementFixture([tab(1, 0), tab(2, 1), tab(3, 0, { windowId: 20, audible: id === 3 })].map(t => t.id === id ? { ...t, audible: true } : t));
  expect(f.plan).toMatchObject({ closureEligible: false });
  expect(await createReplacementExecutor({ port: f.port, journal: f.journal }).execute(f.plan, f.guard)).toMatchObject({ kind: 'completed', closure: 'ineligible', removedTabIds: [] });
  expect(f.calls).toEqual(['move']);
});
test.each(['snapshot', 'document:3', 'journal:pending:remove', 'native:remove'])('fresh participant audio at %s prevents the next mutation', async boundary => {
  const f = replacementFixture(); let changed = false;
  f.boundary(async name => { if (name === boundary && !changed) { changed = true; f.change(s => ({ ...s, tabs: s.tabs.map(t => t.id === 3 ? { ...t, audible: true } : t) })); } });
  expect((await createReplacementExecutor({ port: f.port, journal: f.journal }).execute(f.plan, f.guard)).kind).toBe('stopped');
  expect(f.removed).toEqual(boundary === 'native:remove' ? [2] : []);
});

test.each(['pause', 'protect', 'audio'])('%s revokes real control captures at every executor await and native settlement remains awaited', async action => {
  const probe = replacementFixture([tab(1, 0), tab(2, 0, { windowId: 20, groupId: 8 }), tab(3, 1, { windowId: 20, groupId: 8 })], [{ id: 8, windowId: 20, title: 'Manual' }]);
  const steps: string[] = []; probe.boundary(async name => { steps.push(name); });
  expect((await createReplacementExecutor({ port: probe.port, journal: probe.journal }).execute(probe.plan, probe.guard)).kind).toBe('completed');
  for (const boundary of steps.keys()) {
    const f = replacementFixture([tab(1, 0), tab(2, 0, { windowId: 20, groupId: 8 }), tab(3, 1, { windowId: 20, groupId: 8 })], [{ id: 8, windowId: 20, title: 'Manual' }]);
    let raw: any = { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] };
    const config = createConfigRepository({ read: async () => raw, write: async value => { raw = value; }, subscribe: () => () => {} });
    const protection = protectionFixture(); const target = { tabId: 1, windowId: 10, incognito: false, documentId: 'one' };
    protection.setTarget({ receipt: target, audible: false, pinned: false });
    const controls = createControlService({ config, ...protection, workerId: 'worker', runtime: () => 'ready' }); await controls.initialize();
    const capture = controls.capture()!; const entered = deferred<void>(); const release = deferred<void>(); let index = 0; let before: string[] = [];
    f.boundary(async () => { if (index++ === boundary) { before = [...f.calls]; entered.resolve(); await release.promise; } });
    let settled = false;
    const pending = createReplacementExecutor({ port: f.port, journal: f.journal }).execute(f.plan, { isCurrent: () => controls.isCurrent(capture), expectRemoval: f.guard.expectRemoval }).then(result => { settled = true; return result; });
    await entered.promise;
    if (action === 'pause') await controls.handle({ kind: 'set-enabled', expected: controls.getStatus().version, enabled: false });
    else if (action === 'protect') await controls.handle({ kind: 'set-tab-protected', expected: controls.getStatus().version, target, protected: true });
    else controls.invalidate();
    expect(controls.isCurrent(capture)).toBe(false); expect(settled).toBe(false);
    release.resolve(); await pending; expect(f.calls, steps[boundary] + ':' + boundary).toEqual(before);
    if (action === 'pause') await controls.handle({ kind: 'set-enabled', expected: controls.getStatus().version, enabled: true });
    expect(controls.isCurrent(capture)).toBe(false); controls.dispose();
  }
});
test('unrelated audio is not structural equality while participant audio remains guarded', async () => {
  const f = replacementFixture([tab(2, 0), tab(1, 1), tab(4, 2, { url: 'https://unrelated.test/' })]);
  f.boundary(async name => { if (name === 'journal:pending:remove') f.change(s => ({ ...s, tabs: s.tabs.map(t => t.id === 4 ? { ...t, audible: true } : t) })); });
  expect(await createReplacementExecutor({ port: f.port, journal: f.journal }).execute(f.plan, f.guard)).toMatchObject({ kind: 'completed', removedTabIds: [2] });
});
