import { foregroundFixture } from '../fixtures/replacement';
import { describe, expect, it, vi } from 'vitest';
import { createReplacementExecutor } from '../../src/execution/replacement';
import { createOperationQueue } from '../../src/background/operation-queue';
import { createReplacementJournal } from '../../src/execution/journal';
import { createNavigationTracker } from '../../src/background/navigation';
import { createRecovery } from '../../src/background/recovery';
import { compileDuplicateRules } from '../../src/rules/duplicates';
import { selectCandidates } from '../../src/planning/candidates';
import { planReplacement } from '../../src/planning/replacement';
import { navigation, view, tab, doc } from '../fixtures/placement';
import { deferred, replacementFixture as fixture } from '../fixtures/replacement';
const execute = (f: ReturnType<typeof fixture>) => createReplacementExecutor({ port: f.port, journal: f.journal }).execute(f.plan, f.guard);
describe('journaled replacement', () => {

  it('closure waits for placed checkpoint and complete independent evidence', async () => {
    const f = fixture();
    const started = deferred<void>();
    const release = deferred<void>();
    f.boundary(async (name) => {
      if (name === 'journal:placed') {
        started.resolve();
        await release.promise;
      }
    });
    const pending = execute(f);
    await started.promise;
    expect(f.calls).toEqual([]);
    release.resolve();
    expect(await pending).toMatchObject({
      kind: 'completed',
      placement: { kind: 'unchanged' },
      closure: 'completed',
      removedTabIds: [2, 3]
    });
    expect(f.expected).toEqual([2, 3]);
    expect(f.stored).toBeUndefined();
  });

  it.each(['missing', 'error', 'inactive', 'subframe'])('passive %s evidence preserves inherited placement and prevents all closure', async (kind) => {
    const f = fixture([tab(2, 0, {groupId:8}), tab(1, 1), tab(3, 0, {windowId:20})], [{id:8,windowId:10,title:'Manual'}], 'Work');
    if (kind === 'missing')
      f.documents.delete(3);
    else
      f.documents.set(3, doc(3, kind === 'error'
        ? { errorOccurred: true }
        : kind === 'inactive' ? { documentLifecycle: 'cached' } : { frameType: 'sub_frame' }));
    expect(await execute(f)).toMatchObject({
      kind: 'completed',
      placement: { kind: 'placed' },
      closure: 'ineligible',
      removedTabIds: []
    });
    expect(f.calls).toEqual(['group']);
  });

  it('known shared passive group remains closure ineligible while inherited grouping proceeds', async () => {
    const f = fixture([tab(2,0,{groupId:8}),tab(1,1),tab(3,0,{windowId:20,groupId:9})], [{id:8,windowId:10,title:'Manual'},{id:9,windowId:20,shared:true}], 'Work');
    expect(await execute(f)).toMatchObject({ kind: 'completed', closure: 'ineligible' });
    expect(f.calls).toEqual(['group']);
  });

  it('unavailable passive document rejection is closure ineligible, while winner or anchor failure stops placement', async () => {
    const f = fixture([tab(2, 0, {groupId:8}), tab(1, 1), tab(3, 0, {windowId:20})], [{id:8,windowId:10,title:'Manual'}], 'Work');
    const read = f.port.readDocument;
    f.port.readDocument = id => id === 3 ? Promise.reject(Error('unavailable')) : read(id);
    expect(await execute(f)).toMatchObject({ kind: 'completed', closure: 'ineligible' });
    expect(f.calls).toEqual(['group']);
    const winner = fixture();
    winner.documents.delete(1);
    expect((await execute(winner)).kind).toBe('stopped');
    expect(winner.calls).toEqual([]);
    const anchor = fixture();
    anchor.documents.delete(2);
    expect((await execute(anchor)).kind).toBe('stopped');
    expect(anchor.calls).toEqual([]);
  });

  it('closure preserves receipt minus verified removals across windows groups and unrelated order', async () => {
    const f = fixture([
      tab(2, 0, { groupId: 8 }),
      tab(1, 1, { groupId: 8 }),
      tab(8, 2, { url: 'https://other.test/' }),
      tab(3, 0, { windowId: 20, groupId: 9 }),
      tab(4, 0, { windowId: 30, groupId: 7 })
    ], [
      { id: 8, windowId: 10, title: 'Keep' },
      { id: 9, windowId: 20, title: 'Empty' },
      { id: 7, windowId: 30, title: 'Empty' }
    ]);
    expect(await execute(f)).toMatchObject({ kind: 'completed', removedTabIds: [2, 3, 4] });
    expect(f.snapshot.tabs.map(t => [t.id, t.index])).toEqual([[1, 0], [8, 1]]);
    expect(f.snapshot.groups).toEqual([{ id: 8, windowId: 10, title: 'Keep' }]);
  });
  const changes = [
    'url',
    'equivalent-url',
    'document',
    'pending',
    'pin',
    'context',
    'window',
    'group',
    'index',
    'shared',
    'missing',
    'unrelated-group'
  ] as const;

  it.each([1, 2, 3].flatMap(id => changes.map(change => [id, change] as const)))('all remaining participants revalidate before each remove: %i %s', async (id, change) => {
    const f = fixture([
      tab(2, 0, { groupId: 8 }),
      tab(1, 1, { groupId: 8 }),
      tab(3, 0, { windowId: 20, groupId: 9 }),
      tab(8, 2, { url: 'https://other.test/', groupId: 7 })
    ], [
      { id: 8, windowId: 10, title: 'Old' },
      { id: 9, windowId: 20, title: 'Old' },
      { id: 7, windowId: 10, title: 'Survivor' }
    ]);
    f.boundary(async (name) => {
      if (name !== 'journal:pending:remove')
        return;
      if (change === 'document') {
        f.documents.set(id, doc(id, { documentId: 'new-document' }));
        return;
      }
      if (change === 'shared' || change === 'unrelated-group') {
        f.change(s => ({
          ...s,
          groups: s.groups.map(g => g.id === (change === 'unrelated-group' ? 7 : id === 3 ? 9 : 8)
            ? { ...g, ...(change === 'shared' ? { shared: true } : { title: 'changed' }) }
            : g)
        }));
        return;
      }
      f.change(s => ({
        ...s,
        tabs: change === 'missing' ? s.tabs.filter(t => t.id !== id) : s.tabs.map(t => t.id !== id ? t : {
          ...t,
          ...(change === 'url' ? { url: 'https://else.test/' }
            : change === 'equivalent-url' ? { url: t.url + '?tracking=changed' }
            : change === 'pending' ? Object.defineProperty({}, 'pendingUrl', { value: undefined, enumerable: true })
            : change === 'pin' ? { pinned: true }
            : change === 'context' ? { incognito: true }
            : change === 'window' ? { windowId: 999 }
            : change === 'group' ? { groupId: -1 }
            : { index: 99 })
        })
      }));
    });
    expect((await execute(f)).kind).toBe('stopped');
    expect(f.removed).toEqual([]);
  });

  it('all participants revalidate again after first verified removal without rebasing', async () => {
    const f = fixture();
    f.boundary(async (name) => {
      if (name === 'journal:removed')
        f.documents.set(3, doc(3, { documentId: 'reload' }));
    });
    expect(await execute(f)).toMatchObject({ kind: 'stopped', removedTabIds: [2] });
    expect(f.removed).toEqual([2]);
  });

  it('every await around evidence placement and closure irrevocably revokes further mutation', async () => {
    const probe = fixture();
    const steps: string[] = [];
    probe.boundary(async (name) => {
      steps.push(name);
    });
    expect((await execute(probe)).kind).toBe('completed');
    for (const target of steps.keys()) {
      const f = fixture();
      const entered = deferred<void>();
      const release = deferred<void>();
      let index = 0;
      let before: string[] = [];
      f.boundary(async () => {
        if (index++ === target) {
          before = [...f.calls];
          entered.resolve();
          await release.promise;
        }
      });
      const pending = execute(f);
      await entered.promise;
      f.revoke();
      release.resolve();
      await pending;
      expect(f.calls, steps[target] + ':' + target).toEqual(before);
    }
  });

  it('every placement native call is durably pending before a fresh preflight', async () => {
    for (const [tabs, groups, title, kinds] of [
      [
        [tab(1, 0, { groupId: 7 }), tab(2, 0, { windowId: 20, groupId: 8 })],
        [{ id: 7, windowId: 10 }, { id: 8, windowId: 20 }],
        undefined,
        ['ungroup', 'move', 'group']
      ],
      [[tab(1, 0)], [], 'Work', ['group', 'title']],
      [[tab(1, 0), tab(2, 1)], [], undefined, ['move']]
    ] as const) {
      for (const kind of kinds) {
        const f = fixture([...tabs], [...groups], title);
        f.boundary(async (name) => {
          if (name === 'journal:pending:' + kind)
            f.revoke();
        });
        const result = await execute(f);
        expect(result.kind).toBe('stopped');
        expect(f.calls).not.toContain(kind);
        expect(f.stored).toBeUndefined();
      }
    }
  });

  it('100 participants accepted and 101 skipped before any mutation', async () => {
    const make = (count: number) => fixture([
      tab(1, 1),
      tab(2, 0),
      ...Array.from({ length: count - 2 }, (_, i) => tab(i + 3, 0, { windowId: i + 20 }))
    ]);
    const f = make(100);
    expect((await execute(f)).kind).toBe('completed');
    expect(f.removed).toHaveLength(99);
    const tooMany = make(101);
    expect((await execute(tooMany)).kind).toBe('stopped');
    expect(tooMany.calls).toEqual([]);
    expect(tooMany.writes).toEqual([]);
  });

  it.each(['remove', 'move'])('native rejection and bookkeeping failure preserve original %s cause', async (kind) => {
    const f = kind === 'move' ? fixture([tab(1, 0), tab(2, 1)]) : fixture();
    const cause = { native: 'rejection' };
    const journalFailure = Error('disk');
    if (kind === 'move')
      f.port.moveTab = async () => {
        throw cause;
      };
    else
      f.port.removeTab = async () => {
        throw cause;
      };
    let pending = false;
    f.boundary(async (name) => {
      if (name === 'journal:pending:' + kind)
        pending = true;
      else if (pending && name === 'journal:prepared' || pending && name === 'journal:placed')
        throw journalFailure;
    });
    const result = await execute(f);
    expect(result.kind).toBe('stopped');
    if (result.kind !== 'stopped')
      throw Error('completed');
    expect(kind === 'move' && result.placement?.kind === 'failed' ? result.placement.cause : result.cause).toBe(cause);
    expect(f.journal.isBlocked()).toBe(true);
    if (kind === 'remove')
      expect(result.uncertainRemovalId).toBe(2);
  });

  it.each(['reject', 'present'])('remove %s stops survivors with honest uncertainty', async (kind) => {
    const f = fixture();
    const cause = { native: true };
    f.port.removeTab = async (id) => {
      f.calls.push('remove:' + id);
      if (kind === 'reject')
        throw cause;
    };
    const result = await execute(f);
    expect(result).toMatchObject({ kind: 'stopped', removedTabIds: [], uncertainRemovalId: 2 });
    expect(f.calls).toEqual(['remove:2']);
    if (kind === 'reject' && result.kind === 'stopped')
      expect(result.cause).toBe(cause);
  });

  it('sole queue waits for actual pending native promise and settlement checkpoint despite elapsed time', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      const entered = deferred<void>();
      const release = deferred<void>();
      const native = f.port.removeTab;
      f.port.removeTab = async (id) => {
        entered.resolve();
        await release.promise;
        return native(id);
      };
      const queue = createOperationQueue();
      const first = queue.run(() => execute(f));
      await entered.promise;
      let later = false;
      const second = queue.run(async () => {
        later = true;
        expect((f.stored as { pending: unknown } | undefined)?.pending).toBeUndefined();
      });
      await vi.advanceTimersByTimeAsync(3600000);
      expect(later).toBe(false);
      release.resolve();
      await Promise.all([first, second]);
      expect(later).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('late old-worker native effect stays quarantined without old callbacks', async () => {
    const f = fixture();
    const entered = deferred<void>();
    const effect = deferred<void>();
    const never = deferred<void>();
    const native = f.port.removeTab;
    f.port.removeTab = async (id) => {
      entered.resolve();
      await effect.promise;
      await native(id);
      await never.promise;
    };
    void execute(f);
    await entered.promise;
    const durable = structuredClone(f.stored);
    const fresh = createReplacementJournal({ storage: f.storage, createOperationId: () => 'new' });
    const recovery = createRecovery({ journal: fresh, port: f.port });
    await recovery.initialize();
    expect(recovery.isReady()).toBe(false);
    effect.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.stored).toEqual(durable);
    expect(f.removed).toEqual([2]);
    await recovery.initialize();
    expect(recovery.isReady()).toBe(false);
    expect(f.removed).toEqual([2]);
  });
});

