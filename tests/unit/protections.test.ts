import { expect, test } from 'vitest';
import { parseProtections, isProtected } from '../../src/protections/state';
import { createProtectionRepository } from '../../src/protections/repository';
import { deferred } from '../fixtures/replacement';
const value = { version: 1, tabs: [{ tabId: 7, incognito: false }] };
test('missing protections are empty; valid snapshots are detached and deeply frozen', () => {
  expect(parseProtections(undefined)).toEqual({ kind: 'ready', value: { version: 1, tabs: [] } });
  const raw = structuredClone(value); const result = parseProtections(raw);
  expect(result).toEqual({ kind: 'ready', value });
  if (result.kind !== 'ready') throw Error('state');
  raw.tabs[0]!.tabId = 9;
  expect(result.value.tabs[0]!.tabId).toBe(7);
  expect(Object.isFrozen(result.value.tabs[0])).toBe(true);
  expect(isProtected({ id: 7, incognito: false }, result.value.tabs)).toBe(true);
  expect(isProtected({ id: 7, incognito: true }, result.value.tabs)).toBe(false);
});
test.each([null, {}, [], { ...value, version: 2 }, { ...value, extra: 1 },
  { version: 1, tabs: [{ tabId: 7, incognito: false, url: 'private' }] },
  { version: 1, tabs: [{ tabId: -1, incognito: false }] },
  { version: 1, tabs: [{ tabId: 2147483648, incognito: false }] },
  { version: 1, tabs: [{ tabId: 1, incognito: 0 }] },
  { version: 1, tabs: [{ tabId: 7, incognito: false }, { tabId: 7, incognito: true }] },
  { version: 1, tabs: Array.from({ length: 1001 }, (_, tabId) => ({ tabId, incognito: false })) },
])('invalid protection state fails closed without coercion: %j', raw => { expect(parseProtections(raw).kind).toBe('unavailable'); });
test('the exact 1000 entry bound is supported', () => {
  expect(parseProtections({ version: 1, tabs: Array.from({ length: 1000 }, (_, tabId) => ({ tabId, incognito: false })) }).kind).toBe('ready');
});
test('repository closes synchronously on load; latest overlapping read wins; failure stays closed', async () => {
  let raw: unknown = value; let read = async () => raw; let changed = (_raw: unknown) => {};
  const repo = createProtectionRepository({ read: () => read(), write: async next => { raw = next; }, subscribe: fn => { changed = fn; return () => {}; } });
  await repo.load(); const capture = repo.getCurrent()!;
  const first = deferred<unknown>(); const second = deferred<unknown>(); read = () => first.promise; changed(value);
  expect(repo.getCurrent()).toBeUndefined();
  read = () => second.promise; changed(undefined); second.resolve(undefined); await Promise.resolve(); await Promise.resolve();
  first.resolve(value); await Promise.resolve(); await Promise.resolve();
  expect(repo.getCurrent()!.state).toMatchObject({ kind: 'ready', value: { tabs: [] } });
  expect(capture.state).toMatchObject({ kind: 'ready', value });
  read = async () => { throw Error('storage'); }; await repo.load();
  expect(repo.getCurrent()!.state.kind).toBe('unavailable');
});
test('repository verifies writes, rejects malformed input and suppresses only its exact owned echo', async () => {
  let raw: unknown; let changed = (_raw: unknown) => {}; let invalidations = 0;
  const repo = createProtectionRepository({ read: async () => raw, write: async next => { raw = next; changed(next); }, subscribe: fn => { changed = fn; return () => {}; } });
  repo.subscribeInvalidation(() => { ++invalidations; });
  await repo.load(); await repo.save(value);
  expect(invalidations).toBe(2); expect(repo.getCurrent()!.state).toMatchObject({ kind: 'ready', value });
  await repo.save({ ...value, extra: true }); expect(invalidations).toBe(2);
  changed({ version: 1, tabs: [] }); expect(invalidations).toBe(3);
});
