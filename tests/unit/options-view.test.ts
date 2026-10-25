import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOptionsView, mountOptions } from '../../src/options/view';
import { createConfigRepository } from '../../src/config/repository';
import { parseConfig } from '../../src/config/schema';

function elements() {
  return { heading: { textContent: '' }, message: { textContent: '', dataset: {} as Record<string, string> } };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('options status', () => {
  it.each([true, false])('explains the foundation status with enabled=%s without implying features work', (enabled) => {
    const view = createOptionsView(parseConfig({ schemaVersion: 1, enabled }));
    expect(view.heading).toContain('Foundation installed');
    expect(view.message).toContain(enabled ? 'enabled' : 'disabled');
    expect(view.message).toContain('Automatic tab organization is not implemented yet.');
    expect(view.severity).toBe('info');
  });

  it.each([
    [{}, /invalid.*restore|restore.*invalid/i],
    [{ schemaVersion: 99, enabled: true }, /update.*extension|newer.*extension/i],
  ] as const)('gives actionable unavailable status for %j without writes', async (raw, message) => {
    const write = vi.fn();
    const repository = createConfigRepository({ read: async () => raw, write, subscribe: () => () => {} });
    const target = elements();
    const mounted = mountOptions(target, repository);
    await mounted.ready;
    expect(target.heading.textContent).toContain('Foundation installed');
    expect(target.message.textContent).toMatch(message);
    expect(target.message.dataset.severity).toBe('error');
    expect(write).not.toHaveBeenCalled();
    mounted.dispose();
  });

  it('renders storage failure as actionable text', () => {
    expect(createOptionsView({ kind: 'unavailable', reason: 'storage', message: '<img src=x onerror=alert(1)>' }))
      .toMatchObject({ severity: 'error', message: expect.stringMatching(/reload|try again/i) });
  });

  it('the options entry updates from local storage and disposes on page teardown', async () => {
    const target = elements();
    const listeners = new Set<(changes: Record<string, unknown>, area: string) => void>();
    let enabled = false;
    let teardown!: () => void;
    const write = vi.fn(async () => {});
    vi.stubGlobal('document', { getElementById: (id: string) => id === 'status-heading' ? target.heading : target.message });
    vi.stubGlobal('window', { addEventListener: (name: string, listener: () => void) => {
      expect(name).toBe('pagehide');
      teardown = listener;
    } });
    vi.stubGlobal('chrome', { storage: {
      local: { get: async () => ({ chromeReHomeConfig: { schemaVersion: 1, enabled } }), set: write },
      onChanged: {
        addListener: (listener: (changes: Record<string, unknown>, area: string) => void) => { listeners.add(listener); },
        removeListener: (listener: (changes: Record<string, unknown>, area: string) => void) => { listeners.delete(listener); },
      },
    } });
    await import('../../src/options/index');
    await vi.waitFor(() => expect(target.message.textContent).toContain('disabled'));
    enabled = true;
    for (const listener of listeners) listener({ chromeReHomeConfig: {} }, 'local');
    await vi.waitFor(() => expect(target.message.textContent).toContain('enabled'));
    teardown();
    expect(listeners.size).toBe(0);
    expect(write).not.toHaveBeenCalled();
  });

  it('subscribes before loading and tears down the repository on disposal', async () => {
    let resolve!: (value: unknown) => void;
    const detach = vi.fn();
    const repository = createConfigRepository({
      read: () => new Promise((done) => { resolve = done; }),
      write: async () => {}, subscribe: () => detach,
    });
    const target = elements();
    const mounted = mountOptions(target, repository);
    await repository.save({ schemaVersion: 1, enabled: true });
    expect(target.message.textContent).toContain('enabled');
    resolve({ schemaVersion: 1, enabled: false });
    await mounted.ready;
    expect(target.message.textContent).toContain('enabled');
    mounted.dispose();
    mounted.dispose();
    await repository.save({ schemaVersion: 1, enabled: false });
    expect(target.message.textContent).toContain('enabled');
    expect(detach).toHaveBeenCalledTimes(1);
  });
});
