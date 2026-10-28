export type GroupRequest = Readonly<{
  tabId: number; windowId: number; incognito: boolean; title: string;
}>;
export type DestinationTab = Readonly<{
  id: number; windowId: number; index: number;
  groupId: number; pinned: boolean; incognito: boolean;
}>;
export type DestinationGroup = Readonly<{ id: number; windowId: number; title?: string }>;
export type DestinationSnapshot = Readonly<{
  tabs: readonly DestinationTab[]; groups: readonly DestinationGroup[];
}>;
export type GroupDestination =
  | Readonly<{ kind: 'existing'; windowId: number; groupId: number }>
  | Readonly<{ kind: 'new'; windowId: number; title: string }>;
export type GroupPlanSkipReason = 'invalid-request' | 'tab-missing' | 'window-changed' |
  'context-changed' | 'pinned' | 'inconsistent-snapshot';
export type GroupPlan =
  | Readonly<{ kind: 'place'; tabId: number; destination: GroupDestination; placement: 'group' | 'already-grouped' }>
  | Readonly<{ kind: 'skip'; reason: GroupPlanSkipReason }>;

export function isValidGroupRequest(request: GroupRequest): boolean {
  return request != null && Number.isSafeInteger(request.tabId) && request.tabId >= 0 &&
    Number.isSafeInteger(request.windowId) && request.windowId >= 0 && typeof request.incognito === 'boolean' &&
    typeof request.title === 'string' && request.title.length >= 1 && request.title.length <= 80 &&
    request.title.trim() === request.title && !/\p{Cc}/u.test(request.title);
}

export function planGroupDestination(
  request: GroupRequest, snapshot: DestinationSnapshot,
  options?: Readonly<{ scope: 'window' | 'all-normal-windows' }>
): GroupPlan {
  const skip = (reason: GroupPlanSkipReason): GroupPlan => ({ kind: 'skip', reason });
  if (!isValidGroupRequest(request)) return skip('invalid-request');
  const sources = snapshot.tabs.filter(tab => tab.id === request.tabId);
  if (!sources.length) return skip('tab-missing');
  if (sources.length !== 1) return skip('inconsistent-snapshot');
  const source = sources[0]!;
  if (source.windowId !== request.windowId) return skip('window-changed');
  if (source.incognito !== request.incognito) return skip('context-changed');
  if (source.pinned) return skip('pinned');
  const coherent = (group: DestinationGroup, members: readonly DestinationTab[]) =>
    snapshot.groups.filter(other => other.id === group.id).length === 1 && members.length > 0 &&
    members.every(tab => tab.windowId === group.windowId && tab.incognito === members[0]!.incognito);
  if (source.groupId !== -1) {
    const records = snapshot.groups.filter(group => group.id === source.groupId);
    if (records.length !== 1 || records[0]!.windowId !== request.windowId ||
      !coherent(records[0]!, snapshot.tabs.filter(tab => tab.groupId === source.groupId))) return skip('inconsistent-snapshot');
  }
  const candidates: { group: DestinationGroup; index: number }[] = [];
  for (const group of snapshot.groups) {
    if (group.title !== request.title || options?.scope !== 'all-normal-windows' && group.windowId !== request.windowId) continue;
    const members = snapshot.tabs.filter(tab => tab.groupId === group.id);
    if (!coherent(group, members)) return skip('inconsistent-snapshot');
    if (members[0]!.incognito !== request.incognito) continue;
    candidates.push({ group, index: Math.min(...members.map(tab => tab.index)) });
  }
  const current = candidates.find(({ group }) => group.id === source.groupId);
  const chosen = current ?? candidates.sort((a, b) =>
    Number(b.group.windowId === request.windowId) - Number(a.group.windowId === request.windowId) ||
    a.group.windowId - b.group.windowId || a.index - b.index || a.group.id - b.group.id)[0];
  return {
    kind: 'place', tabId: request.tabId,
    destination: chosen ? { kind: 'existing', windowId: chosen.group.windowId, groupId: chosen.group.id } :
      { kind: 'new', windowId: request.windowId, title: request.title },
    placement: current ? 'already-grouped' : 'group',
  };
}
