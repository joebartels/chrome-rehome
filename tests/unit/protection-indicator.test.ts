import { expect, test, vi } from 'vitest';
import { registerProtectionIndicator } from '../../src/browser/protection-indicator';
import type { ProtectedIdentity } from '../../src/controls/protocol';
import { deferred } from '../fixtures/replacement';
function event() {
  const listeners = new Set<(...args: any[]) => void>();
  return { addListener(fn: (...args: any[]) => void) { listeners.add(fn); }, removeListener(fn: (...args: any[]) => void) { listeners.delete(fn); }, emit(...args: any[]) { for (const fn of listeners) fn(...args); }, listeners };
}
function fixture() {
  const tabs = new Map<number, any>([[7, { id: 7, windowId: 10, incognito: false }], [8, { id: 8, windowId: 11, incognito: true }]]);
  let snapshot: readonly ProtectedIdentity[] | undefined = [{ tabId: 7, incognito: false }];
  const text = new Map<number, string>([[7, 'old'], [8, 'old']]); const title = new Map<number, string>();
  const writes: any[] = []; let before = async (_kind: string, _id: number) => {};
  const events = { onActivated: event(), onCreated: event(), onUpdated: event(), onRemoved: event(), onReplaced: event(), onAttached: event() };
  const runtime = { onStartup: event(), onInstalled: event() };
  const query = vi.fn(async () => [...tabs.values()]); const get = vi.fn(async (id: number) => { if (!tabs.has(id)) throw Error('closed'); return tabs.get(id); });
  const api = { tabs: { ...events, query, get }, runtime, action: {
    async setBadgeText(value: { tabId: number; text: string }) { writes.push(value); await before('text', value.tabId); if (!tabs.has(value.tabId)) throw Error('closed'); text.set(value.tabId, value.text); },
    async setTitle(value: { tabId: number; title: string }) { writes.push(value); await before('title', value.tabId); if (!tabs.has(value.tabId)) throw Error('closed'); title.set(value.tabId, value.title); },
  } };
  const failure = vi.fn(); const controls = { getProtectedTabs: () => snapshot };
  return { api: api as unknown as Parameters<typeof registerProtectionIndicator>[0], tabs, events, runtime, text, title, writes, query, get, failure, controls,
    snapshot(value: typeof snapshot) { snapshot = value; }, before(fn: typeof before) { before = fn; } };
}
async function settled() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
test('initializes explicit per-tab claims across windows and privacy, with unknown state clearing restart leftovers', async () => {
  const f = fixture(); f.snapshot(undefined); const indicator = registerProtectionIndicator(f.api, f.controls, f.failure); await settled();
  expect([...f.text.values()]).toEqual(['', '']); expect([...f.title.values()]).toEqual(['ChromeReHome', 'ChromeReHome']);
  f.snapshot([{ tabId: 7, incognito: false }, { tabId: 8, incognito: false }]); indicator.refresh(); await settled();
  expect(f.text.get(7)).toBe('🔒'); expect(f.title.get(7)).toBe('ChromeReHome — tab protected'); expect(f.text.get(8)).toBe('');
  expect(f.writes.every(write => Number.isInteger(write.tabId))).toBe(true); expect(f.failure).not.toHaveBeenCalled();
});
test('activation, creation, privacy update and replacement refresh only affected identities', async () => {
  const f = fixture(); registerProtectionIndicator(f.api, f.controls, f.failure); await settled();
  f.tabs.set(7, { id: 7, windowId: 12, incognito: true }); f.events.onActivated.emit({ tabId: 7, windowId: 12 }); await settled(); expect(f.text.get(7)).toBe('');
  f.tabs.set(9, { id: 9, windowId: 12, incognito: false }); f.events.onCreated.emit(f.tabs.get(9)); await settled(); expect(f.text.get(9)).toBe('');
  f.snapshot([{ tabId: 7, incognito: true }]); f.events.onUpdated.emit(7, {}, f.tabs.get(7)); await settled(); expect(f.text.get(7)).toBe('🔒');
  f.tabs.delete(7); f.tabs.set(10, { id: 10, windowId: 12, incognito: true }); f.events.onReplaced.emit(10, 7); await settled(); expect(f.text.get(10)).toBe('');
  expect(f.query).toHaveBeenCalledTimes(1);
});
test.each(['text', 'title'])('delayed %s writes converge to unknown state without overlapping stale claims', async kind => {
  const f = fixture(); const gate = deferred<void>(); let held = false;
  f.before(async (boundary, id) => { if (!held && id === 7 && boundary === kind) { held = true; await gate.promise; } });
  const indicator = registerProtectionIndicator(f.api, f.controls, f.failure); await settled();
  f.snapshot(undefined); for (let i = 0; i < 100; i++) indicator.refresh(); gate.resolve(); await settled();
  expect(f.text.get(7)).toBe(''); expect(f.title.get(7)).toBe('ChromeReHome'); expect(f.query).toHaveBeenCalledTimes(1); expect(f.writes.length).toBeLessThan(12);
});
test.each(['text', 'title'])('display %s failures recover on next refresh without retry loops', async kind => {
  const f = fixture(); f.before(async boundary => { if (boundary === kind) throw Error('display'); });
  const indicator = registerProtectionIndicator(f.api, f.controls, f.failure); await settled(); const calls = f.writes.length;
  await settled(); expect(f.writes).toHaveLength(calls); expect(f.failure).toHaveBeenCalled();
  f.before(async () => {}); indicator.refresh(); await settled(); expect(f.text.get(7)).toBe('🔒'); expect(f.title.get(7)).toBe('ChromeReHome — tab protected');
});
test('closing a tab during a delayed display does not block other tabs and dispose removes event work', async () => {
  const f = fixture(); const gate = deferred<void>(); let held = false;
  f.before(async (_, id) => { if (!held && id === 7) { held = true; await gate.promise; } });
  const indicator = registerProtectionIndicator(f.api, f.controls, f.failure); await settled();
  f.tabs.delete(7); f.events.onRemoved.emit(7); gate.resolve(); await settled(); expect(f.text.get(8)).toBe('');
  indicator.dispose(); const count = f.writes.length; f.snapshot(undefined); indicator.refresh(); f.events.onActivated.emit({ tabId: 8 }); await settled();
  expect(f.writes).toHaveLength(count); expect([...Object.values(f.events), ...Object.values(f.runtime)].every(event => event.listeners.size === 0)).toBe(true);
});
test('navigation/status bursts do not scan all tabs or rewrite unchanged display', async () => {
  const f = fixture(); const indicator = registerProtectionIndicator(f.api, f.controls, f.failure); await settled(); const writes = f.writes.length;
  for (let i = 0; i < 200; i++) { indicator.refresh(); f.events.onUpdated.emit(7, { title: 'updated' }, f.tabs.get(7)); }
  await settled(); expect(f.query).toHaveBeenCalledTimes(1); expect(f.get.mock.calls.length).toBeLessThan(4); expect(f.writes).toHaveLength(writes);
});
test('failed initial tab query retries on later refresh and startup clears stale tab claims', async () => {
  const f = fixture(); f.query.mockRejectedValueOnce(Error('query'));
  const indicator = registerProtectionIndicator(f.api, f.controls, f.failure); await settled(); expect(f.failure).toHaveBeenCalledTimes(1);
  indicator.refresh(); await settled(); expect(f.text.get(7)).toBe('🔒');
  f.text.set(8, 'stale'); f.runtime.onStartup.emit(); await settled(); expect(f.text.get(8)).toBe('');
});

