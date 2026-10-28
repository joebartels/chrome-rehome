import { expect, test } from 'vitest';
import { createControlService } from '../../src/background/controls';
import { createConfigRepository } from '../../src/config/repository';
import { targetFixture, targetHint as hint } from '../fixtures/control-target';
import { protectionFixture } from '../fixtures/protections';
import { deferred } from '../fixtures/replacement';
async function fixture() {
  const f = targetFixture(); const registry = protectionFixture({ version: 1, tabs: [{ tabId: 7, incognito: false }] });
  let raw: any = { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] };
  const config = createConfigRepository({ read: async () => raw, write: async value => { raw = value; }, subscribe: () => () => {} });
  const service = createControlService({ config, protections: registry.protections, targets: f.port, workerId: 'worker', runtime: () => 'ready' });
  await service.initialize();
  const response = await service.handle({ kind: 'get-status', target: hint }); const receipt = response.status.target!.receipt;
  const unprotect = () => service.handle({ kind: 'set-tab-protected', expected: service.getStatus().version, target: receipt, protected: false });
  return { ...f, registry, service, receipt, unprotect, get frame() { return f.frame; }, set frame(value) { f.frame = value; }, get tab() { return f.tab; }, set tab(value) { f.tab = value; } };
}
test.each([false, true])('same-URL reload during final postwrite selection cannot succeed, observed event=%s', async event => {
  const f = await fixture(); let postwrite = false; let selections = 0;
  f.registry.setWrite(async value => { f.registry.setRaw(value); postwrite = true; });
  const entered = deferred<void>(); const release = deferred<void>();
  f.boundary(async kind => { if (postwrite && kind === 'selection' && ++selections === 2) { entered.resolve(); await release.promise; } });
  const pending = f.unprotect(); await entered.promise;
  f.frame = { ...f.frame, documentId: 'reloaded-document' };
  if (event) f.navigation.onCommitted.emit({ tabId: 7, frameId: 0, documentId: 'reloaded-document' });
  release.resolve();
  expect(await pending).toMatchObject({ kind: 'conflict', status: { phase: 'unavailable' } });
  expect(f.service.capture()).toBeUndefined(); expect(f.registry.raw).toEqual({ version: 1, tabs: [] }); expect(f.listeners()).toBe(0);
});
test.each(['selection', 'window', 'context', 'removed', 'replacement', 'reload'])('observed %s change during final document await conflicts even if the old response arrives', async change => {
  const f = await fixture(); let postwrite = false; let documents = 0;
  f.registry.setWrite(async value => { f.registry.setRaw(value); postwrite = true; });
  const entered = deferred<void>(); const release = deferred<void>();
  f.boundary(async kind => { if (postwrite && kind === 'document' && ++documents === 2) { entered.resolve(); await release.promise; } });
  const pending = f.unprotect();
  const sawFinalRead = await Promise.race([entered.promise.then(() => true), pending.then(() => false)]);
  expect(sawFinalRead, 'bounded final document verification is required').toBe(true);
  if (change === 'selection') { f.tab = { ...f.tab, active: false }; f.tabs.onActivated.emit({ tabId: 8, windowId: 10 }); }
  if (change === 'window' || change === 'context') { f.tab = { ...f.tab, windowId: 11, incognito: change === 'context' }; f.tabs.onDetached.emit(7, { oldWindowId: 10 }); f.tabs.onAttached.emit(7, { newWindowId: 11 }); }
  if (change === 'removed') { f.tab = undefined; f.tabs.onRemoved.emit(7, { windowId: 10 }); }
  if (change === 'replacement') { f.tabs.onReplaced.emit(8, 7); }
  if (change === 'reload') { f.frame = { ...f.frame, documentId: 'new' }; f.navigation.onBeforeNavigate.emit({ tabId: 7, frameId: 0 }); }
  release.resolve(); expect(await pending).toMatchObject({ kind: 'conflict', status: { phase: 'unavailable' } });
  expect(f.service.capture()).toBeUndefined(); expect(f.listeners()).toBe(0);
});
test('selection leaves and returns during persistence still revokes the accepted target intent', async () => {
  const f = await fixture(); const entered = deferred<void>(); const release = deferred<void>();
  f.registry.setWrite(async value => { f.registry.setRaw(value); entered.resolve(); await release.promise; });
  const pending = f.unprotect(); await entered.promise;
  f.tabs.onActivated.emit({ tabId: 8, windowId: 10 }); f.tabs.onActivated.emit({ tabId: 7, windowId: 10 }); release.resolve();
  expect(await pending).toMatchObject({ kind: 'conflict', status: { phase: 'unavailable' } }); expect(f.listeners()).toBe(0);
});
test('read-only target observation never revokes the independent automatic operation capture', async () => {
  const f = await fixture(); const capture = f.service.capture()!; const generation = f.service.generation;
  const entered = deferred<void>(); const release = deferred<void>(); let selections = 0;
  f.boundary(async kind => { if (kind === 'selection' && ++selections === 2) { entered.resolve(); await release.promise; } });
  const pending = f.service.handle({ kind: 'get-status', target: hint }); await entered.promise;
  f.navigation.onCommitted.emit({ tabId: 7, frameId: 0, documentId: 'new' }); release.resolve();
  expect((await pending).status.target).toBeUndefined(); expect(f.service.generation).toBe(generation); expect(f.service.isCurrent(capture)).toBe(true); expect(f.listeners()).toBe(0);
});
test('same-document history, subframes and unrelated selections do not invalidate the target observation', async () => {
  const f = await fixture();
  f.boundary(async () => { f.navigation.onHistoryStateUpdated.emit({ tabId: 7, frameId: 0, documentId: 'doc', url: f.tab.url }); f.navigation.onCommitted.emit({ tabId: 7, frameId: 2, documentId: 'subframe' }); f.tabs.onActivated.emit({ tabId: 99, windowId: 99 }); });
  expect(await f.unprotect()).toMatchObject({ kind: 'ok', status: { phase: 'active' } }); expect(f.listeners()).toBe(0);
});
test('observer cleanup survives rejected document reads', async () => {
  const f = await fixture(); f.boundary(async kind => { if (kind === 'document') throw Error('unavailable'); });
  expect((await f.service.handle({ kind: 'get-status', target: hint })).status.target).toBeUndefined(); expect(f.listeners()).toBe(0);
});
