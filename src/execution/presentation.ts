import { coherentPresentation, copyPresentation, type PresentationState } from '../planning/presentation';
import type { ReplacementPlan } from '../planning/replacement';
import type { MutationPhase, PlacementPort } from './placement';

export function samePresentation(actual: PresentationState | undefined, expected: PresentationState): boolean {
  return coherentPresentation(actual) && actual.focusedWindowId === expected.focusedWindowId
    && actual.activeTabs.length === expected.activeTabs.length
    && expected.activeTabs.every(entry=>actual.activeTabs.some(next=>next.windowId === entry.windowId && next.tabId === entry.tabId));
}

// A receipt is rebased only for the bounded native effects of an issued mutation.
// Snapshots cannot distinguish a user choosing the same native successor, away-and-back
// actions between observations, or changes in the final check-to-call interval.
export function createPresentationReceipt(plan: ReplacementPlan, port: PlacementPort, invalid: Error) {
  let receipt = plan.presentation.kind === 'foreground' ? copyPresentation(plan.presentation.initial) : undefined;
  const winnerId = plan.winner.tab.id;
  const sourceId = plan.winner.tab.windowId;
  const destinationId = plan.destination.kind === 'unchanged' ? sourceId : plan.destination.windowId;
  async function observe(): Promise<PresentationState> {
    const state = await port.readPresentation();
    if (!coherentPresentation(state)) throw invalid;
    return state;
  }
  return {
    current: () => receipt,
    async check(): Promise<void> {
      if (receipt && !samePresentation(await observe(), receipt)) throw invalid;
    },
    async settled(kind: MutationPhase, previousWindowId: number): Promise<void> {
      if (!receipt) return;
      const actual = await observe();
      let expected: PresentationState = receipt;
      if (kind === 'activate') {
        expected = {...receipt,activeTabs:receipt.activeTabs.map(entry=>entry.windowId === destinationId ? {...entry,tabId:winnerId} : entry)};
      } else if (kind === 'focus') {
        expected = {...receipt,focusedWindowId:destinationId};
      } else if (kind === 'move' && previousWindowId !== destinationId) {
        const successors = plan.baseline.tabs.filter(tab=>tab.windowId === sourceId && tab.id !== winnerId);
        const source = actual.activeTabs.find(entry=>entry.windowId === sourceId);
        if (successors.length) {
          if (!source || !successors.some(tab=>tab.id === source.tabId) || actual.focusedWindowId !== sourceId) throw invalid;
          expected = {...receipt,activeTabs:receipt.activeTabs.map(entry=>entry.windowId === sourceId ? source : entry)};
        } else {
          if (source || actual.focusedWindowId !== destinationId) throw invalid;
          expected = {...receipt,focusedWindowId:destinationId,activeTabs:receipt.activeTabs.filter(entry=>entry.windowId !== sourceId)};
        }
      }
      if (!samePresentation(actual, expected)) throw invalid;
      receipt = copyPresentation(actual);
    },
    satisfied(): boolean {
      return !receipt || receipt.focusedWindowId === destinationId
        && receipt.activeTabs.some(entry=>entry.windowId === destinationId && entry.tabId === winnerId);
    }
  };
}
