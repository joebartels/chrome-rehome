import { describe, expect, it, vi } from 'vitest';
import valid from '../fixtures/config/valid-v1.json';
import invalid from '../fixtures/config/invalid.json';
import unknownProperty from '../fixtures/config/unknown-property.json';
import future from '../fixtures/config/future-version.json';
import { parseConfig, type ConfigState } from '../../src/config/schema';
import { createConfigRepository, type ConfigStorage } from '../../src/config/repository';

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
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('parseConfig', () => {
  it('defaults missing storage to disabled version 1', () => {
    expect(parseConfig(undefined)).toEqual({ kind: 'ready', config: { schemaVersion: 1, enabled: false } });
  });
  it.each([true, false])('accepts version 1 with enabled=%s', (enabled) => {
    expect(parseConfig({ schemaVersion: 1, enabled })).toEqual({ kind: 'ready', config: { schemaVersion: 1, enabled } });
  });
  it.each([null, [], true, 'config', 1, {}, { enabled: false }, { schemaVersion: 1 }, invalid,
    unknownProperty, { schemaVersion: '1', enabled: true }, { schemaVersion: 0, enabled: false },
    { schemaVersion: 1.5, enabled: true }, { schemaVersion: NaN, enabled: true }])('rejects malformed configuration %j', (raw) => {
    expect(parseConfig(raw)).toMatchObject({ kind: 'unavailable', reason: 'invalid', message: expect.any(String) });
  });
  it('distinguishes a future version', () => {
    expect(parseConfig(future)).toMatchObject({ kind: 'unavailable', reason: 'future-version' });
  });
  it('copies and freezes accepted configuration', () => {
    const input = { schemaVersion: 1, enabled: true };
    const state = parseConfig(input);
    input.enabled = false;
    expect(state).toEqual({ kind: 'ready', config: { schemaVersion: 1, enabled: true } });
    if (state.kind === 'ready') expect(Object.isFrozen(state.config)).toBe(true);
  });
});

describe('configuration repository', () => {
  it('round-trips valid version 1 through storage', async () => {
    const { storage } = memoryStorage(undefined);
    const repository = createConfigRepository(storage);
    expect(await repository.save(valid)).toEqual({ kind: 'ready', config: { schemaVersion: 1, enabled: true } });
    expect(await repository.load()).toEqual({ kind: 'ready', config: { schemaVersion: 1, enabled: true } });
    repository.dispose();
  });
  it.each([invalid, unknownProperty, future])('never writes while loading or saving rejected data %j', async (raw) => {
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
  it('refreshes subscribers after changes and detaches on dispose', async () => {
    const { storage, change, listeners } = memoryStorage(undefined);
    const repository = createConfigRepository(storage);
    expect(listeners.size).toBe(1);
    const observed: ConfigState[] = [];
    const unsubscribe = repository.subscribe((state) => { observed.push(state); });
    change(valid);
    await vi.waitFor(() => expect(observed).toEqual([{ kind: 'ready', config: { schemaVersion: 1, enabled: true } }]));
    unsubscribe();
    await repository.load();
    expect(observed).toHaveLength(1);
    repository.dispose();
    repository.dispose();
    expect(listeners.size).toBe(0);
    change(undefined);
    expect(observed).toHaveLength(1);
  });
  it('does not publish an older delayed read after a newer read completes', async () => {
    const { storage } = memoryStorage(undefined);
    const older = deferred<unknown>();
    storage.read = vi.fn().mockReturnValueOnce(older.promise).mockResolvedValueOnce(valid);
    const repository = createConfigRepository(storage);
    const observed: ConfigState[] = [];
    repository.subscribe((state) => { observed.push(state); });
    const first = repository.load();
    await repository.load();
    older.resolve({ schemaVersion: 1, enabled: false });
    await first;
    expect(observed).toEqual([{ kind: 'ready', config: { schemaVersion: 1, enabled: true } }]);
    repository.dispose();
  });
  it('does not publish an older read after a settings save completes', async () => {
    const { storage } = memoryStorage(undefined);
    const older = deferred<unknown>();
    storage.read = () => older.promise;
    const repository = createConfigRepository(storage);
    const observed: ConfigState[] = [];
    repository.subscribe((state) => { observed.push(state); });
    const first = repository.load();
    await repository.save(valid);
    older.resolve(undefined);
    await first;
    expect(observed).toEqual([{ kind: 'ready', config: { schemaVersion: 1, enabled: true } }]);
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
