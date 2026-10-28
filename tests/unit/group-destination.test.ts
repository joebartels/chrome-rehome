import { describe, expect, it } from 'vitest';
import { planGroupDestination, type DestinationSnapshot, type DestinationTab, type GroupRequest } from '../../src/planning/group-destination';

const request: GroupRequest = { tabId: 1, windowId: 10, incognito: false, title: 'BarTab' };
const tab = (overrides: Partial<DestinationTab> = {}): DestinationTab => ({ id: 1, windowId: 10, index: 5, groupId: -1, pinned: false, incognito: false, ...overrides });
const fresh = { kind: 'place', tabId: 1, destination: { kind: 'new', windowId: 10, title: 'BarTab' }, placement: 'group' };
const existing = (id: number, placement = 'group') => ({ kind: 'place', tabId: 1, destination: { kind: 'existing', windowId: 10, groupId: id }, placement });
const skip = (reason: string) => ({ kind: 'skip', reason });

describe('planGroupDestination', () => {
  it('creates a titled destination for an actual ungrouped tab', () => {
    expect(planGroupDestination(request, { tabs: [tab()], groups: [] })).toEqual(fresh);
  });
  it('prefers the source current matching group over an earlier duplicate', () => {
    expect(planGroupDestination(request, { tabs: [tab({ groupId: 9 }), tab({ id: 2, groupId: 7, index: 0 })], groups: [{ id: 9, windowId: 10, title: 'BarTab' }, { id: 7, windowId: 10, title: 'BarTab' }] })).toEqual(existing(9, 'already-grouped'));
  });
  it.each([[9, 1, 7, 2, 9], [9, 2, 7, 1, 7], [9, 1, 7, 1, 7]])('chooses lowest observed index then numeric id: %j', (a, ai, b, bi, want) => {
    expect(planGroupDestination(request, { tabs: [tab(), tab({ id: 2, groupId: a, index: ai }), tab({ id: 3, groupId: b, index: bi })], groups: [{ id: a, windowId: 10, title: 'BarTab' }, { id: b, windowId: 10, title: 'BarTab' }] })).toEqual(existing(want));
  });
  it.each([['BarTab', 'bartab'], ['Work*', 'WorkX'], ['Work?', 'WorkX']])('compares exact case-sensitive literal titles %s / %s', (title, other) => {
    expect(planGroupDestination({ ...request, title }, { tabs: [tab(), tab({ id: 2, groupId: 7 })], groups: [{ id: 7, windowId: 10, title: other }] })).toEqual({ ...fresh, destination: { kind: 'new', windowId: 10, title } });
  });
  it.each([
    [{ tabId: -1 }], [{ windowId: -2 }], [{ tabId: NaN }], [{ tabId: 1.5 }], [{ windowId: Infinity }], [{ tabId: Number.MAX_SAFE_INTEGER + 1 }],
    [{ title: '' }], [{ title: ' x' }], [{ title: 'x ' }], [{ title: 'x'.repeat(81) }], [{ title: 'x\n' }], [{ title: 'x\u007f' }], [{ title: 'x\u0080' }], [{ title: 'x\u009f' }], [{ incognito: undefined }], [{ title: null }],
  ])('rejects invalid requests %j', (change) => {
    expect(planGroupDestination({ ...request, ...change } as GroupRequest, { tabs: [tab()], groups: [] })).toEqual(skip('invalid-request'));
  });
  it.each([
    [{ tabs: [], groups: [] }, 'tab-missing'],
    [{ tabs: [tab({ windowId: 20 })], groups: [] }, 'window-changed'],
    [{ tabs: [tab({ incognito: true })], groups: [] }, 'context-changed'],
    [{ tabs: [tab({ pinned: true })], groups: [] }, 'pinned'],
    [{ tabs: [tab({ groupId: 7 })], groups: [] }, 'inconsistent-snapshot'],
    [{ tabs: [tab()], groups: [{ id: 7, windowId: 10, title: 'BarTab' }] }, 'inconsistent-snapshot'],
    [{ tabs: [tab(), tab({ id: 2, groupId: 7, windowId: 20 })], groups: [{ id: 7, windowId: 10, title: 'BarTab' }] }, 'inconsistent-snapshot'],
    [{ tabs: [tab(), tab({ id: 2, groupId: 7 }), tab({ id: 3, groupId: 7, incognito: true })], groups: [{ id: 7, windowId: 10, title: 'BarTab' }] }, 'inconsistent-snapshot'],
    [{ tabs: [tab(), tab({ id: 1 })], groups: [] }, 'inconsistent-snapshot'],
    [{ tabs: [tab({ groupId: 7 })], groups: [{ id: 7, windowId: 20, title: 'Other' }] }, 'inconsistent-snapshot'],
  ] satisfies [DestinationSnapshot, string][])('skips unsafe observations: %j', (snapshot, reason) => {
    expect(planGroupDestination(request, snapshot)).toEqual(skip(reason));
  });
  it('ignores coherent foreign windows and contexts', () => {
    expect(planGroupDestination(request, { tabs: [tab(), tab({ id: 2, windowId: 20, groupId: 7, incognito: true })], groups: [{ id: 7, windowId: 20, title: 'BarTab' }] })).toEqual(fresh);
    expect(planGroupDestination(request, { tabs: [tab(), tab({ id: 2, groupId: 7, incognito: true })], groups: [{ id: 7, windowId: 10, title: 'BarTab' }] })).toEqual(fresh);
  });
  it('accepts and preserves frozen readonly inputs', () => {
    const frozenRequest = Object.freeze({ ...request, title: 'x'.repeat(80) });
    const snapshot = Object.freeze({ tabs: Object.freeze([Object.freeze(tab())]), groups: Object.freeze([]) });
    expect(planGroupDestination(frozenRequest, snapshot)).toEqual({ ...fresh, destination: { kind: 'new', windowId: 10, title: 'x'.repeat(80) } });
    expect(snapshot.tabs[0]).toEqual(tab());
  });
});


