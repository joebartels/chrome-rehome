export type DuplicateRule = Readonly<{
  origin: string;
  ignoreQueryParameters: readonly string[];
  ignoreFragment: boolean;
  ignoreTrailingSlash: boolean;
  sortQueryParameters: boolean;
}>;

export type DuplicateCandidate = Readonly<{ url: string; incognito: boolean }>;

type Compilation =
  | { kind: 'ready'; rules: readonly DuplicateRule[];
      identify(candidate: DuplicateCandidate): string | undefined;
      equivalent(left: DuplicateCandidate, right: DuplicateCandidate): boolean }
  | { kind: 'invalid'; message: string; ruleIndex?: number };

function validText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    value.trim() === value && !/\p{Cc}/u.test(value);
}

function parseCandidate(value: unknown): URL | undefined {
  if (typeof value !== 'string' || value.trim() !== value || /[\\\p{Cc}]/u.test(value) ||
    !/^https?:\/\/[^/]/i.test(value)) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password) return url;
  } catch { /* Malformed candidates have no identity. */ }
  return undefined;
}

// Native parsing supplies decoded names. Keep raw tokens separately because
// URLSearchParams serialization changes escapes, spaces and invalid UTF-8 bytes.
function normalizeQuery(url: URL, rule: DuplicateRule): void {
  if (!url.search || (!rule.ignoreQueryParameters.length && !rule.sortQueryParameters)) return;
  const names = [...url.searchParams.keys()];
  let nameIndex = 0;
  const retained = url.search.slice(1).split('&').flatMap<{ raw: string; name: string | undefined }>((raw) => {
    if (!raw) return [{ raw, name: undefined }];
    const name = names[nameIndex++]!;
    return rule.ignoreQueryParameters.includes(name) ? [] : [{ raw, name }];
  });
  if (rule.sortQueryParameters) {
    const order = new URLSearchParams();
    retained.forEach(({ name }, index) => { if (name !== undefined) order.append(name, String(index)); });
    order.sort(); // Native stable UTF-16 name ordering; equal-name values stay in order.
    const sorted = [...order.values()].map((index) => retained[Number(index)]!);
    let sortedIndex = 0;
    // Empty fields have no decoded name; preserve their retained positions.
    for (let index = 0; index < retained.length; index++) {
      if (retained[index]!.name !== undefined) retained[index] = sorted[sortedIndex++]!;
    }
  }
  // A retained empty field still owns a query marker. Removing every token does not.
  url.search = retained.length ? '?' + retained.map(({ raw }) => raw).join('&') : '';
}

export function compileDuplicateRules(raw: unknown): Compilation {
  if (!Array.isArray(raw) || raw.length > 100) {
    return { kind: 'invalid', message: 'Duplicate rules must be an array of at most 100 rules.' };
  }
  const byOrigin = new Map<string, DuplicateRule>();
  const rules: DuplicateRule[] = [];
  const keys = ['origin', 'ignoreQueryParameters', 'ignoreFragment', 'ignoreTrailingSlash', 'sortQueryParameters'];
  for (let ruleIndex = 0; ruleIndex < raw.length; ruleIndex++) {
    const value: unknown = raw[ruleIndex];
    const invalid = (message: string): Compilation => ({ kind: 'invalid', ruleIndex, message });
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Reflect.ownKeys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) {
      return invalid('Each duplicate rule must contain only origin, ignoreQueryParameters and the three boolean flags.');
    }
    const { origin, ignoreQueryParameters, ignoreFragment, ignoreTrailingSlash, sortQueryParameters } = value as Record<string, unknown>;
    if (!validText(origin, 2048) || origin.includes('\\') || origin.includes('*') || origin.includes('@') ||
      origin.includes('?') || origin.includes('#') || !/^https?:\/\/[^/]+\/?$/i.test(origin)) {
      return invalid('Origin must be an exact HTTP(S) origin of 1–2048 characters, with only an optional final slash.');
    }
    const url = parseCandidate(origin);
    // Node serializes hostname stars literally; Chromium can retain their %2A spelling.
    if (!url || url.hostname.includes('*') || url.hostname.toLowerCase().includes('%2a')) {
      return invalid('Origin must be a valid exact HTTP(S) origin without wildcards.');
    }
    if (byOrigin.has(url.origin)) return invalid('Duplicate canonical origin.');
    if (!Array.isArray(ignoreQueryParameters) || ignoreQueryParameters.length > 100 ||
      ![...ignoreQueryParameters].every((name: unknown) => validText(name, 256)) ||
      new Set(ignoreQueryParameters).size !== ignoreQueryParameters.length) {
      return invalid('Ignored query names must be at most 100 distinct names of 1–256 characters, without surrounding whitespace or controls.');
    }
    if (typeof ignoreFragment !== 'boolean' || typeof ignoreTrailingSlash !== 'boolean' || typeof sortQueryParameters !== 'boolean') {
      return invalid('All three duplicate normalization flags must be boolean.');
    }
    const rule = Object.freeze({ origin, ignoreQueryParameters: Object.freeze([...ignoreQueryParameters] as string[]),
      ignoreFragment, ignoreTrailingSlash, sortQueryParameters });
    rules.push(rule);
    byOrigin.set(url.origin, rule);
  }
  function identify(candidate: DuplicateCandidate): string | undefined {
    if (!candidate || typeof candidate.incognito !== 'boolean') return undefined;
    const url = parseCandidate(candidate.url);
    if (!url) return undefined;
    const rule = byOrigin.get(url.origin);
    if (rule) {
      if (rule.ignoreFragment) url.hash = '';
      if (rule.ignoreTrailingSlash) url.pathname = url.pathname.replace(/\/+$/, '') || '/';
      normalizeQuery(url, rule);
    }
    return JSON.stringify(['chromerehome:duplicate:v1', candidate.incognito, url.href]);
  }
  return {
    kind: 'ready', rules: Object.freeze(rules), identify,
    equivalent(left, right) {
      const key = identify(left);
      return key !== undefined && key === identify(right);
    },
  };
}
