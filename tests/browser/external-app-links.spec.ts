import { activateOwnedBrowser } from './owned-browser-focus';
import { test, expect, chromium, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { execFile } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createExternalAppLauncher } from './external-app-launch';
import type { ReplacementJournal } from '../../src/execution/journal';
import { createForegroundHelper } from './foreground-helper';
import { cleanupExternalAppTrial } from './external-app-cleanup';

type NativeCase = 'warm HTTP' | 'warm HTTPS' | 'HTTP to HTTPS final identity' | 'stopped-worker HTTPS' | 'disabled HTTPS control' | 'remote grouped HTTPS' | 'remote ungrouped HTTPS' | 'remote rule HTTPS' | 'remote foreground-helper HTTPS history';
const cases: NativeCase[] = ['warm HTTP', 'warm HTTPS', 'HTTP to HTTPS final identity', 'stopped-worker HTTPS', 'disabled HTTPS control', 'remote grouped HTTPS', 'remote ungrouped HTTPS', 'remote rule HTTPS', 'remote foreground-helper HTTPS history'];

async function config(options: Page, url: string, enabled: boolean, title = 'External') {
  await options.evaluate(({ enabled, url, title }) => chrome.storage.local.set({
    chromeReHomeConfig: {
      schemaVersion: 4,
      enabled,
      groupingRules: [{ enabled: true, pattern: new URL(url).origin + '/*', group: title }],
      duplicateRules: []
    }
  }), { enabled, url, title });
  await expect(options.getByRole('status')).toContainText(enabled ? 'enabled' : 'disabled');
}

