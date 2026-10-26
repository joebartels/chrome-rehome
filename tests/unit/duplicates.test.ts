import { describe, expect, it } from 'vitest';
import { compileDuplicateRules, type DuplicateCandidate } from '../../src/rules/duplicates';
import { duplicateCases, duplicateCompilationCases, invalidCandidates, policy } from '../fixtures/duplicate-cases';

function compile(raw: unknown = []) {
  const result = compileDuplicateRules(raw);
  if (result.kind !== 'ready') throw new Error(result.message);
  return result;
}
const candidate = (url: string, incognito = false) => ({ url, incognito });

describe('duplicate identity', () => {
  it.each(duplicateCases)('%s', (_name, rules, left, right, expected) => {
    const engine = compile(rules);
    const a = Object.freeze(candidate(left));
    const b = Object.freeze(candidate(right));
    expect(engine.identify(a)).toBeTypeOf('string');
    expect(engine.equivalent(a, b)).toBe(expected);
    expect(engine.equivalent(b, a)).toBe(expected);
    expect(a.url).toBe(left);
  });
  it('requires explicit browsing context and separates normal from incognito', () => {
    const engine = compile();
    const url = 'https://example.test/a';
    expect(engine.identify(candidate(url))).not.toBe(engine.identify(candidate(url, true)));
    expect(engine.equivalent(candidate(url), candidate(url, true))).toBe(false);
    for (const raw of [null, undefined, {}, {url}, {url, incognito: 'false'}, {url: 3, incognito: false}]) {
      const invalid = raw as DuplicateCandidate;
      expect(engine.identify(invalid)).toBeUndefined();
      expect(engine.equivalent(invalid, invalid)).toBe(false);
    }
  });
  it.each(invalidCandidates)('rejects unsupported/malformed candidate %j without matching itself', (url) => {
    const engine = compile();
    expect(engine.identify(candidate(url))).toBeUndefined();
    expect(engine.equivalent(candidate(url), candidate(url))).toBe(false);
  });
  it('copies and freezes rules and never changes behavior when input changes', () => {
    const raw = [{...policy, ignoreQueryParameters: ['utm_source']}];
    const engine = compile(raw);
    raw[0]!.ignoreQueryParameters[0] = 'id';
    raw[0]!.origin = 'https://other.test';
    raw.push({...policy, ignoreQueryParameters: []});
    expect(engine.rules).toEqual([policy]);
    expect(Object.isFrozen(engine.rules)).toBe(true);
    expect(Object.isFrozen(engine.rules[0])).toBe(true);
    expect(Object.isFrozen(engine.rules[0]!.ignoreQueryParameters)).toBe(true);
    expect(engine.equivalent(candidate('https://example.test/a?utm_source=x'), candidate('https://example.test/a'))).toBe(true);
  });
  it('preserves entered origin text and uses canonical origins for policy lookup', () => {
    const rule = {...policy, origin: 'HTTPS://EXAMPLE.test:443/'};
    const engine = compile([rule]);
    expect(engine.rules).toEqual([rule]);
    expect(engine.equivalent(candidate('https://example.test/a?utm_source=x'), candidate('https://example.test/a'))).toBe(true);
  });
});

describe('duplicate rule compilation', () => {
  it.each(duplicateCompilationCases)('shares native compilation behavior: %s', (_name, rules, kind, ruleIndex) => {
    const result = compileDuplicateRules(rules);
    expect(result.kind).toBe(kind);
    if (result.kind === 'ready') {
      expect(result.rules).toEqual(rules);
    } else {
      expect(result.ruleIndex).toBe(ruleIndex);
      expect(result.message.length).toBeGreaterThan(0);
      expect(result).not.toHaveProperty('identify');
      expect(result).not.toHaveProperty('equivalent');
    }
  });
  it.each([null, {}, 'rules', Array.from({length: 101}, () => policy)])('rejects invalid rule collections', (raw) => {
    expect(compileDuplicateRules(raw)).toMatchObject({kind:'invalid', message: expect.any(String)});
  });
  it.each([
    null, [], {}, {...policy, extra: true}, {...policy, origin: 3},
    ...['', ' https://example.test', 'https://example.test ', 'https://exam\nple.test', 'https://example.test/a', 'https://example.test/?', 'https://example.test/#', 'https://u@example.test', 'https://*.example.test', 'https://%2A.example.test', 'https:example.test', 'https:///example.test', 'https://example.test/../', 'ftp://example.test', 'https://example.test\\', 'https://'+'x'.repeat(2048)].map(origin => ({...policy, origin})),
    ...[undefined, 0, 'false'].flatMap(value => ['ignoreFragment','ignoreTrailingSlash','sortQueryParameters'].map(key => ({...policy,[key]:value}))),
    ...[null, 'x', Array(1), [''], [' x'], ['x '], ['x\n'], [3], ['x'.repeat(257)], ['x','x'], Array.from({length:101},(_,i)=>String(i))].map(ignoreQueryParameters => ({...policy,ignoreQueryParameters})),
  ])('atomically rejects indexed invalid rule %j', (raw) => {
    const result = compileDuplicateRules([{...policy,origin:'https://valid.test'}, raw]);
    expect(result).toMatchObject({kind:'invalid', ruleIndex:1, message:expect.any(String)});
    expect(result).not.toHaveProperty('identify');
  });
  it('rejects duplicate canonical origins', () => {
    expect(compileDuplicateRules([policy,{...policy,origin:'HTTPS://EXAMPLE.test:443/'}])).toMatchObject({kind:'invalid',ruleIndex:1});
  });
  it('accepts boundary lengths, counts and distinct case-sensitive ignore names', () => {
    const origin = 'https://'+('x'.repeat(63)+'.').repeat(31)+'x'.repeat(56);
    expect(origin.length).toBe(2048);
    expect(compileDuplicateRules([{...policy,origin,ignoreQueryParameters:['x'.repeat(256)]}]).kind).toBe('ready');
    expect(compileDuplicateRules(Array.from({length:100},(_,i)=>({...policy,origin:'https://example'+i+'.test',ignoreQueryParameters:Array.from({length:100},(_,j)=>String(j))}))).kind).toBe('ready');
    expect(compileDuplicateRules([{...policy,ignoreQueryParameters:['x','X']}]).kind).toBe('ready');
  });
});
