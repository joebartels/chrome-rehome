export type Config = Readonly<{ schemaVersion: 1; enabled: boolean }>;

export type ConfigState =
  | { kind: 'ready'; config: Config }
  | { kind: 'unavailable'; reason: 'invalid' | 'future-version' | 'storage'; message: string };

function invalid(): ConfigState {
  return { kind: 'unavailable', reason: 'invalid', message: 'Stored configuration is invalid.' };
}

function parseVersion1(raw: Record<string, unknown>): ConfigState {
  if (
    Reflect.ownKeys(raw).length !== 2 ||
    !Object.hasOwn(raw, 'schemaVersion') ||
    !Object.hasOwn(raw, 'enabled') ||
    typeof raw.enabled !== 'boolean'
  ) return invalid();

  return { kind: 'ready', config: Object.freeze({ schemaVersion: 1, enabled: raw.enabled }) };
}

// Dispatch real schema versions here; add migrations only when a schema changes.
export function parseConfig(raw: unknown): ConfigState {
  if (raw === undefined) {
    return { kind: 'ready', config: Object.freeze({ schemaVersion: 1, enabled: false }) };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return invalid();

  const value = raw as Record<string, unknown>;
  const version = value.schemaVersion;
  if (typeof version !== 'number' || !Number.isSafeInteger(version)) return invalid();
  if (version > 1) {
    return { kind: 'unavailable', reason: 'future-version', message: 'Stored configuration requires a newer extension version.' };
  }
  switch (version) {
    case 1: return parseVersion1(value);
    default: return invalid();
  }
}
