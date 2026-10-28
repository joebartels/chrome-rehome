import { describe, expect, it, vi } from 'vitest';
import { createControlService } from '../../src/background/controls';
import { createCoordinator } from '../../src/background/coordinator';
import { createConfigRepository } from '../../src/config/repository';
import { selectCandidates } from '../../src/planning/candidates';
import { compileDuplicateRules } from '../../src/rules/duplicates';
import { createNavigationTracker, type NavigationInput } from '../../src/background/navigation';
import { createOperationQueue } from '../../src/background/operation-queue';
import { createDiagnostics } from '../../src/diagnostics/diagnostics';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const enabled = { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] };
function createInput(tabId = 7, timeStamp = 100, transitionType = 'link'): NavigationInput {
  return { tabId, frameId: 0, url: 'https://example.com/', timeStamp, kind: 'committed', documentId: 'doc', documentLifecycle: 'active', transitionType, transitionQualifiers: [] };
}
function setup(read = vi.fn<() => Promise<unknown>>(async () => enabled)) {
  const detach = vi.fn();
  const config = createConfigRepository({ read, write: async () => {}, subscribe: () => detach });
  const queue = createOperationQueue();
  const diagnostics = createDiagnostics({ enabled: true });
  const consumed: number[] = [];
  const consume = vi.fn(async (event: { tabId: number }) => { consumed.push(event.tabId); });
  const tracker = createNavigationTracker();
  const coordinator = createCoordinator({ config, tracker, queue, diagnostics, consume });
  return { coordinator, tracker, config, queue, read, consumed, consume, diagnostics, detach };
}

