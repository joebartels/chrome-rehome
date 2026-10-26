import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import validV3 from '../fixtures/config/valid-v3.json' with { type: 'json' };
import invalidV3 from '../fixtures/config/invalid-v3.json' with { type: 'json' };
import { duplicateCases, duplicateCompilationCases, invalidCandidates } from '../fixtures/duplicate-cases';
import type { compileDuplicateRules } from '../../src/rules/duplicates';
import validV2 from '../fixtures/config/valid-v2.json' with { type: 'json' };
import { groupingCases } from '../fixtures/grouping-cases';
import type { compileGroupingRules } from '../../src/rules/grouping';

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
      await expect(options.getByRole('heading', { name: 'ChromeReHome installed' })).toBeVisible();
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
  await options.evaluate((config) => chrome.storage.local.set({ chromeReHomeConfig: config }), validV3);
  const storedBytes = await options.evaluate(async () => JSON.stringify((await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig));
  expect(JSON.parse(storedBytes)).toEqual(validV3);
  await expect(options.getByRole('status')).toContainText('enabled');
  await options.reload();
  await expect(options.getByRole('status')).toContainText('enabled');
  await expect(options.getByRole('status')).toHaveAttribute('data-severity', 'info');
  expect(await options.evaluate(async () => JSON.stringify((await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig))).toBe(storedBytes);
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto('http://foundation.test/first');
  await second.goto('https://foundation.test/second');
  // Establish real group membership in the test harness; production grouping is enabled only for matching configured URLs.
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
  expect(await options.evaluate(async () => JSON.stringify((await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig))).toBe(storedBytes);
  await testInfo.attach('chromium-version', { body: context.browser()?.version() ?? 'unavailable', contentType: 'text/plain' });
  // These URLs have no configured destination. Revival and registered listeners are observable;
  // deterministic navigation delivery and delayed initialization belong to integration tests.
});

test('runs the actual grouping compiler with native Chromium URLPattern', async ({ foundation }) => {
  const fixture = await mkdtemp(join(tmpdir(), 'chromerehome-grouping-'));
  const page = await foundation.context.newPage();
  try {
    const bundle = join(fixture, 'grouping.js');
    await build({ entryPoints: [resolve('src/rules/grouping.ts')], outfile: bundle, bundle: true, format: 'iife', globalName: 'Grouping', target: 'chrome120' });
    await page.goto('https://foundation.test/grouping');
    // Test-only script in a routed fixture page, never in the extension package.
    await page.addScriptTag({ path: bundle });
    const actual = await page.evaluate((cases) => {
      const { compileGroupingRules: compile } = (window as unknown as { Grouping: { compileGroupingRules: typeof compileGroupingRules } }).Grouping;
      return cases.map(([pattern, url]) => {
        const compiled = compile([{ pattern, group: 'BarTab' }]);
        if (compiled.kind !== 'ready') throw new Error(compiled.message);
        return compiled.match(url)?.group ?? null;
      });
    }, groupingCases);
    for (const [index, [pattern, url, matches]] of groupingCases.entries()) {
      expect(actual[index], `${pattern} against ${url}`).toBe(matches ? 'BarTab' : null);
    }
  } finally {
    await page.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test('runs the actual duplicate compiler with native Chromium URL and URLSearchParams', async ({ foundation }) => {
  const fixture = await mkdtemp(join(tmpdir(), 'chromerehome-duplicates-'));
  const page = await foundation.context.newPage();
  try {
    const bundle = join(fixture, 'duplicates.js');
    await build({ entryPoints: [resolve('src/rules/duplicates.ts')], outfile: bundle, bundle: true, format: 'iife', globalName: 'Duplicates', target: 'chrome120' });
    await page.goto('https://foundation.test/duplicates');
    await page.addScriptTag({ path: bundle });
    const actual = await page.evaluate(({ cases, invalid, compilationCases }) => {
      const { compileDuplicateRules: compile } = (window as unknown as { Duplicates: { compileDuplicateRules: typeof compileDuplicateRules } }).Duplicates;
      const results = cases.map(([, rules, left, right]) => {
        const engine = compile(rules);
        if (engine.kind !== 'ready') throw new Error(engine.message);
        const a = {url:left, incognito:false};
        const b = {url:right, incognito:false};
        return { valid: engine.identify(a) !== undefined && engine.identify(b) !== undefined,
          equivalent: engine.equivalent(a,b),
          contextSeparated: !engine.equivalent(a, {...a, incognito:true}) };
      });
      const engine = compile([]);
      if (engine.kind !== 'ready') throw new Error(engine.message);
      const compilations = compilationCases.map(([,rules]) => {
        const compiled = compile(rules);
        return compiled.kind === 'ready'
          ? {kind:compiled.kind, rules:compiled.rules}
          : {kind:compiled.kind, ruleIndex:compiled.ruleIndex, message:compiled.message,
              exposesIdentity: Object.hasOwn(compiled, 'identify') || Object.hasOwn(compiled, 'equivalent')};
      });
      return {results, compilations, invalid:invalid.map(url => {
        const candidate = {url, incognito:false};
        return engine.identify(candidate) === undefined && !engine.equivalent(candidate,candidate);
      })};
    }, {cases:duplicateCases, invalid:invalidCandidates, compilationCases:duplicateCompilationCases});
    for (const [index, [name,,,, equivalent]] of duplicateCases.entries()) {
      expect(actual.results[index], name).toEqual({valid:true, equivalent, contextSeparated:true});
    }
    expect(actual.invalid).toEqual(invalidCandidates.map(() => true));
    for (const [index, [name, rules, kind, ruleIndex]] of duplicateCompilationCases.entries()) {
      const result = actual.compilations[index]!;
      expect(result.kind, name).toBe(kind);
      if (result.kind === 'ready') {
        expect(result.rules, name).toEqual(rules);
      } else {
        expect(result.ruleIndex, name).toBe(ruleIndex);
        expect(result.message!.length, name).toBeGreaterThan(0);
        expect(result.exposesIdentity, name).toBe(false);
      }
    }
  } finally {
    await page.close();
    await rm(fixture, { recursive:true, force:true });
  }
});

for (const legacy of [{schemaVersion:1, enabled:true}, validV2]) {
  test(`migrates version ${legacy.schemaVersion} in memory without writing storage`, async ({ foundation }) => {
    const { options } = foundation;
    await options.evaluate((config) => chrome.storage.local.set({ chromeReHomeConfig: config }), legacy);
    const bytes = await options.evaluate(async () => JSON.stringify((await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig));
    expect(JSON.parse(bytes)).toEqual(legacy);
    const before = await snapshot(options);
    await options.reload();
    await expect(options.getByRole('status')).toContainText('enabled');
    await expect(options.getByRole('status')).toHaveAttribute('data-severity', 'info');
    expect(await options.evaluate(async () => JSON.stringify((await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig))).toBe(bytes);
    expect(await snapshot(options)).toEqual(before);
  });
}

for (const [name, value, message] of [
  ['invalid', { schemaVersion: 1, enabled: 'yes' }, 'Stored configuration is invalid'],
  ['invalid rules', { schemaVersion: 2, enabled: true, groupingRules: [{ pattern: 'https://example.com/?x', group: 'Bad' }] }, 'Stored configuration is invalid'],
  ['invalid duplicate rules', invalidV3, 'Stored configuration is invalid'],
  ['future', { schemaVersion: 4, enabled: true, futureRule: 'preserve me' }, 'requires a newer extension version'],
] as const) {
  test(`shows ${name} configuration errors without overwriting stored data`, async ({ foundation }) => {
    const { options } = foundation;
    const before = await snapshot(options);
    await options.evaluate((config) => chrome.storage.local.set({ chromeReHomeConfig: config }), value);
    await expect(options.getByRole('status')).toContainText(message);
    await expect(options.getByRole('status')).toHaveAttribute('data-severity', 'error');
    await options.reload();
    await expect(options.getByRole('status')).toContainText(message);
    expect(await options.evaluate(async () => (await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig)).toEqual(value);
    expect(await snapshot(options)).toEqual(before);
  });
}
