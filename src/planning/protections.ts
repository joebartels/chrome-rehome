export type ProtectedIdentity = Readonly<{ tabId: number; incognito: boolean }>;
export function isProtected(tab: Readonly<{ id: number; incognito: boolean }>, protectedTabs: readonly ProtectedIdentity[]): boolean {
  return protectedTabs.some(identity => identity.tabId === tab.id && identity.incognito === tab.incognito);
}
