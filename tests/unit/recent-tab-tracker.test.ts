import { describe, expect, it, vi } from 'vitest';
import { registerRecentTabTracker } from '../../src/browser/recent-tab-tracker';

const storageKey = 'chromeReHomeRecentTabs';

function event<Args extends unknown[]>() {
  const listeners: Array<(...args: Args) => unknown> = [];
  return {
    addListener(listener: (...args: Args) => unknown) { listeners.push(listener); },
    emit(...args: Args) { return Promise.all(listeners.map(listener => listener(...args))); },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function tab(id: number, incognito = false, windowId = 1): chrome.tabs.Tab {
  return {
    id, incognito, windowId, index: 0, groupId: -1, pinned: false, active: false, highlighted: false,
    selected: false, frozen: false, discarded: false, autoDiscardable: true, lastAccessed: 0,
    url: 'https://example.test/private', title: 'Private title',
  };
}

function session(value?: unknown) {
  let snapshot: Record<string, unknown> = value === undefined ? {} : { [storageKey]: value };
  const apply = (items: Record<string, unknown>) => { snapshot = { ...snapshot, ...structuredClone(items) }; };
  return {
    get: vi.fn(async (key: string) => Object.hasOwn(snapshot, key) ? { [key]: structuredClone(snapshot[key]) } : {}),
    set: vi.fn(async (items: Record<string, unknown>) => apply(items)),
    apply,
    state: () => snapshot,
  };
}

function setup(storage = session()) {
  const tabs = {
    onCreated: event<[chrome.tabs.Tab]>(),
    onActivated: event<[chrome.tabs.OnActivatedInfo]>(),
    onRemoved: event<[number, chrome.tabs.OnRemovedInfo]>(),
    onReplaced: event<[number, number]>(),
    onAttached: event<[number, chrome.tabs.OnAttachedInfo]>(),
    get: vi.fn(async (id: number) => tab(id)),
  };
  const reportFailure = vi.fn();
  const api = { tabs, storage: { session: storage } } as unknown as Parameters<typeof registerRecentTabTracker>[0];
  registerRecentTabTracker(api, reportFailure);
  return { tabs, storage, reportFailure };
}

describe('recent tab tracker', () => {
  it('hydrates lazily after a worker restart and ranks background creation without persisting tab metadata', async () => {
    const first = setup();
    expect(first.storage.get).not.toHaveBeenCalled();
    await first.tabs.onCreated.emit(tab(7));
    await first.tabs.onCreated.emit(tab(8, true));

    const restarted = setup(first.storage);
    expect(restarted.storage.get).toHaveBeenCalledTimes(1);
    expect(restarted.tabs.get).not.toHaveBeenCalled();
    await restarted.tabs.onCreated.emit(tab(9));
    expect(restarted.storage.get).toHaveBeenCalledTimes(2);
    expect(restarted.storage.state()).toEqual({ [storageKey]: { normal: [9, 7], incognito: [8] } });
  });

  it('keeps arrival order across a pending activation and subsequent tab events', async () => {
    const fake = setup(session({ normal: [1, 2], incognito: [3] }));
    const started = deferred<void>();
    const lookup = deferred<chrome.tabs.Tab>();
    fake.tabs.get.mockImplementationOnce(() => {
      started.resolve(undefined);
      return lookup.promise;
    });

    const activated = fake.tabs.onActivated.emit({ tabId: 2, windowId: 1 });
    await started.promise;
    const created = fake.tabs.onCreated.emit(tab(4));
    const closed = fake.tabs.onRemoved.emit(1, { windowId: 1, isWindowClosing: false });
    fake.tabs.get.mockResolvedValueOnce(tab(5, true, 8));
    const privateActivation = fake.tabs.onActivated.emit({ tabId: 5, windowId: 8 });
    lookup.resolve(tab(2, false, 6));
    await Promise.all([activated, created, closed, privateActivation]);

    expect(fake.storage.state()).toEqual({ [storageKey]: { normal: [4, 2], incognito: [5, 3] } });
  });

  it('keeps the same rank on attachment and records selection after moving across windows', async () => {
    const fake = setup(session({ normal: [1, 2], incognito: [] }));
    await fake.tabs.onAttached.emit(2, { newWindowId: 3, newPosition: 0 });
    expect(fake.storage.get).not.toHaveBeenCalled();
    fake.tabs.get.mockResolvedValueOnce(tab(2, false, 3));
    await fake.tabs.onActivated.emit({ tabId: 2, windowId: 3 });
    expect(fake.storage.state()).toEqual({ [storageKey]: { normal: [2, 1], incognito: [] } });
  });

  it('does not rewrite the current head or an untracked removal', async () => {
    const fake = setup(session({ normal: [1], incognito: [] }));
    await fake.tabs.onActivated.emit({ tabId: 1, windowId: 1 });
    await fake.tabs.onRemoved.emit(2, { windowId: 1, isWindowClosing: false });
    expect(fake.storage.set).not.toHaveBeenCalled();
  });

  it('bounds each context independently and deduplicates new activity', async () => {
    const full = Array.from({ length: 32 }, (_, index) => index + 1);
    const fake = setup(session({ normal: full, incognito: full.map(id => id + 32) }));
    await fake.tabs.onCreated.emit(tab(65));
    await fake.tabs.onCreated.emit(tab(40, true));
    expect(fake.storage.state()).toEqual({ [storageKey]: {
      normal: [65, ...full.slice(0, 31)],
      incognito: [40, 33, 34, 35, 36, 37, 38, 39, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
        51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64],
    } });
  });

  it('filters malformed stored IDs and invalid tab events', async () => {
    const fake = setup(session({ normal: [1, 1, -1, '2', 2.5, 2], incognito: '7' }));
    await fake.tabs.onCreated.emit(tab(-1));
    await fake.tabs.onActivated.emit({ tabId: -1, windowId: 1 });
    expect(fake.storage.get).not.toHaveBeenCalled();
    await fake.tabs.onCreated.emit(tab(3));
    expect(fake.storage.state()).toEqual({ [storageKey]: { normal: [3, 1, 2], incognito: [] } });
  });

  it('replaces a tracked identity in place without changing the replacement’s independently observed rank', async () => {
    const fake = setup(session({ normal: [1, 2, 3, 4], incognito: [] }));
    await fake.tabs.onReplaced.emit(5, 2);
    expect(fake.storage.state()).toEqual({ [storageKey]: { normal: [1, 5, 3, 4], incognito: [] } });
    await fake.tabs.onReplaced.emit(4, 5);
    expect(fake.storage.state()).toEqual({ [storageKey]: { normal: [1, 3, 4], incognito: [] } });
  });

  it('drops a replaced ID when the added tab is gone or belongs to another context', async () => {
    const fake = setup(session({ normal: [1, 2, 3], incognito: [4] }));
    fake.tabs.get.mockRejectedValueOnce(new Error('tab closed')).mockResolvedValueOnce(tab(6, true));
    await fake.tabs.onReplaced.emit(5, 1);
    await fake.tabs.onReplaced.emit(6, 2);
    expect(fake.storage.state()).toEqual({ [storageKey]: { normal: [3], incognito: [4] } });
  });

  it('skips a missing or mismatched activation lookup without inferring its context', async () => {
    const fake = setup();
    fake.tabs.get.mockRejectedValueOnce(new Error('tab closed')).mockResolvedValueOnce(tab(5, true));
    await fake.tabs.onActivated.emit({ tabId: 1, windowId: 1 });
    await fake.tabs.onActivated.emit({ tabId: 2, windowId: 1 });
    await fake.tabs.onCreated.emit(tab(3));
    expect(fake.storage.state()).toEqual({ [storageKey]: { normal: [3], incognito: [] } });
  });

  it('waits for an older session write to finish before writing newer state', async () => {
    const fake = setup();
    const started = deferred<void>();
    const complete = deferred<void>();
    fake.storage.set.mockImplementationOnce(async items => {
      started.resolve(undefined);
      await complete.promise;
      fake.storage.apply(items);
    });
    const first = fake.tabs.onCreated.emit(tab(1));
    await started.promise;
    const second = fake.tabs.onCreated.emit(tab(2));
    await Promise.resolve();
    expect(fake.storage.set).toHaveBeenCalledTimes(1);
    complete.resolve(undefined);
    await Promise.all([first, second]);
    expect(fake.storage.state()).toEqual({ [storageKey]: { normal: [2, 1], incognito: [] } });
  });

  it('retries hydration on the next event after a failed read without overwriting saved history', async () => {
    const fake = setup(session({ normal: [1], incognito: [2] }));
    fake.storage.get.mockRejectedValueOnce(new Error('session read failed'));
    await Promise.all([fake.tabs.onCreated.emit(tab(3)), fake.tabs.onCreated.emit(tab(4))]);
    expect(fake.storage.state()).toEqual({ [storageKey]: { normal: [4, 1], incognito: [2] } });
    expect(fake.reportFailure).toHaveBeenCalledOnce();
  });

  it('persists the dirty snapshot after a failed write even when the next event leaves the ranking alone', async () => {
    const fake = setup();
    fake.storage.set.mockRejectedValueOnce(new Error('session write failed'));
    await fake.tabs.onCreated.emit(tab(1));
    await fake.tabs.onActivated.emit({ tabId: 1, windowId: 1 });
    await fake.tabs.onCreated.emit(tab(2));
    expect(fake.storage.state()).toEqual({ [storageKey]: { normal: [2, 1], incognito: [] } });
    expect(fake.storage.set).toHaveBeenCalledTimes(3);
    expect(fake.reportFailure).toHaveBeenCalledOnce();
  });
});
