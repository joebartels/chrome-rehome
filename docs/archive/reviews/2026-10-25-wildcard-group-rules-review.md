# Task 001 whole-feature review

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Reviewed range: `historical-revision..historical-revision`; verified checkout HEAD `historical-revision`.

## Strengths

- `src/rules/grouping.ts:13` and `src/rules/grouping.ts:32`: the adapter escapes native grouping/modifier syntax and constructs explicit URLPattern components. Actual candidate matching at line 78 is native `URLPattern.test`; the implementation adds neither a handwritten matcher nor a fallback/dependency. Query/hash components are ignored deliberately, while configured query/fragment syntax is rejected before compilation.
- `src/rules/grouping.ts:23`: retaining raw hostname syntax before native canonicalization addresses the documented Node/Chromium raw-star versus encoded-star difference without broadening encoded literals. Each scheme is separately parsed at line 31, so `*://` with explicit 80/443 retains the correct per-protocol port behavior. Literal paths, encoded delimiters, host/path case, IDN and IPv6 are exercised in the shared native-runtime corpus.
- `src/rules/grouping.ts:43`: all rules validate before any ready result is returned; limits, exact fields, copied/frozen records and first-match order form a small coherent public contract. The mutation test at `tests/unit/grouping.test.ts:28` verifies that changing the original inputs cannot alter matching, not merely that a freeze flag is set.
- `src/config/schema.ts:17` and `src/config/schema.ts:28`: strict v1 compatibility and strict v2 validation converge on the same immutable canonical shape, with useful one-based rule positions in config errors. The unchanged repository keeps migration loads write-free and performs canonical writes only on explicit saves. Existing stale-read, subscriber and failed-write assertions retain their original meaning after the schema update.
- `tests/browser/foundation.spec.ts:108`: Chromium executes the actual compiler in a temporary test-only bundle, using the same independently specified examples as Node. The extension smoke separately verifies storage preservation, healthy v2 status, v1 migration, invalid/future errors and unchanged real tab/group placement. No production hook or test bundle is introduced.
- Documentation accurately distinguishes the completed matcher/configuration contract from unfinished organization features. The full diff contains no dependency, manifest permission, worker implementation, options implementation or repository implementation change; Tasks 002–010 remain TODO.

## Issues

### Critical

None.

### Important

None.

### Minor

1. **The rules source guard can classify a scoped package as a local rules module.**
   - Location: `scripts/check-package.mjs:34`, `scripts/check-package.mjs:39`, `scripts/check-package.mjs:49`; regression coverage: `tests/unit/boundaries.test.ts:21`.
   - `layer("@vendor/rules")` returns `rules`, so the rules-layer condition accepts that non-relative specifier. Unlike config, rules does not have an explicit rejection of non-relative imports. The task reviewer already demonstrated this with a focused temporary-source probe; direct inspection confirms the path through the guard.
   - Impact is prospective policy coverage, not a current matching or migration defect. Current rules source has no external import, dependencies are unchanged, and full package graph checks at lines 86/91/93 also reject emitted external/non-source dependencies. The source-only and erased-type-import guard remains incomplete.
   - Recommendation: apply the existing non-relative-specifier rejection to both config and rules, and add a scoped-package case (including a type-only import if practical).
   - **Triage of the sole parked item:** retain as a non-blocking Minor follow-up. It does not invalidate Task 001 or require another implementation/review cycle before the requested pause. This report records the item explicitly; it has not been silently dropped or represented as fixed.

## Recommendations

Accept Task 001 and pause before Task 002 as requested. Keep the scoped-import guard improvement visible for a later authorized tooling change. No feature corrections are required by this review.

## Declined to judge

- Automatic grouping, destination resolution, duplicate equivalence, closure/recovery and rule-editor/preview UI: explicitly excluded from Task 001 and owned by later backlog tasks.
- Chrome 120/current-stable release qualification, hosted CI and expanded performance budgets: not established by the supplied local Chromium run; release readiness remains Task 010.
- General robustness of the pinned TypeScript 7 unstable scanner for future syntax: the documented preexisting no-progress case is avoided by current source and fresh checks pass; changing the scanner is outside this feature.
- Adversarial JavaScript proxies/getters as configuration objects and non-string calls to the typed `match(url: string)` API: outside the persisted Chrome JSON configuration and typed candidate contract reviewed here.

## Assessment

**Ready to merge? Yes, for the Task 001 scope.** This is a review verdict, not authorization to merge or start another task.

**Reasoning:** The native wildcard adapter, schema migration and cross-layer integration satisfy the approved design without introducing browser mutations or dependencies. No Critical or Important issue remains; the sole Minor finding is a narrowly bounded source-policy gap with no current runtime effect.

## Evidence and review limits

- Read the approved Task 001 brief, design, implementation plan, full supplied diff in bounded chunks, implementation report, task-review report and progress ledger. Re-read the package policy and unchanged config repository for cross-layer reasoning. Recovered the initially truncated documentation/ledger output with bounded reads.
- Verified the reviewed HEAD and clean tracked working tree before review. This review changed no source, tests, index, HEAD or branch state; its only output is this requested ignored report.
- Accepted the controller's fresh verification at `historical-revision`: 306/306 tests across 13 files, 6/6 isolated browser tests, typecheck, build and package validation pass. The implementation report separately records RED/GREEN evidence, native-runtime diagnosis and final successful checks.
- Did not rerun established suites or duplicate the previous reviewer's focused probes. Direct code inspection and the existing evidence resolved the reviewed questions; no new concrete uncertainty justified another execution probe.
