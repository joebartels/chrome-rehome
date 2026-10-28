import { expect, test, vi } from 'vitest';
import { createPopupController } from '../../src/popup/controller';
import type { ControlReply, ControlStatus, TargetHint } from '../../src/controls/protocol';
const hint = { tabId: 1, windowId: 2, incognito: false };
const target = { receipt: { ...hint, documentId: 'doc' }, protected: false, audible: true, pinned: true };
const status = (phase: ControlStatus['phase'] = 'paused', revision = 1): ControlStatus => ({ version: { workerId: 'worker', revision }, phase, savedEnabled: phase === 'active' });
const reply = (value: ControlStatus): ControlReply => ({ kind: 'ok', status: value });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (cause: unknown) => void; const promise = new Promise<T>((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function setup() {
  let value = status(); let selected: TargetHint | undefined = hint; let notify = () => {};
  const client = { getStatus: vi.fn(async (h?: TargetHint) => reply({ ...value, ...(h ? { target } : {}) })),
    setEnabled: vi.fn(async (_: unknown, enabled: boolean) => { value = { ...status(enabled ? 'active' : 'paused', value.version.revision + 1), savedEnabled: enabled }; return reply(value); }),
    setTabProtected: vi.fn(async () => reply(value)) };
  const openSettings = vi.fn(async () => {}); const detach = vi.fn();
  const controller = createPopupController({ client, currentTarget: async () => selected, openSettings, subscribe(listener) { notify = listener; return detach; } });
  return { controller, client, openSettings, detach, notify: () => notify(), select: (h?: TargetHint) => { selected=h; }, state: (s: ControlStatus) => { value=s; } };
}
test('global status renders while the selected document remains unresolved', async () => {
  const s=setup(); const pending=deferred<ControlReply>(); s.client.getStatus.mockImplementation(async h => h ? pending.promise : reply(status('active')));
  const refresh=s.controller.refresh(); await vi.waitFor(() => expect(s.controller.getState().status?.phase).toBe('active'));
  expect(s.controller.getState().target).toBeUndefined(); pending.resolve(reply({ ...status('active'), target })); await refresh;
  expect(s.controller.getState().target).toEqual(target); s.controller.dispose();
});
test('paused known readiness permits manual protection without enabling the master; global mutation fetches fresh target', async () => {
  const s=setup(); await s.controller.refresh(); await s.controller.protect(true);
  expect(s.client.setTabProtected).toHaveBeenCalledWith(status().version, target.receipt, true); expect(s.client.setEnabled).not.toHaveBeenCalled();
  await s.controller.setEnabled(true); expect(s.client.setEnabled).toHaveBeenCalledWith(status().version,true);
  expect(s.controller.getState().status?.phase).toBe('active'); expect(s.client.getStatus).toHaveBeenLastCalledWith(hint); s.controller.dispose();
});
test.each([null,false,true])('known worker keeps explicit Pause available when unavailable saved=%s', async savedEnabled => {
  const s=setup(); s.state({ ...status('unavailable'), savedEnabled }); await s.controller.refresh(); await s.controller.setEnabled(true);
  expect(s.client.setEnabled).not.toHaveBeenCalled(); await s.controller.setEnabled(false); expect(s.client.setEnabled).toHaveBeenCalledWith(status().version,false); s.controller.dispose();
});
test('blocked recovery offers no Resume/protection and cannot claim active from saved enabled', async () => {
  const s=setup(); s.state({ ...status('blocked'), savedEnabled:true }); await s.controller.refresh();
  await s.controller.setEnabled(true); await s.controller.protect(true); expect(s.client.setEnabled).not.toHaveBeenCalled(); expect(s.client.setTabProtected).not.toHaveBeenCalled(); s.controller.dispose();
});
test('changed selection rejects displayed receipt before sending and refreshes without replay', async () => {
  const s=setup(); await s.controller.refresh(); s.select({ ...hint,tabId:3 }); await s.controller.protect(false);
  expect(s.client.setTabProtected).not.toHaveBeenCalled(); expect(s.controller.getState().message).toMatch(/changed/i); s.controller.dispose();
});
test('disconnect clears target and truthful state, retains safe Pause, and never retries', async () => {
  const s=setup(); await s.controller.refresh(); s.client.setEnabled.mockRejectedValue(Error('secret page URL'));
  await s.controller.setEnabled(true); expect(s.client.setEnabled).toHaveBeenCalledTimes(1);
  expect(s.controller.getState().status?.phase).toBe('unavailable'); expect(s.controller.getState().target).toBeUndefined();
  expect(s.controller.getState().message).not.toContain('secret'); s.controller.dispose();
});
test('older responses and disposed operations do not publish; event hints clear stale receipts', async () => {
  const s=setup(); await s.controller.refresh(); const old=deferred<ControlReply>(); s.client.getStatus.mockImplementationOnce(() => old.promise);
  const refresh=s.controller.refresh(); s.state(status('active',2)); await s.controller.refresh(); old.resolve(reply(status())); await refresh;
  expect(s.controller.getState().status?.phase).toBe('active'); s.notify(); expect(s.controller.getState().target).toBeUndefined();
  s.controller.dispose(); const snapshot=s.controller.getState(); await Promise.resolve(); expect(s.controller.getState()).toEqual(snapshot); expect(s.detach).toHaveBeenCalledOnce();
});
test('conflict and changed worker replies never report success or replay commands', async () => {
  const s=setup(); await s.controller.refresh(); s.client.setEnabled.mockResolvedValue({ kind:'conflict', status:{ ...status(),version:{workerId:'new-worker',revision:0} } });
  await s.controller.setEnabled(true); expect(s.client.setEnabled).toHaveBeenCalledOnce(); expect(s.controller.getState().message).toMatch(/changed|conflict/i); s.controller.dispose();
});
test('unsupported current tab preserves global Pause and settings; busy blocks duplicate commands', async () => {
  const s=setup(); s.select(); await s.controller.refresh(); expect(s.controller.getState().target).toBeUndefined();
  const pending=deferred<ControlReply>(); s.client.setEnabled.mockImplementationOnce(() => pending.promise); const command=s.controller.setEnabled(false);
  await s.controller.setEnabled(false); expect(s.client.setEnabled).toHaveBeenCalledOnce(); await s.controller.openSettings(); expect(s.openSettings).toHaveBeenCalledOnce();
  pending.resolve(reply(status())); await command; s.controller.dispose();
});

test('late mutation reply from an obsolete worker cannot overwrite the new worker status', async () => {
  const s=setup(); await s.controller.refresh(); const pending=deferred<ControlReply>(); s.client.setEnabled.mockImplementationOnce(()=>pending.promise);
  const phases:string[]=[]; const detach=s.controller.subscribe(value=>{if(value.status)phases.push(value.status.phase);});
  const command=s.controller.setEnabled(true);
  s.state({...status('paused',0),version:{workerId:'new-worker',revision:0}}); await s.controller.refresh(); phases.length=0;
  pending.resolve(reply(status('active',2))); await command;
  expect(phases).not.toContain('active'); expect(s.controller.getState().message).toMatch(/changed/i); expect(s.client.setEnabled).toHaveBeenCalledOnce(); detach(); s.controller.dispose();
});
test('disposal while a mutation settles cannot publish or read again', async () => {
  const s=setup(); await s.controller.refresh(); const pending=deferred<ControlReply>(); s.client.setEnabled.mockImplementationOnce(()=>pending.promise);
  const command=s.controller.setEnabled(true); s.controller.dispose(); const reads=s.client.getStatus.mock.calls.length; const snapshot=s.controller.getState();
  pending.resolve(reply(status('active',2))); await command; expect(s.client.getStatus).toHaveBeenCalledTimes(reads); expect(s.controller.getState()).toEqual(snapshot);
});
