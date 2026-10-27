export type SnapshotScope = { kind: 'all-normal-windows' } | { kind: 'window'; windowId: number };

export type TabSnapshot = Readonly<{
  id: number;
  windowId: number;
  index: number;
  groupId: number;
  pinned: boolean;
  active: boolean;
  audible: boolean;
  incognito: boolean;
  url?: string;
  pendingUrl?: string | undefined;
}>;

export type GroupSnapshot = Readonly<{
  id: number;
  windowId: number;
  title?: string;
  color: chrome.tabGroups.TabGroup['color'];
  collapsed: boolean;
  shared?: boolean;
}>;

export function createSnapshotReader(api: Pick<typeof chrome, 'tabs' | 'tabGroups'>) {
  return {
    // These are independent live observations, not an atomic cross-API transaction.
    // Tabs and groups may disappear or change between the two observations.
    async read(scope: SnapshotScope): Promise<{
      tabs: readonly TabSnapshot[];
      groups: readonly GroupSnapshot[];
    }> {
      const [tabs, groups] = await Promise.all([
        api.tabs.query(scope.kind === 'window' ? { windowId: scope.windowId } : { windowType: 'normal' }),
        api.tabGroups.query(scope.kind === 'window' ? { windowId: scope.windowId } : {}),
      ]);
      const selectedWindows = scope.kind === 'window'
        ? new Set([scope.windowId])
        : new Set(tabs.map((tab) => tab.windowId));

      return {
        tabs: tabs
          .filter((tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined)
          .map((tab) => ({
            id: tab.id,
            windowId: tab.windowId,
            index: tab.index,
            groupId: tab.groupId,
            pinned: tab.pinned,
            active: tab.active,
            audible: tab.audible ?? false,
            incognito: tab.incognito,
            ...(tab.url === undefined ? {} : { url: tab.url }),
            ...('pendingUrl' in tab ? { pendingUrl: tab.pendingUrl } : {}),
          })),
        groups: groups.filter((group) => selectedWindows.has(group.windowId)).map((group) => ({
          id: group.id,
          windowId: group.windowId,
          ...(group.title === undefined ? {} : { title: group.title }),
          color: group.color,
          collapsed: group.collapsed,
          ...(group.shared === undefined ? {} : { shared: group.shared }),
        })),
      };
    },
  };
}
