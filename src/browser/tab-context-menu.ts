import { isTargetHint, type ControlReply, type ControlStatus, type TargetHint } from '../controls/protocol';

type Controls = {
  getStatus(): ControlStatus;
  setNativeTabProtected(target: TargetHint, protectedValue: boolean): Promise<ControlReply>;
};
const actions = [
  { id: 'chromeReHome.protectTab', title: 'Protect this tab', protectedValue: true },
  { id: 'chromeReHome.unprotectTab', title: 'Unprotect this tab', protectedValue: false },
] as const;

/** Tab-strip events are trusted worker input, never a selected-tab or runtime-message fallback. */
export function registerTabContextMenu(api: Pick<typeof chrome, 'contextMenus' | 'runtime'>, controls: Controls, reportFailure: () => void) {
  let running = false;
  let dirty = false;
  let failed = false;
  let registered = false;
  // Older runtimes reject this context; callback APIs retain Chrome 120 popup compatibility.
  const contexts: ['tab'] = ['tab'];
  function call(operation: (done: () => void) => void): Promise<boolean> {
    return new Promise(resolve => {
      try { operation(() => { resolve(!api.runtime.lastError); }); }
      catch { resolve(false); }
    });
  }
  async function reconcile(): Promise<void> {
    try {
      while (dirty && !failed) {
        dirty = false;
        const phase = controls.getStatus().phase;
        const enabled = phase === 'active' || phase === 'paused';
        for (const action of actions) {
          const properties = { title: action.title, contexts, enabled };
          const updated = await call(done => { api.contextMenus.update(action.id, properties, done); });
          if (updated) continue;
          // On a fresh install these IDs do not exist. Existing IDs survive worker
          // suspension, so successful updates must never create duplicates.
          if (!registered && await call(done => { api.contextMenus.create({ id: action.id, ...properties }, done); })) continue;
          failed = true;
          reportFailure();
          break;
        }
        registered = !failed;
      }
      if (failed) for (const action of actions) await call(done => { api.contextMenus.remove(action.id, done); });
    } finally { running = false; }
  }
  function refresh(): void {
    if (failed) return;
    dirty = true;
    if (running) return;
    running = true;
    void reconcile();
  }
  function onClicked(info: unknown, tab: unknown): void {
    if (!info || typeof info !== 'object' || Array.isArray(info) || !('menuItemId' in info)) return;
    const action = actions.find(action => action.id === info.menuItemId);
    if (!action || !tab || typeof tab !== 'object' || Array.isArray(tab)) return;
    const value = tab as Partial<chrome.tabs.Tab>;
    const hint = { tabId: value.id, windowId: value.windowId, incognito: value.incognito };
    if (!isTargetHint(hint)) return;
    // Admission/observation happen synchronously inside the control service,
    // including the first click waking a suspended worker. No readiness await here.
    try { void controls.setNativeTabProtected(hint, action.protectedValue).catch(() => { reportFailure(); }); }
    catch { reportFailure(); }
  }
  api.contextMenus.onClicked.addListener(onClicked);
  api.runtime.onInstalled.addListener(refresh);
  api.runtime.onStartup.addListener(refresh);
  refresh();
  return { refresh };
}
