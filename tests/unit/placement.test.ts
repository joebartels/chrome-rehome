import { describe, expect, it } from 'vitest';
import { createPlacementExecutor, type PlacementPort } from '../../src/execution/placement';
import { type PlacementSnapshot } from '../../src/planning/replacement';
import { decision, tab, doc } from '../fixtures/placement';

function setup(tabs = [tab(1,0),tab(2,1)], groups: {id:number;windowId:number;title?:string;shared?:boolean}[] = [], title?: string) {
  const planned = decision(tabs,groups,title);
  if (planned.kind !== 'place') throw Error(planned.reason);
  let snapshot: PlacementSnapshot = {tabs:tabs.map(t=>({...t})),groups:groups.map(g=>({...g}))};
  const calls: string[] = [];
  let current = true;
  let boundary: ((phase:string)=>Promise<void>) = async()=>{};
  function normalize() {
    snapshot = {...snapshot, groups:snapshot.groups.filter(g=>snapshot.tabs.some(t=>t.groupId===g.id))};
  }
  const port: PlacementPort = {
    async read() { await boundary('read'); return structuredClone(snapshot); },
    async readDocument(id) { await boundary('document'); return doc(id); },
    async ungroupTab(id) { calls.push('ungroup'); snapshot={...snapshot,tabs:snapshot.tabs.map(t=>t.id===id?{...t,groupId:-1}:t)}; normalize(); await boundary('ungroup'); },
    async moveTab(id,windowId,index) { calls.push(`move:${windowId}:${index}`); const winner=snapshot.tabs.find(t=>t.id===id)!; const rest=snapshot.tabs.filter(t=>t.id!==id); const destination=rest.filter(t=>t.windowId===windowId).sort((a,b)=>a.index-b.index); destination.splice(index,0,{...winner,windowId,groupId:winner.windowId===windowId?winner.groupId:-1}); const source=rest.filter(t=>t.windowId===winner.windowId&&t.windowId!==windowId).sort((a,b)=>a.index-b.index); snapshot={...snapshot,tabs:[...rest.filter(t=>t.windowId!==windowId&&t.windowId!==winner.windowId),...source.map((t,index)=>({...t,index})),...destination.map((t,index)=>({...t,index}))]}; normalize(); await boundary('move'); },
    async groupTab(id,destination) { calls.push('group'); const groupId=destination.kind==='existing'?destination.groupId:99; snapshot={tabs:snapshot.tabs.map(t=>t.id===id?{...t,groupId}:t),groups:destination.kind==='existing'?snapshot.groups:[...snapshot.groups,{id:99,windowId:destination.windowId,title:''}]}; normalize(); await boundary('group'); return groupId; },
    async setTitle(id,title) { calls.push('title'); snapshot={...snapshot,groups:snapshot.groups.map(g=>g.id===id?{...g,title}:g)}; await boundary('title'); },
  };
  return {port,plan:planned,calls,guard:{isCurrent:()=>current},revoke:()=>{current=false;},change:(fn:(s:PlacementSnapshot)=>PlacementSnapshot)=>{snapshot=fn(snapshot);},boundary:(fn:(phase:string)=>Promise<void>)=>{boundary=fn;},get snapshot(){return snapshot;}};
}
describe('guarded placement executor',()=>{
  it.each([
    [[tab(3,0,{url:'https://other.test/'}),tab(1,1),tab(4,2,{url:'https://other.test/'}),tab(2,3)],3],
    [[tab(3,0,{url:'https://other.test/'}),tab(2,1),tab(4,2,{url:'https://other.test/'}),tab(5,3,{url:'https://other.test/'}),tab(1,4)],2],
    [[tab(3,0,{url:'https://other.test/'}),tab(2,1),tab(1,2)],undefined],
  ] as const)('after-anchor index removes winner exactly once: %j',async(tabs,index)=>{
    const f=setup([...tabs]); const before=f.snapshot.tabs.filter(t=>t.id!==1).map(t=>t.id);
    const result=await createPlacementExecutor({port:f.port}).execute(f.plan,f.guard);
    expect(result.kind).toBe(index===undefined?'unchanged':'placed');
    expect(f.calls).toEqual(index===undefined?[]:[`move:10:${index}`]);
    expect([...f.snapshot.tabs].sort((a,b)=>a.index-b.index).filter(t=>t.id!==1).map(t=>t.id)).toEqual(before);
  });
  it.each([-1,8])('membership operations preserve final group and lone source removal %i',async(groupId)=>{
    const f=setup([tab(1,0,{groupId:7}),tab(3,0,{windowId:20,url:'https://other.test/'}),tab(4,1,{windowId:20,url:'https://other.test/'}),tab(2,2,{windowId:20,groupId})], [{id:7,windowId:10},...(groupId===8?[{id:8,windowId:20}]:[])]);
    const result=await createPlacementExecutor({port:f.port}).execute(f.plan,f.guard);
    expect(result).toMatchObject({kind:'placed',windowId:20,groupId,index:3});
    expect(f.snapshot.tabs.map(t=>t.id).sort()).toEqual([1,2,3,4]); expect(f.snapshot.groups.some(g=>g.id===7)).toBe(false);
  });
  it('existing manual destination wins over the configured group',async()=>{
    const f=setup([tab(1,0),tab(3,1,{groupId:3,url:'https://other.test/'}),tab(2,0,{windowId:20,groupId:8})],[{id:3,windowId:10,title:'Work'},{id:8,windowId:20}], 'Work');
    expect(await createPlacementExecutor({port:f.port}).execute(f.plan,f.guard)).toMatchObject({kind:'placed',windowId:20,groupId:8,index:1});
    expect(f.calls).toEqual(['move:20:1','group']);
  });
  it('no rule and no duplicate is unchanged with zero mutations',async()=>{
    const f=setup([tab(1,0)]); expect(await createPlacementExecutor({port:f.port}).execute(f.plan,f.guard)).toMatchObject({kind:'unchanged'}); expect(f.calls).toEqual([]);
  });
  it.each(['read','document','ungroup','move','group','title'])('every await can revoke further mutation: %s',async(phase)=>{
    const f=phase==='move'?setup([tab(1,0),tab(2,0,{windowId:20})]):setup([tab(1,0,{groupId:7})], [{id:7,windowId:10}], 'Work');
    let hit=false; f.boundary(async(p)=>{if(p===phase&&!hit){hit=true; await Promise.resolve(); f.revoke();}});
    const result=await createPlacementExecutor({port:f.port}).execute(f.plan,f.guard);
    expect(hit).toBe(true); expect(result.kind).toBe(f.calls.length?'failed':'skipped');
    if(phase==='ungroup') expect(f.calls).toEqual(['ungroup']);
    if(phase==='group') expect(f.calls).toEqual(['ungroup','group']);
    if(phase==='title') expect(f.calls).toEqual(['ungroup','group','title']);
  });
  it.each(['document','anchor','shared','survivor'])('participant changes abort: %s',async(change)=>{
    const f=setup([tab(1,0),tab(2,1,{groupId:8}),tab(3,2,{url:'https://other.test/'})],[{id:8,windowId:10}]);
    if(change==='document') f.port.readDocument=async(id)=>doc(id,{documentId:'new'});
    else f.change(s=>change==='shared'?{...s,groups:[{id:8,windowId:10,shared:true}]}:{...s,tabs:s.tabs.map(t=>t.id===(change==='anchor'?2:3)?{...t,index:7}:t)});
    expect(await createPlacementExecutor({port:f.port}).execute(f.plan,f.guard)).toEqual({kind:'skipped',reason:'state-changed'}); expect(f.calls).toEqual([]);
  });
  it('rejection preserves cause and acknowledged effects',async()=>{
    const cause={message:'dragging'}; const f=setup(); f.port.moveTab=async()=>{throw cause;};
    expect(await createPlacementExecutor({port:f.port}).execute(f.plan,f.guard)).toMatchObject({kind:'failed',phase:'move',cause,effects:[{phase:'move',outcome:'uncertain'}]});
    const title=setup([tab(1,0)],[], 'Work'); title.port.setTitle=async()=>{throw cause;};
    expect(await createPlacementExecutor({port:title.port}).execute(title.plan,title.guard)).toMatchObject({kind:'failed',phase:'title',cause,effects:[{phase:'group',outcome:'verified',groupId:99},{phase:'title',outcome:'uncertain'}]});
    expect(title.snapshot.tabs.map(t=>t.id)).toEqual([1]);
  });
});

