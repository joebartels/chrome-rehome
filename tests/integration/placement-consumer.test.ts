import { expect, it } from 'vitest';
import { createPlacementConsumer } from '../../src/background/placement';
import { createCoordinator } from '../../src/background/coordinator';
import { createNavigationTracker, type NavigationInput } from '../../src/background/navigation';
import { createConfigRepository } from '../../src/config/repository';
import { createOperationQueue } from '../../src/background/operation-queue';
import { createDiagnostics } from '../../src/diagnostics/diagnostics';
import type { PlacementPort } from '../../src/execution/placement';
const enabled={schemaVersion:3,enabled:true,groupingRules:[{pattern:'https://example.com/*',group:'Work'}],duplicateRules:[]};
const input=(tabId=1,timeStamp=1):NavigationInput=>({tabId,timeStamp,frameId:0,url:'https://example.com/',documentId:'doc'+tabId,documentLifecycle:'active',transitionType:'link',transitionQualifiers:[],kind:'committed'});
function fixture(raw:unknown){
  const tracker=createNavigationTracker();let tabs=[{id:1,windowId:10,index:0,groupId:-1,pinned:false,incognito:false,url:'https://example.com/'},{id:2,windowId:20,index:0,groupId:-1,pinned:false,incognito:false,url:'https://example.com/'}];let groups:{id:number;windowId:number;title?:string}[]=[];const frames:number[]=[];const mutations:number[]=[];let nextGroup=3;
  const port:PlacementPort={read:async()=>({tabs,groups}),readDocument:async(tabId)=>{frames.push(tabId);if(tabId===2)return;return {tabId,documentId:'doc'+tabId,url:'https://example.com/',documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1,errorOccurred:false};},moveTab:async()=>{throw Error('unexpected detour');},ungroupTab:async()=>{throw Error('unexpected ungroup');},groupTab:async(tabId,destination)=>{mutations.push(tabId);const groupId=nextGroup++;tabs=tabs.map(t=>t.id===tabId?{...t,groupId}:t);groups=[...groups,{id:groupId,windowId:destination.windowId,title:''}];return groupId;},setTitle:async(id,title)=>{groups=groups.map(g=>g.id===id?{...g,title}:g);}};
  let changed=()=>{};let read:()=>Promise<unknown>=async()=>raw;
  const config=createConfigRepository({read:()=>read(),write:async()=>{},subscribe:fn=>{changed=fn;return ()=>{};}});const queue=createOperationQueue();const diagnostics=createDiagnostics({enabled:true});
  const coordinator=createCoordinator({tracker,config,queue,diagnostics,consume:createPlacementConsumer({tracker,port,diagnostics})});
  return {coordinator,tracker,config,queue,port,frames,mutations,diagnostics,reload:(next:()=>Promise<unknown>)=>{read=next;changed();}};
}
it('production consumer owns no nested queue and configured grouping ignores unavailable overridden duplicate frame',async()=>{
  const f=fixture(enabled);await f.coordinator.handle(input());expect(f.mutations).toEqual([1]);expect(new Set(f.frames)).toEqual(new Set([1]));await f.coordinator.handle(input(1,2));expect(f.mutations).toEqual([1]);expect(f.diagnostics.snapshot().some(e=>e.code==='operation-failed')).toBe(false);
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
  const f=fixture(enabled);await f.coordinator.initialize();const started=deferred<void>();const gate=deferred<void>();const native=f.port.groupTab;
  f.port.readDocument=async tabId=>({tabId,documentId:'doc'+tabId,url:'https://example.com/',documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1,errorOccurred:false});
  f.port.groupTab=async(id,destination)=>{if(id===1){started.resolve();await gate.promise;}return native(id,destination);};
  const first=f.coordinator.handle(input());await started.promise;const second=f.coordinator.handle(input(2,2));await Promise.resolve();expect(f.mutations).toEqual([]);gate.resolve();await Promise.all([first,second]);expect(f.mutations).toEqual([1,2]);expect((await f.port.read()).groups).toEqual([{id:3,windowId:10,title:''},{id:4,windowId:20,title:'Work'}]);
});
it('unrelated navigation invalidates the captured view while initial snapshot is deferred',async()=>{
  const f=fixture(enabled);const started=deferred<void>();const gate=deferred<void>();const read=f.port.read;
  f.port.read=async()=>{started.resolve();await gate.promise;return read();};
  const pending=f.coordinator.handle(input());await started.promise;f.tracker.invalidate(999);gate.resolve();await pending;expect(f.mutations).toEqual([]);
});
