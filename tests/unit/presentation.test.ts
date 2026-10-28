import { expect, it } from 'vitest';
import { planPresentation } from '../../src/planning/presentation';
const initial = { focusedWindowId: 10, activeTabs: [{windowId:10,tabId:1},{windowId:20,tabId:2}] };
it('requires first-observed active and corroborating unique focused source evidence, detached from caller state',()=>{
  const state=structuredClone(initial);
  const intent=planPresentation(1,10,true,state);
  expect(intent).toEqual({kind:'foreground',sourceWindowId:10,initial});
  state.activeTabs[0]!.tabId=99;
  expect(intent).toEqual({kind:'foreground',sourceWindowId:10,initial});
  expect(Object.isFrozen(intent)).toBe(true);
});
it.each([
  [false,initial], [undefined,initial], [true,undefined], [true,{...initial,focusedWindowId:20}],
  [true,{...initial,focusedWindowId:null}], [true,{...initial,activeTabs:[{windowId:10,tabId:3}]}],
  [true,{...initial,activeTabs:[...initial.activeTabs,{windowId:10,tabId:3}]}],
  [true,{...initial,activeTabs:[...initial.activeTabs,{windowId:30,tabId:1}]}],
  [true,{...initial,activeTabs:[{windowId:-1,tabId:1}]}]
] as const)('preserves unknown, background, or inconsistent attention: %j', (active,state)=>{
  expect(planPresentation(1,10,active,state)).toEqual({kind:'preserve'});
});
