import { compileGroupingRules, type GroupingRule } from '../rules/grouping';

export type Config = Readonly<{ schemaVersion: 2; enabled: boolean; groupingRules: readonly GroupingRule[] }>;

export type ConfigState =
  | { kind: 'ready'; config: Config }
  | { kind: 'unavailable'; reason: 'invalid' | 'future-version' | 'storage'; message: string };

function invalid(message = 'Stored configuration is invalid.'): ConfigState {
  return { kind: 'unavailable', reason: 'invalid', message };
}

function ready(enabled: boolean, groupingRules: readonly GroupingRule[]): ConfigState {
  return { kind: 'ready', config: Object.freeze({ schemaVersion: 2, enabled, groupingRules }) };
}

function parseVersion1(raw: Record<string, unknown>): ConfigState {
  if (
    Reflect.ownKeys(raw).length !== 2 ||
    !Object.hasOwn(raw, 'schemaVersion') ||
    !Object.hasOwn(raw, 'enabled') ||
    typeof raw.enabled !== 'boolean'
  ) return invalid();

  return ready(raw.enabled, Object.freeze([]));
}

function parseVersion2(raw: Record<string, unknown>): ConfigState {
  if (Reflect.ownKeys(raw).length !== 3 || !Object.hasOwn(raw, 'schemaVersion') ||
    !Object.hasOwn(raw, 'enabled') || !Object.hasOwn(raw, 'groupingRules') || typeof raw.enabled !== 'boolean') return invalid();
  const compiled = compileGroupingRules(raw.groupingRules);
  if (compiled.kind === 'invalid') {
    const location = compiled.ruleIndex === undefined ? '' : ` at rule ${compiled.ruleIndex + 1}`;
    return invalid(`Stored configuration is invalid${location}: ${compiled.message}`);
  }
  return ready(raw.enabled, compiled.rules);
}

// Migrations are in memory only; the repository writes only on explicit save.
export function parseConfig(raw: unknown): ConfigState {
  if (raw === undefined) {
    return ready(false, Object.freeze([]));
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return invalid();

  const value = raw as Record<string, unknown>;
  const version = value.schemaVersion;
  if (typeof version !== 'number' || !Number.isSafeInteger(version)) return invalid();
  if (version > 2) {
    return { kind: 'unavailable', reason: 'future-version', message: 'Stored configuration requires a newer extension version.' };
  }
  switch (version) {
    case 1: return parseVersion1(value);
    case 2: return parseVersion2(value);
    default: return invalid();
  }
}
