import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { attachPage, evaluate, observeWorker, until } from './cdp.mjs';

export async function optionsPage(chrome) {
  const { browser, extensionId } = chrome;
  const optionsUrl = `chrome-extension://${extensionId}/options/index.html`;
  const options = await attachPage(browser, optionsUrl);
  let optionsState;
  try {
    await until(async () => {
      try {
        optionsState = await evaluate(options, () => ({ url: location.href, tabs: !!globalThis.chrome?.tabs }));
        return optionsState.url === optionsUrl && optionsState.tabs;
      } catch (error) {
        if (!/default execution context|Execution context was destroyed/.test(error.message)) throw error;
      }
    }, 'options API');
  } catch (error) {
    throw new Error(`Options page expected ${optionsUrl}, observed ${JSON.stringify(optionsState)}`, { cause: error });
  }
  return options;
}

export async function seedProfile(chrome, origin, tabCount, discardFillers) {
  const { browser, extensionId } = chrome;
  const options = await optionsPage(chrome);
  const setup = await evaluate(options, async ({ origin, tabCount, discardFillers }) => {
    const harness = await chrome.tabs.getCurrent();
    const destination = harness.windowId;
    const initiallyOpen = await chrome.tabs.query({ windowId: destination });
    await chrome.tabs.remove(initiallyOpen.filter(tab => tab.id !== harness.id).map(tab => tab.id));
    const sourceUrl = origin + '/fixture/source';
    const incomingUrl = origin + '/fixture/incoming';
    const source = await chrome.windows.create({ url: sourceUrl, focused: true, type: 'normal' });
    const incoming = await chrome.tabs.create({ url: incomingUrl, windowId: source.id, active: false });
    const member = await chrome.tabs.create({ url: origin + '/fixture/member', windowId: destination, active: false });
    const group = await chrome.tabs.group({ tabIds: member.id });
    await chrome.tabGroups.update(group, { title: 'Benchmark destination', color: 'blue' });
    const fillers = [];
    for (let offset = 0; offset < tabCount - 5; offset += 12) {
      const batch = await Promise.all(Array.from({ length: Math.min(12, tabCount - 5 - offset) }, (_, index) => {
        const n = offset + index;
        return chrome.tabs.create({ url: origin + '/fixture/filler/' + n,
          windowId: n % 2 ? source.id : destination, active: false });
      }));
      for (const tab of batch) {
        if (discardFillers && fillers.length >= 12) {
          // Retain real URLs in Chrome's tab model while keeping high-scale profiles disposable.
          for (let attempt = 0; attempt < 100; attempt++) {
            const live = await chrome.tabs.get(tab.id);
            if (live.status === 'complete' && live.url?.startsWith(origin)) break;
            if (attempt === 99) throw new Error('Filler failed to commit before discard');
            await new Promise(resolve => setTimeout(resolve, 25));
          }
          const discarded = await chrome.tabs.discard(tab.id);
          if (!discarded?.discarded) throw new Error('Inactive filler failed to discard');
        }
        fillers.push(tab);
      }
    }
    for (const [windowId, title] of [[source.id, 'Source fillers'], [destination, 'Destination fillers']]) {
      const ids = fillers.filter(tab => tab.windowId === windowId).slice(0, 4).map(tab => tab.id);
      await chrome.tabGroups.update(await chrome.tabs.group({ tabIds: ids }), { title, color: 'grey' });
    }
    globalThis.benchmarkEvents = { navigation: [], completions: [] };
    chrome.webNavigation.onCommitted.addListener(event => {
      if (event.frameId === 0 && event.url.startsWith(origin + '/benchmark/sample/')) {
        globalThis.benchmarkEvents.navigation.push(event);
      }
    });
    chrome.runtime.onMessage.addListener(message => {
      if (message.chromeReHomeBenchmark) globalThis.benchmarkEvents.completions.push(message.chromeReHomeBenchmark);
    });
    return { source: source.id, sourceTab: source.tabs[0].id, sourceUrl, destination, member: member.id,
      group, incoming: incoming.id, incomingUrl, harness: harness.id };
  }, { origin, tabCount, discardFillers });
  const target = async url => until(async () => (await browser.call('Target.getTargets')).targetInfos.find(
    target => target.type === 'page' && target.url === url,
  ), 'local fixture target ' + url);
  const incomingTarget = await target(setup.incomingUrl);
  const observer = await browser.attach((await target(setup.sourceUrl)).targetId);
  const lifecycle = await observeWorker(observer, extensionId);
  const incomingCdp = await browser.attach(incomingTarget.targetId);
  const ready = () => readStatus(options);
  await until(async () => (await ready())?.phase === 'paused', 'fresh profile paused');
  return { options, incomingCdp, lifecycle, ready, ...setup };
}

export function readStatus(options) {
  return evaluate(options, async () => (await chrome.runtime.sendMessage({ kind: 'get-status' }))?.status);
}

export async function configure(fixture, origin, rules) {
  const settings = {
    schemaVersion: 4,
    enabled: true,
    groupingRules: Array.from({ length: rules }, (_, index) => ({
      enabled: true,
      pattern: index === rules - 1 ? origin + '/benchmark/sample/*/group' : origin + '/unused/' + index + '/*',
      group: index === rules - 1 ? 'Benchmark destination' : 'Unmatched ' + index,
    })),
    duplicateRules: Array.from({ length: rules }, (_, index) => ({
      enabled: true,
      origin: index === rules - 1 ? origin : 'https://unused-' + index + '.example.invalid',
      ignoreQueryParameters: ['tracking'], ignoreFragment: true, ignoreTrailingSlash: false, sortQueryParameters: true,
    })),
  };
  const prior = await fixture.ready();
  await evaluate(fixture.options, config => chrome.storage.local.set({ chromeReHomeConfig: config }), settings);
  return until(async () => {
    const status = await fixture.ready();
    return status?.phase === 'active' && status.version.revision > prior.version.revision ? status : undefined;
  }, 'active configuration');
}

