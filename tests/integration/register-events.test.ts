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
      onTabReplaced: event<(details: chrome.webNavigation.WebNavigationReplacementCallbackDetails) => unknown>(),
      onBeforeNavigate: event<(details: chrome.webNavigation.WebNavigationBaseCallbackDetails) => unknown>(),
    },
    tabs: {
      onUpdated: event<(tabId: number, change: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => unknown>(),
      onRemoved: event<(tabId: number, info: chrome.tabs.OnRemovedInfo) => unknown>(),
      onReplaced: event<(addedTabId: number, removedTabId: number) => unknown>(),
    },
    runtime: {
      onStartup: event<() => unknown>(),
      onInstalled: event<(details: chrome.runtime.InstalledDetails) => unknown>(),
    },
    storage: {
      local: { get: vi.fn(read), set: vi.fn(async () => {}) },
      session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
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
function setup(read: () => Promise<Record<string, unknown>> = async () => ({ chromeReHomeConfig: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } })) {
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
    resolve({ chromeReHomeConfig: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } });
    await Promise.all([ready, ...pending]);
    expect(fake.consumed).toHaveLength(1);
  });

  it.each([
    ['onCommitted', 'committed'], ['onHistoryStateUpdated', 'history'], ['onReferenceFragmentUpdated', 'fragment'],
  ] as const)('normalizes %s and preserves the navigation identity', async (name, kind) => {
    const fake = setup();
    registerEvents(fake.api, fake.coordinator, fake.reportFailure);
    if (name !== 'onCommitted') await Promise.all(fake.fake.webNavigation.onCommitted.emit(navigation({ url: 'https://example.com/before', timeStamp: 99 })));
    await Promise.all(fake.fake.webNavigation[name].emit(navigation()));
    expect(fake.consumed.at(-1)).toEqual(expect.objectContaining({
      kind, tabId: 7, documentId: 'document-one', browserTimeStamp: 100,
      url: 'https://example.com/?private=value#fragment',
    }));
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
    await Promise.all(fake.fake.webNavigation.onCommitted.emit(navigation({ timeStamp: 101 })));
    expect(fake.consumed).toHaveLength(1);
  });

  it('the production entry registers all events before an unresolved read finishes', async () => {
    const fake = fakeApi(() => new Promise(() => {}));
    const recentEvents = {
      onCreated: event<Parameters<typeof chrome.tabs.onCreated.addListener>[0]>(),
      onActivated: event<Parameters<typeof chrome.tabs.onActivated.addListener>[0]>(),
    };
    const expectTabListeners = () => {
      expect(fake.tabs.onUpdated.listeners.size).toBe(2);
      expect(fake.tabs.onRemoved.listeners.size).toBe(3);
      expect(fake.tabs.onReplaced.listeners.size).toBe(3);
      expect(recentEvents.onCreated.listeners.size).toBe(2);
      expect(recentEvents.onActivated.listeners.size).toBe(2);
    };
    let sessionRead!: () => void;
    const sessionStarted = new Promise<void>(resolve => { sessionRead = resolve; });
    fake.storage.session.get.mockImplementation(async () => {
      for (const observed of Object.values(fake.webNavigation)) expect(observed.listeners.size).toBe(1);
      expectTabListeners();
      expect(menuClicks.listeners.size).toBe(1);
      expect(fake.runtime.onStartup.listeners.size).toBe(3);
      expect(fake.runtime.onInstalled.listeners.size).toBe(3);
      sessionRead();
      return {};
    });
    const menuClicks = event<Parameters<typeof chrome.contextMenus.onClicked.addListener>[0]>();
    const contextMenus = { onClicked: menuClicks, update: vi.fn((_id, _properties, callback) => callback()), create: vi.fn(), remove: vi.fn((_id, callback) => callback()) };
    const messages = event<Parameters<typeof chrome.runtime.onMessage.addListener>[0]>();
    vi.stubGlobal('chrome', { ...fake, contextMenus,
      tabs: { ...fake.tabs, ...recentEvents, onAttached: event(), query: vi.fn(async () => []) },
      action: { setBadgeText: vi.fn(async () => {}), setTitle: vi.fn(async () => {}) }, runtime: { ...fake.runtime, sendMessage: vi.fn(async () => {}), id: 'self',
      getURL: (path: string) => `chrome-extension://self/${path}`, onMessage: messages } });
    await import('../../src/background/index');
    expect(messages.listeners.size).toBe(1);
    expect(menuClicks.listeners.size).toBe(1);
    expect(fake.runtime.onStartup.listeners.size).toBe(3);
    expect(fake.runtime.onInstalled.listeners.size).toBe(3);
    expectTabListeners();
    await sessionStarted;
    for (const observed of Object.values(fake.webNavigation)) expect(observed.listeners.size).toBe(1);
    expect(fake.storage.local.get).toHaveBeenCalledTimes(1);
    expect(fake.storage.local.set).not.toHaveBeenCalled();
    expect(fake.storage.session.get).toHaveBeenCalledWith('chromeReHomeReplacementJournal');
    expect(fake.storage.session.get).toHaveBeenCalledWith('chromeReHomeProtections');
    expect(fake.storage.session.get).not.toHaveBeenCalledWith('chromeReHomeRecentTabs');
    expect(fake.storage.session.set).not.toHaveBeenCalled();
    expect(fake.storage.session.remove).not.toHaveBeenCalled();
  });
});


