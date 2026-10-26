import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import type {} from './navigation-fixture';

type Fixture = { context: BrowserContext; worker: Worker; origin: string; releaseSlow(): void };
const test = base.extend<{ navigation: Fixture }>({
  navigation: async ({}, use, testInfo) => {
    const root = await mkdtemp(join(tmpdir(), 'chromerehome-navigation-'));
    const extension = join(root, 'extension');
    let context: BrowserContext | undefined;
    let slow: ServerResponse | undefined;
    const html = (path: string) => `<!doctype html><title>${path}</title>
      <a href="/one">one</a><a href="/two">two</a><a href="/server">server</a>
      <a href="/client">client</a><a href="/shared">shared</a><a href="/slow">slow</a>
      <button id="push" onclick="history.pushState({}, '', '/spa')">push</button>
      <button id="replace" onclick="history.replaceState({}, '', '/replaced')">replace</button>
      <button id="noop" onclick="history.replaceState({}, '', location.href)">noop</button>
      <button id="hash" onclick="location.hash='route'">hash</button>
      <button id="redirect" onclick="location.assign('/client-final')">redirect</button>
      ${path === '/client' ? `<script>location.assign('/client-final')</script>` : ''}
      ${path === '/warm' ? `<script>setTimeout(() => location.assign('/client-final'), 2500)</script>` : ''}`;
    const server = createServer((request, response) => {
      const path = request.url!.split('?')[0]!;
      if (path === '/server') { response.writeHead(302, { Location: '/server-final' }); response.end(); return; }
      if (path === '/slow') { slow = response; return; }
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      response.end(html(path));
    });
    try {
      await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
      const address = server.address();
      if (!address || typeof address === 'string') throw Error('No fixture address');
      const origin = `http://127.0.0.1:${address.port}`;
      await cp(resolve('dist'), extension, { recursive: true });
      await build({ entryPoints: [resolve('tests/browser/navigation-fixture.ts')], outfile: join(extension, 'background/index.js'),
        bundle: true, format: 'esm', target: 'chrome120' });
      context = await chromium.launchPersistentContext(join(root, 'profile'), { channel: 'chromium', headless: true,
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      testInfo.annotations.push({ type: 'Chromium', description: context.browser()!.version() });
      await expect.poll(() => worker.evaluate(() => typeof navigationFixture)).toBe('object');
      await use({ context, worker, origin, releaseSlow() { slow?.writeHead(200, { 'Content-Type': 'text/html' }); slow?.end(html('/slow')); } });
      expect(await worker.evaluate(() => navigationFixture.failures)).toEqual([]);
      await testInfo.attach('actual-navigation-events', { body: JSON.stringify(await worker.evaluate(() => navigationFixture.trace), null, 2), contentType: 'application/json' });
    } finally {
      slow?.end();
      await context?.close();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await rm(root, { recursive: true, force: true });
    }
  },
});
async function eventFor(worker: Worker, url: string, kind = 'committed') {
  await expect.poll(() => worker.evaluate(({ url, kind }) => navigationFixture.trace.filter((event) => event.url === url && event.kind === kind).at(-1), { url, kind })).toBeTruthy();
  return (await worker.evaluate(({ url, kind }) => navigationFixture.trace.filter((event) => event.url === url && event.kind === kind).at(-1)!, { url, kind }));
}
async function tabId(worker: Worker, page: Page) {
  const url = page.url();
  return worker.evaluate(async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)!.id!, url);
}

test('records real commits, redirects, same-document changes, reload and back-forward', async ({ navigation }) => {
  const { context, worker, origin } = navigation;
  const page = await context.newPage();
  await page.goto(origin + '/start');
  const first = await eventFor(worker, origin + '/start');
  expect(first).toMatchObject({ eligible: true, documentLifecycle: 'active', frameType: 'outermost_frame' });
  expect(first.documentId).toBeTruthy();
  await page.getByRole('link', { name: 'one', exact: true }).click();
  expect(await eventFor(worker, origin + '/one')).toMatchObject({ eligible: true, transitionType: 'link' });
  await page.getByRole('link', { name: 'server', exact: true }).click();
  const server = await eventFor(worker, origin + '/server-final');
  expect(server.eligible).toBe(true);
  expect(server.transitionQualifiers).toContain('server_redirect');
  await page.getByRole('link', { name: 'client', exact: true }).click();
  await page.waitForURL(origin + '/client-final');
  const client = await eventFor(worker, origin + '/client-final');
  expect(client.eligible).toBe(true);
  expect(client.transitionQualifiers).toContain('client_redirect');
  await page.locator('#push').click();
  expect(await eventFor(worker, origin + '/spa', 'history')).toMatchObject({ eligible: true, documentId: client.documentId });
  await page.locator('#replace').click();
  expect(await eventFor(worker, origin + '/replaced', 'history')).toMatchObject({ eligible: true, documentId: client.documentId });
  await page.locator('#noop').click();
  await expect.poll(() => worker.evaluate(() => navigationFixture.trace.filter((e) => e.kind === 'history' && e.url.endsWith('/replaced')).length)).toBe(2);
  expect((await eventFor(worker, origin + '/replaced', 'history')).eligible).toBe(false);
  await page.locator('#hash').click();
  expect(await eventFor(worker, origin + '/replaced#route', 'fragment')).toMatchObject({ eligible: true });
  await page.reload();
  expect(await eventFor(worker, origin + '/replaced#route')).toMatchObject({ transitionType: 'reload', eligible: false });
  await page.locator('#push').click();
  expect(await eventFor(worker, origin + '/spa', 'history')).toMatchObject({ eligible: false });
  await page.getByRole('link', { name: 'one', exact: true }).click();
  await page.getByRole('link', { name: 'two', exact: true }).click();
  await page.goBack();
  const back = await eventFor(worker, origin + '/one');
  expect(back.transitionQualifiers).toContain('forward_back');
  expect(back.eligible).toBe(true);
  await page.goForward();
  const forward = await eventFor(worker, origin + '/two');
  expect(forward.transitionQualifiers).toContain('forward_back');
  expect(forward.eligible).toBe(true);
});

test('selects the latest real matching navigation and excludes an observable pending snapshot', async ({ navigation }, testInfo) => {
  const { context, worker, origin, releaseSlow } = navigation;
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto(origin + '/shared');
  const firstId = await tabId(worker, first);
  const firstEvent = await eventFor(worker, origin + '/shared');
  await second.goto(origin + '/shared');
  await expect.poll(() => worker.evaluate(() => navigationFixture.trace.filter((e) => e.url.endsWith('/shared') && e.eligible).length)).toBe(2);
  const ids = await worker.evaluate(async (url) => (await chrome.tabs.query({})).filter((t) => t.url === url).map((t) => t.id!), origin + '/shared');
  const secondId = ids.find((id) => id !== firstId)!;
  expect((await eventFor(worker, origin + '/shared')).sequence).toBeGreaterThan(firstEvent.sequence!);
  expect(await worker.evaluate((id) => navigationFixture.select(id), firstId)).toEqual({ kind: 'skip', reason: 'superseded' });
  expect(await worker.evaluate((id) => navigationFixture.select(id), secondId)).toMatchObject({ kind: 'selected', winner: secondId, anchor: firstId });
  const slow = first.goto(origin + '/slow');
  await expect.poll(() => worker.evaluate((id) => navigationFixture.state().blockedTabIds.includes(id), firstId)).toBe(true);
  const snapshot = await worker.evaluate((id) => chrome.tabs.get(id), firstId);
  expect(snapshot.pendingUrl).toBe(origin + '/slow');
  expect(await worker.evaluate((id) => navigationFixture.select(id), secondId)).toEqual({ kind: 'skip', reason: 'no-duplicates' });
  await testInfo.attach('actual-pending-snapshot', { body: JSON.stringify(snapshot), contentType: 'application/json' });
  releaseSlow();
  await slow;
});

test('loses document provenance across an actual worker restart and records harness capabilities', async ({ navigation }, testInfo) => {
  const { context, worker, origin } = navigation;
  const page = await context.newPage();
  await page.goto(origin + '/warm');
  await eventFor(worker, origin + '/warm');
  const realm = await worker.evaluate(() => navigationFixture.realm);
  const cdp = await context.newCDPSession(page);
  const versions = new Map<string, { versionId: string; scriptURL: string; runningStatus: string }>();
  cdp.on('ServiceWorker.workerVersionUpdated', ({ versions: changed }) => { for (const version of changed) versions.set(version.versionId, version); });
  try {
    await cdp.send('ServiceWorker.enable');
    await expect.poll(() => [...versions.values()].find((v) => v.scriptURL === worker.url() && v.runningStatus === 'running')).toBeTruthy();
    const version = [...versions.values()].find((v) => v.scriptURL === worker.url() && v.runningStatus === 'running')!;
    await cdp.send('ServiceWorker.stopWorker', { versionId: version.versionId });
    await expect.poll(() => versions.get(version.versionId)?.runningStatus).toBe('stopped');
    await page.locator('#push').click();
    await expect.poll(() => versions.get(version.versionId)?.runningStatus).toBe('running');
    expect(await worker.evaluate(() => navigationFixture.realm)).not.toBe(realm);
    expect(await eventFor(worker, origin + '/spa', 'history')).toMatchObject({ eligible: false });
    await page.waitForURL(origin + '/client-final');
    const delayed = await eventFor(worker, origin + '/client-final');
    expect(delayed).toMatchObject({ eligible: true, transitionType: 'link', transitionQualifiers: [] });
    testInfo.annotations.push({ type: 'Metadata limit', description: 'Delayed script navigation reports ordinary link, not client_redirect; this is not cold-client-redirect coverage.' });
    await page.getByRole('link', { name: 'one', exact: true }).click();
    expect(await eventFor(worker, origin + '/one')).toMatchObject({ eligible: true });
    // CDP exposes target navigation and capabilities; it cannot emulate trusted omnibox/external-app UI or profile restore.
    const capabilities = await cdp.send('Schema.getDomains');
    const restore = await worker.evaluate(() => ({ sessions: typeof chrome.sessions }));
    await testInfo.attach('capability-attempts', { body: JSON.stringify({ domains: capabilities.domains.map((d) => d.name), restore,
      gaps: ['sessions permission absent; no sessions.restore API', 'headless target navigation cannot type trusted omnibox or launch external applications'] }), contentType: 'application/json' });
  } finally { await cdp.detach(); }
});


test('attempts supported prerender controls without inventing replacement evidence', async ({ navigation }, testInfo) => {
  const { context, worker, origin } = navigation;
  const page = await context.newPage();
  await page.goto(origin + '/prerender-root');
  await eventFor(worker, origin + '/prerender-root');
  const cdp = await context.newCDPSession(page);
  const statuses: unknown[] = [];
  cdp.on('Preload.prerenderStatusUpdated', (status) => { statuses.push(status); });
  let capability = 'not attempted';
  try {
    await cdp.send('Preload.enable');
    const supported = await page.evaluate((target) => {
      if (!HTMLScriptElement.supports('speculationrules')) return false;
      const rules = document.createElement('script');
      rules.type = 'speculationrules';
      rules.textContent = JSON.stringify({ prerender: [{ source: 'list', urls: [target], eagerness: 'immediate' }] });
      document.head.append(rules);
      return true;
    }, origin + '/prerender-target');
    if (supported) {
      try {
        await expect.poll(() => statuses.length, { timeout: 2000 }).toBeGreaterThan(0);
        capability = 'Native Preload statuses observed; activation/replacement is not established by status alone';
      } catch { capability = 'Speculation rules supported, but no Preload status arrived within the bounded 2s probe'; }
      await page.evaluate((target) => {
        const link = document.createElement('a'); link.href = target; link.textContent = 'activate'; document.body.append(link);
      }, origin + '/prerender-target');
      await page.getByRole('link', { name: 'activate', exact: true }).click();
      await page.waitForURL(origin + '/prerender-target');
    } else capability = 'HTMLScriptElement.supports(speculationrules) is false';
  } catch (error) { capability = `Supported-control attempt failed: ${error instanceof Error ? error.message : String(error)}`; }
  finally { await cdp.detach(); }
  await testInfo.attach('actual-prerender-probe', { body: JSON.stringify({ capability, statuses,
    events: await worker.evaluate(() => navigationFixture.trace.filter((event) => event.url.includes('prerender'))),
    replacements: await worker.evaluate(() => navigationFixture.replacements),
    limit: 'No claim of actual tab replacement unless native replacement was observed; both callback orders are unit/integration gated. Manual disposable Chrome activation still required.' }, null, 2), contentType: 'application/json' });
});
