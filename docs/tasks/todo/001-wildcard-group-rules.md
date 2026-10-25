# 001: Wildcard group rules

Status: COMPLETE (implemented and locally verified; independent review tracked in the task ledger)

Depends on: Foundation

## Outcome

Build the pure grouping matcher and versioned group-rule configuration. Match only scheme + hostname + pathname; exclude query and fragment. First configured match wins. `*` is the only wildcard and matches zero or more characters including slashes.

## Integration points

rules/grouping.ts; config schema migration; options preview consumes this same matcher.

## Acceptance criteria and decisions

- [x] Parse URLs with URL; preserve case-sensitive paths and escaped path boundaries. Define port handling explicitly.
- [x] Escape every non-wildcard character; do not interpret patterns as arbitrary regular expressions. Bound pattern length and rule count.
- [x] Reject query/fragment syntax in configured group patterns with a useful error rather than implying support.
- [x] Test GitHub root versus /*, wildcard across nested paths, query/hash exclusion, literal regex characters, overlapping rules, malformed patterns, and unsupported schemes.

## Delivered contract

`compileGroupingRules(raw)` in `src/rules/grouping.ts` returns `{ kind: 'ready', rules, match(url) }` or `{ kind: 'invalid', message, ruleIndex? }`, with a zero-based rule index. Rules are strict `{ pattern: string, group: string }` objects; outputs are copied/frozen and the first matching configured rule wins. Validation rejects the whole document on any invalid rule. Future Tasks 003/007 reuse this pure API; automatic grouping and editor UI are not implemented here.

Matching uses native `URLPattern` component patterns after standard `URL` parsing and literal escaping. `*` alone is wildcard syntax (zero or more characters, including pathname slashes); adjacent stars collapse. Native named/regex group syntax stays literal, so `/:id` and `/(a|b)` match those paths only. Supported schemes are `http://`, `https://`, and `*://` for both. Numeric ports are supported; a missing/default port matches that scheme's default only, and non-default ports match exactly. The wildcard scheme compiles HTTP/HTTPS alternatives separately so explicit ports normalize correctly.

`https://github.com/example-org/sample/*` matches `/BarTab/` and `/BarTab/issues?x=1#y`, but excludes slashless `/BarTab`. `*.example.com` does not implicitly include the bare domain. Host case is normalized; path case and encoded slash boundaries are significant. Candidate queries/fragments are ignored. Literal `?`/`#` in patterns, credentials, backslashes, surrounding whitespace, controls, unsupported schemes and invalid URLs are rejected. Encoded `%3F`/`%23` are valid path literals. Limits: 100 rules, pattern length 1–2048 UTF-16 code units, group length 1–80; group labels reject surrounding whitespace and controls.

Canonical config is `{ schemaVersion: 2, enabled: boolean, groupingRules: readonly GroupingRule[] }`. Missing config is disabled v2; strict v1 migrates in memory with empty rules. Loads never write. Explicit validated v1/v2 saves write canonical v2. Invalid/future data is preserved and fails closed; existing repository concurrency behavior is unchanged. No new dependencies, browser permissions or runtime hooks were added.

Node 24 tests and isolated Chromium smoke cover the actual native matcher, rule preservation across reload, v1 migration without writes, invalid/future preservation, no tab/group movement, and worker restart. Chrome 120/current-stable release validation remains Task 010.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.
