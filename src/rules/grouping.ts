export type GroupingRule = Readonly<{ pattern: string; group: string; enabled?: boolean }>;

type Compilation =
  | { kind: 'ready'; rules: readonly GroupingRule[]; match(url: string): GroupingRule | undefined }
  | { kind: 'invalid'; message: string; ruleIndex?: number };

function validText(value: string, maximum: number): boolean {
  return value.length > 0 && value.length <= maximum && value.trim() === value && !/\p{Cc}/u.test(value);
}

// URLPattern syntax is richer than our language: only stars reach it unescaped.
// These regexes adapt syntax; native URLPattern owns all URL matching.
function literalComponent(value: string): string {
  return value.replace(/[+?:{}()\\]/g, '\\$&').replace(/\*+/g, '*');
}

function compilePattern(pattern: string): URLPattern[] {
  const parts = /^(https?|\*):\/\/([^/]+)(\/.*)?$/i.exec(pattern);
  const authority = parts?.[2];
  if (!parts || !authority || !/^(?:\[[^\]]+\]|[^:@]+)(?::[0-9]+)?$/.test(authority)) {
    throw new Error('Use an HTTP(S) URL with a hostname and optional numeric port.');
  }
  // URL serialization can encode raw hostname stars (Chromium) or decode %2A
  // (Node). Preserve syntax here; URLPattern canonicalizes the literal hostname.
  const hostname = authority.startsWith('[')
    ? authority.slice(0, authority.indexOf(']') + 1)
    : authority.split(':')[0]!;
  const schemes = parts[1] === '*' ? ['http', 'https'] : [parts[1]!.toLowerCase()];
  return schemes.map((scheme) => {
    // Parse each scheme separately: :80 and :443 have different default semantics.
    const url = new URL(`${scheme}://${authority}${parts[3] ?? '/'}`);
    return new URLPattern({
      protocol: scheme,
      hostname: literalComponent(hostname),
      port: url.port,
      pathname: literalComponent(url.pathname),
      search: '*',
      hash: '*',
    });
  });
}

// Shared by matching and preview so unsupported input is distinct from no match.
export function parseGroupingCandidate(candidate: string): URL | undefined {
  if (candidate.trim() !== candidate || /[\\\p{Cc}]/u.test(candidate) || !/^https?:\/\/[^/]/i.test(candidate)) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

export function compileGroupingRules(raw: unknown): Compilation {
  if (!Array.isArray(raw) || raw.length > 100) {
    return { kind: 'invalid', message: 'Grouping rules must be an array of at most 100 rules.' };
  }
  const entries: { rule: GroupingRule; patterns: URLPattern[] }[] = [];
  for (let ruleIndex = 0; ruleIndex < raw.length; ruleIndex++) {
    const value: unknown = raw[ruleIndex];
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      !Object.hasOwn(value, 'pattern') || !Object.hasOwn(value, 'group') ||
      Reflect.ownKeys(value).length !== (Object.hasOwn(value, 'enabled') ? 3 : 2) ||
      (Object.hasOwn(value, 'enabled') && typeof (value as Record<string, unknown>).enabled !== 'boolean')) {
      return { kind: 'invalid', ruleIndex, message: 'Each rule must contain only pattern and group, with optional boolean enabled.' };
    }
    const { pattern, group, enabled } = value as Record<string, unknown>;
    if (typeof pattern !== 'string' || !validText(pattern, 2048) || pattern.includes('\\')) {
      return { kind: 'invalid', ruleIndex, message: 'Pattern must be 1–2048 characters without surrounding whitespace, controls or backslashes.' };
    }
    if (pattern.includes('?') || pattern.includes('#')) {
      return { kind: 'invalid', ruleIndex, message: 'Query and fragment syntax is unsupported in grouping patterns.' };
    }
    if (typeof group !== 'string' || !validText(group, 80)) {
      return { kind: 'invalid', ruleIndex, message: 'Group must be 1–80 characters without surrounding whitespace or controls.' };
    }
    try {
      entries.push({ rule: Object.freeze({ pattern, group, ...(Object.hasOwn(value, 'enabled') ? { enabled: enabled as boolean } : {}) }), patterns: compilePattern(pattern) });
    } catch {
      return { kind: 'invalid', ruleIndex, message: 'Pattern must be a valid HTTP(S) URL with a hostname and optional numeric port.' };
    }
  }
  const rules = Object.freeze(entries.map(({ rule }) => rule));
  return {
    kind: 'ready', rules,
    match(candidate: string): GroupingRule | undefined {
      const url = parseGroupingCandidate(candidate);
      return url ? entries.find(({ rule, patterns }) => rule.enabled !== false && patterns.some((pattern) => pattern.test(url.href)))?.rule : undefined;
    },
  };
}
