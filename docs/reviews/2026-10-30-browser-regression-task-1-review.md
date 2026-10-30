### Spec Compliance

- ✅ Spec compliant for Task1 at base1432e3d..heade6bfd21. All10 implementation files named in the report have corresponding hunks. The changes are limited to browser selection, CI, a dependency-free result checker, unit/browser tests and the coverage matrix; package.json changes scripts only. No production source, dependency, permissions, schema, activation-default or version change appears in the reviewed changeset.
- ✅ Explicit disjoint selection, darwin-only native registration, native precedence and CI forbidOnly preserve workers1/retries0/fullyParallelfalse (playwright.config.ts:3–17). Existing native cases retain their phases/assertions; only their tags/platform skip statements change (tests/browser/external-app-links.spec.ts:226; tests/browser/replacement-placement.spec.ts:312,358,377; tests/browser/replacement-recovery.spec.ts:476,512).
- ✅ Required new genuine browser outcomes are present against the existing production-dist fixture: CDP typed input with actual committed metadata, positive same-document changed-URL navigation, ordinary HTTP302 redirect, incoming identity/back-forward history/manual duplicate precedence and exact survivor state (tests/browser/replacement-placement.spec.ts:498); pinned incoming and pinned older exclusion cases retain exact relevant IDs/order/grouping (tests/browser/replacement-placement.spec.ts:554,579).
- ✅ The CLI gate rejects malformed/missing reports, zero selected requested projects, nonpassing/skipped/flaky/unexpected/pending/empty/retried results, configured retries, count mismatch and runner/test errors; acceptance requires exactly one passing attempt (scripts/check-browser-results.mjs:20–49). The CLI unit contracts exercise valid two-project acceptance and21 final cases (tests/unit/browser-results.test.ts:28–63).
- ✅ Linux CI installs bundled Chromium/dependencies, uses Xvfb for explicitly selected portable+headed projects, preserves pipeline failure, applies the JSON gate, and uploads raw report/log and test artifacts on failure or success (.github/workflows/ci.yml:21–39). Documentation distinguishes production, instrumented, native and manual evidence (docs/testing/browser-regression-matrix.md:5–65).
- ⚠️ Cannot verify from this diff: actual Ubuntu hosted behavior. Controller should observe one hosted portable+headed run, retain its raw JSON/log and artifacts, and require both projects to pass the result checker; local macOS results do not certify that environment.
- ⚠️ Cannot verify from this diff: native28 execution and Task2's acknowledgment barriers/admission diagnostics. These are explicitly deferred, with native cases collected only. Task2 must retain all original phase/journal/survivor assertions and produce its complete supported-lane JSON/log.
- ⚠️ Cannot verify from this diff: final coherent0.1.2 handoff and all four synchronized source version fields/rebuilt dist. Task1's unchanged internal0.1.1 is allowed. Controller should check these during Task2 closeout, together with the eight-file/three-graph/five-permission/Chrome120 package contract.
- ⚠️ Cannot verify from this diff: trusted omnibox, native tab-menu capture, interactive drag, Spaces automation, other OS native launch routing, or Chrome120/current-stable release qualification. The matrix correctly leaves these manual/release limitations (docs/testing/browser-regression-matrix.md:65).

### Strengths

- The five new cases close concrete Chrome-owned coverage gaps without duplicating existing focus/recovery matrices or instrumenting the production worker. The typed test honestly labels CDP stimulus and checks Chrome's actual transition metadata; SPA checks document identity; redirect checks server_redirect (tests/browser/replacement-placement.spec.ts:498).
- The pinned tests exercise the complete replacement path, including a pinned older tab preceding the eligible manual anchor; the incoming exclusion observes a later real admitted grouping instead of an absence sleep (tests/browser/replacement-placement.spec.ts:554,579).
- The checker validates actual reporter shape through subprocess contracts, checks every selected test result, and independently requires nonempty named projects. Full-run raw evidence confirms all132 selected results passed exactly once with retry0, with zero report errors/skips/unexpected/flaky cases (scripts/check-browser-results.mjs:20–45; browser-full.json).
- Native collection is explicit and visible rather than platform-skipped. The retained160-case inventory has125 portable,7 headed and28 native entries, disjoint by file/line/title; the diff adds five cases and removes no legacy phases or assertions (playwright.config.ts:13–17; inventory-checked.json).
- Raw RED evidence shows the valid-report contract failing because validation was unimplemented, followed by20/20 GREEN and21 final gate cases. Initial pinned fixture failures and their logs/traces remain preserved rather than reclassified (gate-contract-red.log; gate-green.log; focused-browser.json).

### Issues

#### Critical (Must Fix)

- None found.

#### Important (Should Fix)

- None found.

#### Minor (Nice to Have)

- None found.

### Checks and Evidence

- Read the binding full design, Task1 brief, author report, coverage audit and the complete728-line review package once in three bounded chunks. No Git commands, source/index/HEAD mutations, tests, builds, browser processes, CUA or subagents were run.
- Named risk: lane tags could claim headed coverage while preserving a headless fixture, or introduce a Linux-only macOS activation failure. Focused unchanged-context inspection checked controls.spec.ts:11–29 and replacement-placement.spec.ts:27–47: they still launch real headed contexts where requested. owned-browser-focus.ts:6–31 returns on non-darwin and derives/activates only the owned browser PID on darwin. The actual popup hunk was cut mid-function; its continuation was inspected at controls.spec.ts:177–225 to confirm retained actual-action, trusted-keyboard and incognito assertions. No other unchanged production code was inspected.
- Parsed retained browser-full.json:132 tests,125 portable+7 headed, expected132/skipped0/unexpected0/flaky0/errors[], and every result status passed/retry0/exactly one attempt. The five new browser outcomes are present at lines498/554/579.
- Parsed retained unit-full.json:1374 passed,0 failed/pending/todo, success true; unit-full.log confirms45 files. The final CLI gate contributes21 test assertions.
- Inspected retained inventory-checked.json and inventory-check.py:160 unique file/line/title keys, nonempty125/7/28 lanes, tag/project equivalence. These are collection evidence only.
- Inspected browser-full-gate.log, focused-browser-gate.log, missing-native-gate.log and gate-invocations.json: the full two-project report passes; the actual failed focused report is rejected; requesting the unexecuted native project is rejected as zero selected.
- Inspected pre-build-sha256.json against package-identity.json: all eight distribution hashes plus metafile match; bundleGraphs contains the same three JS outputs. platform.json records source/dist0.1.1 and macOS arm64. build/typecheck logs are empty, package.log reports success, and final unit/browser logs contain no warning/deprecation/error noise beyond words in test titles.
- Evidence root: EXTERNAL_EVIDENCE/task009-task1-evidence Reported execution evidence was inspected, not rerun.

### Assessment

**Task quality:** Approved.

**Reasoning:** Task1 adds the requested narrow packaged regressions and a strict, visible lane/result contract while preserving legacy assertions and production artifacts. Current raw evidence supports the reported portable/headed success; native execution, hosted Linux observation and final0.1.2 closeout remain explicit later checks.
