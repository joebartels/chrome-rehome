import { expect, test } from 'vitest';
import { createControlService } from '../../src/background/controls';
import { createConfigRepository } from '../../src/config/repository';
import { protectionFixture, receipt } from '../fixtures/protections';
import { deferred } from '../fixtures/replacement';
const initial = { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] };
const stored = { version: 1, tabs: [{ tabId: 7, incognito: false }] };
const hint = { tabId: 7, windowId: 10, incognito: false };
function fixture(raw?: unknown, enabled = true) {
  const f = protectionFixture(raw); let readiness: 'checking' | 'ready' | 'blocked' = 'ready'; let configRaw: unknown = { ...initial, enabled };
  const config = createConfigRepository({ read: async () => configRaw, write: async next => { configRaw = next; }, subscribe: () => () => {} });
  const service = createControlService({ config, protections: f.protections, targets: f.targets, workerId: 'worker', runtime: () => readiness });
  const protect = (value: boolean, target = receipt) => service.handle({ kind: 'set-tab-protected', expected: service.getStatus().version, target, protected: value });
  return { ...f, service, config, protect, setReadiness(value: typeof readiness) { readiness = value; }, get raw() { return f.raw; }, get configRaw() { return configRaw; } };
}
const flush = async () => { for (let i = 0; i < 25; ++i) await Promise.resolve(); };
test('both stores gate startup; initial prune and its own echo preserve first navigation generation', async () => {
  const f = fixture({ version: 1, tabs: [...stored.tabs, { tabId: 99, incognito: false }, { tabId: 8, incognito: false }] });
  const gate = deferred<{ tabId: number; incognito: boolean }[]>(); f.setLive(() => gate.promise);
  const generation = f.service.generation; const starting = f.service.initialize(); await flush();
  expect(f.service.capture()).toBeUndefined(); expect(f.service.getStatus().phase).toBe('checking');
  gate.resolve([{ tabId: 7, incognito: false }, { tabId: 8, incognito: true }]); await starting;
  expect(f.raw).toEqual(stored); expect(f.service.generation).toBe(generation);
  expect(f.service.capture()!.protectedTabs).toEqual(stored.tabs);
});
test('an external protection change during startup synchronously revokes the first navigation', async () => {
  const f = fixture(); const gate = deferred<unknown>(); f.setRead(() => gate.promise);
  const generation = f.service.generation; const starting = f.service.initialize();
  f.setRead(async () => stored); f.external(stored); expect(f.service.generation).toBeGreaterThan(generation);
  gate.resolve(undefined); await starting; await flush(); expect(f.service.capture()!.protectedTabs).toEqual(stored.tabs);
});
test.each([null, { version: 2, tabs: [] }])('invalid protection state closes admission without erasure: %j', async raw => {
  const f = fixture(raw); await f.service.initialize(); expect(f.service.getStatus().phase).toBe('unavailable');
  expect(f.service.capture()).toBeUndefined(); expect(f.writes).toEqual([]); expect((await f.protect(true)).kind).toBe('unavailable');
});
test('global status has no private target; hinted status returns only the verified requested target', async () => {
  const f = fixture(stored); await f.service.initialize();
  expect((await f.service.handle({ kind: 'get-status' })).status).not.toHaveProperty('target');
  expect((await f.service.handle({ kind: 'get-status', target: hint })).status.target).toEqual({ receipt, protected: true, audible: false, pinned: false });
  expect(f.service.getStatus()).not.toHaveProperty('target');
});
test('global status stays responsive while target verification is pending', async () => {
  const f = fixture(); await f.service.initialize(); const gate = deferred<undefined>(); f.setTargetRead(() => gate.promise);
  const pending = f.service.handle({ kind: 'get-status', target: hint });
  expect((await f.service.handle({ kind: 'get-status' })).status.phase).toBe('active'); gate.resolve(undefined); expect((await pending).status).not.toHaveProperty('target');
});
test('protect/unprotect is allowed while paused, preserves enabled, and revokes immutable captures', async () => {
  const f = fixture(); await f.service.initialize(); const capture = f.service.capture()!;
  const pending = f.protect(true); expect(f.service.isCurrent(capture)).toBe(false); expect((await pending).kind).toBe('ok');
  expect(f.service.capture()!.protectedTabs).toEqual(stored.tabs);
  await f.service.handle({ kind: 'set-enabled', expected: f.service.getStatus().version, enabled: false });
  expect((await f.protect(false)).kind).toBe('ok'); expect(f.configRaw).toMatchObject({ enabled: false }); expect(f.raw).toEqual({ version: 1, tabs: [] });
});
test.each(['window', 'privacy', 'document', 'closed'])('stale %s receipts never write', async kind => {
  const f = fixture(); await f.service.initialize();
  f.setTarget(kind === 'closed' ? undefined : { receipt: { ...receipt, ...(kind === 'window' ? { windowId: 20 } : kind === 'privacy' ? { incognito: true } : { documentId: 'new' }) }, audible: false, pinned: false });
  expect((await f.protect(true)).kind).toBe('conflict'); expect(f.writes).toEqual([]);
});
test('stale postwrite unprotect does not release admission; fresh verified intent recovers', async () => {
  const f = fixture(stored); await f.service.initialize(); const gate = deferred<void>();
  f.setWrite(async value => { f.setRaw(value); await gate.promise; });
  const pending = f.protect(false); await flush(); f.setTarget(undefined); gate.resolve();
  expect((await pending).kind).toBe('conflict'); expect(f.service.getStatus().phase).toBe('unavailable'); expect(f.service.capture()).toBeUndefined();
  f.setTarget({ receipt, audible: false, pinned: false }); f.setWrite(async value => { f.setRaw(value); });
  expect((await f.protect(true)).kind).toBe('ok'); expect(f.service.getStatus().phase).toBe('active');
});
test('unprotected removal is an authority no-op; protected cleanup serializes with another protection', async () => {
  const f = fixture(stored); await f.service.initialize(); const capture = f.service.capture()!;
  f.service.forget(99); expect(f.service.isCurrent(capture)).toBe(true);
  const gate = deferred<void>(); f.setWrite(async value => { await gate.promise; f.setRaw(value); });
  const removing = f.service.forget(7); expect(f.service.isCurrent(capture)).toBe(false); await flush();
  const other = { ...receipt, tabId: 8, incognito: true }; f.setTarget({ receipt: other, audible: false, pinned: false });
  const adding = f.protect(true, other); gate.resolve(); await removing; expect((await adding).kind).toBe('ok');
  expect(f.raw).toEqual({ version: 1, tabs: [{ tabId: 8, incognito: true }] });
});
test('cleanup/protection writes cannot cancel an accepted pause', async () => {
  const f = fixture(stored); await f.service.initialize(); const gate = deferred<void>();
  f.setWrite(async value => { await gate.promise; f.setRaw(value); });
  const first = f.protect(true); await flush();
  const pause = f.service.handle({ kind: 'set-enabled', expected: f.service.getStatus().version, enabled: false });
  const cleanup = f.service.forget(7); gate.resolve(); await first; expect((await pause).kind).toBe('ok'); await cleanup;
  expect(f.service.getStatus().savedEnabled).toBe(false);
});
test('worker recreation retains session protection; browser session loss yields empty protection', async () => {
  const f = fixture(); await f.service.initialize(); await f.protect(true); f.service.dispose();
  const resumed = fixture(f.raw); await resumed.service.initialize(); expect(resumed.service.capture()!.protectedTabs).toEqual(stored.tabs);
  const restarted = fixture(); await restarted.service.initialize(); expect(restarted.service.capture()!.protectedTabs).toEqual([]);
});

