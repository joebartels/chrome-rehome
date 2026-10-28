import { createControlTargets } from '../../src/browser/control-target';
export const targetHint = { tabId: 7, windowId: 10, incognito: false };
function event() {
  const listeners = new Set<(...args: any[]) => void>();
  return { listeners, addListener(fn: (...args: any[]) => void) { listeners.add(fn); }, removeListener(fn: (...args: any[]) => void) { listeners.delete(fn); }, emit(...args: any[]) { for (const fn of listeners) fn(...args); } };
}
export function targetFixture() {
  let tab: any = { id: 7, windowId: 10, incognito: false, active: true, pinned: false, audible: false, url: 'https://example.test/' };
  let frame: any = { documentId: 'doc', url: tab.url, documentLifecycle: 'active', frameType: 'outermost_frame', parentFrameId: -1, errorOccurred: false };
  const queries: unknown[] = []; let afterDocument = () => {};
  let boundary = async (_kind: 'selection' | 'document' | 'list') => {};
  const tabs = { onActivated: event(), onAttached: event(), onDetached: event(), onRemoved: event(), onReplaced: event(), onUpdated: event() };
  const navigation = { onBeforeNavigate: event(), onCommitted: event(), onTabReplaced: event(), onHistoryStateUpdated: event() };
  const api = { tabs: { ...tabs, query: async (query: any) => { queries.push(query); const snapshot = tab ? [{ ...tab }] : []; await boundary(query.active ? 'selection' : 'list'); return snapshot; } },
    webNavigation: { ...navigation, getFrame: async () => { const snapshot = frame ? { ...frame } : undefined; afterDocument(); await boundary('document'); return snapshot; } } } as unknown as Pick<typeof chrome, 'tabs' | 'webNavigation'>;
  const port = createControlTargets(api);
  return { api, port, queries, tabs, navigation,
    listeners() { return [...Object.values(tabs), ...Object.values(navigation)].reduce((sum, entry) => sum + entry.listeners.size, 0); },
    get tab() { return tab; }, set tab(next) { tab = next; }, get frame() { return frame; }, set frame(next) { frame = next; },
    after(fn: () => void) { afterDocument = fn; }, boundary(fn: typeof boundary) { boundary = fn; }
  };
}
