import { describe, expect, it } from 'vitest';
import { selectCandidates } from '../../src/planning/candidates';

import { navigation, view, identity, tab, doc, decision } from '../fixtures/placement';

describe('immutable replacement plan', () => {
  it.each([10, 20])('existing manual group wins over a conflicting rule in window %i', windowId => {
    const tabs = windowId === 10
      ? [tab(1,0), tab(2,1,{groupId:8}), tab(3,2,{groupId:3,url:'https://other.test/'})]
      : [tab(1,0), tab(2,0,{windowId,groupId:8}), tab(3,1,{groupId:3,url:'https://other.test/'})];
    const groups = [{id:8,windowId,title:'Group A'}, {id:3,windowId:10,title:'Group X'}];
    const plan = decision(tabs, groups, 'Group X', [doc(1), doc(2)]);
    expect(plan).toMatchObject({kind:'place',anchorTabId:2,destination:{kind:'existing',windowId,groupId:8,position:{afterTabId:2}}});
    if (plan.kind === 'place') {
      expect(plan.duplicates[0]?.document?.documentId).toBe('anchor');
      expect(Object.isFrozen(plan.baseline.tabs[0])).toBe(true);
    }
    expect(decision(tabs, groups, 'Group X', [doc(1)])).toEqual({kind:'skip',reason:'unavailable-document'});
    expect(decision(tabs, groups, 'Group X', [doc(1),doc(2,{documentLifecycle:'cached'})])).toEqual({kind:'skip',reason:'unavailable-document'});
  });
  it('an existing ungrouped duplicate stays ungrouped despite a matching group rule', () => {
    expect(decision(undefined, [], 'Group X')).toMatchObject({kind:'place',anchorTabId:2,destination:{kind:'ungrouped',windowId:10,afterTabId:2}});
  });
  it('grouping-only uses the same eligible winner gate', () => {
    if (identity.kind !== 'ready') throw Error('rules');
    expect(selectCandidates(navigation,[tab(1,0)],view,identity)).toEqual({kind:'skip',reason:'no-duplicates'});
    expect(selectCandidates(navigation,[tab(1,0)],view,identity,{allowNoDuplicates:true})).toMatchObject({kind:'single',duplicates:[]});
    for (const extra of [{pinned:true},{pendingUrl:'https://example.com/'}]) expect(selectCandidates(navigation,[tab(1,0,extra)],view,identity,{allowNoDuplicates:true}).kind).toBe('skip');
    expect(selectCandidates({...navigation,generation:2},[tab(1,0)],view,identity,{allowNoDuplicates:true}).kind).toBe('skip');
    expect(decision([tab(1,0)], [], 'Work', [doc(1)])).toMatchObject({destination:{kind:'new'}});
    expect(decision([tab(1,0)], [], undefined, [doc(1)])).toMatchObject({destination:{kind:'unchanged'}});
  });
  it('passive anchors require document evidence', () => {
    const plan = decision();
    expect(plan).toMatchObject({kind:'place',anchorTabId:2,destination:{kind:'ungrouped',windowId:10,afterTabId:2}});
    if (plan.kind === 'place') expect(plan.duplicates[0]?.navigation).toBeUndefined();
    for (const invalid of [{errorOccurred:true},{documentLifecycle:'cached'},{frameType:'sub_frame'},{parentFrameId:0},{url:'https://other.test/'}]) expect(decision(undefined,[],undefined,[doc(1),doc(2,invalid)])).toEqual({kind:'skip',reason:'unavailable-document'});
    expect(decision(undefined,[],undefined,[doc(1)])).toEqual({kind:'skip',reason:'unavailable-document'});
    expect(decision(undefined,[],undefined,[doc(1,{documentId:'new'}),doc(2)])).toEqual({kind:'skip',reason:'unavailable-document'});
  });
  it('shared groups cannot acquire or lose a URL', () => {
    expect(decision([tab(1,0,{groupId:5}),tab(2,1)], [{id:5,windowId:10,shared:true}])).toEqual({kind:'skip',reason:'shared-group'});
    expect(decision([tab(1,0),tab(2,1,{groupId:5})], [{id:5,windowId:10,shared:true}])).toEqual({kind:'skip',reason:'shared-group'});
    expect(decision([tab(1,0),tab(2,1,{groupId:5})], [{id:5,windowId:10,title:'Work',shared:true}], 'Work')).toEqual({kind:'skip',reason:'shared-group'});
  });
});
