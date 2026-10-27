import { describe, expect, it, vi } from 'vitest';
import valid from '../fixtures/config/valid-v1.json';
import validV2 from '../fixtures/config/valid-v2.json';
import validV3 from '../fixtures/config/valid-v3.json';
import validV4 from '../fixtures/config/valid-v4.json';
import invalidV4 from '../fixtures/config/invalid-v4.json';
import invalidV3 from '../fixtures/config/invalid-v3.json';
import invalidV2 from '../fixtures/config/invalid-v2.json';
import invalid from '../fixtures/config/invalid.json';
import unknownProperty from '../fixtures/config/unknown-property.json';
import future from '../fixtures/config/future-version.json';
import { parseConfig, type ConfigState } from '../../src/config/schema';
import { createConfigRepository, type ConfigStorage } from '../../src/config/repository';

const canonicalV2 = { ...validV4, duplicateRules: [] };

function memoryStorage(initial: unknown) {
  let value = initial;
  const listeners = new Set<() => void>();
  const storage: ConfigStorage = {
    read: vi.fn(async () => value),
    write: vi.fn(async (next) => { value = next; }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  return { storage, listeners, change: (next: unknown) => {
    value = next;
    for (const listener of listeners) listener();
  } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('parseConfig', () => {
  it('defaults missing storage to disabled version 4', () => {
    expect(parseConfig(undefined)).toEqual({ kind: 'ready', config: { schemaVersion: 4, enabled: false, groupingRules: [], duplicateRules: [] } });
  });
  it.each([true, false])('migrates strict version 1 with enabled=%s in memory', (enabled) => {
    expect(parseConfig({ schemaVersion: 1, enabled })).toEqual({ kind: 'ready', config: { schemaVersion: 4, enabled, groupingRules: [], duplicateRules: [] } });
  });
  it.each([null, [], true, 'config', 1, {}, { enabled: false }, { schemaVersion: 1 }, invalid,
    unknownProperty, { schemaVersion: '1', enabled: true }, { schemaVersion: 0, enabled: false },
    { schemaVersion: 1.5, enabled: true }, { schemaVersion: NaN, enabled: true }])('rejects malformed configuration %j', (raw) => {
    expect(parseConfig(raw)).toMatchObject({ kind: 'unavailable', reason: 'invalid', message: expect.any(String) });
  });
  it('distinguishes a future version', () => {
    expect(parseConfig(future)).toMatchObject({ kind: 'unavailable', reason: 'future-version' });
  });
  it('copies and freezes version 2 rules while preserving entered values and order', () => {
    const input = structuredClone(validV2);
    const state = parseConfig(input);
    expect(state).toEqual({ kind: 'ready', config: canonicalV2 });
    input.groupingRules[0]!.group = 'Changed';
    input.groupingRules.push({ pattern: 'https://example.com/*', group: 'Added' });
    if (state.kind !== 'ready') throw new Error('Expected valid version 2');
    expect(state.config.groupingRules).toEqual(validV4.groupingRules);
    expect(Object.isFrozen(state.config)).toBe(true);
    expect(Object.isFrozen(state.config.groupingRules)).toBe(true);
    expect(state.config.groupingRules.every(Object.isFrozen)).toBe(true);
  });
  it('reports the invalid rule index and validation problem', () => {
    expect(parseConfig(invalidV2)).toMatchObject({
      kind: 'unavailable', reason: 'invalid', message: expect.stringMatching(/rule 2.*query|rule 2.*fragment/i),
    });
  });
  it.each([
    { schemaVersion: 2, enabled: true }, { schemaVersion: 2, groupingRules: [] },
    { schemaVersion: 2, enabled: 'true', groupingRules: [] },
    { schemaVersion: 2, enabled: true, groupingRules: null },
    { schemaVersion: 2, enabled: true, groupingRules: [], extra: true },
    { schemaVersion: 1, enabled: true, groupingRules: [] },
  ])('rejects incomplete, unknown or invalid schema fields %j', (raw) => {
    expect(parseConfig(raw)).toMatchObject({ kind: 'unavailable', reason: 'invalid' });
  });
  it('migrates empty version 2 with explicit canonical version 4 output', () => {
    expect(parseConfig({schemaVersion:2, enabled:true, groupingRules:[]})).toEqual({kind:'ready', config:{schemaVersion:4, enabled:true, groupingRules:[], duplicateRules:[]}});
  });
  it('accepts and freezes both version 3 rule lists independently of input mutation', () => {
    const raw = structuredClone(validV3);
    const state = parseConfig(raw);
    expect(state).toEqual({kind:'ready',config:validV4});
    raw.duplicateRules[0]!.ignoreQueryParameters.push('id');
    raw.groupingRules[0]!.group = 'Changed';
    expect(state).toEqual({kind:'ready',config:validV4});
    if (state.kind !== 'ready') throw new Error('Expected ready');
    expect(Object.isFrozen(state.config.duplicateRules)).toBe(true);
    expect(Object.isFrozen(state.config.duplicateRules[0])).toBe(true);
    expect(Object.isFrozen(state.config.duplicateRules[0]!.ignoreQueryParameters)).toBe(true);
  });
  it('reports an indexed duplicate validation error', () => {
    expect(parseConfig(invalidV3)).toMatchObject({kind:'unavailable',reason:'invalid',message:expect.stringMatching(/duplicate.*rule 2.*boolean/i)});
  });
  it.each([
    {...validV3, extra:true}, {...validV3, enabled:0}, {...validV3, duplicateRules:undefined},
    {...validV3, groupingRules:undefined}, {...validV3, groupingRules:invalidV2.groupingRules},
    {schemaVersion:2,enabled:true,groupingRules:[],duplicateRules:[]},
  ])('rejects incomplete or unknown version 3 fields and non-strict legacy input %j', raw => {
    expect(parseConfig(raw)).toMatchObject({kind:'unavailable',reason:'invalid'});
  });
  it('copies and freezes accepted configuration', () => {
    const input = { schemaVersion: 1, enabled: true };
    const state = parseConfig(input);
    input.enabled = false;
    expect(state).toEqual({ kind: 'ready', config: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } });
    if (state.kind === 'ready') expect(Object.isFrozen(state.config)).toBe(true);
  });
});

describe('configuration repository', () => {
  it('writes migrated version 1 as canonical version 4', async () => {
    const { storage } = memoryStorage(undefined);
    const repository = createConfigRepository(storage);
    expect(await repository.save(valid)).toEqual({ kind: 'ready', config: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } });
    expect(await repository.load()).toEqual({ kind: 'ready', config: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } });
    expect(storage.write).toHaveBeenCalledWith({ schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] });
    repository.dispose();
  });
  it.each([valid, { schemaVersion: 1, enabled: false }, validV2, validV3, validV4, invalidV2, invalidV3, future])('never writes on load, including migration: %j', async (raw) => {
    const { storage } = memoryStorage(raw);
    const before = structuredClone(raw);
    const repository = createConfigRepository(storage);
    await repository.load();
    expect(storage.write).not.toHaveBeenCalled();
    expect(await storage.read()).toEqual(before);
    repository.dispose();
  });
  it('round-trips explicit version 2 saves with all rules', async () => {
    const { storage } = memoryStorage(undefined);
    const repository = createConfigRepository(storage);
    expect(await repository.save(validV2)).toEqual({ kind: 'ready', config: canonicalV2 });
    expect(storage.write).toHaveBeenCalledWith(canonicalV2);
    expect(await repository.load()).toEqual({ kind: 'ready', config: canonicalV2 });
    repository.dispose();
  });
  it('round trips both version 3 lists on explicit save', async () => {
    const {storage} = memoryStorage(undefined);
    const repository = createConfigRepository(storage);
    expect(await repository.save(validV3)).toEqual({kind:'ready',config:validV4});
    expect(await repository.load()).toEqual({kind:'ready',config:validV4});
    expect(storage.write).toHaveBeenCalledWith(validV4);
    expect(storage.write).toHaveBeenCalledTimes(1);
    repository.dispose();
  });
  it.each([invalid, unknownProperty, invalidV2, invalidV3, future])('never writes while loading or saving rejected data %j', async (raw) => {
    const { storage } = memoryStorage(raw);
    const repository = createConfigRepository(storage);
    expect(await repository.load()).toMatchObject({ kind: 'unavailable' });
    expect(await repository.save(raw)).toMatchObject({ kind: 'unavailable' });
    expect(storage.write).not.toHaveBeenCalled();
    repository.dispose();
  });
  it('returns unavailable when reading storage fails', async () => {
    const { storage } = memoryStorage(undefined);
    storage.read = async () => { throw new Error('sensitive details'); };
    const repository = createConfigRepository(storage);
    expect(await repository.load()).toMatchObject({ kind: 'unavailable', reason: 'storage', message: expect.any(String) });
    repository.dispose();
  });
  it('returns unavailable when writing storage fails', async () => {
    const { storage } = memoryStorage(undefined);
    storage.write = async () => { throw new Error('write denied'); };
    const repository = createConfigRepository(storage);
    expect(await repository.save(valid)).toMatchObject({ kind: 'unavailable', reason: 'storage' });
    repository.dispose();
  });
  it('reports a delayed write failure even after a newer load succeeds', async () => {
    const { storage } = memoryStorage(undefined);
    const pendingWrite = deferred<void>();
    storage.write = () => pendingWrite.promise;
    const repository = createConfigRepository(storage);
    const observed: ConfigState[] = [];
    repository.subscribe((state) => { observed.push(state); });
    const saving = repository.save(valid);
    expect(await repository.load()).toEqual({ kind: 'ready', config: { schemaVersion: 4, enabled: false, groupingRules: [], duplicateRules: [] } });
    pendingWrite.reject(new Error('write denied'));
    expect(await saving).toMatchObject({ kind: 'unavailable', reason: 'storage' });
    expect(observed).toEqual([{ kind: 'ready', config: { schemaVersion: 4, enabled: false, groupingRules: [], duplicateRules: [] } }]);
    repository.dispose();
  });
  it('refreshes subscribers after changes and detaches on dispose', async () => {
    const { storage, change, listeners } = memoryStorage(undefined);
    const repository = createConfigRepository(storage);
    expect(listeners.size).toBe(1);
    const observed: ConfigState[] = [];
    const unsubscribe = repository.subscribe((state) => { observed.push(state); });
    change(valid);
    await vi.waitFor(() => expect(observed).toEqual([{ kind: 'ready', config: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } }]));
    unsubscribe();
    await repository.load();
    expect(observed).toHaveLength(1);
    repository.dispose();
    repository.dispose();
    expect(listeners.size).toBe(0);
    change(undefined);
    expect(observed).toHaveLength(1);
  });
  it('returns the newer completed read to an older caller without republishing', async () => {
    const { storage } = memoryStorage(undefined);
    const older = deferred<unknown>();
    storage.read = vi.fn().mockReturnValueOnce(older.promise).mockResolvedValueOnce(valid);
    const repository = createConfigRepository(storage);
    const observed: ConfigState[] = [];
    repository.subscribe((state) => { observed.push(state); });
    const first = repository.load();
    await repository.load();
    older.resolve({ schemaVersion: 1, enabled: false });
    expect(await first).toEqual({ kind: 'ready', config: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } });
    expect(observed).toEqual([{ kind: 'ready', config: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } }]);
    repository.dispose();
  });
  it('returns the completed settings save to an older read caller without republishing', async () => {
    const { storage } = memoryStorage(undefined);
    const older = deferred<unknown>();
    storage.read = () => older.promise;
    const repository = createConfigRepository(storage);
    const observed: ConfigState[] = [];
    repository.subscribe((state) => { observed.push(state); });
    const first = repository.load();
    await repository.save(valid);
    older.resolve(undefined);
    expect(await first).toEqual({ kind: 'ready', config: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } });
    expect(observed).toEqual([{ kind: 'ready', config: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } }]);
    repository.dispose();
  });
  it('does not publish an in-flight read after disposal', async () => {
    const { storage } = memoryStorage(undefined);
    const pending = deferred<unknown>();
    storage.read = () => pending.promise;
    const repository = createConfigRepository(storage);
    const listener = vi.fn();
    repository.subscribe(listener);
    const loading = repository.load();
    repository.dispose();
    pending.resolve(valid);
    await loading;
    expect(listener).not.toHaveBeenCalled();
  });
});


