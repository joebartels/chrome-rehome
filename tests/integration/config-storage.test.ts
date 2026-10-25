import { describe, expect, it, vi } from 'vitest';
import { createChromeConfigStorage } from '../../src/browser/config-storage';
import { createConfigRepository } from '../../src/config/repository';

const key = 'chromeReHomeConfig';
type ChangeListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];

function chromeStorage() {
  const values: Record<string, unknown> = {};
  const listeners = new Set<ChangeListener>();
  const get = vi.fn(async (requestedKey: string) => ({ [requestedKey]: values[requestedKey] }));
  const set = vi.fn(async (items: Record<string, unknown>) => { Object.assign(values, items); });
  const api = {
    storage: {
      local: { get, set },
      onChanged: {
        addListener: (listener: ChangeListener) => { listeners.add(listener); },
        removeListener: (listener: ChangeListener) => { listeners.delete(listener); },
      },
    },
  } as unknown as Pick<typeof chrome, 'storage'>;
  const change = (changes: Record<string, chrome.storage.StorageChange>, area: Parameters<ChangeListener>[1]) => {
    for (const listener of listeners) listener(changes, area);
  };
  return { api, values, listeners, get, set, change };
}

describe('Chrome config storage adapter', () => {
  it('uses the dedicated local key and round-trips through the real repository', async () => {
    const fake = chromeStorage();
    const repository = createConfigRepository(createChromeConfigStorage(fake.api));
    expect(await repository.load()).toEqual({ kind: 'ready', config: { schemaVersion: 1, enabled: false } });
    await repository.save({ schemaVersion: 1, enabled: true });
    expect(fake.get).toHaveBeenCalledWith(key);
    expect(fake.set).toHaveBeenCalledWith({ [key]: { schemaVersion: 1, enabled: true } });
    expect(fake.values[key]).toEqual({ schemaVersion: 1, enabled: true });
    expect(await repository.load()).toEqual({ kind: 'ready', config: { schemaVersion: 1, enabled: true } });
    repository.dispose();
    expect(fake.listeners.size).toBe(0);
  });
  it('refreshes only for the config key in local, including key deletion', async () => {
    const fake = chromeStorage();
    const repository = createConfigRepository(createChromeConfigStorage(fake.api));
    const listener = vi.fn();
    repository.subscribe(listener);
    fake.change({ unrelated: { newValue: true } }, 'local');
    fake.change({ [key]: { newValue: true } }, 'sync');
    fake.change({ [key]: { newValue: true } }, 'session');
    expect(fake.get).not.toHaveBeenCalled();
    fake.values[key] = { schemaVersion: 1, enabled: true };
    fake.change({ [key]: { newValue: fake.values[key] } }, 'local');
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith({ kind: 'ready', config: { schemaVersion: 1, enabled: true } }));
    delete fake.values[key];
    fake.change({ [key]: { oldValue: { schemaVersion: 1, enabled: true } } }, 'local');
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith({ kind: 'ready', config: { schemaVersion: 1, enabled: false } }));
    expect(listener).toHaveBeenCalledTimes(2);
    repository.dispose();
    fake.change({ [key]: { newValue: {} } }, 'local');
    expect(fake.get).toHaveBeenCalledTimes(2);
  });
  it.each(['read', 'write'] as const)('maps Chrome %s rejection to unavailable', async (operation) => {
    const fake = chromeStorage();
    if (operation === 'read') fake.get.mockRejectedValueOnce(new Error('unavailable'));
    else fake.set.mockRejectedValueOnce(new Error('unavailable'));
    const repository = createConfigRepository(createChromeConfigStorage(fake.api));
    const result = operation === 'read'
      ? await repository.load()
      : await repository.save({ schemaVersion: 1, enabled: true });
    expect(result).toMatchObject({ kind: 'unavailable', reason: 'storage' });
    repository.dispose();
  });
});
