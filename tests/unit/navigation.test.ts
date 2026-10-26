import { describe, expect, it } from 'vitest';
import { createNavigationTracker, type NavigationInput } from '../../src/background/navigation';

function input(overrides: Partial<NavigationInput> = {}): NavigationInput {
  return { tabId: 7, frameId: 0, url: 'https://example.com/path?query=one#section',
    timeStamp: 100, documentId: 'document-one', kind: 'committed', transitionType: 'link',
    transitionQualifiers: [], documentLifecycle: 'active', frameType: 'outermost_frame', ...overrides };
}

describe('navigation eligibility and runtime ownership', () => {
  it.each(['link', 'typed', 'auto_bookmark', 'generated', 'form_submit', 'keyword', 'keyword_generated'])
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
    { transitionType: 'start_page' }, { transitionType: undefined }, { transitionType: 'invented' },
    { transitionType: 'auto_subframe' }, { transitionType: 'manual_subframe' },
    { transitionQualifiers: undefined }, { transitionQualifiers: ['unknown'] },
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
