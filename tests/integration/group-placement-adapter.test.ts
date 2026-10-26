import { describe, expect, it, vi } from 'vitest';
import { createGroupPlacementAdapter } from '../../src/browser/group-placement';
function browser() {
  const source = { id: 1, windowId: 10, index: 2, groupId: 7, pinned: false, incognito: false, active: true, url: 'https://private.test/', pendingUrl: 'https://private.test/next' };
  const sourceGroup = { id: 7, windowId: 10, title: 'BarTab', color: 'red', collapsed: true };
  const tabsQuery = vi.fn(async (_: chrome.tabs.QueryInfo) => [source]);
  const groupsQuery = vi.fn(async (_: chrome.tabGroups.QueryInfo) => [sourceGroup]);
  const group = vi.fn(async (_: chrome.tabs.GroupOptions) => 7);
  const update = vi.fn(async (_: number, __: chrome.tabGroups.UpdateProperties) => sourceGroup);
  const api = { tabs: { query: tabsQuery, group }, tabGroups: { query: groupsQuery, update } } as unknown as Pick<typeof chrome, 'tabs' | 'tabGroups'>;
  return { source, sourceGroup, tabsQuery, groupsQuery, group, update, adapter: createGroupPlacementAdapter(api) };
}
describe('group placement Chrome adapter', () => {
  it('queries all titles in the explicit window and returns detached structural fields only', async () => {
    const b = browser(); const first = await b.adapter.read(10);
    expect(b.tabsQuery).toHaveBeenCalledExactlyOnceWith({ windowId: 10 });
    expect(b.groupsQuery).toHaveBeenCalledExactlyOnceWith({ windowId: 10 });
    expect(first).toEqual({ tabs: [{ id: 1, windowId: 10, index: 2, groupId: 7, pinned: false, incognito: false }], groups: [{ id: 7, windowId: 10, title: 'BarTab' }] });
    b.source.index = 9; b.sourceGroup.title = 'Other';
    expect(first.tabs[0]?.index).toBe(2); expect(first.groups[0]?.title).toBe('BarTab');
    expect((await b.adapter.read(10)).groups[0]?.title).toBe('Other');
  });
  it('groups into an explicit existing id without create properties', async () => {
    const b = browser();
    expect(await b.adapter.groupTab(1, { kind: 'existing', windowId: 10, groupId: 7 })).toBe(7);
    expect(b.group).toHaveBeenCalledExactlyOnceWith({ tabIds: [1], groupId: 7 });
  });
  it('creates in the explicit window with the actual tab', async () => {
    const b = browser();
    expect(await b.adapter.groupTab(1, { kind: 'new', windowId: 10, title: 'BarTab' })).toBe(7);
    expect(b.group).toHaveBeenCalledExactlyOnceWith({ tabIds: [1], createProperties: { windowId: 10 } });
  });
  it('updates only the title', async () => {
    const b = browser(); await b.adapter.setTitle(7, 'BarTab');
    expect(b.update).toHaveBeenCalledExactlyOnceWith(7, { title: 'BarTab' });
  });
  it.each(['tabsQuery', 'groupsQuery', 'group', 'update'] as const)('propagates the original %s failure', async method => {
    const b = browser(), cause = new Error(method); b[method].mockRejectedValueOnce(cause);
    const result = method === 'group' ? b.adapter.groupTab(1, { kind: 'existing', windowId: 10, groupId: 7 }) : method === 'update' ? b.adapter.setTitle(7, 'BarTab') : b.adapter.read(10);
    await expect(result).rejects.toBe(cause);
  });
});