it('multiple actual move phases receive distinct durable ordinals', async () => {
  const f = fixture([
    tab(1, 0, { groupId: 7 }),
    tab(2, 0, { windowId: 20, groupId: 8 }),
    tab(8, 1, { windowId: 20, groupId: 8, url: 'https://other.test/' })
  ], [{ id: 7, windowId: 10 }, { id: 8, windowId: 20 }]);
  expect(await execute(f)).toMatchObject({ kind: 'completed', removedTabIds: [2] });
  expect(f.writes.flatMap(value => value.pending?.kind === 'move' ? [value.pending.sequence] : [])).toEqual([2, 4]);
  expect(f.calls).toEqual(['ungroup', 'move', 'group', 'move', 'remove:2']);
});

it('secret-bearing href identity title and navigation generations never enter journal fields', async () => {
  const f = fixture();
  const url = 'https://example.com/?password=private-value#private-fragment';
  const participants = [f.plan.winner, ...f.plan.duplicates].map(p => Object.freeze({
    ...p,
    identity: 'private-identity',
    tab: Object.freeze({ ...p.tab, url }),
    ...(p.document ? { document: Object.freeze({ ...p.document, url }) } : {}),
    ...(p.navigation ? { navigation: Object.freeze({ ...p.navigation, url }) } : {})
  }));
  const plan = Object.freeze({
    ...f.plan,
    winner: participants[0]!,
    duplicates: Object.freeze(participants.slice(1)),
    baseline: Object.freeze({
      tabs: Object.freeze(f.plan.baseline.tabs.map(t => Object.freeze({ ...t, url }))),
      groups: f.plan.baseline.groups
    })
  });
  f.change(s => ({ ...s, tabs: s.tabs.map(t => ({ ...t, url })) }));
  for (const [id, document] of f.documents)
    f.documents.set(id, { ...document, url });
  expect((await createReplacementExecutor({ port: f.port, journal: f.journal }).execute(plan, f.guard)).kind).toBe('completed');
  expect(JSON.stringify(f.writes)).not.toContain('private');
  for (const value of f.writes) {
    expect(Object.keys(value).sort()).toEqual([
      'version',
      'operationId',
      'participants',
      'completedPhase',
      'sequence',
      'pending',
      'removedTabIds',
      'terminal'
    ].sort());
    for (const p of value.participants)
      expect(Object.keys(p).sort()).toEqual(['tabId', 'incognito', 'documentId'].sort());
  }
});

