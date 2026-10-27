import { createNavigationTracker, type NavigationInput } from '../../src/background/navigation';
import { registerEvents } from '../../src/background/register-events';
import { createCoordinator } from '../../src/background/coordinator';
import { createOperationQueue } from '../../src/background/operation-queue';
import { createConfigRepository } from '../../src/config/repository';
import { createDiagnostics } from '../../src/diagnostics/diagnostics';
import { createSnapshotReader } from '../../src/browser/snapshots';
import { selectCandidates } from '../../src/planning/candidates';
import { compileDuplicateRules } from '../../src/rules/duplicates';

const tracker = createNavigationTracker();
const trace: Array<NavigationInput & { eligible: boolean; sequence?: number }> = [];
const failures: string[] = [];
const replacements: Array<{ addedTabId: number; removedTabId: number }> = [];
const coordinator = createCoordinator({ tracker, queue: createOperationQueue(), diagnostics: createDiagnostics(),
  config: createConfigRepository({ read: async () => ({ schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] }),
    write: async () => {}, subscribe: () => () => {} }), consume: async () => {} });
const observed = { ...coordinator, replace(addedTabId: number, removedTabId: number) {
  replacements.push({ addedTabId, removedTabId });
  coordinator.replace(addedTabId, removedTabId);
}, handle(input: NavigationInput) {
  const before = tracker.view().revision;
  const pending = coordinator.handle(input);
  const view = tracker.view();
  const event = view.navigations.find((event) => event.tabId === input.tabId);
  const eligible = view.revision !== before && event !== undefined;
  trace.push({ ...input, eligible, ...(eligible ? { sequence: event.observedSequence } : {}) });
  return pending;
} };
registerEvents(chrome, observed, () => { failures.push('handler-failed'); });
void coordinator.initialize();
const compiler = compileDuplicateRules([]);
if (compiler.kind !== 'ready') throw Error('Invalid fixture rules');
const identity = compiler;
const reader = createSnapshotReader(chrome);
const fixture = {
  trace,
  replacements,
  failures,
  realm: crypto.randomUUID(),
  state() {
    const view = tracker.view();
    return { revision: view.revision, blockedTabIds: view.blockedTabIds,
      navigations: view.navigations.map(({ epoch: _, ...event }) => event) };
  },
  async select(tabId: number) {
    const view = tracker.view();
    const trigger = view.navigations.find((event) => event.tabId === tabId);
    const snapshot = await reader.read({ kind: 'all-normal-windows' });
    if (!tracker.isViewCurrent(view)) return { kind: 'stale-view' };
    if (!trigger) return { kind: 'missing-trigger' };
    const result = selectCandidates(trigger, snapshot.tabs, view, identity);
    return result.kind === 'skip' ? result : { kind: result.kind, winner: result.winner.id,
      anchor: result.anchor.id, duplicates: result.duplicates.map((tab) => tab.id), revision: result.revision };
  },
};
declare global { var navigationFixture: typeof fixture; }
globalThis.navigationFixture = fixture;
