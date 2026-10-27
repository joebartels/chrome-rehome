import { test, expect, chromium, type BrowserContext, type Page, type Worker, type TestInfo } from '@playwright/test';
import { createServer } from 'node:http';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import type { ReplacementJournal } from '../../src/execution/journal';
const key='chromeReHomeReplacementJournal';
const controlKey='chromeReHomeFixtureControl';
let server: ReturnType<typeof createServer>;
let origin:string;
test.beforeAll(async()=>{
  server=createServer((request,response)=>{const path=new URL(request.url!,'http://fixture.test');response.writeHead(200,{'content-type':'text/html'});response.end(`<title>Recovery trial</title><a href="${path.searchParams.get('to')??'/target'}">Navigate</a>`);});
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
test.afterAll(async()=>{await new Promise<void>((done,fail)=>server.close(error=>error?fail(error):done()));});
type Trial={context:BrowserContext;options:Page;worker:Worker;extensionId:string};
async function evidence(info:TestInfo,name:string,value:unknown){const path=info.outputPath(name+'.json');await writeFile(path,JSON.stringify(value,null,2));await info.attach(name,{path,contentType:'application/json'});}
async function trial(fixture:boolean,run:(f:Trial)=>Promise<void>){
  const root=await mkdtemp(join(tmpdir(),'chromerehome-recovery-'));
  let context:BrowserContext|undefined;
  try{
    let extension=resolve('dist');
    if(fixture){extension=join(root,'extension');await cp(resolve('dist'),extension,{recursive:true});await build({entryPoints:[resolve('tests/browser/replacement-recovery-fixture.ts')],outfile:join(extension,'background/index.js'),bundle:true,format:'esm',target:'chrome120'});}
    context=await chromium.launchPersistentContext(join(root,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const extensionId=new URL(worker.url()).host;const options=await context.newPage();await options.goto(`chrome-extension://${extensionId}/options/index.html`);await expect(options.getByRole('status')).toContainText('disabled');await run({context,options,worker,extensionId});
  }finally{await context?.close();await rm(root,{recursive:true,force:true});}
}
async function tabs(options:Page){return options.evaluate(()=>chrome.tabs.query({windowType:'normal'}));}
async function config(options:Page,title?:string,enabled=true){await options.evaluate(({origin,title,enabled})=>chrome.storage.local.set({chromeReHomeConfig:{schemaVersion:3,enabled,groupingRules:title?[{pattern:origin+'/*',group:title}]:[],duplicateRules:[]}}),{origin,title,enabled});await expect(options.getByRole('status')).toContainText(enabled?'enabled':'disabled');}
async function scenario(f:Trial,target='/target'){
  const older=await f.context.newPage();await older.goto(origin+target);const oldId=(await tabs(f.options)).find(t=>t.url===origin+target)!.id!;
  const winner=await f.context.newPage();await winner.goto(origin+'/before?to='+target);const winnerId=(await tabs(f.options)).find(t=>t.url===winner.url())!.id!;return {older,oldId,winner,winnerId};
}
async function journal(options:Page){return options.evaluate(async key=>(await chrome.storage.session.get(key))[key],key);}
async function seed(options:Page,winnerId:number,oldId:number,kind:string){
  return options.evaluate(async({key,winnerId,oldId,kind})=>{
    const winner=await chrome.tabs.get(winnerId);const older=await chrome.tabs.get(oldId);const document=await chrome.webNavigation.getFrame({tabId:winnerId,frameId:0});const oldDocument=await chrome.webNavigation.getFrame({tabId:oldId,frameId:0});
    const pendingKinds=['ungroup','move','group','title','remove'];
    const raw={version:1,operationId:crypto.randomUUID(),participants:[{tabId:winnerId,incognito:winner.incognito,documentId:document!.documentId},{tabId:oldId,incognito:older.incognito,documentId:oldDocument!.documentId}],completedPhase:kind==='remove'||kind==='placed'?'placed':kind==='removed'?'removed':'prepared',sequence:pendingKinds.includes(kind)||kind==='removed'?1:0,pending:pendingKinds.includes(kind)?{sequence:1,kind,tabId:kind==='remove'?oldId:winnerId}:null,removedTabIds:kind==='removed'?[oldId]:[],terminal:null};
    if(kind==='future')raw.version=2;if(kind==='malformed')Object.assign(raw,{secret:'unexpected'});
    await chrome.storage.session.set({[key]:raw});return raw;
  },{key,winnerId,oldId,kind});
}
async function stop(f:Trial){
  await f.worker.evaluate(()=>{Object.defineProperty(globalThis,'__recoveryOldRealm',{value:true});});
  const cdp=await f.context.newCDPSession(f.options);type Version={versionId:string;scriptURL:string;runningStatus:string;targetId?:string};const versions=new Map<string,Version>();
  cdp.on('ServiceWorker.workerVersionUpdated',({versions:changed}:{versions:Version[]})=>{for(const version of changed)versions.set(version.versionId,version);});
  await cdp.send('ServiceWorker.enable');await expect.poll(()=>[...versions.values()].find(v=>v.scriptURL.startsWith(`chrome-extension://${f.extensionId}/`)&&v.runningStatus==='running')).toBeTruthy();const original=[...versions.values()].find(v=>v.scriptURL.startsWith(`chrome-extension://${f.extensionId}/`)&&v.runningStatus==='running')!;
  await cdp.send('ServiceWorker.stopWorker',{versionId:original.versionId});await expect.poll(()=>versions.get(original.versionId)?.runningStatus).toBe('stopped');
  return {async restarted(info:TestInfo){await expect.poll(()=>versions.get(original.versionId)?.runningStatus).toBe('running');expect(await f.worker.evaluate(()=>Reflect.has(globalThis,'__recoveryOldRealm'))).toBe(false);await evidence(info,'actual-worker-restart',{chromium:f.context.browser()!.version(),stoppedVersion:original.versionId,originalTarget:original.targetId,restartedTarget:versions.get(original.versionId)?.targetId,observedStopped:true,freshRealm:true});await cdp.detach();}};
}
for(const kind of ['ungroup','move','group','title','remove','future','malformed']){
  test(`seeded production recovery quarantines ${kind} byte-for-byte across real worker restart`,async({},info)=>trial(false,async f=>{
    const s=await scenario(f);await config(f.options);const raw=await seed(f.options,s.winnerId,s.oldId,kind);const bytes=JSON.stringify(await journal(f.options));const before=await tabs(f.options);const worker=await stop(f);
    await s.winner.getByRole('link').click();await worker.restarted(info);
    const second=await f.context.newPage();await second.goto(origin+'/second-before');await second.getByRole('link').click();
    // A bounded observation verifies two real eligible commits did not admit automatic mutation.
    await new Promise(done=>setTimeout(done,1000));
    expect(JSON.stringify(await journal(f.options))).toBe(bytes);const after=await tabs(f.options);expect(after.find(t=>t.id===s.winnerId)).toMatchObject({windowId:before.find(t=>t.id===s.winnerId)!.windowId,groupId:-1,index:before.find(t=>t.id===s.winnerId)!.index});expect(after.some(t=>t.id===s.oldId)).toBe(true);expect(after.some(t=>t.url===second.url())).toBe(true);
    await config(f.options,undefined,false);await config(f.options);expect(await journal(f.options)).toEqual(raw);await evidence(info,'seeded-journal-evidence',{kind,record:raw,preserved:await journal(f.options),before,after,chromium:f.context.browser()!.version()});
  }));
}
for(const phase of ['placed','removed']){
  test(`seeded production settled ${phase} abandons without replay then fresh closure works`,async({},info)=>trial(false,async f=>{
    const s=await scenario(f);await config(f.options);await seed(f.options,s.winnerId,s.oldId,phase);const worker=await stop(f);
    // A distinct ordinary link wakes recovery without introducing another old-target replacement.
    const wake=await f.context.newPage();await wake.goto(origin+'/wake?to=/wake-target');await wake.getByRole('link').click();await worker.restarted(info);await expect.poll(()=>journal(f.options)).toBeUndefined();expect((await tabs(f.options)).some(t=>t.id===s.oldId)).toBe(true);
    await config(f.options,undefined,false);const fresh=await scenario(f,'/fresh-target');await config(f.options);await fresh.winner.getByRole('link').click();await expect.poll(async()=>(await tabs(f.options)).some(t=>t.id===fresh.oldId)).toBe(false);expect((await tabs(f.options)).some(t=>t.id===s.oldId)).toBe(true);
  }));
}

async function arm(options:Page,at:string,fault?:string){const token=crypto.randomUUID();await options.evaluate(async({controlKey,at,token,fault})=>{await chrome.storage.session.remove(['chromeReHomeFixtureReached','chromeReHomeFixtureDone']);await chrome.storage.session.set({[controlKey]:{at,token,...(fault?{fault}:{})}});},{controlKey,at,token,fault});return token;}
async function reached(options:Page,token:string){await expect.poll(()=>options.evaluate(async()=> ((await chrome.storage.session.get('chromeReHomeFixtureReached')).chromeReHomeFixtureReached as {token?:string}|undefined)?.token)).toBe(token);}
async function release(options:Page){await options.evaluate(async key=>{const c=(await chrome.storage.session.get(key))[key] as {at:string;token:string};await chrome.storage.session.set({[key]:{...c,release:true}});},controlKey);}
async function done(options:Page){await expect.poll(()=>options.evaluate(async()=> (await chrome.storage.session.get('chromeReHomeFixtureDone')).chromeReHomeFixtureDone)).toBeTruthy();}
async function phaseScenario(f:Trial,title?:string){
  const s=await scenario(f);const passive=await f.context.newPage();await passive.goto(origin+'/target');const duplicateIds=(await tabs(f.options)).filter(t=>t.url===origin+'/target').map(t=>t.id!);
  await f.options.evaluate(async({winnerId,oldId})=>{const source=await chrome.windows.create({tabId:winnerId,focused:false});await chrome.tabs.group({tabIds:[winnerId],createProperties:{windowId:source!.id!}});const group=await chrome.tabs.group({tabIds:[oldId],createProperties:{windowId:(await chrome.tabs.get(oldId)).windowId}});await chrome.tabGroups.update(group,{title:'Inherited'});},{winnerId:s.winnerId,oldId:s.oldId});
  const state=await tabs(f.options);expect(state.find(t=>t.id===s.winnerId)!.windowId).not.toBe(state.find(t=>t.id===s.oldId)!.windowId);
  await config(f.options,title);return {...s,passive,duplicateIds};
}
// Every entry below stops a real worker after an actual durable journal write in the fixture.
const phases=[
  'prepared','pending:ungroup:1','settled:ungroup:1','verified:ungroup:1',
  'pending:move:2','settled:move:2','verified:move:2',
  'pending:group:3','settled:group:3','verified:group:3','placed',
  'pending:remove:4','closure:native-fulfilled','settled:remove:4','verified:remove:4','terminal'
];
for(const phase of phases){
  test(`actual phase fixture worker termination after ${phase} never replays`,async({},info)=>trial(true,async f=>{
    const s=await phaseScenario(f);const token=await arm(f.options,phase);await s.winner.getByRole('link').click();await reached(f.options,token);const raw=await journal(f.options) as ReplacementJournal;const survivors=(await tabs(f.options)).filter(t=>s.duplicateIds.includes(t.id!)).map(t=>t.id!);const worker=await stop(f);
    // Disable the fixture gate only; public configuration stays enabled for recovery admission.
    await f.options.evaluate(key=>chrome.storage.session.remove(key),controlKey);
    const wake=await f.context.newPage();await wake.goto(origin+'/wake?to=/new-wake');await wake.getByRole('link').click();await worker.restarted(info);
    if(raw.pending){await new Promise(done=>setTimeout(done,1000));expect(await journal(f.options)).toEqual(raw);}else await expect.poll(()=>journal(f.options)).toBeUndefined();
    expect((await tabs(f.options)).filter(t=>s.duplicateIds.includes(t.id!)).map(t=>t.id!)).toEqual(survivors);
    await evidence(info,'phase-evidence',{phase,record:raw,survivors,after:await tabs(f.options),chromium:f.context.browser()!.version(),nativeOutstanding:false,nativeRemoveIssued:phase==='closure:native-fulfilled',pendingMeaning:phase==='closure:native-fulfilled'?'native remove already fulfilled; wrapper promise held before settlement checkpoint':'durable-write gate; not native-in-flight proof'});
  }));
}
for(const phase of ['pending:group:2','settled:group:2','verified:group:2','pending:title:3','settled:title:3','verified:title:3']){
  test(`actual configured phase fixture termination after ${phase}`,async({},info)=>trial(true,async f=>{
    const s=await phaseScenario(f,'Work');const token=await arm(f.options,phase);await s.winner.getByRole('link').click();await reached(f.options,token);const raw=await journal(f.options) as ReplacementJournal;const worker=await stop(f);await f.options.evaluate(key=>chrome.storage.session.remove(key),controlKey);const wake=await f.context.newPage();await wake.goto(origin+'/wake?to=/wake-target');await wake.getByRole('link').click();await worker.restarted(info);
    if(raw.pending){await new Promise(done=>setTimeout(done,1000));expect(await journal(f.options)).toEqual(raw);}else await expect.poll(()=>journal(f.options)).toBeUndefined();expect((await tabs(f.options)).filter(t=>s.duplicateIds.includes(t.id!))).toHaveLength(2);await evidence(info,'phase-evidence',{phase,record:raw,after:await tabs(f.options),chromium:f.context.browser()!.version(),nativeOutstanding:false});
  }));
}
for(const at of ['placed','pending:remove:4','closure:document','closure:snapshot','closure:native-fulfilled','verified:remove:4']){
  for(const change of ['navigate','reload','disable','remove-other','competing']){
    test(`controlled fixture ${change} during ${at} stops subsequent closure`,async()=>trial(true,async f=>{
      const s=await phaseScenario(f);const token=await arm(f.options,at);await s.winner.getByRole('link').click();await reached(f.options,token);const before=(await tabs(f.options)).filter(t=>s.duplicateIds.includes(t.id!)).map(t=>t.id!);
      const passiveId=before.find(id=>id!==s.oldId)??before[0]!;const passive=f.context.pages().find(p=>p===s.passive)!;
      if(change==='navigate')await passive.goto(origin+'/changed');else if(change==='reload')await passive.reload();else if(change==='disable')await config(f.options,undefined,false);else if(change==='remove-other')await f.options.evaluate(id=>chrome.tabs.remove(id),passiveId);else{const competing=await f.context.newPage();await competing.goto(origin+'/competing?to=/target');await competing.getByRole('link').click();}
      // Disable after event delivery prevents a newly queued competing replacement from becoming independent work.
      if(change==='competing')await config(f.options,undefined,false);await release(f.options);await done(f.options);
      const survivors=(await tabs(f.options)).filter(t=>s.duplicateIds.includes(t.id!)).map(t=>t.id!);expect(survivors).toEqual(before.filter(id=>change!=='remove-other'||id!==passiveId));
    }));
  }
}
for(const fault of ['remove-reject','settled-write']){
  test(`controlled fixture simulated ${fault} stops survivors`,async()=>trial(true,async f=>{
    const s=await phaseScenario(f);await arm(f.options,'never',fault);await s.winner.getByRole('link').click();await done(f.options);expect((await tabs(f.options)).filter(t=>s.duplicateIds.includes(t.id!))).toHaveLength(2);if(fault==='settled-write')expect((await journal(f.options) as ReplacementJournal).pending).not.toBeNull();
  }));
}

for(const phase of ['pending:move:4','settled:move:4','verified:move:4']){
  test(`actual final-reorder fixture termination after ${phase}`,async({},info)=>trial(true,async f=>{
    const s=await phaseScenario(f);await config(f.options,undefined,false);const member=await f.context.newPage();await member.goto(origin+'/unrelated-member');const memberId=(await tabs(f.options)).find(t=>t.url===member.url())!.id!;
    await f.options.evaluate(async({memberId,oldId})=>{await chrome.tabs.group({tabIds:[memberId],groupId:(await chrome.tabs.get(oldId)).groupId});},{memberId,oldId:s.oldId});
    await config(f.options);const token=await arm(f.options,phase);await s.winner.getByRole('link').click();await reached(f.options,token);const raw=await journal(f.options) as ReplacementJournal;const worker=await stop(f);await f.options.evaluate(key=>chrome.storage.session.remove(key),controlKey);const wake=await f.context.newPage();await wake.goto(origin+'/wake?to=/wake-target');await wake.getByRole('link').click();await worker.restarted(info);if(raw.pending){await new Promise(done=>setTimeout(done,1000));expect(await journal(f.options)).toEqual(raw);}else await expect.poll(()=>journal(f.options)).toBeUndefined();expect((await tabs(f.options)).filter(t=>s.duplicateIds.includes(t.id!))).toHaveLength(2);expect((await tabs(f.options)).some(t=>t.id===memberId)).toBe(true);await evidence(info,'phase-evidence',{phase,record:raw,after:await tabs(f.options),chromium:f.context.browser()!.version(),nativeOutstanding:false});
  }));
}