it.each(['prepared', 'placed', 'removed', 'completed', 'clear'])('storage failure at %s blocks later work and never repairs unknown durable state', async (phase) => {
  const f = fixture();
  f.boundary(async (name) => {
    if (name === 'journal:' + phase)
      throw Error('storage');
  });
  const first = await execute(f);
  expect(first.kind).toBe('stopped');
  expect(f.journal.isBlocked()).toBe(true);
  const calls = [...f.calls];
  const durable = structuredClone(f.stored);
  await execute(f);
  expect(f.calls).toEqual(calls);
  expect(f.stored).toEqual(durable);
});

it('fulfilled-but-present after an earlier verified removal reports exactly the verified prefix', async () => {
  const f = fixture();
  const native = f.port.removeTab;
  f.port.removeTab = id => id === 2 ? native(id) : Promise.resolve();
  expect(await execute(f)).toMatchObject({ kind: 'stopped', removedTabIds: [2], uncertainRemovalId: 3 });
  expect(f.removed).toEqual([2]);
});

it.each(['before-resolution', 'after-resolution', 'during-next'])('issued removal feedback %s does not invalidate sequential closure', async (timing) => {
  const f = fixture();
  const tracker = createNavigationTracker();
  const lease = tracker.createRemovalLease(tracker.view(), [2, 3]);
  const native = f.port.removeTab;
  f.port.removeTab = async (id) => {
    if (timing === 'during-next' && id === 3)
      tracker.forget(2);
    await native(id);
    if (timing === 'before-resolution' || id === 3)
      tracker.forget(id);
  };
  if (timing === 'after-resolution')
    f.boundary(async (name) => {
      if (name === 'journal:removed' && f.removed.length === 1)
        tracker.forget(2);
    });
  const guard = {
    isCurrent: () => lease.isCurrent(),
    expectRemoval: (id: number) => lease.expectRemoval(id)
  };
  try {
    expect(await createReplacementExecutor({ port: f.port, journal: f.journal }).execute(f.plan, guard)).toMatchObject({
      kind: 'completed',
      removedTabIds: [2, 3]
    });
  } finally {
    lease.dispose();
  }
});

