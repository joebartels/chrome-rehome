import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import validV3 from '../fixtures/config/valid-v3.json' with { type: 'json' };
import type { Config } from '../../src/config/schema';

type Editor = { context: BrowserContext; page: Page; url: string; errors: string[] };
const test = base.extend<{ editor: Editor }>({
  editor: async ({}, use) => {
    const extension = resolve('dist'); await access(join(extension, 'manifest.json'));
    const profile = await mkdtemp(join(tmpdir(), 'chromerehome-editor-'));
    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      const errors: string[] = [];
      context.on('page', page => page.on('pageerror', error => { errors.push(error.message); }));
      const page = await context.newPage();
      const url = `chrome-extension://${new URL(worker.url()).host}/options/index.html`;
      await page.goto(url); await expect(page.getByRole('status')).toContainText('disabled');
      await context.route('https://editor.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Editor fixture</title>' }));
      await use({ context, page, url, errors });
      expect(errors).toEqual([]);
    } finally { await context?.close(); await rm(profile, { recursive: true, force: true }); }
  },
});
const empty = { schemaVersion: 4, enabled: false, groupingRules: [], duplicateRules: [] };
const stored = (page: Page) => page.evaluate(async () => (await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig as Config | undefined);
const seed = (page: Page, config: unknown) => page.evaluate(value => chrome.storage.local.set({ chromeReHomeConfig: value }), config);
const group = (page: Page, n = 1) => page.getByRole('group', { name: `Grouping rule ${n}`, exact: true });
const duplicate = (page: Page, n = 1) => page.getByRole('group', { name: `Duplicate rule ${n}`, exact: true });
async function addGroup(page: Page, pattern = 'https://editor.test/*', name = 'Work') {
  await page.getByRole('button', { name: 'Add grouping rule', exact: true }).click();
  const row = page.getByRole('group', { name: /^Grouping rule \d+$/ }).last();
  await row.getByLabel(/pattern$/i).fill(pattern); await row.getByLabel(/group name$/i).fill(name);
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.locator('#editor-message')).toHaveText('Settings saved.');
}
async function tabs(page: Page) {
  return page.evaluate(async () => (await chrome.tabs.query({})).map(({ id, groupId, windowId, index }) => ({ id, groupId, windowId, index })).sort((a, b) => a.id! - b.id!));
}

