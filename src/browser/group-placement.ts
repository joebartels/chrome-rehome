import type { GroupPlacementPort } from '../execution/group-placement';
import { createSnapshotReader } from './snapshots';

export function createGroupPlacementAdapter(api: Pick<typeof chrome, 'tabs' | 'tabGroups'>): GroupPlacementPort {
  const reader = createSnapshotReader(api);
  return {
    async read(windowId) {
      const snapshot = await reader.read({ kind: 'window', windowId });
      return {
        tabs: snapshot.tabs.map(({ id, windowId, index, groupId, pinned, incognito }) =>
          ({ id, windowId, index, groupId, pinned, incognito })),
        groups: snapshot.groups.map(({ id, windowId, title }) =>
          ({ id, windowId, ...(title === undefined ? {} : { title }) })),
      };
    },
    groupTab(tabId, destination) {
      return api.tabs.group(destination.kind === 'existing'
        ? { tabIds: [tabId], groupId: destination.groupId }
        : { tabIds: [tabId], createProperties: { windowId: destination.windowId } });
    },
    async setTitle(groupId, title) { await api.tabGroups.update(groupId, { title }); },
  };
}
