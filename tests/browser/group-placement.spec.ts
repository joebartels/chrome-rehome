import { test as base, chromium, expect, type BrowserContext, type Worker } from '@playwright/test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import type { GroupPlacementPort, GroupPlacementResult } from '../../src/execution/group-placement';
import type { GroupRequest } from '../../src/planning/group-destination';

declare global {
  var groupPlacementFixture: {
    place(request: GroupRequest): Promise<GroupPlacementResult>;
    adapter: GroupPlacementPort;
    failTitle(request: GroupRequest): Promise<GroupPlacementResult>;
  };
}
const test = base.extend<{ worker: Worker }>({
  worker: async ({}, use, testInfo) => {
    const root = await mkdtemp(join(tmpdir(), 'chromerehome-placement-'));
    const extension = join(root, 'extension');
    let context: BrowserContext | undefined;
    try {
      await cp(resolve('dist'), extension, { recursive: true });
      await build({
        stdin: { contents: `
          import { createGroupPlacementService } from './src/execution/group-placement';
          import { createGroupPlacementAdapter } from './src/browser/group-placement';
          import { createOperationQueue } from './src/background/operation-queue';
          const adapter = createGroupPlacementAdapter(chrome);
          const service = createGroupPlacementService({ port: adapter, queue: createOperationQueue() });
          globalThis.groupPlacementFixture = {
            adapter, place: request => service.place(request),
            failTitle: request => createGroupPlacementService({ queue: createOperationQueue(),
              port: { ...adapter, setTitle: async () => { throw new Error('Injected title failure'); } }
            }).place(request)
          };`, resolveDir: resolve('.'), loader: 'ts' },
        outfile: join(extension, 'background/index.js'), bundle: true, format: 'esm', target: 'chrome120',
      });
      context = await chromium.launchPersistentContext(join(root, 'profile'), {
        channel: 'chromium', headless: true,
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      });
      testInfo.annotations.push({ type: 'Chromium', description: context.browser()!.version() });
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      await use(worker);
    } finally {
      await context?.close(); await rm(root, { recursive: true, force: true });
    }
  },
});

test('creates, titles, reuses and prefers the current exact group while preserving color', async ({ worker }, testInfo) => {
  const result = await worker.evaluate(async () => {
    const source = await chrome.tabs.create({ url: 'about:blank', active: false });
    const request = { tabId: source.id!, windowId: source.windowId, incognito: source.incognito, title: 'BarTab' };
    const first = await groupPlacementFixture.place(request);
    if (first.kind !== 'placed') throw new Error(JSON.stringify(first));
    await chrome.tabGroups.update(first.groupId, { color: 'purple', collapsed: true });
    const second = await chrome.tabs.create({ windowId: source.windowId, url: 'about:blank', active: true });
    const reused = await groupPlacementFixture.place({ ...request, tabId: second.id! });
    const afterReuse = await chrome.tabGroups.get(first.groupId);
    const duplicate = await chrome.tabs.create({ windowId: source.windowId, url: 'about:blank', index: 0, active: false });
    const duplicateId = await chrome.tabs.group({ tabIds: [duplicate.id!] });
    await chrome.tabGroups.update(duplicateId, { title: 'BarTab' });
    const current = await groupPlacementFixture.place(request);
    return { first, reused, current, afterReuse, members: (await chrome.tabs.query({ groupId: first.groupId })).map(t => t.id) };
  });
  expect(result.first).toMatchObject({ kind: 'placed', action: 'created' });
  expect(result.reused).toMatchObject({ ...result.first, action: 'reused' });
  expect(result.current).toMatchObject({ ...result.first, action: 'already-grouped' });
  expect(result.members).toHaveLength(2);
  expect(result.afterReuse).toMatchObject({ title: 'BarTab', color: 'purple' });
  testInfo.annotations.push({ type: 'Browser-owned collapse state after reuse', description: String(result.afterReuse.collapsed) });
});

