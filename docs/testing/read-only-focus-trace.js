// Paste into the ChromeReHome service worker console. Read-only, bounded, temporary.
// After reproducing once: copy(rehomeTraceRead()); rehomeTraceStop();
{
  globalThis.rehomeTraceStop?.();
  const events = [];
  let stopped = false;
  let baseline;
  let winnerId;
  const committed = new Map();
  const href = value => { try { return new URL(value).href; } catch { return null; } };
  const add = entry => {
    if (stopped) return;
    events.push({ms: Math.round(performance.now()), ...entry});
    if (events.length > 120) events.shift();
  };
  const readState = async () => {
    const [tabs, groups, windows] = await Promise.all([
      chrome.tabs.query({windowType: 'normal'}),
      chrome.tabGroups.query({}),
      chrome.windows.getAll({windowTypes: ['normal']})
    ]);
    return {tabs, groups, windows};
  };
  const state = async label => {
    const requestedMs = Math.round(performance.now());
    try {
      const current = await readState();
      if (!baseline) baseline = current;
      const winner = current.tabs.find(tab => tab.id === winnerId);
      const compact = tab => ({id: tab.id, windowId: tab.windowId, index: tab.index,
        groupId: tab.groupId, active: tab.active, pinned: tab.pinned,
        pending: 'pendingUrl' in tab});
      const properties = ['windowId', 'groupId', 'pinned', 'incognito', 'url', 'pendingUrl'];
      const otherChanges = [];
      for (const original of baseline.tabs.filter(tab => tab.id !== winnerId)) {
        const next = current.tabs.find(tab => tab.id === original.id);
        const changed = next ? properties.filter(key => !Object.is(next[key], original[key])) : ['absent'];
        if (next && ('pendingUrl' in next) !== ('pendingUrl' in original)) changed.push('pending-property');
        if (changed.length) otherChanges.push({id: original.id, changed});
      }
      for (const tab of current.tabs) {
        if (tab.id !== winnerId && !baseline.tabs.some(old => old.id === tab.id)) otherChanges.push({id: tab.id, changed: ['added']});
      }
      const orders = tabs => [...new Set(tabs.map(tab => tab.windowId))].sort((a, b) => a - b)
        .map(windowId => ({windowId, ids: tabs.filter(tab => tab.windowId === windowId && tab.id !== winnerId)
          .sort((a, b) => a.index - b.index).map(tab => tab.id)})).filter(window => window.ids.length);
      const groupShape = groups => groups.map(group => ({id: group.id, windowId: group.windowId,
        title: group.title, color: group.color, shared: group.shared})).sort((a, b) => a.id - b.id);
      add({event: 'state', label, requestedMs, winner: winner ? compact(winner) : null,
        focused: current.windows.filter(window => window.focused).map(window => window.id),
        active: current.tabs.filter(tab => tab.active).map(tab => ({id: tab.id, windowId: tab.windowId})),
        otherChanges, otherOrderChanged: JSON.stringify(orders(current.tabs)) !== JSON.stringify(orders(baseline.tabs)),
        groupsChanged: JSON.stringify(groupShape(current.groups)) !== JSON.stringify(groupShape(baseline.groups))});
    } catch { add({event: 'state-unavailable', label, requestedMs}); }
  };
  const navigation = details => {
    if (details.frameId !== 0 || !/^https?:/.test(details.url)) return;
    committed.set(details.tabId, {url: details.url, documentId: details.documentId});
    winnerId = details.tabId;
    baseline = undefined;
    void state('navigation');
    void Promise.all([
      chrome.tabs.get(details.tabId),
      chrome.windows.getAll({populate: true, windowTypes: ['normal']})
    ]).then(([tab, windows]) => add({
      event: 'navigation', transition: details.transitionType,
      tab: {id: tab.id, windowId: tab.windowId, active: tab.active},
      windows: windows.map(window => ({
        id: window.id, focused: window.focused,
        activeTabs: (window.tabs ?? []).filter(tab => tab.active).map(tab => tab.id),
        tabCount: window.tabs?.length
      }))
    })).catch(() => add({event: 'navigation-read-unavailable'}));
  };
  const storage = (changes, area) => {
    if (area !== 'session' || !changes.chromeReHomeReplacementJournal) return;
    const record = changes.chromeReHomeReplacementJournal.newValue;
    add(record ? {event: 'journal', version: record.version, phase: record.completedPhase,
      pending: record.pending?.kind ?? null, sequence: record.sequence, terminal: record.terminal}
      : {event: 'journal-cleared'});
    if (record?.participants?.[0]) winnerId = record.participants[0].tabId;
    void state(record ? `journal:${record.completedPhase}:${record.pending?.kind ?? 'settled'}:${record.sequence}:${record.terminal ?? ''}` : 'journal-cleared');
  };
  const invalidation = kind => details => {
    if (details.frameId !== 0) return;
    const previous = committed.get(details.tabId);
    add({event: 'navigation-signal', kind, tabId: details.tabId,
      ...(kind === 'before' ? {} : {
        sameRawURL: previous ? details.url === previous.url : null,
        sameNormalizedHref: previous ? href(details.url) === href(previous.url) : null,
        sameDocument: previous ? typeof details.documentId === 'string' && details.documentId === previous.documentId : null,
        lifecycle: details.documentLifecycle, frameType: details.frameType,
        transition: details.transitionType, qualifiers: details.transitionQualifiers
      })});
  };
  const before = invalidation('before');
  const history = invalidation('history');
  const fragment = invalidation('fragment');
  const moved = (tabId, info) => { add({event: 'tab-moved', tabId, ...info}); };
  const focus = windowId => add({event: 'window-focus', windowId});
  chrome.webNavigation.onCommitted.addListener(navigation);
  chrome.webNavigation.onBeforeNavigate.addListener(before);
  chrome.webNavigation.onHistoryStateUpdated.addListener(history);
  chrome.webNavigation.onReferenceFragmentUpdated.addListener(fragment);
  chrome.tabs.onMoved.addListener(moved);
  chrome.storage.onChanged.addListener(storage);
  chrome.windows.onFocusChanged.addListener(focus);
  globalThis.rehomeTraceRead = () => JSON.stringify(events, null, 2);
  globalThis.rehomeTraceStop = () => {
    stopped = true;
    baseline = undefined;
    committed.clear();
    chrome.webNavigation.onCommitted.removeListener(navigation);
    chrome.storage.onChanged.removeListener(storage);
    chrome.windows.onFocusChanged.removeListener(focus);
    chrome.webNavigation.onBeforeNavigate.removeListener(before);
    chrome.webNavigation.onHistoryStateUpdated.removeListener(history);
    chrome.webNavigation.onReferenceFragmentUpdated.removeListener(fragment);
    chrome.tabs.onMoved.removeListener(moved);
  };
  console.log('Read-only trace ready. Reproduce once, then copy(rehomeTraceRead()); rehomeTraceStop();');
}