export async function snapshot(fixture) {
  return evaluate(fixture.options, async () => {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    return {
      presentation: windows.map(window => ({ windowId: window.id, focused: window.focused,
        activeTabId: window.tabs.find(tab => tab.active)?.id })).sort((a, b) => a.windowId - b.windowId),
      tabs: windows.flatMap(window => window.tabs.map(tab => ({ id: tab.id, windowId: window.id, groupId: tab.groupId,
        index: tab.index, url: tab.url, discarded: tab.discarded }))).sort((a, b) => a.id - b.id),
    };
  });
}

export async function prepare(fixture, url, scenario, expectedTabs, previousAnchor) {
  const anchor = await evaluate(fixture.options, async ({ source, sourceTab, destination, member, group, incoming, url, scenario, previousAnchor }) => {
    if (previousAnchor !== undefined && await chrome.tabs.get(previousAnchor).catch(() => undefined)) {
      await chrome.tabs.remove(previousAnchor);
    }
    const tab = await chrome.tabs.get(incoming);
    if (tab.groupId !== -1) await chrome.tabs.ungroup(incoming);
    if (tab.windowId !== source) await chrome.tabs.move(incoming, { windowId: source, index: -1 });
    await chrome.tabs.update(incoming, { url: url + '/prepare' });
    const anchor = await chrome.tabs.create({ windowId: destination,
      url: scenario.startsWith('replacement') ? url + '?tracking=older#anchor' : url + '/anchor-spare', active: false });
    await chrome.tabs.group({ groupId: group, tabIds: anchor.id });
    await chrome.tabs.update(member, { active: true });
    await chrome.tabs.update(scenario === 'replacement-foreground' ? incoming : sourceTab, { active: true });
    await chrome.windows.update(source, { focused: true });
    return anchor.id;
  }, { ...ids(fixture), url, scenario, previousAnchor });
  let tabStatus;
  try {
    await until(async () => {
      tabStatus = await evaluate(fixture.options, async ids => {
        const tabs = await Promise.all(ids.map(id => chrome.tabs.get(id)));
        return tabs.map(({ id, status, url, pendingUrl, discarded }) => ({ id, status, url, pendingUrl, discarded }));
      }, [fixture.incoming, anchor]);
      return tabStatus.every(tab => tab.status === 'complete' && !tab.pendingUrl);
    }, 'fixture navigation commits');
  } catch (error) {
    throw new Error(`Unsettled fixture tabs: ${JSON.stringify(tabStatus)}`, { cause: error });
  }
  await delay(200);
  const before = await snapshot(fixture);
  assert.equal(before.tabs.length, expectedTabs, 'fixture tab count');
  if (scenario === 'replacement-foreground') {
    assert.equal(before.presentation.filter(window => window.focused).length, 1, 'one focused source window before trigger');
    assert.equal(before.presentation.find(window => window.focused)?.windowId, fixture.source);
  }
  assert.equal(before.presentation.find(window => window.windowId === fixture.source)?.activeTabId,
    scenario === 'replacement-foreground' ? fixture.incoming : fixture.sourceTab);
  return { anchor, before };
}

function ids(fixture) {
  return { source: fixture.source, sourceTab: fixture.sourceTab, destination: fixture.destination,
    member: fixture.member, group: fixture.group, incoming: fixture.incoming };
}

export function hasExpectedMutation(after, fixture, anchor, url, scenario) {
  const winner = after.tabs.find(tab => tab.id === fixture.incoming);
  const noMatch = scenario === 'no-match';
  const replace = scenario.startsWith('replacement');
  return winner?.url === url && winner.windowId === (noMatch ? fixture.source : fixture.destination)
    && winner.groupId === (noMatch ? -1 : fixture.group)
    && after.tabs.some(tab => tab.id === anchor) === !replace;
}

export function assertOutcome(before, after, fixture, anchor, url, scenario) {
  assert.ok(hasExpectedMutation(after, fixture, anchor, url, scenario), 'incoming placement and duplicate outcome');
  const replace = scenario.startsWith('replacement');
  const skip = [fixture.incoming, ...(replace ? [anchor] : [])];
  const survivor = ({ id, url, windowId, groupId }) => ({ id, url, windowId, groupId });
  assert.deepEqual(after.tabs.filter(tab => !skip.includes(tab.id)).map(survivor),
    before.tabs.filter(tab => !skip.includes(tab.id)).map(survivor), 'unrelated tabs survive unchanged');
  if (replace) {
    const winner = after.tabs.find(tab => tab.id === fixture.incoming);
    assert.equal(winner.index, before.tabs.find(tab => tab.id === anchor).index, 'winner takes the anchor slot');
  }
  if (scenario === 'no-match') {
    assert.deepEqual(after.tabs, before.tabs.map(tab => tab.id === fixture.incoming ? { ...tab, url } : tab),
      'no-match preserves exact tab order and membership');
  }
  if (scenario === 'replacement-foreground') {
    assert.equal(after.presentation.find(window => window.focused)?.windowId, fixture.destination);
    assert.equal(after.presentation.find(window => window.windowId === fixture.destination)?.activeTabId, fixture.incoming);
    assert.ok(after.presentation.some(window => window.windowId === fixture.source), 'source window remains open');
  } else {
    assert.deepEqual(after.presentation, before.presentation, 'background placement preserves presentation');
  }
}
