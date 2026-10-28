import { expect, test } from 'vitest';
import { createCoordinator } from '../../src/background/coordinator';
import { createOperationQueue } from '../../src/background/operation-queue';
import { createNavigationTracker } from '../../src/background/navigation';
import { createDiagnostics } from '../../src/diagnostics/diagnostics';
import { createControlService } from '../../src/background/controls';
import { createNativeControlTargets } from '../../src/browser/control-target';
import { createConfigRepository } from '../../src/config/repository';
import { targetFixture, targetHint as hint } from '../fixtures/control-target';
import { protectionFixture } from '../fixtures/protections';
import { deferred } from '../fixtures/replacement';
const initial = { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] };
const stored = { version: 1, tabs: [{ tabId: 7, incognito: false }] };
function fixture(raw?: unknown, ready: () => Promise<void> = async () => {}) {
  const target = targetFixture(); target.tab = { ...target.tab, active: false };
  const registry = protectionFixture(raw); let configRaw: unknown = initial;
  let readiness: 'checking' | 'ready' | 'blocked' = 'ready';
  const config = createConfigRepository({ read: async () => configRaw, write: async value => { configRaw = value; }, subscribe: () => () => {} });
  const service = createControlService({ config, protections: registry.protections, targets: target.port,
    nativeTargets: createNativeControlTargets(target.api), whenReady: ready, workerId: 'worker', runtime: () => readiness });
  expect(service.setNativeTabProtected).toBeTypeOf('function');
  return { target, registry, service, config, get configRaw() { return configRaw; }, setReadiness(value: typeof readiness) { readiness = value; },
    protect: (value: boolean, requested = hint) => service.setNativeTabProtected(requested, value),
    pause: () => service.handle({ kind: 'set-enabled', expected: service.getStatus().version, enabled: false }) };
}
test('native acceptance synchronously revokes captures, preserves configuration and never exposes target status', async () => {
  const f = fixture(); await f.service.initialize(); const capture = f.service.capture()!;
  const pending = f.protect(true);
  expect(f.service.isCurrent(capture)).toBe(false); expect(f.service.getStatus().phase).toBe('checking');
  expect(await pending).toMatchObject({ kind: 'ok', status: { phase: 'active' } });
  expect(f.registry.raw).toEqual(stored); expect(f.configRaw).toEqual(initial);
  expect(f.service.getStatus()).not.toHaveProperty('target'); expect(f.target.listeners()).toBe(0);
  expect(await f.protect(false)).toMatchObject({ kind: 'ok' }); expect(f.registry.raw).toEqual({ version: 1, tabs: [] });
});
test.each([true, false])('cold native intent %s survives owned initialization while remaining pending until readiness', async value => {
  const gate = deferred<void>(); const f = fixture(stored, () => gate.promise); f.setReadiness('checking');
  const pending = f.protect(value); let settled = false; void pending.then(() => { settled = true; });
  expect(f.target.listeners()).toBeGreaterThan(0); await f.service.initialize();
  expect(settled).toBe(false); expect(f.registry.writes).toEqual([]); expect(f.service.capture()).toBeUndefined();
  f.setReadiness('ready'); gate.resolve(); expect((await pending).kind).toBe('ok'); expect(f.target.listeners()).toBe(0);
});
test('cold readiness never holds the writer against newer Pause or freshens stale Unprotect', async () => {
  const gate = deferred<void>(); const f = fixture(stored, () => gate.promise); f.setReadiness('checking');
  const pending = f.protect(false);
  expect(await f.pause()).toMatchObject({ kind: 'ok', status: { savedEnabled: false } });
  expect(f.registry.raw).toEqual(stored); f.setReadiness('ready'); gate.resolve();
  expect((await pending).kind).toBe('conflict'); expect(f.configRaw).toEqual({ ...initial, enabled: false });
  expect(f.service.getStatus().phase).toBe('paused'); expect(f.target.listeners()).toBe(0);
});
test.each(['config', 'protection'] as const)('external %s changes during readiness revoke original native intent', async store => {
  const gate = deferred<void>(); const f = fixture(undefined, () => gate.promise);
  const pending = f.protect(true); await f.service.initialize();
  if (store === 'config') await f.config.load(); else { f.registry.external(stored); await f.registry.protections.load(); }
  gate.resolve(); expect((await pending).kind).toBe('conflict'); expect(f.registry.writes).toEqual([]); expect(f.target.listeners()).toBe(0);
});
test('rapid Protect/Unprotect/Protect rejects superseded intents and leaves latest protection', async () => {
  const f = fixture(); await f.service.initialize();
  const first = f.protect(true); const second = f.protect(false); const third = f.protect(true);
  expect((await first).kind).toBe('conflict'); expect((await second).kind).toBe('conflict'); expect((await third).kind).toBe('ok');
  expect(f.registry.raw).toEqual(stored); expect(f.configRaw).toEqual(initial); expect(f.target.listeners()).toBe(0);
});
test.each(['close', 'replacement', 'reload', 'window', 'privacy'] as const)('native observation survives readiness and rejects %s before writing', async change => {
  const gate = deferred<void>(); const f = fixture(undefined, () => gate.promise);
  const pending = f.protect(true); await f.service.initialize();
  if (change === 'close') { f.target.tab = undefined; f.target.tabs.onRemoved.emit(7, { windowId: 10 }); }
  if (change === 'replacement') f.target.tabs.onReplaced.emit(8, 7);
  if (change === 'reload') { f.target.frame = { ...f.target.frame, documentId: 'new' }; f.target.navigation.onCommitted.emit({ tabId: 7, frameId: 0 }); }
  if (change === 'window' || change === 'privacy') { f.target.tab = { ...f.target.tab, windowId: 11, incognito: change === 'privacy' }; f.target.tabs.onDetached.emit(7, { oldWindowId: 10 }); }
  gate.resolve(); expect((await pending).kind).toBe('conflict'); expect(f.registry.writes).toEqual([]); expect(f.target.listeners()).toBe(0);
});
test('cleanup sees accepted native intent even before first protection and unprotected removal stays an authority no-op', async () => {
  const gate = deferred<void>(); const f = fixture(undefined, () => gate.promise); await f.service.initialize();
  const capture = f.service.capture()!; await f.service.forget(99); expect(f.service.isCurrent(capture)).toBe(true);
  const pending = f.protect(true); const generation = f.service.generation;
  await f.service.forget(7); expect(f.service.generation).toBeGreaterThan(generation);
  gate.resolve(); expect((await pending).kind).toBe('conflict'); expect(f.registry.writes).toEqual([]);
  const settled = f.service.generation; await f.service.forget(7); expect(f.service.generation).toBe(settled);
  expect(f.service.getStatus().phase).toBe('active'); expect(f.target.listeners()).toBe(0);
});
test.each([{ windowId: 11 }, { incognito: true }])('native identity mismatch never writes: %j', async mismatch => {
  const f = fixture(); await f.service.initialize(); expect((await f.protect(true, { ...hint, ...mismatch })).kind).toBe('conflict');
  expect(f.registry.writes).toEqual([]); expect(f.target.listeners()).toBe(0);
});
test('native private identity is isolated and cannot transfer an existing normal protection', async () => {
  const f = fixture(stored); await f.service.initialize(); f.target.tab = { ...f.target.tab, incognito: true };
  expect((await f.protect(true, { ...hint, incognito: true })).kind).toBe('conflict'); expect(f.registry.raw).toEqual(stored);
  f.target.tab = { ...f.target.tab, id: 8 }; expect((await f.protect(true, { ...hint, tabId: 8, incognito: true })).kind).toBe('ok');
  expect(f.registry.raw).toEqual({ version: 1, tabs: [{ tabId: 7, incognito: false }, { tabId: 8, incognito: true }] });
});
test.each(['close', 'replacement', 'reload'] as const)('queued native intent observes %s while another writer is held', async change => {
  const f = fixture(stored); await f.service.initialize(); const entered = deferred<void>(); const release = deferred<void>();
  f.registry.setWrite(async value => { f.registry.setRaw(value); entered.resolve(); await release.promise; });
  const first = f.protect(true); await entered.promise; const next = f.protect(true);
  if (change === 'close') f.target.tabs.onRemoved.emit(7, { windowId: 10 });
  if (change === 'replacement') f.target.tabs.onReplaced.emit(8, 7);
  if (change === 'reload') f.target.navigation.onCommitted.emit({ tabId: 7, frameId: 0 });
  release.resolve(); expect((await first).kind).toBe('conflict'); expect((await next).kind).toBe('conflict');
  expect(f.registry.writes).toHaveLength(1); expect(f.service.capture()).toBeUndefined(); expect(f.target.listeners()).toBe(0);
});
test('postwrite native uncertainty remains unavailable until fresh same-target verification', async () => {
  const f = fixture(stored); await f.service.initialize();
  f.registry.setWrite(async value => { f.registry.setRaw(value); f.target.navigation.onCommitted.emit({ tabId: 7, frameId: 0 }); });
  expect(await f.protect(false)).toMatchObject({ kind: 'conflict', status: { phase: 'unavailable' } });
  expect(f.service.capture()).toBeUndefined(); f.registry.setWrite(async value => { f.registry.setRaw(value); });
  expect(await f.protect(true)).toMatchObject({ kind: 'ok', status: { phase: 'active' } }); expect(f.target.listeners()).toBe(0);
});
test.each(['blocked', 'failed', 'disposed'] as const)('native readiness %s releases observation and pending accounting', async outcome => {
  const gate = deferred<void>(); const f = fixture(undefined, () => gate.promise); const pending = f.protect(true); await f.service.initialize();
  if (outcome === 'blocked') f.setReadiness('blocked');
  if (outcome === 'disposed') { f.service.dispose(); expect(f.target.listeners()).toBe(0); }
  if (outcome === 'failed') gate.reject(Error('initialization')); else gate.resolve();
  expect((await pending).kind).toBe(outcome === 'disposed' ? 'conflict' : 'unavailable');
  expect(f.target.listeners()).toBe(0); expect(f.registry.writes).toEqual([]);
});
test('native entry stays outside the runtime protocol and rejects malformed internal hints without admission', async () => {
  const f = fixture(); await f.service.initialize(); const capture = f.service.capture()!;
  expect((await f.service.handle({ kind: 'set-native-tab-protected', target: hint, protected: true })).kind).toBe('invalid');
  expect((await f.protect(true, { ...hint, tabId: -1 })).kind).toBe('invalid'); expect(f.service.isCurrent(capture)).toBe(true); expect(f.target.listeners()).toBe(0);
});


