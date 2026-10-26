import { describe, expect, it, vi } from 'vitest';
import { createSnapshotReader } from '../../src/browser/snapshots';

function tab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
  return {
    id: 1,
    windowId: 10,
    index: 0,
    groupId: 5,
    pinned: false,
    active: true,
    highlighted: true,
    selected: true,
    incognito: false,
    audible: true,
    discarded: false,
    autoDiscardable: true,
    frozen: false,
    lastAccessed: 100,
    url: 'https://example.com/path?query=one#section',
    pendingUrl: 'https://example.com/next',
    ...overrides,
  };
}

function group(overrides: Partial<chrome.tabGroups.TabGroup> = {}): chrome.tabGroups.TabGroup {
  return { id: 5, windowId: 10, title: 'Work', color: 'blue', collapsed: false, shared: false, ...overrides };
}

function browser(tabs = [tab()], groups: (Omit<chrome.tabGroups.TabGroup, 'shared'> & {shared?:boolean})[] = [group()]) {
  const tabsQuery = vi.fn(async (_query: chrome.tabs.QueryInfo) => tabs);
  const groupsQuery = vi.fn(async (_query: chrome.tabGroups.QueryInfo) => groups);
  // Any extra API access fails, including mutation methods and per-item reads.
  const readOnly = (query: unknown) => new Proxy({ query }, {
    get(target, property) {
      if (property === 'query') return target.query;
      throw new Error(`Unexpected browser API access: ${String(property)}`);
    },
  });
  const api = {
    tabs: readOnly(tabsQuery),
    tabGroups: readOnly(groupsQuery),
  } as unknown as Pick<typeof chrome, 'tabs' | 'tabGroups'>;
  return { api, tabsQuery, groupsQuery };
}

