import { selectCandidates, type CandidateNavigation, type CandidateTab, type DuplicateIdentity, type NavigationView, type PlacementSelection } from './candidates';
import { planGroupDestination, type DestinationGroup } from './group-destination';

export type PlacementGroup = DestinationGroup & Readonly<{ shared?: boolean }>;
export type PlacementSnapshot = Readonly<{ tabs: readonly CandidateTab[]; groups: readonly PlacementGroup[] }>;
export type PlacementDocument = Readonly<{
  tabId: number; documentId: string; url: string; documentLifecycle: string; frameType: string; parentFrameId: number; errorOccurred: boolean;
}>;
export type Participant = Readonly<{ tab: CandidateTab; identity: string; document?: PlacementDocument; navigation?: CandidateNavigation }>;
export type PlacementDestination =
  | Readonly<{ kind: 'unchanged' }>
  | Readonly<{ kind: 'ungrouped'; windowId: number; afterTabId: number }>
  | Readonly<{ kind: 'existing'; windowId: number; groupId: number; position: 'keep' | 'end' | Readonly<{ afterTabId: number }> }>
  | Readonly<{ kind: 'new'; windowId: number; title: string }>;
export type ReplacementPlan = Readonly<{
  kind: 'place'; epoch: symbol; revision: number; configRevision: number; winner: Participant; duplicates: readonly Participant[];
  anchorTabId?: number; destination: PlacementDestination; baseline: PlacementSnapshot;
}>;
export type ReplacementDecision = ReplacementPlan | Readonly<{ kind: 'skip'; reason: 'invalid-input' | 'state-changed' | 'unavailable-document' | 'shared-group' }>;

