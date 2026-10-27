import type { createDiagnostics } from '../diagnostics/diagnostics';
import { createReplacementExecutor, type ReplacementPort } from '../execution/replacement';
import type { createReplacementJournal } from '../execution/journal';
import { selectCandidates } from '../planning/candidates';
import { planReplacement, type PlacementDocument } from '../planning/replacement';
import { compileDuplicateRules } from '../rules/duplicates';
import { compileGroupingRules } from '../rules/grouping';
import type { ConsumeContext } from './coordinator';
import type { createNavigationTracker, Navigation } from './navigation';

export function createPlacementConsumer({ tracker, port, journal, diagnostics }: {
  tracker: ReturnType<typeof createNavigationTracker>;
  port: ReplacementPort;
  journal: ReturnType<typeof createReplacementJournal>;
  diagnostics: ReturnType<typeof createDiagnostics>;
}): (event: Navigation, context: ConsumeContext) => Promise<void> {
  const executor = createReplacementExecutor({ port, journal });
  return async (event, context) => {
    const view = tracker.view();
    const guard = {
      isCurrent: () => context.isCurrent() && tracker.isCurrent(event) && tracker.isViewCurrent(view)
    };
    if (!guard.isCurrent() || !context.config.enabled) return;
    const identity = compileDuplicateRules(context.config.duplicateRules);
    const grouping = compileGroupingRules(context.config.groupingRules);
    if (identity.kind !== 'ready' || grouping.kind !== 'ready') return;

    try {
      const snapshot = await port.read();
      if (!guard.isCurrent()) return;
      const selection = selectCandidates(event, snapshot.tabs, view, identity, { allowNoDuplicates: true });
      if (selection.kind === 'skip') return;
      const groupTitle = grouping.match(selection.winner.url!)?.group;
      const ids = [
        selection.winner.id,
        ...(selection.kind === 'selected' ? [selection.anchor.id] : [])
      ];
      const documents: PlacementDocument[] = [];
      for (const id of ids) {
        if (!guard.isCurrent()) return;
        const document = await port.readDocument(id);
        if (!guard.isCurrent()) return;
        if (document) documents.push(document);
      }
      const plan = planReplacement({
        selection,
        view,
        snapshot,
        documents,
        identity,
        configRevision: context.revision,
        ...(groupTitle === undefined ? {} : { groupTitle })
      });
      if (plan.kind === 'skip' || !guard.isCurrent()) return;
      const lease = tracker.createRemovalLease(view, plan.duplicates.map(participant => participant.tab.id));
      try {
        const result = await executor.execute(plan, {
          isCurrent: () => context.isCurrent() && tracker.isCurrent(event) && lease.isCurrent() && !journal.isBlocked(),
          expectRemoval: id => lease.expectRemoval(id)
        });
        if (result.kind === 'stopped') diagnostics.record({ code: 'operation-failed' });
      } finally {
        lease.dispose();
      }
    } catch {
      diagnostics.record({ code: 'operation-failed' });
    }
  };
}
