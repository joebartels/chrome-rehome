import { samePresentation } from './presentation';
import { createPlacementExecutor, type PlacementGuard, type PlacementPort, type PlacementResult } from './placement';
import type { createReplacementJournal, JournalParticipant } from './journal';
import { coherentSnapshot, validDocument, type PlacementDocument, type PlacementSnapshot, type ReplacementPlan } from '../planning/replacement';
import type { CandidateTab } from '../planning/candidates';

export type ReplacementPort = PlacementPort & { removeTab(tabId: number): Promise<void> };
export type ReplacementGuard = PlacementGuard & { expectRemoval(tabId: number): void };
export type ReplacementResult =
  | Readonly<{ kind: 'completed'; placement: PlacementResult; removedTabIds: readonly number[]; closure: 'completed' | 'ineligible' }>
  | Readonly<{ kind: 'stopped'; phase: 'evidence' | 'journal' | 'placement' | 'closure'; cause?: unknown;
    placement?: PlacementResult; removedTabIds: readonly number[]; uncertainRemovalId?: number }>;

function sameTab(tab: CandidateTab, expected: CandidateTab): boolean {
  return tab.id === expected.id && tab.windowId === expected.windowId && tab.index === expected.index
    && tab.groupId === expected.groupId && tab.url === expected.url && tab.incognito === expected.incognito
    && tab.pinned === expected.pinned && ('pendingUrl' in tab) === ('pendingUrl' in expected)
    && tab.pendingUrl === expected.pendingUrl;
}

