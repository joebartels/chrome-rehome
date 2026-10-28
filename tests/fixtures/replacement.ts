import { createReplacementJournal, type ReplacementJournal } from '../../src/execution/journal';
import type { ReplacementPort } from '../../src/execution/replacement';
import type { PlacementSnapshot } from '../../src/planning/replacement';
import { decision, doc, tab } from './placement';
export function deferred<T>() {
  let resolve!: (value:T)=>void;
  let reject!: (cause:unknown)=>void;
  const promise=new Promise<T>((done,fail)=>{resolve=done;reject=fail;});
  return {promise,resolve,reject};
}
export function replacementFixture(tabs=[tab(2,0),tab(1,1),tab(3,0,{windowId:20})], groups: PlacementSnapshot['groups']=[], title?:string) {
  const plan=decision(tabs,[...groups],title);
  if(plan.kind!=='place')throw Error(plan.reason);
  let snapshot: PlacementSnapshot=structuredClone({tabs,groups});
  let stored: unknown;
  let current=true;
  let boundary: (name:string)=>Promise<void>=async()=>{};
  const calls: string[]=[];
  const writes: ReplacementJournal[]=[];
  const documents=new Map(tabs.map(t=>[t.id,doc(t.id,{url:t.url!})]));
  const removed:number[]=[];
  const expected:number[]=[];
  function normalize(next:PlacementSnapshot) {
    snapshot={tabs:[...new Set(next.tabs.map(t=>t.windowId))].flatMap(windowId=>next.tabs.filter(t=>t.windowId===windowId).sort((a,b)=>a.index-b.index).map((t,index)=>({...t,index}))),groups:next.groups.filter(g=>next.tabs.some(t=>t.groupId===g.id))};
  }
  const port:ReplacementPort={
    async readPresentation(){return undefined;},
    async activateTab(){throw Error('unexpected activate');},
    async focusWindow(){throw Error('unexpected focus');},
    async read(){await boundary('snapshot');return structuredClone(snapshot);},
    async readDocument(id){await boundary('document:'+id);return documents.get(id);},
    async ungroupTab(id){calls.push('ungroup');snapshot={...snapshot,tabs:snapshot.tabs.map(t=>t.id===id?{...t,groupId:-1}:t)};normalize(snapshot);await boundary('native:ungroup');},
    async moveTab(id,windowId,index){calls.push('move');const winner=snapshot.tabs.find(t=>t.id===id)!;const rest=snapshot.tabs.filter(t=>t.id!==id);const destination=rest.filter(t=>t.windowId===windowId).sort((a,b)=>a.index-b.index);destination.splice(index,0,{...winner,windowId,groupId:winner.windowId===windowId?winner.groupId:-1});normalize({tabs:[...rest.filter(t=>t.windowId!==windowId),...destination.map((t,index)=>({...t,index}))],groups:snapshot.groups});await boundary('native:move');},
    async groupTab(id,destination){calls.push('group');const groupId=destination.kind==='existing'?destination.groupId:99;snapshot={tabs:snapshot.tabs.map(t=>t.id===id?{...t,groupId}:t),groups:destination.kind==='existing'?snapshot.groups:[...snapshot.groups,{id:groupId,windowId:destination.windowId,title:''}]};normalize(snapshot);await boundary('native:group');return groupId;},
    async setTitle(id,title){calls.push('title');snapshot={...snapshot,groups:snapshot.groups.map(g=>g.id===id?{...g,title}:g)};await boundary('native:title');},
    async removeTab(id){calls.push('remove:'+id);removed.push(id);normalize({...snapshot,tabs:snapshot.tabs.filter(t=>t.id!==id)});await boundary('native:remove');}
  };
  const storage={
    async read(){await boundary('journal:read');return stored;},
    async write(value:ReplacementJournal){stored=structuredClone(value);writes.push(value);await boundary('journal:'+(value.pending?`pending:${value.pending.kind}`:value.terminal??value.completedPhase));},
    async clear(){await boundary('journal:clear');stored=undefined;}
  };
  const journal=createReplacementJournal({storage,createOperationId:()=> 'operation'});
  return {plan,port,journal,storage,calls,writes,removed,expected,documents,guard:{isCurrent:()=>current,expectRemoval:(id:number)=>{if(!current)throw Error('stale');expected.push(id);}},
    revoke(){current=false;},boundary(fn:(name:string)=>Promise<void>){boundary=fn;},change(fn:(s:PlacementSnapshot)=>PlacementSnapshot){snapshot=fn(snapshot);},
    get snapshot(){return snapshot;},get stored(){return stored;},seed(raw:unknown){stored=raw;}};
}

// Chromium deactivates an active cross-window transfer and picks a source successor.
// The destination selection and focus stay unchanged unless the source disappears.
export function foregroundFixture({preserve=false,lone=false,grouped=false}={}) {
  const f=replacementFixture([tab(1,0,{active:!preserve}),...(lone?[]:[tab(4,1,{active:preserve,url:'https://source.test/'})]),
    tab(2,0,{windowId:20,active:false,groupId:grouped?8:-1}),tab(3,1,{windowId:20,active:true,url:'https://spare.test/'})],
    grouped?[{id:8,windowId:20,title:'Manual',collapsed:true} as never]:[]);
  let focusedWindowId=10;
  const state=()=>({focusedWindowId,activeTabs:f.snapshot.tabs.filter(t=>t.active).map(t=>({windowId:t.windowId,tabId:t.id}))});
  const plan={...f.plan,presentation:preserve?{kind:'preserve' as const}:{kind:'foreground' as const,sourceWindowId:10,initial:state()}};
  f.port.readPresentation=async()=>state();
  const move=f.port.moveTab;
  f.port.moveTab=async(id,windowId,index)=>{
    const original=f.snapshot.tabs.find(t=>t.id===id)!;
    await move(id,windowId,index);
    if(original.windowId!==windowId){
      const successor=f.snapshot.tabs.find(t=>t.windowId===original.windowId);
      f.change(s=>({...s,tabs:s.tabs.map(t=>t.id===id?{...t,active:false}:original.active&&t.id===successor?.id?{...t,active:true}:t)}));
      if(!successor)focusedWindowId=windowId;
    }
  };
  f.port.activateTab=async id=>{
    f.calls.push('activate');const winner=f.snapshot.tabs.find(t=>t.id===id)!;
    f.change(s=>({...s,tabs:s.tabs.map(t=>t.windowId===winner.windowId?{...t,active:t.id===id}:t),groups:s.groups.map(g=>g.id===winner.groupId?{...g,collapsed:false}:g)}));
  };
  f.port.focusWindow=async id=>{f.calls.push('focus');focusedWindowId=id;};
  return {...f,plan,get snapshot(){return f.snapshot;},get stored(){return f.stored;},attention:state,
    focus:(id:number)=>{focusedWindowId=id;},select:(windowId:number,id:number)=>f.change(s=>({...s,tabs:s.tabs.map(t=>t.windowId===windowId?{...t,active:t.id===id}:t)}))};
}