test('supports keyboard editing, stable caret, ordered row actions and exact whole-document save', async ({ editor: { page } }) => {
  await page.getByRole('button', { name: 'Add grouping rule', exact: true }).focus(); await page.keyboard.press('Enter');
  const pattern = group(page).getByLabel(/pattern$/i);
  await expect(pattern).toBeFocused(); await pattern.pressSequentially('https://editor.test/*');
  await expect(pattern).toBeFocused(); expect(await pattern.evaluate(input => (input as HTMLInputElement).selectionStart)).toBe(21);
  const name = group(page).getByLabel(/group name$/i);
  await name.fill('Wok'); await name.press('ArrowLeft'); await name.pressSequentially('r');
  await expect(name).toHaveValue('Work'); await expect(name).toBeFocused();
  await addGroup(page, 'https://editor.test/specific/*', 'Specific');
  await page.getByRole('button', { name: 'Move grouping rule 2 up', exact: true }).click();
  await expect(group(page, 1).getByLabel(/group name$/i)).toHaveValue('Specific');
  await expect(page.getByRole('button', { name: 'Move grouping rule 1 up', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move grouping rule 1 down', exact: true })).toBeFocused();
  await group(page, 2).getByLabel(/enabled$/i).uncheck();
  await page.getByRole('button', { name: 'Add duplicate rule', exact: true }).click();
  await duplicate(page).getByLabel(/origin$/i).fill('https://editor.test');
  await duplicate(page).getByLabel(/ignored query names$/i).fill('utm_source\nCampaign');
  await duplicate(page).getByLabel(/ignore fragment$/i).check();
  await duplicate(page).getByLabel(/ignore trailing slash$/i).check();
  await duplicate(page).getByLabel(/sort query parameters$/i).check();
  await page.getByRole('button', { name: 'Add duplicate rule', exact: true }).click();
  await duplicate(page, 2).getByLabel(/origin$/i).fill('https://other.test');
  await page.getByRole('button', { name: 'Move duplicate rule 2 up', exact: true }).click();
  await page.getByRole('button', { name: 'Delete duplicate rule 1', exact: true }).click();
  await expect(duplicate(page).getByLabel(/origin$/i)).toBeFocused();
  await save(page);
  const expected = { ...empty, groupingRules: [
    { enabled: true, pattern: 'https://editor.test/specific/*', group: 'Specific' },
    { enabled: false, pattern: 'https://editor.test/*', group: 'Work' },
  ], duplicateRules: [{ enabled: true, origin: 'https://editor.test', ignoreQueryParameters: ['utm_source', 'Campaign'], ignoreFragment: true, ignoreTrailingSlash: true, sortQueryParameters: true }] };
  expect(await stored(page)).toEqual(expected);
  await page.reload(); await expect(group(page, 2).getByLabel(/enabled$/i)).not.toBeChecked();
  await expect(duplicate(page).getByLabel(/ignored query names$/i)).toHaveValue('utm_source\nCampaign');
  expect(await stored(page)).toEqual(expected);
  await page.getByRole('button', { name: 'Delete grouping rule 2', exact: true }).click();
  await page.getByRole('button', { name: 'Delete grouping rule 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add grouping rule', exact: true })).toBeFocused();
});

test('previews actual ordered rules and duplicate policies without storage, requests or tab mutations', async ({ editor: { context, page } }) => {
  await seed(page, empty); await expect(page.getByRole('status')).toContainText('disabled');
  const beforeTabs = await tabs(page); const bytes = JSON.stringify(await stored(page));
  let requests = 0; page.on('request', () => { requests++; });
  await addGroup(page, 'https://editor.test/*', '<img src=x onerror=alert(1)>');
  await addGroup(page, 'https://editor.test/specific/*', 'Specific');
  await page.getByLabel('URL to preview', { exact: true }).fill('https://editor.test/specific/a?utm=one#left');
  await page.getByLabel('Compare with URL', { exact: true }).fill('https://editor.test/specific/a?utm=two#right');
  await expect(page.locator('#preview-grouping')).toHaveText('Grouping rule 1: <img src=x onerror=alert(1)>');
  expect(await page.locator('#preview-grouping img').count()).toBe(0);
  await expect(page.locator('#preview-comparison')).toHaveText('Distinct URLs');
  await page.getByRole('button', { name: 'Move grouping rule 2 up', exact: true }).click();
  await expect(page.locator('#preview-grouping')).toHaveText('Grouping rule 1: Specific');
  await group(page).getByLabel(/enabled$/i).uncheck();
  await expect(page.locator('#preview-grouping')).toContainText('Grouping rule 2:');
  await page.getByRole('button', { name: 'Add duplicate rule', exact: true }).click();
  await duplicate(page).getByLabel(/origin$/i).fill('https://editor.test');
  await duplicate(page).getByLabel(/ignored query names$/i).fill('utm');
  await duplicate(page).getByLabel(/ignore fragment$/i).check();
  await expect(page.locator('#preview-comparison')).toHaveText('Equivalent duplicate URLs');
  await expect(page.locator('#preview-duplicate-left')).toHaveText('Duplicate rule 1: https://editor.test');
  await duplicate(page).getByLabel(/enabled$/i).uncheck();
  await expect(page.locator('#preview-comparison')).toHaveText('Distinct URLs');
  await expect(page.locator('#preview-duplicate-left')).toHaveText('Conservative duplicate comparison');
  await page.getByLabel('URL to preview', { exact: true }).fill('bad url');
  await expect(page.locator('#preview-grouping')).toHaveText('Invalid or unsupported URL');
  await page.getByLabel('URL to preview', { exact: true }).fill('https://elsewhere.test/a');
  await expect(page.locator('#preview-grouping')).toHaveText('No grouping rule matches');
  expect(JSON.stringify(await stored(page))).toBe(bytes); expect(await tabs(page)).toEqual(beforeTabs); expect(requests).toBe(0);
  expect(context.pages().length).toBeGreaterThan(0);
});

test('completes add edit disable save reload and delete using only the keyboard', async ({ editor: { page } }) => {
  await page.getByRole('button', { name: 'Add grouping rule', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('https://editor.test/*');
  await page.keyboard.press('Tab'); await page.keyboard.type('Keyboard');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
  await expect(group(page).getByLabel(/enabled$/i)).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#editor-message')).toHaveText('Settings saved.');
  expect((await stored(page))?.groupingRules).toEqual([{ enabled: false, pattern: 'https://editor.test/*', group: 'Keyboard' }]);
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.locator('#editor-message')).toHaveText('Saved settings reloaded.');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Delete grouping rule 1', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Add grouping rule', exact: true })).toBeFocused();
});

