import { selectCandidates, type CandidateTab } from '../../src/planning/candidates';
import { planReplacement, type PlacementDocument } from '../../src/planning/replacement';
import { compileDuplicateRules } from '../../src/rules/duplicates';
export const epoch = Symbol();
export const navigation = { epoch, tabId: 1, generation: 1, observedSequence: 1, documentId: 'one', url: 'https://example.com/' };
export const view = { epoch, revision: 1, navigations: [navigation], blockedTabIds: [] };
export const identity = compileDuplicateRules([]);
if (identity.kind !== 'ready') throw Error('rules');
export function tab(id: number, index: number, extra: Partial<CandidateTab & {active:boolean}> = {}): CandidateTab & {active?:boolean} {
  return { id, index, windowId: 10, groupId: -1, pinned: false, audible: false, incognito: false, url: navigation.url, ...extra };
}
export function doc(id: number, extra: Partial<PlacementDocument> = {}): PlacementDocument {
  return { tabId: id, documentId: id === 1 ? 'one' : 'anchor', url: navigation.url, documentLifecycle: 'active', frameType: 'outermost_frame', parentFrameId: -1, errorOccurred: false, ...extra };
}
export function decision(tabs = [tab(1, 0), tab(2, 1)], groups: {id:number;windowId:number;title?:string;shared?:boolean}[] = [], groupTitle?: string, documents = [doc(1), doc(2)]) {
  if (identity.kind !== 'ready') throw Error('rules');
  const selection = selectCandidates(navigation, tabs, view, identity, {allowNoDuplicates:true});
  if (selection.kind === 'skip') throw Error(selection.reason);
  return planReplacement({ selection, view, snapshot: {tabs, groups}, documents, identity, configRevision: 1, ...(groupTitle === undefined ? {} : {groupTitle}) });
}