// Global opt-in must change destination selection without changing legacy scoped callers.
describe('all-normal-window group destinations', () => {
  const global = { scope: 'all-normal-windows' } as const;
  const remote = (groupId: number, windowId = 20) => ({
    kind: 'place', tabId: 1, destination: { kind: 'existing', windowId, groupId }, placement: 'group'
  });
  it('reuses a remote exact-title group and returns its actual window', () => {
    const snapshot = { tabs: [tab(), tab({ id: 2, windowId: 20, index: 0, groupId: 7 })], groups: [{ id: 7, windowId: 20, title: 'BarTab' }] };
    expect(planGroupDestination(request, snapshot, global)).toEqual(remote(7));
    expect(planGroupDestination(request, snapshot)).toEqual(fresh);
    expect(planGroupDestination(request, snapshot, { scope: 'window' })).toEqual(fresh);
  });
  it.each([false, true])('prefers current then local over remote, currently grouped=%s', current => {
    const snapshot = { tabs: [tab({groupId:current?9:-1}), tab({id:2,groupId:7,index:0}), tab({id:3,windowId:2,index:0,groupId:3})],
      groups: [...(current?[{id:9,windowId:10,title:'BarTab'}]:[]), {id:7,windowId:10,title:'BarTab'}, {id:3,windowId:2,title:'BarTab'}] };
    expect(planGroupDestination(request,snapshot,global)).toEqual(existing(current?9:7,current?'already-grouped':'group'));
  });
  it.each([
    [20, 2, 9, 30, 0, 7, 20, 9],
    [20, 2, 9, 20, 1, 7, 20, 7],
    [20, 1, 9, 20, 1, 7, 20, 7],
  ])('orders remote candidates by window, first member index, then group id: %j', (aw,ai,a,bw,bi,b,wantWindow,wantGroup) => {
    const snapshot = { tabs:[tab(),tab({id:2,windowId:aw,index:ai,groupId:a}),tab({id:3,windowId:bw,index:bi,groupId:b})],
      groups:[{id:a,windowId:aw,title:'BarTab'},{id:b,windowId:bw,title:'BarTab'}] };
    expect(planGroupDestination(request,snapshot,global)).toEqual(remote(wantGroup,wantWindow));
    expect(planGroupDestination(request,{tabs:[...snapshot.tabs].reverse(),groups:[...snapshot.groups].reverse()},global)).toEqual(remote(wantGroup,wantWindow));
  });
  it.each([['bartab',false],['BarTab',true],['Bar*',false]])('does not reuse a remote title/context mismatch: %s / %s', (title,incognito) => {
    expect(planGroupDestination(request,{tabs:[tab(),tab({id:2,windowId:20,groupId:7,incognito})],groups:[{id:7,windowId:20,title}]},global)).toEqual(fresh);
  });
  it.each([
    {tabs:[tab()],groups:[{id:7,windowId:20,title:'BarTab'}]},
    {tabs:[tab(),tab({id:2,windowId:30,groupId:7})],groups:[{id:7,windowId:20,title:'BarTab'}]},
    {tabs:[tab(),tab({id:2,windowId:20,groupId:7}),tab({id:3,windowId:20,groupId:7,incognito:true})],groups:[{id:7,windowId:20,title:'BarTab'}]},
    {tabs:[tab(),tab({id:2,windowId:20,groupId:7})],groups:[{id:7,windowId:20,title:'BarTab'},{id:7,windowId:20,title:'BarTab'}]},
  ])('fails closed on malformed relevant remote membership: %j', snapshot => {
    expect(planGroupDestination(request,snapshot,global)).toEqual(skip('inconsistent-snapshot'));
  });
});