describe('live snapshot reader', () => {
  it('queries an explicit window and maps only snapshot fields without extra API access', async () => {
    const fake = browser();
    const result = await createSnapshotReader(fake.api).read({ kind: 'window', windowId: 10 });
    expect(fake.tabsQuery).toHaveBeenCalledExactlyOnceWith({ windowId: 10 });
    expect(fake.groupsQuery).toHaveBeenCalledExactlyOnceWith({ windowId: 10 });
    expect(result).toEqual({
      tabs: [{
        id: 1, windowId: 10, index: 0, groupId: 5, pinned: false, active: true,
        audible: true, incognito: false,
        url: 'https://example.com/path?query=one#section', pendingUrl: 'https://example.com/next',
      }],
      groups: [{ id: 5, windowId: 10, title: 'Work', color: 'blue', collapsed: false, shared: false }],
    });
  });

  it('selects all normal windows, retains incognito and filters groups to observed normal windows', async () => {
    const fake = browser(
      [tab(), tab({ id: 2, windowId: 20, incognito: true, groupId: 6 })],
      [group(), group({ id: 6, windowId: 20 }), group({ id: 9, windowId: 30 })],
    );
    const result = await createSnapshotReader(fake.api).read({ kind: 'all-normal-windows' });
    expect(fake.tabsQuery).toHaveBeenCalledExactlyOnceWith({ windowType: 'normal' });
    expect(fake.groupsQuery).toHaveBeenCalledExactlyOnceWith({});
    expect(result.tabs.map(({ id, incognito }) => ({ id, incognito })))
      .toEqual([{ id: 1, incognito: false }, { id: 2, incognito: true }]);
    expect(result.groups.map(({ id }) => id)).toEqual([5, 6]);
  });

  it('omits unavailable URLs and optional titles while defaulting unavailable audible state', async () => {
    const { url: _, pendingUrl: __, audible: ___, ...withoutUrls } = tab();
    const { title: ____, shared: _____, ...withoutTitle } = group();
    const fake = browser([withoutUrls], [withoutTitle]);
    const result = await createSnapshotReader(fake.api).read({ kind: 'window', windowId: 10 });
    expect(result.tabs[0]).toEqual({
      id: 1, windowId: 10, index: 0, groupId: 5, pinned: false, active: true, audible: false, incognito: false,
    });
    expect(result.groups[0]).toEqual({ id: 5, windowId: 10, color: 'blue', collapsed: false });
  });

  it.each(['tabs', 'groups'] as const)('rejects the read if the %s query fails', async (failedQuery) => {
    const fake = browser();
    const failure = new Error('browser query unavailable');
    if (failedQuery === 'tabs') fake.tabsQuery.mockRejectedValueOnce(failure);
    else fake.groupsQuery.mockRejectedValueOnce(failure);
    await expect(createSnapshotReader(fake.api).read({ kind: 'all-normal-windows' })).rejects.toBe(failure);
  });

  it('starts both independent queries before either settles', async () => {
    const fake = browser();
    let resolveTabs!: (tabs: chrome.tabs.Tab[]) => void;
    let resolveGroups!: (groups: chrome.tabGroups.TabGroup[]) => void;
    fake.tabsQuery.mockReturnValueOnce(new Promise((resolve) => { resolveTabs = resolve; }));
    fake.groupsQuery.mockReturnValueOnce(new Promise((resolve) => { resolveGroups = resolve; }));
    const reading = createSnapshotReader(fake.api).read({ kind: 'all-normal-windows' });
    const bothStarted = fake.tabsQuery.mock.calls.length === 1 && fake.groupsQuery.mock.calls.length === 1;
    resolveTabs([tab()]);
    resolveGroups([group()]);
    await reading;
    expect(bothStarted).toBe(true);
  });

  it('retains a tab observation when its group disappears before the group observation', async () => {
    const fake = browser([tab()], []);
    const result = await createSnapshotReader(fake.api).read({ kind: 'window', windowId: 10 });
    expect(result.tabs.map(({ id, groupId }) => ({ id, groupId }))).toEqual([{ id: 1, groupId: 5 }]);
    expect(result.groups).toEqual([]);
  });

  it('retains a group observation when its tab disappeared from the tab observation', async () => {
    const fake = browser([tab({ id: 2, groupId: -1 })], [group()]);
    const result = await createSnapshotReader(fake.api).read({ kind: 'all-normal-windows' });
    expect(result.tabs.map(({ id }) => id)).toEqual([2]);
    expect(result.groups.map(({ id }) => id)).toEqual([5]);
  });

  it('filters unrelated groups even for an explicit window with no remaining tabs', async () => {
    const fake = browser([], [group(), group({ id: 9, windowId: 30 })]);
    const result = await createSnapshotReader(fake.api).read({ kind: 'window', windowId: 10 });
    expect(result.tabs).toEqual([]);
    expect(result.groups.map(({ id }) => id)).toEqual([5]);
  });

  it('returns no groups for an all-normal observation with no tabs', async () => {
    const fake = browser([], [group({ windowId: 30 })]);
    expect(await createSnapshotReader(fake.api).read({ kind: 'all-normal-windows' }))
      .toEqual({ tabs: [], groups: [] });
  });

  it('omits tab observations without a live tab ID', async () => {
    const { id: _, ...withoutId } = tab();
    const fake = browser([withoutId], []);
    const result = await createSnapshotReader(fake.api).read({ kind: 'all-normal-windows' });
    expect(result.tabs).toEqual([]);
  });

  it('returns detached narrow observations and reads current data again on every call', async () => {
    const sourceTab = tab();
    const sourceGroup = group();
    const fake = browser([sourceTab], [sourceGroup]);
    const reader = createSnapshotReader(fake.api);
    const first = await reader.read({ kind: 'window', windowId: 10 });
    sourceTab.index = 3;
    sourceGroup.collapsed = true;
    const second = await reader.read({ kind: 'window', windowId: 10 });
    expect(first.tabs[0]?.index).toBe(0);
    expect(first.groups[0]?.collapsed).toBe(false);
    expect(second.tabs[0]?.index).toBe(3);
    expect(second.groups[0]?.collapsed).toBe(true);
  });
});

it.each([true,false,undefined])('preserves optional native shared evidence %s',async(shared)=>{
  const {shared:_,...plain}=group();const fake=browser([tab()],[shared===undefined?plain:{...plain,shared}]);
  const snapshot=await createSnapshotReader(fake.api).read({kind:'all-normal-windows'});
  expect(snapshot.groups[0]?.shared).toBe(shared);expect(Object.hasOwn(snapshot.groups[0]!,'shared')).toBe(shared!==undefined);
});
