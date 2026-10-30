import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type MenuTrace = { kind: string; id: string; enabled?: boolean; contexts?: string[]; failed: boolean };
declare global {
  var menuBoundary: { realm: string; trace: MenuTrace[]; click(info: unknown, tab: unknown): void };
}
// This is an API-boundary integration fixture, not evidence of a native UI click.
// Keep Chrome's real menu APIs/storage/documents and the packaged worker unchanged;
// capture its callback only to supply explicit event metadata in portable cases.
async function fixture(run: (context: BrowserContext, worker: Worker, id: string) => Promise<void>, unsupported = false) {
  const root=await mkdtemp(join(tmpdir(),'chromerehome-menu-boundary-'));
  let context: BrowserContext | undefined;
  try {
    const extension=join(root,'extension'); await cp(resolve('dist'),extension,{recursive:true});
    const path=join(extension,'background/index.js');
    const instrumentation=`
      globalThis.menuBoundary={realm:crypto.randomUUID(),trace:[],click(){throw Error('No menu listener');}};
      const registerMenuClick=chrome.contextMenus.onClicked.addListener.bind(chrome.contextMenus.onClicked);
      chrome.contextMenus.onClicked.addListener=listener=>{menuBoundary.click=listener;registerMenuClick(listener);};
      for(const kind of ['create','update','remove']) {
        const original=chrome.contextMenus[kind].bind(chrome.contextMenus);
        chrome.contextMenus[kind]=(...args)=>{
          const properties=kind==='create'?args[0]:kind==='update'?args[1]:{};
          if(${unsupported}&&properties.contexts?.includes('tab'))throw Error('Unsupported context');
          const callback=args.pop();
          return original(...args,()=>{
            menuBoundary.trace.push({kind,id:kind==='create'?properties.id:args[0],enabled:properties.enabled,contexts:properties.contexts,failed:!!chrome.runtime.lastError});
            callback();
          });
        };
      }
    `;
    await writeFile(path,instrumentation+await readFile(path,'utf8'));
    context=await chromium.launchPersistentContext(join(root,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    await context.route('https://menu-boundary.test/**',route=>route.fulfill({contentType:'text/html',body:'<title>Menu boundary</title><h1>Owned fixture</h1>'}));
    await run(context,worker,new URL(worker.url()).host);
  } finally { await context?.close(); await rm(root,{recursive:true,force:true}); }
}
const ids=['chromeReHome.toggleTabProtection'];
async function badge(worker: Worker, tabId: number) {
  return worker.evaluate(async tabId => ({ text: await chrome.action.getBadgeText({tabId}), title: await chrome.action.getTitle({tabId}) }), tabId);
}
async function enabled(worker: Worker) {
  return worker.evaluate(ids=>ids.map(id=>menuBoundary.trace.filter(t=>t.id===id&&!t.failed&&t.kind!=='remove').at(-1)?.enabled),ids);
}
test('packaged menu registers actual tab contexts and API-boundary intents affect only the inactive supplied tab',async({},info)=>fixture(async(context,worker,id)=>{
  await expect.poll(()=>enabled(worker)).toEqual([true]);
  expect(await worker.evaluate(()=>menuBoundary.trace.filter(t=>t.kind==='create'&&!t.failed).map(t=>t.contexts))).toEqual([['tab']]);
  const active=context.pages()[0]!;await active.goto('https://menu-boundary.test/A');
  const targetPage=await context.newPage();await targetPage.goto('https://menu-boundary.test/B');
  const {activeTab,target}=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});const activeTab=tabs.find(t=>t.url==='https://menu-boundary.test/A')!;const target=tabs.find(t=>t.url==='https://menu-boundary.test/B')!;await chrome.tabs.update(activeTab.id!,{active:true});return{activeTab,target:await chrome.tabs.get(target.id!)};});
  const snapshot=()=>worker.evaluate(async()=>({config:await chrome.storage.local.get(),tabs:(await chrome.tabs.query({})).map(({id,windowId,index,groupId,active,highlighted})=>({id,windowId,index,groupId,active,highlighted}))}));
  const before=await snapshot();
  expect(before.tabs.find(tab=>tab.id===target.id)?.active).toBe(false);
  expect(before.tabs.find(tab=>tab.id===activeTab.id)?.active).toBe(true);
  await worker.evaluate(tab=>menuBoundary.click({menuItemId:'chromeReHome.toggleTabProtection'},tab),target);
  await expect.poll(()=>worker.evaluate(async()=> (await chrome.storage.session.get('chromeReHomeProtections')).chromeReHomeProtections)).toEqual({version:1,tabs:[{tabId:target.id,incognito:false}]});
  await expect.poll(()=>enabled(worker)).toEqual([true]);
  expect(await snapshot()).toEqual(before);
  await expect.poll(()=>badge(worker,target.id!)).toEqual({text:'🔒',title:'ChromeReHome — tab protected'});
  expect(await badge(worker,activeTab.id!)).toEqual({text:'',title:'ChromeReHome'});
  const siblingPage=await context.newPage();await siblingPage.goto('https://menu-boundary.test/C');
  const sibling=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url==='https://menu-boundary.test/C')!);
  await worker.evaluate(async({a,b,c})=>{await chrome.tabs.highlight({windowId:b.windowId,tabs:[a,b.index,c.index]});},{a:activeTab.index,b:target,c:sibling});
  const highlighted=await snapshot();
  await worker.evaluate(async tabId=>menuBoundary.click({menuItemId:'chromeReHome.toggleTabProtection'},await chrome.tabs.get(tabId)),target.id!);
  await expect.poll(()=>worker.evaluate(async()=> (await chrome.storage.session.get('chromeReHomeProtections')).chromeReHomeProtections)).toEqual({version:1,tabs:[]});
  expect(await snapshot()).toEqual(highlighted);
  await expect.poll(()=>badge(worker,target.id!)).toEqual({text:'',title:'ChromeReHome'});
  // Navigate through Playwright before moving the tab: the first navigation of a
  // chrome.windows.create URL can escape the route and become an error document.
  const otherPage=await context.newPage(); await otherPage.goto('https://menu-boundary.test/other');
  const otherTab=await worker.evaluate(async()=>{
    const tab=(await chrome.tabs.query({})).find(tab=>tab.url==='https://menu-boundary.test/other')!;
    await chrome.windows.create({tabId:tab.id!,focused:false}); return chrome.tabs.get(tab.id!);
  });
  expect(await worker.evaluate(id=>chrome.webNavigation.getFrame({tabId:id,frameId:0}),otherTab.id!)).toMatchObject({errorOccurred:false});
  await worker.evaluate(tab=>menuBoundary.click({menuItemId:'chromeReHome.toggleTabProtection'},tab),otherTab);
  await expect.poll(()=>badge(worker,otherTab.id!)).toEqual({text:'🔒',title:'ChromeReHome — tab protected'});
  expect(await badge(worker,target.id!)).toEqual({text:'',title:'ChromeReHome'});
  expect(await worker.evaluate(()=>chrome.action.getBadgeText({}))).toBe('');
  await info.attach('api-boundary-only',{body:JSON.stringify({version:context.browser()!.version(),targetId:target.id,before,highlighted,nativeClick:false}),contentType:'application/json'});
}));
test('packaged read-only readiness refresh disables the toggle after journal failure without storage publication',async()=>fixture(async(context,worker,id)=>{
  await expect.poll(()=>enabled(worker)).toEqual([true]);
  await worker.evaluate(()=>chrome.storage.local.set({chromeReHomeConfig:{schemaVersion:4,enabled:true,groupingRules:[{enabled:true,pattern:'https://menu-boundary.test/*',group:'Menus'}],duplicateRules:[]}}));
  await expect.poll(()=>enabled(worker)).toEqual([true]);
  await worker.evaluate(()=>{const original=chrome.storage.session.set.bind(chrome.storage.session);chrome.storage.session.set=async values=>{if(Object.hasOwn(values,'chromeReHomeReplacementJournal'))throw Error('injected failure');await original(values);};});
  const page=context.pages()[0]!;await page.goto('https://menu-boundary.test/journal-failure');
  await expect.poll(()=>enabled(worker)).toEqual([false]);
  expect(await worker.evaluate(async()=> (await chrome.storage.session.get('chromeReHomeReplacementJournal')).chromeReHomeReplacementJournal)).toBeUndefined();
}));
test('actual worker restart updates persistent menu IDs and extension reload recreates exactly one toggle',async()=>fixture(async(context,worker,id)=>{
  await expect.poll(()=>enabled(worker)).toEqual([true]);
  const firstRealm=await worker.evaluate(()=>menuBoundary.realm);
  const targetPage=context.pages()[0]!; await targetPage.goto('https://menu-boundary.test/restart');
  const target=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(tab=>tab.url==='https://menu-boundary.test/restart')!);
  await worker.evaluate(tab=>menuBoundary.click({menuItemId:'chromeReHome.toggleTabProtection'},tab),target);
  await expect.poll(()=>badge(worker,target.id!)).toEqual({text:'🔒',title:'ChromeReHome — tab protected'});
  await targetPage.reload();
  expect(await worker.evaluate(async()=> (await chrome.storage.session.get('chromeReHomeProtections')).chromeReHomeProtections)).toEqual({version:1,tabs:[{tabId:target.id,incognito:false}]});
  await expect.poll(()=>badge(worker,target.id!)).toEqual({text:'🔒',title:'ChromeReHome — tab protected'});
  // Simulate an extension update carrying legacy menu IDs into the next worker.
  await worker.evaluate(()=>Promise.all(['chromeReHome.protectTab','chromeReHome.unprotectTab','unrelated-menu'].map(id=>new Promise<void>(resolve=>chrome.contextMenus.create({id,title:id,contexts:['page']},()=>resolve())))));
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/options/index.html`);
  const session=await context.newCDPSession(page);
  const versions=new Map<string,{versionId:string;scriptURL:string;runningStatus:string}>();
  session.on('ServiceWorker.workerVersionUpdated',({versions:changed})=>{for(const version of changed)versions.set(version.versionId,version);});
  await session.send('ServiceWorker.enable');
  await expect.poll(()=>[...versions.values()].find(v=>v.scriptURL===worker.url()&&v.runningStatus==='running')).toBeTruthy();
  const version=[...versions.values()].find(v=>v.scriptURL===worker.url()&&v.runningStatus==='running')!;
  await session.send('ServiceWorker.stopWorker',{versionId:version.versionId});
  await expect.poll(()=>versions.get(version.versionId)?.runningStatus).toBe('stopped');
  await page.evaluate(()=>chrome.runtime.sendMessage({kind:'get-status'}));
  await expect.poll(()=>versions.get(version.versionId)?.runningStatus).toBe('running');
  const restarted=worker;
  await expect.poll(()=>enabled(restarted)).toEqual([true]);
  const restartedRealm=await restarted.evaluate(()=>menuBoundary.realm);expect(restartedRealm).not.toBe(firstRealm);
  expect(await restarted.evaluate(()=>menuBoundary.trace.filter(t=>t.kind==='create'))).toEqual([]);
  expect(await restarted.evaluate(()=>menuBoundary.trace.filter(t=>t.kind==='remove'&&!t.failed).map(t=>t.id))).toEqual(['chromeReHome.protectTab','chromeReHome.unprotectTab']);
  await expect.poll(()=>badge(restarted,target.id!)).toEqual({text:'🔒',title:'ChromeReHome — tab protected'});
  expect(await restarted.evaluate(()=>new Promise<boolean>(resolve=>chrome.contextMenus.update('unrelated-menu',{title:'still here'},()=>resolve(!chrome.runtime.lastError))))).toBe(true);
  // Unpacked reload requires developer mode in this disposable profile, matching
  // the existing incognito/reload fixture. No personal browser setting changes.
  const manager=await context.newPage();await manager.goto('chrome://extensions');
  const developerMode=manager.locator('extensions-toolbar #devMode');
  if(!await developerMode.evaluate(element=>element.hasAttribute('checked')))await developerMode.click();
  await expect(developerMode).toHaveAttribute('checked');
  const ready=context.waitForEvent('serviceworker',{timeout:10000});
  await page.evaluate(()=>chrome.runtime.reload()).catch(()=>{});
  await expect.poll(()=>page.isClosed()).toBe(true);
  const reloaded=await ready;
  expect(await reloaded.evaluate(()=>menuBoundary.realm)).not.toBe(restartedRealm);
  await expect.poll(()=>enabled(reloaded)).toEqual([true]);
  expect(await reloaded.evaluate(()=>menuBoundary.trace.filter(t=>t.kind==='create'&&!t.failed).map(t=>t.id))).toEqual(ids);
  await expect.poll(()=>badge(reloaded,target.id!)).toEqual({text:'',title:'ChromeReHome'});
  await reloaded.evaluate(tab=>menuBoundary.click({menuItemId:'chromeReHome.toggleTabProtection'},tab),target);
  await expect.poll(()=>badge(reloaded,target.id!)).toEqual({text:'🔒',title:'ChromeReHome — tab protected'});
  await session.detach().catch(()=>{});
}));
test('unsupported tab context is contained and existing popup protection remains usable',async()=>fixture(async(context,worker,id)=>{
  const target=context.pages()[0]!;await target.goto('https://menu-boundary.test/target');
  const tab=await worker.evaluate(async()=> (await chrome.tabs.query({active:true}))[0]!);
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup/index.html`);
  await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),tab.id!);
  await expect(popup.getByRole('heading',{name:'Paused',exact:true})).toBeVisible();
  await expect(popup.getByRole('checkbox',{name:'Protect this tab'})).toBeEnabled();
  await popup.getByRole('checkbox',{name:'Protect this tab'}).click();await expect(popup.getByRole('checkbox',{name:'Protect this tab'})).toBeChecked();
  expect(await worker.evaluate(()=>menuBoundary.trace.filter(t=>t.kind==='create'&&!t.failed))).toEqual([]);
},true));
