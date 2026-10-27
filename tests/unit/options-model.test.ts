import { describe, expect, it } from 'vitest';
import { createDraft, previewDraft, sameConfig, validateDraft, type EditorDraft } from '../../src/options/model';
import { parseConfig, type Config } from '../../src/config/schema';

function saved(): Config {
  const state = parseConfig({ schemaVersion: 3, enabled: false,
    groupingRules: [{ pattern: 'https://example.test/*', group: 'Broad' }, { pattern: 'https://example.test/a', group: 'Specific' }],
    duplicateRules: [{ origin: 'https://example.test', ignoreQueryParameters: ['utm_source', 'campaign'], ignoreFragment: true, ignoreTrailingSlash: true, sortQueryParameters: true }] });
  if (state.kind !== 'ready') throw new Error('Fixture invalid');
  return state.config;
}
function draft(): EditorDraft { return createDraft(saved()); }

describe('editor draft validation', () => {
  it('copies editable fields without mutating the saved config or sharing drafts', () => {
    const config = saved();
    const first = createDraft(config);
    expect(first).toEqual({ enabled: false,
      groupingRules: [{ enabled: true, pattern: 'https://example.test/*', group: 'Broad' }, { enabled: true, pattern: 'https://example.test/a', group: 'Specific' }],
      duplicateRules: [{ enabled: true, origin: 'https://example.test', ignoredQueryNames: 'utm_source\ncampaign', ignoreFragment: true, ignoreTrailingSlash: true, sortQueryParameters: true }] });
    first.groupingRules[0]!.group = 'Changed';
    first.duplicateRules[0]!.ignoredQueryNames = 'changed';
    expect(createDraft(config)).toEqual(draft());
    expect(config.groupingRules[0]!.group).toBe('Broad');
    expect(config.duplicateRules[0]!.ignoreQueryParameters).toEqual(['utm_source', 'campaign']);
  });
  it('validates empty names as an empty list and preserves exact decoded names', () => {
    const value = draft();
    value.duplicateRules[0]!.ignoredQueryNames = '';
    expect(validateDraft(value)).toMatchObject({ kind: 'ready', config: { schemaVersion: 4, enabled: false, duplicateRules: [{ ignoreQueryParameters: [] }] } });
    value.duplicateRules[0]!.ignoredQueryNames = 'x\r\nX\ry';
    const result = validateDraft(value);
    expect(result).toMatchObject({ kind: 'ready', config: { duplicateRules: [{ ignoreQueryParameters: ['x', 'X', 'y'] }] } });
    if (result.kind === 'ready') expect(Object.isFrozen(result.config)).toBe(true);
  });
  it.each([' x', 'x ', 'x\n', '\nx', 'x\n\ny', 'x\nx', 'x'.repeat(257), Array.from({length:101},(_,i)=>String(i)).join('\n')])('rejects exact invalid names without repairing %j', names => {
    const value = draft(); value.duplicateRules[0]!.ignoredQueryNames = names;
    const before = structuredClone(value);
    expect(validateDraft(value)).toMatchObject({ kind: 'invalid', errors: [{ list: 'duplicateRules', ruleIndex: 0, message: expect.any(String) }] });
    expect(value).toEqual(before);
  });
  it('collects independent indexed row errors including disabled rows', () => {
    const value = draft(); value.groupingRules[0]!.enabled = false; value.groupingRules[0]!.pattern = 'invalid';
    value.duplicateRules[0]!.enabled = false; value.duplicateRules[0]!.origin = 'invalid';
    expect(validateDraft(value)).toMatchObject({ kind: 'invalid', errors: [
      { list: 'groupingRules', ruleIndex: 0 }, { list: 'duplicateRules', ruleIndex: 0 }
    ] });
    expect(previewDraft(value, 'https://example.test/a', '')).toMatchObject({ kind: 'invalid', errors: expect.any(Array) });
  });
  it('reports cross-row canonical collisions even for disabled policies', () => {
    const value = draft(); value.duplicateRules.push({ ...value.duplicateRules[0]!, enabled: false, origin: 'HTTPS://EXAMPLE.test:443/' });
    expect(validateDraft(value)).toMatchObject({ kind: 'invalid', errors: [{ list: 'duplicateRules', ruleIndex: 1 }] });
  });
  it('enforces grouping count, pattern and group boundaries', () => {
    const value = draft();
    value.groupingRules = Array.from({length:100},()=>({ enabled: true, pattern: 'https://example.test/'+'x'.repeat(2027), group: 'x'.repeat(80) }));
    expect(validateDraft(value).kind).toBe('ready');
    value.groupingRules.push({...value.groupingRules[0]!});
    expect(validateDraft(value)).toMatchObject({ kind: 'invalid', errors: [{ list: 'groupingRules' }] });
    value.groupingRules.pop(); value.groupingRules[0]!.pattern += 'x';
    expect(validateDraft(value).kind).toBe('invalid');
    value.groupingRules[0]!.pattern = 'https://example.test/*'; value.groupingRules[0]!.group += 'x';
    expect(validateDraft(value).kind).toBe('invalid');
  });
  it('enforces duplicate count, origin and exact-name boundaries', () => {
    const value = draft();
    value.duplicateRules = Array.from({length:100},(_,i)=>({ ...value.duplicateRules[0]!, origin: 'https://example'+i+'.test', ignoredQueryNames: Array.from({length:100},(_,j)=>String(j)).join('\n') }));
    expect(validateDraft(value).kind).toBe('ready');
    value.duplicateRules.push({...value.duplicateRules[0]!,origin:'https://extra.test'});
    expect(validateDraft(value)).toMatchObject({ kind: 'invalid', errors: [{ list: 'duplicateRules' }] });
    value.duplicateRules = [value.duplicateRules[0]!];
    value.duplicateRules[0]!.origin = 'https://'+('x'.repeat(63)+'.').repeat(31)+'x'.repeat(56);
    value.duplicateRules[0]!.ignoredQueryNames = 'x'.repeat(256);
    expect(validateDraft(value).kind).toBe('ready');
    value.duplicateRules[0]!.origin += 'x'; expect(validateDraft(value).kind).toBe('invalid');
  });
  it('compares canonical values including order, enabled flags, strings and normalization', () => {
    const config = saved(); const equal = structuredClone(config);
    expect(sameConfig(config, equal)).toBe(true);
    for (const change of [(v:EditorDraft)=>{v.enabled=true;}, (v:EditorDraft)=>{v.groupingRules.reverse();}, (v:EditorDraft)=>{v.groupingRules[0]!.enabled=false;}, (v:EditorDraft)=>{v.groupingRules[0]!.group='Other';}, (v:EditorDraft)=>{v.duplicateRules[0]!.ignoreFragment=false;}, (v:EditorDraft)=>{v.duplicateRules[0]!.ignoredQueryNames='campaign\nutm_source';}]) {
      const next = createDraft(config); change(next); const checked = validateDraft(next);
      if (checked.kind !== 'ready') throw new Error('Expected changed config valid');
      expect(sameConfig(config, checked.config)).toBe(false);
    }
    expect(sameConfig(config, { duplicateRules: equal.duplicateRules, groupingRules: equal.groupingRules, enabled: equal.enabled, schemaVersion: 4 })).toBe(true);
  });
});