export function validDocument(document: PlacementDocument | undefined, tab: CandidateTab, navigation?: CandidateNavigation): document is PlacementDocument {
  return document !== undefined && document.tabId === tab.id && typeof document.documentId === 'string' && document.documentId.length > 0
    && document.url === tab.url && document.documentLifecycle === 'active' && document.frameType === 'outermost_frame'
    && document.parentFrameId === -1 && document.errorOccurred === false
    && (!navigation || document.documentId === navigation.documentId && document.url === navigation.url);
}
export function coherentSnapshot(snapshot: PlacementSnapshot): boolean {
  const ids = new Set<number>();
  const slots = new Set<string>();
  for (const tab of snapshot.tabs) {
    if (!Number.isSafeInteger(tab.id) || tab.id < 0 || ids.has(tab.id) || !Number.isSafeInteger(tab.index) || tab.index < 0
      || !Number.isSafeInteger(tab.windowId) || tab.windowId < 0 || !Number.isSafeInteger(tab.groupId) || tab.groupId < -1
      || typeof tab.pinned !== 'boolean' || typeof tab.incognito !== 'boolean' || slots.has(`${tab.windowId}:${tab.index}`)) return false;
    ids.add(tab.id); slots.add(`${tab.windowId}:${tab.index}`);
  }
  for (const windowId of new Set(snapshot.tabs.map(tab=>tab.windowId))) {
    const ordered=snapshot.tabs.filter(tab=>tab.windowId===windowId).sort((a,b)=>a.index-b.index);
    if(ordered.some((tab,index)=>tab.index!==index)) return false;
  }
  const groupIds = new Set<number>();
  for (const group of snapshot.groups) {
    const members = snapshot.tabs.filter(tab => tab.groupId === group.id).sort((a,b) => a.index-b.index);
    if (!Number.isSafeInteger(group.id) || group.id < 0 || groupIds.has(group.id) || !members.length
      || members.some((tab,index) => tab.windowId !== group.windowId || tab.incognito !== members[0]!.incognito
        || index > 0 && tab.index !== members[index-1]!.index+1)) return false;
    groupIds.add(group.id);
  }
  return snapshot.tabs.every(tab => tab.groupId === -1 || groupIds.has(tab.groupId));
}
function sameTab(a: CandidateTab, b: CandidateTab): boolean {
  return ['id','windowId','index','groupId','pinned','incognito','url','pendingUrl'].every(key => Object.is(a[key as keyof CandidateTab],b[key as keyof CandidateTab]))
    && ('pendingUrl' in a) === ('pendingUrl' in b);
}
export function planReplacement(input: Readonly<{
  selection: PlacementSelection; view: NavigationView; snapshot: PlacementSnapshot; documents: readonly PlacementDocument[];
  identity: DuplicateIdentity; configRevision: number; groupTitle?: string;
}>): ReplacementDecision {
  const skip = (reason: Extract<ReplacementDecision,{kind:'skip'}>['reason']): ReplacementDecision => Object.freeze({kind:'skip',reason});
  const {selection,view,snapshot,identity,documents,configRevision,groupTitle} = input;
  if (!Number.isSafeInteger(configRevision) || configRevision < 0 || !coherentSnapshot(snapshot)) return skip('invalid-input');
  const checked = selectCandidates(selection.navigation,snapshot.tabs,view,identity,{allowNoDuplicates:true});
  if (checked.kind === 'skip' || checked.kind !== selection.kind || checked.epoch !== selection.epoch || checked.revision !== selection.revision
    || !sameTab(checked.winner,selection.winner) || checked.duplicates.length !== selection.duplicates.length
    || checked.duplicates.some((tab,index) => !sameTab(tab,selection.duplicates[index]!))) return skip('state-changed');
  let destination: PlacementDestination = Object.freeze({kind:'unchanged'});
  let anchor: CandidateTab | undefined;
  if (checked.kind === 'selected') {
    anchor = checked.anchor;
    destination = anchor.groupId === -1 ? Object.freeze({kind:'ungrouped',windowId:anchor.windowId,afterTabId:anchor.id})
      : Object.freeze({kind:'existing',windowId:anchor.windowId,groupId:anchor.groupId,position:Object.freeze({afterTabId:anchor.id})});
  } else if (groupTitle !== undefined) {
    const result = planGroupDestination({tabId:checked.winner.id,windowId:checked.winner.windowId,incognito:checked.winner.incognito,title:groupTitle},snapshot,{scope:'all-normal-windows'});
    if (result.kind === 'skip') return skip('state-changed');
    destination = result.destination.kind === 'new' ? Object.freeze({...result.destination})
      : Object.freeze({...result.destination,position:result.placement === 'already-grouped' ? 'keep' : 'end'});
  }
  const relevant = [checked.winner.groupId, ...(anchor ? [anchor.groupId] : []), ...(destination.kind === 'existing' ? [destination.groupId] : [])];
  if (snapshot.groups.some(group => relevant.includes(group.id) && group.shared === true)) return skip('shared-group');
  function participant(tab: CandidateTab, used: boolean): Participant | undefined {
    const navigation = view.navigations.find(event => event.tabId === tab.id);
    const document = used ? documents.find(document => document.tabId === tab.id) : undefined;
    if (used && !validDocument(document,tab,navigation)) return;
    const key = identity.identify({url:tab.url!,incognito:tab.incognito});
    if (key === undefined) return;
    return Object.freeze({tab:Object.freeze({...tab}),identity:key,...(document?{document:Object.freeze({...document})}:{}),...(navigation?{navigation:Object.freeze({...navigation})}:{})});
  }
  const winner = participant(checked.winner,true);
  const duplicates = checked.duplicates.map(tab => participant(tab,tab.id === anchor?.id));
  if (!winner || duplicates.some(value => value === undefined)) return skip('unavailable-document');
  return Object.freeze({kind:'place',epoch:view.epoch,revision:view.revision,configRevision,winner,
    duplicates:Object.freeze(duplicates as Participant[]),...(anchor?{anchorTabId:anchor.id}:{}),destination,
    baseline:Object.freeze({tabs:Object.freeze(snapshot.tabs.map(tab=>Object.freeze({...tab}))),groups:Object.freeze(snapshot.groups.map(group=>Object.freeze({...group})))})});
}
