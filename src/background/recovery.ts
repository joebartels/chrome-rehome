import type { PlacementPort } from '../execution/placement';
import type { createReplacementJournal } from '../execution/journal';

export function createRecovery({ journal, port }: {
  journal: ReturnType<typeof createReplacementJournal>;
  port: Pick<PlacementPort, 'read'>;
}) {
  let ready = false;
  let initialization: Promise<void> | undefined;
  return {
    initialize(): Promise<void> {
      initialization ??= (async () => {
        try {
          const record = await journal.load();
          if (record.kind === 'invalid' || record.kind === 'valid' && record.value.pending !== null) return;
          if (record.kind === 'valid') {
            // Snapshot success is the read-only reconciliation gate before clear.
            // Participant presence never authorizes replay.
            await port.read();
            await journal.clear();
          }
          ready = !journal.isBlocked();
        } catch { /* Failed read/reconciliation keeps admission closed for this worker. */ }
      })();
      return initialization;
    },
    isReady(): boolean { return ready && !journal.isBlocked(); }
  };
}
