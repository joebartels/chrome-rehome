export type NavigationToken = Readonly<{ epoch: symbol; tabId: number; generation: number }>;
export type CandidateNavigation = NavigationToken & Readonly<{
  url: string; documentId: string; observedSequence: number;
}>;
export type NavigationView = Readonly<{
  epoch: symbol; revision: number; navigations: readonly CandidateNavigation[]; blockedTabIds: readonly number[];
}>;
export type CandidateTab = Readonly<{
  id: number; windowId: number; index: number; groupId: number; pinned: boolean; incognito: boolean;
  url?: string; pendingUrl?: string;
}>;
export type DuplicateIdentity = Readonly<{
  identify(candidate: { url: string; incognito: boolean }): string | undefined;
}>;
export type CandidateSelection =
  | Readonly<{ kind: 'skip'; reason: 'invalid-input' | 'stale-trigger' | 'unavailable-trigger' | 'superseded' | 'no-duplicates' }>
  | Readonly<{ kind: 'selected'; epoch: symbol; revision: number; winner: CandidateTab;
      navigation: CandidateNavigation; duplicates: readonly CandidateTab[]; anchor: CandidateTab }>;

export type SingleCandidate = Readonly<{
  kind: 'single'; epoch: symbol; revision: number; winner: CandidateTab; navigation: CandidateNavigation; duplicates: readonly [];
}>;
export type PlacementSelection = Extract<CandidateSelection, { kind: 'selected' }> | SingleCandidate;

function validId(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }
function positive(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function nativeHref(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\\\s\p{Cc}]/u.test(value) || !/^https?:\/\/[^/]/i.test(value)) return;
  try {
    const url = new URL(value);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password) return url.href;
  } catch { /* Unavailable URLs are excluded. */ }
  return;
}
function validNavigation(value: CandidateNavigation): boolean {
  return !!value && typeof value.epoch === 'symbol' && validId(value.tabId) && positive(value.generation)
    && positive(value.observedSequence) && typeof value.documentId === 'string' && value.documentId.length > 0
    && nativeHref(value.url) !== undefined;
}
function validTab(value: CandidateTab): boolean {
  return !!value && validId(value.id) && validId(value.windowId) && validId(value.index)
    && Number.isSafeInteger(value.groupId) && value.groupId >= -1
    && typeof value.pinned === 'boolean' && typeof value.incognito === 'boolean';
}
function sameObservation(a: CandidateNavigation, b: CandidateNavigation): boolean {
  return a.epoch === b.epoch && a.tabId === b.tabId && a.generation === b.generation
    && a.url === b.url && a.documentId === b.documentId && a.observedSequence === b.observedSequence;
}
function copyTab(tab: CandidateTab): CandidateTab {
  return Object.freeze({ id: tab.id, windowId: tab.windowId, index: tab.index, groupId: tab.groupId,
    pinned: tab.pinned, incognito: tab.incognito, ...(tab.url === undefined ? {} : { url: tab.url }),
    ...('pendingUrl' in tab ? { pendingUrl: tab.pendingUrl } : {}) });
}

export function selectCandidates(trigger: CandidateNavigation, tabs: readonly CandidateTab[], view: NavigationView, identity: DuplicateIdentity): CandidateSelection;
export function selectCandidates(trigger: CandidateNavigation, tabs: readonly CandidateTab[], view: NavigationView, identity: DuplicateIdentity, options: { allowNoDuplicates: true }): CandidateSelection | SingleCandidate;
export function selectCandidates(
  trigger: CandidateNavigation, tabs: readonly CandidateTab[], view: NavigationView, identity: DuplicateIdentity,
  options?: { allowNoDuplicates: true },
): CandidateSelection | SingleCandidate {
  const skip = (reason: Extract<CandidateSelection, { kind: 'skip' }>['reason']): CandidateSelection => Object.freeze({ kind: 'skip', reason });
  if (!validNavigation(trigger) || !view || typeof view.epoch !== 'symbol' || !validId(view.revision)
    || !Array.isArray(tabs) || !Array.isArray(view.navigations) || !Array.isArray(view.blockedTabIds)
    || !identity || typeof identity.identify !== 'function') return skip('invalid-input');
  const byTab = new Map<number, CandidateTab>();
  for (const tab of tabs) {
    if (!validTab(tab) || byTab.has(tab.id)) return skip('invalid-input');
    byTab.set(tab.id, tab);
  }
  const current = new Map<number, CandidateNavigation>();
  for (const event of view.navigations) {
    if (!validNavigation(event) || event.epoch !== view.epoch || current.has(event.tabId)) return skip('invalid-input');
    current.set(event.tabId, event);
  }
  const blocked = new Set<number>();
  for (const tabId of view.blockedTabIds) {
    if (!validId(tabId) || blocked.has(tabId)) return skip('invalid-input');
    blocked.add(tabId);
  }
  const live = current.get(trigger.tabId);
  if (!live || !sameObservation(trigger, live)) return skip('stale-trigger');
  function available(tab: CandidateTab): boolean {
    if (tab.pinned || 'pendingUrl' in tab || blocked.has(tab.id)) return false;
    const href = nativeHref(tab.url);
    if (href === undefined) return false;
    const event = current.get(tab.id);
    return !event || nativeHref(event.url) === href;
  }
  const triggerTab = byTab.get(trigger.tabId);
  if (!triggerTab || !available(triggerTab)) return skip('unavailable-trigger');
  const key = identity.identify({ url: triggerTab.url!, incognito: triggerTab.incognito });
  if (key === undefined) return skip('unavailable-trigger');
  const matching = tabs.filter((tab) => available(tab) && tab.incognito === triggerTab.incognito
    && identity.identify({ url: tab.url!, incognito: tab.incognito }) === key);
  let winner = live;
  for (const tab of matching) {
    const event = current.get(tab.id);
    if (event && (event.observedSequence > winner.observedSequence
      || event.observedSequence === winner.observedSequence && event.tabId < winner.tabId)) winner = event;
  }
  if (winner.tabId !== trigger.tabId) return skip('superseded');
  const duplicates = matching.filter((tab) => tab.id !== trigger.tabId).sort((a, b) =>
    Number(b.windowId === triggerTab.windowId) - Number(a.windowId === triggerTab.windowId)
    || a.windowId - b.windowId || a.index - b.index || a.id - b.id).map(copyTab);
  if (!duplicates.length) {
    if (!options?.allowNoDuplicates) return skip('no-duplicates');
    return Object.freeze({ kind: 'single', epoch: view.epoch, revision: view.revision, winner: copyTab(triggerTab),
      navigation: Object.freeze({ ...live }), duplicates: Object.freeze([]) as readonly [] });
  }
  return Object.freeze({ kind: 'selected', epoch: view.epoch, revision: view.revision, winner: copyTab(triggerTab),
    navigation: Object.freeze({ epoch: live.epoch, tabId: live.tabId, generation: live.generation, url: live.url,
      documentId: live.documentId, observedSequence: live.observedSequence }),
    duplicates: Object.freeze(duplicates), anchor: duplicates[0]! });
}
