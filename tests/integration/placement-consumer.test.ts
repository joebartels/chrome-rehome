import { expect, it } from 'vitest';
import { createPlacementConsumer } from '../../src/background/placement';
import { createCoordinator } from '../../src/background/coordinator';
import { createNavigationTracker, type NavigationInput } from '../../src/background/navigation';
import { createConfigRepository } from '../../src/config/repository';
import { createOperationQueue } from '../../src/background/operation-queue';
import { createDiagnostics } from '../../src/diagnostics/diagnostics';
import type { PlacementSnapshot } from '../../src/planning/replacement';
import type { ReplacementPort } from '../../src/execution/replacement';
import { createReplacementJournal } from '../../src/execution/journal';
const enabled = {
  schemaVersion: 4,
  enabled: true,
  groupingRules: [{ enabled: true, pattern: 'https://example.com/*', group: 'Work' }],
  duplicateRules: []
};
const input = (tabId = 1, timeStamp = 1): NavigationInput => ({
  tabId, timeStamp, frameId: 0, url: 'https://example.com/', documentId: 'doc' + tabId,
  documentLifecycle: 'active', transitionType: 'link', transitionQualifiers: [], kind: 'committed'
});

function fixture(raw: unknown, matchingFrames = false, recovery?: { initialize(): Promise<void>; isReady(): boolean }, initial?: PlacementSnapshot) {
  const tracker = createNavigationTracker();
  let tabs: PlacementSnapshot['tabs'][number][] = [...(initial?.tabs ?? [
    { id: 1, windowId: 10, index: 0, groupId: -1, pinned: false, incognito: false, url: 'https://example.com/' },
    { id: 2, windowId: 20, index: 0, groupId: -1, pinned: false, incognito: false, url: 'https://example.com/' }
  ])];
  let groups: PlacementSnapshot['groups'][number][] = [...(initial?.groups ?? [])];
  const frames: number[] = [];
  const mutations: number[] = [];
  const removed: number[] = [];
  let nextGroup = 3;
  function normalize() {
    tabs = [...new Set(tabs.map(tab => tab.windowId))].flatMap(windowId =>
      tabs.filter(tab => tab.windowId === windowId).sort((a,b) => a.index-b.index).map((tab,index) => ({...tab,index})));
  }
  const port: ReplacementPort = {
    async readPresentation(){return undefined;},
    async activateTab(){throw Error('unexpected activate');},
    async focusWindow(){throw Error('unexpected focus');},
    removeTab: async id => {
      removed.push(id);
      tabs = tabs.filter(tab => tab.id !== id);
      normalize();
      tracker.forget(id);
    },
    read: async () => ({ tabs, groups }),
    readDocument: async tabId => {
      frames.push(tabId);
      if (tabId === 2 && !matchingFrames) return;
      return { tabId, documentId: 'doc' + tabId, url: 'https://example.com/', documentLifecycle: 'active',
        frameType: 'outermost_frame', parentFrameId: -1, errorOccurred: false };
    },
    moveTab: async (id,windowId,index) => {
      mutations.push(id);
      const winner = tabs.find(tab => tab.id === id)!;
      const rest = tabs.filter(tab => tab.id !== id);
      const destination = rest.filter(tab => tab.windowId === windowId).sort((a,b) => a.index-b.index);
      destination.splice(index,0,{...winner,windowId,groupId:winner.windowId === windowId ? winner.groupId : -1});
      tabs = [...rest.filter(tab => tab.windowId !== windowId),...destination.map((tab,index) => ({...tab,index}))];
      normalize();
    },
    ungroupTab: async () => { throw Error('unexpected ungroup'); },
    groupTab: async (tabId, destination) => {
      mutations.push(tabId);
      if (destination.kind === 'existing') {
        tabs = tabs.map(tab => tab.id === tabId ? { ...tab, groupId: destination.groupId } : tab);
        return destination.groupId;
      }
      const groupId = nextGroup++;
      tabs = tabs.map(tab => tab.id === tabId ? { ...tab, groupId } : tab);
      groups = [...groups, { id: groupId, windowId: destination.windowId, title: '' }];
      return groupId;
    },
    setTitle: async (id, title) => {
      groups = groups.map(group => group.id === id ? { ...group, title } : group);
    }
  };
  let changed = () => {};
  let read: () => Promise<unknown> = async () => raw;
  const config = createConfigRepository({
    read: () => read(), write: async () => {},
    subscribe: listener => { changed = listener; return () => {}; }
  });
  const queue = createOperationQueue();
  const diagnostics = createDiagnostics({ enabled: true });
  const journal = createReplacementJournal({
    storage: { read: async () => undefined, write: async () => {}, clear: async () => {} },
    createOperationId: () => 'test'
  });
  const coordinator = createCoordinator({ tracker, config, queue, diagnostics,
    ...(recovery ? { recovery } : {}),
    consume: createPlacementConsumer({ tracker, port, journal, diagnostics })
  });
  return { coordinator, tracker, config, queue, port, frames, mutations, removed, diagnostics,
    reload: (next: () => Promise<unknown>) => { read = next; changed(); }
  };
}
it('a matching rule cannot bypass unavailable existing duplicate evidence',async()=>{
  const f=fixture(enabled);await f.coordinator.handle(input());expect(f.mutations).toEqual([]);expect(new Set(f.frames)).toEqual(new Set([1,2]));await f.coordinator.handle(input(1,2));expect(f.mutations).toEqual([]);expect(f.diagnostics.snapshot().some(e=>e.code==='operation-failed')).toBe(false);
});
it.each([undefined,{...enabled,enabled:false},{}])('disabled or unavailable skips %j',async(raw)=>{const f=fixture(raw);await f.coordinator.handle(input());expect(f.mutations).toEqual([]);});
it('pending config reload revokes published enabled state and running captured context',async()=>{
  const f=fixture(enabled);await f.coordinator.initialize();const first=f.config.getCurrent();expect(first?.state.kind).toBe('ready');let resolve!:(v:unknown)=>void;f.reload(()=>new Promise(r=>{resolve=r;}));expect(f.config.getCurrent()).toBeUndefined();await f.coordinator.handle(input());expect(f.mutations).toEqual([]);resolve(enabled);await Promise.resolve();await Promise.resolve();expect(f.config.getCurrent()?.revision).not.toBe(first?.revision);
});