describe('schema 4 rule enablement', () => {
  it('accepts disabled rules and copies/freezes all nested values', () => {
    const raw = structuredClone(validV4);
    raw.enabled = false;
    raw.groupingRules[0]!.enabled = false;
    raw.duplicateRules[0]!.enabled = false;
    const state = parseConfig(raw);
    expect(state).toEqual({ kind: 'ready', config: raw });
    if (state.kind !== 'ready') throw new Error('Expected schema 4');
    raw.duplicateRules[0]!.ignoreQueryParameters.push('changed');
    expect(state.config.duplicateRules[0]!.ignoreQueryParameters).toEqual(['utm_source']);
    expect(Object.isFrozen(state.config.groupingRules[0])).toBe(true);
    expect(Object.isFrozen(state.config.duplicateRules[0]!.ignoreQueryParameters)).toBe(true);
  });
  it.each([undefined, 'true', 1])('rejects nonboolean enablement %j in either list', enabled => {
    for (const list of ['groupingRules', 'duplicateRules'] as const) {
      const raw = structuredClone(validV4);
      Object.assign(raw[list][0]!, { enabled });
      expect(parseConfig(raw)).toMatchObject({ kind: 'unavailable', reason: 'invalid' });
    }
  });
  it('rejects missing enablement and unknown rule keys', () => {
    expect(parseConfig(invalidV4)).toMatchObject({ kind: 'unavailable', reason: 'invalid' });
    const raw = structuredClone(validV4);
    Reflect.deleteProperty(raw.duplicateRules[0]!, 'enabled');
    expect(parseConfig(raw)).toMatchObject({ kind: 'unavailable', reason: 'invalid' });
    expect(parseConfig({ ...validV4, groupingRules: [{ ...validV4.groupingRules[0], extra: true }] })).toMatchObject({ kind: 'unavailable', reason: 'invalid' });
  });
  it.each([2, 3])('rejects enablement in strict legacy version %s rules', schemaVersion => {
    expect(parseConfig({ schemaVersion, enabled: false, groupingRules: [{ enabled: true, pattern: 'https://example.test/*', group: 'Work' }], ...(schemaVersion === 3 ? { duplicateRules: [] } : {}) })).toMatchObject({ kind: 'unavailable', reason: 'invalid' });
  });
  it('migrates legacy disabled global state without changing rule order or strings', () => {
    expect(parseConfig({ ...validV2, enabled: false })).toEqual({ kind: 'ready', config: { ...canonicalV2, enabled: false } });
    expect(parseConfig({ ...validV3, enabled: false })).toEqual({ kind: 'ready', config: { ...validV4, enabled: false } });
    expect(parseConfig({ ...validV3, groupingRules: [], duplicateRules: [{ ...validV3.duplicateRules[0], enabled: true }] })).toMatchObject({ kind: 'unavailable', reason: 'invalid' });
  });
});


it('writes one whole canonical document preserving disabled global and per-rule settings', async () => {
  const raw = { ...validV4, enabled: false,
    groupingRules: validV4.groupingRules.map(rule => ({ ...rule, enabled: false })),
    duplicateRules: validV4.duplicateRules.map(rule => ({ ...rule, enabled: false })) };
  const { storage } = memoryStorage(undefined);
  const repository = createConfigRepository(storage);
  expect(await repository.save(raw)).toEqual({ kind: 'ready', config: raw });
  expect(storage.write).toHaveBeenCalledExactlyOnceWith(raw);
  expect(await repository.load()).toEqual({ kind: 'ready', config: raw });
  repository.dispose();
});
