import type { ReplacementPort } from '../execution/replacement';
import { createGroupPlacementAdapter } from './group-placement';
import { createSnapshotReader } from './snapshots';

export function createPlacementAdapter(api: Pick<typeof chrome, 'tabs' | 'tabGroups' | 'webNavigation'>): ReplacementPort {
  const reader = createSnapshotReader(api);
  const groups = createGroupPlacementAdapter(api);
  return {
    async read() {
      const snapshot=await reader.read({kind:'all-normal-windows'});
      return Object.freeze({tabs:Object.freeze(snapshot.tabs.map(tab=>Object.freeze({...tab}))),
        groups:Object.freeze(snapshot.groups.map(group=>Object.freeze({...group})))});
    },
    async readDocument(tabId) {
      const frame = await api.webNavigation.getFrame({tabId,frameId:0});
      if (!frame) return;
      return Object.freeze({tabId,documentId:frame.documentId,url:frame.url,documentLifecycle:frame.documentLifecycle,
        frameType:frame.frameType,parentFrameId:frame.parentFrameId,errorOccurred:frame.errorOccurred});
    },
    async moveTab(tabId,windowId,index) { await api.tabs.move(tabId,{windowId,index}); },
    async ungroupTab(tabId) { await api.tabs.ungroup(tabId); },
    groupTab: groups.groupTab,
    setTitle: groups.setTitle,
    async removeTab(tabId) { await api.tabs.remove(tabId); },
  };
}
