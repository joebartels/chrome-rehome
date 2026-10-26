# Final whole-feature review — Task002

Reviewed range: `historical-revision..historical-revision`. Read the supplied full review package in bounded passes, Task002/design/plan, implementation and task-review reports, progress ledger, and existing repository/worker/snapshot seams. No source, index, HEAD, branch, package or test-output changes were made. This ignored report is the sole repository write.

## Strengths

- `src/rules/duplicates.ts:22,93`: conservative native href identity retains meaningful URL distinctions, requires explicit browsing context, rejects invalid pairs, and serializes an unambiguous namespaced tuple. No automatic replacement or navigation URL mutation was introduced.
- `src/rules/duplicates.ts:33`: decoded names come from the actual URL searchParams; retained raw tokens survive filtering and stable sorting without value reserialization. Repeats, malformed bytes, escape spelling, empty fields and markers receive substantive shared identity coverage.
- `src/rules/duplicates.ts:65,88`: atomic indexed validation, bounded configuration and copied/frozen public records prevent later caller mutation from changing compiled policy behavior.
- `src/config/schema.ts:28`: strict v1/v2 migration and v3 validation reuse both pure engines. Repository load/save ordering and write-failure behavior remain unchanged; existing and added tests retain no-write guarantees and legacy input preservation.
- `scripts/check-package.mjs:38`: config receives only the exact additional validator import, while rules retain browser/layer/external dependency restrictions with regression tests.
- `src/browser/snapshots.ts:10`, `src/background/index.ts:15`: the existing snapshot contract supplies explicit incognito metadata for future candidate selection; the worker remains a no-op. The future integration seam is viable without prematurely shipping selection/closure.
- Documentation clearly distinguishes configured equivalence from server semantics, warns that keys contain sensitive URL data, and leaves Tasks003–010 untouched.

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

1. **[P2] Encoded wildcard origins pass production Chromium validation.** `src/rules/duplicates.ts:78`; missing browser rejection coverage at `tests/browser/foundation.spec.ts:146` and Node-only assertion at `tests/unit/duplicates.test.ts:62`.

   The canonical-host guard checks only `url.hostname.includes('*')`. In Node24, `new URL('https://%2A.example.test').hostname` is `*.example.test`, so compilation rejects the rule. In bundled Chromium, the hostname is `%2A.example.test`, so the same actual compiler returns `ready`. Lowercase `%2a` has the same result. This breaks the specified no-wildcard rule/configuration contract and makes validation runtime-dependent. The exact-origin map still prevents ordinary subdomain wildcard matching; this is not an observed false merge or automatic tab-loss defect.

   Fix the hostname guard to reject both literal and canonically encoded star spellings, retaining native URL parsing. Add shared compilation rejection cases in Chromium and Node (including encoded wildcard spellings) and a small canonical-origin collision case. A browser harness that throws on every invalid compilation cannot verify these negative cases.

### Minor (Nice to Have)

No separate issue. The prior task-review coverage Minor is promoted to the concrete Important defect above, rather than counted twice.

## Verification and coverage triage

The controller reports fresh 446 unit/integration tests, 9 isolated Chromium tests, typecheck, build and package checks passing at `historical-revision`; these suites were not repeated. The implementation report contains RED/GREEN evidence. Passing existing suites does not cover the rejection defect.

A focused probe bundled the actual `src/rules/duplicates.ts` in memory with esbuild and evaluated it in Node24.22.1 and an isolated headless Chromium page. Inputs were two encoded wildcard origins and two ordinary/canonical-alias controls. Node rejected both wildcard inputs; Chromium accepted both; both runtimes accepted the controls. No network navigation, user browser profile or on-disk test bundle was used. The first sandboxed Chromium launch failed before evaluation with a macOS bootstrap permission error; the scoped escalated launch succeeded (exit0). This probe was justified by `src/rules/grouping.ts:24` explicitly documenting the same runtime serialization difference.

## Recommendations

Fix the narrow validation issue and add negative-compilation browser regression coverage before declaring Task002 complete. Run focused regression checks and required integration gates after that fix. Do not begin Task003.

## Declined to judge

- Winner selection, navigation eligibility and runtime candidate integration: explicitly deferred to Task004; the typed snapshot-to-candidate seam was checked for compatibility.
- Tab movement/grouping/closure and recovery guarantees: later tasks, deliberately absent from this change; confirmed the current worker consumer remains a no-op.
- Rule-editor/preview UI and persistence of keys: later UI work; current documentation and pure APIs provide the necessary contract and no key logging/persistence was added.
- Whether explicit equivalence flags match every server’s semantics: unknowable from URL syntax, explicitly user-configured policy; conservative defaults were reviewed.
- Actual Chrome120/current-stable qualification, hosted CI and performance budgets: explicitly Task010, not established by bundled Chromium or local reported results.
- Hostile JavaScript proxies/accessors and cross-process hostile objects: outside the documented typed/JSON input contract; ordinary malformed JSON-like values and immutable-copy behavior were reviewed.

## Assessment

**Ready to merge? With fixes.**

The feature otherwise matches the planned conservative, pure Task002 contract and preserves its integration boundaries. One narrowly reproduced Chromium validation defect must be corrected; no additional blocking issue was found.
