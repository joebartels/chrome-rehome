import { describe, expect, it, vi } from 'vitest';
import { createRecovery } from '../../src/background/recovery';
import { createReplacementJournal, type ReplacementJournal } from '../../src/execution/journal';
import { createReplacementExecutor } from '../../src/execution/replacement';
import { createCoordinator } from '../../src/background/coordinator';
import { createConfigRepository } from '../../src/config/repository';
import { createNavigationTracker } from '../../src/background/navigation';
import { createOperationQueue } from '../../src/background/operation-queue';
import { createDiagnostics } from '../../src/diagnostics/diagnostics';
import { replacementFixture, deferred } from '../fixtures/replacement';
const prepared:ReplacementJournal={version:1,operationId:'old',participants:[{tabId:1,incognito:false,documentId:'one'},{tabId:2,incognito:false,documentId:'anchor'}],completedPhase:'prepared',sequence:0,pending:null,removedTabIds:[],terminal:null};
const input={tabId:1,timeStamp:1,frameId:0,url:'https://example.com/',documentId:'one',documentLifecycle:'active',transitionType:'link',transitionQualifiers:[],kind:'committed'} as const;
const config={schemaVersion:4,enabled:true,groupingRules:[],duplicateRules:[]};
describe('read-only restart admission',()=>{
  it('missing session record is ready after successful read',async()=>{const f=replacementFixture();const read=vi.spyOn(f.port,'read');const recovery=createRecovery({journal:f.journal,port:f.port});await recovery.initialize();expect(recovery.isReady()).toBe(true);expect(read).not.toHaveBeenCalled();expect(f.calls).toEqual([]);});
  it.each(['prepared','ungroup','move','group','title','placed','removed','completed','abandoned'])('restart abandons settled %s and never replays old closure',async phase=>{
    const f=replacementFixture();const raw={...prepared,completedPhase:phase==='abandoned'?'placed':phase,sequence:['prepared'].includes(phase)?0:1,removedTabIds:phase==='removed'?[2]:[],terminal:phase==='completed'?'completed':phase==='abandoned'?'abandoned':null};f.seed(raw);const read=vi.spyOn(f.port,'read');const recovery=createRecovery({journal:f.journal,port:f.port});await recovery.initialize();expect(recovery.isReady()).toBe(true);expect(read).toHaveBeenCalledTimes(1);expect(f.stored).toBeUndefined();expect(f.calls).toEqual([]);
  });
  it.each(['ungroup','move','group','title','remove'])('pending %s stays quarantined across workers matching/absent tabs events and configuration toggles',async kind=>{
    const f=replacementFixture();const raw={...prepared,completedPhase:kind==='remove'?'placed':'prepared',sequence:1,pending:{sequence:1,kind,tabId:kind==='remove'?2:1}};f.seed(raw);
    for(const absent of [false,true]){if(absent)f.change(s=>({...s,tabs:[]}));const journal=createReplacementJournal({storage:f.storage,createOperationId:()=> 'new'});const recovery=createRecovery({journal,port:f.port});await recovery.initialize();expect(recovery.isReady()).toBe(false);expect(f.stored).toEqual(raw);expect(f.calls).toEqual([]);}
  });
  it.each([null,{}, {...prepared,version:2}, {...prepared,pending:{sequence:0,kind:'remove',tabId:1}}])('bad session %j stays intact',async raw=>{const f=replacementFixture();f.seed(raw);const recovery=createRecovery({journal:f.journal,port:f.port});await recovery.initialize();expect(recovery.isReady()).toBe(false);expect(f.stored).toEqual(raw);expect(f.calls).toEqual([]);});
  it.each(['read','snapshot','clear'])('%s failure blocks without repair',async method=>{const f=replacementFixture();f.seed(prepared);const failure=Error('private');if(method==='read')f.storage.read=async()=>{throw failure;};else if(method==='clear')f.storage.clear=async()=>{throw failure;};else f.port.read=async()=>{throw failure;};const recovery=createRecovery({journal:f.journal,port:f.port});await recovery.initialize();expect(recovery.isReady()).toBe(false);expect(f.stored).toEqual(prepared);expect(f.calls).toEqual([]);});
  it.each([config,{...config,enabled:false},{}, {...config,schemaVersion:99}])('configuration and recovery initialize independently before admission: %j',async raw=>{
    const f=replacementFixture();const configGate=deferred<unknown>();const journalGate=deferred<unknown>();let configStarted=false;let journalStarted=false;const journalEntered=deferred<void>();
    const repository=createConfigRepository({read:()=>{configStarted=true;return configGate.promise;},write:async()=>{},subscribe:()=>()=>{}});
    f.storage.read=()=>{journalStarted=true;journalEntered.resolve();return journalGate.promise;};const recovery=createRecovery({journal:f.journal,port:f.port});const tracker=createNavigationTracker();const consume=vi.fn(async()=>{});const coordinator=createCoordinator({config:repository,recovery,tracker,queue:createOperationQueue(),diagnostics:createDiagnostics(),consume});
    const pending=coordinator.handle(input);await journalEntered.promise;expect(configStarted).toBe(true);expect(journalStarted).toBe(true);expect(consume).not.toHaveBeenCalled();coordinator.invalidate(1);configGate.resolve(raw);journalGate.resolve(undefined);await pending;expect(consume).not.toHaveBeenCalled();expect(recovery.isReady()).toBe(true);
    await coordinator.handle({...input,timeStamp:2});expect(consume).toHaveBeenCalledTimes(raw===config?1:0);
  });
  it('unresolved recovery barrier blocks every consume and runs on the sole queue',async()=>{
    const repository=createConfigRepository({read:async()=>config,write:async()=>{},subscribe:()=>()=>{}});const queue=createOperationQueue();const recoveryGate=deferred<void>();let ready=false;const recovery={initialize:async()=>{await recoveryGate.promise;ready=true;},isReady:()=>ready};const consume=vi.fn(async()=>{});const coordinator=createCoordinator({config:repository,recovery,tracker:createNavigationTracker(),queue,diagnostics:createDiagnostics(),consume});const pending=coordinator.handle(input);await Promise.resolve();await Promise.resolve();expect(consume).not.toHaveBeenCalled();recoveryGate.resolve();await pending;expect(consume).toHaveBeenCalledTimes(1);
  });
});