test('refuses additions at 1000 without eviction or any write', async () => {
  const tabs = Array.from({ length: 1000 }, (_, i) => ({ tabId: i + 100, incognito: false }));
  const f = fixture({ version: 1, tabs }); f.setLive(async () => tabs); await f.service.initialize();
  expect((await f.protect(true)).kind).toBe('unavailable'); expect(f.writes).toEqual([]); expect(f.raw).toEqual({ version: 1, tabs });
});
test('another tab cleanup cannot erase a protection accepted later in the same writer', async () => {
  const f = fixture(stored); await f.service.initialize();
  const cleanup = f.service.forget(7);
  const other = { ...receipt, tabId: 8, incognito: true }; f.setTarget({ receipt: other, pinned: false, audible: false });
  const protect = f.protect(true, other); await cleanup; expect((await protect).kind).toBe('ok');
  expect(f.raw).toEqual({ version: 1, tabs: [{ tabId: 8, incognito: true }] });
});
test.each(['read', 'write', 'verify'])('protection %s failure holds admission closed and reports unavailable', async kind => {
  const f = fixture();
  if (kind === 'read') f.setRead(async () => { throw Error('storage'); });
  await f.service.initialize();
  if (kind === 'write') f.setWrite(async () => { throw Error('storage'); });
  if (kind === 'verify') f.setWrite(async value => { f.setRaw(value); f.setRead(async () => { throw Error('read'); }); });
  expect((await f.protect(true)).kind).toBe('unavailable'); expect(f.service.getStatus().phase).toBe('unavailable'); expect(f.service.capture()).toBeUndefined();
});
test('queued stale unprotect conflicts after a newer protection intent', async () => {
  const f = fixture(stored); await f.service.initialize(); const gate = deferred<void>();
  f.setWrite(async value => { await gate.promise; f.setRaw(value); });
  const first = f.protect(true); await flush(); const unprotect = f.protect(false); const protect = f.protect(true);
  gate.resolve(); await first; expect((await unprotect).kind).toBe('conflict'); expect((await protect).kind).toBe('ok');
  expect(f.raw).toEqual(stored);
});