test('failed identity read clears a prior claim and retries only on a subsequent refresh', async () => {
  const f = fixture(); const indicator = registerProtectionIndicator(f.api, f.controls, f.failure); await settled(); expect(f.text.get(7)).toBe('🔒');
  f.get.mockRejectedValueOnce(Error('temporary')); f.events.onActivated.emit({ tabId: 7 }); await settled();
  expect(f.text.get(7)).toBe(''); expect(f.title.get(7)).toBe('ChromeReHome');
  const calls = f.get.mock.calls.length; await settled(); expect(f.get.mock.calls.length).toBe(calls);
  indicator.refresh(); await settled(); expect(f.text.get(7)).toBe('🔒');
});

test('navigation completion restores the protected indicator after Chrome resets per-tab action state', async () => {
  const f = fixture(); registerProtectionIndicator(f.api, f.controls, f.failure); await settled();
  f.text.set(7, ''); f.title.set(7, 'ChromeReHome');
  f.events.onUpdated.emit(7, { status: 'complete' }, f.tabs.get(7)); await settled();
  expect(f.text.get(7)).toBe('🔒'); expect(f.title.get(7)).toBe('ChromeReHome — tab protected'); expect(f.query).toHaveBeenCalledTimes(1);
});

test('navigation reset during an old title write cannot cache a lost badge as displayed', async () => {
  const f = fixture(); const gate = deferred<void>(); let held = false;
  f.before(async (kind, id) => { if (!held && kind === 'title' && id === 7) { held = true; await gate.promise; } });
  registerProtectionIndicator(f.api, f.controls, f.failure); await settled(); expect(f.text.get(7)).toBe('🔒');
  f.text.set(7, ''); f.events.onUpdated.emit(7, { status: 'complete' }, f.tabs.get(7)); gate.resolve(); await settled();
  expect(f.text.get(7)).toBe('🔒'); expect(f.title.get(7)).toBe('ChromeReHome — tab protected');
});
