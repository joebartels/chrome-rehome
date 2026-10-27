import { describe, expect, it } from 'vitest';
import { createConfigRepository, type ConfigStorage } from '../../src/config/repository';
import type { Config } from '../../src/config/schema';
import { createOptionsController } from '../../src/options/controller';

const empty = { schemaVersion: 4, enabled: true, groupingRules: [], duplicateRules: [] } as const;
const other = { ...empty, groupingRules: [{ enabled: true, pattern: 'https://other.test/*', group: 'Other' }] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(initial: unknown = empty) {
  let raw = initial;
  let changed = () => {};
  let read: () => Promise<unknown> = async () => raw;
  let write: (value: Config) => Promise<void> = async value => { raw = value; };
  const writes: Config[] = [];
  let detached = 0;
  const storage: ConfigStorage = {
    read: () => read(),
    write: value => { writes.push(value); return write(value); },
    subscribe: listener => { changed = listener; return () => { detached++; }; },
  };
  const repository = createConfigRepository(storage);
  const controller = createOptionsController(repository);
  return { controller, repository, writes, get raw() { return raw; }, get detached() { return detached; },
    setRead(value: typeof read) { read = value; }, setWrite(value: typeof write) { write = value; },
    external(value: unknown) { raw = value; changed(); }, setRaw(value: unknown) { raw = value; } };
}
function edit(h: ReturnType<typeof harness>) {
  h.controller.edit(draft => { draft.groupingRules.push({ enabled: true, pattern: 'https://example.test/*', group: 'Work' }); });
}
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

describe('options controller', () => {
  it('adopts clean changes, protects readonly snapshots and preserves global activation on one whole-document save', async () => {
    const h = harness(); await h.controller.ready;
    expect(h.controller.getState()).toMatchObject({ dirty: false, conflict: false, busy: false });
    expect(Object.isFrozen(h.controller.getState().draft?.groupingRules)).toBe(true);
    expect(Object.isFrozen(h.controller.getState().saved)).toBe(true);
    h.external(other); await flush();
    expect(h.controller.getState().draft?.groupingRules[0]?.group).toBe('Other');
    h.controller.edit(d => { d.enabled = false; d.groupingRules[0]!.group = 'Changed'; });
    expect(h.controller.getState().draft?.enabled).toBe(true);
    await h.controller.save();
    expect(h.writes).toEqual([{ ...other, groupingRules: [{ ...other.groupingRules[0], group: 'Changed' }] }]);
    expect(h.controller.getState()).toMatchObject({ dirty: false, busy: false, conflict: false, message: 'Settings saved.' });
  });

  it('does not let an edit callback retain ownership of the private draft', async () => {
    const h = harness(); await h.controller.ready;
    let retained: Parameters<Parameters<typeof h.controller.edit>[0]>[0] | undefined;
    h.controller.edit(d => { retained = d; d.groupingRules.push({ enabled: true, pattern: 'https://example.test/*', group: 'Work' }); });
    retained!.groupingRules[0]!.group = 'Mutated outside edit';
    expect(h.controller.getState().draft?.groupingRules[0]?.group).toBe('Work');
  });

  it('does not conflict on equal canonical settings but blocks a different external document', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    h.external({ ...empty, groupingRules: [] }); await flush();
    expect(h.controller.getState().conflict).toBe(false);
    h.external(other); await flush();
    expect(h.controller.getState()).toMatchObject({ dirty: true, conflict: true });
    expect(h.controller.getState().draft?.groupingRules[0]?.group).toBe('Work');
    await h.controller.save(); expect(h.writes).toHaveLength(0);
  });

  it('clears the obsolete Reload instruction when saved settings return to the draft base', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    h.external(other); await flush();
    expect(h.controller.getState()).toMatchObject({ dirty: true, conflict: true });
    expect(h.controller.getState().message).toMatch(/reload saved settings/i);
    h.external(empty); await flush();
    expect(h.controller.getState()).toMatchObject({ dirty: true, conflict: false, message: 'Unsaved changes.' });
    expect(h.controller.getState().draft?.groupingRules[0]?.group).toBe('Work');
    expect(h.writes).toHaveLength(0);
  });

  it('does not claim unsaved changes after an edit restores the saved document', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    expect(h.controller.getState()).toMatchObject({ dirty: true, message: 'Unsaved changes.' });
    h.controller.edit(draft => { draft.groupingRules = []; });
    expect(h.controller.getState()).toMatchObject({ dirty: false, conflict: false, message: 'Draft matches saved settings.' });
    expect(h.writes).toHaveLength(0);
  });

  it.each([{}, { schemaVersion: 99 }, undefined])('keeps existing draft when external settings become unavailable: %j', async raw => {
    const h = harness(); await h.controller.ready; edit(h);
    h.external(raw === undefined ? { schemaVersion: 4, enabled: 'bad' } : raw); await flush();
    expect(h.controller.getState()).toMatchObject({ dirty: true, conflict: true, saved: { kind: 'unavailable' } });
    expect(h.controller.getState().draft?.groupingRules[0]?.group).toBe('Work');
    await h.controller.save(); expect(h.writes).toHaveLength(0);
  });

  it('has no writable draft after an initial failure, and reload recovers', async () => {
    const h = harness({}); await h.controller.ready;
    expect(h.controller.getState().draft).toBeUndefined();
    edit(h); await h.controller.save(); expect(h.writes).toHaveLength(0);
    h.setRaw(empty); await h.controller.reload();
    expect(h.controller.getState()).toMatchObject({ draft: { enabled: true }, dirty: false });
  });

  it('discards a draft only after reload succeeds and blocks duplicate actions while pending', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    const read = deferred<unknown>(); h.setRead(() => read.promise);
    const pending = h.controller.reload();
    h.controller.edit(d => { d.groupingRules = []; });
    await h.controller.save(); await h.controller.reload();
    expect(h.controller.getState().draft?.groupingRules[0]?.group).toBe('Work');
    read.reject(); await pending;
    expect(h.controller.getState()).toMatchObject({ dirty: true, busy: false });
    h.setRead(async () => other); await h.controller.reload();
    expect(h.controller.getState()).toMatchObject({ dirty: false, conflict: false, draft: { groupingRules: [{ group: 'Other' }] } });
    expect(h.writes).toHaveLength(0);
  });

  it('preflight detects unseen changes and never writes', async () => {
    const h = harness(); await h.controller.ready; edit(h); h.setRaw(other);
    await h.controller.save();
    expect(h.writes).toHaveLength(0);
    expect(h.controller.getState()).toMatchObject({ busy: false, dirty: true, conflict: true });
  });

  it('rejects invalid draft without writing even when its rule is disabled', async () => {
    const h = harness(); await h.controller.ready;
    h.controller.edit(d => { d.groupingRules.push({ enabled: false, pattern: '', group: '' }); });
    await h.controller.save();
    expect(h.controller.getState().validation?.kind).toBe('invalid');
    expect(h.writes).toHaveLength(0);
  });

  it('ignores late startup reads after a newer storage result', async () => {
    const start = deferred<unknown>(); let reads = 0; let changed = () => {};
    const repository = createConfigRepository({ read: () => ++reads === 1 ? start.promise : Promise.resolve(other), write: async () => {}, subscribe: fn => { changed = fn; return () => {}; } });
    const controller = createOptionsController(repository);
    changed(); await flush(); start.resolve(empty); await controller.ready;
    expect(controller.getState().draft?.groupingRules[0]?.group).toBe('Other');
  });

  it('reload adopts the newer event instead of a late read', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    const read = deferred<unknown>(); h.setRead(() => read.promise);
    const reload = h.controller.reload(); h.setRead(async () => other); h.external(other); await flush();
    read.resolve(empty); await reload;
    expect(h.controller.getState().draft?.groupingRules[0]?.group).toBe('Other');
    expect(h.controller.getState().dirty).toBe(false);
  });

  it('reload cannot discard a draft while a newer storage read is still pending', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    const read = deferred<unknown>(); const newer = deferred<unknown>();
    h.setRead(() => read.promise); const reload = h.controller.reload();
    h.setRead(() => newer.promise); h.external(other);
    read.resolve(empty); await reload;
    expect(h.controller.getState().draft?.groupingRules[0]?.group).toBe('Work');
    expect(h.controller.getState().dirty).toBe(true);
    newer.resolve(other); await flush();
    expect(h.controller.getState().conflict).toBe(true);
  });

  it('preflight cannot write from an obsolete read while a newer storage read is pending', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    const read = deferred<unknown>(); const newer = deferred<unknown>();
    h.setRead(() => read.promise); const saving = h.controller.save();
    h.setRead(() => newer.promise); h.external(other);
    read.resolve(empty); await flush();
    expect(h.writes).toHaveLength(0);
    newer.resolve(other); await saving; await flush();
    expect(h.controller.getState()).toMatchObject({ dirty: true, busy: false, conflict: true });
  });

  it('verification cannot acknowledge saved while a newer storage read is pending', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    const read = deferred<unknown>(); const newer = deferred<unknown>();
    h.setWrite(async value => { h.setRaw(value); h.setRead(() => read.promise); });
    const saving = h.controller.save(); await flush();
    h.setRead(() => newer.promise); h.external(other);
    read.resolve(h.writes[0]); await saving;
    expect(h.controller.getState().message).not.toBe('Settings saved.');
    expect(h.controller.getState().dirty).toBe(true);
    newer.resolve(other); await flush();
    expect(h.controller.getState().conflict).toBe(true);
  });

  it('write rejection releases busy and preserves draft/base so a fresh preflight can retry', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    h.setWrite(async () => { throw new Error('sensitive exception'); });
    await h.controller.save();
    expect(h.controller.getState()).toMatchObject({ busy: false, dirty: true, conflict: false });
    expect(h.controller.getState().message).toMatch(/could not save/i);
    expect(h.controller.getState().message).not.toContain('sensitive');
    expect(h.controller.getState().draft?.groupingRules[0]?.group).toBe('Work');
    h.setWrite(async value => { h.setRaw(value); }); await h.controller.save();
    expect(h.writes).toHaveLength(2);
    expect(h.controller.getState()).toMatchObject({ dirty: false, message: 'Settings saved.' });
  });

  it.each([other, {}, { schemaVersion: 99 }])('a conflicting external publication remains visible after the pending write rejects: %j', async raw => {
    const h = harness(); await h.controller.ready; edit(h);
    const write = deferred<void>(); h.setWrite(() => write.promise);
    const saving = h.controller.save(); await flush();
    h.external(raw); await flush(); write.reject(); await saving;
    expect(h.controller.getState()).toMatchObject({ busy: false, dirty: true, conflict: true });
    expect(h.controller.getState().draft?.groupingRules[0]?.group).toBe('Work');
    expect(h.controller.getState().message).toMatch(/could not save.*changed.*reload/i);
    await h.controller.save(); expect(h.writes).toHaveLength(1);
  });

  it('preflight storage failure can retry with intact draft', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    h.setRead(async () => { throw new Error(); }); await h.controller.save();
    expect(h.writes).toHaveLength(0); expect(h.controller.getState().busy).toBe(false);
    h.setRead(async () => h.raw); await h.controller.save();
    expect(h.controller.getState().message).toBe('Settings saved.');
  });

  it('keeps written-candidate baseline after failed verification so retry is safe', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    h.setWrite(async value => { h.setRaw(value); h.setRead(async () => { throw new Error(); }); });
    await h.controller.save();
    expect(h.controller.getState()).toMatchObject({ busy: false, dirty: true, conflict: false });
    expect(h.controller.getState().message).toMatch(/written.*could not.*verif/i);
    h.setRead(async () => h.raw);
    h.external(h.writes[0]); await flush();
    expect(h.controller.getState().message).toMatch(/written.*could not.*verif/i);
    h.setRead(async () => h.raw); h.setWrite(async value => { h.setRaw(value); }); await h.controller.save();
    expect(h.controller.getState()).toMatchObject({ dirty: false, message: 'Settings saved.' });
  });

  it('restores the verification warning when a written draft conflict returns to its baseline', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    h.setWrite(async value => { h.setRaw(value); h.setRead(async () => { throw new Error(); }); });
    await h.controller.save();
    h.setRead(async () => h.raw);
    h.external(other); await flush();
    expect(h.controller.getState().conflict).toBe(true);
    h.external(h.writes[0]); await flush();
    expect(h.controller.getState()).toMatchObject({ dirty: true, conflict: false });
    expect(h.controller.getState().message).toMatch(/written.*could not.*verif/i);
  });

  it('a different document at verification becomes conflict rather than a saved acknowledgement', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    h.setWrite(async () => { h.setRaw(other); }); await h.controller.save();
    expect(h.controller.getState()).toMatchObject({ conflict: true, busy: false, dirty: true });
    expect(h.controller.getState().message).not.toBe('Settings saved.');
    expect(h.controller.getState().draft?.groupingRules[0]?.group).toBe('Work');
  });

  it('ignores own old-base and candidate notifications during write and blocks edits or duplicate saves', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    const write = deferred<void>(); h.setWrite(async value => { h.external(empty); await flush(); h.external(value); await flush(); await write.promise; h.setRaw(value); });
    const saving = h.controller.save(); await flush();
    h.controller.edit(d => { d.groupingRules = []; }); await h.controller.save();
    expect(h.writes).toHaveLength(1); expect(h.controller.getState().conflict).toBe(false);
    expect(h.controller.getState().draft?.groupingRules[0]?.group).toBe('Work');
    write.resolve(); await saving;
    expect(h.controller.getState()).toMatchObject({ dirty: false, conflict: false, message: 'Settings saved.' });
  });

  it('does not forget a conflicting event during a pending write', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    const write = deferred<void>(); h.setWrite(async value => { h.external(other); await flush(); await write.promise; h.setRaw(value); });
    const saving = h.controller.save(); await flush(); write.resolve(); await saving;
    expect(h.controller.getState().conflict).toBe(true);
    expect(h.controller.getState().message).not.toBe('Settings saved.');
  });

  it('accepts an old-base echo while verifying its written candidate', async () => {
    const h = harness(); await h.controller.ready; edit(h);
    const verification = deferred<unknown>();
    h.setWrite(async value => {
      h.setRaw(value); h.setRead(() => verification.promise);
    });
    const saving = h.controller.save(); await flush();
    h.setRead(async () => empty); h.external(empty); await flush();
    const written = h.writes[0]!;
    h.setRead(async () => written); h.external(written); await flush();
    verification.resolve(written); await saving;
    expect(h.controller.getState()).toMatchObject({ dirty: false, conflict: false, message: 'Settings saved.' });
  });

  it.each(['read', 'write'] as const)('disposal ignores pending %s and detaches exactly once', async stage => {
    const h = harness(); await h.controller.ready; edit(h);
    const pending = deferred<unknown>();
    if (stage === 'read') h.setRead(() => pending.promise);
    else h.setWrite(async value => { await pending.promise; h.setRaw(value); });
    const saving = h.controller.save(); await flush();
    let notifications = 0; h.controller.subscribe(() => { notifications++; });
    h.controller.dispose(); h.controller.dispose(); const before = h.controller.getState();
    pending.resolve(empty); await saving;
    expect(h.controller.getState()).toEqual(before); expect(notifications).toBe(0); expect(h.detached).toBe(1);
  });
});