it('competing winner while a remove is pending stays stale after our delayed event', async () => {
  const f = fixture();
  const tracker = createNavigationTracker();
  const lease = tracker.createRemovalLease(tracker.view(), [2, 3]);
  const entered = deferred<void>();
  const release = deferred<void>();
  const native = f.port.removeTab;
  f.port.removeTab = async (id) => {
    entered.resolve();
    await release.promise;
    await native(id);
    tracker.forget(id);
  };
  const pending = createReplacementExecutor({ port: f.port, journal: f.journal }).execute(f.plan, {
    isCurrent: () => lease.isCurrent(),
    expectRemoval: id => lease.expectRemoval(id)
  });
  await entered.promise;
  tracker.observe({
    tabId: 99,
    frameId: 0,
    url: 'https://example.com/',
    timeStamp: 1,
    documentId: 'competing',
    kind: 'committed',
    documentLifecycle: 'active',
    transitionType: 'link',
    transitionQualifiers: []
  });
  release.resolve();
  expect(await pending).toMatchObject({ kind: 'stopped', removedTabIds: [], uncertainRemovalId: 2 });
  expect(f.removed).toEqual([2]);
  expect(lease.isCurrent()).toBe(false);
  lease.dispose();
});

it.each(['title', 'color', 'shared', 'survivor-order'])('passive-window %s changes during placement cannot become a fresh closure receipt', async (change) => {
  const f = fixture([
    tab(2,0,{groupId:7}),
    tab(1,1),
    tab(3,0,{windowId:20,groupId:8}),
    tab(8, 1, { windowId: 20, url: 'https://other.test/' }),
    tab(9, 2, { windowId: 20, url: 'https://else.test/' })
  ], [{id:7,windowId:10,title:'Manual'},{ id: 8, windowId: 20, title: 'Original' }], 'Work');
  f.boundary(async (name) => {
    if (name !== 'native:group')
      return;
    if (change === 'survivor-order')
      f.change(s => ({
        ...s,
        tabs: s.tabs.map(t => t.id === 8 ? { ...t, index: 2 } : t.id === 9 ? { ...t, index: 1 } : t)
      }));
    else
      f.change(s => ({
        ...s,
        groups: s.groups.map(g => g.id === 8 ? {
          ...g,
          ...(change === 'title' ? { title: 'Changed' } : change === 'shared' ? { shared: true } : { color: 'blue' })
        } : g)
      }));
  });
  expect(await execute(f)).toMatchObject({ kind: 'stopped', phase: 'placement' });
  expect(f.calls).toEqual(['group']);
  expect(f.removed).toEqual([]);
});

