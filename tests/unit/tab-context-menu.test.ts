import { registerTabContextMenu } from '../../src/browser/tab-context-menu';
import { describe, expect, it, vi } from 'vitest';
import type { ControlStatus, TargetHint } from '../../src/controls/protocol';

const toggle = 'chromeReHome.toggleTabProtection';
const protect = 'chromeReHome.protectTab', unprotect = 'chromeReHome.unprotectTab';
function event() {
  const listeners: ((...args: any[]) => void)[] = [];
  return { addListener: (fn: (...args: any[]) => void) => listeners.push(fn), emit: (...args: any[]) => listeners.forEach(fn => fn(...args)), listeners };
}
function fixture() {
  const items = new Map<string, any>();
  const calls: { kind: string; id: string; properties?: any }[] = [];
  let lastError: { message: string } | undefined;
  let errorsRead = 0;
  let failCreate: string | undefined, failUpdate = false, unsupported = false;
  let held: (() => void) | undefined, hold = false;
  const runtime = { get lastError() { if (lastError) ++errorsRead; return lastError; }, onStartup: event(), onInstalled: event() };
  function complete(callback: () => void, error?: string) {
    const finish = () => { lastError = error ? { message: error } : undefined; callback(); lastError = undefined; };
    if (hold) { hold = false; held = finish; } else queueMicrotask(finish);
  }
  const contextMenus = {
    onClicked: event(),
    update(id: string, properties: any, callback: () => void) {
      calls.push({ kind: 'update', id, properties });
      if (unsupported) throw Error('unsupported tab context');
      if (!items.has(id) || failUpdate) { complete(callback, 'missing or failed'); return; }
      items.set(id, { ...items.get(id), ...properties }); complete(callback);
    },
    create(properties: any, callback: () => void) {
      calls.push({ kind: 'create', id: properties.id, properties });
      if (unsupported) throw Error('unsupported tab context');
      if (failCreate === properties.id || items.has(properties.id)) { complete(callback, 'creation failed'); return properties.id; }
      items.set(properties.id, { ...properties }); complete(callback); return properties.id;
    },
    remove(id: string, callback: () => void) { calls.push({ kind: 'remove', id }); items.delete(id); complete(callback); },
  };
  let phase: ControlStatus['phase'] = 'checking';
  const intents: { target: TargetHint }[] = [];
  const controls = { getStatus: (): ControlStatus => ({ version: {workerId:'worker',revision:0}, phase, savedEnabled:true }),
    toggleNativeTabProtected(target: TargetHint) { intents.push({target}); return Promise.resolve({kind:'ok' as const,status:controls.getStatus()}); } };
  const failure = vi.fn();
  return { api: { runtime, contextMenus } as unknown as Pick<typeof chrome, 'runtime' | 'contextMenus'>, runtime, contextMenus, items, calls, controls, intents, failure,
    setPhase(value: ControlStatus['phase']) { phase = value; }, unsupported() { unsupported = true; }, failCreate(id: string) { failCreate = id; }, failUpdate() { failUpdate = true; },
    hold() { hold = true; }, release() { held?.(); held = undefined; }, errorsRead: () => errorsRead };
}
async function register(f: ReturnType<typeof fixture>) {
  return registerTabContextMenu(f.api, f.controls, f.failure);
}
async function settled() { for (let i=0;i<30;i++) await Promise.resolve(); }
const tab = { id:42,windowId:7,incognito:false,active:false,highlighted:false,url:'https://private.test/' };

