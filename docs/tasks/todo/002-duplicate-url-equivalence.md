# 002: Duplicate URL equivalence

Status: COMPLETE (implemented and locally verified 2026-10-25; independent review tracked in the task ledger)

Depends on: Foundation

## Outcome

Build a pure duplicate identity function independent of grouping. Compare explicit canonical keys, not edit distance or general string similarity. Preserve the actual navigation URL.

## Integration points

rules/duplicates.ts; versioned equivalence configuration; normalization fixtures.

## Acceptance criteria and decisions

- [x] Decide per-site tracking-parameter ignore lists, fragment handling, trailing slashes, and query ordering. Preserve meaningful values and repeated parameters unless an explicit rule says otherwise.
- [x] Default to conservative canonical URL identity; never merge different issue, PR, file, or document IDs.
- [x] Include browsing-context separation in candidate eligibility; normal and incognito contexts must never merge.
- [x] Test tracking variants, meaningful query differences, encoded path delimiters, case-sensitive paths, fragments used as routes, and unsupported schemes.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.

## Implemented contract

`compileDuplicateRules(unknown)` returns immutable validated rules and `identify({url, incognito})`/`equivalent(left, right)` or an indexed atomic error. Native `URL.href` provides conservative defaults. Exact canonical origins are unique; each rule explicitly supplies ignored decoded query names and all three boolean normalization flags. No implicit tracking list applies. Fragments/hash routes, trailing slashes and query order remain significant unless that origin opts in. Stable native name sorting preserves repeated-value order; raw retained query tokens preserve encoding spelling, invalid bytes, empty fields and no-equals values. Empty fields keep their remaining slots during sort. Context-qualified opaque JSON tuple keys separate normal/incognito and must not be persisted, logged or navigated to. Invalid candidates never match.

Canonical configuration is strict schema 3 with both `groupingRules` and `duplicateRules`. Strict v1/v2 migrate in memory without writes; v2 grouping values remain unchanged. Only explicit saves write canonical v3; invalid and future data stay untouched. Rule caps are 100, origin length 1–2048 and at most 100 distinct ignored names of length 1–256 UTF-16 code units, all trimmed and control-free.

Verification includes shared hand-specified Node 24/Chromium cases, compiler validation/immutability tests, migration and storage ordering/failure regressions, narrow source/dependency guard regressions, typecheck, build/package checks and isolated Chromium extension checks. Actual Chrome 120/current-stable release qualification, CI and performance budgets remain Task010. No runtime duplicate consumer, winner selection, tab mutations or Task003 functionality is enabled.
