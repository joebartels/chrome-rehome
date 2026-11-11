import { protectionFixture } from '../fixtures/protections';
import { expect, test } from 'vitest';
import { createControlService } from '../../src/background/controls';
import { createConfigRepository } from '../../src/config/repository';
import type { Config } from '../../src/config/schema';
const initial: Config = { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] };
const rules = { groupingRules: [], duplicateRules: [] };
const changed = { groupingRules: [{ enabled: true, pattern: 'https://example.com/*', group: 'Work' }], duplicateRules: [] };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function harness() {
  let raw: unknown = initial; let notify = () => {}; let runtime: 'checking' | 'ready' | 'blocked' = 'ready';
  let reads = 0;
  let read = async (): Promise<unknown> => raw;
  let write = async (value: Config) => { raw = value; };
  const writes: Config[] = [];
  const config = createConfigRepository({ read: () => { ++reads; return read(); }, write: value => { writes.push(value); return write(value); }, subscribe: listener => { notify = listener; return () => {}; } });
  const service = createControlService({ ...protectionFixture(), config, workerId: 'worker', runtime: () => runtime });
  return { service, writes, config, get raw() { return raw; }, get reads() { return reads; }, setRaw(value: unknown) { raw = value; },
    setRead(value: typeof read) { read = value; }, setWrite(value: typeof write) { write = value; },
    setRuntime(value: typeof runtime) { runtime = value; }, external(value: unknown) { raw = value; notify(); } };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
test('status reflects startup, recovery and config readiness; a valid pause cannot unblock recovery', async () => {
  const h = harness(); expect(h.service.getStatus()).toMatchObject({ phase: 'checking', savedEnabled: null });
  await h.service.initialize(); expect(h.service.getStatus().phase).toBe('active');
  h.setRuntime('checking'); expect(h.service.getStatus().phase).toBe('checking');
  h.setRuntime('blocked'); expect(h.service.getStatus().phase).toBe('blocked');
  expect((await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: true })).kind).toBe('unavailable');
  expect((await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false })).kind).toBe('ok');
  expect(h.service.getStatus()).toMatchObject({ phase: 'blocked', savedEnabled: false });
  expect(h.service.capture()).toBeUndefined();
});
test('pause revokes synchronously, status does not await persistence, resume never revives a capture', async () => {
  const h = harness(); await h.service.initialize(); const captured = h.service.capture()!;
  const writing = deferred<void>(); h.setWrite(async value => { await writing.promise; h.setRaw(value); });
  const pause = h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false });
  expect(h.service.isCurrent(captured)).toBe(false); expect(h.service.getStatus().phase).toBe('checking');
  expect((await h.service.handle({ kind: 'get-status' })).status.phase).toBe('checking');
  writing.resolve(); await pause;
  await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: true });
  expect(h.service.getStatus().phase).toBe('active'); expect(h.service.isCurrent(captured)).toBe(false);
});
test('an older rules write finishing cannot reopen admission while pause is pending', async () => {
  const h = harness(); await h.service.initialize(); const first = deferred<void>(); const second = deferred<void>();
  h.setWrite(async value => { await (h.writes.length === 1 ? first : second).promise; h.setRaw(value); });
  const save = h.service.handle({ kind: 'save-rules', expected: h.service.getStatus().version, baseRules: rules, rules: changed });
  await flush(); expect(h.writes).toHaveLength(1);
  const pause = h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false });
  first.resolve(); await save; await flush();
  expect(h.service.capture()).toBeUndefined(); expect(h.service.getStatus().phase).toBe('checking');
  second.resolve(); await pause;
  expect(h.raw).toEqual({ ...initial, ...changed, enabled: false });
});
test('rules saved after pause preserve latest enabled; a second stale editor conflicts', async () => {
  const h = harness(); await h.service.initialize();
  await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false });
  expect((await h.service.handle({ kind: 'save-rules', expected: h.service.getStatus().version, baseRules: rules, rules: changed })).kind).toBe('ok');
  expect(h.raw).toEqual({ ...initial, ...changed, enabled: false });
  expect((await h.service.handle({ kind: 'save-rules', expected: h.service.getStatus().version, baseRules: rules, rules })).kind).toBe('conflict');
  expect(h.raw).toEqual({ ...initial, ...changed, enabled: false });
});
test('a queued resume cannot override newer pause and runtime invalidation does not cancel valid commands', async () => {
  const h = harness(); await h.service.initialize(); const gate = deferred<void>();
  h.setWrite(async value => { await gate.promise; h.setRaw(value); });
  const saving = h.service.handle({ kind: 'save-rules', expected: h.service.getStatus().version, baseRules: rules, rules: changed }); await flush();
  const resume = h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: true });
  const pause = h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false });
  const version = h.service.getStatus().version; h.service.invalidate(); expect(h.service.getStatus().version).toEqual(version);
  gate.resolve(); await saving;
  expect((await resume).kind).toBe('conflict'); expect((await pause).kind).toBe('ok');
  expect(h.raw).toEqual({ ...initial, ...changed, enabled: false });
});
test('rejects stale workers, stale versions and malformed commands without writes', async () => {
  const h = harness(); await h.service.initialize(); const expected = h.service.getStatus().version;
  expect((await h.service.handle({ kind: 'set-enabled', expected: { ...expected, workerId: 'old' }, enabled: false })).kind).toBe('conflict');
  await h.service.handle({ kind: 'set-enabled', expected, enabled: false });
  expect((await h.service.handle({ kind: 'set-enabled', expected, enabled: true })).kind).toBe('conflict');
  expect((await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: true, extra: true })).kind).toBe('invalid');
  expect(h.writes).toHaveLength(1);
});
test('write failure remains unavailable even after a late storage echo; explicit pause can recover', async () => {
  const h = harness(); await h.service.initialize();
  h.setWrite(async () => { throw Error('storage'); });
  expect((await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false })).kind).toBe('unavailable');
  h.external(initial); await flush(); expect(h.service.getStatus().phase).toBe('unavailable'); expect(h.service.capture()).toBeUndefined();
  h.setWrite(async value => { h.setRaw(value); });
  expect((await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false })).kind).toBe('ok');
  expect(h.service.getStatus().phase).toBe('paused');
});
test('pending external reads revoke captures immediately and late overlapping reads do not reopen them', async () => {
  const h = harness(); await h.service.initialize(); const capture = h.service.capture()!;
  const first = deferred<unknown>(); const second = deferred<unknown>(); h.setRead(() => first.promise); h.external(initial);
  expect(h.service.isCurrent(capture)).toBe(false); expect(h.service.getStatus().phase).toBe('checking');
  h.setRead(() => second.promise); h.external(initial); first.resolve(initial); await flush();
  expect(h.service.capture()).toBeUndefined(); second.resolve(initial); await flush();
  expect(h.service.getStatus().phase).toBe('active'); expect(h.service.isCurrent(capture)).toBe(false);
});


