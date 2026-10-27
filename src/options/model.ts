import { parseConfig, type Config } from '../config/schema';
import { compileGroupingRules, parseGroupingCandidate } from '../rules/grouping';
import { compileDuplicateRules } from '../rules/duplicates';

export type EditorDraft = {
  enabled: boolean;
  groupingRules: { enabled: boolean; pattern: string; group: string }[];
  duplicateRules: { enabled: boolean; origin: string; ignoredQueryNames: string;
    ignoreFragment: boolean; ignoreTrailingSlash: boolean; sortQueryParameters: boolean }[];
};

export type DraftError = Readonly<{
  list: 'groupingRules' | 'duplicateRules'; ruleIndex?: number; message: string;
}>;
export type DraftValidation =
  | { kind: 'ready'; config: Config }
  | { kind: 'invalid'; errors: readonly DraftError[] };
export type GroupingPreview =
  | { kind: 'empty' | 'invalid' | 'unmatched' }
  | { kind: 'matched'; ruleIndex: number; group: string };
export type DuplicatePreview =
  | { kind: 'empty' | 'invalid' | 'conservative' }
  | { kind: 'policy'; ruleIndex: number; origin: string };
export type ComparisonPreview = { kind: 'incomplete' | 'invalid' | 'equivalent' | 'distinct' };
export type PreviewResult =
  | { kind: 'invalid'; errors: readonly DraftError[] }
  | { kind: 'ready'; grouping: GroupingPreview; duplicate: { left: DuplicatePreview; right: DuplicatePreview };
      comparison: ComparisonPreview };

export function createDraft(config: Config): EditorDraft {
  return {
    enabled: config.enabled,
    groupingRules: config.groupingRules.map(rule => ({ ...rule })),
    duplicateRules: config.duplicateRules.map(({ ignoreQueryParameters, ...rule }) => ({
      ...rule, ignoredQueryNames: ignoreQueryParameters.join('\n'),
    })),
  };
}

export function sameConfig(a: Config, b: Config): boolean {
  return a.schemaVersion === b.schemaVersion && a.enabled === b.enabled &&
    a.groupingRules.length === b.groupingRules.length && a.groupingRules.every((rule, index) => {
      const other = b.groupingRules[index]!;
      return rule.enabled === other.enabled && rule.pattern === other.pattern && rule.group === other.group;
    }) && a.duplicateRules.length === b.duplicateRules.length && a.duplicateRules.every((rule, index) => {
      const other = b.duplicateRules[index]!;
      return rule.enabled === other.enabled && rule.origin === other.origin && rule.ignoreFragment === other.ignoreFragment &&
        rule.ignoreTrailingSlash === other.ignoreTrailingSlash && rule.sortQueryParameters === other.sortQueryParameters &&
        rule.ignoreQueryParameters.length === other.ignoreQueryParameters.length &&
        rule.ignoreQueryParameters.every((name, nameIndex) => name === other.ignoreQueryParameters[nameIndex]);
    });
}

export function validateDraft(draft: EditorDraft): DraftValidation {
  const groupingRules = draft.groupingRules.map(rule => ({ ...rule }));
  const duplicateRules = draft.duplicateRules.map(({ ignoredQueryNames, ...rule }) => ({
    ...rule, ignoreQueryParameters: ignoredQueryNames === '' ? [] : ignoredQueryNames.split(/\r\n|\r|\n/),
  }));
  const errors: DraftError[] = [];
  for (const [list, rules, compile] of [
    ['groupingRules', groupingRules, compileGroupingRules],
    ['duplicateRules', duplicateRules, compileDuplicateRules],
  ] as const) {
    rules.forEach((rule, ruleIndex) => {
      const result = compile([rule]);
      if (result.kind === 'invalid') errors.push({ list, ruleIndex, message: result.message });
    });
    const result = compile(rules);
    if (result.kind === 'invalid' && !errors.some(error => error.list === list && error.ruleIndex === result.ruleIndex)) {
      errors.push({ list, ...(result.ruleIndex === undefined ? {} : { ruleIndex: result.ruleIndex }), message: result.message });
    }
  }
  if (errors.length) return { kind: 'invalid', errors };
  const state = parseConfig({ schemaVersion: 4, enabled: draft.enabled, groupingRules, duplicateRules });
  if (state.kind !== 'ready') return { kind: 'invalid', errors: [{ list: 'groupingRules', message: state.message }] };
  return { kind: 'ready', config: state.config };
}

export function previewDraft(draft: EditorDraft, url: string, compareUrl: string): PreviewResult {
  const validation = validateDraft(draft);
  if (validation.kind === 'invalid') return validation;
  const grouping = compileGroupingRules(validation.config.groupingRules);
  const duplicates = compileDuplicateRules(validation.config.duplicateRules);
  if (grouping.kind !== 'ready' || duplicates.kind !== 'ready') {
    throw new Error('Validated draft did not compile.');
  }
  const matchedGroup = grouping.match(url);
  const groupResult: GroupingPreview = url === '' ? { kind: 'empty' }
    : matchedGroup ? { kind: 'matched', ruleIndex: grouping.rules.indexOf(matchedGroup), group: matchedGroup.group }
    : parseGroupingCandidate(url) ? { kind: 'unmatched' } : { kind: 'invalid' };
  function duplicateResult(value: string): DuplicatePreview {
    if (value === '') return { kind: 'empty' };
    const candidate = { url: value, incognito: false };
    if (duplicates.kind !== 'ready' || duplicates.identify(candidate) === undefined) return { kind: 'invalid' };
    const rule = duplicates.match(candidate);
    return rule ? { kind: 'policy', ruleIndex: duplicates.rules.indexOf(rule), origin: rule.origin } : { kind: 'conservative' };
  }
  const left = duplicateResult(url);
  const right = duplicateResult(compareUrl);
  const comparison: ComparisonPreview = left.kind === 'empty' || right.kind === 'empty' ? { kind: 'incomplete' }
    : left.kind === 'invalid' || right.kind === 'invalid' ? { kind: 'invalid' }
    : { kind: duplicates.equivalent({ url, incognito: false }, { url: compareUrl, incognito: false }) ? 'equivalent' : 'distinct' };
  return { kind: 'ready', grouping: groupResult, duplicate: { left, right }, comparison };
}
