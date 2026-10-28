import type { createControlService } from './controls';
import type { createConfigRepository } from '../config/repository';
import type { Config, ConfigState } from '../config/schema';
import type { createDiagnostics } from '../diagnostics/diagnostics';
import type { createNavigationTracker, Navigation, NavigationInput } from './navigation';
import type { createOperationQueue } from './operation-queue';

export type ConsumeContext = Readonly<{ config: Config; revision: number; isCurrent(): boolean }>;

type Dependencies = {
  config: ReturnType<typeof createConfigRepository>;
  controls?: ReturnType<typeof createControlService>;
  tracker: ReturnType<typeof createNavigationTracker>;
  queue: ReturnType<typeof createOperationQueue>;
  diagnostics: ReturnType<typeof createDiagnostics>;
  recovery?: { initialize(): Promise<void>; isReady(): boolean };
  consume: (event: Navigation, context: ConsumeContext) => Promise<void>;
};

export function createCoordinator({ config, tracker, queue, diagnostics, consume, recovery, controls }: Dependencies) {
  let state: ConfigState | undefined;
  let revision = 0;
  let disposed = false;
  let initialization: Promise<void> | undefined;

  function update(next: ConfigState): void {
    if (disposed) return;
    // The first publication makes startup ready; later publications revoke queued work.
    if (state !== undefined) ++revision;
    state = next;
    if (next.kind === 'unavailable') diagnostics.record({ code: 'configuration-unavailable' });
  }
  const unsubscribe = config.subscribe(update);

  function initialize(): Promise<void> {
    if (disposed) return Promise.resolve();
    initialization ??= Promise.all([controls ? controls.initialize() : config.load(), queue.run(async () => { await recovery?.initialize(); })]).then(([loaded]) => {
      if (disposed) return;
      if (state === undefined && loaded) update(loaded);
      diagnostics.record({ code: 'worker-started' });
    });
    return initialization;
  }

  return {
    initialize,
    async handle(input: NavigationInput): Promise<void> {
      if (disposed) return;
      // Observe before any await so lifecycle events can revoke this generation during load.
      const event = tracker.observe(input);
      if (!event) return;
      const observedRevision = revision;
      const observedGeneration = controls?.generation;
      diagnostics.record({ code: 'navigation-observed', sequence: event.observedSequence, tabId: event.tabId });
      await initialize();
      await queue.run(async () => {
        if (disposed || (recovery && !recovery.isReady()) || observedRevision !== revision || !tracker.isCurrent(event)
          || state?.kind !== 'ready' || !state.config.enabled) return;
        if (controls && observedGeneration !== controls.generation) return;
        const controlCapture = controls?.capture();
        if (controls && !controlCapture) return;
        const captured = config.getCurrent();
        if (captured?.state !== state) return;
        const capturedRevision = revision;
        const context: ConsumeContext = Object.freeze({config:state.config,revision:captured.revision,isCurrent() {
          const current = config.getCurrent();
          return !disposed && (!controls || !!controlCapture && controls.isCurrent(controlCapture)) && (!recovery || recovery.isReady()) && revision === capturedRevision && current?.revision === captured.revision
            && current.state === state && state?.kind === 'ready' && state.config.enabled && tracker.isCurrent(event);
        }});
        await consume(event, context);
      });
    },
    invalidate(tabId: number): void { tracker.invalidate(tabId); },
    replace(addedTabId: number, removedTabId: number): void { controls?.forget(removedTabId); tracker.replace(addedTabId, removedTabId); },
    forget(tabId: number): void { controls?.forget(tabId); tracker.forget(tabId); },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      ++revision;
      unsubscribe();
      controls?.dispose();
      config.dispose();
    },
  };
}
