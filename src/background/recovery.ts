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
            const snapshot = await port.read();
            // Presence is an observation only; matching document/tab IDs never authorize replay.
            const liveIds = new Set(snapshot.tabs.map(tab => tab.id));
            record.value.participants.map(participant => liveIds.has(participant.tabId));
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