function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
it('latest eligible callback wins before queued consumer starts',async()=>{
  const f=fixture(enabled);await f.coordinator.initialize();const gate=deferred<void>();const blocked=f.queue.run(()=>gate.promise);
  const old=f.coordinator.handle(input(1,9));const newer=f.coordinator.handle(input(2,1));
  f.port.readDocument=async tabId=>({tabId,documentId:'doc'+tabId,url:'https://example.com/',documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1,errorOccurred:false});
  gate.resolve();await Promise.all([blocked,old,newer]);expect(f.mutations).toEqual([2]);
});
it('native promise settlement retains the sole queue before a later placement can start',async()=>{
  const f=fixture(enabled);await f.coordinator.initialize();const started=deferred<void>();const gate=deferred<void>();const native=f.port.moveTab;
  f.port.readDocument=async tabId=>({tabId,documentId:'doc'+tabId,url:'https://example.com/',documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1,errorOccurred:false});
  f.port.moveTab=async(id,windowId,index)=>{if(id===1){started.resolve();await gate.promise;}return native(id,windowId,index);};
  const first=f.coordinator.handle(input());await started.promise;const second=f.coordinator.handle(input(2,2));await Promise.resolve();expect(f.mutations).toEqual([]);gate.resolve();await Promise.all([first,second]);expect(f.mutations).toEqual([1,2]);expect((await f.port.read()).groups).toEqual([]);
});
it('unrelated navigation invalidates the captured view while initial snapshot is deferred',async()=>{
  const f=fixture(enabled);const started=deferred<void>();const gate=deferred<void>();const read=f.port.read;
  f.port.read=async()=>{started.resolve();await gate.promise;return read();};
  const pending=f.coordinator.handle(input());await started.promise;f.tracker.invalidate(999);gate.resolve();await pending;expect(f.mutations).toEqual([]);
});


it.each(['link', 'start_page'])('%s inherits the ungrouped location despite a rule and removes exactly its older live duplicate', async transitionType => {
  const f = fixture(enabled, true);
  await f.coordinator.handle({ ...input(), transitionType });
  expect(f.mutations).toEqual([1]);
  expect(f.removed).toEqual([2]);
  expect(new Set(f.frames)).toEqual(new Set([1, 2]));
  const result = await f.port.read();
  expect(result.tabs.map(tab => tab.id)).toEqual([1]);
  expect(result.tabs[0]!.groupId).toBe(-1);
  expect(result.tabs[0]!.windowId).toBe(20);
  expect(result.groups).toEqual([]);
});