it('native rejection remains the returned cause when abandoned terminal persistence also fails', async () => {
  const f = fixture([tab(1, 0), tab(2, 1)]);
  const nativeCause = { native: 'original' };
  f.port.moveTab = async () => {
    throw nativeCause;
  };
  f.boundary(async (name) => {
    if (name === 'journal:abandoned')
      throw Error('terminal storage');
  });
  const result = await execute(f);
  expect(result.kind).toBe('stopped');
  if (result.kind === 'stopped')
    expect(result.cause).toBe(nativeCause);
  expect(f.journal.isBlocked()).toBe(true);
  expect(f.removed).toEqual([]);
});

it('a genuinely relaxed-equivalent passive URL change never authorizes closure', async () => {
  const f = fixture();
  const identity = compileDuplicateRules([
    {
      origin: 'https://example.com',
      ignoreQueryParameters: ['tracking'],
      ignoreFragment: false,
      ignoreTrailingSlash: false,
      sortQueryParameters: false
    }
  ]);
  if (identity.kind !== 'ready')
    throw Error('invalid rules');
  const selection = selectCandidates(navigation, f.snapshot.tabs, view, identity, { allowNoDuplicates: true });
  if (selection.kind === 'skip')
    throw Error(selection.reason);
  const plan = planReplacement({
    selection,
    view,
    snapshot: f.snapshot,
    documents: [doc(1), doc(2)],
    identity,
    configRevision: 1
  });
  if (plan.kind !== 'place')
    throw Error(plan.reason);
  const changedUrl = 'https://example.com/?tracking=new';
  expect(identity.equivalent({ url: navigation.url, incognito: false }, { url: changedUrl, incognito: false })).toBe(true);
  f.boundary(async (name) => {
    if (name === 'journal:pending:remove') {
      f.change(s => ({ ...s, tabs: s.tabs.map(t => t.id === 3 ? { ...t, url: changedUrl } : t) }));
      f.documents.set(3, doc(3, { url: changedUrl }));
    }
  });
  expect((await createReplacementExecutor({ port: f.port, journal: f.journal }).execute(plan, f.guard)).kind).toBe('stopped');
  expect(f.removed).toEqual([]);
});

