import { parseRecentTabIds, RECENT_TABS_KEY } from './recent-tab-state';

type RecentTabsApi = Pick<typeof chrome, 'storage' | 'tabs' | 'tabGroups' | 'windows'>;
type Scope = { windowId: number; incognito: boolean };
export type RecentTabRow = Readonly<{
  id: number;
  title: string;
  site: string;
  context: string;
  source: Scope;
}>;

const displayLimit = 8;

function normalWindow(window: chrome.windows.Window | undefined): window is chrome.windows.Window & { id: number } {
  return window?.type === 'normal' && typeof window.id === 'number' && window.id >= 0
    && typeof window.incognito === 'boolean';
}

function sameScope(left: Scope | undefined, right: Scope): boolean {
  return left?.windowId === right.windowId && left.incognito === right.incognito;
}

function tabLabels(tab: chrome.tabs.Tab): Pick<RecentTabRow, 'title' | 'site'> | undefined {
  const address = tab.url || tab.pendingUrl;
  if (!address || address === 'about:blank') return { title: 'Untitled tab', site: '' };
  try {
    const url = new URL(address);
    if (url.protocol === 'chrome:' && url.hostname === 'newtab') return { title: 'New tab', site: '' };
    if (url.protocol === 'file:') return { title: tab.title?.trim() || 'Local file', site: 'Local file' };
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return { title: tab.title?.trim() || url.hostname, site: url.hostname };
    }
  } catch { /* Ignore malformed addresses. */ }
}

