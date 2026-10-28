import type { createConfigRepository } from '../config/repository';
import type { ConfigState } from '../config/schema';
import { parseControlCommand, sameRules, type ControlCapture, type ControlReply, type ControlStatus } from '../controls/protocol';
import { createOperationQueue } from './operation-queue';

type Dependencies = {
  config: ReturnType<typeof createConfigRepository>;
  workerId: string;
  runtime(): 'checking' | 'ready' | 'blocked';
};

/** The sole production config writer. This queue never waits for native operations. */
export function createControlService({ config, workerId, runtime }: Dependencies) {
  const commands = createOperationQueue();
  const listeners = new Set<() => void>();
  let revision = 0;
  let generation = 0;
  let intent = 0;
  let pending = 0;
  let disposed = false;
  let failed = false;
  let initialized = false;
  let initialization: Promise<void> | undefined;
  let state: ConfigState | undefined;
  let initialRead = false;
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
  function getStatus(): ControlStatus {
    const current = config.getCurrent();
    const savedEnabled = state?.kind === 'ready' ? state.config.enabled : null;
    const readiness = runtime();
    const phase = disposed || failed || current?.state.kind === 'unavailable' ? 'unavailable'
      : !initialized || pending > 0 || !current || readiness === 'checking' ? 'checking'
      : readiness === 'blocked' ? 'blocked' : savedEnabled ? 'active' : 'paused';
    return Object.freeze({ version: Object.freeze({ workerId, revision }), phase, savedEnabled });
  }
  const reply = (kind: ControlReply['kind']): ControlReply => Object.freeze({ kind, status: getStatus() });
  function initialize(): Promise<void> {
    if (!initialization) {
      initialRead = true;
      initialization = config.load().then(() => { initialized = true; notify(); });
    }
    return initialization;
  }
  function capture(): ControlCapture | undefined {
    if (getStatus().phase !== 'active') return;
    const current = config.getCurrent();
    if (current?.state.kind !== 'ready') return;
    return Object.freeze({ generation, configRevision: current.revision, config: current.state.config, protectedTabs: Object.freeze([]) });
  }
  function isCurrent(captured: ControlCapture): boolean {
    const current = config.getCurrent();
    return captured.generation === generation && current?.revision === captured.configRevision &&
      current.state.kind === 'ready' && current.state.config === captured.config && getStatus().phase === 'active';
  }
  function handle(raw: unknown): Promise<ControlReply> {
    const command = parseControlCommand(raw);
    if (!command) return Promise.resolve(reply('invalid'));
    if (command.kind === 'get-status') return Promise.resolve(reply('ok'));
    if (disposed) return Promise.resolve(reply('unavailable'));
    if (command.expected.workerId !== workerId || command.expected.revision !== revision) return Promise.resolve(reply('conflict'));
    if (command.kind === 'set-tab-protected') return Promise.resolve(reply('unavailable'));
    // Accepted intent closes admission before either queueing or awaiting storage.
    // Rule edits must never supersede a queued pause. Their baseline is checked in the writer queue.
    const ticket = command.kind === 'set-enabled' ? ++intent : intent;
    const cancelled = () => disposed || command.kind === 'set-enabled' && ticket !== intent;
    const acceptedRevision = ++revision;
    ++pending;
    invalidate();
    return commands.run(async () => {
      const execute = async (): Promise<ControlReply['kind']> => {
        let result: ControlReply['kind'] = 'unavailable';
        try {
          await initialize();
          if (cancelled()) return 'conflict';
          if (command.kind === 'set-enabled' && command.enabled) {
            if (revision !== acceptedRevision) return 'conflict';
            if (runtime() !== 'ready' || failed) return 'unavailable';
          }
          const beforeRead = config.getCurrent();
          await config.load();
          if (cancelled()) return 'conflict';
          const current = config.getCurrent();
          if (current?.state.kind !== 'ready') { failed = true; return 'unavailable'; }
          if (command.kind === 'set-enabled' && command.enabled) {
            if (!beforeRead || current.revision !== beforeRead.revision + 1) return 'conflict';
            if (runtime() !== 'ready' || failed) return 'unavailable';
          }
          const previous = current.state.config;
          if (command.kind === 'save-rules' && !sameRules(previous, command.baseRules)) return 'conflict';
          const candidate = command.kind === 'set-enabled' ? { ...previous, enabled: command.enabled }
            : { ...previous, ...command.rules };
          const written = await config.save(candidate);
          if (written.kind !== 'ready') { failed = true; return 'unavailable'; }
          await config.load();
          const verified = config.getCurrent();
          if (verified?.state.kind !== 'ready' || verified.state.config.enabled !== candidate.enabled || !sameRules(verified.state.config, candidate)) {
            failed = true;
            return 'unavailable';
          }
          // Completion cannot reopen admission while any newer command is pending.
          failed = false;
          result = cancelled() ? 'conflict' : 'ok';
        } catch { failed = true; }
        return result;
      };
      let result: ControlReply['kind'];
      try { result = await execute(); } finally { --pending; notify(); }
      return reply(result);
    });
  }
  return {
    initialize, getStatus, handle, capture, isCurrent, invalidate,
    get generation(): number { return generation; },
    // The navigation tracker owns removal leases; unprotected removals do not revoke controls.
    forget(_tabId: number): void {},
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose(): void { if (disposed) return; disposed = true; ++intent; invalidate(); unsubscribe(); unsubscribeInvalidation(); listeners.clear(); }
  };
}
