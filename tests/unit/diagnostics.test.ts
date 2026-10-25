import { describe, expect, it } from 'vitest';
import { createDiagnostics, type DiagnosticEvent } from '../../src/diagnostics/diagnostics';

describe('diagnostics', () => {
  it('stores nothing unless enabled', () => {
    for (const diagnostics of [createDiagnostics(), createDiagnostics({ enabled: false })]) {
      diagnostics.record({ code: 'worker-started' });
      expect(diagnostics.snapshot()).toEqual([]);
    }
  });

  it('drops the oldest records when capacity is reached', () => {
    const diagnostics = createDiagnostics({ enabled: true, capacity: 2 });
    diagnostics.record({ code: 'worker-started' });
    diagnostics.record({ code: 'navigation-observed', sequence: 1, tabId: 42 });
    diagnostics.record({ code: 'operation-failed', sequence: 2 });
    expect(diagnostics.snapshot()).toEqual([
      { code: 'navigation-observed', sequence: 1, tabId: 42 },
      { code: 'operation-failed', sequence: 2 },
    ]);
  });

  it('defaults enabled capacity to 100', () => {
    const diagnostics = createDiagnostics({ enabled: true });
    for (let sequence = 0; sequence < 101; sequence++) {
      diagnostics.record({ code: 'navigation-observed', sequence });
    }
    expect(diagnostics.snapshot()).toHaveLength(100);
    expect(diagnostics.snapshot()[0]).toEqual({ code: 'navigation-observed', sequence: 1 });
    expect(diagnostics.snapshot()[99]).toEqual({ code: 'navigation-observed', sequence: 100 });
  });

  it.each([1, 1000])('accepts enabled capacity boundary %s', (capacity) => {
    const diagnostics = createDiagnostics({ enabled: true, capacity });
    diagnostics.record({ code: 'worker-started' });
    expect(diagnostics.snapshot()).toEqual([{ code: 'worker-started' }]);
  });

  it.each([0, -1, 1001, 1.5, NaN, Infinity])('rejects invalid enabled capacity %s', (capacity) => {
    expect(() => createDiagnostics({ enabled: true, capacity })).toThrow();
  });

  it('copies records and excludes unknown runtime properties', () => {
    const diagnostics = createDiagnostics({ enabled: true });
    const event = {
      code: 'navigation-observed' as const,
      sequence: 0,
      tabId: 0,
      url: 'https://private.example/?token=secret',
      error: new Error('private details'),
      payload: { secret: true },
    };
    diagnostics.record(event);
    event.sequence = 99;
    event.tabId = 99;
    expect(diagnostics.snapshot()).toEqual([{ code: 'navigation-observed', sequence: 0, tabId: 0 }]);
  });

  it('excludes invalid runtime values in allowed fields', () => {
    const diagnostics = createDiagnostics({ enabled: true });
    diagnostics.record({ code: 'https://private.example/' } as unknown as DiagnosticEvent);
    diagnostics.record({ code: 'operation-failed', sequence: new Error('private'), tabId: 'private' } as unknown as DiagnosticEvent);
    expect(diagnostics.snapshot()).toEqual([{ code: 'operation-failed' }]);
  });

  it('does not allow snapshots to mutate retained records or the retained list', () => {
    const diagnostics = createDiagnostics({ enabled: true });
    diagnostics.record({ code: 'configuration-unavailable', sequence: 1 });
    const snapshot = diagnostics.snapshot();
    try { (snapshot[0] as { sequence: number }).sequence = 99; } catch { /* Frozen snapshots may reject mutation. */ }
    try { (snapshot as DiagnosticEvent[]).push({ code: 'operation-failed' }); } catch { /* Frozen snapshots may reject mutation. */ }
    expect(diagnostics.snapshot()).toEqual([{ code: 'configuration-unavailable', sequence: 1 }]);
  });
});
