import { describe, expect, it, vi } from 'vitest';
import { createChromeConfigStorage } from '../../src/browser/config-storage';
import { createConfigRepository } from '../../src/config/repository';
import validV2 from '../fixtures/config/valid-v2.json';
import validV4 from '../fixtures/config/valid-v4.json';
import validV3 from '../fixtures/config/valid-v3.json';
import invalidV3 from '../fixtures/config/invalid-v3.json';
import invalidV2 from '../fixtures/config/invalid-v2.json';
import future from '../fixtures/config/future-version.json';

const canonicalV2 = { ...validV4, duplicateRules: [] };

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
  it.each([{ schemaVersion: 1, enabled: true }, validV2, validV3, validV4, invalidV2, invalidV3, future])('preserves stored input without writes on load %j', async (raw) => {
    const fake = chromeStorage();
    fake.values[key] = structuredClone(raw);
    const repository = createConfigRepository(createChromeConfigStorage(fake.api));
    await repository.load();
    expect(fake.set).not.toHaveBeenCalled();
    expect(fake.values[key]).toEqual(raw);
    repository.dispose();
  });
  it('writes and reads version 2 rules through the real adapter', async () => {
    const fake = chromeStorage();
    const repository = createConfigRepository(createChromeConfigStorage(fake.api));
    expect(await repository.save(validV2)).toEqual({ kind: 'ready', config: canonicalV2 });
    expect(fake.set).toHaveBeenCalledWith({ [key]: canonicalV2 });
    expect(await repository.load()).toEqual({ kind: 'ready', config: canonicalV2 });
    repository.dispose();
  });
  it('round trips both version 3 rule lists through the real adapter', async () => {
    const fake = chromeStorage();
    const repository = createConfigRepository(createChromeConfigStorage(fake.api));
    expect(await repository.save(validV3)).toEqual({kind:'ready',config:validV4});
    expect(fake.values[key]).toEqual(validV4);
    expect(fake.set).toHaveBeenCalledTimes(1);
    expect(await repository.load()).toEqual({kind:'ready',config:validV4});
    repository.dispose();
  });
  it('uses the dedicated local key and round-trips through the real repository', async () => {
    const fake = chromeStorage();
    const repository = createConfigRepository(createChromeConfigStorage(fake.api));
    expect(await repository.load()).toEqual({ kind: 'ready', config: { schemaVersion: 4, enabled: false, groupingRules: [], duplicateRules: [] } });
    await repository.save({ schemaVersion: 1, enabled: true });
    expect(fake.get).toHaveBeenCalledWith(key);
    expect(fake.set).toHaveBeenCalledWith({ [key]: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } });
    expect(fake.values[key]).toEqual({ schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] });
    expect(await repository.load()).toEqual({ kind: 'ready', config: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } });
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
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith({ kind: 'ready', config: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } }));
    delete fake.values[key];
    fake.change({ [key]: { oldValue: { schemaVersion: 1, enabled: true } } }, 'local');
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith({ kind: 'ready', config: { schemaVersion: 4, enabled: false, groupingRules: [], duplicateRules: [] } }));
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


it('getCurrent revokes publication synchronously for pending loads, saves and disposal',async()=>{
  let notify=()=>{};let release!:(value:unknown)=>void;
  let next:()=>Promise<unknown>=async()=>({schemaVersion:4,enabled:true,groupingRules:[],duplicateRules:[]});
  const repository=createConfigRepository({read:()=>next(),write:async()=>{},subscribe:listener=>{notify=listener;return ()=>{};}});
  expect(repository.getCurrent()).toBeUndefined();await repository.load();const first=repository.getCurrent()!;expect(first.state.kind).toBe('ready');
  next=()=>new Promise(done=>{release=done;});notify();expect(repository.getCurrent()).toBeUndefined();release({schemaVersion:4,enabled:true,groupingRules:[],duplicateRules:[]});await Promise.resolve();await Promise.resolve();expect(repository.getCurrent()!.revision).toBeGreaterThan(first.revision);
  const saving=repository.save({schemaVersion:4,enabled:false,groupingRules:[],duplicateRules:[]});expect(repository.getCurrent()).toBeUndefined();await saving;expect(repository.getCurrent()?.state).toMatchObject({kind:'ready',config:{enabled:false}});repository.dispose();expect(repository.getCurrent()).toBeUndefined();
});
