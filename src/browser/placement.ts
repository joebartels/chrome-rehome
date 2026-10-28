import type { ReplacementPort } from '../execution/replacement';
import { createGroupPlacementAdapter } from './group-placement';
import { createSnapshotReader } from './snapshots';

export function createPlacementAdapter(api: Pick<typeof chrome, 'tabs' | 'tabGroups' | 'webNavigation' | 'windows'>): ReplacementPort {
  const reader = createSnapshotReader(api);
  const groups = createGroupPlacementAdapter(api);
  return {
    async read() {
      const snapshot=await reader.read({kind:'all-normal-windows'});
      return Object.freeze({tabs:Object.freeze(snapshot.tabs.map(tab=>Object.freeze({...tab}))),
        groups:Object.freeze(snapshot.groups.map(group=>Object.freeze({...group})))});
    },
    async readPresentation() {
      try {
        const windows = await api.windows.getAll({populate:true,windowTypes:['normal']});
        const ids = new Set<number>();
        const tabIds = new Set<number>();
        const activeTabs: {windowId:number;tabId:number}[] = [];
        let focusedWindowId: number | null = null;
        for (const window of windows) {
          if (window.type !== 'normal' || window.id === undefined || !Number.isSafeInteger(window.id)
            || window.id < 0 || ids.has(window.id) || typeof window.focused !== 'boolean' || !window.tabs?.length) return;
          ids.add(window.id);
          for (const tab of window.tabs) {
            if (tab.id === undefined || !Number.isSafeInteger(tab.id) || tab.id < 0 || tabIds.has(tab.id)
              || tab.windowId !== window.id || typeof tab.active !== 'boolean') return;
            tabIds.add(tab.id);
          }
          const active = window.tabs.filter(tab=>tab.active);
          if (active.length !== 1) return;
          activeTabs.push(Object.freeze({windowId:window.id,tabId:active[0]!.id!}));
          if (window.focused) {
            if (focusedWindowId !== null) return;
            focusedWindowId = window.id;
          }
        }
        return Object.freeze({focusedWindowId,activeTabs:Object.freeze(activeTabs)});
      } catch { return; }
    },
    async activateTab(tabId) { await api.tabs.update(tabId,{active:true}); },
    async focusWindow(windowId) { await api.windows.update(windowId,{focused:true}); },
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