test('chooses the leftmost duplicate title from real observed member indices', async ({ worker }) => {
  const result = await worker.evaluate(async () => {
    const left = await chrome.tabs.create({ url: 'about:blank', index: 0, active: false });
    const leftId = await chrome.tabs.group({ tabIds: [left.id!] });
    await chrome.tabGroups.update(leftId, { title: 'Same' });
    const right = await chrome.tabs.create({ windowId: left.windowId, url: 'about:blank', active: false });
    const rightId = await chrome.tabs.group({ tabIds: [right.id!] });
    await chrome.tabGroups.update(rightId, { title: 'Same' });
    const source = await chrome.tabs.create({ windowId: left.windowId, url: 'about:blank', active: false });
    const before = await chrome.tabs.query({ windowId: left.windowId });
    return { leftId, rightId, leftIndex: before.find(t => t.id === left.id)!.index, rightIndex: before.find(t => t.id === right.id)!.index,
      placed: await groupPlacementFixture.place({ tabId: source.id!, windowId: source.windowId, incognito: source.incognito, title: 'Same' }) };
  });
  expect(result.leftIndex).toBeLessThan(result.rightIndex);
  expect(result.placed).toMatchObject({ kind: 'placed', groupId: result.leftId, action: 'reused' });
});

test('matches literal wildcard titles and exact case instead of Chrome query patterns', async ({ worker }) => {
  const result = await worker.evaluate(async () => {
    const member = await chrome.tabs.create({ url: 'about:blank', active: false });
    const other = await chrome.tabs.group({ tabIds: [member.id!] });
    await chrome.tabGroups.update(other, { title: 'WorkX' });
    const source = await chrome.tabs.create({ windowId: member.windowId, url: 'about:blank', active: false });
    const request = { tabId: source.id!, windowId: source.windowId, incognito: source.incognito, title: 'Work*' };
    const literal = await groupPlacementFixture.place(request);
    const caseSource = await chrome.tabs.create({ windowId: member.windowId, url: 'about:blank', active: false });
    const differentCase = await groupPlacementFixture.place({ ...request, tabId: caseSource.id!, title: 'work*' });
    return { other, literal, differentCase, groups: await chrome.tabGroups.query({ windowId: member.windowId }) };
  });
  expect(result.literal).toMatchObject({ kind: 'placed', action: 'created' });
  expect(result.differentCase).toMatchObject({ kind: 'placed', action: 'created' });
  expect(result.groups.map(g => g.title).sort()).toEqual(['Work*', 'WorkX', 'work*']);
});

test('places in the nonfocused source window and leaves the focused matching group untouched', async ({ worker }) => {
  const result = await worker.evaluate(async () => {
    const own = await chrome.windows.create({ url: 'about:blank', focused: false });
    const foreign = await chrome.windows.create({ url: 'about:blank', focused: true });
    if (!own || !foreign) throw new Error('Browser did not return created windows');
    const foreignTab = foreign.tabs![0]!;
    const foreignId = await chrome.tabs.group({ tabIds: [foreignTab.id!] });
    await chrome.tabGroups.update(foreignId, { title: 'BarTab', color: 'orange' });
    await chrome.windows.update(foreign.id!, { focused: true });
    const source = own.tabs![0]!;
    const focused = (await chrome.windows.getLastFocused()).id;
    const placed = await groupPlacementFixture.place({ tabId: source.id!, windowId: own.id!, incognito: source.incognito, title: 'BarTab' });
    return { focused, foreignWindow: foreign.id, ownWindow: own.id, placed,
      source: await chrome.tabs.get(source.id!), foreign: await chrome.tabGroups.get(foreignId), foreignMembers: await chrome.tabs.query({ groupId: foreignId }) };
  });
  expect(result.focused).toBe(result.foreignWindow);
  expect(result.placed).toMatchObject({ kind: 'placed', action: 'created', windowId: result.ownWindow });
  expect(result.source.windowId).toBe(result.ownWindow);
  expect(result.foreign).toMatchObject({ windowId: result.foreignWindow, title: 'BarTab', color: 'orange' });
  expect(result.foreignMembers).toHaveLength(1);
});

