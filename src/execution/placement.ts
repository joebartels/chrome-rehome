import { createPresentationReceipt } from './presentation';
import type { PresentationState } from '../planning/presentation';
import type { GroupDestination } from '../planning/group-destination';
import { coherentSnapshot, validDocument } from '../planning/replacement';
import type { CandidateTab } from '../planning/candidates';
import type { Participant, PlacementDocument, PlacementSnapshot, ReplacementPlan } from '../planning/replacement';

export type PlacementGuard = Readonly<{ isCurrent(): boolean }>;
export type PlacementPort = {
  read(): Promise<PlacementSnapshot>;
  readPresentation(): Promise<PresentationState | undefined>;
  activateTab(tabId: number): Promise<void>;
  focusWindow(windowId: number): Promise<void>;
  readDocument(tabId: number): Promise<PlacementDocument | undefined>;
  moveTab(tabId: number, windowId: number, index: number): Promise<void>;
  ungroupTab(tabId: number): Promise<void>;
  groupTab(tabId: number, destination: GroupDestination): Promise<number>;
  setTitle(groupId: number, title: string): Promise<void>;
};
export type MutationPhase = 'ungroup' | 'move' | 'group' | 'title' | 'activate' | 'focus';
export type PlacementCheckpoints = {
  beforeMutation(phase: MutationPhase): Promise<void>;
  afterSettlement(phase: MutationPhase): Promise<void>;
  afterVerification(phase: MutationPhase): Promise<void>;
};
export type PlacementPhase = 'read' | 'document' | MutationPhase | 'verify';
export type PlacementEffect = Readonly<{
  phase: MutationPhase;
  outcome: 'uncertain' | 'acknowledged' | 'verified';
  groupId?: number
}>;
export type PlacementResult =
  | Readonly<{ kind: 'placed' | 'unchanged'; windowId: number; groupId: number; index: number; snapshot: PlacementSnapshot; presentation?: PresentationState }>
  | Readonly<{ kind: 'skipped'; reason: 'state-changed' }>
  | Readonly<{ kind: 'failed'; phase: PlacementPhase; cause: unknown; effects: readonly PlacementEffect[] }>;

