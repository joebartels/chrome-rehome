import { isTabReceipt, isTargetHint, type ProtectedIdentity, type TargetHint, type TargetSnapshot } from '../controls/protocol';
export type ControlTargets = {
  read(hint: TargetHint): Promise<TargetSnapshot | undefined>;
  list(): Promise<readonly ProtectedIdentity[]>;
};
export function createControlTargets(api: Pick<typeof chrome, 'tabs' | 'webNavigation'>): ControlTargets {
  async function selected(hint: TargetHint) {
    const tabs = await api.tabs.query({ windowId: hint.windowId, active: true });
    if (tabs.length !== 1) return;
    const tab = tabs[0]!;
    return tab.id === hint.tabId && tab.windowId === hint.windowId && tab.incognito === hint.incognito && tab.active && !('pendingUrl' in tab) ? tab : undefined;
  }
  return {
    async list() {
      const tabs = await api.tabs.query({});
      return Object.freeze(tabs.map(tab => {
        const hint = { tabId: tab.id, windowId: tab.windowId, incognito: tab.incognito };
        if (!isTargetHint(hint)) throw Error('Tab identities unavailable.');
        return Object.freeze({ tabId: hint.tabId, incognito: hint.incognito });
      }));
    },
    async read(hint) {
      if (!isTargetHint(hint)) return;
      try {
        const tab = await selected(hint);
        if (!tab) return;
        const frame = await api.webNavigation.getFrame({ tabId: hint.tabId, frameId: 0 });
        if (!frame || frame.documentLifecycle !== 'active' || frame.frameType !== 'outermost_frame'
          || frame.parentFrameId !== -1 || frame.errorOccurred || frame.url !== tab.url) return;
        const latest = await selected(hint);
        if (!latest || latest.url !== frame.url) return;
        const receipt = { ...hint, documentId: frame.documentId };
        if (!isTabReceipt(receipt)) return;
        return Object.freeze({ receipt: Object.freeze(receipt), audible: latest.audible ?? false, pinned: latest.pinned });
      } catch { return; }
    }
  };
}