test('validates disabled rows, exact multiline names, native bounds and list limits accessibly', async ({ editor: { page } }) => {
  await page.getByRole('button', { name: 'Add grouping rule', exact: true }).click();
  await group(page).getByLabel(/enabled$/i).uncheck();
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
  await expect(group(page).getByLabel(/pattern$/i)).toHaveAttribute('aria-invalid', 'true');
  await expect(group(page).getByLabel(/pattern$/i)).toHaveAttribute('aria-describedby', /grouping-\d+-error/);
  await expect(group(page).getByLabel(/pattern$/i)).toHaveAttribute('maxlength', '2048');
  await expect(group(page).getByLabel(/group name$/i)).toHaveAttribute('maxlength', '80');
  await group(page).getByLabel(/pattern$/i).fill('https://editor.test/*'); await group(page).getByLabel(/group name$/i).fill('Valid');
  await page.getByRole('button', { name: 'Add duplicate rule', exact: true }).click();
  await duplicate(page).getByLabel(/origin$/i).fill('https://editor.test');
  await expect(duplicate(page).getByLabel(/origin$/i)).toHaveAttribute('maxlength', '2048');
  const names = duplicate(page).getByLabel(/ignored query names$/i);
  await expect(names).toHaveAttribute('maxlength', '25699');
  for (const invalid of ['utm\n\nother', 'utm\nutm', 'x'.repeat(257), Array.from({ length: 101 }, (_, n) => `q${n}`).join('\n')]) {
    await names.fill(invalid); await expect(names).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
    await expect(page.locator('#preview-grouping')).toHaveText('Fix rule errors to preview.');
    await expect(names).toHaveValue(invalid);
  }
  await names.fill(''); await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeEnabled(); await save(page);
  expect((await stored(page))?.duplicateRules[0]?.ignoreQueryParameters).toEqual([]);
  await seed(page, { ...empty, groupingRules: Array.from({ length: 100 }, (_, n) => ({ enabled: false, pattern: `https://editor.test/${n}`, group: `${n}` })), duplicateRules: Array.from({ length: 100 }, (_, n) => ({ enabled: false, origin: `https://host${n}.test`, ignoreQueryParameters: [], ignoreFragment: false, ignoreTrailingSlash: false, sortQueryParameters: false })) });
  await expect(page.getByRole('button', { name: 'Add grouping rule', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add duplicate rule', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move grouping rule 100 down', exact: true })).toBeDisabled();
});

test('propagates clean saves across pages and preserves dirty draft on conflict until explicit reload', async ({ editor: { context, page, url } }) => {
  await seed(page, empty); const second = await context.newPage(); await second.goto(url);
  await addGroup(page); await save(page);
  await expect(group(second).getByLabel(/group name$/i)).toHaveValue('Work');
  await group(second).getByLabel(/group name$/i).fill('Second draft');
  await group(page).getByLabel(/group name$/i).fill('First saved'); await save(page);
  await expect(second.locator('#editor-message')).toContainText('Saved settings changed');
  await expect(group(second).getByLabel(/group name$/i)).toHaveValue('Second draft');
  await expect(second.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
  expect((await stored(second))?.groupingRules[0]?.group).toBe('First saved');
  await second.getByRole('button', { name: 'Reload saved settings', exact: true }).click();
  await expect(group(second).getByLabel(/group name$/i)).toHaveValue('First saved');
  await expect(second.getByRole('button', { name: 'Save settings', exact: true })).toBeEnabled();
});

test('a rejected worker Chrome write retains draft and permits a successful Save retry', async ({ editor: { context, page } }) => {
  await seed(page, empty); await addGroup(page);
  await page.getByLabel('URL to preview', { exact: true }).fill('https://editor.test/retained');
  await context.serviceWorkers()[0]!.evaluate(() => {
    const original = chrome.storage.local.set.bind(chrome.storage.local);
    let fail = true;
    chrome.storage.local.set = ((value: Record<string, unknown>) => {
      if (fail) { fail = false; return Promise.reject(new Error('injected failure')); }
      return original(value);
    }) as typeof chrome.storage.local.set;
  });
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.locator('#editor-message')).toContainText('Could not save settings');
  await expect(group(page).getByLabel(/group name$/i)).toHaveValue('Work');
  await expect(page.getByLabel('URL to preview', { exact: true })).toHaveValue('https://editor.test/retained');
  expect(await stored(page)).toEqual(empty); await save(page);
  expect((await stored(page))?.groupingRules[0]?.group).toBe('Work');
});