test('a queued resume rejects config publications that changed its expected status', async () => {
  const h = harness(); await h.service.initialize();
  const read = deferred<unknown>(); h.setRead(() => read.promise);
  const pause = h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false }); await flush();
  const resume = h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: true });
  h.setRead(async () => h.raw); h.external({ ...initial, enabled: false }); await flush(); read.resolve(initial);
  await pause;
  expect((await resume).kind).toBe('conflict'); expect(h.writes).toHaveLength(0);
  expect(h.service.getStatus().phase).toBe('paused');
});
test('verification failure holds admission closed and does not claim successful pause', async () => {
  const h = harness(); await h.service.initialize();
  h.setWrite(async value => { h.setRaw(value); h.setRead(async () => { throw Error('read failed'); }); });
  const result = await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false });
  expect(result).toMatchObject({ kind: 'unavailable', status: { phase: 'unavailable' } });
  expect(h.service.capture()).toBeUndefined();
});
test('pause during startup never admits navigation or deadlocks initialization', async () => {
  const h = harness(); const read = deferred<unknown>(); h.setRead(() => read.promise);
  const start = h.service.initialize();
  const pause = h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false });
  h.setRead(async () => h.raw); read.resolve(initial); await start;
  expect(h.service.capture()).toBeUndefined(); await pause;
  expect(h.service.getStatus().phase).toBe('paused');
});
test('disposed service never writes queued intent and old immutable captures stay invalid', async () => {
  const h = harness(); await h.service.initialize(); const captured = h.service.capture()!;
  expect(Object.isFrozen(captured)).toBe(true); expect(Object.isFrozen(captured.protectedTabs)).toBe(true);
  const pause = h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false });
  h.service.dispose(); expect((await pause).kind).toBe('conflict'); expect(h.writes).toHaveLength(0);
  expect(h.service.isCurrent(captured)).toBe(false); expect(h.service.getStatus().phase).toBe('unavailable');
});