test('resume refuses unknown or unavailable protections without changing the saved master flag', async () => {
  const f = fixture(null, false); await f.service.initialize();
  expect((await f.service.handle({ kind: 'set-enabled', expected: f.service.getStatus().version, enabled: true })).kind).toBe('unavailable');
  expect(f.configRaw).toMatchObject({ enabled: false }); expect(f.raw).toBeNull();
});

test('pause cannot erase failure to verify startup live identities', async () => {
  const f = fixture(stored); f.setLive(async () => { throw Error('tabs unavailable'); }); await f.service.initialize();
  expect(f.service.getStatus().phase).toBe('unavailable');
  expect((await f.service.handle({ kind: 'set-enabled', expected: f.service.getStatus().version, enabled: false })).kind).toBe('ok');
  expect(f.service.getStatus().phase).toBe('unavailable');
  expect((await f.service.handle({ kind: 'set-enabled', expected: f.service.getStatus().version, enabled: true })).kind).toBe('unavailable');
  expect(f.configRaw).toMatchObject({ enabled: false });
});

test('failed startup pruning stays closed after a late storage echo and cannot be cleared by pause', async () => {
  const f = fixture({ version: 1, tabs: [{ tabId: 99, incognito: false }] });
  f.setWrite(async value => { f.setRaw(value); throw Error('uncertain write'); }); await f.service.initialize();
  f.external({ version: 1, tabs: [] }); await flush(); expect(f.service.getStatus().phase).toBe('unavailable');
  expect((await f.service.handle({ kind: 'set-enabled', expected: f.service.getStatus().version, enabled: false })).kind).toBe('ok');
  expect(f.service.getStatus().phase).toBe('unavailable');
});

test('protection cannot cross recovery readiness loss during its target preflight', async () => {
  const f = fixture(); await f.service.initialize(); const gate = deferred<{ receipt: typeof receipt; audible: boolean; pinned: boolean }>(); f.setTargetRead(() => gate.promise);
  const pending = f.protect(false); await flush(); f.setReadiness('blocked'); gate.resolve({ receipt, audible: false, pinned: false });
  expect((await pending).kind).toBe('unavailable'); expect(f.writes).toEqual([]);
});
