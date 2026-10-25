import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type Foundation = { context: BrowserContext; options: Page; worker: Worker; extensionId: string };
const test = base.extend<{ foundation: Foundation }>({
  foundation: async ({}, use) => {
    const extension = resolve('dist');
    await access(join(extension, 'manifest.json')); // Missing build must fail before browser startup.
    const profile = await mkdtemp(join(tmpdir(), 'chromerehome-browser-'));
    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium', headless: true,
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      });
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      const extensionId = new URL(worker.url()).host;
      const options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options/index.html`);
      await expect(options.getByRole('heading', { name: 'Foundation installed' })).toBeVisible();
      await expect(options.getByRole('status')).toContainText('disabled');
      await context.route(/^https?:\/\/foundation\.test\//, (route) => route.fulfill({
        contentType: 'text/html', body: '<title>Foundation fixture</title><h1>Navigation fixture</h1>',
      }));
      await use({ context, options, worker, extensionId });
    } finally {
      await context?.close();
      await rm(profile, { recursive: true, force: true });
    }
  },
});

async function snapshot(options: Page) {
  return options.evaluate(async () => (await chrome.tabs.query({})).map(({ id, groupId, windowId, index }) => ({ id, groupId, windowId, index })).sort((a, b) => a.id! - b.id!));
}

test('loads, preserves tabs and groups through navigation, and revives a terminated worker', async ({ foundation }, testInfo) => {
  const { context, options, worker, extensionId } = foundation;
  const errors: string[] = [];
  options.on('pageerror', (error) => errors.push(error.message));
  await options.evaluate(() => chrome.storage.local.set({ chromeReHomeConfig: { schemaVersion: 1, enabled: true } }));
  await expect(options.getByRole('status')).toContainText('enabled');
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto('http://foundation.test/first');
  await second.goto('https://foundation.test/second');
  // Establish real group membership in the test harness; production code never groups tabs.
  await options.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const ids = tabs.filter((tab) => tab.url?.includes('foundation.test')).map((tab) => tab.id!);
    await chrome.tabs.group({ tabIds: [ids[0]!, ids[1]!] });
  });
  const before = await snapshot(options);
  expect(before.filter((tab) => tab.groupId !== -1)).toHaveLength(2);
  await first.goto('https://foundation.test/third');
  await second.goto('http://foundation.test/fourth');
  expect(await snapshot(options)).toEqual(before);
  expect(await worker.evaluate(() => chrome.webNavigation.onCommitted.hasListeners())).toBe(true);

  await worker.evaluate(() => { Object.defineProperty(globalThis, '__foundationSmokeRealm', { value: crypto.randomUUID() }); });
  const cdp = await context.newCDPSession(options);
  type Version = { versionId: string; scriptURL: string; runningStatus: string; targetId?: string };
  const versions = new Map<string, Version>();
  cdp.on('ServiceWorker.workerVersionUpdated', ({ versions: changed }: { versions: Version[] }) => {
    for (const version of changed) versions.set(version.versionId, version);
  });
  try {
    await cdp.send('ServiceWorker.enable');
    await expect.poll(() => [...versions.values()].find((version) => version.scriptURL.startsWith(`chrome-extension://${extensionId}/`) && version.runningStatus === 'running')).toBeTruthy();
    const original = [...versions.values()].find((version) => version.scriptURL.startsWith(`chrome-extension://${extensionId}/`) && version.runningStatus === 'running')!;
    const originalTarget = original.targetId;
    await cdp.send('ServiceWorker.stopWorker', { versionId: original.versionId });
    await expect.poll(() => versions.get(original.versionId)?.runningStatus).toBe('stopped');
    // No worker evaluation, message or endpoint wakes it; this ordinary navigation does.
    await first.goto('http://foundation.test/after-termination');
    await expect.poll(() => versions.get(original.versionId)?.runningStatus).toBe('running');
    const restarted = versions.get(original.versionId)!;
    expect(restarted.targetId).toBeTruthy();
    expect(await worker.evaluate(() => Reflect.has(globalThis, '__foundationSmokeRealm'))).toBe(false);
    expect(await worker.evaluate(() => ({
      committed: chrome.webNavigation.onCommitted.hasListeners(),
      history: chrome.webNavigation.onHistoryStateUpdated.hasListeners(),
      fragment: chrome.webNavigation.onReferenceFragmentUpdated.hasListeners(),
      removed: chrome.tabs.onRemoved.hasListeners(),
    }))).toEqual({ committed: true, history: true, fragment: true, removed: true });
    expect(await snapshot(options)).toEqual(before);
    await testInfo.attach('worker-restart', { body: JSON.stringify({ versionId: original.versionId, originalTarget, restartedTarget: restarted.targetId, status: restarted.runningStatus }), contentType: 'application/json' });
  } finally { await cdp.detach(); }
  expect(errors).toEqual([]);
  await testInfo.attach('chromium-version', { body: context.browser()?.version() ?? 'unavailable', contentType: 'text/plain' });
  // The consumer is intentionally a no-op. Revival and registered listeners are observable;
  // deterministic navigation delivery and delayed initialization belong to integration tests.
});

for (const [name, value, message] of [
  ['invalid', { schemaVersion: 1, enabled: 'yes' }, 'Stored configuration is invalid'],
  ['future', { schemaVersion: 99, enabled: true, futureRule: 'preserve me' }, 'requires a newer extension version'],
] as const) {
  test(`shows ${name} configuration errors without overwriting stored data`, async ({ foundation }) => {
    const { options } = foundation;
    await options.evaluate((config) => chrome.storage.local.set({ chromeReHomeConfig: config }), value);
    await expect(options.getByRole('status')).toContainText(message);
    await expect(options.getByRole('status')).toHaveAttribute('data-severity', 'error');
    await options.reload();
    await expect(options.getByRole('status')).toContainText(message);
    expect(await options.evaluate(async () => (await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig)).toEqual(value);
  });
}