describe.each(['link', 'start_page'])('navigation coordinator (%s)', transitionType => {
  const input = (tabId = 7, timeStamp = 100) => createInput(tabId, timeStamp, transitionType);
  it('shares one initialization and defers immediately arriving navigations until ready', async () => {
    const initial = deferred<unknown>();
    const fake = setup(vi.fn(() => initial.promise));
    const first = fake.coordinator.handle(input());
    const second = fake.coordinator.handle(input(8));
    expect(fake.read).toHaveBeenCalledTimes(1);
    expect(fake.consumed).toEqual([]);
    initial.resolve(enabled);
    await Promise.all([first, second, fake.coordinator.initialize()]);
    expect(fake.consumed).toEqual([7, 8]);
    expect(fake.read).toHaveBeenCalledTimes(1);
    expect(fake.diagnostics.snapshot().filter((event) => event.code === 'worker-started')).toHaveLength(1);
  });

  it.each([undefined, { schemaVersion: 4, enabled: false, groupingRules: [], duplicateRules: [] }, {}, { schemaVersion: 2 }, 'invalid'])
  ('skips consume for disabled or unavailable configuration %j', async (raw) => {
    const fake = setup(vi.fn(async () => raw));
    await fake.coordinator.handle(input());
    expect(fake.consumed).toEqual([]);
  });

  it('fails closed on rejected configuration storage', async () => {
    const fake = setup(vi.fn(async () => { throw new Error('private storage failure'); }));
    await fake.coordinator.handle(input());
    expect(fake.consumed).toEqual([]);
    expect(fake.diagnostics.snapshot()).toContainEqual({ code: 'configuration-unavailable' });
  });

  it('invalidates queued work even when configuration becomes enabled again', async () => {
    const fake = setup();
    await fake.coordinator.initialize();
    const gate = deferred<void>();
    const blocked = fake.queue.run(() => gate.promise);
    const pending = fake.coordinator.handle(input());
    await fake.config.save({ schemaVersion: 4, enabled: false, groupingRules: [], duplicateRules: [] });
    await fake.config.save(enabled);
    gate.resolve();
    await Promise.all([blocked, pending]);
    expect(fake.consumed).toEqual([]);
    await fake.coordinator.handle(input(8));
    expect(fake.consumed).toEqual([8]);
  });

  it('does not revive a navigation observed before initialization when config changes during load', async () => {
    const initial = deferred<unknown>();
    const fake = setup(vi.fn(() => initial.promise));
    const pending = fake.coordinator.handle(input());
    await fake.config.save({ schemaVersion: 4, enabled: false, groupingRules: [], duplicateRules: [] });
    initial.resolve(enabled);
    await pending;
    expect(fake.consumed).toEqual([]);
  });

  it('checks navigation generation when the queued job starts', async () => {
    const fake = setup();
    await fake.coordinator.initialize();
    const gate = deferred<void>();
    const blocked = fake.queue.run(() => gate.promise);
    const old = fake.coordinator.handle(input());
    const latest = fake.coordinator.handle(input(7, 101));
    gate.resolve();
    await Promise.all([blocked, old, latest]);
    expect(fake.consume).toHaveBeenCalledTimes(1);
    expect(fake.consume).toHaveBeenCalledWith(expect.objectContaining({ browserTimeStamp: 101 }), expect.objectContaining({isCurrent:expect.any(Function)}));
  });

  it.each(['invalidate', 'forget'] as const)('%s prevents pending startup navigation from running', async (method) => {
    const initial = deferred<unknown>();
    const fake = setup(vi.fn(() => initial.promise));
    const pending = fake.coordinator.handle(input());
    fake.coordinator[method](7);
    initial.resolve(enabled);
    await pending;
    expect(fake.consumed).toEqual([]);
    await fake.coordinator.handle(input());
    expect(fake.consumed).toEqual([7]);
  });

  it('disposes subscriptions and prevents pending and future work', async () => {
    const initial = deferred<unknown>();
    const fake = setup(vi.fn(() => initial.promise));
    const pending = fake.coordinator.handle(input());
    fake.coordinator.dispose();
    fake.coordinator.dispose();
    initial.resolve(enabled);
    await pending;
    await fake.coordinator.handle(input(8));
    expect(fake.consumed).toEqual([]);
    expect(fake.detach).toHaveBeenCalledTimes(1);
  });

  it('allows later operations after a consumer failure without logging raw payloads', async () => {
    const fake = setup();
    fake.consume.mockRejectedValueOnce(new Error('https://private.example/?secret=one'));
    await expect(fake.coordinator.handle(input())).rejects.toThrow();
    await fake.coordinator.handle(input(8));
    expect(fake.consumed).toEqual([8]);
    expect(JSON.stringify(fake.diagnostics.snapshot())).not.toContain('private');
  });
});


describe.each(['link', 'start_page'])('eligibility coordination races (%s)', transitionType => {
  const input = (tabId = 7, timeStamp = 100) => createInput(tabId, timeStamp, transitionType);
  it.each(['reload', 'replace'] as const)('%s revokes an eligible observation synchronously during config loading', async (action) => {
    const initial = deferred<unknown>();
    const fake = setup(vi.fn(() => initial.promise));
    const pending = fake.coordinator.handle(input());
    const oldView = fake.tracker.view();
    if (action === 'reload') await fake.coordinator.handle({ ...input(7, 101), transitionType: 'reload', transitionQualifiers: ['from_address_bar'] });
    else fake.coordinator.replace(8, 7);
    expect(fake.tracker.isViewCurrent(oldView)).toBe(false);
    expect(fake.tracker.view().navigations).toEqual([]);
    initial.resolve(enabled);
    await pending;
    expect(fake.consumed).toEqual([]);
  });

  it('a later equivalent navigation supersedes queued work through the complete view, without browser time ordering', async () => {
    const initial = deferred<unknown>();
    const config = createConfigRepository({ read: () => initial.promise, write: async () => {}, subscribe: () => () => {} });
    const tracker = createNavigationTracker();
    const selected: number[] = [];
    const compiler = compileDuplicateRules([]);
    if (compiler.kind !== 'ready') throw Error('invalid rules');
    const coordinator = createCoordinator({ config, tracker, queue: createOperationQueue(), diagnostics: createDiagnostics(),
      consume: async (event) => {
        const captured = tracker.view();
        const tabs = [7, 8].map((id) => ({ id, windowId: 1, index: id - 7, groupId: -1, pinned: false, incognito: false, url: 'https://example.com/' }));
        const result = selectCandidates(event, tabs, captured, compiler);
        if (result.kind === 'selected') selected.push(result.winner.id);
      } });
    const old = coordinator.handle(input(7, 900));
    const latest = coordinator.handle(input(8, 100));
    initial.resolve(enabled);
    await Promise.all([old, latest]);
    expect(selected).toEqual([8]);
  });
});


