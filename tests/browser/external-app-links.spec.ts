import { test, expect, chromium, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { execFile } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createExternalAppLauncher } from './external-app-launch';
import { cleanupExternalAppTrial } from './external-app-cleanup';

type NativeCase = 'warm HTTP' | 'warm HTTPS' | 'HTTP to HTTPS final identity' | 'stopped-worker HTTPS' | 'disabled HTTPS control';
const cases: NativeCase[] = ['warm HTTP', 'warm HTTPS', 'HTTP to HTTPS final identity', 'stopped-worker HTTPS', 'disabled HTTPS control'];

async function config(options: Page, url: string, enabled: boolean) {
  await options.evaluate(({ enabled, url }) => chrome.storage.local.set({
    chromeReHomeConfig: {
      schemaVersion: 4,
      enabled,
      groupingRules: [{ enabled: true, pattern: new URL(url).origin + '/*', group: 'External' }],
      duplicateRules: []
    }
  }), { enabled, url });
  await expect(options.getByRole('status')).toContainText(enabled ? 'enabled' : 'disabled');
}

async function runNativeCase(name: NativeCase, testInfo: TestInfo) {
  const root = await mkdtemp(join(tmpdir(), 'chromerehome-external-profile-'));
  let launcher: Awaited<ReturnType<typeof createExternalAppLauncher>> | undefined;
  let context: BrowserContext | undefined;
  let http: ReturnType<typeof createHttpServer> | undefined;
  let https: ReturnType<typeof createHttpsServer> | undefined;
  let testFailed = false;
  try {
    launcher = await createExternalAppLauncher(chromium.executablePath());
    const key = join(root, 'key.pem');
    const cert = join(root, 'cert.pem');
    await promisify(execFile)('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost']);
    https = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) }, (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      res.end('<title>Native external trial</title>');
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
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const options = await context.newPage();
    await options.goto(`chrome-extension://${new URL(worker.url()).host}/options/index.html`);
    const tabs = () => options.evaluate(() => chrome.tabs.query({ windowType: 'normal' }));
    await config(options, finalUrl, false);
    const older = await context.newPage();
    await older.goto(finalUrl);
    const before = await tabs();
    const oldId = before.find(tab => tab.url === finalUrl)!.id!;
    expect(before.find(tab => tab.id === oldId)!.groupId).toBe(-1);
    const disabled = name === 'disabled HTTPS control';
    if (!disabled) await config(options, finalUrl, true);

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
          return { grouped: survivor !== undefined && survivor.groupId !== -1,
            oldClosed: !current.some(tab => tab.id === oldId) };
        }).toEqual({ grouped: true, oldClosed: true });
        const survivor = (await tabs()).find(tab => tab.id === survivorId)!;
        expect(survivor.url).toBe(finalUrl);
        expect(await options.evaluate(id => chrome.tabGroups.get(id).then(group => group.title), survivor.groupId)).toBe('External');
      }
      const expectedIds = [...before.map(tab => tab.id!), survivorId].filter(id => disabled || id !== oldId).sort((a, b) => a - b);
      expect((await tabs()).map(tab => tab.id!).sort((a, b) => a - b)).toEqual(expectedIds);
    } finally {
      const evidencePath = testInfo.outputPath('native-external-result.json');
      await writeFile(evidencePath, JSON.stringify({
        case: name,
        version: context.browser()?.version(),
        launch: ['/usr/bin/open', '-a', dirname(dirname(dirname(launcher.executablePath))), launchUrl],
        profile: join(root, 'profile'), finalUrl, before, oldId, survivorId, workerStatus,
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
    await cleanupExternalAppTrial({ context, servers: [http, https], launcher, profileRoot: root }, testFailed);
  }
}

for (const name of cases) {
  const outcome = name === 'disabled HTTPS control' ? 'retains both tabs ungrouped' : 'groups survivor and closes older duplicate';
  test(`native external ${name} ${outcome}`, async ({}, testInfo) => {
    test.skip(process.platform !== 'darwin', 'Requires macOS LaunchServices and a bundled Chromium app.');
    await runNativeCase(name, testInfo);
  });
}
