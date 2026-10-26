import { isValidGroupRequest, planGroupDestination, type DestinationGroup, type DestinationSnapshot,
  type GroupDestination, type GroupPlanSkipReason, type GroupRequest } from '../planning/group-destination';

export type GroupPlacementPort = {
  read(windowId: number): Promise<DestinationSnapshot>;
  groupTab(tabId: number, destination: GroupDestination): Promise<number>;
  setTitle(groupId: number, title: string): Promise<void>;
};
export type SerialRunner = { run<T>(job: () => Promise<T>): Promise<T> };
export type GroupPlacementResult =
  | { kind: 'placed'; windowId: number; groupId: number; action: 'already-grouped' | 'reused' | 'created' }
  | { kind: 'skipped'; reason: 'invalid-request' | GroupPlanSkipReason | 'state-changed' }
  | { kind: 'failed'; stage: 'read' | 'group' | 'title' | 'verify'; cause: unknown;
      effect: 'not-started' | 'uncertain' | 'grouped' | 'titled'; groupId?: number };

function observedGroup(snapshot: DestinationSnapshot, request: GroupRequest, groupId: number): DestinationGroup | undefined {
  const tabs = snapshot.tabs.filter(tab => tab.id === request.tabId);
  const groups = snapshot.groups.filter(group => group.id === groupId);
  if (tabs.length !== 1 || groups.length !== 1) return undefined;
  const tab = tabs[0]!, group = groups[0]!;
  if (tab.windowId !== request.windowId || tab.incognito !== request.incognito || tab.pinned ||
    tab.groupId !== groupId || group.windowId !== request.windowId) return undefined;
  if (snapshot.tabs.some(member => member.groupId === groupId &&
    (member.windowId !== request.windowId || member.incognito !== request.incognito))) return undefined;
  return group;
}

export function createGroupPlacementService({ port, queue }: { port: GroupPlacementPort; queue: SerialRunner }) {
  return {
    place(request: GroupRequest): Promise<GroupPlacementResult> {
      return queue.run(async (): Promise<GroupPlacementResult> => {
        if (!isValidGroupRequest(request)) return { kind: 'skipped', reason: 'invalid-request' };
        let stage: 'read' | 'group' | 'title' | 'verify' = 'read';
        let effect: 'not-started' | 'uncertain' | 'grouped' | 'titled' = 'not-started';
        let groupId: number | undefined;
        const changed = () => { throw new Error('Group placement state changed'); };
        try {
          // A torn first observation may recover. Only the bounded second plan authorizes placement.
          planGroupDestination(request, await port.read(request.windowId));
          const plan = planGroupDestination(request, await port.read(request.windowId));
          if (plan.kind === 'skip') return { kind: 'skipped', reason: plan.reason };
          if (plan.destination.kind === 'existing') groupId = plan.destination.groupId;
          if (plan.placement === 'already-grouped' && groupId !== undefined) {
            return { kind: 'placed', windowId: request.windowId, groupId, action: 'already-grouped' };
          }
          stage = 'group'; effect = 'uncertain';
          groupId = await port.groupTab(request.tabId, plan.destination);
          stage = 'verify'; effect = 'grouped';
          const group = observedGroup(await port.read(request.windowId), request, groupId);
          if (!group) return changed();
          if (plan.destination.kind === 'existing') {
            if (group.title !== request.title) return changed();
            return { kind: 'placed', windowId: request.windowId, groupId, action: 'reused' };
          }
          if (group.title !== request.title) {
            if (group.title) return changed();
            stage = 'title';
            await port.setTitle(groupId, request.title);
            stage = 'verify'; effect = 'titled';
            const titled = observedGroup(await port.read(request.windowId), request, groupId);
            if (!titled || titled.title !== request.title) return changed();
          }
          return { kind: 'placed', windowId: request.windowId, groupId, action: 'created' };
        } catch (cause) {
          return { kind: 'failed', stage, cause, effect, ...(groupId === undefined ? {} : { groupId }) };
        }
      });
    },
  };
}
