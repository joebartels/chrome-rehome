// Test-only admission and recovery observations; never bundled into dist.
export type Attention = { focusedWindowId: number | null; activeTabs: readonly { windowId: number; tabId: number }[] } | undefined;
export type Incoming = { tabId: number; url: string; documentId?: string; kind: string };
export type Foreground = { windowId: number; tabId: number; url: string; previousDocumentId: string };
export type Admission = { token: string; incoming: Incoming; attention: Attention; timestamp: number; mismatch: boolean };
export function observeAdmission(token: string, expected: Foreground | undefined, incoming: Incoming, attention: Attention, firstRead: boolean): Admission | undefined {
  if (!firstRead || !expected || incoming.tabId !== expected.tabId || incoming.url !== expected.url
    || !incoming.documentId || incoming.documentId === expected.previousDocumentId || incoming.kind !== 'committed') return;
  return { token, incoming, attention, timestamp: Date.now(), mismatch: attention?.focusedWindowId !== expected.windowId
    || attention.activeTabs.find(tab => tab.windowId === expected.windowId)?.tabId !== expected.tabId };
}
export function gateOutcome(token: string, reached: {token: string} | undefined, admission: Admission | undefined): boolean {
  if (admission?.token === token && admission.mismatch) throw Error('Native setup/attention-contract failure: ' + JSON.stringify(admission));
  return reached?.token === token;
}
export type Completion = { realm: string; initialized: boolean; handled: Incoming[] };
export function recoveryHandled(oldRealm: string, expected: Incoming, completion: Completion): boolean {
  return completion.realm !== oldRealm && completion.initialized && !!expected.documentId && completion.handled.some(event =>
    event.kind === 'committed' && event.tabId === expected.tabId && event.url === expected.url && event.documentId === expected.documentId);
}

export function phaseBelongsToAdmission(token: string, incoming: Incoming | undefined, admission: Admission | undefined): boolean {
  return admission?.token === token && !!incoming && incoming.tabId === admission.incoming.tabId
    && incoming.url === admission.incoming.url && incoming.documentId === admission.incoming.documentId
    && incoming.kind === admission.incoming.kind;
}