it('fulfilled removal that relocates its target to another window stops before another close', async () => {
  const f = fixture();
  const remove = f.port.removeTab;
  f.port.removeTab = async id => {
    if (id !== 2) return remove(id);
    f.calls.push('relocated-instead:' + id);
    f.change(snapshot => ({
      ...snapshot,
      tabs: snapshot.tabs.map(tab => tab.id === id
        ? { ...tab, windowId: 999, index: 0 }
        : tab.windowId === 10 ? { ...tab, index: tab.index - 1 } : tab)
    }));
  };

  const result = await execute(f);

  expect(result).toMatchObject({ kind: 'stopped', removedTabIds: [], uncertainRemovalId: 2 });
  expect(f.snapshot.tabs.find(tab => tab.id === 2)).toMatchObject({ windowId: 999 });
  expect(f.calls).toEqual(['relocated-instead:2']);
  expect(f.writes.some(value => value.removedTabIds.includes(2))).toBe(false);
});

it('a target present outside affected windows in the final verification snapshot remains uncertain', async () => {
  const f = fixture();
  const target = f.plan.duplicates.find(participant => participant.tab.id === 2)!.tab;
  let restored = false;
  f.boundary(async name => {
    // The first post-remove snapshot was absent; expose the still-live target
    // during the following document read, before the final bracket snapshot.
    if (name !== 'document:1' || !f.removed.includes(2) || restored) return;
    restored = true;
    f.change(snapshot => ({
      ...snapshot,
      tabs: [...snapshot.tabs, { ...target, windowId: 999, index: 0 }]
    }));
  });

  const result = await execute(f);

  expect(restored).toBe(true);
  expect(result).toMatchObject({ kind: 'stopped', removedTabIds: [], uncertainRemovalId: 2 });
  expect(f.calls).toEqual(['remove:2']);
  expect(f.writes.some(value => value.removedTabIds.includes(2))).toBe(false);
});

