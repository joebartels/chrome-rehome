import { parseConfig, type Config, type ConfigState } from './schema';

export interface ConfigStorage {
  read(): Promise<unknown>;
  write(value: Config): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export function createConfigRepository(storage: ConfigStorage) {
  const listeners = new Set<(state: ConfigState) => void>();
  let generation = 0;
  let disposed = false;
  let latestResult: { operation: number; state: ConfigState } | undefined;

  function publish(state: ConfigState, operation: number): ConfigState {
    if (latestResult && operation < latestResult.operation) return latestResult.state;
    latestResult = { operation, state };
    if (!disposed && operation === generation) {
      for (const listener of listeners) listener(state);
    }
    return state;
  }

  function storageFailure(): ConfigState {
    return { kind: 'unavailable', reason: 'storage', message: 'Configuration storage is unavailable.' };
  }

  async function load(): Promise<ConfigState> {
    const operation = ++generation;
    let state: ConfigState;
    try {
      state = parseConfig(await storage.read());
    } catch {
      state = storageFailure();
    }
    return publish(state, operation);
  }

  async function save(raw: unknown): Promise<ConfigState> {
    const state = parseConfig(raw);
    if (state.kind === 'unavailable') return state;
    const operation = ++generation;
    try {
      await storage.write(state.config);
    } catch {
      return publish(storageFailure(), operation);
    }
    return publish(state, operation);
  }

  // Attach before the first asynchronous read so startup changes cannot be missed.
  const detach = storage.subscribe(() => { void load(); });

  return {
    load,
    save,
    subscribe(listener: (state: ConfigState) => void): () => void {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      ++generation;
      detach();
      listeners.clear();
    },
  };
}
