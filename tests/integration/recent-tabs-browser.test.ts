import { expect, test } from 'vitest';
import { createRecentTabsBrowser } from '../../src/browser/recent-tabs';

type BrowserApi = Parameters<typeof createRecentTabsBrowser>[0];

function browser() {
  function window(id: number, incognito = false, type: chrome.windows.Window['type'] = 'normal'): chrome.windows.Window {
    return { id, incognito, type, focused: id === 1, alwaysOnTop: false, state: 'normal' };
  }
  const windows = new Map([[1, window(1)], [2, window(2)], [3, window(3, true)], [4, window(4, false, 'popup')]]);
  const tabs = new Map<number, chrome.tabs.Tab>();
  const groups = new Map<number, chrome.tabGroups.TabGroup>();
  const changes: unknown[] = [];
  const reads: number[] = [];
  let source = 1;
  let state: unknown;
  let afterGroupRead = (_id: number) => {};
  let groupUpdated: ((group: chrome.tabGroups.TabGroup) => void) | undefined;
  const noEvent = { addListener() {}, removeListener() {} };
  let afterWindowRead = (_id: number) => {};
  let afterActivate = (_tab: chrome.tabs.Tab) => {};
  function liveTab(id: number) {
    const tab = tabs.get(id);
    if (!tab) throw Error('Tab closed');
    return { ...tab };
  }
  function liveWindow(id: number) {
    const value = windows.get(id);
    if (!value) throw Error('Window closed');
    return { ...value };
  }
  function liveGroup(id: number) {
    const group = groups.get(id);
    if (!group) throw Error('Group gone');
    return { ...group };
  }
  const api = {
    storage: { onChanged: noEvent, session: { get: async () => ({ chromeReHomeRecentTabs: state }) } },
    windows: {
      getCurrent: async () => liveWindow(source),
      get: async (id: number) => {
        const result = liveWindow(id);
        afterWindowRead(id);
        return result;
      },
      update: async (id: number, properties: chrome.windows.UpdateInfo) => {
        const value = liveWindow(id);
        if (properties.focused !== undefined) value.focused = properties.focused;
        if (properties.state !== undefined) value.state = properties.state;
        windows.set(id, value);
        changes.push(['window', id, properties]);
        return value;
      },
    },
    tabs: {
      onUpdated: noEvent, onAttached: noEvent, onMoved: noEvent, onRemoved: noEvent,
      get: async (id: number) => { reads.push(id); return liveTab(id); },
      update: async (id: number, properties: chrome.tabs.UpdateProperties) => {
        const value = liveTab(id);
        if (properties.active !== undefined) value.active = properties.active;
        tabs.set(id, value);
        changes.push(['tab', id, properties]);
        afterActivate(value);
        return value;
      },
    },
    tabGroups: {
      onUpdated: {
        addListener(listener: typeof groupUpdated) { groupUpdated = listener; },
        removeListener() { groupUpdated = undefined; },
      },
      onRemoved: noEvent,
      get: async (id: number) => {
        const result = liveGroup(id);
        afterGroupRead(id);
        return result;
      },
      update: async (id: number, properties: chrome.tabGroups.UpdateProperties) => {
        const value = { ...liveGroup(id), ...properties };
        groups.set(id, value);
        changes.push(['group', id, properties]);
        return value;
      },
    },
  };
  return {
    adapter: createRecentTabsBrowser(api as unknown as BrowserApi),
    tabs, windows, groups, changes, reads,
    source: (id: number) => { source = id; },
    afterGroupRead: (callback: typeof afterGroupRead) => { afterGroupRead = callback; },
    renameGroup(id: number, title: string) {
      const group = { ...liveGroup(id), title };
      groups.set(id, group);
      groupUpdated?.(group);
    },
    afterWindowRead: (callback: typeof afterWindowRead) => { afterWindowRead = callback; },
    afterActivate: (callback: typeof afterActivate) => { afterActivate = callback; },
    state: (normal: number[], incognito: number[] = []) => { state = { normal, incognito }; },
    tab(id: number, windowId: number, properties: Partial<chrome.tabs.Tab> = {}) {
      tabs.set(id, { id, windowId, incognito: liveWindow(windowId).incognito, active: false, groupId: -1,
        index: 0, lastAccessed: 0, frozen: false, pinned: false, highlighted: false, selected: false, discarded: false, autoDiscardable: true,
        title: 'Tab ' + id, url: 'https://example.test/private-path?param=value', ...properties });
    },
  };
}