function deferred<T>() { let resolve!:(value:T)=>void; const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve}; }
it('every awaited observation and mutation can revoke further mutation through deferred ports',async()=>{
  for(const title of [undefined,'Work']) {
    const make=()=>setup([tab(1,0,{groupId:7}),tab(2,0,{windowId:20,groupId:8}),tab(3,1,{windowId:20,groupId:8,url:'https://other.test/'})],[{id:7,windowId:10},{id:8,windowId:20}],title);
    const probe=make();const steps:string[]=[];probe.boundary(async phase=>{steps.push(phase);});
    expect((await createPlacementExecutor({port:probe.port}).execute(probe.plan,probe.guard)).kind).toBe('placed');
    for(const [target,phase] of steps.entries()) {
      const f=make();const started=deferred<void>();const release=deferred<void>();let index=0;let callsAtBoundary:string[]=[];
      f.boundary(async()=>{if(index++===target){callsAtBoundary=[...f.calls];started.resolve();await release.promise;}});
      const pending=createPlacementExecutor({port:f.port}).execute(f.plan,f.guard);await started.promise;f.revoke();release.resolve();const result=await pending;
      expect(result.kind,`${title}:${target}:${phase}`).toBe(callsAtBoundary.length?'failed':'skipped');expect(f.calls).toEqual(callsAtBoundary);
    }
  }
});
it.each(['document','pin','pending','context','disappear','anchor-move','shared'])('a used anchor changes while document read is pending: %s',async(change)=>{
  const f=setup([tab(1,0),tab(2,1,{groupId:8}),tab(3,2,{url:'https://other.test/'})],[{id:8,windowId:10}]);
  const started=deferred<void>();const release=deferred<void>();const original=f.port.readDocument;
  f.port.readDocument=async id=>{if(id!==2)return original(id);started.resolve();await release.promise;return doc(id,change==='document'?{documentId:'replacement'}:{});};
  const pending=createPlacementExecutor({port:f.port}).execute(f.plan,f.guard);await started.promise;
  if(change==='shared')f.change(s=>({...s,groups:[{id:8,windowId:10,shared:true}]}));
  else if(change!=='document')f.change(s=>({...s,tabs:change==='disappear'?s.tabs.filter(t=>t.id!==2):s.tabs.map(t=>t.id===2?{...t,...(change==='pin'?{pinned:true}:change==='pending'?{pendingUrl:t.url!}:change==='context'?{incognito:true}:{index:2})}:change==='anchor-move'&&t.id===3?{...t,index:1}:t)}));
  release.resolve();expect((await pending).kind).toBe('skipped');expect(f.calls).toEqual([]);
});
it('shared destination appearing after acknowledged ungroup stops before moving or grouping',async()=>{
  const f=setup([tab(1,0,{groupId:7}),tab(2,0,{windowId:20,groupId:8})],[{id:7,windowId:10},{id:8,windowId:20}]);
  f.boundary(async phase=>{if(phase==='ungroup')f.change(s=>({...s,groups:s.groups.map(g=>g.id===8?{...g,shared:true}:g)}));});
  expect(await createPlacementExecutor({port:f.port}).execute(f.plan,f.guard)).toMatchObject({kind:'failed',effects:[{phase:'ungroup',outcome:'acknowledged'}]});expect(f.calls).toEqual(['ungroup']);
});
it('a rejected native promise remains awaited and retains the original cause',async()=>{
  const f=setup();const gate=deferred<void>();const started=deferred<void>();const cause={drag:true};let settled=false;
  f.port.moveTab=async()=>{started.resolve();await gate.promise;throw cause;};
  const pending=createPlacementExecutor({port:f.port}).execute(f.plan,f.guard).then(r=>{settled=true;return r;});await started.promise;f.revoke();await Promise.resolve();expect(settled).toBe(false);gate.resolve();const result=await pending;expect(result).toMatchObject({kind:'failed',phase:'move',effects:[{outcome:'uncertain'}]});if(result.kind==='failed')expect(result.cause).toBe(cause);
});