it('captured consume context is revoked while a storage read remains unresolved',async()=>{
  let notify=()=>{};let release!:(value:unknown)=>void;let reload=false;
  const repository=createConfigRepository({read:()=>reload?new Promise(done=>{release=done;}):Promise.resolve(enabled),write:async()=>{},subscribe:listener=>{notify=listener;return ()=>{};}});
  const gate=deferred<void>();const started=deferred<void>();let captured:{isCurrent():boolean}|undefined;
  const coordinator=createCoordinator({config:repository,tracker:createNavigationTracker(),queue:createOperationQueue(),diagnostics:createDiagnostics(),consume:async(_event,context)=>{captured=context;started.resolve();await gate.promise;}});
  const pending=coordinator.handle(createInput());await started.promise;expect(captured!.isCurrent()).toBe(true);reload=true;notify();expect(captured!.isCurrent()).toBe(false);release(enabled);await Promise.resolve();await Promise.resolve();expect(captured!.isCurrent()).toBe(false);gate.resolve();await pending;
});


it.each(['link', 'start_page'])('cold %s waits for recovery readiness and stays blocked after failed recovery', async transitionType => {
  for (const ready of [false, true]) {
    const gate = deferred<void>();
    const entered = deferred<void>();
    const config = createConfigRepository({ read: async () => enabled, write: async () => {}, subscribe: () => () => {} });
    const consumed: number[] = [];
    const recovery = {
      initialize: async () => { entered.resolve(); await gate.promise; },
      isReady: () => ready
    };
    const coordinator = createCoordinator({ config, recovery, tracker: createNavigationTracker(),
      queue: createOperationQueue(), diagnostics: createDiagnostics(),
      consume: async event => { consumed.push(event.tabId); } });
    const pending = coordinator.handle(createInput(7, 100, transitionType));
    await entered.promise;
    expect(consumed).toEqual([]);
    gate.resolve();
    await pending;
    expect(consumed).toEqual(ready ? [7] : []);
  }
});


it('control pause is independent of native settlement and queued navigation cannot revive after resume', async () => {
  let raw = enabled; const config = createConfigRepository({ read: async () => raw, write: async value => { raw = value as typeof enabled; }, subscribe: () => () => {} });
  const controls = createControlService({ config, workerId: 'worker', runtime: () => 'ready' });
  const gate = deferred<void>(); const started = deferred<void>(); let current = () => false; const consumed: number[] = [];
  const coordinator = createCoordinator({ config, controls, tracker: createNavigationTracker(), queue: createOperationQueue(), diagnostics: createDiagnostics(),
    consume: async (event, context) => { consumed.push(event.tabId); current = context.isCurrent; started.resolve(); await gate.promise; } });
  await coordinator.initialize(); const first = coordinator.handle(createInput()); await started.promise;
  const queued = coordinator.handle(createInput(8));
  const pausing = controls.handle({ kind: 'set-enabled', expected: controls.getStatus().version, enabled: false });
  expect(current()).toBe(false); await pausing;
  expect(controls.getStatus().phase).toBe('paused');
  await controls.handle({ kind: 'set-enabled', expected: controls.getStatus().version, enabled: true });
  expect(current()).toBe(false); gate.resolve(); await Promise.all([first, queued]);
  expect(consumed).toEqual([7]); await coordinator.handle(createInput(9)); expect(consumed).toEqual([7, 9]);
});
