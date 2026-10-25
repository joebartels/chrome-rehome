import { describe, expect, it } from 'vitest';
import { createNavigationTracker, type NavigationInput } from '../../src/background/navigation';

function input(overrides: Partial<NavigationInput> = {}): NavigationInput {
  return {
    tabId: 7,
    frameId: 0,
    url: 'https://example.com/path?query=one#section',
    timeStamp: 100,
    documentId: 'document-one',
    kind: 'committed',
    ...overrides,
  };
}

describe('navigation tracker', () => {
  it('retains the actual main-frame URL, document and browser timestamp', () => {
    const tracker = createNavigationTracker();
    const navigation = tracker.observe(input());
    expect(navigation).toEqual({
      tabId: 7,
      url: 'https://example.com/path?query=one#section',
      documentId: 'document-one',
      kind: 'committed',
      observedSequence: 1,
      generation: expect.any(Number),
      browserTimeStamp: 100,
    });
    expect(tracker.isCurrent(navigation!)).toBe(true);
  });

  it('ignores subframes without invalidating main-frame work', () => {
    const tracker = createNavigationTracker();
    const first = tracker.observe(input())!;
    expect(tracker.observe(input({ frameId: 2, url: 'chrome://settings', timeStamp: 200 }))).toBeUndefined();
    expect(tracker.isCurrent(first)).toBe(true);
  });

  it.each(['chrome://settings', 'about:blank', 'file:///tmp/page.html', 'not a URL', 'https://'])
  ('invalidates previous work for unsupported main-frame URL %s without emitting', (url) => {
    const tracker = createNavigationTracker();
    const first = tracker.observe(input())!;
    expect(tracker.observe(input({ url, timeStamp: 200 }))).toBeUndefined();
    expect(tracker.isCurrent(first)).toBe(false);
    const next = tracker.observe(input())!;
    expect(next.observedSequence).toBe(2);
    expect(tracker.isCurrent(next)).toBe(true);
    expect(tracker.isCurrent(first)).toBe(false);
  });

  it('invalidates earlier generations independently for each tab', () => {
    const tracker = createNavigationTracker();
    const first = tracker.observe(input())!;
    const otherTab = tracker.observe(input({ tabId: 8 }))!;
    const next = tracker.observe(input({ url: 'http://example.com/next', timeStamp: 200 }))!;
    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.isCurrent(next)).toBe(true);
    expect(tracker.isCurrent(otherTab)).toBe(true);
    expect([first.observedSequence, otherTab.observedSequence, next.observedSequence]).toEqual([1, 2, 3]);
    expect(next.generation).not.toBe(first.generation);
  });

  it('supports explicit invalidation and allows an identical observation afterward', () => {
    const tracker = createNavigationTracker();
    const first = tracker.observe(input())!;
    tracker.invalidate(7);
    expect(tracker.isCurrent(first)).toBe(false);
    const next = tracker.observe(input())!;
    expect(tracker.isCurrent(next)).toBe(true);
    expect(next.generation).not.toBe(first.generation);
  });

  it('forgets ownership permanently even when a tab ID is reused repeatedly', () => {
    const tracker = createNavigationTracker();
    const first = tracker.observe(input())!;
    tracker.forget(7);
    expect(tracker.isCurrent(first)).toBe(false);
    const second = tracker.observe(input())!;
    tracker.forget(7);
    const third = tracker.observe(input())!;
    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.isCurrent(second)).toBe(false);
    expect(tracker.isCurrent(third)).toBe(true);
    expect(new Set([first.generation, second.generation, third.generation]).size).toBe(3);
  });

  it('deduplicates the latest identical tuple without advancing sequence or invalidating it', () => {
    const tracker = createNavigationTracker();
    const first = tracker.observe(input())!;
    expect(tracker.observe(input())).toBeUndefined();
    expect(tracker.isCurrent(first)).toBe(true);
    const next = tracker.observe(input({ timeStamp: 101 }))!;
    expect(next.observedSequence).toBe(2);
    expect(tracker.isCurrent(first)).toBe(false);
  });

  it.each([
    { kind: 'history' },
    { kind: 'fragment' },
    { documentId: 'document-two' },
    { url: 'https://example.com/path?query=two#section' },
  ] satisfies Partial<NavigationInput>[])
  ('treats changed tuple fields as new observations: %j', (change) => {
    const tracker = createNavigationTracker();
    const first = tracker.observe(input())!;
    const next = tracker.observe(input(change))!;
    expect(next).toMatchObject(change);
    expect(next.observedSequence).toBe(2);
    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.isCurrent(next)).toBe(true);
  });

  it('keeps only the latest fingerprint and uses observation order without timestamp comparisons', () => {
    const tracker = createNavigationTracker();
    tracker.observe(input());
    tracker.observe(input({ timeStamp: 50 }));
    const latest = tracker.observe(input())!;
    expect(latest.observedSequence).toBe(3);
    expect(tracker.isCurrent(latest)).toBe(true);
  });

  it('accepts HTTP and missing document IDs without normalizing the supplied URL', () => {
    const tracker = createNavigationTracker();
    const { documentId: _, ...withoutDocument } = input({ url: 'http://EXAMPLE.com:80/path?q=%2f#hash' });
    const navigation = tracker.observe(withoutDocument)!;
    expect(navigation.url).toBe('http://EXAMPLE.com:80/path?q=%2f#hash');
    expect(navigation).not.toHaveProperty('documentId');
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])
  ('rejects invalid tab ID %s', (tabId) => {
    expect(createNavigationTracker().observe(input({ tabId }))).toBeUndefined();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
  ('rejects nonfinite browser timestamp %s', (timeStamp) => {
    expect(createNavigationTracker().observe(input({ timeStamp }))).toBeUndefined();
  });
});
