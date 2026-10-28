import { isTabReceipt, isTargetHint, type ProtectedIdentity, type TargetHint, type TargetSnapshot } from '../controls/protocol';
export type TargetObservation = { isCurrent(): boolean; dispose(): void };
export type ControlTargets = {
  observe(hint: TargetHint): TargetObservation;
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
  // This evidence belongs only to this read/command; it never revokes automatic work.
  function observe(hint: TargetHint): TargetObservation {
    let current = true;
    const remove: (() => void)[] = [];
    function listen<T extends (...args: any[]) => void>(event: { addListener(fn: T): void; removeListener(fn: T): void }, fn: T) {
      event.addListener(fn); remove.push(() => event.removeListener(fn));
    }
    const invalidateTab = (tabId: number) => { if (tabId === hint.tabId) current = false; };
    const invalidateFrame = (details: { tabId: number; frameId: number }) => { if (details.frameId === 0) invalidateTab(details.tabId); };
    const dispose = () => { current = false; for (const off of remove.splice(0)) off(); };
    try {
      listen(api.tabs.onActivated, info => { if (info.windowId === hint.windowId) current = false; });
      listen(api.tabs.onAttached, invalidateTab);
      listen(api.tabs.onDetached, invalidateTab);
      listen(api.tabs.onRemoved, invalidateTab);
      listen(api.tabs.onReplaced, (added, removed) => { invalidateTab(added); invalidateTab(removed); });
      listen(api.tabs.onUpdated, (tabId, change) => {
        if (change.status === 'loading' || change.audible !== undefined || change.pinned !== undefined) invalidateTab(tabId);
      });
      listen(api.webNavigation.onBeforeNavigate, invalidateFrame);
      listen(api.webNavigation.onCommitted, invalidateFrame);
      listen(api.webNavigation.onTabReplaced, details => { invalidateTab(details.tabId); invalidateTab(details.replacedTabId); });
    } catch { dispose(); }
    return { isCurrent: () => current, dispose };
  }
  return {
    observe,
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
      const observation = observe(hint);
      try {
        const tab = await selected(hint);
        if (!tab) return;
        const frame = await api.webNavigation.getFrame({ tabId: hint.tabId, frameId: 0 });
        if (!frame || frame.documentLifecycle !== 'active' || frame.frameType !== 'outermost_frame'
          || frame.parentFrameId !== -1 || frame.errorOccurred || frame.url !== tab.url) return;
        const latest = await selected(hint);
        if (!latest || latest.url !== frame.url) return;
        // A second document read detects replacement during the selection await. The
        // observation also spans this final await, including selection leave-and-return.
        const finalFrame = await api.webNavigation.getFrame({ tabId: hint.tabId, frameId: 0 });
        if (!observation.isCurrent() || !finalFrame || finalFrame.documentId !== frame.documentId
          || finalFrame.documentLifecycle !== 'active' || finalFrame.frameType !== 'outermost_frame'
          || finalFrame.parentFrameId !== -1 || finalFrame.errorOccurred || finalFrame.url !== latest.url) return;
        const receipt = { ...hint, documentId: frame.documentId };
        if (!isTabReceipt(receipt)) return;
        return Object.freeze({ receipt: Object.freeze(receipt), audible: latest.audible ?? false, pinned: latest.pinned });
      } catch { return; } finally { observation.dispose(); }
    }
  };
}