// This executor runs inside the coordinator's queue. Native promises are never raced with a timeout.
export function createPlacementExecutor({ port, checkpoints }: { port: PlacementPort; checkpoints?: PlacementCheckpoints }) {
  return {
    async execute(plan: ReplacementPlan, guard: PlacementGuard): Promise<PlacementResult> {
      const effects: PlacementEffect[] = [];
      const invalid = new Error('Placement state changed.');
      const attention = createPresentationReceipt(plan, port, invalid);
      let phase: PlacementPhase = 'read';
      let expected = { ...plan.winner.tab };
      let newGroupId: number | undefined;
      let titled = false;
      const destination = plan.destination;
      const windowId = destination.kind === 'unchanged' ? expected.windowId : destination.windowId;
      const windows = new Set([expected.windowId, windowId, ...plan.duplicates.map(participant => participant.tab.windowId)]);
      const baselineTabs = plan.baseline.tabs.filter(tab => windows.has(tab.windowId));
      const baselineGroups = plan.baseline.groups.filter(group => windows.has(group.windowId));
      const used: Participant[] = [
        plan.winner,
        ...plan.duplicates.filter(participant => participant.tab.id === plan.anchorTabId)
      ];

      function check(): void {
        if (!guard.isCurrent()) throw invalid;
      }

      function sameTab(tab: CandidateTab, original: CandidateTab): boolean {
        return tab.id === original.id && tab.windowId === original.windowId && tab.groupId === original.groupId
          && tab.pinned === original.pinned && tab.incognito === original.incognito && tab.url === original.url
          && ('pendingUrl' in tab) === ('pendingUrl' in original) && tab.pendingUrl === original.pendingUrl;
      }

      function validate(snapshot: PlacementSnapshot, acceptIndex = false): CandidateTab {
        if (!coherentSnapshot(snapshot)) throw invalid;
        // A globally planned creation remains authorized only while no other
        // matching group has appeared, including outside the structural windows.
        if (destination.kind === 'new' && snapshot.groups.some(group=>group.id !== newGroupId
          && group.title === destination.title && snapshot.tabs.some(tab=>tab.groupId === group.id
            && tab.incognito === plan.winner.tab.incognito))) throw invalid;
        const winner = snapshot.tabs.find(tab => tab.id === expected.id);
        if (!winner || winner.audible || !sameTab(winner, expected) || winner.pinned || 'pendingUrl' in winner
          || !acceptIndex && winner.index !== expected.index) throw invalid;

        const relevant = snapshot.tabs.filter(tab => windows.has(tab.windowId));
        const oldOthers = baselineTabs.filter(tab => tab.id !== expected.id);
        const others = relevant.filter(tab => tab.id !== expected.id);
        if (others.length !== oldOthers.length
          || oldOthers.some(original => !others.some(tab => sameTab(tab, original)))) throw invalid;
        for (const id of windows) {
          const ordered = (tabs: readonly CandidateTab[]) => tabs
            .filter(tab => tab.windowId === id && tab.id !== expected.id)
            .sort((a, b) => a.index - b.index)
            .map(tab => tab.id);
          if (JSON.stringify(ordered(others)) !== JSON.stringify(ordered(oldOthers))) throw invalid;
        }

        // Passive duplicates are retained too; only the used anchor needs a live document.
        for (const participant of plan.duplicates) {
          const tab = snapshot.tabs.find(tab => tab.id === participant.tab.id);
          if (!tab || tab.audible !== participant.tab.audible || !sameTab(tab, participant.tab) || tab.pinned || 'pendingUrl' in tab
            || !windows.has(tab.windowId) && tab.index !== participant.tab.index) throw invalid;
        }
        const groups = snapshot.groups.filter(group => windows.has(group.windowId));
        for (const original of baselineGroups) {
          const present = groups.find(group => group.id === original.id);
          const emptied = original.id === plan.winner.tab.groupId && expected.groupId !== original.id
            && !baselineTabs.some(tab => tab.id !== expected.id && tab.groupId === original.id);
          if (emptied) {
            if (present) throw invalid;
            continue;
          }
          if (!present || present.windowId !== original.windowId || present.title !== original.title
            || present.shared !== original.shared
            || Reflect.get(present, 'color') !== Reflect.get(original, 'color')) throw invalid;
        }
        if (groups.some(group => !baselineGroups.some(original => original.id === group.id)
          && group.id !== newGroupId)) throw invalid;
        if (newGroupId !== undefined) {
          const created = groups.find(group => group.id === newGroupId);
          if (!created || created.windowId !== windowId || created.shared === true
            || destination.kind !== 'new'
            || (titled ? created.title !== destination.title : !!created.title && created.title !== destination.title)) throw invalid;
        }
        const groupIds = [
          winner.groupId,
          ...(destination.kind === 'existing' ? [destination.groupId] : []),
          ...used.map(participant => participant.tab.groupId)
        ];
        if (snapshot.groups.some(group => groupIds.includes(group.id) && group.shared === true)) throw invalid;
        return winner;
      }

      async function read(acceptIndex = false): Promise<PlacementSnapshot> {
        check();
        phase = 'read';
        await attention.check();
        check();
        const snapshot = await port.read();
        check();
        await attention.check();
        check();
        const winner = validate(snapshot, acceptIndex);
        expected = { ...winner };
        return snapshot;
      }

      async function observe(acceptIndex = false): Promise<PlacementSnapshot> {
        const before = await read(acceptIndex);
        for (const participant of used) {
          check();
          phase = 'document';
          const document = await port.readDocument(participant.tab.id);
          check();
          await attention.check();
          check();
          const tab = before.tabs.find(tab => tab.id === participant.tab.id);
          if (!tab || !validDocument(document, tab, participant.navigation)
            || document.documentId !== participant.document?.documentId) throw invalid;
        }
        return read();
      }

      async function mutate<T>(
        mutationPhase: MutationPhase,
        operation: () => Promise<T>,
        accept: (value: T) => void
      ): Promise<PlacementSnapshot> {
        if (checkpoints) await checkpoints.beforeMutation(mutationPhase);
        // A durable pending write is an await: repeat the entire preflight after it.
        await observe();
        check();
        phase = mutationPhase;
        effects.push(Object.freeze({ phase: mutationPhase, outcome: 'uncertain' }));
        const previousWindowId = expected.windowId;
        let value: T;
        try {
          value = await operation();
        } catch (cause) {
          // Preserve native rejection identity even when settlement bookkeeping also fails.
          try { await checkpoints?.afterSettlement(mutationPhase); } catch { /* Journal blocks admission. */ }
          throw cause;
        }
        effects[effects.length - 1] = Object.freeze({
          phase: mutationPhase,
          outcome: 'acknowledged',
          ...(mutationPhase === 'group' ? { groupId: value as number } : {})
        });
        // Capture only the native transition before another durable-storage await.
        // Even an invalid native result must discharge its settled pending marker.
        try {
          accept(value);
          await attention.settled(mutationPhase, previousWindowId);
        } finally { await checkpoints?.afterSettlement(mutationPhase); }
        check();
        const snapshot = await observe(true);
        effects[effects.length - 1] = Object.freeze({ ...effects[effects.length - 1]!, outcome: 'verified' });
        await checkpoints?.afterVerification(mutationPhase);
        check();
        return snapshot;
      }

      function finalIndex(snapshot: PlacementSnapshot): number {
        if (destination.kind === 'unchanged' || destination.kind === 'new'
          || destination.kind === 'existing' && destination.position === 'keep') return expected.index;
        const afterId = destination.kind === 'ungrouped'
          ? destination.afterTabId
          : typeof destination.position === 'object' ? destination.position.afterTabId : undefined;
        const rest = snapshot.tabs
          .filter(tab => tab.windowId === windowId && tab.id !== expected.id)
          .sort((a, b) => a.index - b.index);
        const anchor = afterId === undefined
          ? rest.filter(tab => destination.kind === 'existing' && tab.groupId === destination.groupId).at(-1)
          : rest.find(tab => tab.id === afterId);
        if (!anchor) throw invalid;
        return rest.findIndex(tab => tab.id === anchor.id) + 1;
      }

      try {
        let snapshot = await observe();
        if (destination.kind !== 'unchanged') {
          const finalGroup = destination.kind === 'existing' ? destination.groupId : -1;
          if (expected.groupId !== -1 && (expected.groupId !== finalGroup || expected.windowId !== windowId)) {
            snapshot = await mutate(
              'ungroup',
              () => port.ungroupTab(expected.id),
              () => { expected = { ...expected, groupId: -1 }; }
            );
          }
          if (expected.windowId !== windowId) {
            const rest = snapshot.tabs
              .filter(tab => tab.windowId === windowId)
              .sort((a, b) => a.index - b.index);
            const anchor = destination.kind === 'ungrouped'
              ? rest.find(tab => tab.id === destination.afterTabId)
              : destination.kind === 'existing'
                ? rest.filter(tab => tab.groupId === destination.groupId).at(-1)
                : undefined;
            if (!anchor) throw invalid;
            snapshot = await mutate(
              'move',
              () => port.moveTab(expected.id, windowId, anchor.index + 1),
              () => { expected = { ...expected, windowId, groupId: -1 }; }
            );
          }
          if (destination.kind === 'new' || destination.kind === 'existing' && expected.groupId !== destination.groupId) {
            const target: GroupDestination = destination.kind === 'new'
              ? destination
              : { kind: 'existing', windowId, groupId: destination.groupId };
            snapshot = await mutate('group', () => port.groupTab(expected.id, target), groupId => {
              if (!Number.isSafeInteger(groupId) || groupId < 0
                || destination.kind === 'existing' && groupId !== destination.groupId) throw invalid;
              if (destination.kind === 'new') newGroupId = groupId;
              expected = { ...expected, groupId };
            });
          }
          if (destination.kind === 'new') {
            const created = snapshot.groups.find(group => group.id === newGroupId);
            if (created?.title !== destination.title) snapshot = await mutate(
              'title',
              () => port.setTitle(expected.groupId, destination.title),
              () => { titled = true; }
            );
          }
          const index = finalIndex(snapshot);
          if (expected.index !== index) snapshot = await mutate(
            'move',
            () => port.moveTab(expected.id, windowId, index),
            () => {}
          );
          phase = 'verify';
          check();
          if (expected.windowId !== windowId
            || expected.groupId !== (destination.kind === 'new' ? newGroupId : finalGroup)
            || expected.index !== finalIndex(snapshot)) throw invalid;
        }
        if (plan.presentation.kind === 'foreground') {
          if (!attention.current()!.activeTabs.some(entry=>entry.windowId === windowId && entry.tabId === expected.id))
            snapshot = await mutate('activate', () => port.activateTab(expected.id), () => {});
          if (attention.current()!.focusedWindowId !== windowId)
            snapshot = await mutate('focus', () => port.focusWindow(windowId), () => {});
        }
        snapshot = await observe();
        phase = 'verify';
        check();
        if (!attention.satisfied() || destination.kind !== 'unchanged' && expected.index !== finalIndex(snapshot)) throw invalid;
        return Object.freeze({
          kind: effects.length ? 'placed' : 'unchanged',
          windowId: expected.windowId,
          groupId: expected.groupId,
          index: expected.index,
          ...(attention.current() ? {presentation:attention.current()!} : {}),
          snapshot: Object.freeze({
            tabs: Object.freeze(snapshot.tabs.map(tab => Object.freeze({ ...tab }))),
            groups: Object.freeze(snapshot.groups.map(group => Object.freeze({ ...group })))
          })
        });
      } catch (cause) {
        if (cause === invalid && !effects.length) return Object.freeze({ kind: 'skipped', reason: 'state-changed' });
        return Object.freeze({ kind: 'failed', phase, cause, effects: Object.freeze([...effects]) });
      }
    }
  };
}