test('hydrates the newest eight eligible tabs using live metadata and targeted reads', async () => {
  const b = browser();
  b.state([101, 102, 103, 104, 105, 18, 17, 16, 15, 14, 13, 12, 11, 10], [102]);
  b.tab(102, 3, { title: 'Private title' });
  b.tab(103, 4);
  b.tab(104, 1, { url: 'chrome-extension://id/options/index.html' });
  b.tab(105, 1, { url: 'chrome://extensions/' });
  for (let id = 10; id <= 18; ++id) b.tab(id, 1);
  b.tab(18, 2, { groupId: 7, title: '<img src=x>' });
  b.groups.set(7, { id: 7, windowId: 2, title: 'Reading', color: 'blue', collapsed: true, shared: false });
  const rows = await b.adapter.read();
  expect(rows.map(row => row.id)).toEqual([18, 17, 16, 15, 14, 13, 12, 11]);
  expect(rows[0]).toMatchObject({ title: '<img src=x>', site: 'example.test', context: 'Window 2 · Reading' });
  expect(rows[1]).toMatchObject({ title: 'Tab 17', site: 'example.test', context: 'This window' });
  expect(b.reads).not.toContain(10);
});

test('uses the popup window privacy context even when another window is focused', async () => {
  const b = browser();
  b.state([11], [11, 12]);
  b.tab(11, 1, { title: 'Regular' });
  b.tab(12, 3, { title: 'Private' });
  b.source(3);
  expect((await b.adapter.read()).map(row => row.title)).toEqual(['Private']);
  b.source(1);
  expect((await b.adapter.read()).map(row => row.title)).toEqual(['Regular']);
});

test('uses a generic label for new tabs and omits full file paths from the site label', async () => {
  const b = browser();
  b.state([12, 11]);
  b.tab(11, 1, { url: 'file:///private/path/file.html', title: 'Local article' });
  b.tab(12, 1, { url: 'chrome://newtab/', title: 'Untrusted new tab title' });
  const rows = await b.adapter.read();
  expect(rows).toMatchObject([{ title: 'New tab', site: '' }, { title: 'Local article', site: 'Local file' }]);
});

test('activates an existing tab in its current window and reveals its current group', async () => {
  const b = browser();
  b.state([11]);
  b.tab(11, 1);
  const row = (await b.adapter.read())[0]!;
  b.tab(11, 2, { groupId: 7 });
  b.groups.set(7, { id: 7, windowId: 2, title: 'Reading', color: 'blue', collapsed: true, shared: false });
  b.windows.get(2)!.state = 'minimized';
  expect(await b.adapter.focus(row)).toBe(true);
  expect(b.changes).toEqual([
    ['group', 7, { collapsed: false }],
    ['tab', 11, { active: true }],
    ['window', 2, { focused: true, state: 'normal' }],
  ]);
});

test('refuses a stale row if the popup changes context or the tab closes', async () => {
  const b = browser();
  b.state([11]);
  b.tab(11, 1);
  const row = (await b.adapter.read())[0]!;
  b.source(3);
  expect(await b.adapter.focus(row)).toBe(false);
  b.source(1);
  b.tabs.delete(11);
  expect(await b.adapter.focus(row)).toBe(false);
  expect(b.changes).toEqual([]);
});

test('refuses a target that moved to a popup or another browsing context', async () => {
  const b = browser();
  b.state([11]);
  b.tab(11, 1);
  const row = (await b.adapter.read())[0]!;
  b.tab(11, 4);
  expect(await b.adapter.focus(row)).toBe(false);
  b.tab(11, 3);
  expect(await b.adapter.focus(row)).toBe(false);
  b.tab(11, 1, { url: 'chrome://extensions/' });
  expect(await b.adapter.focus(row)).toBe(false);
  expect(b.changes).toEqual([]);
});