describe('native tab menu adapter', () => {
  it('registers listeners before first browser callback and creates only one tab-context toggle disabled while checking', async () => {
    const f=fixture(); f.hold(); await register(f);
    expect(f.contextMenus.onClicked.listeners).toHaveLength(1);
    expect(f.runtime.onStartup.listeners).toHaveLength(1); expect(f.runtime.onInstalled.listeners).toHaveLength(1);
    f.release(); await settled();
    expect([...f.items.values()]).toEqual([
      {id:toggle,title:'Toggle tab protection',contexts:['tab'],enabled:false},
    ]);
  });
  it.each(['active','paused','checking','blocked','unavailable'] as const)('uses actual %s readiness, independently of saved enabled', async phase => {
    const f=fixture(); const menu=await register(f); await settled(); f.setPhase(phase); menu.refresh(); await settled();
    expect([...f.items.values()].map(item=>item.enabled)).toEqual([['active','paused'].includes(phase)]);
  });
  it('copies the inactive clicked tab only, and synchronously invokes the atomic toggle even during cold readiness', async () => {
    const f=fixture(); await register(f); const mutable={...tab};
    f.contextMenus.onClicked.emit({menuItemId:toggle,checked:false,pageUrl:'https://private.test/'},mutable);
    expect(f.intents).toEqual([{target:{tabId:42,windowId:7,incognito:false}}]);
    mutable.id=99; f.contextMenus.onClicked.emit({menuItemId:toggle,checked:true},{...tab,incognito:true,highlighted:true});
    expect(f.intents).toEqual([{target:{tabId:42,windowId:7,incognito:false}},{target:{tabId:42,windowId:7,incognito:true}}]);
  });
  it.each([undefined,null,[],[tab],{}, {...tab,id:undefined},{...tab,id:-1},{...tab,id:2147483648},{...tab,id:1.5},{...tab,windowId:-1},{...tab,windowId:NaN},{...tab,incognito:undefined},{...tab,incognito:1}].map(value=>[value]))('ignores invalid tab metadata %j without a fallback', async value => {
    const f=fixture(); await register(f); f.contextMenus.onClicked.emit({menuItemId:toggle},value); expect(f.intents).toEqual([]);
  });
  it.each([undefined,null,[],{}, {menuItemId:'foreign'}, {menuItemId:protect}, {menuItemId:unprotect}, {menuItemId:1}, [{menuItemId:toggle}]].map(value=>[value]))('ignores unrelated or malformed click %j', async info => {
    const f=fixture(); await register(f); f.contextMenus.onClicked.emit(info,tab); expect(f.intents).toEqual([]);
  });
  it.each(['throw','reject'] as const)('contains native intent %s without leaking its error', async kind => {
    const f=fixture(); f.controls.toggleNativeTabProtected=()=>{if(kind==='throw')throw Error('sensitive URL');return Promise.reject(Error('sensitive URL'));};
    await register(f); f.contextMenus.onClicked.emit({menuItemId:toggle},tab); await settled(); expect(f.failure.mock.calls).toEqual([[]]);
  });
  it('reconciles persisted IDs and overlapping startup/install/status events without duplicate creation', async () => {
    const f=fixture(); f.items.set(protect,{id:protect,title:'old',contexts:['page']}); f.items.set(unprotect,{id:unprotect}); f.items.set(toggle,{id:toggle}); f.items.set('unrelated',{id:'unrelated'});
    f.hold(); const menu=await register(f); f.runtime.onInstalled.emit(); f.runtime.onStartup.emit(); menu.refresh(); f.setPhase('paused'); f.release(); await settled();
    expect([...f.items.keys()]).toEqual([toggle,'unrelated']);
    expect(f.items.get(toggle)).toMatchObject({title:'Toggle tab protection',contexts:['tab'],enabled:true});
    expect(f.calls.filter(c=>c.kind==='create')).toEqual([]);
    expect(f.calls.filter(c=>c.kind==='remove').map(c=>c.id)).toEqual([protect,unprotect]);
  });
  it('refreshes to the latest readiness when status changes during a menu update', async () => {
    const f=fixture(); const menu=await register(f); await settled(); f.hold(); f.setPhase('paused'); menu.refresh(); await settled(); f.setPhase('blocked'); menu.refresh(); f.release(); await settled();
    expect([...f.items.values()].map(item=>item.enabled)).toEqual([false]);
  });
  it.each(['unsupported','callback','update'] as const)('cleans up only owned partial items after %s failure and does not retry on status refresh', async failure => {
    const f=fixture(); f.items.set('other-feature',{id:'other-feature'});
    if(failure==='unsupported') f.unsupported();
    if(failure==='callback') f.failCreate(toggle);
    if(failure==='update') { f.items.set(toggle,{id:toggle}); f.failUpdate(); }
    const menu=await register(f); await settled();
    expect([...f.items.keys()]).toEqual(['other-feature']); expect(f.failure.mock.calls).toEqual([[]]);
    const count=f.calls.length; f.setPhase('paused'); menu.refresh(); f.runtime.onStartup.emit(); await settled(); expect(f.calls).toHaveLength(count);
    if(failure!=='unsupported') expect(f.errorsRead()).toBeGreaterThan(0);
  });
});