test('resume rejects a newer external publication during its preflight read', async () => {
  const h = harness(); await h.service.initialize();
  await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false });
  const gate = deferred<unknown>(); h.setRead(() => gate.promise);
  const resume = h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: true }); await flush();
  h.setRead(async () => h.raw); h.external({ ...initial, ...changed, enabled: false }); await flush(); gate.resolve(initial);
  expect((await resume).kind).toBe('conflict'); expect(h.writes).toHaveLength(1); expect(h.service.getStatus().phase).toBe('paused');
});
async function writeWithOverlappingVerification(latest: Config, command: 'resume' | 'save-rules' = 'resume') {
  const h = harness();
  if (command === 'resume') h.setRaw({ ...initial, enabled: false });
  await h.service.initialize();

  const verification = deferred<unknown>();
  const refreshed = deferred<unknown>();
  h.setRead(async () => {
    h.setRead(() => verification.promise);
    return h.raw;
  });
  const expected = h.service.getStatus().version;
  const operation = h.service.handle(command === 'resume'
    ? { kind: 'set-enabled', expected, enabled: true }
    : { kind: 'save-rules', expected, baseRules: rules, rules: changed });
  await flush();
  const written = command === 'resume' ? initial : { ...initial, ...changed };
  expect(h.raw).toEqual(written);

  h.setRead(() => refreshed.promise);
  h.external(latest);
  verification.resolve(written);
  await flush();
  return { h, operation, refreshed };
}
test.each([
  { change: 'the saved value', latest: initial, kind: 'ok', phase: 'active' },
  { change: 'a newer pause', latest: { ...initial, enabled: false }, kind: 'unavailable', phase: 'unavailable' },
  { change: 'newer rules', latest: { ...initial, ...changed }, kind: 'unavailable', phase: 'unavailable' },
])('resume verifies $change when a storage event supersedes its verification read', async ({ latest, kind, phase }) => {
  const { h, operation: resume, refreshed } = await writeWithOverlappingVerification(latest);
  expect(h.service.getStatus().phase).toBe('checking');
  expect(h.service.capture()).toBeUndefined();
  refreshed.resolve(latest);

  expect(await resume).toMatchObject({ kind, status: { phase, savedEnabled: latest.enabled } });
  expect(h.reads).toBe(4);
});
test('resume stops waiting when another storage event supersedes the pending verification read', async () => {
  const { h, operation: resume, refreshed } = await writeWithOverlappingVerification(initial);
  let resumeReply: Awaited<typeof resume> | undefined;
  void resume.then(result => { resumeReply = result; });

  const paused = { ...initial, enabled: false };
  h.setRead(async () => h.raw);
  h.external(paused);
  await flush();
  expect(h.config.getCurrent()?.state).toMatchObject({ kind: 'ready', config: paused });
  expect(resumeReply).toMatchObject({ kind: 'unavailable', status: { phase: 'unavailable' } });
  expect(h.service.capture()).toBeUndefined();
  expect(h.reads).toBe(5);

  refreshed.resolve(initial);
  await flush();
  expect(h.service.getStatus()).toMatchObject({ phase: 'unavailable', savedEnabled: false });
});
test.each(['resume', 'save-rules'] as const)('a newer pause can persist while %s verification still has an outstanding read', async command => {
  const written = command === 'resume' ? initial : { ...initial, ...changed };
  const { h, operation, refreshed } = await writeWithOverlappingVerification(written, command);
  h.setRead(async () => h.raw);
  const pause = h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false });
  let pauseReply: Awaited<typeof pause> | undefined;
  void pause.then(result => { pauseReply = result; });
  expect(h.service.capture()).toBeUndefined();

  await flush();
  expect(h.writes.map(value => value.enabled)).toEqual([true, false]);
  await flush();
  expect(pauseReply).toMatchObject({ kind: 'ok', status: { phase: 'paused', savedEnabled: false } });
  expect((await operation).kind).toBe('unavailable');
  expect(h.raw).toEqual({ ...written, enabled: false });
  expect(h.reads).toBe(6);

  refreshed.resolve(written);
  await flush();
  expect(h.service.getStatus().phase).toBe('paused');
  expect(h.service.capture()).toBeUndefined();
});
test('disposing controls settles resume during an outstanding verification read', async () => {
  const { h, operation: resume, refreshed } = await writeWithOverlappingVerification(initial);
  let resumeReply: Awaited<typeof resume> | undefined;
  void resume.then(result => { resumeReply = result; });
  h.service.dispose();

  await flush();
  expect(resumeReply).toMatchObject({ kind: 'unavailable', status: { phase: 'unavailable' } });
  expect(h.reads).toBe(4);
  refreshed.resolve(initial);
});
test('resume rechecks recovery readiness after preflight storage await', async () => {
  const h = harness(); await h.service.initialize();
  await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false });
  const gate = deferred<unknown>(); h.setRead(() => gate.promise);
  const resume = h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: true }); await flush();
  h.setRuntime('blocked'); gate.resolve(h.raw);
  expect((await resume).kind).toBe('unavailable'); expect(h.writes).toHaveLength(1); expect(h.service.getStatus()).toMatchObject({ phase: 'blocked', savedEnabled: false });
});


