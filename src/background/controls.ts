import type { createProtectionRepository } from '../protections/repository';
import type { ControlTargets, NativeControlTargets, TargetObservation } from '../browser/control-target';
import { isProtected, sameProtections } from '../protections/state';
import type { createConfigRepository } from '../config/repository';
import type { ConfigState } from '../config/schema';
import { parseControlCommand, isTargetHint, sameRules, type ControlCapture, type ControlReply, type ControlStatus, type TargetHint, type TabReceipt, type ProtectedIdentity } from '../controls/protocol';
import { createOperationQueue } from './operation-queue';

type Dependencies = {
  config: ReturnType<typeof createConfigRepository>;
  protections: ReturnType<typeof createProtectionRepository>;
  targets: ControlTargets;
  nativeTargets?: NativeControlTargets;
  whenReady?(): Promise<void>;
  workerId: string;
  runtime(): 'checking' | 'ready' | 'blocked';
};

/** The sole production config/protection writer. This queue never waits for native operations. */
export function createControlService({ config, protections, targets, nativeTargets, whenReady, workerId, runtime }: Dependencies) {
  const commands = createOperationQueue();
  const listeners = new Set<() => void>();
  let revision = 0;
  let generation = 0;
  let intent = 0;
  let pending = 0;
  let disposed = false;
  let configFailed = false;
  let protectionFailure: ProtectedIdentity | 'pause-required' | undefined;
  let initialized = false;
  let protectionStartupFailed = false;
  let initialization: Promise<void> | undefined;
  let state: ConfigState | undefined;
  let initialRead = false;
  let initialProtectionRead = false;
  const nativeObservations = new Set<TargetObservation>();
  const protectionIntents = new Map<number, number>();
  function sameIdentity(a: ProtectedIdentity, b: ProtectedIdentity): boolean {
    return a.tabId === b.tabId && a.incognito === b.incognito;
  }
  function failProtection(target?: ProtectedIdentity): void {
    protectionFailure = !target || protectionFailure === 'pause-required' || protectionFailure && !sameIdentity(protectionFailure, target)
      ? 'pause-required' : Object.freeze({ tabId: target.tabId, incognito: target.incognito });
  }
  const notify = () => { for (const listener of listeners) listener(); };
  function invalidate(): void { ++generation; notify(); }
  const unsubscribeInvalidation = config.subscribeInvalidation(() => {
    // Only the first load we initiate establishes readiness without discarding startup navigation.
    if (initialRead) { initialRead = false; return; }
    ++revision;
    invalidate();
  });
  const unsubscribe = config.subscribe(next => {
    if (state !== undefined) ++generation;
    state = next;
    ++revision;
    notify();
  });
  const unsubscribeProtection = protections.subscribe(notify);
  const unsubscribeProtectionInvalidation = protections.subscribeInvalidation(() => {
    if (initialProtectionRead) { initialProtectionRead = false; return; }
    ++revision;
    invalidate();
  });
  function getStatus(): ControlStatus {
    const current = config.getCurrent();
    const savedEnabled = state?.kind === 'ready' ? state.config.enabled : null;
    const readiness = runtime();
    const protection = protections.getCurrent();
    const phase = disposed || configFailed || protectionFailure !== undefined || protectionStartupFailed || current?.state.kind === 'unavailable' || protection?.state.kind === 'unavailable' ? 'unavailable'
      : !initialized || pending > 0 || !current || !protection || readiness === 'checking' ? 'checking'
      : readiness === 'blocked' ? 'blocked' : savedEnabled ? 'active' : 'paused';
    return Object.freeze({ version: Object.freeze({ workerId, revision }), phase, savedEnabled });
  }
  const reply = (kind: ControlReply['kind']): ControlReply => Object.freeze({ kind, status: getStatus() });
  function initialize(): Promise<void> {
    if (!initialization) {
      initialRead = true;
      const configReady = config.load();
      initialProtectionRead = true;
      const protectionReady = protections.load();
      initialization = Promise.all([configReady, protectionReady]).then(async () => {
        const before = protections.getCurrent();
        if (before?.state.kind === 'ready') {
          try {
            const live = await targets.list();
            // Only this exact synchronous initialization write is exempt. External changes during
            // either await have their own invalidation and cannot be masked by startup readiness.
            if (protections.getCurrent() === before) {
              const tabs = before.state.value.tabs.filter(tab => live.some(current => current.tabId === tab.tabId && current.incognito === tab.incognito));
              if (tabs.length !== before.state.value.tabs.length) {
                initialProtectionRead = true;
                if ((await protections.save({ version: 1, tabs })).kind !== 'ready') protectionStartupFailed = true;
              }
            }
          } catch { protectionStartupFailed = true; }
        }
        initialized = true; notify();
      });
    }
    return initialization;
  }
  function capture(): ControlCapture | undefined {
    if (getStatus().phase !== 'active') return;
    const current = config.getCurrent();
    const protection = protections.getCurrent();
    if (current?.state.kind !== 'ready' || protection?.state.kind !== 'ready') return;
    return Object.freeze({ generation, configRevision: current.revision, config: current.state.config, protectedTabs: protection.state.value.tabs });
  }
  function isCurrent(captured: ControlCapture): boolean {
    const current = config.getCurrent();
    return captured.generation === generation && current?.revision === captured.configRevision &&
      current.state.kind === 'ready' && current.state.config === captured.config && getStatus().phase === 'active';
  }
  function accept(target?: TargetHint) {
    const acceptedRevision = ++revision;
    if (target) protectionIntents.set(target.tabId, (protectionIntents.get(target.tabId) ?? 0) + 1);
    ++pending;
    invalidate();
    return { revision: acceptedRevision, generation };
  }
  function finish(target?: TargetHint): void {
    --pending;
    if (target) {
      const count = protectionIntents.get(target.tabId)! - 1;
      if (count) protectionIntents.set(target.tabId, count); else protectionIntents.delete(target.tabId);
    }
    notify();
  }
  function setNativeTabProtected(target: TargetHint, protectedValue: boolean): Promise<ControlReply> {
    if (typeof protectedValue !== 'boolean') return Promise.resolve(reply('invalid'));
    return changeNativeProtection(target, protectedValue);
  }
  function toggleNativeTabProtected(target: TargetHint): Promise<ControlReply> {
    return changeNativeProtection(target, 'toggle');
  }
  function changeNativeProtection(target: TargetHint, protectedValue: boolean | 'toggle'): Promise<ControlReply> {
    if (!isTargetHint(target)) return Promise.resolve(reply('invalid'));
    if (disposed || !nativeTargets) return Promise.resolve(reply('unavailable'));
    const hint = Object.freeze({ ...target });
    const capability = nativeTargets;
    const observation = capability.observe(hint);
    nativeObservations.add(observation);
    const accepted = accept(hint);
    // Observe and close admission synchronously. Recovery can wait for native work,
    // so it must settle outside this writer to leave a newer Pause responsive.
    return (async () => {
      let result: ControlReply['kind'] = 'unavailable';
      try {
        await Promise.all([initialize(), whenReady?.()]);
        result = await commands.run(async () => {
          // Owned initial reads/pruning do not advance generation. Everything else
          // keeps its original authority; readiness never freshens an abandoned click.
          if (disposed || generation !== accepted.generation || !observation.isCurrent()) return 'conflict';
          return setProtected({ target: hint, protected: protectedValue }, revision, capability, observation);
        });
      } catch { failProtection(hint); }
      finally {
        if (nativeObservations.delete(observation)) observation.dispose();
        finish(hint);
      }
      return reply(result);
    })();
  }
  function handle(raw: unknown): Promise<ControlReply> {
    const command = parseControlCommand(raw);
    if (!command) return Promise.resolve(reply('invalid'));
    if (command.kind === 'get-status') return command.target ? targetStatus(command.target) : Promise.resolve(reply('ok'));
    if (disposed) return Promise.resolve(reply('unavailable'));
    if (command.expected.workerId !== workerId || command.expected.revision !== revision) return Promise.resolve(reply('conflict'));

    // Accepted intent closes admission before either queueing or awaiting storage.
    // Rule edits must never supersede a queued pause. Their baseline is checked in the writer queue.
    const ticket = command.kind === 'set-enabled' ? ++intent : intent;
    const cancelled = () => disposed || command.kind === 'set-enabled' && ticket !== intent;
    const acceptedRevision = accept(command.kind === 'set-tab-protected' ? command.target : undefined).revision;
    return commands.run(async () => {
      const execute = async (): Promise<ControlReply['kind']> => {
        let result: ControlReply['kind'] = 'unavailable';
        try {
          await initialize();
          if (cancelled()) return 'conflict';
          if (command.kind === 'set-tab-protected') {
            const observation = targets.observe(command.target);
            try { return await setProtected(command, acceptedRevision, targets, observation, command.target); }
            finally { observation.dispose(); }
          }
          if (command.kind === 'set-enabled' && command.enabled) {
            if (revision !== acceptedRevision) return 'conflict';
            if (runtime() !== 'ready' || configFailed || protectionFailure !== undefined || protectionStartupFailed || protections.getCurrent()?.state.kind !== 'ready') return 'unavailable';
          }
          const beforeRead = config.getCurrent();
          await config.load();
          if (cancelled()) return 'conflict';
          const current = config.getCurrent();
          if (current?.state.kind !== 'ready') { configFailed = true; return 'unavailable'; }
          if (command.kind === 'set-enabled' && command.enabled) {
            if (!beforeRead || current.revision !== beforeRead.revision + 1) return 'conflict';
            if (runtime() !== 'ready' || configFailed || protectionFailure !== undefined || protectionStartupFailed || protections.getCurrent()?.state.kind !== 'ready') return 'unavailable';
          }
          const previous = current.state.config;
          if (command.kind === 'save-rules' && !sameRules(previous, command.baseRules)) return 'conflict';
          const candidate = command.kind === 'set-enabled' ? { ...previous, enabled: command.enabled }
            : { ...previous, ...command.rules };
          const written = await config.save(candidate);
          if (written.kind !== 'ready') { configFailed = true; return 'unavailable'; }
          await config.load();
          const verified = config.getCurrent();
          if (verified?.state.kind !== 'ready' || verified.state.config.enabled !== candidate.enabled || !sameRules(verified.state.config, candidate)) {
            configFailed = true;
            return 'unavailable';
          }
          // Completion cannot reopen admission while any newer command is pending.
          if (command.kind === 'set-enabled' && !command.enabled && !cancelled()) {
            configFailed = false;
            protectionFailure = undefined;
          }
          result = cancelled() ? 'conflict' : 'ok';
        } catch {
          if (command.kind === 'set-tab-protected') failProtection(command.target); else configFailed = true;
        }
        return result;
      };
      let result: ControlReply['kind'];
      try { result = await execute(); } finally {
        finish(command.kind === 'set-tab-protected' ? command.target : undefined);
      }
      return reply(result);
    });
  }
  function sameReceipt(a: TabReceipt | undefined, b: TabReceipt): boolean {
    return !!a && a.tabId === b.tabId && a.windowId === b.windowId && a.incognito === b.incognito && a.documentId === b.documentId;
  }
  async function targetStatus(hint: TargetHint): Promise<ControlReply> {
    const authority = generation;
    const target = await targets.read(hint);
    const protection = protections.getCurrent();
    if (disposed || authority !== generation || !target || !sameReceipt(target.receipt, { ...hint, documentId: target.receipt.documentId }) || protection?.state.kind !== 'ready') return reply('ok');
    return Object.freeze({ kind: 'ok', status: Object.freeze({ ...getStatus(), target: Object.freeze({ ...target,
      protected: isProtected({ id: hint.tabId, incognito: hint.incognito }, protection.state.value.tabs) }) }) });
  }
  async function setProtected(command: { target: TargetHint; protected: boolean | 'toggle' }, acceptedRevision: number, capability: NativeControlTargets, observation: TargetObservation, expectedReceipt?: TabReceipt): Promise<ControlReply['kind']> {
    if (command.protected !== true && revision !== acceptedRevision) return 'conflict';
    const configured = config.getCurrent();
    const current = protections.getCurrent();
    if (configured?.state.kind !== 'ready' || current?.state.kind !== 'ready' || protectionStartupFailed || runtime() !== 'ready') return 'unavailable';
    const authority = generation;
    const hint = { tabId: command.target.tabId, windowId: command.target.windowId, incognito: command.target.incognito };
    const target = await capability.read(hint);
    const receipt = expectedReceipt ?? target?.receipt;
    if (!observation.isCurrent() || disposed || generation !== authority || !receipt || !sameReceipt(target?.receipt, { ...hint, documentId: receipt.documentId })) return 'conflict';
    if (runtime() !== 'ready') return 'unavailable';
    const previous = current.state.value;
    // An identity in another privacy context is never transferred to the new context.
    if (previous.tabs.some(tab => tab.tabId === command.target.tabId && tab.incognito !== command.target.incognito)) return 'conflict';
    const protectedValue = command.protected === 'toggle' ? !isProtected({ id: hint.tabId, incognito: hint.incognito }, previous.tabs) : command.protected;
    const others = previous.tabs.filter(tab => tab.tabId !== command.target.tabId);
    const value = { version: 1 as const, tabs: protectedValue ? [...others, { tabId: command.target.tabId, incognito: command.target.incognito }] : others };
    if (value.tabs.length > 1000) return 'unavailable';
    const beforeWrite = generation;
    const written = await protections.save(value);
    const afterWrite = protections.getCurrent();
    if (written.kind !== 'ready' || afterWrite?.state.kind !== 'ready' || !sameProtections(afterWrite.state.value, value)) { failProtection(command.target); return 'unavailable'; }
    const settledGeneration = generation;
    const verified = await capability.read(hint);
    // Our save advances generation once. Any additional event or newer intent conflicts.
    if (!observation.isCurrent() || disposed || settledGeneration !== beforeWrite + 1 || generation !== settledGeneration || !sameReceipt(verified?.receipt, receipt)) {
      failProtection(command.target); return 'conflict';
    }
    if (runtime() !== 'ready') { failProtection(command.target); return 'unavailable'; }
    if (protectionFailure !== 'pause-required' && protectionFailure && sameIdentity(protectionFailure, command.target)) protectionFailure = undefined;
    return 'ok';
  }
  function getProtectedTabs(): readonly ProtectedIdentity[] | undefined {
    const phase = getStatus().phase;
    if (phase !== 'active' && phase !== 'paused') return;
    const current = protections.getCurrent();
    return current?.state.kind === 'ready' ? current.state.value.tabs : undefined;
  }
  function forget(tabId: number): Promise<void> {
    const known = protections.getLastKnown();
    if (!protectionIntents.has(tabId) && !(known?.state.kind === 'ready' && known.state.value.tabs.some(tab => tab.tabId === tabId))) return Promise.resolve();
    ++revision; ++pending; invalidate();
    return commands.run(async () => {
      try {
        await initialize();
        if (disposed) return;
        const current = protections.getCurrent();
        if (current?.state.kind !== 'ready') { failProtection(); return; }
        const tabs = current.state.value.tabs.filter(tab => tab.tabId !== tabId);
        if (tabs.length === current.state.value.tabs.length) return;
        if ((await protections.save({ version: 1, tabs })).kind !== 'ready') failProtection();
      } catch { failProtection(); } finally { --pending; notify(); }
    });
  }
  return {
    initialize, getStatus, handle, setNativeTabProtected, toggleNativeTabProtected, getProtectedTabs, capture, isCurrent, invalidate,
    get generation(): number { return generation; },
    // The navigation tracker owns removal leases; unprotected removals do not revoke controls.
    forget,
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose(): void { if (disposed) return; disposed = true; ++intent; for (const observation of nativeObservations) observation.dispose(); nativeObservations.clear(); invalidate(); unsubscribe(); unsubscribeInvalidation(); unsubscribeProtection(); unsubscribeProtectionInvalidation(); protections.dispose(); listeners.clear(); }
  };
}
