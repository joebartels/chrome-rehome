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
