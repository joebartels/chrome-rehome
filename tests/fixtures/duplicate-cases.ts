import type { DuplicateRule } from '../../src/rules/duplicates';

export const policy: DuplicateRule = {
  origin: 'https://example.test', ignoreQueryParameters: ['utm_source'],
  ignoreFragment: false, ignoreTrailingSlash: false, sortQueryParameters: false,
};
type Case = readonly [name: string, rules: readonly DuplicateRule[], left: string, right: string, equivalent: boolean];
// Hand-specified expectations shared by Node and native Chromium.
export const duplicateCases: readonly Case[] = [
  ['native canonical origin', [], 'HTTPS://EXAMPLE.test:443/a', 'https://example.test/a', true],
  ['issues', [], 'https://example.test/issues/1', 'https://example.test/issues/2', false],
  ['PRs', [], 'https://example.test/pull/1', 'https://example.test/pull/2', false],
  ['documents', [], 'https://example.test/docs/1', 'https://example.test/docs/2', false],
  ['file IDs', [], 'https://example.test/file/1', 'https://example.test/file/2', false],
  ['meaningful values', [], 'https://example.test/a?id=1', 'https://example.test/a?id=2', false],
  ['hash routes', [], 'https://example.test/a#/one', 'https://example.test/a#/two', false],
  ['path case', [], 'https://example.test/A', 'https://example.test/a', false],
  ['encoded boundary', [], 'https://example.test/a%2Fb', 'https://example.test/a/b', false],
  ['trailing slash', [], 'https://example.test/a/', 'https://example.test/a', false],
  ['query order', [], 'https://example.test/a?b=2&a=1', 'https://example.test/a?a=1&b=2', false],
  ['repeated order', [], 'https://example.test/a?a=1&a=2', 'https://example.test/a?a=2&a=1', false],
  ['empty query', [], 'https://example.test/a?', 'https://example.test/a', false],
  ['empty fragment', [], 'https://example.test/a#', 'https://example.test/a', false],
  ['raw spelling', [], 'https://example.test/a?q=%20', 'https://example.test/a?q=+', false],
  ['explicit ignore all occurrences', [policy], 'https://example.test/a?id=1&utm_source=x&utm_source=y', 'https://example.test/a?id=1', true],
  ['decoded names', [policy], 'https://example.test/a?%75tm_source=x&id=1', 'https://example.test/a?id=1', true],
  ['name case', [policy], 'https://example.test/a?UTM_source=x', 'https://example.test/a', false],
  ['scheme scope', [policy], 'http://example.test/a?utm_source=x', 'http://example.test/a', false],
  ['port scope', [policy], 'https://example.test:8443/a?utm_source=x', 'https://example.test:8443/a', false],
  ['subdomain scope', [policy], 'https://sub.example.test/a?utm_source=x', 'https://sub.example.test/a', false],
  ['fragment opt in', [{...policy, ignoreFragment: true}], 'https://example.test/a#route', 'https://example.test/a#', true],
  ['trailing slashes opt in', [{...policy, ignoreTrailingSlash: true}], 'https://example.test/a///', 'https://example.test/a', true],
  ['root retained', [{...policy, ignoreTrailingSlash: true}], 'https://example.test///', 'https://example.test/', true],
  ['internal slashes retained', [{...policy, ignoreTrailingSlash: true}], 'https://example.test/a//b/', 'https://example.test/a/b', false],
  ['encoded terminal slash retained', [{...policy, ignoreTrailingSlash: true}], 'https://example.test/a%2F', 'https://example.test/a', false],
  ['stable sorting', [{...policy, sortQueryParameters: true}], 'https://example.test/a?b=2&a=1&a=3', 'https://example.test/a?a=1&a=3&b=2', true],
  ['repeat values unsorted', [{...policy, sortQueryParameters: true}], 'https://example.test/a?a=3&a=1', 'https://example.test/a?a=1&a=3', false],
  ['decoded name sorting', [{...policy, sortQueryParameters: true}], 'https://example.test/a?z=1&%61=2', 'https://example.test/a?%61=2&z=1', true],
  ['combined flags', [{...policy, sortQueryParameters: true, ignoreFragment: true, ignoreTrailingSlash: true}], 'https://example.test/a///?z=1&utm_source=x&a=2#r', 'https://example.test/a?a=2&z=1', true],
  ['all ignored removes marker', [policy], 'https://example.test/a?utm_source=x', 'https://example.test/a', true],
  ['untouched empty marker', [policy], 'https://example.test/a?', 'https://example.test/a', false],
  ['empty fields survive deletion', [policy], 'https://example.test/a?utm_source=x&&', 'https://example.test/a?&', true],
  ['empty fields are significant', [policy], 'https://example.test/a?utm_source=x&&', 'https://example.test/a', false],
  ['leading question name', [{...policy, ignoreQueryParameters: ['?x']}], 'https://example.test/a??x=1&y=2', 'https://example.test/a?y=2', true],
  ['empty slots survive native sorting', [{...policy, sortQueryParameters:true}], 'https://example.test/a?b=2&&utm_source=x&a=1&', 'https://example.test/a?a=1&&b=2&', true],
  ['empty slots remain significant during sorting', [{...policy, sortQueryParameters:true}], 'https://example.test/a?b=2&&a=1', 'https://example.test/a?a=1&b=2', false],
  ['equals with empty name retained', [policy], 'https://example.test/a?utm_source=x&=y', 'https://example.test/a?=y', true],
  ['raw invalid value bytes stay distinct', [{...policy, sortQueryParameters:true}], 'https://example.test/a?z=%FF&utm_source=x&a=1', 'https://example.test/a?a=1&z=%FE', false],
  ['encoded name repeats retain value order', [{...policy, sortQueryParameters:true}], 'https://example.test/a?z=0&%61=2&a=1', 'https://example.test/a?%61=2&a=1&z=0', true],
  ['http and https', [], 'http://example.test/a', 'https://example.test/a', false],
  ...(['%20', '%FF', '%2f', ''].map((value): Case => ['raw token survives ignore and sorting '+value, [{...policy, sortQueryParameters: true}], 'https://example.test/a?z='+value+'&utm_source=x&a', 'https://example.test/a?a&z='+value, true])),
  ...([['%20', '+'], ['%FF', '%FE'], ['%2f', '%2F'], ['a', 'a=']].map(([a,b]): Case => ['raw difference '+a, [{...policy, sortQueryParameters: true}], 'https://example.test/a?utm_source=x&'+a, 'https://example.test/a?'+b, false])),
];
export const invalidCandidates = [
  '', 'not a URL', 'https://', 'https:example.test/a', 'https:///example.test/a',
  ' https://example.test/a', 'https://example.test/a ', 'https://example.test/a\n',
  'https://example.test/a\\b', 'https://user:password@example.test/a',
  'https://user@example.test/a', 'file:///a', 'chrome://settings', 'javascript:void(0)',
];

