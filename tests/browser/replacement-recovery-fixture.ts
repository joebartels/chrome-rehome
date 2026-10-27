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

type Control = { at: string; token: string; release?: boolean; fault?: 'remove-reject' | 'settled-write' };
const controlKey = 'chromeReHomeFixtureControl';
const reachedKey = 'chromeReHomeFixtureReached';
const doneKey = 'chromeReHomeFixtureDone';
const used = new Set<string>();
let placed = false;
async function control(): Promise<Control | undefined> { return (await chrome.storage.session.get(controlKey))[controlKey] as Control | undefined; }
async function hold(label: string): Promise<void> {
  const config = await control();
  if (!config || config.at !== label || used.has(config.token)) return;
  used.add(config.token);
  await chrome.storage.session.set({ [reachedKey]: { label, token: config.token } });
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
const native = createPlacementAdapter(chrome);
const port = {
  ...native,
  async read() { const snapshot = await native.read(); if (placed) await hold('closure:snapshot'); return snapshot; },
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
  consume: async (event, context) => { await consumer(event, context); await chrome.storage.session.set({ [doneKey]: crypto.randomUUID() }); }
});
registerEvents(chrome, coordinator, () => {});
void coordinator.initialize();