test.each([false, true])('composed cold coordinator recovery keeps native pending and Pause responsive: pause=%s', async pause => {
  const entered = deferred<void>(); const release = deferred<void>(); let ready = false;
  const f = fixture(stored, () => coordinator.initialize()); f.setReadiness('checking');
  const coordinator = createCoordinator({ config: f.config, controls: f.service, tracker: createNavigationTracker(), queue: createOperationQueue(), diagnostics: createDiagnostics(),
    recovery: { initialize: async () => { entered.resolve(); await release.promise; ready = true; f.setReadiness('ready'); }, isReady: () => ready },
    consume: async () => { throw Error('unexpected native operation'); } });
  const pending = f.protect(false); await entered.promise;
  expect(f.registry.writes).toEqual([]); expect(f.service.capture()).toBeUndefined();
  if (pause) expect((await f.pause()).kind).toBe('ok');
  release.resolve(); expect((await pending).kind).toBe(pause ? 'conflict' : 'ok');
  expect(f.registry.raw).toEqual(pause ? stored : { version: 1, tabs: [] }); expect(f.target.listeners()).toBe(0);
  coordinator.dispose();
});
test('native protection and Unprotect preserve the paused flag and popup receipt authority', async () => {
  const f = fixture(); await f.service.initialize(); await f.pause();
  expect((await f.protect(true)).kind).toBe('ok');
  f.target.tab = { ...f.target.tab, active: true };
  const status = await f.service.handle({ kind: 'get-status', target: hint });
  const popup = f.service.handle({ kind: 'set-tab-protected', expected: status.status.version, target: status.status.target!.receipt, protected: false });
  const native = f.protect(true); expect((await popup).kind).toBe('conflict'); expect((await native).kind).toBe('ok');
  expect((await f.protect(false)).kind).toBe('ok'); expect(f.configRaw).toEqual({ ...initial, enabled: false }); expect(f.service.getStatus().phase).toBe('paused');
});
test.each(['write', 'readback'] as const)('native %s storage failure releases listeners and latches unavailable', async boundary => {
  const f = fixture(); await f.service.initialize();
  f.registry.setWrite(async value => { if (boundary === 'write') throw Error('write'); f.registry.setRaw(value); f.registry.setRead(async () => { throw Error('readback'); }); });
  expect(await f.protect(true)).toMatchObject({ kind: 'unavailable', status: { phase: 'unavailable' } });
  expect(f.service.capture()).toBeUndefined(); expect(f.target.listeners()).toBe(0);
});
test('native observer ignores selection changes during persistence but remains bound to its original document', async () => {
  const f = fixture(); await f.service.initialize();
  f.registry.setWrite(async value => { f.registry.setRaw(value); f.target.tabs.onActivated.emit({ tabId: 8, windowId: 10 }); f.target.tabs.onActivated.emit({ tabId: 7, windowId: 10 }); });
  expect((await f.protect(true)).kind).toBe('ok');
  f.registry.setWrite(async value => { f.registry.setRaw(value); f.target.frame = { ...f.target.frame, documentId: 'replacement' }; });
  expect(await f.protect(false)).toMatchObject({ kind: 'conflict', status: { phase: 'unavailable' } }); expect(f.target.listeners()).toBe(0);
});
for (const boundary of ['tab', 'document'] as const) for (const occurrence of [1, 2]) {
  test(`native final ${boundary} read ${occurrence} detects lifecycle changes and blocks admission`, async () => {
    const f = fixture(stored); await f.service.initialize(); let written = false; let count = 0;
    f.registry.setWrite(async value => { f.registry.setRaw(value); written = true; });
    f.target.boundary(async kind => { if (written && kind === boundary && ++count === occurrence) f.target.navigation.onCommitted.emit({ tabId: 7, frameId: 0 }); });
    expect(await f.protect(false)).toMatchObject({ kind: 'conflict', status: { phase: 'unavailable' } });
    expect(f.registry.raw).toEqual({ version: 1, tabs: [] }); expect(f.service.capture()).toBeUndefined(); expect(f.target.listeners()).toBe(0);
  });
}
test('native readiness preserves owned startup pruning without exempting external changes', async () => {
  const f = fixture({ version: 1, tabs: [...stored.tabs, { tabId: 99, incognito: false }] });
  expect((await f.protect(false)).kind).toBe('ok'); expect(f.registry.writes).toEqual([stored, { version: 1, tabs: [] }]);
  expect(f.target.listeners()).toBe(0);
});
test.each(['unavailable', 'prune'] as const)('native startup %s failure cannot change protections or reopen admission', async failure => {
  const f = fixture(failure === 'unavailable' ? null : { version: 1, tabs: [{ tabId: 99, incognito: false }] });
  if (failure === 'prune') f.registry.setWrite(async () => { throw Error('prune'); });
  expect(await f.protect(true)).toMatchObject({ kind: 'unavailable', status: { phase: 'unavailable' } });
  expect(f.registry.writes).toHaveLength(failure === 'prune' ? 1 : 0); expect(f.service.capture()).toBeUndefined(); expect(f.target.listeners()).toBe(0);
});
