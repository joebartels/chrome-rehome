import { describe, expect, it } from 'vitest';
import { createNavigationTracker, type NavigationInput } from '../../src/background/navigation';

function input(overrides: Partial<NavigationInput> = {}): NavigationInput {
  return { tabId: 7, frameId: 0, url: 'https://example.com/path?query=one#section',
    timeStamp: 100, documentId: 'document-one', kind: 'committed', transitionType: 'link',
    transitionQualifiers: [], documentLifecycle: 'active', frameType: 'outermost_frame', ...overrides };
}

describe('navigation eligibility and runtime ownership', () => {
  it.each(['link', 'typed', 'auto_bookmark', 'generated', 'form_submit', 'keyword', 'keyword_generated', 'start_page'])
  ('admits cold active %s commits and retains actual URL bytes', (transitionType) => {
    const tracker = createNavigationTracker();
    const event = tracker.observe(input({ transitionType, url: 'http://EXAMPLE.com:80/path?q=%2f#hash' }))!;
    expect(event).toMatchObject({ tabId: 7, url: 'http://EXAMPLE.com:80/path?q=%2f#hash',
      documentId: 'document-one', kind: 'committed', observedSequence: 1, generation: 1, browserTimeStamp: 100 });
    expect(tracker.isCurrent(event)).toBe(true);
    expect(event.epoch).toBe(tracker.view().epoch);
    expect(Object.isFrozen(event)).toBe(true);
  });

  it.each([
    { transitionType: 'reload', transitionQualifiers: ['from_address_bar'] },
    { transitionType: undefined }, { transitionType: 'invented' },
    { transitionType: 'auto_subframe' }, { transitionType: 'manual_subframe' },
    { transitionQualifiers: undefined }, { transitionQualifiers: ['unknown'] },
    { transitionQualifiers: Array<string>(1) },
    { transitionQualifiers: 'forward_back' }, { documentId: undefined }, { documentId: '' },
    { documentLifecycle: undefined }, { documentLifecycle: 'prerender' },
    { documentLifecycle: 'cached' }, { documentLifecycle: 'pending_deletion' },
    { frameType: 'sub_frame' }, { timeStamp: Number.NaN },
  ] as Partial<NavigationInput>[])
  ('revokes earlier work without eligibility for %j', (change) => {
    const tracker = createNavigationTracker();
    const first = tracker.observe(input())!;
    const view = tracker.view();
    expect(tracker.observe(input({ timeStamp: 101, ...change }))).toBeUndefined();
    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.isViewCurrent(view)).toBe(false);
    expect(tracker.observe(input({ kind: 'history', url: 'https://example.com/later', timeStamp: 102 }))).toBeUndefined();
  });

  it('sparse qualifier metadata revokes synchronously, blocks the tab and clears all provenance', () => {
    const tracker = createNavigationTracker();
    const first = tracker.observe(input())!;
    const view = tracker.view();
    expect(tracker.observe(input({ timeStamp: 101, transitionQualifiers: Array<string>(1) }))).toBeUndefined();
    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.isViewCurrent(view)).toBe(false);
    expect(tracker.view().navigations).toEqual([]);
    expect(tracker.view().blockedTabIds).toEqual([7]);
    expect(tracker.observe(input({ kind: 'history', timeStamp: 102, url: 'https://example.com/spa' }))).toBeUndefined();
    expect(tracker.observe(input({ kind: 'fragment', timeStamp: 103, url: 'https://example.com/spa#hash' }))).toBeUndefined();
    tracker.invalidate(7);
    expect(tracker.observe(input({ timeStamp: 104, documentId: 'redirected', url: 'https://example.com/redirected',
      transitionQualifiers: ['client_redirect'] }))).toBeUndefined();
    expect(tracker.view().navigations).toEqual([]);
  });

  it.each(['chrome://settings', 'about:blank', 'file:///tmp/page.html', 'not a URL', 'https://',
    'https://user:secret@example.com/', ' https://example.com/', 'https://example.com/white space',
    'https://example.com/\\path', 'https://example.com/\npath'])
  ('blocks malformed or nonHTTP main-frame URL %j', (url) => {
    const tracker = createNavigationTracker();
    const first = tracker.observe(input())!;
    expect(tracker.observe(input({ url, timeStamp: 200 }))).toBeUndefined();
    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.view().blockedTabIds).toContain(7);
    expect(tracker.observe(input({ timeStamp: 201 }))!.generation).toBe(3);
  });

  it('subframes cannot revoke main-frame work', () => {
    const tracker = createNavigationTracker();
    const event = tracker.observe(input())!;
    const view = tracker.view();
    expect(tracker.observe(input({ frameId: 2, url: 'chrome://settings', timeStamp: 101 }))).toBeUndefined();
    expect(tracker.isCurrent(event)).toBe(true);
    expect(tracker.isViewCurrent(view)).toBe(true);
  });

  it('uses observation order and deduplicates the complete latest fingerprint', () => {
    const tracker = createNavigationTracker();
    const first = tracker.observe(input())!;
    const view = tracker.view();
    expect(tracker.observe(input())).toBeUndefined();
    expect(tracker.isViewCurrent(view)).toBe(true);
    const next = tracker.observe(input({ timeStamp: 50, transitionQualifiers: ['forward_back'] }))!;
    expect(next.observedSequence).toBe(2);
    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.observe(input())!.observedSequence).toBe(3);
  });

  it('server redirects use only the final committed URL', () => {
    const tracker = createNavigationTracker();
    tracker.invalidate(7);
    expect(tracker.view().navigations).toEqual([]);
    expect(tracker.observe(input({ url: 'https://example.com/final', transitionQualifiers: ['server_redirect'] })))
      .toMatchObject({ url: 'https://example.com/final' });
    expect(tracker.view().blockedTabIds).toEqual([]);
  });

  it('start_page redirects preserve final identity and provenance gates', () => {
    const tracker = createNavigationTracker();
    expect(tracker.observe(input({ transitionType: 'start_page', transitionQualifiers: ['client_redirect'] }))).toBeUndefined();
    const committed = tracker.observe(input({ transitionType: 'start_page', timeStamp: 101 }))!;
    expect(committed).toBeDefined();
    expect(committed.url).toBe('https://example.com/path?query=one#section');
    expect(tracker.isCurrent(committed)).toBe(true);
    tracker.invalidate(7);
    expect(tracker.observe(input({ transitionType: 'start_page', timeStamp: 102, documentId: 'final',
      url: 'https://example.com/final', transitionQualifiers: ['client_redirect'] }))).toMatchObject({ url: 'https://example.com/final' });
    const cold = createNavigationTracker();
    expect(cold.observe(input({ transitionType: 'start_page', url: 'https://example.com/final',
      transitionQualifiers: ['server_redirect'] }))).toMatchObject({ url: 'https://example.com/final' });
  });

  it('cold start_page history cannot bootstrap provenance', () => {
    for (const kind of ['history', 'fragment'] as const) {
      const tracker = createNavigationTracker();
      expect(tracker.observe(input({ transitionType: 'start_page', kind }))).toBeUndefined();
      expect(tracker.observe(input({ transitionType: 'start_page', kind, timeStamp: 101,
        url: 'https://example.com/changed' }))).toBeUndefined();
    }
  });

  it('reload after start_page still revokes provenance', () => {
    const tracker = createNavigationTracker();
    const event = tracker.observe(input({ transitionType: 'start_page' }))!;
    expect(event).toBeDefined();
    expect(tracker.observe(input({ transitionType: 'reload', timeStamp: 101 }))).toBeUndefined();
    expect(tracker.isCurrent(event)).toBe(false);
    for (const [index, kind] of (['history', 'fragment'] as const).entries()) {
      expect(tracker.observe(input({ transitionType: 'start_page', kind, timeStamp: 102 + index,
        url: 'https://example.com/changed#new' }))).toBeUndefined();
    }
    expect(tracker.observe(input({ transitionType: 'start_page', timeStamp: 104,
      transitionQualifiers: ['client_redirect'] }))).toBeUndefined();
  });

  it.each([{ documentId: '' }, { documentLifecycle: 'prerender' }, { transitionQualifiers: ['unknown'] }])
  ('invalid start_page metadata revokes admitted work: %j', change => {
    const tracker = createNavigationTracker();
    const event = tracker.observe(input())!;
    expect(tracker.observe(input({ transitionType: 'start_page', timeStamp: 101, ...change }))).toBeUndefined();
    expect(tracker.isCurrent(event)).toBe(false);
    expect(tracker.view().blockedTabIds).toEqual([7]);
  });

  it('requires trusted provenance for client redirects across pending navigation', () => {
    const tracker = createNavigationTracker();
    expect(tracker.observe(input({ transitionQualifiers: ['client_redirect'] }))).toBeUndefined();
    tracker.observe(input({ timeStamp: 101 }));
    tracker.invalidate(7);
    expect(tracker.observe(input({ documentId: 'redirected', timeStamp: 102,
      transitionQualifiers: ['client_redirect'] }))).toMatchObject({ documentId: 'redirected' });
    tracker.observe(input({ transitionType: 'reload', timeStamp: 103 }));
    tracker.invalidate(7);
    expect(tracker.observe(input({ timeStamp: 104, transitionQualifiers: ['client_redirect'] }))).toBeUndefined();
  });

  it('admits ordinary back-forward but never a core reload', () => {
    const tracker = createNavigationTracker();
    expect(tracker.observe(input({ transitionQualifiers: ['forward_back'] }))).toBeDefined();
    expect(tracker.observe(input({ timeStamp: 101, transitionType: 'reload', transitionQualifiers: ['forward_back'] }))).toBeUndefined();
  });

  it.each(['history', 'fragment'] as const)('requires a trusted matching document and real URL change for %s', (kind) => {
    const tracker = createNavigationTracker();
    expect(tracker.observe(input({ kind }))).toBeUndefined();
    const committed = tracker.observe(input({ timeStamp: 101 }))!;
    expect(tracker.observe(input({ kind, timeStamp: 102 }))).toBeUndefined();
    expect(tracker.isCurrent(committed)).toBe(false);
    const changed = tracker.observe(input({ kind, timeStamp: 103, url: 'https://example.com/changed' }))!;
    expect(changed).toMatchObject({ kind, observedSequence: 2 });
    expect(tracker.observe(input({ kind, documentId: 'old', timeStamp: 104, url: 'https://example.com/old' }))).toBeUndefined();
    expect(tracker.observe(input({ kind, timeStamp: 105, url: 'https://example.com/new' }))).toBeDefined();
    tracker.invalidate(7);
    expect(tracker.observe(input({ kind, timeStamp: 106, url: 'https://example.com/pending' }))).toBeUndefined();
    expect(tracker.view().blockedTabIds).toEqual([7]);
  });

  it.each(['history', 'fragment'] as const)('reloads cannot bootstrap %s provenance', (kind) => {
    const tracker = createNavigationTracker();
    tracker.observe(input({ transitionType: 'reload' }));
    expect(tracker.view().blockedTabIds).toEqual([]);
    expect(tracker.observe(input({ kind, url: 'https://example.com/changed', timeStamp: 101 }))).toBeUndefined();
  });

  it('compares native URL href for same-document changes', () => {
    const tracker = createNavigationTracker();
    tracker.observe(input({ url: 'http://EXAMPLE.com:80/' }));
    expect(tracker.observe(input({ kind: 'history', timeStamp: 101, url: 'http://example.com/' }))).toBeUndefined();
    expect(tracker.observe(input({ kind: 'history', timeStamp: 102, url: 'http://example.com/?x=1' }))).toBeDefined();
  });

  it.each(['tabs-first', 'navigation-first'])('replacement clears both identities and provenance: %s', () => {
    const tracker = createNavigationTracker();
    const removed = tracker.observe(input())!;
    const added = tracker.observe(input({ tabId: 8 }))!;
    tracker.replace(8, 7);
    tracker.replace(8, 7);
    expect(tracker.isCurrent(removed)).toBe(false);
    expect(tracker.isCurrent(added)).toBe(false);
    expect(tracker.view().blockedTabIds).toEqual([8]);
    expect(tracker.observe(input({ tabId: 8, timeStamp: 101, transitionQualifiers: ['client_redirect'] }))).toBeUndefined();
    expect(tracker.observe(input({ tabId: 8, timeStamp: 102 }))).toBeDefined();
  });

  it('epochs prevent matching numeric generations across workers and tab ID reuse', () => {
    const first = createNavigationTracker();
    const second = createNavigationTracker();
    const event = first.observe(input())!;
    const other = second.observe(input())!;
    expect(other.generation).toBe(event.generation);
    expect(second.isCurrent(event)).toBe(false);
    expect(second.isViewCurrent(first.view())).toBe(false);
    first.forget(7);
    expect(first.view().blockedTabIds).toEqual([]);
    first.observe(input());
    expect(first.isCurrent(event)).toBe(false);
  });

  it('returns detached frozen views and revokes reads when an unobserved anchor invalidates', () => {
    const tracker = createNavigationTracker();
    tracker.observe(input());
    const view = tracker.view();
    tracker.invalidate(99);
    expect(view.blockedTabIds).toEqual([]);
    expect(tracker.isViewCurrent(view)).toBe(false);
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.navigations)).toBe(true);
    expect(Object.isFrozen(view.blockedTabIds)).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])
  ('ignores invalid tab ID %s', (tabId) => {
    const tracker = createNavigationTracker();
    expect(tracker.observe(input({ tabId }))).toBeUndefined();
    expect(tracker.view().revision).toBe(0);
  });
});