it('foreground placement journals activate then focus before placed and removal, preserving native source successor',async()=>{
  const f=foregroundFixture({grouped:true});
  const result=await createReplacementExecutor({port:f.port,journal:f.journal}).execute(f.plan,f.guard);
  expect(result.kind).toBe('completed');expect(f.calls).toEqual(['move','group','activate','focus','remove:2']);
  expect(f.attention()).toEqual({focusedWindowId:20,activeTabs:[{windowId:10,tabId:4},{windowId:20,tabId:1}]});
  expect(f.snapshot.groups).toMatchObject([{id:8,collapsed:false}]);
  expect(f.writes.filter(w=>w.pending).map(w=>w.pending!.kind)).toEqual(['move','group','activate','focus','remove']);
  expect(f.writes.findIndex(w=>w.completedPhase==='focus')).toBeLessThan(f.writes.findIndex(w=>w.completedPhase==='placed'));
});
it('deliberate background keeps source/destination active spares, focus, and collapse',async()=>{
  const f=foregroundFixture({preserve:true,grouped:true});const before=f.attention();
  expect((await createReplacementExecutor({port:f.port,journal:f.journal}).execute(f.plan,f.guard)).kind).toBe('completed');
  expect(f.attention()).toEqual(before);expect(f.snapshot.groups).toMatchObject([{id:8,collapsed:true}]);
  expect(f.calls).toEqual(['move','group','remove:2']);
});
it('foreground lone-source native focus continuation needs only activation',async()=>{
  const f=foregroundFixture({lone:true});
  expect((await createReplacementExecutor({port:f.port,journal:f.journal}).execute(f.plan,f.guard)).kind).toBe('completed');
  expect(f.calls).toEqual(['move','activate','remove:2']);expect(f.attention()).toEqual({focusedWindowId:20,activeTabs:[{windowId:20,tabId:1}]});
});
it.each(['activate','focus'] as const)('native %s failure preserves cause and prevents removal',async kind=>{
  const f=foregroundFixture();const cause={native:kind};f.port[kind==='activate'?'activateTab':'focusWindow']=async()=>{throw cause;};
  const result=await createReplacementExecutor({port:f.port,journal:f.journal}).execute(f.plan,f.guard);
  expect(result).toMatchObject({kind:'stopped',cause,removedTabIds:[],placement:{kind:'failed',phase:kind}});
  if(result.kind==='stopped')expect(result.cause).toBe(cause);expect(f.removed).toEqual([]);
});
it.each(['journal:pending:activate','journal:pending:focus','snapshot','document:1'])('user attention change during %s revokes presentation and closure',async at=>{
  const f=foregroundFixture();let hit=false;
  f.boundary(async name=>{if(name===at&&!hit){hit=true;f.focus(20);}});
  const result=await createReplacementExecutor({port:f.port,journal:f.journal}).execute(f.plan,f.guard);
  expect(hit).toBe(true);expect(result.kind).toBe('stopped');expect(f.removed).toEqual([]);
  if(at==='journal:pending:activate')expect(f.calls).toEqual(['move']);
  if(at==='journal:pending:focus')expect(f.calls).toEqual(['move','activate']);
});

it('attention change during durable placed receipt prevents subsequent removal',async()=>{
  const f=foregroundFixture();f.boundary(async name=>{if(name==='journal:placed')f.focus(10);});
  expect((await createReplacementExecutor({port:f.port,journal:f.journal}).execute(f.plan,f.guard)).kind).toBe('stopped');
  expect(f.removed).toEqual([]);
});