test('uses the latest active tab window after Chrome returns an outdated activation result', async () => {
  const b = browser();
  b.state([11]);
  b.tab(11, 1);
  const row = (await b.adapter.read())[0]!;
  b.afterActivate(tab => { b.tabs.set(11, { ...tab, windowId: 2 }); });
  expect(await b.adapter.focus(row)).toBe(true);
  expect(b.changes).toEqual([['tab', 11, { active: true }], ['window', 2, { focused: true }]]);
});


test('rechecks the live tab before accepting a destination that was already focused', async () => {
  const b = browser();
  b.state([11]);
  b.tab(11, 1);
  const row = (await b.adapter.read())[0]!;
  b.afterActivate(() => {
    b.afterWindowRead(() => {
      b.afterWindowRead(() => {});
      b.tabs.set(11, { ...b.tabs.get(11)!, windowId: 2 });
    });
  });
  expect(await b.adapter.focus(row)).toBe(true);
  expect(b.changes).toEqual([['tab', 11, { active: true }], ['window', 2, { focused: true }]]);
});

test('declines to focus a tab that navigates to an ineligible URL during the window read', async () => {
  const b = browser();
  b.state([11]);
  b.tab(11, 1);
  const row = (await b.adapter.read())[0]!;
  b.afterActivate(() => {
    b.afterWindowRead(() => { b.tabs.set(11, { ...b.tabs.get(11)!, url: 'chrome://extensions/' }); });
  });
  expect(await b.adapter.focus(row)).toBe(false);
  expect(b.changes).toEqual([['tab', 11, { active: true }]]);
});

test('disambiguates matching visible labels with the live tab positions', async () => {
  const b = browser();
  b.state([13, 12, 11]);
  b.tab(11, 1, { title: 'Article', url: 'https://example.test/first', index: 2 });
  b.tab(12, 1, { title: 'Article', url: 'https://example.test/second', index: 7 });
  b.tab(13, 1, { title: 'Home', url: 'https://example.test/', index: 0 });
  expect((await b.adapter.read()).map(row => [row.title, row.context])).toEqual([
    ['Home', 'This window'],
    ['Article', 'Tab 8 · This window'],
    ['Article', 'Tab 3 · This window'],
  ]);
});


test('invalidates the initial read when a known group changes during hydration', async () => {
  const b = browser();
  b.state([11, 12]);
  b.tab(11, 1, { groupId: 7 });
  b.tab(12, 1);
  b.groups.set(7, { id: 7, windowId: 1, title: 'Before', color: 'blue', collapsed: false, shared: false });
  let invalidations = 0;
  const detach = b.adapter.subscribe(() => { invalidations++; });
  b.afterGroupRead(() => { b.renameGroup(7, 'After'); });
  await b.adapter.read();
  expect(invalidations).toBe(1);
  detach();
});

test('uses compact window labels that stay stable when recent tabs are reordered', async () => {
  const b = browser();
  const remoteIds = [1234567890, 1234567891];
  for (const id of remoteIds) b.windows.set(id, { ...b.windows.get(2)!, id });
  b.tab(11, remoteIds[0]!);
  b.tab(12, remoteIds[1]!);
  b.tab(13, 1);
  b.state([11, 13, 12]);
  expect((await b.adapter.read()).map(row => row.context)).toEqual(['Window 2', 'This window', 'Window 3']);
  b.state([12, 11, 13]);
  expect((await b.adapter.read()).map(row => row.context)).toEqual(['Window 3', 'Window 2', 'This window']);
});

test('selects the tab again when a concurrent move leaves it inactive in its new window', async () => {
  const b = browser();
  b.state([11]);
  b.tab(11, 1);
  const row = (await b.adapter.read())[0]!;
  b.afterActivate(tab => {
    b.tabs.set(11, { ...tab, windowId: 2, active: false });
    b.afterActivate(() => {});
  });
  expect(await b.adapter.focus(row)).toBe(true);
  expect(b.changes).toEqual([
    ['tab', 11, { active: true }],
    ['tab', 11, { active: true }],
    ['window', 2, { focused: true }],
  ]);
});
