import { attachActionPopup } from './action-popup';
import type { Config } from '../../src/config/schema';
import type { ProtectionValue } from '../../src/protections/state';
import { chromium, expect, test, type BrowserContext, type Page, type Worker, type TestInfo } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { activateOwnedBrowser } from './owned-browser-focus';

type Fixture = { context: BrowserContext; options: Page; popup: Page; worker: Worker; extensionId: string; target: Page; tabId: number };
async function fixture(run: (f: Fixture) => Promise<void>, headed = false) {
  const profile = await mkdtemp(join(tmpdir(), 'chromerehome-controls-'));
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext(profile, { channel:'chromium', headless:!headed,
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`] });
  try {
    if (headed) await activateOwnedBrowser(context);
    const worker=context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId=new URL(worker.url()).host;
    await context.route('https://controls.test/**', route => route.fulfill({contentType:'text/html',body:'<title>Controls trial</title><a href="/target">Navigate</a>'}));
    const options=await context.newPage(); await options.goto(`chrome-extension://${extensionId}/options/index.html`);
    const target=await context.newPage(); await target.goto('https://controls.test/before');
    const tabId=await options.evaluate(async () => (await chrome.tabs.query({})).find(tab=>tab.url==='https://controls.test/before')!.id!);
    const popup=await context.newPage(); await popup.setViewportSize({width:360,height:650}); await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
    await options.evaluate(id=>chrome.tabs.update(id,{active:true}),tabId);
    await expect(popup.getByRole('heading',{name:'Paused',exact:true})).toBeVisible();
    await expect(popup.getByRole('checkbox',{name:'Protect this tab'})).toBeEnabled();
    await run({context,options,popup,worker,extensionId,target,tabId});
  } finally { await context.close(); await rm(profile,{recursive:true,force:true}); }
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  const path=info.outputPath(name+'.png'); await page.screenshot({path,fullPage:true}); await info.attach(name,{path,contentType:'image/png'});
}
test('popup page prepares manual protection while paused, toggles global processing and preserves private rule draft', async ({},info) => fixture(async f => {
  const {popup,options,tabId}=f;
  await expect(popup.getByText(/Unsaved edits are not automatically detected/)).toBeVisible();
  await popup.getByRole('checkbox',{name:'Protect this tab'}).click();
  await expect(popup.getByRole('checkbox',{name:'Protect this tab'})).toBeChecked();
  expect(await options.evaluate(async()=> ((await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig as Config | undefined)?.enabled ?? false)).toBe(false);
  expect(await options.evaluate(async()=> ((await chrome.storage.session.get('chromeReHomeProtections')).chromeReHomeProtections as ProtectionValue).tabs)).toEqual([{tabId,incognito:false}]);
  await screenshot(popup,info,'paused-protected');
  await options.getByRole('button',{name:'Add grouping rule',exact:true}).click();
  const draft=options.getByRole('group',{name:'Grouping rule 1',exact:true});
  await draft.getByLabel(/pattern$/i).fill('https://draft.test/*'); await draft.getByLabel(/group name$/i).fill('Private unsaved draft');
  await popup.getByRole('button',{name:'Resume',exact:true}).click(); await expect(popup.getByRole('heading',{name:'Active',exact:true})).toBeVisible();
  await screenshot(popup,info,'active');
  await expect(draft.getByLabel(/group name$/i)).toHaveValue('Private unsaved draft');
  expect(await options.evaluate(async()=> ((await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig as Config).groupingRules)).toEqual([]);
  await popup.getByRole('button',{name:'Pause',exact:true}).click(); await expect(popup.getByRole('heading',{name:'Paused',exact:true})).toBeVisible();
  await popup.getByRole('checkbox',{name:'Protect this tab'}).click(); await expect(popup.getByRole('checkbox',{name:'Protect this tab'})).not.toBeChecked();
  await popup.evaluate(()=>{document.documentElement.style.fontSize='28px';});
  await popup.getByRole('button',{name:'Pause',exact:true}).focus();
  await popup.keyboard.press('Tab'); await expect(popup.getByRole('button',{name:'Resume',exact:true})).toBeFocused();
  await popup.keyboard.press('Shift+Tab'); await expect(popup.getByRole('button',{name:'Pause',exact:true})).toBeFocused();
  expect(await popup.getByRole('button',{name:'Pause',exact:true}).evaluate(element=>getComputedStyle(element).outlineStyle)).toBe('solid');
  expect(await popup.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(popup,info,'enlarged-keyboard');
}));
test('popup Pause prevents future grouping and closure; Resume admits only fresh navigation and preserves rules',async({},info)=>fixture(async f=>{
  const {popup,options,context}=f;
  const duplicateUrl='https://controls.test/target';
  const rules=[{enabled:true,pattern:duplicateUrl,group:'Controls'},{enabled:true,pattern:'https://controls.test/group-*',group:'Controls'}];
  const tabs=()=>options.evaluate(()=>chrome.tabs.query({}));
  const ids=async()=> (await tabs()).map(tab=>tab.id!).sort((a,b)=>a-b);
  const matchingIds=async()=> (await tabs()).filter(tab=>tab.url===duplicateUrl).map(tab=>tab.id!).sort((a,b)=>a-b);
  async function beforeIncoming(path:string) {
    const page=await context.newPage(); await page.goto('https://controls.test/'+path);
    const id=(await tabs()).find(tab=>tab.url===page.url())!.id!;
    return {page,id,before:page.url()};
  }
  await options.evaluate(groupingRules=>chrome.storage.local.set({chromeReHomeConfig:{schemaVersion:4,enabled:false,groupingRules,duplicateRules:[]}}),rules);
  await expect(popup.getByRole('heading',{name:'Paused',exact:true})).toBeVisible();
  await options.evaluate(()=>{
    const removed:number[]=[];
    (globalThis as unknown as {closureRemoved:number[]}).closureRemoved=removed;
    chrome.tabs.onRemoved.addListener(id=>removed.push(id));
  });
  const retained=await context.newPage(); await retained.goto(duplicateUrl);
  const initialIncoming=await context.newPage(); await initialIncoming.goto(duplicateUrl);
  const initialIds=await matchingIds(); expect(initialIds).toHaveLength(2);
  const anchorGroup=(await tabs()).find(tab=>tab.id===initialIds[0])!.groupId;
  await popup.getByRole('button',{name:'Resume',exact:true}).click(); await expect(popup.getByRole('heading',{name:'Active',exact:true})).toBeVisible();
  expect(await matchingIds()).toEqual(initialIds); // Resume cannot replay the paused duplicate opportunity.

  const active=await beforeIncoming('active-before');
  const beforeActive=await ids();
  await active.page.getByRole('link',{name:'Navigate'}).click();
  await expect.poll(matchingIds).toEqual([active.id]);
  expect(await ids()).toEqual(beforeActive.filter(id=>!initialIds.includes(id)));
  expect((await tabs()).find(tab=>tab.id===active.id)).toMatchObject({url:duplicateUrl,groupId:expect.any(Number)});
  expect((await tabs()).find(tab=>tab.id===active.id)!.groupId).toBe(anchorGroup); // Duplicate placement preserves the older anchor's manual grouping preference.
  expect(active.page.isClosed()).toBe(false);
  await active.page.goBack(); expect(active.page.url()).toBe(active.before);
  expect((await tabs()).find(tab=>tab.url===active.before)!.id).toBe(active.id);
  await active.page.goForward(); expect(active.page.url()).toBe(duplicateUrl);
  expect(await matchingIds()).toEqual([active.id]);

  const grouped=await context.newPage(); await grouped.goto('https://controls.test/group-only');
  await expect.poll(async()=> (await tabs()).find(tab=>tab.url===grouped.url())?.groupId ?? -1).toBeGreaterThanOrEqual(0);
  await popup.getByRole('button',{name:'Pause',exact:true}).click(); await expect(popup.getByRole('heading',{name:'Paused',exact:true})).toBeVisible();
  const untouched=await context.newPage(); await untouched.goto('https://controls.test/group-paused');
  expect((await tabs()).find(tab=>tab.url===untouched.url())!.groupId).toBe(-1);
  const paused=await beforeIncoming('paused-before');
  const beforePaused=await ids();
  await paused.page.getByRole('link',{name:'Navigate'}).click();
  const pausedIds=[active.id,paused.id].sort((a,b)=>a-b);
  expect(await matchingIds()).toEqual(pausedIds);
  expect(await ids()).toEqual(beforePaused);
  expect((await tabs()).find(tab=>tab.id===paused.id)!.groupId).toBe(-1);
  await popup.getByRole('button',{name:'Resume',exact:true}).click(); await expect(popup.getByRole('heading',{name:'Active',exact:true})).toBeVisible();
  expect(await matchingIds()).toEqual(pausedIds);
  expect(await ids()).toEqual(beforePaused);

  const resumed=await beforeIncoming('resumed-before');
  const beforeResumed=await ids();
  await resumed.page.getByRole('link',{name:'Navigate'}).click();
  await expect.poll(matchingIds).toEqual([resumed.id]);
  expect(await ids()).toEqual(beforeResumed.filter(id=>!pausedIds.includes(id)));
  expect(resumed.page.isClosed()).toBe(false);
  await resumed.page.goBack(); expect(resumed.page.url()).toBe(resumed.before);
  expect((await tabs()).find(tab=>tab.url===resumed.before)!.id).toBe(resumed.id);
  await resumed.page.goForward(); expect(resumed.page.url()).toBe(duplicateUrl);
  expect(await matchingIds()).toEqual([resumed.id]);
  const expectedRemoved=[...initialIds,...pausedIds].sort((a,b)=>a-b);
  await expect.poll(()=>options.evaluate(()=>(globalThis as unknown as {closureRemoved:number[]}).closureRemoved.slice().sort((a,b)=>a-b))).toEqual(expectedRemoved);
  await popup.getByRole('button',{name:'Pause',exact:true}).click(); await expect(popup.getByRole('heading',{name:'Paused',exact:true})).toBeVisible();
  expect(await options.evaluate(async()=> (await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig)).toEqual({schemaVersion:4,enabled:false,groupingRules:rules,duplicateRules:[]});
  await info.attach('popup-closure-cycle',{body:JSON.stringify({initialIds,activeIncomingId:active.id,pausedIds,resumedIncomingId:resumed.id,removedTabIds:expectedRemoved,activeHistoryBefore:active.before,resumedHistoryBefore:resumed.before,finalIds:await ids()}),contentType:'application/json'});
}));
test('popup reflects invalid protection and configuration state through read-only hints without overwriting data',async({},info)=>fixture(async({popup,options})=>{
  const corrupt={version:99,tabs:[]};
  await options.evaluate(value=>chrome.storage.session.set({chromeReHomeProtections:value}),corrupt);
  await expect(popup.getByRole('heading',{name:'Processing unavailable',exact:true})).toBeVisible();
  await expect(popup.getByRole('button',{name:'Pause',exact:true})).toBeEnabled(); await expect(popup.getByRole('button',{name:'Resume',exact:true})).toBeDisabled();
  await screenshot(popup,info,'unavailable');
  await options.evaluate(()=>chrome.storage.local.set({chromeReHomeConfig:{schemaVersion:99,enabled:true}}));
  await popup.getByRole('button',{name:'Pause',exact:true}).click();
  await expect(popup.getByRole('heading',{name:'Processing unavailable',exact:true})).toBeVisible();
  expect(await options.evaluate(async()=> (await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig)).toEqual({schemaVersion:99,enabled:true});
  expect(await options.evaluate(async()=> (await chrome.storage.session.get('chromeReHomeProtections')).chromeReHomeProtections)).toEqual(corrupt);
}));
test('failed production journal write emits blocked popup status even without a storage event',async({},info)=>fixture(async({popup,options,worker,target})=>{
  await options.evaluate(()=>chrome.storage.local.set({chromeReHomeConfig:{schemaVersion:4,enabled:true,groupingRules:[{enabled:true,pattern:'https://controls.test/*',group:'Controls'}],duplicateRules:[]}}));
  await expect(popup.getByRole('heading',{name:'Active',exact:true})).toBeVisible();
  await popup.evaluate(()=> {
    const signals: {keys:string[];phase:string}[]=[];
    (globalThis as unknown as {journalSignals:typeof signals}).journalSignals=signals;
    chrome.runtime.onMessage.addListener(message=>{if(message?.kind==='control-status-changed')void chrome.runtime.sendMessage({kind:'get-status'}).then(reply=>signals.push({keys:Object.keys(message),phase:reply.status.phase}));});
  });
  await worker.evaluate(()=> {const original=chrome.storage.session.set.bind(chrome.storage.session); chrome.storage.session.set=async values=>{if(Object.hasOwn(values,'chromeReHomeReplacementJournal'))throw Error('test journal failure');await original(values);};});
  await target.goto('https://controls.test/journal-failure');
  await expect(popup.getByRole('heading',{name:'Recovery blocked',exact:true})).toBeVisible();
  await expect(popup.getByRole('button',{name:'Resume',exact:true})).toBeDisabled(); await expect(popup.getByRole('checkbox',{name:'Protect this tab'})).toBeDisabled();
  await expect.poll(()=>popup.evaluate(()=> (globalThis as unknown as {journalSignals:{keys:string[];phase:string}[]}).journalSignals.some(signal=>signal.phase==='blocked'&&JSON.stringify(signal.keys)==='["kind"]'))).toBe(true);
  await screenshot(popup,info,'blocked');
  await popup.getByRole('button',{name:'Pause',exact:true}).click(); await expect(popup.getByRole('heading',{name:'Recovery blocked',exact:true})).toBeVisible();
  expect(await options.evaluate(async()=> ((await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig as Config).enabled)).toBe(false);
  expect(await options.evaluate(async()=> (await chrome.storage.session.get('chromeReHomeReplacementJournal')).chromeReHomeReplacementJournal)).toBeUndefined();
}));
test('unavailable current document read disables protection while global Pause and settings stay usable after close',async()=>fixture(async({popup,options,target,context,tabId,worker})=>{
  // Chromium can expose valid about:blank and chrome:// frames. Inject the actual
  // API read failure instead of assuming an unsupported scheme has no document.
  await worker.evaluate(id=>{const original=chrome.webNavigation.getFrame.bind(chrome.webNavigation);chrome.webNavigation.getFrame=async details=>{if(details.tabId===id)throw Error('test target document unavailable');return original(details);};},tabId);
  await target.goto('about:blank');
  await popup.getByRole('button',{name:'Refresh status',exact:true}).click();
  await expect(popup.getByRole('checkbox',{name:'Protect this tab'})).toBeDisabled();
  await expect(popup.getByRole('button',{name:'Pause',exact:true})).toBeEnabled(); await target.close();
  await popup.getByRole('button',{name:'Pause',exact:true}).click(); await expect(popup.getByRole('heading',{name:'Paused',exact:true})).toBeVisible();
  const before=context.pages().length; await popup.getByRole('button',{name:'Open settings',exact:true}).click();
  await expect.poll(()=>context.pages().length).toBeGreaterThanOrEqual(before);
  await expect(options.getByRole('heading',{name:'ChromeReHome installed'})).toBeVisible();
}));

test('native action popup uses the actual selected web tab and owned-profile incognito access',async({},info)=>fixture(async f=>{
  const {context,options,popup,tabId,extensionId}=f;
  await popup.close();
  await options.evaluate(async id=>{await chrome.tabs.update(id,{active:true});const tab=await chrome.tabs.get(id);await chrome.windows.update(tab.windowId,{focused:true});},tabId);
  // Test-only modern API. The production popup retains its Chrome 120 floor.
  await options.evaluate(()=>chrome.action.openPopup());
  const action=await attachActionPopup(context,`chrome-extension://${extensionId}/popup/index.html`);
  await expect.poll(action.heading).toBe('Paused'); await expect.poll(action.enabled).toBe(true);
  expect(await action.evaluate('document.documentElement.clientWidth')).toBe(360);
  expect(await action.evaluate('document.documentElement.scrollWidth > innerWidth')).toBe(false);
  await action.click('#protect'); await expect.poll(action.checked).toBe(true);
  await expect.poll(action.heading).toBe('Paused'); await action.screenshot(info,'native-action-paused-protected');
  await action.click('#resume'); await expect.poll(action.heading).toBe('Active'); await action.screenshot(info,'native-action-active');
  // Enlarge the actual action target, then use real CDP keyboard input in it.
  await action.evaluate('document.documentElement.style.fontSize="28px"');
  expect(await action.evaluate('getComputedStyle(document.body).fontSize')).toBe('28px');
  expect(await action.evaluate('document.documentElement.clientWidth')).toBe(360);
  expect(await action.evaluate('document.documentElement.scrollWidth > innerWidth')).toBe(false);
  await action.evaluate('document.querySelector("#pause").focus()');
  await action.press('Tab'); await expect.poll(()=>action.evaluate('document.activeElement.id')).toBe('protect'); // Resume is disabled while active.
  await action.press('Tab',true); await expect.poll(()=>action.evaluate('document.activeElement.id')).toBe('pause');
  expect(await action.evaluate('getComputedStyle(document.activeElement).outlineStyle')).toBe('solid');
  await action.screenshot(info,'native-action-enlarged-keyboard-active');
  await action.evaluate(`(() => {
    window.nativeKeyboardTrace=[];
    for (const type of ['keydown','keypress','keyup','click']) document.addEventListener(type,event=>{
      window.nativeKeyboardTrace.push({type:event.type,key:event.key,code:event.code,targetId:event.target.id,trusted:event.isTrusted,defaultPrevented:event.defaultPrevented});
    },true);
  })()`);
  await action.press('Enter');
  await info.attach('native-pause-enter-events',{body:JSON.stringify(await action.evaluate('window.nativeKeyboardTrace')),contentType:'application/json'});
  await expect.poll(action.heading).toBe('Paused');
  expect(await action.evaluate('window.nativeKeyboardTrace.some(event=>event.type==="keypress"&&event.key==="Enter"&&event.trusted&&event.targetId==="pause")')).toBe(true);
  expect(await action.evaluate('window.nativeKeyboardTrace.some(event=>event.type==="click"&&event.trusted&&event.targetId==="pause")')).toBe(true);
  await action.evaluate('document.querySelector("#pause").focus()');
  await action.press('Tab'); await expect.poll(()=>action.evaluate('document.activeElement.id')).toBe('resume');
  expect(await action.evaluate('getComputedStyle(document.activeElement).outlineStyle')).toBe('solid');
  expect(await action.evaluate('document.documentElement.scrollWidth > innerWidth')).toBe(false);
  await action.screenshot(info,'native-action-enlarged-keyboard-paused');
  await action.press('Enter'); await expect.poll(action.heading).toBe('Active');
  expect(await action.evaluate('window.nativeKeyboardTrace.some(event=>event.type==="keypress"&&event.key==="Enter"&&event.trusted&&event.targetId==="resume")')).toBe(true);
  expect(await action.evaluate('window.nativeKeyboardTrace.some(event=>event.type==="click"&&event.trusted&&event.targetId==="resume")')).toBe(true);
  await info.attach('native-keyboard-events',{body:JSON.stringify(await action.evaluate('window.nativeKeyboardTrace')),contentType:'application/json'});
  await action.close();
  const extensions=await context.newPage(); await extensions.goto('chrome://extensions/?id='+extensionId);
  const developerMode=extensions.locator('extensions-toolbar #devMode');
  if (!await developerMode.evaluate(element=>element.hasAttribute('checked'))) await developerMode.click();
  await expect(developerMode).toHaveAttribute('checked');
  const incognito=extensions.locator('extensions-detail-view #allow-incognito cr-toggle');
  await expect(incognito).toBeVisible(); await incognito.click();
  await expect(incognito).toHaveAttribute('checked');
  console.info('incognito detail state',await extensions.locator('extensions-detail-view').evaluate(element=>{const {state,disableReasons,incognitoAccess}=(element as unknown as {data:{state:unknown;disableReasons:unknown;incognitoAccess:unknown}}).data;return {state,disableReasons,incognitoAccess};}));
  // Chrome reloads the extension when incognito permission changes, closing its old pages.
  const reconnected=await context.newPage(); await reconnected.goto(`chrome-extension://${extensionId}/options/index.html`);
  await expect.poll(()=>reconnected.evaluate(()=>chrome.extension.isAllowedIncognitoAccess())).toBe(true);
  expect(await reconnected.evaluate(async()=> (await chrome.storage.session.get('chromeReHomeProtections')).chromeReHomeProtections)).toBeUndefined();
  await reconnected.evaluate(async id=>{await chrome.tabs.update(id,{active:true});await chrome.action.openPopup({windowId:(await chrome.tabs.get(id)).windowId});},tabId);
  const normalAgain=await attachActionPopup(context,`chrome-extension://${extensionId}/popup/index.html`);
  await expect.poll(normalAgain.enabled).toBe(true); await normalAgain.click('#protect'); await expect.poll(normalAgain.checked).toBe(true); await expect.poll(normalAgain.heading).toBe('Active'); await normalAgain.close();
  const privateWindow=await reconnected.evaluate(()=>chrome.windows.create({incognito:true,url:'https://controls.test/private',focused:true}));
  expect(privateWindow?.incognito).toBe(true);
  const privateTab=privateWindow!.tabs![0]!;
  await reconnected.evaluate(id=>chrome.action.openPopup({windowId:id}),privateWindow!.id!);
  const privateAction=await attachActionPopup(context,`chrome-extension://${extensionId}/popup/index.html`);
  await expect.poll(privateAction.heading).toBe('Active'); await expect.poll(privateAction.enabled).toBe(true); await expect.poll(privateAction.checked).toBe(false);
  await privateAction.click('#protect'); await expect.poll(privateAction.checked).toBe(true); await expect.poll(privateAction.heading).toBe('Active');
  const protectedTabs=await reconnected.evaluate(async()=> ((await chrome.storage.session.get('chromeReHomeProtections')).chromeReHomeProtections as ProtectionValue).tabs);
  expect(protectedTabs).toContainEqual({tabId,incognito:false}); expect(protectedTabs).toContainEqual({tabId:privateTab.id!,incognito:true});
  await privateAction.click('#pause'); await expect.poll(privateAction.heading).toBe('Paused');
  await privateAction.screenshot(info,'native-action-incognito');
  await privateAction.close();
  await info.attach('native-popup-contexts',{body:JSON.stringify({version:context.browser()!.version(),allowedIncognito:true,normalTabId:tabId,privateTabId:privateTab.id,protectedTabs}),contentType:'application/json'});
},true));

test('open popup reconnects after real worker restart, preserves session protection and exposes quarantined journal without reset',async({},info)=>fixture(async f=>{
  const {popup,options,context,extensionId,tabId}=f;
  await popup.getByRole('checkbox',{name:'Protect this tab'}).click(); await expect(popup.getByRole('checkbox',{name:'Protect this tab'})).toBeChecked();
  const cdp=await context.newCDPSession(options);
  type Version={versionId:string;scriptURL:string;runningStatus:string}; const versions=new Map<string,Version>();
  cdp.on('ServiceWorker.workerVersionUpdated',({versions:changed}:{versions:Version[]})=>{for(const v of changed)versions.set(v.versionId,v);});
  async function stop() {
    await cdp.send('ServiceWorker.enable');
    await expect.poll(()=>[...versions.values()].find(v=>v.scriptURL.startsWith(`chrome-extension://${extensionId}/`)&&v.runningStatus==='running')).toBeTruthy();
    const version=[...versions.values()].find(v=>v.scriptURL.startsWith(`chrome-extension://${extensionId}/`)&&v.runningStatus==='running')!;
    await cdp.send('ServiceWorker.stopWorker',{versionId:version.versionId}); await expect.poll(()=>versions.get(version.versionId)?.runningStatus).toBe('stopped');
  }
  try {
    await stop(); await popup.getByRole('button',{name:'Refresh status',exact:true}).click();
    await expect(popup.getByRole('heading',{name:'Paused',exact:true})).toBeVisible(); await expect(popup.getByRole('checkbox',{name:'Protect this tab'})).toBeChecked();
    expect(await options.evaluate(async()=> ((await chrome.storage.session.get('chromeReHomeProtections')).chromeReHomeProtections as ProtectionValue).tabs)).toEqual([{tabId,incognito:false}]);
    const corrupt={version:99,privateEvidence:'test-only preserved journal'};
    await options.evaluate(value=>chrome.storage.session.set({chromeReHomeReplacementJournal:value}),corrupt);
    await stop(); await popup.getByRole('button',{name:'Refresh status',exact:true}).click();
    await expect(popup.getByRole('heading',{name:'Recovery blocked',exact:true})).toBeVisible();
    await popup.getByRole('button',{name:'Pause',exact:true}).click(); await expect(popup.getByRole('heading',{name:'Recovery blocked',exact:true})).toBeVisible();
    expect(await options.evaluate(async()=> (await chrome.storage.session.get('chromeReHomeReplacementJournal')).chromeReHomeReplacementJournal)).toEqual(corrupt);
    await screenshot(popup,info,'quarantined-journal');
  } finally {await cdp.detach();}
}));