it.each(['activate','focus'] as const)('each %s persistence/native/verification failure stops closure',async kind=>{
  for(const fault of ['pending-write','guard','native-reject','settled-write','verified-change','unknown-attention'] as const){
    const f=foregroundFixture();const method=kind==='activate'?'activateTab':'focusWindow';const cause={kind,fault};let issued=false;let hit=false;
    const native=f.port[method];f.port[method]=async id=>{issued=true;if(fault==='native-reject')throw cause;await native(id);};
    const write=f.storage.write;f.storage.write=async value=>{
      if(fault==='pending-write'&&value.pending?.kind===kind){hit=true;throw cause;}
      if(fault==='settled-write'&&issued&&value.pending===null){hit=true;throw cause;}
      await write(value);
    };
    f.boundary(async name=>{
      if(name==='journal:pending:'+kind&&fault==='guard'){hit=true;f.revoke();}
      if(name==='journal:'+kind&&fault==='verified-change'){hit=true;f.focus(kind==='activate'?20:10);}
      if(name==='journal:pending:'+kind&&fault==='unknown-attention'){hit=true;f.port.readPresentation=async()=>undefined;}
    });
    const result=await createReplacementExecutor({port:f.port,journal:f.journal}).execute(f.plan,f.guard);
    expect(result.kind,fault).toBe('stopped');expect(f.removed,fault).toEqual([]);
    expect(hit||fault==='native-reject',fault).toBe(true);
    if(fault==='pending-write'||fault==='guard'||fault==='unknown-attention')expect(issued,fault).toBe(false);
    if(fault==='pending-write'||fault==='settled-write')expect(f.journal.isBlocked(),fault).toBe(true);
    if(fault==='native-reject'&&result.kind==='stopped')expect(result.cause).toBe(cause);
  }
});
it.each(['activate','focus'] as const)('unresolved %s holds queue until actual native settlement without timeout or removal',async kind=>{
  const f=foregroundFixture();const entered=deferred<void>();const release=deferred<void>();const method=kind==='activate'?'activateTab':'focusWindow';const native=f.port[method];
  f.port[method]=async id=>{entered.resolve();await release.promise;await native(id);};
  const queue=createOperationQueue();let finished=false;let next=false;
  const pending=queue.run(()=>createReplacementExecutor({port:f.port,journal:f.journal}).execute(f.plan,f.guard)).then(r=>{finished=true;return r;});
  await entered.promise;const queued=queue.run(async()=>{next=true;});f.revoke();await Promise.resolve();
  expect(finished).toBe(false);expect(next).toBe(false);expect(f.stored).toMatchObject({version:2,pending:{kind,tabId:1}});
  release.resolve();expect((await pending).kind).toBe('stopped');await queued;expect(next).toBe(true);expect(f.removed).toEqual([]);
});
it('freezes the native source successor and rejects a later source selection change',async()=>{
  const f=foregroundFixture();let hit=false;f.boundary(async name=>{if(name==='journal:pending:activate'){hit=true;f.select(10,999);}});
  expect((await createReplacementExecutor({port:f.port,journal:f.journal}).execute(f.plan,f.guard)).kind).toBe('stopped');
  expect(hit).toBe(true);expect(f.calls).toEqual(['move']);expect(f.removed).toEqual([]);
});
it('disappeared source without observed destination focus stops conservatively',async()=>{
  const f=foregroundFixture({lone:true});const move=f.port.moveTab;f.port.moveTab=async(...args)=>{await move(...args);f.focus(999);};
  expect((await createReplacementExecutor({port:f.port,journal:f.journal}).execute(f.plan,f.guard)).kind).toBe('stopped');expect(f.removed).toEqual([]);
});

it.each(['snapshot','document:1','document:2'])('attention change during presentation preflight %s after pending persistence stops the native call',async at=>{
  const f=foregroundFixture();let armed=false;let hit=false;
  f.boundary(async name=>{
    if(name==='journal:pending:activate')armed=true;
    if(armed&&name===at&&!hit){hit=true;f.focus(20);}
  });
  expect((await createReplacementExecutor({port:f.port,journal:f.journal}).execute(f.plan,f.guard)).kind).toBe('stopped');
  expect(hit).toBe(true);expect(f.calls).toEqual(['move']);expect(f.removed).toEqual([]);
});
it.each(['activate','focus'] as const)('original %s rejection survives an independent settlement write failure',async kind=>{
  const f=foregroundFixture();const cause={native:kind};let issued=false;
  f.port[kind==='activate'?'activateTab':'focusWindow']=async()=>{issued=true;throw cause;};
  const write=f.storage.write;f.storage.write=async value=>{if(issued&&value.pending===null)throw Error('storage');await write(value);};
  const result=await createReplacementExecutor({port:f.port,journal:f.journal}).execute(f.plan,f.guard);
  expect(result.kind).toBe('stopped');if(result.kind==='stopped')expect(result.cause).toBe(cause);
  expect(f.journal.isBlocked()).toBe(true);expect(f.stored).toMatchObject({pending:{kind}});expect(f.removed).toEqual([]);
});
