import type { ProtectedIdentity } from '../planning/protections';
import { parseConfig, type Config } from '../config/schema';

export type ControlVersion = Readonly<{ workerId: string; revision: number }>;
export type TargetHint = Readonly<{ tabId: number; windowId: number; incognito: boolean }>;
export type TargetSnapshot = Readonly<{ receipt: TabReceipt; audible: boolean; pinned: boolean }>;
export type TabReceipt = Readonly<{ tabId: number; windowId: number; incognito: boolean; documentId: string }>;
export type { ProtectedIdentity };
export type RuleLists = Readonly<Pick<Config, 'groupingRules' | 'duplicateRules'>>;
export type ControlCommand =
  | Readonly<{ kind: 'get-status'; target?: TargetHint }>
  | Readonly<{ kind: 'set-enabled'; expected: ControlVersion; enabled: boolean }>
  | Readonly<{ kind: 'set-tab-protected'; expected: ControlVersion; target: TabReceipt; protected: boolean }>
  | Readonly<{ kind: 'save-rules'; expected: ControlVersion; baseRules: RuleLists; rules: RuleLists }>;
export type ControlStatus = Readonly<{
  version: ControlVersion;
  phase: 'checking' | 'active' | 'paused' | 'unavailable' | 'blocked';
  savedEnabled: boolean | null;
  target?: TargetSnapshot & Readonly<{ protected: boolean }>;
}>;
export type ControlReply = Readonly<{ kind: 'ok' | 'invalid' | 'conflict' | 'unavailable'; status: ControlStatus }>;
export type ControlCapture = Readonly<{
  generation: number; configRevision: number; config: Config; protectedTabs: readonly ProtectedIdentity[];
}>;

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/\p{Cc}/u.test(value);
}
function integer(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}
function version(value: unknown): value is ControlVersion {
  return exact(value, ['workerId', 'revision']) && text(value.workerId) && integer(value.revision);
}
export function isTargetHint(value: unknown): value is TargetHint {
  return exact(value, ['tabId', 'windowId', 'incognito']) && integer(value.tabId, 2147483647) &&
    integer(value.windowId, 2147483647) && typeof value.incognito === 'boolean';
}
export function isTabReceipt(value: unknown): value is TabReceipt {
  return exact(value, ['tabId', 'windowId', 'incognito', 'documentId']) && integer(value.tabId, 2147483647) &&
    integer(value.windowId, 2147483647) && typeof value.incognito === 'boolean' && text(value.documentId);
}
export function ruleLists(config: RuleLists): RuleLists {
  return Object.freeze({ groupingRules: config.groupingRules, duplicateRules: config.duplicateRules });
}
export function sameRules(a: RuleLists, b: RuleLists): boolean {
  return a.groupingRules.length === b.groupingRules.length && a.groupingRules.every((rule, index) => {
    const other = b.groupingRules[index]!;
    return rule.enabled === other.enabled && rule.pattern === other.pattern && rule.group === other.group;
  }) && a.duplicateRules.length === b.duplicateRules.length && a.duplicateRules.every((rule, index) => {
    const other = b.duplicateRules[index]!;
    return rule.enabled === other.enabled && rule.origin === other.origin && rule.ignoreFragment === other.ignoreFragment &&
      rule.ignoreTrailingSlash === other.ignoreTrailingSlash && rule.sortQueryParameters === other.sortQueryParameters &&
      rule.ignoreQueryParameters.length === other.ignoreQueryParameters.length &&
      rule.ignoreQueryParameters.every((name, i) => name === other.ignoreQueryParameters[i]);
  });
}
function parseRules(value: unknown): RuleLists | undefined {
  if (!exact(value, ['groupingRules', 'duplicateRules'])) return;
  const parsed = parseConfig({ schemaVersion: 4, enabled: false, ...value });
  return parsed.kind === 'ready' ? ruleLists(parsed.config) : undefined;
}
export function parseControlCommand(raw: unknown): ControlCommand | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const value = raw as Record<string, unknown>;
  if (value.kind === 'get-status') {
    if (Object.hasOwn(value, 'kind') && Reflect.ownKeys(value).length === 1) return Object.freeze({ kind: 'get-status' });
    return exact(value, ['kind', 'target']) && isTargetHint(value.target)
      ? Object.freeze({ kind: 'get-status', target: Object.freeze({ ...value.target }) }) : undefined;
  }
  if (!('expected' in value) || !version(value.expected)) return;
  const expected = Object.freeze({ ...value.expected });
  switch (value.kind) {
    case 'set-enabled': return exact(value, ['kind', 'expected', 'enabled']) && typeof value.enabled === 'boolean'
      ? Object.freeze({ kind: 'set-enabled', expected, enabled: value.enabled }) : undefined;
    case 'set-tab-protected': return exact(value, ['kind', 'expected', 'target', 'protected']) &&
      isTabReceipt(value.target) && typeof value.protected === 'boolean'
      ? Object.freeze({ kind: 'set-tab-protected', expected, target: Object.freeze({ ...value.target }), protected: value.protected }) : undefined;
    case 'save-rules': {
      if (!exact(value, ['kind', 'expected', 'baseRules', 'rules'])) return;
      const baseRules = parseRules(value.baseRules); const rules = parseRules(value.rules);
      return baseRules && rules ? Object.freeze({ kind: 'save-rules', expected, baseRules, rules }) : undefined;
    }
  }
}
export function isControlReply(value: unknown): value is ControlReply {
  if (!exact(value, ['kind', 'status']) || !['ok', 'invalid', 'conflict', 'unavailable'].includes(value.kind as string)) return false;
  const status = value.status;
  if (!exact(status, status && typeof status === 'object' && 'target' in status
    ? ['version', 'phase', 'savedEnabled', 'target'] : ['version', 'phase', 'savedEnabled'])) return false;
  return version(status.version) && ['checking', 'active', 'paused', 'unavailable', 'blocked'].includes(status.phase as string) &&
    (status.savedEnabled === null || typeof status.savedEnabled === 'boolean') &&
    (!Object.hasOwn(status, 'target') || exact(status.target, ['receipt', 'protected', 'audible', 'pinned']) &&
      isTabReceipt(status.target.receipt) && typeof status.target.protected === 'boolean' &&
      typeof status.target.audible === 'boolean' && typeof status.target.pinned === 'boolean');
}