it.each(['link', 'start_page'])('%s cannot mutate when disabled, recovery blocked, or snapshot stale', async transitionType => {
  for (const guard of ['disabled', 'recovery', 'stale'] as const) {
    const recovery = { initialize: async () => {}, isReady: () => guard !== 'recovery' };
    const f = fixture(guard === 'disabled' ? { ...enabled, enabled: false } : enabled, true, recovery);
    const entered = deferred<void>();
    const gate = deferred<void>();
    if (guard === 'stale') {
      const read = f.port.read;
      f.port.read = async () => {
        entered.resolve();
        await gate.promise;
        return read();
      };
    }
    const pending = f.coordinator.handle({ ...input(), transitionType });
    if (guard === 'stale') {
      await entered.promise;
      f.tracker.invalidate(999);
      gate.resolve();
    }
    await pending;
    expect(f.mutations).toEqual([]);
    expect(f.removed).toEqual([]);
    expect((await f.port.read()).tabs.map(tab => tab.id)).toEqual([1, 2]);
  }
});


it('production consumer routes a grouping-only incoming tab into the remote existing group',async()=>{
  const f=fixture(enabled,false,undefined,{tabs:[
    {id:1,windowId:10,index:0,groupId:-1,pinned:false,incognito:false,url:'https://example.com/'},
    {id:3,windowId:20,index:0,groupId:8,pinned:false,incognito:false,url:'https://first.test/'},
    {id:4,windowId:20,index:1,groupId:8,pinned:false,incognito:false,url:'https://second.test/'}
  ],groups:[{id:8,windowId:20,title:'Work'}]});
  await f.coordinator.handle(input());
  const result=await f.port.read();
  expect(result.tabs.filter(t=>t.windowId===20).sort((a,b)=>a.index-b.index).map(t=>({id:t.id,groupId:t.groupId}))).toEqual([{id:3,groupId:8},{id:4,groupId:8},{id:1,groupId:8}]);
  expect(result.groups).toEqual([{id:8,windowId:20,title:'Work'}]);
  expect(f.removed).toEqual([]);
  expect(f.frames.every(id=>id===1)).toBe(true);
});

it.each([true,false,undefined])('consumer captures raw first active=%s before candidate copying and native transfer',async active=>{
  const f=fixture(enabled,true,undefined,{tabs:[
    {id:1,windowId:10,index:0,groupId:-1,pinned:false,incognito:false,url:'https://example.com/',...(active===undefined?{}:{active})},
    {id:4,windowId:10,index:1,groupId:-1,pinned:false,incognito:false,url:'https://source.test/',active:!active},
    {id:2,windowId:20,index:0,groupId:-1,pinned:false,incognito:false,url:'https://example.com/',active:false},
    {id:3,windowId:20,index:1,groupId:-1,pinned:false,incognito:false,url:'https://spare.test/',active:true}
  ],groups:[]});
  let attention={focusedWindowId:10,activeTabs:[{windowId:10,tabId:1},{windowId:20,tabId:3}]};
  const presentation:string[]=[];f.port.readPresentation=async()=>structuredClone(attention);
  const move=f.port.moveTab;f.port.moveTab=async(...args)=>{await move(...args);attention={...attention,activeTabs:[{windowId:10,tabId:4},{windowId:20,tabId:3}]};};
  f.port.activateTab=async id=>{presentation.push('activate:'+id);attention={...attention,activeTabs:[{windowId:10,tabId:4},{windowId:20,tabId:id}]};};
  f.port.focusWindow=async id=>{presentation.push('focus:'+id);attention={...attention,focusedWindowId:id};};
  await f.coordinator.handle(input());
  expect(f.removed).toEqual([2]);expect((await f.port.read()).tabs.find(t=>t.id===1)?.windowId).toBe(20);
  expect(presentation).toEqual(active===true?['activate:1','focus:20']:[]);
});
it('unknown attention allows valid duplicate placement without activation',async()=>{
  const f=fixture(enabled,true);f.port.readPresentation=async()=>undefined;
  await f.coordinator.handle(input());expect(f.removed).toEqual([2]);expect((await f.port.read()).tabs[0]?.windowId).toBe(20);
});

it('contradictory first snapshot selection preserves intent while allowing core placement',async()=>{
  const f=fixture(enabled,true,undefined,{tabs:[
    {id:1,windowId:10,index:0,groupId:-1,pinned:false,incognito:false,url:'https://example.com/',active:true},
    {id:4,windowId:10,index:1,groupId:-1,pinned:false,incognito:false,url:'https://source.test/',active:true},
    {id:2,windowId:20,index:0,groupId:-1,pinned:false,incognito:false,url:'https://example.com/',active:true}
  ],groups:[]});
  let reads=0;f.port.readPresentation=async()=>{reads++;return {focusedWindowId:10,activeTabs:[{windowId:10,tabId:1},{windowId:20,tabId:2}]};};
  await f.coordinator.handle(input());expect(f.removed).toEqual([2]);expect(reads).toBe(1);
});
