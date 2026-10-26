import { expect, it, vi } from 'vitest';
import { createPlacementAdapter } from '../../src/browser/placement';
it('native port forwards narrow exact calls and preserves shared/pending evidence',async()=>{
  const api={tabs:{query:vi.fn(async()=>[{id:1,windowId:10,index:0,groupId:3,pinned:false,incognito:false,active:true,pendingUrl:'https://pending.test/'}]),move:vi.fn(async()=>{}),ungroup:vi.fn(async()=>{}),group:vi.fn(async()=>3)},tabGroups:{query:vi.fn(async()=>[{id:3,windowId:10,title:'Work',shared:true,collapsed:true,color:'blue'}]),update:vi.fn(async()=>{})},webNavigation:{getFrame:vi.fn(async()=>({documentId:'doc',url:'https://example.com/',documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1,errorOccurred:false}))}};
  const port=createPlacementAdapter(api as unknown as Pick<typeof chrome,'tabs'|'tabGroups'|'webNavigation'>);
  const snapshot=await port.read();expect(Object.isFrozen(snapshot.tabs[0])).toBe(true);expect(Object.isFrozen(snapshot.groups)).toBe(true);expect(snapshot).toMatchObject({tabs:[{pendingUrl:'https://pending.test/'}],groups:[{shared:true}]});
  expect(api.tabs.query).toHaveBeenCalledWith({windowType:'normal'});
  expect(await port.readDocument(1)).toMatchObject({tabId:1,documentId:'doc'});expect(api.webNavigation.getFrame).toHaveBeenCalledWith({tabId:1,frameId:0});
  await port.moveTab(1,20,3);await port.ungroupTab(1);await port.groupTab(1,{kind:'existing',windowId:20,groupId:8});await port.groupTab(1,{kind:'new',windowId:20,title:'Work'});await port.setTitle(8,'Work');
  expect(api.tabs.move.mock.calls).toEqual([[1,{windowId:20,index:3}]]);expect(api.tabs.ungroup.mock.calls).toEqual([[1]]);expect(api.tabs.group.mock.calls).toEqual([[{tabIds:[1],groupId:8}],[{tabIds:[1],createProperties:{windowId:20}}]]);expect(api.tabGroups.update.mock.calls).toEqual([[8,{title:'Work'}]]);
});