describe('draft preview', () => {
  it('uses draft order and disabled flags even with automation disabled', () => {
    const value = draft();
    expect(previewDraft(value,'https://example.test/a','')).toMatchObject({ kind:'ready', grouping:{kind:'matched',ruleIndex:0,group:'Broad'} });
    value.groupingRules.reverse();
    expect(previewDraft(value,'https://example.test/a','')).toMatchObject({ kind:'ready', grouping:{kind:'matched',ruleIndex:0,group:'Specific'} });
    value.groupingRules.reverse(); value.groupingRules[0]!.enabled = false;
    expect(previewDraft(value,'https://example.test/a','')).toMatchObject({ kind:'ready', grouping:{kind:'matched',ruleIndex:1,group:'Specific'} });
  });
  it('compares with real query/fragment policy and returns conservative results when disabled', () => {
    const value = draft();
    expect(previewDraft(value,'https://example.test/a/?b=2&utm_source=x&a=1#x','https://example.test/a?a=1&b=2')).toEqual({
      kind:'ready', grouping:{kind:'matched',ruleIndex:0,group:'Broad'},
      duplicate:{left:{kind:'policy',ruleIndex:0,origin:'https://example.test'},right:{kind:'policy',ruleIndex:0,origin:'https://example.test'}}, comparison:{kind:'equivalent'} });
    value.duplicateRules[0]!.enabled = false;
    expect(previewDraft(value,'https://example.test/a#x','https://example.test/a#y')).toMatchObject({ kind:'ready', duplicate:{left:{kind:'conservative'},right:{kind:'conservative'}},comparison:{kind:'distinct'} });
  });
  it('does not equate distinct paths sharing a configured group', () => {
    expect(previewDraft(draft(),'https://example.test/a','https://example.test/b')).toMatchObject({ kind:'ready', grouping:{kind:'matched',group:'Broad'},comparison:{kind:'distinct'} });
  });
  it('distinguishes empty, malformed and unmatched candidates', () => {
    expect(previewDraft(draft(),'','')).toMatchObject({kind:'ready',grouping:{kind:'empty'},duplicate:{left:{kind:'empty'},right:{kind:'empty'}},comparison:{kind:'incomplete'}});
    expect(previewDraft(draft(),'not a URL','https://example.test/a')).toMatchObject({kind:'ready',grouping:{kind:'invalid'},duplicate:{left:{kind:'invalid'}},comparison:{kind:'invalid'}});
    expect(previewDraft(draft(),'https://other.test/a','https://other.test/a')).toMatchObject({kind:'ready',grouping:{kind:'unmatched'},duplicate:{left:{kind:'conservative'}},comparison:{kind:'equivalent'}});
    expect(previewDraft(draft(),'https://example.test/a','')).toMatchObject({kind:'ready',comparison:{kind:'incomplete'}});
  });
  it('preserves each engine credential semantics without mutating the draft or exposing identities', () => {
    const value = draft(); const before = structuredClone(value);
    const result = previewDraft(value,'https://user:pass@example.test/a','https://example.test/a');
    expect(result).toMatchObject({kind:'ready',grouping:{kind:'matched'},duplicate:{left:{kind:'invalid'}},comparison:{kind:'invalid'}});
    expect(value).toEqual(before);
    expect(JSON.stringify(result)).not.toMatch(/chromerehome:duplicate|user:pass|identify|identity/);
  });
});


it.each(['https://other.test:8080/a', 'http://[::1]:9000/a', 'https://other.test:8443/a?x#y'])('classifies valid unmatched nondefault-port candidate %s', url => {
  expect(previewDraft(draft(), url, url)).toMatchObject({ kind: 'ready', grouping: { kind: 'unmatched' }, duplicate: { left: { kind: 'conservative' } }, comparison: { kind: 'equivalent' } });
});