test('forgetting an unprotected tab does not revoke the independent control authority', async () => {
  const h = harness(); await h.service.initialize(); const capture = h.service.capture()!;
  h.service.forget(7); expect(h.service.isCurrent(capture)).toBe(true);
});


test('a rules save queued after pause cannot cancel that pause or restore activation', async () => {
  const h = harness(); await h.service.initialize(); const gate = deferred<void>();
  h.setWrite(async value => { await gate.promise; h.setRaw(value); });
  const first = h.service.handle({ kind: 'save-rules', expected: h.service.getStatus().version, baseRules: rules, rules }); await flush();
  const pause = h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false });
  const save = h.service.handle({ kind: 'save-rules', expected: h.service.getStatus().version, baseRules: rules, rules: changed });
  gate.resolve(); await first;
  expect((await pause).kind).toBe('ok'); expect((await save).kind).toBe('ok');
  expect(h.raw).toEqual({ ...initial, ...changed, enabled: false }); expect(h.service.getStatus().phase).toBe('paused');
});


test('external config invalidation during initial load advances operation generation before the read settles', async () => {
  const h = harness(); const first = deferred<unknown>(); const second = deferred<unknown>(); h.setRead(() => first.promise);
  const initialGeneration = h.service.generation; const startup = h.service.initialize();
  expect(h.service.generation).toBe(initialGeneration);
  h.setRead(() => second.promise); h.external(initial);
  expect(h.service.generation).toBeGreaterThan(initialGeneration);
  first.resolve(initial); second.resolve(initial); await startup; await flush();
});
test('status subscribers see pending config reads synchronously without waiting for storage', async () => {
  const h = harness(); await h.service.initialize(); const phases: string[] = [];
  const unsubscribe = h.service.subscribe(() => { phases.push(h.service.getStatus().phase); });
  const gate = deferred<unknown>(); h.setRead(() => gate.promise); h.external(initial);
  expect(phases.at(-1)).toBe('checking');
  gate.resolve(initial); await flush(); expect(phases.at(-1)).toBe('active');
  unsubscribe(); const count = phases.length; h.service.invalidate(); expect(phases).toHaveLength(count);
});

test.each([rules, changed])('rules save cannot certify a failed pause; explicit pause then resume is required', async replacement => {
  const h = harness(); await h.service.initialize(); h.setWrite(async () => { throw Error('failed pause'); });
  expect((await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false })).kind).toBe('unavailable');
  h.setWrite(async value => { h.setRaw(value); });
  expect((await h.service.handle({ kind: 'save-rules', expected: h.service.getStatus().version, baseRules: rules, rules: replacement })).kind).toBe('ok');
  expect(h.service.getStatus().phase).toBe('unavailable'); expect(h.service.capture()).toBeUndefined(); expect(h.raw).toMatchObject({ enabled: true });
  expect((await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: true })).kind).toBe('unavailable');
  expect((await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: false })).kind).toBe('ok');
  expect(h.service.getStatus().phase).toBe('paused');
  expect((await h.service.handle({ kind: 'set-enabled', expected: h.service.getStatus().version, enabled: true })).kind).toBe('ok');
  expect(h.service.getStatus().phase).toBe('active');
});
