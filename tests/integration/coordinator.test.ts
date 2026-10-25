import { describe, expect, it, vi } from 'vitest';
import { createCoordinator } from '../../src/background/coordinator';
import { createConfigRepository } from '../../src/config/repository';
import { createNavigationTracker, type NavigationInput } from '../../src/background/navigation';
import { createOperationQueue } from '../../src/background/operation-queue';
import { createDiagnostics } from '../../src/diagnostics/diagnostics';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const enabled = { schemaVersion: 1, enabled: true };
function input(tabId = 7, timeStamp = 100): NavigationInput {
  return { tabId, frameId: 0, url: 'https://example.com/', timeStamp, kind: 'committed' };
}
function setup(read = vi.fn<() => Promise<unknown>>(async () => enabled)) {
  const detach = vi.fn();
  const config = createConfigRepository({ read, write: async () => {}, subscribe: () => detach });
  const queue = createOperationQueue();
  const diagnostics = createDiagnostics({ enabled: true });
  const consumed: number[] = [];
  const consume = vi.fn(async (event: { tabId: number }) => { consumed.push(event.tabId); });
  const coordinator = createCoordinator({ config, tracker: createNavigationTracker(), queue, diagnostics, consume });
  return { coordinator, config, queue, read, consumed, consume, diagnostics, detach };
}

describe('navigation coordinator', () => {
  it('shares one initialization and defers immediately arriving navigations until ready', async () => {
    const initial = deferred<unknown>();
    const fake = setup(vi.fn(() => initial.promise));
    const first = fake.coordinator.handle(input());
    const second = fake.coordinator.handle(input(8));
    expect(fake.read).toHaveBeenCalledTimes(1);
    expect(fake.consumed).toEqual([]);
    initial.resolve(enabled);
    await Promise.all([first, second, fake.coordinator.initialize()]);
    expect(fake.consumed).toEqual([7, 8]);
    expect(fake.read).toHaveBeenCalledTimes(1);
    expect(fake.diagnostics.snapshot().filter((event) => event.code === 'worker-started')).toHaveLength(1);
  });

  it.each([undefined, { schemaVersion: 1, enabled: false }, {}, { schemaVersion: 2 }, 'invalid'])
  ('skips consume for disabled or unavailable configuration %j', async (raw) => {
    const fake = setup(vi.fn(async () => raw));
    await fake.coordinator.handle(input());
    expect(fake.consumed).toEqual([]);
  });

  it('fails closed on rejected configuration storage', async () => {
    const fake = setup(vi.fn(async () => { throw new Error('private storage failure'); }));
    await fake.coordinator.handle(input());
    expect(fake.consumed).toEqual([]);
    expect(fake.diagnostics.snapshot()).toContainEqual({ code: 'configuration-unavailable' });
  });

  it('invalidates queued work even when configuration becomes enabled again', async () => {
    const fake = setup();
    await fake.coordinator.initialize();
    const gate = deferred<void>();
    const blocked = fake.queue.run(() => gate.promise);
    const pending = fake.coordinator.handle(input());
    await fake.config.save({ schemaVersion: 1, enabled: false });
    await fake.config.save(enabled);
    gate.resolve();
    await Promise.all([blocked, pending]);
    expect(fake.consumed).toEqual([]);
    await fake.coordinator.handle(input(8));
    expect(fake.consumed).toEqual([8]);
  });

  it('does not revive a navigation observed before initialization when config changes during load', async () => {
    const initial = deferred<unknown>();
    const fake = setup(vi.fn(() => initial.promise));
    const pending = fake.coordinator.handle(input());
    await fake.config.save({ schemaVersion: 1, enabled: false });
    initial.resolve(enabled);
    await pending;
    expect(fake.consumed).toEqual([]);
  });

  it('checks navigation generation when the queued job starts', async () => {
    const fake = setup();
    await fake.coordinator.initialize();
    const gate = deferred<void>();
    const blocked = fake.queue.run(() => gate.promise);
    const old = fake.coordinator.handle(input());
    const latest = fake.coordinator.handle(input(7, 101));
    gate.resolve();
    await Promise.all([blocked, old, latest]);
    expect(fake.consume).toHaveBeenCalledTimes(1);
    expect(fake.consume).toHaveBeenCalledWith(expect.objectContaining({ browserTimeStamp: 101 }));
  });

  it.each(['invalidate', 'forget'] as const)('%s prevents pending startup navigation from running', async (method) => {
    const initial = deferred<unknown>();
    const fake = setup(vi.fn(() => initial.promise));
    const pending = fake.coordinator.handle(input());
    fake.coordinator[method](7);
    initial.resolve(enabled);
    await pending;
    expect(fake.consumed).toEqual([]);
    await fake.coordinator.handle(input());
    expect(fake.consumed).toEqual([7]);
  });

  it('disposes subscriptions and prevents pending and future work', async () => {
    const initial = deferred<unknown>();
    const fake = setup(vi.fn(() => initial.promise));
    const pending = fake.coordinator.handle(input());
    fake.coordinator.dispose();
    fake.coordinator.dispose();
    initial.resolve(enabled);
    await pending;
    await fake.coordinator.handle(input(8));
    expect(fake.consumed).toEqual([]);
    expect(fake.detach).toHaveBeenCalledTimes(1);
  });

  it('allows later operations after a consumer failure without logging raw payloads', async () => {
    const fake = setup();
    fake.consume.mockRejectedValueOnce(new Error('https://private.example/?secret=one'));
    await expect(fake.coordinator.handle(input())).rejects.toThrow();
    await fake.coordinator.handle(input(8));
    expect(fake.consumed).toEqual([8]);
    expect(JSON.stringify(fake.diagnostics.snapshot())).not.toContain('private');
  });
});