it('placement returns detached frozen final observation receipt',async()=>{
  const f=setup();const result=await createPlacementExecutor({port:f.port}).execute(f.plan,f.guard);if(result.kind!=='placed'&&result.kind!=='unchanged')throw Error('not placed');expect(result.snapshot).toEqual(f.snapshot);expect(result.snapshot).not.toBe(f.snapshot);expect(Object.isFrozen(result.snapshot)).toBe(true);expect(Object.isFrozen(result.snapshot.tabs)).toBe(true);expect(Object.isFrozen(result.snapshot.tabs[0])).toBe(true);
});
it('checkpoint awaits pending then repeats full preflight before every native call',async()=>{
  const f=setup();let before=false;const checkpoints={beforeMutation:async()=>{before=true;f.change(s=>({...s,tabs:s.tabs.map(t=>t.id===2?Object.defineProperty({...t},'pendingUrl',{value:undefined,enumerable:true}):t)}));},afterSettlement:async()=>{},afterVerification:async()=>{}};expect((await createPlacementExecutor({port:f.port,checkpoints}).execute(f.plan,f.guard)).kind).toBe('skipped');expect(before).toBe(true);expect(f.calls).toEqual([]);
});
it('afterSettlement runs on native rejection and cannot replace original rejection',async()=>{
  const f=setup();const cause={native:true};f.port.moveTab=async()=>{throw cause;};let settled=false;const checkpoints={beforeMutation:async()=>{},afterSettlement:async()=>{settled=true;throw Error('bookkeeping');},afterVerification:async()=>{throw Error('unexpected');}};const result=await createPlacementExecutor({port:f.port,checkpoints}).execute(f.plan,f.guard);expect(settled).toBe(true);expect(result.kind).toBe('failed');if(result.kind==='failed')expect(result.cause).toBe(cause);
});
