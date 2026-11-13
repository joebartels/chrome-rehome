import { isRecentTabId, parseRecentTabIds, RECENT_TAB_LIMIT, RECENT_TABS_KEY, type RecentTabIds } from './recent-tab-state';

type TrackerApi = {
  tabs: Pick<typeof chrome.tabs, 'get' | 'onCreated' | 'onActivated' | 'onRemoved' | 'onReplaced'>;
  storage: { session: Pick<typeof chrome.storage.session, 'get' | 'set'> };
};
type Context = keyof RecentTabIds;
type Update = (recent: RecentTabIds) => boolean | Promise<boolean>;

function removeId(ids: number[], tabId: number): boolean {
  const index = ids.indexOf(tabId);
  if (index === -1) return false;
  ids.splice(index, 1);
  return true;
}

function record(recent: RecentTabIds, tabId: number, context: Context): boolean {
  const other = recent[context === 'normal' ? 'incognito' : 'normal'];
  const removed = removeId(other, tabId);
  const ids = recent[context];
  if (ids[0] === tabId) return removed;
  removeId(ids, tabId);
  ids.unshift(tabId);
  if (ids.length > RECENT_TAB_LIMIT) ids.pop();
  return true;
}

export function registerRecentTabTracker(api: TrackerApi, reportFailure: () => void): void {
  let recent: RecentTabIds | undefined;
  let dirty = false;
  let queue = Promise.resolve();

  function enqueue(update: Update): Promise<void> {
    // Join the queue in the event callback, before any storage or identity lookup.
    queue = queue.then(async () => {
      if (!recent) {
        const stored = await api.storage.session.get(RECENT_TABS_KEY);
        recent = parseRecentTabIds(stored[RECENT_TABS_KEY]);
      }
      const changed = await update(recent);
      if (changed || dirty) {
        dirty = true;
        await api.storage.session.set({ [RECENT_TABS_KEY]: recent });
        dirty = false;
      }
    }).catch(() => { reportFailure(); });
    return queue;
  }

  async function tabContext(tabId: number): Promise<Context | undefined> {
    try {
      const tab = await api.tabs.get(tabId);
      if (tab.id === tabId && typeof tab.incognito === 'boolean') return tab.incognito ? 'incognito' : 'normal';
    } catch {
      // Chrome can close or replace the tab before this lookup.
    }
  }

  api.tabs.onCreated.addListener(({ id, incognito }) => {
    if (isRecentTabId(id) && typeof incognito === 'boolean') {
      return enqueue(recent => record(recent, id, incognito ? 'incognito' : 'normal'));
    }
  });
  api.tabs.onActivated.addListener(({ tabId }) => {
    if (!isRecentTabId(tabId)) return;
    return enqueue(async recent => {
      const context = await tabContext(tabId);
      return context === undefined ? false : record(recent, tabId, context);
    });
  });
  api.tabs.onRemoved.addListener(tabId => {
    if (!isRecentTabId(tabId)) return;
    return enqueue(recent => {
      const normal = removeId(recent.normal, tabId);
      return removeId(recent.incognito, tabId) || normal;
    });
  });
  api.tabs.onReplaced.addListener((added, removed) => {
    if (!isRecentTabId(removed) || added === removed) return;
    return enqueue(async recent => {
      if (!recent.normal.includes(removed) && !recent.incognito.includes(removed)) return false;
      const addedContext = isRecentTabId(added) ? await tabContext(added) : undefined;
      for (const context of ['normal', 'incognito'] as const) {
        const ids = recent[context];
        const index = ids.indexOf(removed);
        if (index === -1) continue;
        // An independently observed replacement keeps its existing rank.
        if (context === addedContext && !ids.includes(added)) ids[index] = added;
        else ids.splice(index, 1);
      }
      return true;
    });
  });
}