// Compilation expectations also run in Chromium: native hostname serialization
// can differ even when candidate-equivalence cases pass in both runtimes.
type CompilationCase = readonly [name: string, rules: readonly DuplicateRule[], kind: 'ready' | 'invalid', ruleIndex?: number];
export const duplicateCompilationCases: readonly CompilationCase[] = [
  ['empty rule list', [], 'ready'],
  ['ordinary origin', [policy], 'ready'],
  ['canonical alias entered alone', [{...policy, origin:'HTTPS://EXAMPLE.test:443/'}], 'ready'],
  ['Unicode origin entered alone', [{...policy, origin:'https://bücher.test'}], 'ready'],
  ['punycode origin entered alone', [{...policy, origin:'https://xn--bcher-kva.test'}], 'ready'],
  ['distinct scheme and nondefault ports', [policy, {...policy, origin:'http://example.test:80'}, {...policy, origin:'https://example.test:8443'}], 'ready'],
  ['raw wildcard', [{...policy, origin:'https://*.example.test'}], 'invalid', 0],
  ['encoded uppercase wildcard', [{...policy, origin:'https://%2A.example.test'}], 'invalid', 0],
  ['encoded lowercase wildcard', [{...policy, origin:'https://%2a.example.test'}], 'invalid', 0],
  ['encoded embedded wildcard at second index', [policy, {...policy, origin:'https://exam%2Aple.test'}], 'invalid', 1],
  ['canonical case and default-port collision', [policy, {...policy, origin:'HTTPS://EXAMPLE.test:443/'}], 'invalid', 1],
  ['HTTP default-port collision', [{...policy, origin:'http://example.test'}, {...policy, origin:'http://example.test:80/'}], 'invalid', 1],
  ['IDN canonical collision', [{...policy, origin:'https://bücher.test'}, {...policy, origin:'https://xn--bcher-kva.test/'}], 'invalid', 1],
  ['indexed invalid path', [policy, {...policy, origin:'https://other.test/path'}], 'invalid', 1],
];