export function createRecentTabsBrowser(api: RecentTabsApi) {
  let candidates = new Set<number>();
  let shownGroups = new Set<number>();
  const windowLabels = new Map<number, string>();

  async function currentScope(): Promise<Scope | undefined> {
    const window = await api.windows.getCurrent();
    if (normalWindow(window)) return { windowId: window.id, incognito: window.incognito };
  }

  async function liveTab(id: number, scope: Scope) {
    const tab = await api.tabs.get(id).catch(() => undefined);
    if (tab?.id === id && tab.incognito === scope.incognito && tab.windowId >= 0) return tab;
  }

  async function liveGroup(tab: chrome.tabs.Tab) {
    if (tab.groupId < 0) return;
    const group = await api.tabGroups.get(tab.groupId).catch(() => undefined);
    if (group?.id === tab.groupId && group.windowId === tab.windowId) return group;
  }

  async function read(): Promise<readonly RecentTabRow[]> {
    const source = await currentScope();
    if (!source) throw Error('Current browser window unavailable.');

    const stored = await api.storage.session.get(RECENT_TABS_KEY);
    const ids = parseRecentTabIds(stored[RECENT_TABS_KEY]);
    candidates = new Set(source.incognito ? ids.incognito : ids.normal);
    const windows = new Map<number, chrome.windows.Window | undefined>();
    const groups = new Map<number, chrome.tabGroups.TabGroup | undefined>();
    const matches: { row: RecentTabRow; index: number }[] = [];
    for (const id of candidates) {
      const tab = await liveTab(id, source);
      if (!tab) continue;
      if (!windows.has(tab.windowId)) windows.set(tab.windowId, await api.windows.get(tab.windowId).catch(() => undefined));
      const window = windows.get(tab.windowId);
      if (!normalWindow(window) || window.id !== tab.windowId || window.incognito !== source.incognito) continue;
      const labels = tabLabels(tab);
      if (!labels) continue;
      if (tab.groupId >= 0 && !groups.has(tab.groupId)) {
        shownGroups.add(tab.groupId);
        groups.set(tab.groupId, await liveGroup(tab));
      }
      const group = groups.get(tab.groupId);
      let windowLabel = 'This window';
      if (window.id !== source.windowId) {
        windowLabel = windowLabels.get(window.id) ?? 'Window ' + (windowLabels.size + 2);
        windowLabels.set(window.id, windowLabel);
      }
      const groupLabel = group?.windowId === window.id ? group.title?.trim() || 'Unnamed group' : undefined;
      matches.push({
        row: { id, ...labels, context: groupLabel ? windowLabel + ' · ' + groupLabel : windowLabel, source },
        index: tab.index,
      });
      if (matches.length === displayLimit) break;
    }
    if (!sameScope(await currentScope(), source)) throw Error('Current browser window changed.');
    shownGroups = new Set(groups.keys());
    return matches.map(({ row, index }) => {
      const duplicate = matches.some(other => other.row.id !== row.id && other.row.title === row.title
        && other.row.site === row.site && other.row.context === row.context);
      return duplicate ? { ...row, context: 'Tab ' + (index + 1) + ' · ' + row.context } : row;
    });
  }

  async function focus(row: RecentTabRow): Promise<boolean> {
    try {
      const { id, source } = row;
      if (!sameScope(await currentScope(), source)) return false;

      // A tab can be detached or regrouped while the browser resolves these reads.
      // Resolve it again once if its location changed before activation.
      for (let attempt = 0; attempt < 2; attempt++) {
        const target = await liveTab(id, source);
        if (!target || !tabLabels(target)) return false;
        const window = await api.windows.get(target.windowId);
        if (!normalWindow(window) || window.id !== target.windowId || window.incognito !== source.incognito) return false;
        const group = await liveGroup(target);
        if (!sameScope(await currentScope(), source)) return false;
        const latest = await liveTab(id, source);
        if (!latest || !tabLabels(latest)) return false;
        if (latest.windowId !== target.windowId || latest.groupId !== target.groupId) continue;

        if (group?.collapsed) {
          await api.tabGroups.update(group.id, { collapsed: false });
          const expanded = await liveTab(id, source);
          if (!expanded || !tabLabels(expanded)) return false;
          if (expanded.windowId !== latest.windowId || expanded.groupId !== latest.groupId) continue;
        }

        if (!latest.active) await api.tabs.update(id, { active: true });
        const active = await liveTab(id, source);
        if (!active || !tabLabels(active)) return false;
        if (!active.active) {
          if (active.windowId !== latest.windowId) continue;
          return false;
        }
        const destination = await api.windows.get(active.windowId);
        if (!normalWindow(destination) || destination.id !== active.windowId || destination.incognito !== source.incognito) return false;
        if (!sameScope(await currentScope(), source)) return false;
        const finalTab = await liveTab(id, source);
        if (!finalTab || !tabLabels(finalTab)) return false;
        if (finalTab.windowId !== destination.id) continue;
        if (!finalTab.active) return false;
        if (destination.focused) return true;
        await api.windows.update(destination.id, destination.state === 'minimized'
          ? { focused: true, state: 'normal' }
          : { focused: true });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  function subscribe(refresh: () => void): () => void {
    const storage = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'session' && Object.hasOwn(changes, RECENT_TABS_KEY)) refresh();
    };
    const tab = (id: number) => { if (candidates.has(id)) refresh(); };
    const updated = (id: number, changes: chrome.tabs.OnUpdatedInfo) => {
      if (changes.url !== undefined || changes.title !== undefined || changes.groupId !== undefined) tab(id);
    };
    const group = (value: chrome.tabGroups.TabGroup) => { if (shownGroups.has(value.id)) refresh(); };

    api.storage.onChanged.addListener(storage);
    api.tabs.onUpdated.addListener(updated);
    api.tabs.onAttached.addListener(tab);
    api.tabs.onMoved.addListener(tab);
    api.tabs.onRemoved.addListener(tab);
    api.tabGroups.onUpdated.addListener(group);
    api.tabGroups.onRemoved.addListener(group);
    return () => {
      api.storage.onChanged.removeListener(storage);
      api.tabs.onUpdated.removeListener(updated);
      api.tabs.onAttached.removeListener(tab);
      api.tabs.onMoved.removeListener(tab);
      api.tabs.onRemoved.removeListener(tab);
      api.tabGroups.onUpdated.removeListener(group);
      api.tabGroups.onRemoved.removeListener(group);
    };
  }

  return { read, focus, subscribe };
}
