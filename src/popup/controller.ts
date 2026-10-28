import type { ControlReply, ControlStatus, ControlVersion, TabReceipt, TargetHint } from '../controls/protocol';

type Client = {
  getStatus(target?: TargetHint): Promise<ControlReply>;
  setEnabled(expected: ControlVersion, enabled: boolean): Promise<ControlReply>;
  setTabProtected(expected: ControlVersion, target: TabReceipt, value: boolean): Promise<ControlReply>;
};
export type PopupState = Readonly<{
  status?: ControlStatus | undefined;
  target?: ControlStatus['target'] | undefined;
  targetChecking: boolean;
  busy: boolean;
  message: string;
}>;
export function createPopupController(deps: {
  client: Client;
  currentTarget(): Promise<TargetHint | undefined>;
  openSettings(): Promise<void>;
  subscribe(listener: () => void): () => void;
}) {
  let state: PopupState = Object.freeze({ targetChecking: true, busy: false, message: '' });
  let disposed = false;
  let reads = 0;
  let operation = 0;
  const listeners = new Set<(state: PopupState) => void>();
  function publish(next: PopupState): void {
    if (disposed) return;
    state = Object.freeze(next);
    for (const listener of listeners) listener(state);
  }
  function global(status: ControlStatus): ControlStatus {
    return Object.freeze({ version: Object.freeze({ ...status.version }), phase: status.phase, savedEnabled: status.savedEnabled });
  }
  function unavailable(): void {
    publish({ ...state, ...(state.status ? { status: { ...state.status, phase: 'unavailable' } } : {}),
      target: undefined, targetChecking: false, message: 'Status unavailable. Refresh to reconnect. No command was retried.' });
  }
  async function refresh(): Promise<void> {
    if (disposed) return;
    const request = ++reads;
    publish({ ...state, ...(state.status ? { status: { ...state.status, phase: 'checking' } } : {}), target: undefined, targetChecking: true });
    const current = () => !disposed && reads === request;
    // The global read must render without waiting for document/selection lookup.
    const globalRead = deps.client.getStatus().then(reply => {
      if (!current()) return;
      if (state.status?.version.workerId === reply.status.version.workerId && state.status.version.revision > reply.status.version.revision) return;
      publish({ ...state, status: global(reply.status) });
    }).catch(() => { if (current()) unavailable(); });
    try {
      const hint = await deps.currentTarget();
      if (!current()) return;
      const reply = hint ? await deps.client.getStatus(hint) : undefined;
      await globalRead;
      if (!current()) return;
      const receipt = reply?.status.target?.receipt;
      const matches = hint && receipt && receipt.tabId === hint.tabId && receipt.windowId === hint.windowId && receipt.incognito === hint.incognito;
      const version = reply?.status.version;
      if (reply && matches && version?.workerId === state.status?.version.workerId && version!.revision >= state.status!.version.revision) {
        publish({ ...state, status: global(reply.status), target: Object.freeze({ ...reply.status.target!, receipt: Object.freeze({ ...receipt! }) }), targetChecking: false });
      } else publish({ ...state, target: undefined, targetChecking: false });
    } catch {
      await globalRead;
      if (current()) publish({ ...state, target: undefined, targetChecking: false });
    }
  }
  async function mutate(send: () => Promise<ControlReply>, expected: ControlVersion): Promise<void> {
    const id = ++operation;
    ++reads;
    publish({ ...state, busy: true, target: undefined, message: 'Applying change…' });
    try {
      const reply = await send();
      if (disposed || id !== operation) return;
      const changed = reply.status.version.workerId !== expected.workerId || state.status?.version.workerId !== expected.workerId ||
        state.status.version.revision > reply.status.version.revision;
      publish({ ...state, ...(!changed ? { status: global(reply.status) } : {}), message: changed || reply.kind === 'conflict'
        ? 'State changed. Review the refreshed status before trying again.'
        : reply.kind !== 'ok' ? 'Change could not be verified. Review status; no command was retried.' : '' });
      await refresh();
    } catch {
      if (!disposed && id === operation) { ++reads; unavailable(); }
    } finally {
      if (!disposed && id === operation) publish({ ...state, busy: false });
    }
  }
  const detach = deps.subscribe(() => { void refresh(); });
  return {
    getState: () => state,
    subscribe(listener: (state: PopupState) => void) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    refresh,
    async setEnabled(enabled: boolean): Promise<void> {
      if (disposed || state.busy || !state.status || enabled && state.status.phase !== 'paused') return;
      const expected = state.status.version;
      await mutate(() => deps.client.setEnabled(expected, enabled), expected);
    },
    async protect(value: boolean): Promise<void> {
      if (disposed || state.busy || !state.status || !['active', 'paused'].includes(state.status.phase) || !state.target) return;
      const expected = state.status.version;
      const receipt = state.target.receipt;
      const id = ++operation;
      publish({ ...state, busy: true });
      try {
        const hint = await deps.currentTarget();
        if (disposed || id !== operation) return;
        if (!state.target || state.target.receipt !== receipt || !hint || hint.tabId !== receipt.tabId || hint.windowId !== receipt.windowId || hint.incognito !== receipt.incognito) {
          publish({ ...state, message: 'Current tab changed. Review the refreshed tab before trying again.' });
          await refresh(); return;
        }
        await mutate(() => deps.client.setTabProtected(expected, receipt, value), expected);
      } catch { if (!disposed) unavailable(); }
      finally { if (!disposed) publish({ ...state, busy: false }); }
    },
    async openSettings(): Promise<void> {
      try { await deps.openSettings(); }
      catch { publish({ ...state, message: 'Could not open settings. Try again.' }); }
    },
    dispose() { if (disposed) return; disposed = true; ++reads; ++operation; detach(); listeners.clear(); },
  };
}