export function createReplacementExecutor({ port, journal }: {
  port: ReplacementPort;
  journal: ReturnType<typeof createReplacementJournal>;
}) {
  return {
    async execute(plan: ReplacementPlan, guard: ReplacementGuard): Promise<ReplacementResult> {
      const invalid = new Error('Replacement state changed.');
      const removed: number[] = [];
      const documents = new Map<number, PlacementDocument>();
      const windows = new Set([plan.winner.tab.windowId, ...plan.duplicates.map(p => p.tab.windowId),
        ...(plan.destination.kind === 'unchanged' ? [] : [plan.destination.windowId])]);
      let phase: Extract<ReplacementResult, { kind: 'stopped' }>['phase'] = 'evidence';
      let placement: PlacementResult | undefined;
      let begun = false;
      let uncertainRemovalId: number | undefined;
      let closureEligible = plan.closureEligible;
      function check(): void {
        if (!guard.isCurrent() || journal.isBlocked()) throw invalid;
      }
      // The expected state is always the verified receipt minus our verified removals.
      // In particular, a new snapshot never rebases participant locations or survivor order.
      function validate(snapshot: PlacementSnapshot, receipt: PlacementSnapshot, absent: readonly number[]): void {
        if (!coherentSnapshot(snapshot)) throw invalid;
        for (const participant of [plan.winner, ...plan.duplicates]) {
          if (absent.includes(participant.tab.id)) continue;
          const tab = snapshot.tabs.find(tab => tab.id === participant.tab.id);
          if (!tab || tab.audible !== participant.tab.audible || participant === plan.winner && tab.audible) throw invalid;
        }
        // Absence is global: a target moved outside the affected windows is still alive.
        // Apply this to every bracket snapshot and the entire claimed removal prefix.
        if (snapshot.tabs.some(tab => absent.includes(tab.id))) {
          throw invalid;
        }
        const expectedTabs = receipt.tabs.filter(tab => windows.has(tab.windowId) && !absent.includes(tab.id));
        const actualTabs = snapshot.tabs.filter(tab => windows.has(tab.windowId));
        if (actualTabs.length !== expectedTabs.length) throw invalid;
        for (const expected of expectedTabs) {
          const index = receipt.tabs.filter(tab => tab.windowId === expected.windowId && tab.index < expected.index
            && absent.includes(tab.id)).length;
          const actual = actualTabs.find(tab => tab.id === expected.id);
          if (!actual || !sameTab(actual, { ...expected, index: expected.index - index })) throw invalid;
        }
        const expectedGroups = receipt.groups.filter(group => windows.has(group.windowId)
          && expectedTabs.some(tab => tab.groupId === group.id));
        const actualGroups = snapshot.groups.filter(group => windows.has(group.windowId));
        if (actualGroups.length !== expectedGroups.length) throw invalid;
        for (const expected of expectedGroups) {
          const actual = actualGroups.find(group => group.id === expected.id);
          if (!actual || actual.windowId !== expected.windowId || actual.title !== expected.title
            || actual.shared !== expected.shared || Reflect.get(actual, 'color') !== Reflect.get(expected, 'color')) throw invalid;
        }
      }
      async function read(receipt: PlacementSnapshot, absent: readonly number[]): Promise<PlacementSnapshot> {
        check();
        const snapshot = await port.read();
        check();
        validate(snapshot, receipt, absent);
        return snapshot;
      }
      async function observe(receipt: PlacementSnapshot, absent: readonly number[]): Promise<void> {
        const before = await read(receipt, absent);
        for (const participant of [plan.winner, ...plan.duplicates]) {
          if (absent.includes(participant.tab.id)) continue;
          const tab = before.tabs.find(tab => tab.id === participant.tab.id);
          if (!tab || tab.audible || tab.pinned || 'pendingUrl' in tab || tab.url !== participant.tab.url
            || tab.incognito !== participant.tab.incognito
            || before.groups.some(group => group.id === tab.groupId && group.shared === true)) throw invalid;
          check();
          const document = await port.readDocument(tab.id);
          check();
          if (!validDocument(document, tab, participant.navigation)
            || document.documentId !== documents.get(tab.id)?.documentId) throw invalid;
        }
        await read(receipt, absent);
      }
      async function abandon(): Promise<void> {
        if (!begun || journal.isBlocked()) return;
        // execute() only reaches here once every issued native call has actually settled.
        // A remaining pending marker therefore belongs to a cancelled preflight, not an outstanding call.
        await journal.settled();
        await journal.finish('abandoned');
        await journal.clear();
      }
      try {
        check();
        if (plan.duplicates.length + 1 > 100) throw new Error('Replacement participant limit exceeded.');
        await read(plan.baseline, []);
        documents.set(plan.winner.tab.id, plan.winner.document!);
        for (const participant of plan.duplicates) {
          check();
          let document: PlacementDocument | undefined;
          try { document = await port.readDocument(participant.tab.id); }
          catch { closureEligible = false; }
          check();
          if (!validDocument(document, participant.tab, participant.navigation)
            || participant.document && document.documentId !== participant.document.documentId) {
            closureEligible = false;
          } else {
            documents.set(participant.tab.id, Object.freeze({ ...document }));
          }
          if (plan.baseline.groups.some(group => group.id === participant.tab.groupId && group.shared === true)) closureEligible = false;
        }
        await read(plan.baseline, []);
        const participants: JournalParticipant[] = [plan.winner, ...plan.duplicates].map(participant => {
          const documentId = documents.get(participant.tab.id)?.documentId;
          return Object.freeze({ tabId: participant.tab.id, incognito: participant.tab.incognito,
            ...(documentId === undefined ? {} : { documentId }) });
        });
        phase = 'journal';
        await journal.begin(participants);
        begun = true;
        check();
        phase = 'placement';
        placement = await createPlacementExecutor({ port, checkpoints: {
          beforeMutation: kind => journal.beforeMutation(kind, plan.winner.tab.id),
          afterSettlement: () => journal.settled(),
          afterVerification: kind => journal.verified(kind)
        } }).execute(plan, guard);
        if (placement.kind === 'failed') throw placement.cause;
        if (placement.kind === 'skipped') {
          await abandon();
          return Object.freeze({ kind: 'stopped', phase, placement, removedTabIds: Object.freeze([...removed]) });
        }
        phase = 'journal';
        await journal.verified('placed');
        check();
        if (placement.presentation) {
          const attention = await port.readPresentation();
          check();
          if (!samePresentation(attention, placement.presentation)) throw invalid;
        }
        phase = 'closure';
        if (closureEligible) {
          for (const participant of plan.duplicates) {
            check();
            await journal.beforeMutation('remove', participant.tab.id);
            // Pending persistence must precede the complete final bracketed preflight.
            await observe(placement.snapshot, removed);
            check();
            guard.expectRemoval(participant.tab.id);
            uncertainRemovalId = participant.tab.id;
            try {
              await port.removeTab(participant.tab.id);
            } catch (cause) {
              try { await journal.settled(); } catch { /* Preserve original native cause. */ }
              throw cause;
            }
            await journal.settled();
            const nextRemoved = [...removed, participant.tab.id];
            await observe(placement.snapshot, nextRemoved);
            removed.push(participant.tab.id);
            uncertainRemovalId = undefined;
            await journal.verified('removed', participant.tab.id);
            check();
          }
        }
        phase = 'journal';
        await journal.finish('completed');
        await journal.clear();
        return Object.freeze({ kind: 'completed', placement, removedTabIds: Object.freeze([...removed]),
          closure: closureEligible ? 'completed' : 'ineligible' });
      } catch (cause) {
        try { await abandon(); } catch { /* The failed journal blocks further admission. */ }
        return Object.freeze({ kind: 'stopped', phase, cause, ...(placement ? { placement } : {}),
          removedTabIds: Object.freeze([...removed]), ...(uncertainRemovalId === undefined ? {} : { uncertainRemovalId }) });
      }
    }
  };
}