test('preserves v3 bytes until explicit v4 save and saved enabled rules affect actual background grouping', async ({ editor: { context, page } }) => {
  await seed(page, validV3); await expect(page.getByRole('status')).toContainText('enabled');
  const bytes = JSON.stringify(await stored(page)); await page.reload(); await expect(page.getByRole('status')).toContainText('enabled');
  expect(JSON.stringify(await stored(page))).toBe(bytes);
  await page.getByRole('button', { name: 'Reload saved settings', exact: true }).click();
  expect(JSON.stringify(await stored(page))).toBe(bytes); await save(page); expect((await stored(page))?.schemaVersion).toBe(4);
  await seed(page, { ...empty, enabled: true }); await expect(page.getByRole('status')).toContainText('enabled');
  await addGroup(page); await save(page); expect((await stored(page))?.enabled).toBe(true);
  const first = await context.newPage(); await first.goto('https://editor.test/active');
  await expect.poll(async () => (await page.evaluate(() => chrome.tabs.query({}))).find(tab => tab.url === 'https://editor.test/active')?.groupId).not.toBe(-1);
  const active = (await page.evaluate(() => chrome.tabs.query({}))).find(tab => tab.url === 'https://editor.test/active')!;
  expect(await page.evaluate(id => chrome.tabGroups.get(id).then(value => value.title), active.groupId)).toBe('Work');
  await group(page).getByLabel(/enabled$/i).uncheck(); await save(page);
  const second = await context.newPage(); await second.goto('https://editor.test/disabled');
  await expect.poll(async () => (await page.evaluate(() => chrome.tabs.query({}))).find(tab => tab.url === 'https://editor.test/disabled')?.status).toBe('complete');
  expect((await page.evaluate(() => chrome.tabs.query({}))).find(tab => tab.url === 'https://editor.test/disabled')?.groupId).toBe(-1);
});

test('captures light dark wide and narrow editor layouts', async ({ editor: { page } }, info) => {
  await addGroup(page, 'https://editor.test/*', 'Work'); await page.getByRole('button', { name: 'Add duplicate rule', exact: true }).click();
  await duplicate(page).getByLabel(/origin$/i).fill('https://editor.test');
  await duplicate(page).getByLabel(/ignored query names$/i).fill('utm_source\nutm_campaign');
  await duplicate(page).getByLabel(/ignore fragment$/i).check();
  await page.getByLabel('URL to preview', { exact: true }).fill('https://editor.test/project?utm_source=mail#notes');
  await page.getByLabel('Compare with URL', { exact: true }).fill('https://editor.test/project?utm_source=chat#top');
  expect(await page.getByRole('heading', { name: 'ChromeReHome', exact: true }).count()).toBe(1);
  expect(await page.locator('section').count()).toBe(4);
  for (const colorScheme of ['light', 'dark'] as const) for (const width of [1280, 390]) {
    await page.emulateMedia({ colorScheme }); await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('#preview-comparison')).toBeInViewport();
    const path = info.outputPath(`${colorScheme}-${width}.png`);
    await page.screenshot({ path }); await info.attach(`${colorScheme}-${width}`, { path, contentType: 'image/png' });
    if (width === 390) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('#preview-comparison').scrollIntoViewIfNeeded();
      const previewPath = info.outputPath(`${colorScheme}-${width}-preview.png`);
      await page.screenshot({ path: previewPath }); await info.attach(`${colorScheme}-${width}-preview`, { path: previewPath, contentType: 'image/png' });
    }
  }
});


test('worker pause preserves a dirty options draft and rules save preserves pause', async ({ editor: { page } }) => {
  await seed(page, { ...empty, enabled: true }); await expect(page.getByRole('status')).toContainText('enabled');
  await addGroup(page);
  const pause = await page.evaluate(async () => {
    const current = await chrome.runtime.sendMessage({ kind: 'get-status' });
    return chrome.runtime.sendMessage({ kind: 'set-enabled', expected: current.status.version, enabled: false });
  });
  expect(pause).toMatchObject({ kind: 'ok', status: { phase: 'paused', savedEnabled: false } });
  await expect(page.getByRole('status')).toContainText('disabled');
  await expect(group(page).getByLabel(/group name$/i)).toHaveValue('Work');
  await save(page); expect(await stored(page)).toEqual({ ...empty,
    groupingRules: [{ enabled: true, pattern: 'https://editor.test/*', group: 'Work' }] });
});