describe('expected removal credits',()=>{
  it('accepts delayed issued events once while preserving winner identity',()=>{
    const tracker=createNavigationTracker();const original=tracker.view();const lease=tracker.createRemovalLease(original,[2,3]);lease.expectRemoval(2);expect(lease.isCurrent()).toBe(true);lease.expectRemoval(3);tracker.forget(2);expect(lease.isCurrent()).toBe(true);tracker.forget(3);expect(lease.isCurrent()).toBe(true);tracker.forget(2);expect(lease.isCurrent()).toBe(false);
  });
  it.each(['unexpected','beforeNavigate','replacement-removed','replacement-added','competing'])('expected removal cannot revive a stale lease after %s',reason=>{
    const tracker=createNavigationTracker();const original=tracker.view();const lease=tracker.createRemovalLease(original,[2,3]);lease.expectRemoval(2);
    if(reason==='unexpected')tracker.forget(999);else if(reason==='beforeNavigate')tracker.invalidate(1);else if(reason==='replacement-removed')tracker.replace(4,2);else if(reason==='replacement-added')tracker.replace(2,4);else tracker.observe({tabId:3,frameId:0,url:'https://example.com/',timeStamp:1,documentId:'other',kind:'committed',documentLifecycle:'active',transitionType:'link',transitionQualifiers:[]});
    expect(lease.isCurrent()).toBe(false);tracker.forget(2);expect(lease.isCurrent()).toBe(false);expect(()=>lease.expectRemoval(3)).toThrow();
  });
  it('disposed stale foreign winner and duplicate arms reject without refreshing view',()=>{
    const tracker=createNavigationTracker();const view=tracker.view();const lease=tracker.createRemovalLease(view,[2]);expect(()=>lease.expectRemoval(1)).toThrow();expect(()=>lease.expectRemoval(9)).toThrow();lease.expectRemoval(2);expect(()=>lease.expectRemoval(2)).toThrow();lease.dispose();expect(lease.isCurrent()).toBe(false);expect(()=>lease.expectRemoval(2)).toThrow();tracker.invalidate(3);const stale=tracker.createRemovalLease(view,[2]);expect(stale.isCurrent()).toBe(false);expect(()=>stale.expectRemoval(2)).toThrow();
  });
});

it('a future or otherwise stale original view cannot become current as revision advances',()=>{
  const tracker=createNavigationTracker();const view=tracker.view();const lease=tracker.createRemovalLease({...view,revision:view.revision+1},[2]);expect(lease.isCurrent()).toBe(false);tracker.invalidate(9);expect(lease.isCurrent()).toBe(false);expect(()=>lease.expectRemoval(2)).toThrow();
});
