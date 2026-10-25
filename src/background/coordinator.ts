import type { createConfigRepository } from '../config/repository';
import type { ConfigState } from '../config/schema';
import type { createDiagnostics } from '../diagnostics/diagnostics';
import type { createNavigationTracker, Navigation, NavigationInput } from './navigation';
import type { createOperationQueue } from './operation-queue';

type Dependencies = {
  config: ReturnType<typeof createConfigRepository>;
  tracker: ReturnType<typeof createNavigationTracker>;
  queue: ReturnType<typeof createOperationQueue>;
  diagnostics: ReturnType<typeof createDiagnostics>;
  consume: (event: Navigation) => Promise<void>;
};

export function createCoordinator({ config, tracker, queue, diagnostics, consume }: Dependencies) {
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
    initialization ??= config.load().then((loaded) => {
      if (disposed) return;
      if (state === undefined) update(loaded);
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
      diagnostics.record({ code: 'navigation-observed', sequence: event.observedSequence, tabId: event.tabId });
      await initialize();
      await queue.run(async () => {
        if (disposed || observedRevision !== revision || !tracker.isCurrent(event)
          || state?.kind !== 'ready' || !state.config.enabled) return;
        await consume(event);
      });
    },
    invalidate(tabId: number): void { tracker.invalidate(tabId); },
    forget(tabId: number): void { tracker.forget(tabId); },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      ++revision;
      unsubscribe();
      config.dispose();
    },
  };
}
