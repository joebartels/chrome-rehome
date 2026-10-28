import { expect, it, vi } from 'vitest';
import { createPlacementAdapter } from '../../src/browser/placement';
it('native port forwards narrow exact calls and preserves shared/pending evidence',async()=>{
  const api={tabs:{query:vi.fn(async()=>[{id:1,windowId:10,index:0,groupId:3,pinned:false,incognito:false,active:true,pendingUrl:'https://pending.test/'}]),remove:vi.fn(async()=>{}),move:vi.fn(async()=>{}),ungroup:vi.fn(async()=>{}),group:vi.fn(async()=>3)},tabGroups:{query:vi.fn(async()=>[{id:3,windowId:10,title:'Work',shared:true,collapsed:true,color:'blue'}]),update:vi.fn(async()=>{})},webNavigation:{getFrame:vi.fn(async()=>({documentId:'doc',url:'https://example.com/',documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1,errorOccurred:false}))}};
  const port=createPlacementAdapter(api as unknown as Pick<typeof chrome,'tabs'|'tabGroups'|'webNavigation'|'windows'>);
  const snapshot=await port.read();expect(Object.isFrozen(snapshot.tabs[0])).toBe(true);expect(Object.isFrozen(snapshot.groups)).toBe(true);expect(snapshot).toMatchObject({tabs:[{pendingUrl:'https://pending.test/'}],groups:[{shared:true}]});
  expect(api.tabs.query).toHaveBeenCalledWith({windowType:'normal'});
  expect(await port.readDocument(1)).toMatchObject({tabId:1,documentId:'doc'});expect(api.webNavigation.getFrame).toHaveBeenCalledWith({tabId:1,frameId:0});
  await port.removeTab(2);await port.moveTab(1,20,3);await port.ungroupTab(1);await port.groupTab(1,{kind:'existing',windowId:20,groupId:8});await port.groupTab(1,{kind:'new',windowId:20,title:'Work'});await port.setTitle(8,'Work');
  expect(api.tabs.remove.mock.calls).toEqual([[2]]);expect(api.tabs.move.mock.calls).toEqual([[1,{windowId:20,index:3}]]);expect(api.tabs.ungroup.mock.calls).toEqual([[1]]);expect(api.tabs.group.mock.calls).toEqual([[{tabIds:[1],groupId:8}],[{tabIds:[1],createProperties:{windowId:20}}]]);expect(api.tabGroups.update.mock.calls).toEqual([[8,{title:'Work'}]]);
});

it('single-ID native removal rejection is preserved without retry',async()=>{
  const cause={native:true};const remove=vi.fn(async()=>{throw cause;});const port=createPlacementAdapter({tabs:{remove}} as unknown as Pick<typeof chrome,'tabs'|'tabGroups'|'webNavigation'|'windows'>);await expect(port.removeTab(42)).rejects.toBe(cause);expect(remove).toHaveBeenCalledExactlyOnceWith(42);
});

it('preserves even explicitly-present undefined native pendingUrl as unavailable evidence',async()=>{
  const raw=Object.defineProperty({id:1,windowId:10,index:0,groupId:-1,pinned:false,incognito:false,active:true,url:'https://example.com/'},'pendingUrl',{value:undefined,enumerable:true});
  const port=createPlacementAdapter({tabs:{query:async()=>[raw]},tabGroups:{query:async()=>[]}} as unknown as Pick<typeof chrome,'tabs'|'tabGroups'|'webNavigation'|'windows'>);const snapshot=await port.read();expect('pendingUrl' in snapshot.tabs[0]!).toBe(true);expect(snapshot.tabs[0]!.pendingUrl).toBeUndefined();
});

it('reads detached normal-window attention and forwards exact presentation mutations',async()=>{
  const windows=[{id:10,type:'normal',focused:true,tabs:[{id:1,windowId:10,active:true},{id:3,windowId:10,active:false}]},{id:20,type:'normal',focused:false,tabs:[{id:2,windowId:20,active:true}]}];
  const api={windows:{getAll:vi.fn(async()=>windows),update:vi.fn(async()=>{})},tabs:{update:vi.fn(async()=>{})}};
  const port=createPlacementAdapter(api as unknown as Parameters<typeof createPlacementAdapter>[0]);
  const state=await port.readPresentation();
  expect(state).toEqual({focusedWindowId:10,activeTabs:[{windowId:10,tabId:1},{windowId:20,tabId:2}]});
  expect(api.windows.getAll).toHaveBeenCalledExactlyOnceWith({populate:true,windowTypes:['normal']});
  windows[0]!.tabs[0]!.id=99;
  expect(state?.activeTabs[0]?.tabId).toBe(1);
  await port.activateTab(1);await port.focusWindow(20);
  expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith(1,{active:true});
  expect(api.windows.update).toHaveBeenCalledExactlyOnceWith(20,{focused:true});
});
it.each(['missing','multiple-focused','duplicate-active','duplicate-window','unavailable'])('unknown native attention suppresses presentation: %s',async kind=>{
  const one={id:10,type:'normal',focused:true,tabs:[{id:1,windowId:10,active:true}]};
  const port=createPlacementAdapter({windows:{getAll:async()=>{
    if(kind==='unavailable')throw Error('unavailable');
    if(kind==='missing')return [{...one,tabs:undefined}];
    if(kind==='multiple-focused')return [one,{id:20,type:'normal',focused:true,tabs:[{id:2,windowId:20,active:true}]}];
    if(kind==='duplicate-active')return [{...one,tabs:[...one.tabs,{id:3,windowId:10,active:true}]}];
    return [one,one];
  }}} as unknown as Parameters<typeof createPlacementAdapter>[0]);
  expect(await port.readPresentation()).toBeUndefined();
});
it.each(['activateTab','focusWindow'] as const)('preserves original %s native rejection identity',async method=>{
  const cause={native:true};const update=vi.fn(async()=>{throw cause;});
  const port=createPlacementAdapter({tabs:{update},windows:{update}} as unknown as Parameters<typeof createPlacementAdapter>[0]);
  await expect(port[method](1)).rejects.toBe(cause);expect(update).toHaveBeenCalledTimes(1);
});