test('observes last-member removal, rejects the stale id and creates a fresh destination', async ({ worker }) => {
  const result = await worker.evaluate(async () => {
    const old = await chrome.tabs.create({ url: 'about:blank', active: false });
    const id = await chrome.tabs.group({ tabIds: [old.id!] });
    await chrome.tabGroups.update(id, { title: 'BarTab' });
    const source = await chrome.tabs.create({ windowId: old.windowId, url: 'about:blank', active: false });
    await chrome.tabs.remove(old.id!);
    const absent = !(await chrome.tabGroups.query({ windowId: old.windowId })).some(g => g.id === id);
    let rejected = false;
    try { await groupPlacementFixture.adapter.groupTab(source.id!, { kind: 'existing', windowId: old.windowId, groupId: id }); } catch { rejected = true; }
    const placed = await groupPlacementFixture.place({ tabId: source.id!, windowId: source.windowId, incognito: source.incognito, title: 'BarTab' });
    return { absent, rejected, id, placed, source: await chrome.tabs.get(source.id!) };
  });
  expect(result.absent).toBe(true); expect(result.rejected).toBe(true);
  expect(result.placed).toMatchObject({ kind: 'placed', action: 'created' });
  expect(result.source.groupId).not.toBe(result.id);
});

test('preserves pinned tabs without creating any group', async ({ worker }) => {
  const result = await worker.evaluate(async () => {
    const source = await chrome.tabs.create({ url: 'about:blank', pinned: true, active: false });
    const before = await chrome.tabs.get(source.id!);
    const placed = await groupPlacementFixture.place({ tabId: source.id!, windowId: source.windowId, incognito: source.incognito, title: 'BarTab' });
    const after = await chrome.tabs.get(source.id!);
    return { placed, before: { pinned: before.pinned, groupId: before.groupId, index: before.index, windowId: before.windowId },
      after: { pinned: after.pinned, groupId: after.groupId, index: after.index, windowId: after.windowId }, groups: await chrome.tabGroups.query({ windowId: source.windowId }) };
  });
  expect(result.placed).toEqual({ kind: 'skipped', reason: 'pinned' });
  expect(result.after).toEqual(result.before); expect(result.groups).toEqual([]);
});

test('exposes real created membership after an injected title failure', async ({ worker }) => {
  const result = await worker.evaluate(async () => {
    const source = await chrome.tabs.create({ url: 'about:blank', active: false });
    const placed = await groupPlacementFixture.failTitle({ tabId: source.id!, windowId: source.windowId, incognito: source.incognito, title: 'BarTab' });
    if (placed.kind !== 'failed' || placed.groupId === undefined) throw new Error('Expected partial failure');
    return { ...placed, cause: placed.cause instanceof Error ? placed.cause.message : 'unexpected',
      tab: await chrome.tabs.get(source.id!), group: await chrome.tabGroups.get(placed.groupId) };
  });
  expect(result).toMatchObject({ kind: 'failed', stage: 'title', effect: 'grouped', cause: 'Injected title failure' });
  expect(result.tab.groupId).toBe(result.groupId);
  expect(result.group.title ?? '').toBe('');
});

test('records extension incognito capability without changing browser settings', async ({ worker }, testInfo) => {
  const allowed = await worker.evaluate(() => chrome.extension.isAllowedIncognitoAccess());
  testInfo.annotations.push({ type: 'Incognito capability', description: allowed ? 'allowed' : 'unavailable: isolated extension has no incognito access; manual validation remains' });
  expect(typeof allowed).toBe('boolean');
  if (allowed) {
    const result = await worker.evaluate(async () => {
      const window = await chrome.windows.create({ incognito: true, url: 'about:blank' });
      if (!window) throw new Error('Browser did not return the incognito window');
      const tab = window.tabs![0]!;
      return groupPlacementFixture.place({ tabId: tab.id!, windowId: window.id!, incognito: true, title: 'Private' });
    });
    expect(result).toMatchObject({ kind: 'placed', action: 'created' });
  }
});
