import type { ProtectedIdentity } from '../controls/protocol';

type API = {
  action: Pick<typeof chrome.action, 'setBadgeText' | 'setTitle'>;
  tabs: Pick<typeof chrome.tabs, 'query' | 'get' | 'onActivated' | 'onCreated' | 'onUpdated' | 'onRemoved' | 'onReplaced' | 'onAttached'>;
  runtime: Pick<typeof chrome.runtime, 'onStartup' | 'onInstalled'>;
};
type Controls = { getProtectedTabs(): readonly ProtectedIdentity[] | undefined };

/** Read-only hints: one renderer owns action writes so delayed old writes settle before correction. */
export function registerProtectionIndicator(api: API, controls: Controls, reportFailure: () => void) {
  const tabs = new Map<number, boolean | undefined>();
  const failedReads = new Set<number>();
  const displayed = new Map<number, boolean>();
  const reads = new Set<number>();
  const renders = new Set<number>();
  const failedDisplays = new Set<number>();
  let lastSnapshot: readonly ProtectedIdentity[] | undefined;
  // Only retained during the initial query to prevent a stale result resurrecting a removed tab.
  const removed = new Set<number>();
  let loaded = false;
  let running = false;
  let dirty = false;
  let disposed = false;
  function remember(tab: chrome.tabs.Tab): void {
    if (typeof tab.id === 'number' && typeof tab.incognito === 'boolean') { tabs.set(tab.id, tab.incognito); renders.add(tab.id); }
  }
  async function reconcile(): Promise<void> {
    try {
      while (dirty && !disposed) {
        dirty = false;
        if (!loaded) {
          try {
            const live = await api.tabs.query({});
            if (disposed) return;
            for (const tab of live) if (tab.id !== undefined && !removed.has(tab.id)) remember(tab);
            loaded = true; removed.clear();
          } catch { reportFailure(); return; }
        }
        const pending = [...reads]; reads.clear();
        for (const id of pending) {
          try {
            const tab = await api.tabs.get(id);
            if (disposed) return;
            // A close event during this await removes the entry and must win.
            if (tabs.has(id)) { remember(tab); failedReads.delete(id); }
          } catch { if (tabs.has(id)) { tabs.set(id, undefined); failedReads.add(id); } reportFailure(); }
        }
        const protectedTabs = controls.getProtectedTabs();
        if (protectedTabs !== lastSnapshot) {
          lastSnapshot = protectedTabs;
          for (const id of tabs.keys()) renders.add(id);
        }
        const candidates = [...renders]; renders.clear();
        for (const tabId of candidates) {
          if (!tabs.has(tabId)) continue;
          const incognito = tabs.get(tabId);
          if (disposed) return;
          const protectedValue = protectedTabs?.some(tab => tab.tabId === tabId && tab.incognito === incognito) ?? false;
          if (displayed.get(tabId) === protectedValue) continue;
          try {
            await api.action.setBadgeText({ tabId, text: protectedValue ? '🔒' : '' });
            if (disposed) return;
            if (!tabs.has(tabId)) continue;
            await api.action.setTitle({ tabId, title: protectedValue ? 'ChromeReHome — tab protected' : 'ChromeReHome' });
            if (tabs.has(tabId) && !renders.has(tabId)) { displayed.set(tabId, protectedValue); failedDisplays.delete(tabId); }
          } catch { if (tabs.has(tabId)) { displayed.delete(tabId); failedDisplays.add(tabId); } reportFailure(); }
        }
      }
    } finally { running = false; }
  }
  function refresh(): void {
    if (disposed) return;
    for (const id of failedReads) reads.add(id);
    for (const id of failedDisplays) renders.add(id);
    dirty = true;
    if (running) return;
    running = true;
    // A burst of status/lifecycle events creates one pending pass, not a promise per event.
    void Promise.resolve().then(reconcile).catch(() => { reportFailure(); });
  }
  function readTab(tabId: number): void {
    // Placeholder only schedules an identity read; it never asserts protection.
    tabs.set(tabId, undefined);
    reads.add(tabId); renders.add(tabId); refresh();
  }
  function onActivated(info: { tabId: number }): void { readTab(info.tabId); }
  function onCreated(tab: chrome.tabs.Tab): void { if (tab.id !== undefined) readTab(tab.id); }
  function onUpdated(tabId: number, change: chrome.tabs.OnUpdatedInfo): void {
    // Chrome resets per-tab action state on navigation, even when protection survives.
    if (change.status) displayed.delete(tabId);
    readTab(tabId);
  }
  function onRemoved(tabId: number): void {
    if (!loaded) removed.add(tabId);
    tabs.delete(tabId); reads.delete(tabId); failedReads.delete(tabId); displayed.delete(tabId); renders.delete(tabId); failedDisplays.delete(tabId);
  }
  function onReplaced(added: number, old: number): void { onRemoved(old); readTab(added); }
  function onAttached(tabId: number): void { readTab(tabId); }
  function restart(): void { displayed.clear(); for (const id of tabs.keys()) renders.add(id); refresh(); }
  api.tabs.onActivated.addListener(onActivated);
  api.tabs.onCreated.addListener(onCreated);
  api.tabs.onUpdated.addListener(onUpdated);
  api.tabs.onRemoved.addListener(onRemoved);
  api.tabs.onReplaced.addListener(onReplaced);
  api.tabs.onAttached.addListener(onAttached);
  api.runtime.onStartup.addListener(restart);
  api.runtime.onInstalled.addListener(restart);
  refresh();
  return {
    refresh,
    dispose(): void {
      disposed = true;
      api.tabs.onActivated.removeListener(onActivated);
      api.tabs.onCreated.removeListener(onCreated);
      api.tabs.onUpdated.removeListener(onUpdated);
      api.tabs.onRemoved.removeListener(onRemoved);
      api.tabs.onReplaced.removeListener(onReplaced);
      api.tabs.onAttached.removeListener(onAttached);
      api.runtime.onStartup.removeListener(restart);
      api.runtime.onInstalled.removeListener(restart);
      tabs.clear(); displayed.clear(); reads.clear(); failedReads.clear(); removed.clear(); renders.clear(); failedDisplays.clear();
    },
  };
}
