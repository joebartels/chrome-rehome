import { describe, expect, it } from 'vitest';
import { compileGroupingRules } from '../../src/rules/grouping';
import { groupingCases } from '../fixtures/grouping-cases';

function ready(raw: unknown) {
  const result = compileGroupingRules(raw);
  expect(result.kind).toBe('ready');
  if (result.kind !== 'ready') throw new Error(result.message);
  return result;
}

describe('grouping rules', () => {
  it.each(groupingCases)('pattern %s against %s matches=%s', (pattern, url, matches) => {
    expect(ready([{ pattern, group: 'BarTab' }]).match(url)?.group).toBe(matches ? 'BarTab' : undefined);
  });

  it('returns the first matching configured rule without sorting or deduplication', () => {
    const compiled = ready([
      { pattern: 'https://github.com/*', group: 'First' },
      { pattern: 'https://github.com/example-org/sample/*', group: 'BarTab' },
      { pattern: 'https://github.com/*', group: 'Duplicate' },
    ]);
    expect(compiled.match('https://github.com/example-org/sample/issues')).toBe(compiled.rules[0]);
    expect(compiled.rules.map((rule) => rule.group)).toEqual(['First', 'BarTab', 'Duplicate']);
  });

  it('copies and freezes the rule list and each rule', () => {
    const input = [{ pattern: 'https://github.com/*', group: 'BarTab' }];
    const compiled = ready(input);
    input[0]!.group = 'Changed';
    input[0]!.pattern = 'https://elsewhere.com/*';
    input.push({ pattern: 'https://example.com/*', group: 'Added' });
    expect(compiled.rules).toEqual([{ pattern: 'https://github.com/*', group: 'BarTab' }]);
    expect(Object.isFrozen(compiled.rules)).toBe(true);
    expect(Object.isFrozen(compiled.rules[0])).toBe(true);
    expect(compiled.match('https://github.com/a')).toBe(compiled.rules[0]);
    expect(compiled.match('https://elsewhere.com/a')).toBeUndefined();
  });

  it('accepts no rules and never matches', () => {
    expect(ready([]).match('https://example.com/')).toBeUndefined();
  });

  it.each([undefined, null, {}, 'rules', 1, true])('rejects non-array input %j', (raw) => {
    expect(compileGroupingRules(raw)).toMatchObject({ kind: 'invalid', message: expect.any(String) });
  });

  it.each([
    null, [], {}, { pattern: 'https://example.com/' }, { pattern: 2, group: 'Work' },
    { pattern: 'https://example.com/', group: true }, { pattern: 'https://example.com/', group: 'Work', extra: true },
  ])('rejects malformed rules atomically with their index %j', (rule) => {
    const result = compileGroupingRules([{ pattern: 'https://example.com/', group: 'Good' }, rule]);
    expect(result).toMatchObject({ kind: 'invalid', ruleIndex: 1, message: expect.any(String) });
    expect(result).not.toHaveProperty('rules');
    expect(result).not.toHaveProperty('match');
  });

  it.each([
    '', ' https://example.com/', 'https://example.com/ ', 'https://example.com/\n',
    'https://example.com/\u007f', 'https://example.com/\u0085', '/relative', '//example.com/a',
    'file://example.com/a', 'ftp://example.com/a', 'http:/example.com/a', 'https:///a',
    'https://user:password@example.com/a', 'https://@example.com/a', 'https://example.com\\a',
    'https://example.com/a?query', 'https://example.com/a#fragment', 'https://example.com:*/a',
    'https://example.com:/a', 'https://example.com:65536/a', 'https://example.com:abc/a',
    'https://[bad]/a', 'https://exa%mple.com/a',
  ])('rejects invalid pattern %j', (pattern) => {
    expect(compileGroupingRules([{ pattern, group: 'Work' }])).toMatchObject({
      kind: 'invalid', ruleIndex: 0, message: expect.any(String),
    });
  });

  it('explains that query and fragment pattern syntax is unsupported', () => {
    for (const pattern of ['https://example.com/?x', 'https://example.com/#x']) {
      expect(compileGroupingRules([{ pattern, group: 'Work' }])).toMatchObject({
        kind: 'invalid', message: expect.stringMatching(/query|fragment/i),
      });
    }
  });

  it.each(['', ' Work', 'Work ', 'Work\n', 'Work\u0000', 'Work\u0085', 'x'.repeat(81)])('rejects invalid group titles %j', (group) => {
    expect(compileGroupingRules([{ pattern: 'https://example.com/', group }])).toMatchObject({ kind: 'invalid', ruleIndex: 0 });
  });

  it('enforces rule count, pattern length and group length boundaries', () => {
    const pattern = `https://example.com/${'x'.repeat(2028)}`;
    expect(pattern).toHaveLength(2048);
    const rule = { pattern, group: 'x'.repeat(80) };
    expect(ready(Array.from({ length: 100 }, () => rule)).rules).toHaveLength(100);
    expect(compileGroupingRules(Array.from({ length: 101 }, () => rule))).toMatchObject({ kind: 'invalid' });
    expect(compileGroupingRules([{ ...rule, pattern: `${pattern}x` }])).toMatchObject({ kind: 'invalid', ruleIndex: 0 });
  });

  it.each(['', 'not a URL', '/relative', 'ftp://example.com/a', 'chrome://extensions',
    'https://[bad]/a', 'https://example.com:65536/a', ' https://example.com/a',
    'https://example.com/\n', 'https://example.com\\a', 'https:example.com/a'])('ignores malformed or unsupported candidates %j', (url) => {
    expect(ready([{ pattern: '*://*/*', group: 'All' }]).match(url)).toBeUndefined();
  });
});
