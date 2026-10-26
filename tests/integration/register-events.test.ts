import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerEvents } from '../../src/background/register-events';
import { createCoordinator } from '../../src/background/coordinator';
import { createChromeConfigStorage } from '../../src/browser/config-storage';
import { createConfigRepository } from '../../src/config/repository';
import { createNavigationTracker, type Navigation } from '../../src/background/navigation';
import { createOperationQueue } from '../../src/background/operation-queue';
import { createDiagnostics } from '../../src/diagnostics/diagnostics';

type Listener = (...args: any[]) => unknown;
function event<T extends Listener>() {
  const listeners = new Set<T>();
  return {
    listeners,
    addListener: (listener: T) => { listeners.add(listener); },
    removeListener: (listener: T) => { listeners.delete(listener); },
    emit: (...args: Parameters<T>) => [...listeners].map((listener) => listener(...args)),
  };
}
function fakeApi(read: () => Promise<Record<string, unknown>>) {
  return {
    webNavigation: {
      onCommitted: event<(details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => unknown>(),
      onHistoryStateUpdated: event<(details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => unknown>(),
      onReferenceFragmentUpdated: event<(details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => unknown>(),
      onBeforeNavigate: event<(details: chrome.webNavigation.WebNavigationBaseCallbackDetails) => unknown>(),
    },
    tabs: {
      onRemoved: event<(tabId: number, info: chrome.tabs.OnRemovedInfo) => unknown>(),
      onReplaced: event<(addedTabId: number, removedTabId: number) => unknown>(),
    },
    runtime: {
      onStartup: event<() => unknown>(),
      onInstalled: event<(details: chrome.runtime.InstalledDetails) => unknown>(),
    },
    storage: {
      local: { get: vi.fn(read), set: vi.fn(async () => {}) },
      onChanged: event<(changes: Record<string, chrome.storage.StorageChange>, area: string) => unknown>(),
    },
  };
}
function navigation(overrides: Partial<chrome.webNavigation.WebNavigationTransitionCallbackDetails> = {}) {
  return {
    tabId: 7, frameId: 0, parentFrameId: -1, processId: 42, timeStamp: 100,
    url: 'https://example.com/?private=value#fragment', documentId: 'document-one',
    documentLifecycle: 'active', frameType: 'outermost_frame',
    transitionType: 'link', transitionQualifiers: [], ...overrides,
  } satisfies chrome.webNavigation.WebNavigationTransitionCallbackDetails;
}
function setup(read: () => Promise<Record<string, unknown>> = async () => ({ chromeReHomeConfig: { schemaVersion: 3, enabled: true, groupingRules: [], duplicateRules: [] } })) {
  const fake = fakeApi(read);
  const api = fake as unknown as Parameters<typeof registerEvents>[0] & Pick<typeof chrome, 'storage'>;
  const config = createConfigRepository(createChromeConfigStorage(api));
  const diagnostics = createDiagnostics({ enabled: true });
  const consumed: Navigation[] = [];
  const queue = createOperationQueue();
  const coordinator = createCoordinator({ config, diagnostics, queue, tracker: createNavigationTracker(), consume: async (event) => { consumed.push(event); } });
  const reportFailure = vi.fn(() => diagnostics.record({ code: 'operation-failed' }));
  return { fake, api, coordinator, config, diagnostics, consumed, queue, reportFailure };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('worker event registration', () => {
  it('registers every listener synchronously while storage initialization is unresolved', async () => {
    let resolve!: (value: Record<string, unknown>) => void;
    const fake = setup(() => new Promise((done) => { resolve = done; }));
    const ready = fake.coordinator.initialize();
    registerEvents(fake.api, fake.coordinator, fake.reportFailure);
    for (const group of [fake.fake.webNavigation, fake.fake.tabs, fake.fake.runtime]) {
      for (const observed of Object.values(group)) expect(observed.listeners.size).toBe(1);
    }
    const pending = fake.fake.webNavigation.onCommitted.emit(navigation());
    expect(fake.consumed).toEqual([]);
    resolve({ chromeReHomeConfig: { schemaVersion: 3, enabled: true, groupingRules: [], duplicateRules: [] } });
    await Promise.all([ready, ...pending]);
    expect(fake.consumed).toHaveLength(1);
  });

  it.each([
    ['onCommitted', 'committed'], ['onHistoryStateUpdated', 'history'], ['onReferenceFragmentUpdated', 'fragment'],
  ] as const)('normalizes %s and preserves the navigation identity', async (name, kind) => {
    const fake = setup();
    registerEvents(fake.api, fake.coordinator, fake.reportFailure);
    await Promise.all(fake.fake.webNavigation[name].emit(navigation()));
    expect(fake.consumed).toEqual([expect.objectContaining({
      kind, tabId: 7, documentId: 'document-one', browserTimeStamp: 100,
      url: 'https://example.com/?private=value#fragment',
    })]);
  });

  it('ignores subframe before-navigate and revokes main-frame work without emitting a navigation', async () => {
    const fake = setup();
    registerEvents(fake.api, fake.coordinator, fake.reportFailure);
    await fake.coordinator.initialize();
    let release!: () => void;
    const gate = fake.queue.run(() => new Promise<void>((resolve) => { release = resolve; }));
    const pending = fake.fake.webNavigation.onCommitted.emit(navigation());
    fake.fake.webNavigation.onBeforeNavigate.emit(navigation({ frameId: 2 }));
    await Promise.resolve();
    release();
    await Promise.all([gate, ...pending]);
    expect(fake.consumed).toHaveLength(1);
    const nextGate = fake.queue.run(() => new Promise<void>((resolve) => { release = resolve; }));
    const next = fake.fake.webNavigation.onCommitted.emit(navigation({ timeStamp: 101 }));
    fake.fake.webNavigation.onBeforeNavigate.emit(navigation());
    await Promise.resolve();
    release();
    await Promise.all([nextGate, ...next]);
    expect(fake.consumed).toHaveLength(1);
  });

  it('forgets removed tabs and both identities involved in tab replacement', async () => {
    const fake = setup();
    registerEvents(fake.api, fake.coordinator, fake.reportFailure);
    await fake.coordinator.initialize();
    let release!: () => void;
    const gate = fake.queue.run(() => new Promise<void>((resolve) => { release = resolve; }));
    const pending = [
      ...fake.fake.webNavigation.onCommitted.emit(navigation()),
      ...fake.fake.webNavigation.onCommitted.emit(navigation({ tabId: 8 })),
      ...fake.fake.webNavigation.onCommitted.emit(navigation({ tabId: 9 })),
    ];
    fake.fake.tabs.onRemoved.emit(7, { windowId: 1, isWindowClosing: false });
    fake.fake.tabs.onReplaced.emit(9, 8);
    await Promise.resolve();
    release();
    await Promise.all([gate, ...pending]);
    expect(fake.consumed).toEqual([]);
    await Promise.all(fake.fake.webNavigation.onCommitted.emit(navigation()));
    expect(fake.consumed).toHaveLength(1);
  });

  it.each(['onStartup', 'onInstalled'] as const)('%s waits for initialization and catches rejections without raw errors', async (name) => {
    const fake = setup();
    let reject!: (error: Error) => void;
    vi.spyOn(fake.coordinator, 'initialize').mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    registerEvents(fake.api, fake.coordinator, fake.reportFailure);
    const args = name === 'onStartup'
      ? fake.fake.runtime.onStartup.emit()
      : fake.fake.runtime.onInstalled.emit({ reason: 'install' });
    let settled = false;
    const pending = Promise.all(args).then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    reject(new Error('https://private.example/?secret=value'));
    await pending;
    expect(fake.reportFailure).toHaveBeenCalledExactlyOnceWith();
    expect(fake.diagnostics.snapshot()).toEqual([{ code: 'operation-failed' }]);
    expect(fake.fake.webNavigation.onCommitted.listeners.size).toBe(1);
  });

  it('catches rejected navigation handlers and leaves listeners active', async () => {
    const fake = setup();
    vi.spyOn(fake.coordinator, 'handle').mockRejectedValueOnce(new Error('private'));
    registerEvents(fake.api, fake.coordinator, fake.reportFailure);
    await Promise.all(fake.fake.webNavigation.onCommitted.emit(navigation()));
    expect(fake.reportFailure).toHaveBeenCalledExactlyOnceWith();
    await Promise.all(fake.fake.webNavigation.onHistoryStateUpdated.emit(navigation({ timeStamp: 101 })));
    expect(fake.consumed).toHaveLength(1);
  });

  it('the production entry registers all events before an unresolved read finishes', async () => {
    const fake = fakeApi(() => new Promise(() => {}));
    vi.stubGlobal('chrome', fake);
    await import('../../src/background/index');
    for (const group of [fake.webNavigation, fake.tabs, fake.runtime]) {
      for (const observed of Object.values(group)) expect(observed.listeners.size).toBe(1);
    }
    expect(fake.storage.local.get).toHaveBeenCalledTimes(1);
    expect(fake.storage.local.set).not.toHaveBeenCalled();
  });
});
