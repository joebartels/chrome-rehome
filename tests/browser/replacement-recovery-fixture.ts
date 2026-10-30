// Test-only service-worker entry. This file and its controls never enter production dist.
import { createPlacementAdapter } from '../../src/browser/placement';
import { createChromeJournalStorage } from '../../src/browser/journal-storage';
import { createChromeConfigStorage } from '../../src/browser/config-storage';
import { createReplacementJournal, type ReplacementJournal } from '../../src/execution/journal';
import { createRecovery } from '../../src/background/recovery';
import { createConfigRepository } from '../../src/config/repository';
import { createDiagnostics } from '../../src/diagnostics/diagnostics';
import { createNavigationTracker } from '../../src/background/navigation';
import { createOperationQueue } from '../../src/background/operation-queue';
import { createCoordinator } from '../../src/background/coordinator';
import { createPlacementConsumer } from '../../src/background/placement';
import { registerEvents } from '../../src/background/register-events';

import { observeAdmission, phaseBelongsToAdmission, type Admission, type Foreground, type Incoming, type Completion } from './recovery-observations';

type Control = { at: string; token: string; release?: boolean; presentation?: boolean; foreground?: Foreground; navigation?: Pick<Incoming, 'tabId' | 'url'>; fault?: 'remove-reject' | 'settled-write' };
const controlKey = 'chromeReHomeFixtureControl';
const reachedKey = 'chromeReHomeFixtureReached';
const doneKey = 'chromeReHomeFixtureDone';
const used = new Set<string>();
const admissions = new Map<string, Admission>();
let incoming: Incoming | undefined;
let presentationReads = 0;
const completion: Completion = {realm: crypto.randomUUID(), initialized: false, handled: []};
Object.defineProperty(globalThis, '__recoveryCompletion', {value: completion});
let placed = false;
async function control(): Promise<Control | undefined> { return (await chrome.storage.session.get(controlKey))[controlKey] as Control | undefined; }
async function hold(label: string): Promise<void> {
  const config = await control();
  if (!config || config.at !== label || used.has(config.token)) return;
  if (config.navigation && (incoming?.kind !== 'committed' || incoming.tabId !== config.navigation.tabId || incoming.url !== config.navigation.url)) return;
  if (config.foreground && !phaseBelongsToAdmission(config.token, incoming, admissions.get(config.token))) return;
  used.add(config.token);
  await chrome.storage.session.set({ [reachedKey]: { label, token: config.token, timestamp: Date.now(), incoming } });
  if (config.release) return;
  await new Promise<void>(resolve => {
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const next = changes[controlKey]?.newValue as Control | undefined;
      if (area === 'session' && next?.token === config.token && next.release) {
        chrome.storage.onChanged.removeListener(changed);
        resolve();
      }
    };
    chrome.storage.onChanged.addListener(changed);
    // Cover a release that arrived between publishing the reached marker and subscribing.
    void control().then(next => {
      if (next?.token === config.token && next.release) { chrome.storage.onChanged.removeListener(changed); resolve(); }
    });
  });
}
const observations: unknown[] = [];
Object.defineProperty(globalThis, '__presentationObservations', {value:observations});
function record(value: Record<string, unknown>) { observations.push({timestamp: Date.now(), ...value}); if(observations.length > 300) observations.shift(); }
chrome.windows.onFocusChanged.addListener(windowId => {
  const timestamp = Date.now();
  const event = incoming;
  const operation = previous;
  void control().then(config => record({timestamp, token: config?.token, focusChanged: windowId, incoming: event, operation}));
});
const native = createPlacementAdapter(chrome);
let moveCount = 0;
const port = {
  ...native,
  async moveTab(...args: Parameters<typeof native.moveTab>) {
    await native.moveTab(...args);
    await hold(`placement:native-fulfilled:move:${++moveCount}`);
  },
  // Legacy structural sequence fixtures deliberately use unknown attention. New
  // headed presentation fixtures explicitly opt into the production native reader.
  async readPresentation() {
    const config = await control();
    if (!config?.presentation) return;
    const firstRead = presentationReads++ === 0;
    const event = incoming;
    const state = await native.readPresentation();
    record({token: config.token, attention: state ?? null, incoming: event, firstRead, operation: previous});
    const admission = event && observeAdmission(config.token, config.foreground, event, state, firstRead);
    if (admission && !admissions.has(config.token)) {
      admissions.set(config.token, admission);
      await chrome.storage.session.set({chromeReHomeFixtureAdmission: admission});
    }
    return state;
  },
  async activateTab(id: number) { await native.activateTab(id); await hold('presentation:native-fulfilled:activate'); },
  async focusWindow(id: number) { await native.focusWindow(id); await hold('presentation:native-fulfilled:focus'); },
  async read() {
    const snapshot = await native.read();
    await hold('placement:snapshot');
    if (placed) await hold('closure:snapshot');
    return snapshot;
  },
  async readDocument(id: number) { const document = await native.readDocument(id); if (placed) await hold('closure:document'); return document; },
  async removeTab(id: number) {
    const config = await control();
    if (config?.fault === 'remove-reject') throw new Error('Simulated native rejection');
    await native.removeTab(id);
    await hold('closure:native-fulfilled');
  }
};
const nativeStorage = createChromeJournalStorage(chrome);
let previous: ReplacementJournal | undefined;
const storage = {
  read: nativeStorage.read,
  clear: nativeStorage.clear,
  async write(value: ReplacementJournal) {
    const config = await control();
    const settled = previous?.pending && !value.pending;
    if (config?.fault === 'settled-write' && settled) throw new Error('Simulated storage rejection');
    await nativeStorage.write(value);
    record({journal:value});
    let label: string;
    if (value.pending) label = `pending:${value.pending.kind}:${value.sequence}`;
    else if (settled) label = `settled:${previous!.pending!.kind}:${value.sequence}`;
    else if (value.terminal) label = 'terminal';
    else if (value.completedPhase === 'prepared') label = 'prepared';
    else if (value.completedPhase === 'placed') { label = 'placed'; placed = true; }
    else label = `verified:${value.completedPhase === 'removed' ? 'remove' : value.completedPhase}:${value.sequence}`;
    previous = value;
    await hold(label);
  }
};
const journal = createReplacementJournal({ storage, createOperationId: () => crypto.randomUUID() });
const recovery = createRecovery({ journal, port });
const tracker = createNavigationTracker();
const diagnostics = createDiagnostics();
const consumer = createPlacementConsumer({ tracker, port, journal, diagnostics });
const coordinator = createCoordinator({ tracker, diagnostics, recovery, config: createConfigRepository(createChromeConfigStorage(chrome)), queue: createOperationQueue(),
  consume: async (event, context) => {
    incoming = event;
    presentationReads = 0;
    try { await consumer(event, context); await chrome.storage.session.set({ [doneKey]: crypto.randomUUID() }); }
    finally { incoming = undefined; }
  }
});
const initialized = coordinator.initialize().then(() => { completion.initialized = true; });
registerEvents(chrome, {
  ...coordinator,
  async handle(event) {
    await coordinator.handle(event);
    await initialized;
    completion.handled.push({...event});
    if (completion.handled.length > 100) completion.handled.shift();
  }
}, () => {});