describe('registry eligibility metadata and replacements', () => {
  it.each(['onCommitted', 'onHistoryStateUpdated', 'onReferenceFragmentUpdated'] as const)
  ('preserves restrictive qualifiers and lifecycle through %s', async (name) => {
    const fake = setup();
    registerEvents(fake.api, fake.coordinator, fake.reportFailure);
    await Promise.all(fake.fake.webNavigation.onCommitted.emit(navigation({ url: 'https://example.com/seed' })));
    const seed = fake.consumed.length;
    await Promise.all(fake.fake.webNavigation[name].emit(navigation({ timeStamp: 101, transitionType: 'reload', transitionQualifiers: ['from_address_bar'] })));
    expect(fake.consumed).toHaveLength(seed);
    await Promise.all(fake.fake.webNavigation.onCommitted.emit(navigation({ timeStamp: 102 })));
    await Promise.all(fake.fake.webNavigation[name].emit(navigation({ timeStamp: 103, documentLifecycle: 'prerender', url: 'https://example.com/next' })));
    expect(fake.consumed).toHaveLength(seed + 1);
  });

  it('preserves trusted client/server redirects and document identity', async () => {
    const fake = setup();
    registerEvents(fake.api, fake.coordinator, fake.reportFailure);
    await Promise.all(fake.fake.webNavigation.onCommitted.emit(navigation({ transitionQualifiers: ['client_redirect'] })));
    expect(fake.consumed).toEqual([]);
    await Promise.all(fake.fake.webNavigation.onCommitted.emit(navigation({ timeStamp: 101 })));
    fake.fake.webNavigation.onBeforeNavigate.emit(navigation());
    await Promise.all(fake.fake.webNavigation.onCommitted.emit(navigation({ timeStamp: 102, documentId: 'redirected',
      url: 'https://example.com/final', transitionQualifiers: ['client_redirect', 'server_redirect'] })));
    expect(fake.consumed.at(-1)).toMatchObject({ documentId: 'redirected', url: 'https://example.com/final' });
  });

  it.each(['tabs-first', 'navigation-first'] as const)('both replacement APIs revoke pending observations without provenance transfer: %s', async (order) => {
    let resolve!: (value: Record<string, unknown>) => void;
    const fake = setup(() => new Promise((done) => { resolve = done; }));
    registerEvents(fake.api, fake.coordinator, fake.reportFailure);
    const pending = [
      ...fake.fake.webNavigation.onCommitted.emit(navigation()),
      ...fake.fake.webNavigation.onCommitted.emit(navigation({ tabId: 8 })),
    ];
    const tabs = () => fake.fake.tabs.onReplaced.emit(8, 7);
    const nav = () => fake.fake.webNavigation.onTabReplaced.emit({ tabId: 8, replacedTabId: 7, timeStamp: 101 });
    if (order === 'tabs-first') { tabs(); nav(); } else { nav(); tabs(); }
    resolve({ chromeReHomeConfig: { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } });
    await Promise.all(pending);
    expect(fake.consumed).toEqual([]);
    await Promise.all(fake.fake.webNavigation.onCommitted.emit(navigation({ tabId: 8, timeStamp: 102, transitionQualifiers: ['client_redirect'] })));
    expect(fake.consumed).toEqual([]);
    await Promise.all(fake.fake.webNavigation.onCommitted.emit(navigation({ tabId: 8, timeStamp: 103 })));
    expect(fake.consumed).toHaveLength(1);
  });
});

it('audible changes revoke control authority without changing navigation provenance', async () => {
  const f = setup(); registerEvents(f.api, f.coordinator, f.reportFailure);
  await Promise.all(f.fake.webNavigation.onCommitted.emit(navigation()));
  const trackerBefore = f.consumed[0];
  const invalidate = vi.spyOn(f.coordinator, 'invalidateControls');
  f.fake.tabs.onUpdated.emit(7, { audible: true }, {} as chrome.tabs.Tab);
  f.fake.tabs.onUpdated.emit(7, { audible: false }, {} as chrome.tabs.Tab);
  f.fake.tabs.onUpdated.emit(7, { title: 'unrelated' }, {} as chrome.tabs.Tab);
  expect(invalidate).toHaveBeenCalledTimes(2);
  await Promise.all(f.fake.webNavigation.onHistoryStateUpdated.emit(navigation({ timeStamp: 101, url: 'https://example.com/next' })));
  expect(f.consumed.at(-1)?.documentId).toBe(trackerBefore?.documentId);
  expect(f.consumed).toHaveLength(2);
});
