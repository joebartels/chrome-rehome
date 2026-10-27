import type { CandidateNavigation, NavigationToken, NavigationView } from '../planning/candidates';

export type NavigationKind = 'committed' | 'history' | 'fragment';
export type NavigationInput = {
  tabId: number; frameId: number; url: string; timeStamp: number; documentId?: string; kind: NavigationKind;
  transitionType?: string; transitionQualifiers?: readonly string[]; documentLifecycle?: string; frameType?: string;
};
export type Navigation = CandidateNavigation & Readonly<{ kind: NavigationKind; browserTimeStamp: number }>;

type Provenance = { documentId: string; href: string };
type TabState = { fingerprint?: NavigationInput; provenance?: Provenance; navigation?: Navigation; blocked: boolean };
const admitted = new Set(['link', 'typed', 'auto_bookmark', 'generated', 'form_submit', 'keyword', 'keyword_generated']);
const known = new Set([...admitted, 'reload', 'start_page', 'auto_subframe', 'manual_subframe']);
const qualifiers = new Set(['client_redirect', 'server_redirect', 'forward_back', 'from_address_bar']);

function nativeHref(value: string): string | undefined {
  if (typeof value !== 'string' || /[\\\s\p{Cc}]/u.test(value) || !/^https?:\/\/[^/]/i.test(value)) return;
  try {
    const url = new URL(value);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password) return url.href;
  } catch { /* Malformed navigation invalidates work. */ }
  return;
}
function validId(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }
function fingerprint(input: NavigationInput): NavigationInput {
  return { ...input, ...(Array.isArray(input.transitionQualifiers) ? { transitionQualifiers: [...input.transitionQualifiers] } : {}) };
}
function repeated(left: NavigationInput | undefined, right: NavigationInput): boolean {
  if (!left) return false;
  const fields = ['tabId', 'frameId', 'url', 'timeStamp', 'documentId', 'kind', 'transitionType', 'documentLifecycle', 'frameType'] as const;
  if (!fields.every((field) => Object.is(left[field], right[field]))) return false;
  const a = left.transitionQualifiers;
  const b = right.transitionQualifiers;
  return Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
    : Object.is(a, b);
}

export function createNavigationTracker() {
  const epoch = Symbol();
  const states = new Map<number, TabState>();
  let revision = 0;
  let generation = 0;
  let observedSequence = 0;
  let exhausted = false;
  type RemovalLease = { expectedRevision: number; disposed: boolean; allowed: Set<number>; issued: Set<number>; armed: Set<number> };
  const removalLeases = new Set<RemovalLease>();
  function leaseCurrent(lease: RemovalLease): boolean {
    return !exhausted && !lease.disposed && lease.expectedRevision === revision;
  }
  function advance(): boolean {
    if (exhausted || revision === Number.MAX_SAFE_INTEGER || generation === Number.MAX_SAFE_INTEGER
      || observedSequence === Number.MAX_SAFE_INTEGER) {
      exhausted = true;
      states.clear();
      return false;
    }
    ++revision;
    ++generation;
    return true;
  }
  function invalidate(tabId: number): void {
    if (!validId(tabId) || !advance()) return;
    const previous = states.get(tabId);
    states.set(tabId, { blocked: true, ...(previous?.provenance ? { provenance: previous.provenance } : {}) });
  }
  function forget(tabId: number, creditRemoval = true): void {
    if (!validId(tabId)) return;
    const credited = creditRemoval ? [...removalLeases].filter(lease => leaseCurrent(lease) && lease.issued.has(tabId)) : [];
    if (!advance()) return;
    states.delete(tabId);
    for (const lease of credited) {
      lease.issued.delete(tabId);
      ++lease.expectedRevision;
    }
  }
  return {
    observe(input: NavigationInput): Navigation | undefined {
      if (input.frameId !== 0 || !validId(input.tabId)) return;
      const previous = states.get(input.tabId);
      if (repeated(previous?.fingerprint, input) || !advance()) return;
      const state: TabState = { fingerprint: fingerprint(input), blocked: previous?.blocked ?? false,
        ...(previous?.provenance ? { provenance: previous.provenance } : {}) };
      states.set(input.tabId, state);
      const href = nativeHref(input.url);
      const metadata = href !== undefined && Number.isFinite(input.timeStamp)
        && typeof input.documentId === 'string' && input.documentId.length > 0
        && input.documentLifecycle === 'active' && (input.frameType === undefined || input.frameType === 'outermost_frame')
        && typeof input.transitionType === 'string' && known.has(input.transitionType)
        && Array.isArray(input.transitionQualifiers) && [...input.transitionQualifiers].every((value) => qualifiers.has(value));
      if (!metadata || !['committed', 'history', 'fragment'].includes(input.kind)) {
        delete state.provenance;
        state.blocked = true;
        return;
      }
      const eligible = admitted.has(input.transitionType!)
        && (!input.transitionQualifiers!.includes('client_redirect') || previous?.provenance !== undefined);
      if (input.kind === 'committed') {
        state.blocked = false;
        delete state.provenance;
        if (!eligible) return;
        state.provenance = { documentId: input.documentId!, href: href! };
      } else {
        if (!eligible || state.blocked || !state.provenance || state.provenance.documentId !== input.documentId) return;
        if (state.provenance.href === href) return;
        state.provenance = { documentId: input.documentId!, href: href! };
      }
      const navigation: Navigation = Object.freeze({ epoch, tabId: input.tabId, generation, url: input.url,
        documentId: input.documentId!, kind: input.kind, observedSequence: ++observedSequence, browserTimeStamp: input.timeStamp });
      state.navigation = navigation;
      return navigation;
    },
    invalidate,
    forget(tabId: number): void { forget(tabId); },
    createRemovalLease(view: NavigationView, allowedDuplicateIds: readonly number[]) {
      const lease: RemovalLease = { expectedRevision: view.revision,
        disposed: exhausted || view.epoch !== epoch || view.revision !== revision,
        allowed: new Set(allowedDuplicateIds), issued: new Set(), armed: new Set() };
      removalLeases.add(lease);
      return {
        isCurrent(): boolean { return leaseCurrent(lease); },
        expectRemoval(tabId: number): void {
          if (!leaseCurrent(lease) || !lease.allowed.has(tabId) || lease.armed.has(tabId)) throw new Error('Invalid removal lease.');
          lease.armed.add(tabId);
          lease.issued.add(tabId);
        },
        dispose(): void { lease.disposed = true; removalLeases.delete(lease); }
      };
    },
    replace(addedTabId: number, removedTabId: number): void {
      // Replacement events are never creditable native removal feedback.
      forget(removedTabId, false);
      forget(addedTabId, false);
      invalidate(addedTabId);
    },
    isCurrent(event: NavigationToken): boolean {
      return !exhausted && event.epoch === epoch && states.get(event.tabId)?.navigation?.generation === event.generation;
    },
    view(): NavigationView {
      return Object.freeze({ epoch, revision,
        navigations: Object.freeze([...states.values()].flatMap((state) => state.navigation ? [state.navigation] : [])),
        blockedTabIds: Object.freeze([...states].flatMap(([tabId, state]) => state.blocked ? [tabId] : [])) });
    },
    isViewCurrent(view: Pick<NavigationView, 'epoch' | 'revision'>): boolean {
      return !exhausted && view.epoch === epoch && view.revision === revision;
    },
  };
}