async function runNativeCase(name: NativeCase, testInfo: TestInfo) {
  const root = await mkdtemp(join(tmpdir(), 'chromerehome-external-profile-'));
  let launcher: Awaited<ReturnType<typeof createExternalAppLauncher>> | undefined;
  let context: BrowserContext | undefined;
  let http: ReturnType<typeof createHttpServer> | undefined;
  let https: ReturnType<typeof createHttpsServer> | undefined;
  let testFailed = false;
  let helper: Awaited<ReturnType<typeof createForegroundHelper>> | undefined;
  const helperCase = name === 'remote foreground-helper HTTPS history';
  try {
    launcher = await createExternalAppLauncher(chromium.executablePath());
    const key = join(root, 'key.pem');
    const cert = join(root, 'cert.pem');
    await promisify(execFile)('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost']);
    https = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) }, (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      res.end('<title>Native external trial</title>' + (helperCase ? `<script>let left=20;const timer=setInterval(()=>{history.replaceState({},'',location.href);if(--left===0)clearInterval(timer)},5)</script>` : ''));
    });
    await new Promise<void>(done => https!.listen(0, '127.0.0.1', done));
    const httpsOrigin = `https://127.0.0.1:${(https.address() as { port: number }).port}`;
    http = createHttpServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { location: httpsOrigin + '/target' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      res.end('<title>Native HTTP trial</title>');
    });
    await new Promise<void>(done => http!.listen(0, '127.0.0.1', done));
    const httpOrigin = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
    const finalUrl = (name === 'warm HTTP' ? httpOrigin : httpsOrigin) + '/target';
    const launchUrl = name === 'HTTP to HTTPS final identity' ? httpOrigin + '/redirect' : finalUrl;
    const extension = resolve('dist');
    context = await chromium.launchPersistentContext(join(root, 'profile'), {
      executablePath: launcher.executablePath,
      headless: false,
      ignoreHTTPSErrors: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
        '--ignore-certificate-errors', '--no-first-run', '--no-default-browser-check']
    });
    if (name.startsWith('remote ')) await activateOwnedBrowser(context);
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const options = await context.newPage();
    await options.goto(`chrome-extension://${new URL(worker.url()).host}/options/index.html`);
    const tabs = () => options.evaluate(() => chrome.tabs.query({ windowType: 'normal' }));
    await config(options, finalUrl, false);
    const remote = name.startsWith('remote ');
    const ruleOnly = name === 'remote rule HTTPS' || helperCase;
    const ungrouped = name === 'remote ungrouped HTTPS';
    const older = await context.newPage();
    await older.goto(ruleOnly ? finalUrl.replace('/target','/member') : finalUrl);
    let before = await tabs();
    const oldId = before.find(tab => tab.url === older.url())!.id!;
    expect(before.find(tab => tab.id === oldId)!.groupId).toBe(-1);
    const disabled = name === 'disabled HTTPS control';
    let manualGroupId = -1;
    let remoteSetup: {sourceWindow:number;destination:number;spare:number} | undefined;
    if (!disabled && !ungrouped) {
      manualGroupId = await options.evaluate(async id => {
        const groupId = await chrome.tabs.group({tabIds:[id],createProperties:{windowId:(await chrome.tabs.get(id)).windowId}});
        await chrome.tabGroups.update(groupId,{title:'Manual'});
        return groupId;
      },oldId);
      before = await tabs();
    }
    if (remote) {
      remoteSetup = await options.evaluate(async ({oldId,manualGroupId,ruleOnly,origin})=>{
        const sourceWindow=(await chrome.tabs.get(oldId)).windowId;
        if(manualGroupId!==-1)await chrome.tabs.ungroup(oldId);
        const destination=(await chrome.windows.create({tabId:oldId,focused:false}))!.id!;
        const spare=await chrome.tabs.create({windowId:destination,url:origin+'/destination-spare',active:true});
        if(!ruleOnly){
          const member=await chrome.tabs.create({windowId:sourceWindow,url:origin+'/competing-rule-member',active:false});
          const group=await chrome.tabs.group({tabIds:[member.id!],createProperties:{windowId:sourceWindow}});await chrome.tabGroups.update(group,{title:'Group A',collapsed:true});
        }
        return {sourceWindow,destination,spare:spare.id!};
      },{oldId,manualGroupId,ruleOnly,origin:new URL(finalUrl).origin});
      if(!ungrouped)manualGroupId=await options.evaluate(async({oldId,windowId,ruleOnly})=>{
        const group=await chrome.tabs.group({tabIds:[oldId],createProperties:{windowId}});await chrome.tabGroups.update(group,{title:ruleOnly?'Group A':'Manual',collapsed:true});return group;
      },{oldId,windowId:remoteSetup.destination,ruleOnly});
      await expect.poll(async()=>(await tabs()).every(t=>t.status==='complete')).toBe(true);
      await options.evaluate(async id=>{const tab=(await chrome.tabs.query({windowId:id})).find(t=>t.url?.startsWith('chrome-extension://'))!;await chrome.tabs.update(tab.id!,{active:true});await chrome.windows.update(id,{focused:true});},remoteSetup.sourceWindow);
    }
    before = await tabs();
    if(!disabled)await config(options,finalUrl,true,remote?'Group A':'External');
    const beforeWindows=await options.evaluate(()=>chrome.windows.getAll({windowTypes:['normal']}));
    if(remote)expect(beforeWindows.filter(w=>w.focused).map(w=>w.id)).toEqual([remoteSetup!.sourceWindow]);

    const cdp = await context.newCDPSession(options);
    const versions = new Map<string, { versionId: string; scriptURL: string; runningStatus: string }>();
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions: changed }) => {
      for (const version of changed) versions.set(version.versionId, version);
    });
    await cdp.send('ServiceWorker.enable');
    await expect.poll(() => [...versions.values()].find(version =>
      version.scriptURL === worker.url() && version.runningStatus === 'running')).toBeTruthy();
    const version = [...versions.values()].find(version =>
      version.scriptURL === worker.url() && version.runningStatus === 'running')!;
    const workerStatus: string[] = ['running'];
    if (name === 'stopped-worker HTTPS') {
      await cdp.send('ServiceWorker.stopWorker', { versionId: version.versionId });
      await expect.poll(() => versions.get(version.versionId)?.runningStatus).toBe('stopped');
      workerStatus.push('stopped');
    }
    let helperBeforeWindows: chrome.windows.Window[] | undefined;
    if (helperCase) {
      await worker.evaluate(() => {
        const events: unknown[] = [];
        Reflect.set(globalThis, '__externalHistoryEvidence', events);
        chrome.webNavigation.onHistoryStateUpdated.addListener(details => {
          events.push({ kind: 'history', at: Date.now(), tabId: details.tabId, lifecycle: details.documentLifecycle, transition: details.transitionType });
        });
        chrome.storage.onChanged.addListener((changes, area) => {
          const journal = changes.chromeReHomeReplacementJournal?.newValue as ReplacementJournal | undefined;
          if (area === 'session' && journal) events.push({ kind: 'journal', at: Date.now(), phase: journal.completedPhase, pending: journal.pending?.kind, terminal: journal.terminal });
        });
      });
      helper = await createForegroundHelper();
      await expect.poll(() => options.evaluate(async () => (await chrome.windows.getAll({ windowTypes: ['normal'] })).some(w => w.focused))).toBe(false);
      helperBeforeWindows = await options.evaluate(() => chrome.windows.getAll({ windowTypes: ['normal'] }));
    }
    // Register before OS open: an existing duplicate or its initial load cannot satisfy this event.
    const openedPage = context.waitForEvent('page');
    // The only external navigation operation is LaunchServices; no worker evaluation occurs here.
    const [external] = await Promise.all([openedPage, launcher.open(launchUrl)]);
    expect(external).not.toBe(older);
    // waitForURL waits for the final navigation's load, rather than about:blank's initial load.
    await external.waitForURL(finalUrl, { waitUntil: 'load' });
    await expect.poll(() => versions.get(version.versionId)?.runningStatus).toBe('running');
    workerStatus.push('running-after-open');
    await expect.poll(async () => (await tabs()).filter(tab => tab.url === finalUrl && tab.id !== oldId).length).toBe(1);
    const survivorId = (await tabs()).find(tab => tab.url === finalUrl && tab.id !== oldId)!.id!;
    try {
      if (disabled) {
        // Bounded retention observation after the external page's final load; portable guards
        // establish deterministic no-mutation behavior through queue completion.
        await expect.poll(async () => (await tabs()).filter(tab => tab.url === finalUrl).map(tab =>
          ({ id: tab.id, groupId: tab.groupId })).sort((a, b) => a.id! - b.id!))
          .toEqual([{ id: oldId, groupId: -1 }, { id: survivorId, groupId: -1 }].sort((a, b) => a.id - b.id));
      } else {
        await expect.poll(async () => {
          const current = await tabs();
          const survivor = current.find(tab => tab.id === survivorId);
          return { grouped: survivor !== undefined && survivor.groupId === manualGroupId,
            oldClosed: !current.some(tab => tab.id === oldId) };
        }).toEqual({ grouped: true, oldClosed: !ruleOnly });
        const survivor = (await tabs()).find(tab => tab.id === survivorId)!;
        expect(survivor.url).toBe(finalUrl);
        expect(survivor.groupId).toBe(manualGroupId);
        if(!ungrouped)expect(await options.evaluate(id => chrome.tabGroups.get(id).then(group => group.title), survivor.groupId)).toBe(ruleOnly?'Group A':'Manual');
        if(remote){
          await expect.poll(()=>options.evaluate(async({id,windowId})=>({active:(await chrome.tabs.get(id)).active,focused:(await chrome.windows.get(windowId)).focused}),{id:survivorId,windowId:remoteSetup!.destination})).toEqual({active:true,focused:true});
          expect(survivor.windowId).toBe(remoteSetup!.destination);
          if(!ungrouped)expect(await options.evaluate(id=>chrome.tabGroups.get(id).then(g=>g.collapsed),manualGroupId)).toBe(false);
        }
      }
      if (helperCase) {
        await expect.poll(() => worker.evaluate(() => (Reflect.get(globalThis, '__externalHistoryEvidence') as { kind: string }[]).filter(e => e.kind === 'history').length)).toBeGreaterThan(0);
        const events = await worker.evaluate(() => Reflect.get(globalThis, '__externalHistoryEvidence')) as { kind: string; at: number; phase?: string; tabId?: number }[];
        const prepared = events.find(e => e.kind === 'journal' && e.phase === 'prepared')!;
        const completed = events.find(e => e.kind === 'journal' && e.phase === 'completed')!;
        expect(events.some(e => e.kind === 'history' && e.tabId === survivorId && e.at >= prepared.at && e.at <= completed.at)).toBe(true);
      }
      const expectedIds = [...before.map(tab => tab.id!), survivorId].filter(id => disabled || ruleOnly || id !== oldId).sort((a, b) => a - b);
      expect((await tabs()).map(tab => tab.id!).sort((a, b) => a - b)).toEqual(expectedIds);
    } finally {
      const evidencePath = testInfo.outputPath('native-external-result.json');
      await writeFile(evidencePath, JSON.stringify({
        case: name,
        version: context.browser()?.version(),
        launch: ['/usr/bin/open', '-a', dirname(dirname(dirname(launcher.executablePath))), launchUrl],
        profile: join(root, 'profile'), finalUrl, before, beforeWindows, remoteSetup, oldId, survivorId, workerStatus,
        helperBefore: helper?.status, helperBeforeWindows,
        historyEvidence: helperCase ? await worker.evaluate(() => Reflect.get(globalThis, '__externalHistoryEvidence')) : undefined,
        afterWindows:await options.evaluate(()=>chrome.windows.getAll({windowTypes:['normal']})),
        externalPage: { url: external.url(), readyState: await external.evaluate(() => document.readyState) },
        after: await tabs(), groups: await options.evaluate(() => chrome.tabGroups.query({}))
      }, null, 2));
      await testInfo.attach('native-external-result', { path: evidencePath, contentType: 'application/json' });
      await cdp.detach();
    }
  } catch (error) {
    testFailed = true;
    throw error;
  } finally {
    await cleanupExternalAppTrial({ helper, context, servers: [http, https], launcher, profileRoot: root }, testFailed);
  }
}

for (const name of cases) {
  const outcome = name === 'disabled HTTPS control' ? 'retains both tabs ungrouped'
    : name === 'remote rule HTTPS' || name === 'remote foreground-helper HTTPS history' ? 'reuses remote Group A and presents incoming tab'
    : name === 'remote ungrouped HTTPS' ? 'inherits remote ungrouped location and presents incoming tab'
    : 'inherits manual group and closes older duplicate';
  test(`native external ${name} ${outcome}`, { tag: '@native-macos' }, async ({}, testInfo) => {

    await runNativeCase(name, testInfo);
  });
}
