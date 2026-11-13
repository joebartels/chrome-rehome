export const RECENT_TABS_KEY = 'chromeReHomeRecentTabs';
export const RECENT_TAB_LIMIT = 32;

export type RecentTabIds = { normal: number[]; incognito: number[] };

export function isRecentTabId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<number>();
  for (const candidate of value) {
    if (isRecentTabId(candidate)) ids.add(candidate);
    if (ids.size === RECENT_TAB_LIMIT) break;
  }
  return [...ids];
}

export function parseRecentTabIds(value: unknown): RecentTabIds {
  const record = value && typeof value === 'object' ? value as Partial<RecentTabIds> : undefined;
  return { normal: parseIds(record?.normal), incognito: parseIds(record?.incognito) };
}
