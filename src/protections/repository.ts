import { parseProtections, sameProtections, type ProtectionValue, type ProtectionState } from './state';
export interface ProtectionStorage {
  read(): Promise<unknown>;
  write(value: ProtectionValue): Promise<void>;
  subscribe(listener: (newValue: unknown) => void): () => void;
}
/** One worker writer; reads and external changes invalidate synchronously. */
export function createProtectionRepository(storage: ProtectionStorage) {
  const listeners = new Set<() => void>();
  const publications = new Set<() => void>();
  let revision = 0; let disposed = false;
  let latest: Readonly<{ revision: number; state: ProtectionState }> | undefined;
  let ownedEcho: ProtectionValue | undefined;
  function start(): number { ++revision; if (!disposed) for (const listener of listeners) listener(); return revision; }
  function publish(operation: number, state: ProtectionState): ProtectionState {
    if (!disposed && (!latest || operation >= latest.revision)) { latest = Object.freeze({ revision: operation, state }); if (operation === revision) for (const listener of publications) listener(); }
    return state;
  }
  async function read(): Promise<ProtectionState> {
    try { return parseProtections(await storage.read()); } catch { return Object.freeze({ kind: 'unavailable' }); }
  }
  async function load(): Promise<ProtectionState> { const operation = start(); return publish(operation, await read()); }
  async function save(raw: unknown): Promise<ProtectionState> {
    const parsed = parseProtections(raw);
    if (parsed.kind !== 'ready') return parsed;
    const operation = start();
    try {
      // Consume one exact self echo, never a window of arbitrary storage changes.
      ownedEcho = parsed.value;
      await storage.write(parsed.value);
      const verified = await read();
      if (verified.kind !== 'ready' || !sameProtections(verified.value, parsed.value)) return publish(operation, Object.freeze({ kind: 'unavailable' }));
      return publish(operation, verified);
    } catch { ownedEcho = undefined; return publish(operation, Object.freeze({ kind: 'unavailable' })); }
  }
  const detach = storage.subscribe(raw => {
    const parsed = parseProtections(raw);
    if (ownedEcho && parsed.kind === 'ready' && sameProtections(ownedEcho, parsed.value)) { ownedEcho = undefined; return; }
    ownedEcho = undefined;
    void load();
  });
  return {
    load, save,
    getLastKnown() { return latest; },
    subscribe(listener: () => void): () => void { publications.add(listener); return () => { publications.delete(listener); }; },
    getCurrent() { return !disposed && latest?.revision === revision ? latest : undefined; },
    subscribeInvalidation(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose(): void { disposed = true; ++revision; detach(); listeners.clear(); publications.clear(); }
  };
}
