import type { ProtectedIdentity } from '../planning/protections';
export type ProtectionValue = Readonly<{ version: 1; tabs: readonly ProtectedIdentity[] }>;
export type ProtectionState = Readonly<{ kind: 'ready'; value: ProtectionValue }> | Readonly<{ kind: 'unavailable' }>;
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function parseProtections(raw: unknown): ProtectionState {
  const unavailable = Object.freeze({ kind: 'unavailable' as const });
  if (raw === undefined) raw = { version: 1, tabs: [] };
  if (!exact(raw, ['version', 'tabs']) || raw.version !== 1 || !Array.isArray(raw.tabs) || raw.tabs.length > 1000) return unavailable;
  const ids = new Set<number>(); const tabs: ProtectedIdentity[] = [];
  for (const entry of raw.tabs) {
    if (!exact(entry, ['tabId', 'incognito']) || typeof entry.tabId !== 'number' || !Number.isSafeInteger(entry.tabId)
      || entry.tabId < 0 || entry.tabId > 2147483647 || typeof entry.incognito !== 'boolean' || ids.has(entry.tabId)) return unavailable;
    ids.add(entry.tabId); tabs.push(Object.freeze({ tabId: entry.tabId, incognito: entry.incognito }));
  }
  return Object.freeze({ kind: 'ready', value: Object.freeze({ version: 1, tabs: Object.freeze(tabs) }) });
}
export { isProtected } from '../planning/protections';
export function sameProtections(a: ProtectionValue, b: ProtectionValue): boolean {
  return a.tabs.length === b.tabs.length && a.tabs.every((tab, index) => tab.tabId === b.tabs[index]!.tabId && tab.incognito === b.tabs[index]!.incognito);
}
