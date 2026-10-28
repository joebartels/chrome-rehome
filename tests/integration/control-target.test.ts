import { createControlService } from '../../src/background/controls';
import { createConfigRepository } from '../../src/config/repository';
import { protectionFixture } from '../fixtures/protections';
import { expect, test } from 'vitest';
import { createControlTargets } from '../../src/browser/control-target';
import { createChromeProtectionStorage } from '../../src/browser/protection-storage';
import { createProtectionRepository } from '../../src/protections/repository';
const hint = { tabId: 7, windowId: 10, incognito: false };
function fixture() {
  let tab: any = { id: 7, windowId: 10, incognito: false, active: true, pinned: false, audible: false, url: 'https://example.test/' };
  let frame: any = { documentId: 'doc', url: tab.url, documentLifecycle: 'active', frameType: 'outermost_frame', parentFrameId: -1, errorOccurred: false };
  const queries: unknown[] = []; let afterDocument = () => {};
  const port = createControlTargets({ tabs: { query: async (query: unknown) => { queries.push(query); return tab ? [tab] : []; } }, webNavigation: { getFrame: async () => { afterDocument(); return frame; } } } as unknown as Pick<typeof chrome, 'tabs' | 'webNavigation'>);
  return { port, queries, get tab() { return tab; }, set tab(next) { tab = next; }, get frame() { return frame; }, set frame(next) { frame = next; }, after(fn: () => void) { afterDocument = fn; } };
}
test('target status uses its UI-owned window selection, strips URL/title, and brackets document lookup', async () => {
  const f = fixture(); expect(await f.port.read(hint)).toEqual({ receipt: { ...hint, documentId: 'doc' }, audible: false, pinned: false });
  expect(f.queries).toEqual([{ windowId: 10, active: true }, { windowId: 10, active: true }]);
  f.after(() => { f.tab = { ...f.tab, id: 8 }; }); expect(await f.port.read(hint)).toBeUndefined();
});
test.each([{ id: 8 }, { windowId: 11 }, { incognito: true }, { active: false }, { pendingUrl: undefined }])('rejects current-tab mismatch %j', async extra => {
  const f = fixture(); f.tab = { ...f.tab, ...extra }; expect(await f.port.read(hint)).toBeUndefined();
});
test.each([{ documentLifecycle: 'cached' }, { frameType: 'sub_frame' }, { parentFrameId: 0 }, { errorOccurred: true }, { documentId: '' }, { url: 'https://changed.test/' }])('rejects unavailable outermost document %j', async extra => {
  const f = fixture(); f.frame = { ...f.frame, ...extra }; expect(await f.port.read(hint)).toBeUndefined();
});
test('live identities include privacy context only', async () => { const f = fixture(); expect(await f.port.list()).toEqual([{ tabId: 7, incognito: false }]); });
test('session adapter uses only the dedicated key and propagates external changes without local writes', async () => {
  const listeners = new Set<(change: Record<string, chrome.storage.StorageChange>, area: string) => void>();
  const values: Record<string, unknown> = {}; const reads: string[] = []; const writes: unknown[] = [];
  const api = { storage: { session: {
    async get(key: string) { reads.push(key); return { [key]: values[key] }; },
    async set(value: Record<string, unknown>) { writes.push(value); Object.assign(values, value); for (const listener of listeners) listener({ chromeReHomeProtections: { newValue: value.chromeReHomeProtections } }, 'session'); }
  }, onChanged: { addListener(fn: any) { listeners.add(fn); }, removeListener(fn: any) { listeners.delete(fn); } } } } as unknown as Pick<typeof chrome, 'storage'>;
  const repository = createProtectionRepository(createChromeProtectionStorage(api)); await repository.load();
  const value = { version: 1, tabs: [{ tabId: 7, incognito: false }] }; await repository.save(value);
  expect(reads).toEqual(['chromeReHomeProtections', 'chromeReHomeProtections']); expect(writes).toEqual([{ chromeReHomeProtections: value }]);
  for (const listener of listeners) { listener({ chromeReHomeProtections: { newValue: null } }, 'local'); listener({ other: { newValue: null } }, 'session'); }
  expect(reads).toHaveLength(2); values.chromeReHomeProtections = undefined;
  for (const listener of listeners) listener({ chromeReHomeProtections: { oldValue: value } }, 'session');
  expect(repository.getCurrent()).toBeUndefined(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(repository.getCurrent()?.state).toMatchObject({ kind: 'ready', value: { tabs: [] } });
  repository.dispose(); expect(listeners.size).toBe(0);
});

test('real target adapter accepts protection commands carrying a document receipt', async () => {
  const f = fixture(); const registry = protectionFixture();
  let raw: any = { schemaVersion: 4, enabled: false, groupingRules: [], duplicateRules: [] };
  const config = createConfigRepository({ read: async () => raw, write: async value => { raw = value; }, subscribe: () => () => {} });
  const service = createControlService({ config, protections: registry.protections, targets: f.port, workerId: 'worker', runtime: () => 'ready' }); await service.initialize();
  const status = await service.handle({ kind: 'get-status', target: hint });
  const result = await service.handle({ kind: 'set-tab-protected', expected: status.status.version, target: status.status.target!.receipt, protected: true });
  expect(result.kind).toBe('ok'); expect(registry.raw).toEqual({ version: 1, tabs: [{ tabId: 7, incognito: false }] });
});
