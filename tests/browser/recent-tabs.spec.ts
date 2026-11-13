import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { attachActionPopup } from './action-popup';
import { activateOwnedBrowser } from './owned-browser-focus';

const base = 'https://recent-tabs.test/';
const url = (title: string) => base + encodeURIComponent(title);
const key = 'chromeReHomeRecentTabs';

async function withBrowser(headed: boolean, run: (context: BrowserContext, options: Page, extension: string) => Promise<void>) {
  const profile = await mkdtemp(join(tmpdir(), 'chromerehome-recent-'));
  const dist = resolve('dist');
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: !headed,
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    });
    if (headed) await activateOwnedBrowser(context);
    const worker = context.serviceWorkers().find(worker => worker.url().endsWith('/background/index.js')) ??
      await context.waitForEvent('serviceworker', worker => worker.url().endsWith('/background/index.js'));
    const extension = `chrome-extension://${new URL(worker.url()).host}`;
    await context.route(base + '**', route => {
      const title = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>${title}</title>` });
    });
    const options = await context.newPage();
    await options.goto(extension + '/options/index.html');
    await run(context, options, extension);
  } finally {
    try { await context?.close(); } finally { await rm(profile, { recursive: true, force: true }); }
  }
}

async function openTab(context: BrowserContext, options: Page, title: string, properties: chrome.tabs.CreateProperties = {}) {
  const created = context.waitForEvent('page');
  const id = await options.evaluate(async properties => (await chrome.tabs.create(properties)).id!, { ...properties, url: 'about:blank' });
  const page = await created;
  await page.goto(url(title));
  await expect.poll(() => options.evaluate(id => chrome.tabs.get(id).then(tab => tab.title), id)).toBe(title);
  return id;
}

function readRecency(options: Page) {
  return options.evaluate(async key => (await chrome.storage.session.get(key))[key] as
    { normal: number[]; incognito: number[] } | undefined, key);
}

test('recent tabs include background opens, re-rank selection, and outlive an idle worker', async () => withBrowser(false, async (context, options, extension) => {
  const first = await openTab(context, options, 'Recent first', { active: true });
  const second = await openTab(context, options, 'Recent background', { active: false });
  await expect.poll(async () => (await readRecency(options))?.normal.slice(0, 2)).toEqual([second, first]);

  const popup = await context.newPage();
  await popup.goto(extension + '/popup/index.html');
  const recent = popup.getByRole('region', { name: 'Recent tabs' });
  const rows = recent.getByRole('button', { name: /Recent (first|background)/ });
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAccessibleName(/Recent background/);

  const session = await context.newCDPSession(options);
  const versions = new Map<string, { versionId: string; scriptURL: string; runningStatus: string }>();
  session.on('ServiceWorker.workerVersionUpdated', ({ versions: updates }) => {
    for (const update of updates) versions.set(update.versionId, update);
  });
  await session.send('ServiceWorker.enable');
  const activeVersion = () => [...versions.values()].find(version =>
    version.scriptURL === extension + '/background/index.js' && version.runningStatus === 'running');
  await expect.poll(() => activeVersion()?.versionId).toBeDefined();
  const versionId = activeVersion()!.versionId;
  await popup.close();
  await options.evaluate(second => chrome.tabs.update(second, { active: true }), second);
  await expect.poll(() => options.evaluate(second => chrome.tabs.get(second).then(tab => tab.active), second)).toBe(true);
  await session.send('ServiceWorker.stopWorker', { versionId });
  await expect.poll(() => versions.get(versionId)?.runningStatus).toBe('stopped');

  // Reactivating an existing tab wakes the worker and reorders the persisted IDs.
  await options.evaluate(first => chrome.tabs.update(first, { active: true }), first);
  await expect.poll(async () => (await readRecency(options))?.normal.slice(0, 2)).toEqual([first, second]);
  await options.evaluate(second => chrome.tabs.remove(second), second);
  await expect.poll(async () => (await readRecency(options))?.normal.includes(second)).toBe(false);
  const after = await context.newPage();
  await after.goto(extension + '/popup/index.html');
  await expect(after.getByRole('region', { name: 'Recent tabs' }).getByRole('button', { name: /Recent first/ })).toBeVisible();
  await expect(after.getByRole('button', { name: /Recent background/ })).toHaveCount(0);
  await session.detach();
}));

test('recent popup switches to a moved tab in a collapsed group without navigating @native-macos', async ({}, info) => withBrowser(true, async (context, options, extension) => {
  const target = await openTab(context, options, 'Remote recent tab', { active: false });
  const remoteWindow = await options.evaluate(async () => (await chrome.windows.create({ focused: false, url: 'about:blank' }))!.id!);
  const group = await options.evaluate(async ({ target, remoteWindow }) => {
    await chrome.tabs.move(target, { windowId: remoteWindow, index: -1 });
    const groupId = await chrome.tabs.group({ tabIds: target, createProperties: { windowId: remoteWindow } });
    await chrome.tabGroups.update(groupId, { title: 'Remote group', collapsed: true });
    return groupId;
  }, { target, remoteWindow });
  const source = await openTab(context, options, 'Current source tab', { active: true });
  const sourceWindow = await options.evaluate(async id => {
    const { windowId } = await chrome.tabs.get(id);
    await chrome.windows.update(windowId, { focused: true });
    await chrome.action.openPopup({ windowId });
    return windowId;
  }, source);
  expect(sourceWindow).not.toBe(remoteWindow);

  const action = await attachActionPopup(context, extension + '/popup/index.html');
  try {
    const row = `button[data-recent-tab-id="${target}"]`;
    await expect.poll(() => action.evaluate<string | undefined>(
      `document.querySelector(${JSON.stringify(row)})?.textContent`,
    )).toMatch(/Remote recent tab.*Remote group/s);
    await action.screenshot(info, 'recent-tabs-action-popup');
    await action.click(row);
    await expect.poll(() => options.evaluate(async ({ target, group }) => {
      const tab = await chrome.tabs.get(target);
      const window = await chrome.windows.get(tab.windowId);
      return { active: tab.active, focused: window.focused, groupId: tab.groupId, collapsed: (await chrome.tabGroups.get(group)).collapsed, url: tab.url };
    }, { target, group })).toEqual({ active: true, focused: true, groupId: group, collapsed: false, url: url('Remote recent tab') });
  } finally {
    await action.close().catch(() => {});
  }
}));

test('recent popup selects a background tab in the current window @native-macos', async () => withBrowser(true, async (context, options, extension) => {
  const source = await openTab(context, options, 'Same-window source', { active: true });
  const target = await openTab(context, options, 'Same-window background', { active: false });
  await options.evaluate(async ({ source, target }) => {
    const [current, recent] = await Promise.all([chrome.tabs.get(source), chrome.tabs.get(target)]);
    if (current.windowId !== recent.windowId || !current.active || recent.active) throw Error('Unexpected source selection');
    await chrome.action.openPopup({ windowId: current.windowId });
  }, { source, target });

  const action = await attachActionPopup(context, extension + '/popup/index.html');
  try {
    const row = `button[data-recent-tab-id="${target}"]`;
    await expect.poll(() => action.evaluate<string | undefined>(
      `document.querySelector(${JSON.stringify(row)})?.textContent`,
    )).toContain('This window');
    await action.click(row);
    await expect.poll(() => options.evaluate(async ({ source, target }) => {
      const [previous, selected] = await Promise.all([chrome.tabs.get(source), chrome.tabs.get(target)]);
      return { oldActive: previous.active, active: selected.active, sameWindow: previous.windowId === selected.windowId, url: selected.url };
    }, { source, target })).toEqual({ oldActive: false, active: true, sameWindow: true, url: url('Same-window background') });
  } finally {
    await action.close().catch(() => {});
  }
}));
