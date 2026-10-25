# 001: Wildcard group rules

Status: TODO

Depends on: Foundation

## Outcome

Build the pure grouping matcher and versioned group-rule configuration. Match only scheme + hostname + pathname; exclude query and fragment. First configured match wins. `*` is the only wildcard and matches zero or more characters including slashes.

## Integration points

rules/grouping.ts; config schema migration; options preview consumes this same matcher.

## Acceptance criteria and decisions

- [ ] Parse URLs with URL; preserve case-sensitive paths and escaped path boundaries. Define port handling explicitly.
- [ ] Escape every non-wildcard character; do not interpret patterns as arbitrary regular expressions. Bound pattern length and rule count.
- [ ] Reject query/fragment syntax in configured group patterns with a useful error rather than implying support.
- [ ] Test GitHub root versus /*, wildcard across nested paths, query/hash exclusion, literal regex characters, overlapping rules, malformed patterns, and unsupported schemes.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.
