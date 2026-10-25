export type DiagnosticEvent = Readonly<{
  code: 'worker-started' | 'navigation-observed' | 'configuration-unavailable' | 'operation-failed';
  sequence?: number;
  tabId?: number;
}>;

export function createDiagnostics(options: { enabled?: boolean; capacity?: number } = {}) {
  const enabled = options.enabled ?? false;
  const capacity = options.capacity ?? 100;
  if (enabled && (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000)) {
    throw new RangeError('Diagnostic capacity must be an integer between 1 and 1000');
  }
  const events: DiagnosticEvent[] = [];

  return {
    record(event: DiagnosticEvent): void {
      if (!enabled) return;
      const { code } = event;
      if (code !== 'worker-started' && code !== 'navigation-observed'
        && code !== 'configuration-unavailable' && code !== 'operation-failed') return;

      events.push(Object.freeze({
        code,
        ...(typeof event.sequence === 'number' && Number.isFinite(event.sequence) ? { sequence: event.sequence } : {}),
        ...(typeof event.tabId === 'number' && Number.isFinite(event.tabId) ? { tabId: event.tabId } : {}),
      }));
      if (events.length > capacity) events.shift();
    },
    snapshot(): readonly DiagnosticEvent[] {
      return events.slice();
    },
  };
}
