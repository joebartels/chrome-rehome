import { compileDuplicateRules, type DuplicateRule } from '../rules/duplicates';
import { compileGroupingRules, type GroupingRule } from '../rules/grouping';

export type ConfigGroupingRule = GroupingRule & Readonly<{ enabled: boolean }>;
export type ConfigDuplicateRule = DuplicateRule & Readonly<{ enabled: boolean }>;
export type Config = Readonly<{ schemaVersion: 4; enabled: boolean; groupingRules: readonly ConfigGroupingRule[]; duplicateRules: readonly ConfigDuplicateRule[] }>;

export type ConfigState =
  | { kind: 'ready'; config: Config }
  | { kind: 'unavailable'; reason: 'invalid' | 'future-version' | 'storage'; message: string };

function invalid(message = 'Stored configuration is invalid.'): ConfigState {
  return { kind: 'unavailable', reason: 'invalid', message };
}

function ready(enabled: boolean, groupingRules: readonly GroupingRule[], duplicateRules: readonly DuplicateRule[] = Object.freeze([])): ConfigState {
  return { kind: 'ready', config: Object.freeze({ schemaVersion: 4, enabled,
    groupingRules: Object.freeze(groupingRules.map(rule => Object.freeze({ ...rule, enabled: rule.enabled ?? true }))),
    duplicateRules: Object.freeze(duplicateRules.map(rule => Object.freeze({ ...rule, enabled: rule.enabled ?? true }))) }) };
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

function parseRulesVersion(raw: Record<string, unknown>, version: 2 | 3 | 4): ConfigState {
  if (Reflect.ownKeys(raw).length !== (version === 2 ? 3 : 4) || !Object.hasOwn(raw, 'schemaVersion') ||
    !Object.hasOwn(raw, 'enabled') || !Object.hasOwn(raw, 'groupingRules') || (version >= 3 && !Object.hasOwn(raw, 'duplicateRules')) || typeof raw.enabled !== 'boolean') return invalid();
  // Schema versions own strict rule shapes; direct compilers also accept legacy callers.
  for (const [list, keys] of [[raw.groupingRules, ['pattern', 'group']], [version === 2 ? [] : raw.duplicateRules, ['origin', 'ignoreQueryParameters', 'ignoreFragment', 'ignoreTrailingSlash', 'sortQueryParameters']]] as const) {
    if (!Array.isArray(list)) return invalid();
    const required = version === 4 ? [...keys, 'enabled'] : keys;
    if (!list.every((rule: unknown) => rule !== null && typeof rule === 'object' && !Array.isArray(rule) &&
      Reflect.ownKeys(rule).length === required.length && required.every(key => Object.hasOwn(rule, key)) &&
      (version !== 4 || typeof (rule as Record<string, unknown>).enabled === 'boolean'))) return invalid();
  }
  const compiled = compileGroupingRules(raw.groupingRules);
  if (compiled.kind === 'invalid') {
    const location = compiled.ruleIndex === undefined ? '' : ` at rule ${compiled.ruleIndex + 1}`;
    return invalid(`Stored configuration is invalid${location}: ${compiled.message}`);
  }
  const duplicates = compileDuplicateRules(version === 2 ? [] : raw.duplicateRules);
  if (duplicates.kind === 'invalid') {
    const location = duplicates.ruleIndex === undefined ? '' : ` at duplicate rule ${duplicates.ruleIndex + 1}`;
    return invalid(`Stored configuration is invalid${location}: ${duplicates.message}`);
  }
  return ready(raw.enabled, compiled.rules, duplicates.rules);
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
  if (version > 4) {
    return { kind: 'unavailable', reason: 'future-version', message: 'Stored configuration requires a newer extension version.' };
  }
  switch (version) {
    case 1: return parseVersion1(value);
    case 2: return parseRulesVersion(value, 2);
    case 3: return parseRulesVersion(value, 3);
    case 4: return parseRulesVersion(value, 4);
    default: return invalid();
  }
}
