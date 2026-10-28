import { activateOwnedBrowser } from './owned-browser-focus';
import { test, expect, chromium, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let origin: string;
let server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>Placement trial</title><a href="/target">Navigate</a><button id="tone">Start audio</button><button id="history">History target</button><script>document.querySelector("#tone").onclick=()=>{const c=new AudioContext();const o=c.createOscillator();o.connect(c.destination);o.start();window.audio=c;};document.querySelector("#history").onclick=()=>history.pushState({},"","/target");</script>');
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  await new Promise<void>((done, fail) => server.close(e => e ? fail(e) : done()));
});

async function fixture(run: (context: BrowserContext, options: Page) => Promise<void>, headed = false, requireForeground = headed) {
  const profile = await mkdtemp(join(tmpdir(), 'chromerehome-placement-'));
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: !headed,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  try {
    if (requireForeground) await activateOwnedBrowser(context);
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const options = await context.newPage();
    await options.goto(`chrome-extension://${new URL(worker.url()).host}/options/index.html`);
    await run(context, options);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}

async function config(options: Page, title?: string, enabled = true) {
  await options.evaluate(({ origin, title, enabled }) => chrome.storage.local.set({
    chromeReHomeConfig: {
      schemaVersion: 4,
      enabled,
      groupingRules: title ? [{ enabled: true, pattern: origin + '/*', group: title }] : [],
      duplicateRules: []
    }
  }), { origin, title, enabled });
  await expect(options.getByRole('status')).toContainText(enabled ? 'enabled' : 'disabled');
}

async function tabs(options: Page) {
  return options.evaluate(() => chrome.tabs.query({ windowType: 'normal' }));
}

async function id(options: Page, page: Page) {
  const url = page.url();
  return (await tabs(options)).find(t => t.url === url)!.id!;
}

async function retain(options: Page, original: number[]) {
  expect((await tabs(options)).map(t => t.id).sort((a, b) => a! - b!))
    .toEqual([...original].sort((a, b) => a - b));
}

test('production grouping-only, history, retained tabs and disable', async () => fixture(async (context, options) => {
  const winner = await context.newPage();
  await winner.goto(origin + '/before');
  const winnerId = await id(options, winner);
  const original = (await tabs(options)).map(t => t.id!);
  await config(options, 'Trial');
  await winner.getByRole('link').click();
  await expect.poll(async () => (await tabs(options)).find(t => t.id === winnerId)?.groupId).not.toBe(-1);
  const placed = (await tabs(options)).find(t => t.id === winnerId)!;
  expect(placed.url).toBe(origin + '/target');
  expect(await options.evaluate(id => chrome.tabGroups.get(id).then(g => g.title), placed.groupId)).toBe('Trial');
  await retain(options, original);

  await config(options, undefined, false);
  await winner.goBack();
  expect(winner.url()).toBe(origin + '/before');
  await retain(options, original);
  await options.evaluate(id => chrome.tabs.ungroup(id), winnerId);
  await winner.getByRole('link').click();
  await expect.poll(async () => (await tabs(options)).find(t => t.id === winnerId)?.url).toBe(origin + '/target');
  expect((await tabs(options)).find(t => t.id === winnerId)!.groupId).toBe(-1);
}));

for (const direction of ['before', 'after'] as const)
  test(`production same-window inheritance winner ${direction} anchor`, async () => fixture(async (context, options) => {
    const anchor = await context.newPage();
    await anchor.goto(origin + '/target');
    const anchorId = await id(options, anchor);
    const winner = await context.newPage();
    await winner.goto(origin + '/before');
    const winnerId = await id(options, winner);
    const spare = await context.newPage();
    await spare.goto(origin + '/spare');
    await options.evaluate(async ({ winnerId, anchorId, direction }) => {
      await chrome.tabs.move(winnerId, { index: direction === 'before' ? 0 : -1 });
      if (direction === 'after') await chrome.tabs.move(anchorId, { index: 0 });
    }, { winnerId, anchorId, direction });
    const before = await tabs(options);
    await config(options, 'Work');
    await winner.getByRole('link').click();
    await expect.poll(async () => (await tabs(options)).some(t => t.id === anchorId)).toBe(false);
    const expectedIndex = before.find(t => t.id === anchorId)!.index - (before.find(t => t.id === winnerId)!.index < before.find(t => t.id === anchorId)!.index ? 1 : 0);
    expect((await tabs(options)).find(t => t.id === winnerId)!.index).toBe(expectedIndex);
    const after = await tabs(options);
    expect(after.filter(t => t.id !== winnerId && t.id !== anchorId).sort((a, b) => a.index - b.index).map(t => t.id))
      .toEqual(before.filter(t => t.id !== winnerId && t.id !== anchorId).sort((a, b) => a.index - b.index).map(t => t.id));
    await retain(options, before.filter(t => t.id !== anchorId).map(t => t.id!));
    await winner.goBack();
    expect(winner.url()).toBe(origin + '/before');
  }));

for (const grouped of [false, true])
  test(`production cross-window inheritance grouped=${grouped}, lone source and native effects`, async ({}, testInfo) => fixture(async (context, options) => {
    const anchor = await context.newPage();
    await anchor.goto(origin + '/target');
    const anchorId = await id(options, anchor);
    const winner = await context.newPage();
    await winner.goto(origin + '/before');
    const winnerId = await id(options, winner);
    const setup = await options.evaluate(async ({ anchorId, winnerId, grouped }) => {
      let groupId = -1;
      if (grouped) {
        groupId = await chrome.tabs.group({ tabIds: [anchorId], createProperties: { windowId: (await chrome.tabs.get(anchorId)).windowId } });
        await chrome.tabGroups.update(groupId, { title: 'Inherited', collapsed: true });
      }
      const source = await chrome.windows.create({ tabId: winnerId, focused: false });
      const sourceGroup = await chrome.tabs.group({ tabIds: [winnerId], createProperties: { windowId: source!.id! } });
      return {
        sourceWindow: source!.id!,
        sourceGroup,
        groupId,
        anchor: await chrome.tabs.get(anchorId),
        windows: await chrome.windows.getAll(),
        groups: await chrome.tabGroups.query({})
      };
    }, { anchorId, winnerId, grouped });
    expect((await tabs(options)).find(t => t.id === winnerId)!.windowId).toBe(setup.sourceWindow);
    expect(setup.sourceWindow).not.toBe(setup.anchor.windowId);
    if (grouped) {
      const member = await context.newPage();
      await member.goto(origin + '/other-member');
      const memberId = await id(options, member);
      await options.evaluate(async ({ memberId, groupId }) => {
        await chrome.tabs.group({ tabIds: [memberId], groupId });
        await chrome.tabGroups.update(groupId, { collapsed: true });
      }, { memberId, groupId: setup.groupId });
    }
    const original = (await tabs(options)).map(t => t.id!);
    await config(options, 'Work');
    await winner.getByRole('link').click();
    await expect.poll(async () => {
      const t = (await tabs(options)).find(t => t.id === winnerId)!;
      return { windowId: t.windowId, groupId: t.groupId, index: t.index };
    }).toEqual({ windowId: setup.anchor.windowId, groupId: setup.groupId, index: setup.anchor.index });
    await expect.poll(async () => (await tabs(options)).some(t => t.id === anchorId)).toBe(false);
    await retain(options, original.filter(id => id !== anchorId));
    const observed = await options.evaluate(async ({ groupId, sourceWindow }) => ({
      tabs: await chrome.tabs.query({}),
      groups: await chrome.tabGroups.query({}),
      windows: await chrome.windows.getAll(),
      sourcePresent: (await chrome.windows.getAll()).some(w => w.id === sourceWindow),
      groupId
    }), setup);
    expect(observed.sourcePresent).toBe(false);
    expect(observed.groups.some(g => g.id === setup.sourceGroup)).toBe(false);
    const evidence = { version: context.browser()?.version(), before: setup, after: observed };
    const evidencePath = testInfo.outputPath('native-placement-effects.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
    await testInfo.attach('native-placement-effects', { path: evidencePath, contentType: 'application/json' });
    console.info('native cross-window', JSON.stringify({
      grouped,
      version: evidence.version,
      sourcePresent: observed.sourcePresent,
      activeTabs: observed.tabs.filter(t => t.active).map(t => ({ id: t.id, windowId: t.windowId })),
      groups: observed.groups.map(g => ({ id: g.id, collapsed: g.collapsed })),
      focused: observed.windows.filter(w => w.focused).map(w => w.id)
    }));
    await winner.goBack();
    expect(winner.url()).toBe(origin + '/before');
  }));

for (const crossWindow of [false, true])
  test(`production preserves manual Group A over Group X rule, crossWindow=${crossWindow}`, async ({}, testInfo) => fixture(async (context, options) => {
  const anchor = await context.newPage();
  await anchor.goto(origin + '/target');
  const anchorId = await id(options, anchor);
  const inherited = await options.evaluate(async ({id,crossWindow}) => {
    const windowId = crossWindow ? (await chrome.windows.create({tabId:id}))!.id! : (await chrome.tabs.get(id)).windowId;
    const groupId = await chrome.tabs.group({tabIds:[id],createProperties:{windowId}});
    await chrome.tabGroups.update(groupId,{title:'Group A'});
    return {windowId,groupId};
  }, {id:anchorId,crossWindow});
  const member = await context.newPage();
  await member.goto(origin + '/member');
  const memberId = await id(options, member);
  const target = await options.evaluate(async (id) => {
    const ownWindow = (await chrome.tabs.query({ url: chrome.runtime.getURL('options/index.html') }))[0]!.windowId;
    await chrome.tabs.move(id, { windowId: ownWindow, index: -1 });
    const groupId = await chrome.tabs.group({ tabIds: [id], createProperties: { windowId: ownWindow } });
    await chrome.tabGroups.update(groupId, { title: 'Group X', collapsed: true });
    return { groupId, windowId: (await chrome.tabs.get(id)).windowId };
  }, memberId);
  const winner = await context.newPage();
  await winner.goto(origin + '/before');
  const winnerId = await id(options, winner);
  await options.evaluate(async ({ winnerId, memberId, windowId }) => {
    await chrome.tabs.move(winnerId, { windowId, index: 0 });
    await chrome.tabs.update(memberId, { active: true });
  }, { winnerId, memberId, windowId: target.windowId });
  expect((await tabs(options)).find(t => t.id === winnerId)!.active).toBe(false);
  expect(inherited.windowId === target.windowId).toBe(!crossWindow);
  const beforeNavigation = await tabs(options);
  const anchorBefore = beforeNavigation.find(t => t.id === anchorId)!;
  const winnerBefore = beforeNavigation.find(t => t.id === winnerId)!;
  const original = (await tabs(options)).map(t => t.id!);
  await config(options, 'Group X');
  await winner.getByRole('link').click();
  await expect.poll(async () => {
    const t = (await tabs(options)).find(t => t.id === winnerId)!;
    return { windowId: t.windowId, groupId: t.groupId };
  }).toEqual(inherited);
  await expect.poll(async () => (await tabs(options)).some(t => t.id === anchorId)).toBe(false);
  const t = await tabs(options);
  expect(t.find(t => t.id === winnerId)!.index).toBe(anchorBefore.index - (winnerBefore.windowId === anchorBefore.windowId && winnerBefore.index < anchorBefore.index ? 1 : 0));
  expect(t.find(t => t.id === memberId)!.groupId).toBe(target.groupId);
  expect(await options.evaluate(id => chrome.tabGroups.get(id).then(g => g.title), inherited.groupId)).toBe('Group A');
  await retain(options, original.filter(id => id !== anchorId));
  const native = {
    winner: (await tabs(options)).find(t => t.id === winnerId),
    target: await options.evaluate(id => chrome.tabGroups.get(id), target.groupId),
    windows: await options.evaluate(() => chrome.windows.getAll())
  };
  const nativePath = testInfo.outputPath('native-manual-placement.json');
  await writeFile(nativePath, JSON.stringify(native, null, 2));
  await testInfo.attach('native-manual-placement', { path: nativePath, contentType: 'application/json' });
  console.info('native manual placement', JSON.stringify(native));
  await winner.goBack();
  expect(winner.url()).toBe(origin + '/before');
}));


test('production closes three duplicates across two windows and groups including passive documents',async()=>fixture(async(context,options)=>{
  const older:Page[]=[];
  for(let i=0;i<3;i++){const p=await context.newPage();await p.goto(origin+'/target');older.push(p);}
  const duplicateIds=await options.evaluate(async url=>(await chrome.tabs.query({})).filter(t=>t.url===url).map(t=>t.id!),origin+'/target');
  expect(duplicateIds).toHaveLength(3);
  const setup=await options.evaluate(async ids=>{
    const first=await chrome.tabs.group({tabIds:[ids[0]!,ids[1]!],createProperties:{windowId:(await chrome.tabs.get(ids[0]!)).windowId}});await chrome.tabGroups.update(first,{title:'Inherited'});
    const window=await chrome.windows.create({tabId:ids[2]!});const second=await chrome.tabs.group({tabIds:[ids[2]!],createProperties:{windowId:window!.id!}});await chrome.tabGroups.update(second,{title:'Empty'});
    return {first,second,emptyWindow:window!.id!,anchor:await chrome.tabs.get(ids[0]!)};
  },duplicateIds);
  const winner=await context.newPage();await winner.goto(origin+'/before');const winnerId=await id(options,winner);
  await options.evaluate(async({winnerId,windowId})=>{await chrome.tabs.move(winnerId,{windowId,index:-1});},{winnerId,windowId:setup.anchor.windowId});
  const original=(await tabs(options)).map(t=>t.id!);
  // A real worker restart drops navigation provenance; frame0 evidence must independently authorize passive duplicates.
  const cdp=await context.newCDPSession(options);const versions=new Map<string,{versionId:string;scriptURL:string;runningStatus:string}>();
  cdp.on('ServiceWorker.workerVersionUpdated',({versions:changed})=>{for(const v of changed)versions.set(v.versionId,v);});
  await cdp.send('ServiceWorker.enable');await expect.poll(()=>[...versions.values()].find(v=>v.runningStatus==='running'&&v.scriptURL.startsWith('chrome-extension://'))).toBeTruthy();const version=[...versions.values()].find(v=>v.runningStatus==='running'&&v.scriptURL.startsWith('chrome-extension://'))!;
  await cdp.send('ServiceWorker.stopWorker',{versionId:version.versionId});await expect.poll(()=>versions.get(version.versionId)?.runningStatus).toBe('stopped');await cdp.detach();
  await config(options);await winner.getByRole('link').click();
  await expect.poll(async()=>(await tabs(options)).filter(t=>duplicateIds.includes(t.id!)).length).toBe(0);
  await retain(options,original.filter(id=>!duplicateIds.includes(id)));
  const placed=(await tabs(options)).find(t=>t.id===winnerId)!;expect(placed.windowId).toBe(setup.anchor.windowId);expect(placed.groupId).toBe(setup.first);expect(placed.index).toBe(setup.anchor.index);
  expect(await options.evaluate(async({second,emptyWindow})=>({group:(await chrome.tabGroups.query({})).some(g=>g.id===second),window:(await chrome.windows.getAll()).some(w=>w.id===emptyWindow)}),setup)).toEqual({group:false,window:false});
  await winner.goBack();expect(winner.url()).toBe(origin+'/before');
}));


test('production grouping-only reuses remote Group A without a competing source group and retains history',async()=>fixture(async(context,options)=>{
  const first=await context.newPage();await first.goto(origin+'/remote-first');const firstId=await id(options,first);
  const second=await context.newPage();await second.goto(origin+'/remote-second');const secondId=await id(options,second);
  const winner=await context.newPage();await winner.goto(origin+'/before');const winnerId=await id(options,winner);
  const destination=await options.evaluate(async({firstId,secondId,winnerId})=>{
    const sourceWindow=(await chrome.tabs.get(winnerId)).windowId;
    const remote=(await chrome.windows.create({tabId:firstId,focused:false}))!.id!;
    await chrome.tabs.move(secondId,{windowId:remote,index:-1});
    const groupId=await chrome.tabs.group({tabIds:[firstId,secondId],createProperties:{windowId:remote}});
    await chrome.tabGroups.update(groupId,{title:'Group A',color:'purple'});
    return {windowId:remote,groupId,sourceWindow};
  },{firstId,secondId,winnerId});
  expect(destination.windowId).not.toBe(destination.sourceWindow);
  const original=(await tabs(options)).map(t=>t.id!);
  const beforeGroups=await options.evaluate(()=>chrome.tabGroups.query({}));
  expect(beforeGroups.filter(g=>g.title==='Group A'&&g.windowId===destination.sourceWindow)).toEqual([]);
  await config(options,'Group A');await winner.getByRole('link').click();
  await expect.poll(async()=>{
    const t=(await tabs(options)).find(t=>t.id===winnerId)!;
    return {windowId:t.windowId,groupId:t.groupId};
  }).toEqual({windowId:destination.windowId,groupId:destination.groupId});
  await retain(options,original);
  const after=await tabs(options);
  expect(after.find(t=>t.id===winnerId)!.url).toBe(origin+'/target');
  expect(after.filter(t=>t.groupId===destination.groupId).sort((a,b)=>a.index-b.index).map(t=>t.id)).toEqual([firstId,secondId,winnerId]);
  expect(await options.evaluate(()=>chrome.tabGroups.query({}))).toEqual(beforeGroups);
  await config(options,undefined,false);await winner.goBack();expect(winner.url()).toBe(origin+'/before');
}));

for (const destination of ['rule','manual','ungrouped'] as const) {
  for (const background of [false,true]) {
    test(`native production remote ${destination} ${background?'Cmd-click background':'foreground click'} attention`,async({},info)=>{
      test.skip(process.platform!=='darwin','Requires macOS headed native focus and Cmd-click.');
      await fixture(async(context,options)=>{
        const anchor=await context.newPage();await anchor.goto(origin+(destination==='rule'?'/member':'/target'));const anchorId=await id(options,anchor);
        const source=await context.newPage();await source.goto(origin+'/before');const sourceId=await id(options,source);
        const setup=await options.evaluate(async({anchorId,sourceId,destination,origin})=>{
          const sourceWindow=(await chrome.tabs.get(sourceId)).windowId;
          const remote=(await chrome.windows.create({tabId:anchorId,focused:false}))!.id!;
          const spare=await chrome.tabs.create({windowId:remote,url:origin+'/destination-spare',active:true});
          const sourceSpare=await chrome.tabs.create({windowId:sourceWindow,url:origin+'/source-spare',active:false});
          let groupId=-1;
          if(destination!=='ungrouped'){
            groupId=await chrome.tabs.group({tabIds:[anchorId],createProperties:{windowId:remote}});
            await chrome.tabGroups.update(groupId,{title:destination==='rule'?'Group A':'Manual B',collapsed:true});
          }
          if(destination!=='rule'){
            const member=await chrome.tabs.create({windowId:sourceWindow,url:origin+'/competing-rule-member',active:false});
            const rule=await chrome.tabs.group({tabIds:[member.id!],createProperties:{windowId:sourceWindow}});
            await chrome.tabGroups.update(rule,{title:'Group A',collapsed:true});
          }
          return {sourceWindow,remote,spare:spare.id!,sourceSpare:sourceSpare.id!,groupId};
        },{anchorId,sourceId,destination,origin});
        await expect.poll(async()=>(await tabs(options)).every(t=>t.status==='complete')).toBe(true);
        await config(options,'Group A');
        await options.evaluate(async({sourceId,sourceWindow})=>{await chrome.tabs.update(sourceId,{active:true});await chrome.windows.update(sourceWindow,{focused:true});},{sourceId,sourceWindow:setup.sourceWindow});
        const attention=()=>options.evaluate(async()=>({tabs:await chrome.tabs.query({windowType:'normal'}),windows:await chrome.windows.getAll({windowTypes:['normal']}),groups:await chrome.tabGroups.query({})}));
        await expect.poll(async()=>(await attention()).windows.filter(w=>w.focused).map(w=>w.id)).toEqual([setup.sourceWindow]);
        const before=await attention();expect(before.tabs.find(t=>t.id===sourceId)?.active).toBe(true);expect(before.tabs.find(t=>t.id===setup.spare)?.active).toBe(true);
        let incoming=source;
        if(background){const opened=context.waitForEvent('page');await source.getByRole('link').click({modifiers:['Meta']});incoming=await opened;await incoming.waitForURL(origin+'/target');}
        else await source.getByRole('link').click();
        const incomingId=background?(await tabs(options)).find(t=>t.url===origin+'/target'&&t.id!==anchorId)!.id!:sourceId;
        await expect.poll(async()=>{const state=await tabs(options);const winner=state.find(t=>t.id===incomingId);return {windowId:winner?.windowId,groupId:winner?.groupId,oldPresent:state.some(t=>t.id===anchorId)};})
          .toEqual({windowId:setup.remote,groupId:setup.groupId,oldPresent:destination==='rule'});
        await expect.poll(async()=>{
          const state=await attention();return {focused:state.windows.filter(w=>w.focused).map(w=>w.id),destinationActive:state.tabs.filter(t=>t.windowId===setup.remote&&t.active).map(t=>t.id)};
        }).toEqual({focused:[background?setup.sourceWindow:setup.remote],destinationActive:[background?setup.spare:incomingId]});
        const after=await attention();
        if(background){expect(after.tabs.find(t=>t.id===sourceId)?.active).toBe(true);expect(after.tabs.filter(t=>t.active).map(t=>t.id).sort()).toEqual(before.tabs.filter(t=>t.active).map(t=>t.id).sort());}
        if(setup.groupId!==-1)expect(after.groups.find(g=>g.id===setup.groupId)?.collapsed).toBe(background);
        expect(after.tabs.find(t=>t.id===incomingId)?.url).toBe(origin+'/target');
        const evidencePath=info.outputPath('native-attention.json');await writeFile(evidencePath,JSON.stringify({version:context.browser()!.version(),destination,background,setup,sourceId,incomingId,before,after},null,2));await info.attach('native-attention',{path:evidencePath,contentType:'application/json'});
        if(!background){await config(options,undefined,false);await incoming.goBack();expect(incoming.url()).toBe(origin+'/before');}
      },true);
    });
  }
}

test('native production restores minimized remote destination through focused true',async({},info)=>{
  test.skip(process.platform!=='darwin','Requires macOS headed native minimized-window focus.');
  await fixture(async(context,options)=>{
    const member=await context.newPage();await member.goto(origin+'/member');const memberId=await id(options,member);
    const source=await context.newPage();await source.goto(origin+'/before');const sourceId=await id(options,source);
    const setup=await options.evaluate(async({memberId,sourceId})=>{
      const sourceWindow=(await chrome.tabs.get(sourceId)).windowId;
      const remote=(await chrome.windows.create({tabId:memberId,focused:false}))!.id!;
      const groupId=await chrome.tabs.group({tabIds:[memberId],createProperties:{windowId:remote}});await chrome.tabGroups.update(groupId,{title:'Group A'});
      await chrome.windows.update(remote,{state:'minimized'});await chrome.tabs.update(sourceId,{active:true});await chrome.windows.update(sourceWindow,{focused:true});return {sourceWindow,remote,groupId};
    },{memberId,sourceId});
    await config(options,'Group A');
    expect(await options.evaluate(id=>chrome.windows.get(id).then(w=>w.state),setup.remote)).toBe('minimized');
    await source.getByRole('link').click();
    await expect.poll(()=>options.evaluate(async({remote,sourceId})=>({window:await chrome.windows.get(remote),tab:await chrome.tabs.get(sourceId)}),{remote:setup.remote,sourceId})).toMatchObject({window:{focused:true,state:'normal'},tab:{windowId:setup.remote,active:true,groupId:setup.groupId}});
    const path=info.outputPath('native-minimized.json');await writeFile(path,JSON.stringify({version:context.browser()!.version(),setup,after:await options.evaluate(async()=>({windows:await chrome.windows.getAll(),tabs:await chrome.tabs.query({})}))},null,2));await info.attach('native-minimized',{path,contentType:'application/json'});
  },true);
});

test('native production foreground transfer from lone source closes source and presents destination',async({},info)=>{
  test.skip(process.platform!=='darwin','Requires macOS headed native window disappearance.');
  await fixture(async(context,options)=>{
    const member=await context.newPage();await member.goto(origin+'/member');const memberId=await id(options,member);
    const source=await context.newPage();await source.goto(origin+'/before');const sourceId=await id(options,source);
    const setup=await options.evaluate(async({memberId,sourceId})=>{
      const destination=(await chrome.tabs.get(memberId)).windowId;
      const groupId=await chrome.tabs.group({tabIds:[memberId],createProperties:{windowId:destination}});await chrome.tabGroups.update(groupId,{title:'Group A',collapsed:true});
      const sourceWindow=(await chrome.windows.create({tabId:sourceId,focused:true}))!.id!;
      await chrome.tabs.update(sourceId,{active:true});return {sourceWindow,destination,groupId};
    },{memberId,sourceId});
    await config(options,'Group A');await source.getByRole('link').click();
    await expect.poll(()=>options.evaluate(async({sourceId,sourceWindow,destination})=>({sourcePresent:(await chrome.windows.getAll()).some(w=>w.id===sourceWindow),winner:await chrome.tabs.get(sourceId),destination:await chrome.windows.get(destination)}),{sourceId,...setup}))
      .toMatchObject({sourcePresent:false,winner:{windowId:setup.destination,groupId:setup.groupId,active:true},destination:{focused:true}});
    const path=info.outputPath('native-lone-source.json');await writeFile(path,JSON.stringify({version:context.browser()!.version(),setup,after:await options.evaluate(async()=>({windows:await chrome.windows.getAll(),tabs:await chrome.tabs.query({})}))},null,2));await info.attach('native-lone-source',{path,contentType:'application/json'});
  },true);
});

async function saveProtectionEvidence(info: TestInfo, name: string, value: unknown) {
  const path = info.outputPath(name + '.json');
  await writeFile(path, JSON.stringify(value, null, 2));
  await info.attach(name, { path, contentType: 'application/json' });
}
async function protection(options: Page, tabId: number, value: boolean) {
  return options.evaluate(async ({ tabId, value }) => {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (!tab) throw Error('Target tab unavailable');
    const status = await chrome.runtime.sendMessage({ kind: 'get-status', target: { tabId, windowId: tab.windowId, incognito: tab.incognito } });
    if (!status.status.target) throw Error('Target receipt unavailable');
    return chrome.runtime.sendMessage({ kind: 'set-tab-protected', expected: status.status.version, target: status.status.target.receipt, protected: value });
  }, { tabId, value });
}
for (const protectedTab of ['winner', 'anchor', 'other'] as const) {
  test(`production session protection on ${protectedTab} retains duplicates and native manual placement`, async ({}, info) => fixture(async (context, options) => {
    const anchor = await context.newPage(); await anchor.goto(origin + '/target'); const anchorId = await id(options, anchor);
    const other = await context.newPage(); await other.goto(origin + '/other'); const otherId = await id(options, other);
    await other.goto(origin + '/target');
    const winner = await context.newPage(); await winner.goto(origin + '/before'); const winnerId = await id(options, winner);
    const groupId = await options.evaluate(async id => { const groupId = await chrome.tabs.group({ tabIds: [id] }); await chrome.tabGroups.update(groupId, { title: 'Manual' }); return groupId; }, anchorId);
    const selectedId = protectedTab === 'winner' ? winnerId : protectedTab === 'anchor' ? anchorId : otherId;
    expect((await protection(options, selectedId, true)).kind).toBe('ok');
    await config(options, 'Competing');
    await options.evaluate(id => chrome.tabs.update(id, { active: true }), winnerId);
    await winner.getByRole('link').click();
    await expect.poll(async () => (await tabs(options)).find(t => t.id === winnerId)?.url).toBe(origin + '/target');
    if (protectedTab !== 'winner') await expect.poll(async () => (await tabs(options)).find(t => t.id === winnerId)?.groupId).toBe(groupId);
    else expect((await tabs(options)).find(t => t.id === winnerId)?.groupId).toBe(-1);
    const after = await tabs(options); expect(after.some(t => t.id === anchorId)).toBe(true); expect(after.some(t => t.id === otherId)).toBe(true);
    expect(await options.evaluate(async () => (await chrome.runtime.sendMessage({ kind: 'get-status' })).status.target)).toBeUndefined();
    const allowedIncognito = await options.evaluate(() => new Promise<boolean>(resolve => chrome.extension.isAllowedIncognitoAccess(resolve)));
    const evidence = { version: context.browser()!.version(), protectedTab, selectedId, winnerId, anchorId, otherId, groupId, allowedIncognito, after };
    await saveProtectionEvidence(info, 'session-protection', evidence);
    await config(options, undefined, false); await winner.goBack(); expect(winner.url()).toBe(origin + '/before');
    expect((await protection(options, selectedId, false)).kind).toBe('ok');
  }, true, false));
}
test('production session protection survives navigation reload and worker restart and ends on close', async ({}, info) => fixture(async (context, options) => {
  const winner = await context.newPage(); await winner.goto(origin + '/before'); const winnerId = await id(options, winner);
  expect((await protection(options, winnerId, true)).kind).toBe('ok'); await config(options, 'Work');
  await winner.getByRole('link').click(); await winner.reload();
  const cdp = await context.newCDPSession(options); const versions = new Map<string, { versionId: string; scriptURL: string; runningStatus: string }>();
  try {
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions: changed }) => { for (const v of changed) versions.set(v.versionId, v); });
    await cdp.send('ServiceWorker.enable'); await expect.poll(() => [...versions.values()].find(v => v.runningStatus === 'running' && v.scriptURL.startsWith('chrome-extension://'))).toBeTruthy();
    const version = [...versions.values()].find(v => v.runningStatus === 'running' && v.scriptURL.startsWith('chrome-extension://'))!;
    await cdp.send('ServiceWorker.stopWorker', { versionId: version.versionId }); await expect.poll(() => versions.get(version.versionId)?.runningStatus).toBe('stopped');
    await winner.goto(origin + '/after-restart');
    await expect.poll(() => versions.get(version.versionId)?.runningStatus).toBe('running');
    await expect.poll(async () => options.evaluate(async tabId => { const tab = await chrome.tabs.get(tabId); return (await chrome.runtime.sendMessage({ kind: 'get-status', target: { tabId, windowId: tab.windowId, incognito: tab.incognito } })).status.target?.protected; }, winnerId)).toBe(true);
    expect((await tabs(options)).find(t => t.id === winnerId)?.groupId).toBe(-1);
    const before = await options.evaluate(() => chrome.storage.session.get('chromeReHomeProtections'));
    await winner.close();
    await expect.poll(async () => options.evaluate(async () => ((await chrome.storage.session.get('chromeReHomeProtections')).chromeReHomeProtections as { tabs: unknown[] }).tabs)).toEqual([]);
    await saveProtectionEvidence(info, 'session-lifetime', { version: context.browser()!.version(), winnerId, before, after: await options.evaluate(() => chrome.storage.session.get('chromeReHomeProtections')) });
  } finally { await cdp.detach(); }
}, true, false));
test('production audible older anchor retains every duplicate while placing the silent winner', async ({}, info) => fixture(async (context, options) => {
  const anchor = await context.newPage(); await anchor.goto(origin + '/target'); const anchorId = await id(options, anchor);
  const other = await context.newPage(); await other.goto(origin + '/other'); const otherId = await id(options, other); await other.goto(origin + '/target');
  const winner = await context.newPage(); await winner.goto(origin + '/before'); const winnerId = await id(options, winner);
  const groupId = await options.evaluate(async id => { const groupId = await chrome.tabs.group({ tabIds: [id] }); await chrome.tabGroups.update(groupId, { title: 'Audible anchor' }); return groupId; }, anchorId);
  await anchor.getByRole('button', { name: 'Start audio' }).click();
  await expect.poll(async () => (await tabs(options)).find(t => t.id === anchorId)?.audible).toBe(true);
  await config(options); await options.evaluate(id => chrome.tabs.update(id, { active: true }), winnerId); await winner.getByRole('link').click();
  await expect.poll(async () => (await tabs(options)).find(t => t.id === winnerId)?.groupId).toBe(groupId);
  const after = await tabs(options); expect(after.some(t => t.id === anchorId)).toBe(true); expect(after.some(t => t.id === otherId)).toBe(true);
  await saveProtectionEvidence(info, 'audible-anchor', { version: context.browser()!.version(), winnerId, anchorId, otherId, groupId, after });
}, true, false));
test('production audible incoming same-document navigation skips automatic placement', async ({}, info) => fixture(async (context, options) => {
  const winner = await context.newPage(); await winner.goto(origin + '/seed'); await winner.getByRole('link').click();
  await winner.evaluate(() => history.pushState({}, '', '/before')); const winnerId = await id(options, winner);
  const anchor = await context.newPage(); await anchor.goto(origin + '/target'); const anchorId = await id(options, anchor);
  await options.evaluate(id => chrome.tabs.update(id, { active: true }), winnerId);
  await winner.getByRole('button', { name: 'Start audio' }).click(); await expect.poll(async () => (await tabs(options)).find(t => t.id === winnerId)?.audible).toBe(true);
  await config(options, 'Work'); await winner.getByRole('button', { name: 'History target' }).click();
  await expect.poll(async () => (await tabs(options)).find(t => t.id === winnerId)?.url).toBe(origin + '/target');
  const after = await tabs(options); expect(after.find(t => t.id === winnerId)?.groupId).toBe(-1); expect(after.some(t => t.id === anchorId)).toBe(true);
  await saveProtectionEvidence(info, 'audible-winner', { version: context.browser()!.version(), winnerId, anchorId, after });
}, true, false));