it('fresh worker queue tracker and coordinator never admit work after a late discarded-worker native effect',async()=>{
  const f=replacementFixture();const entered=deferred<void>();const release=deferred<void>();const discarded=deferred<void>();const native=f.port.removeTab;
  f.port.removeTab=async id=>{entered.resolve();await release.promise;await native(id);await discarded.promise;};
  void createReplacementExecutor({port:f.port,journal:f.journal}).execute(f.plan,f.guard);await entered.promise;const durable=structuredClone(f.stored);
  const journal=createReplacementJournal({storage:f.storage,createOperationId:()=> 'new'});const recovery=createRecovery({journal,port:f.port});const tracker=createNavigationTracker();const consume=vi.fn(async()=>{throw Error('new worker must not mutate');});
  let raw:unknown=config;let changed=()=>{};const repository=createConfigRepository({read:async()=>raw,write:async()=>{},subscribe:callback=>{changed=callback;return ()=>{};}});
  const coordinator=createCoordinator({recovery,tracker,config:repository,queue:createOperationQueue(),diagnostics:createDiagnostics(),consume});
  await coordinator.handle(input);expect(consume).not.toHaveBeenCalled();release.resolve();await Promise.resolve();await Promise.resolve();coordinator.forget(2);coordinator.invalidate(1);await coordinator.handle({...input,timeStamp:2});
  raw={...config,enabled:false};changed();await repository.load();raw=config;changed();await repository.load();await coordinator.handle({...input,timeStamp:3});expect(consume).not.toHaveBeenCalled();expect(f.stored).toEqual(durable);expect(f.removed).toEqual([2]);expect(recovery.isReady()).toBe(false);
});
