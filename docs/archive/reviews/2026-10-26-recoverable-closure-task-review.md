# Task006 task review — historical-revision..historical-revision

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

## Spec Compliance

- ❌ Issues found: the post-removal receipt validator does not establish global target absence. A target still present outside the captured affected windows is accepted as removed, and subsequent duplicates can close (`src/execution/replacement.ts:41`, particularly the affected-window filter at line44). This violates the explicit fulfilled-but-present stop and authoritative-absence requirements.
- The requested production modules, journal adapter, checkpoint hooks, immutable receipt, removal lease, shared recovery admission, truthful options copy and upgrade/privacy/recovery documentation are present. The only extra production changes are preservation of present-undefined pendingUrl and its structural type, justified by the specified property-presence guard (`src/browser/snapshots.ts:54`; `src/planning/candidates.ts:10`).
- ⚠️ The brief explicitly lists `tests/integration/coordinator.test.ts`, canonical design/plan updates and a durable `docs/archive/reviews/` completion report. Those files have no hunk in this task package. Equivalent new coordinator/admission coverage lives in `tests/integration/recovery.test.ts:24`; the author explicitly assigns final canonical/document bookkeeping to the controller (`task-1-report.md:3`). Controller must resolve this listed-file deviation and finish the durable completion artifacts before declaring the entire task complete. It is not evidence of an additional runtime defect.
- ⚠️ Chrome120/current-stable, enabled-incognito, actual drag/rejection and user-facing focus/collapse manual trials remain unverified and explicitly outstanding in README and the author report. Automated Chromium tests do not replace them.
- ⚠️ No deterministic real-browser stop inside an outstanding native API call is established. The fixture honestly distinguishes pending-before-invocation from native-remove-fulfilled-before-checkpoint; the discarded-worker deferred unit tests provide the modeled late-effect guarantee (`tests/browser/replacement-recovery.spec.ts:85`; `tests/integration/recovery.test.ts:36`).

## Strengths

- Native calls remain queue-owned through actual settlement. Placement persists pending before rerunning full preflight, performs settlement bookkeeping on both resolve/reject, preserves native rejection identity, and records verification only after observation (`src/execution/placement.ts:139`). Queue tests cover both a prolonged unresolved call and failed settlement persistence without letting later mutation through (`tests/unit/operation-queue.test.ts:85`).
- Closure independently captures passive documents; missing/error/nonactive/subframe evidence gates closure while configured placement remains possible. It retains a detached frozen receipt and compares survivor order/location/group metadata against that receipt minus the removal prefix (`src/execution/replacement.ts:25`; `src/execution/placement.ts:250`; `tests/unit/replacement-execution.test.ts:20`).
- Journal parsing and storage are bounded, detached, and structurally strict. Failure blocks without repair writes; the single session key adapter neither touches local storage nor changes access level (`src/execution/journal.ts:38`, `src/execution/journal.ts:88`; `src/browser/journal-storage.ts:3`).
- Removal credits require an originally current lease and an explicitly armed allowlisted ID, are spent once, survive delayed own events, and cannot revive stale state. Replacement events use an uncreditable path; consumer disposal is in finally (`src/background/navigation.ts:46`, `src/background/navigation.ts:116`; `src/background/placement.ts:57`).
- Production registers listeners before initialization and joins configuration with recovery on the same queue. Recovery never replays old mutations, and pending/invalid records never open admission (`src/background/index.ts:10`; `src/background/coordinator.ts:32`; `src/background/recovery.ts:12`).
- Browser evidence is unusually explicit about its limits: unchanged-dist seeded tests, actual temporary phase fixtures, simulated faults and native effects are separated. All69 retained JSON files were readable:34 worker records assert stopped/fresh realm,25 phase records cover the named gates,7 seeded records preserve identical parsed records, and3 record native effects. No phase claims a native call was outstanding.

## Issues

### Critical (Must Fix)

- None found in this task-scoped review.

### Important (Should Fix)

1. **Require target absence across the full snapshot before verifying a removal.** `src/execution/replacement.ts:41`–44 filters `actualTabs` to the original `windows`; the post-call `observe(receipt, nextRemoved)` also skips every ID in `nextRemoved` during document validation. Therefore an attempted target that remains alive after moving to another normal window disappears from the comparison, is pushed into the verified removal prefix, and no longer gates subsequent closure. This is the same required fulfilled-but-present failure case, with a location change that the existing test misses.

   Focused reproduction used the existing `replacementFixture()` and real executor with an in-memory wrapper: on remove(2), relocate tab2 to window999 and normalize the original window without deleting tab2; use the existing native fake for later removals. Observed result: `kind: completed`, `removedTabIds: [2,3]`, calls `relocated-instead:2`, `remove:3`, while live tab2 still exists in window999. No stale-event injection is needed, and the receipt is otherwise coherent.

   Fix: before affected-window filtering, reject any snapshot containing an ID asserted absent (or at minimum the newly attempted target), so absence is global within the authoritative all-normal-windows snapshot. Keep the existing survivor/location checks. Add a regression asserting stopped, no verified ID2, uncertainRemovalId2, and no remove(3) when the fulfilled target remains in another window. Include the same invariant for subsequent verification snapshots; do not weaken it to original-window absence.

### Minor (Nice to Have)

1. `tests/browser/replacement-recovery.spec.ts:85`, `tests/browser/replacement-recovery.spec.ts:109`, and `tests/unit/replacement-execution.test.ts:38`: substantial setup, phase transitions and assertions are compressed into very long single lines. The coverage is meaningful, but this makes the safety argument and future failure diffs needlessly difficult to inspect. Format the new tests into normal statements and extract only repeated scenario/assertion helpers; retain the actual phase assertions and evidence labels.
2. `src/background/recovery.ts:20`: the participant-presence `map` result is discarded. Admission intentionally does not depend on presence, so the map does not implement a useful classification or affect safety. Either make the observation an explicit internal result used by reconciliation, or remove the dead computation and explain that the successful snapshot read is the sole reconciliation gate. Do not persist additional metadata or turn presence into replay authority.

## Checks and Review Boundaries

- Read the brief first, binding global constraints, canonical design, author report, and complete supplied diff. No git recomputation, index/HEAD/source changes or broad codebase crawl.
- Tool-output truncation required recovering only the cut-off documentation portions of the package. One changed-file read was necessary because the placement validate/read/observe functions were omitted between diff hunks: `src/execution/placement.ts:45`–136. Named risk: expanding the affected-window set must preserve passive participant metadata/order and all preflight checks, rather than silently rebase the receipt. Those existing functions do preserve the intended guarded state.
- Checked retained final logs:853/853 tests across26 files;94/94 browser tests; successful build/package output; typecheck log is empty as reported. No warning/error/deprecation noise was found in the final browser log. Did not rerun any routine suite or regenerate evidence.
- Parsed all69 retained browser JSON files and checked counts, phase labels, restart predicates, explicit non-outstanding labels and seeded record equality. This validates the retained evidence rather than independently repeating Chrome trials.
- Ran exactly one focused experiment for the named global-absence doubt using cached Node24 and esbuild with `write:false`, evaluating the existing fixture/executor in memory. It reproduced Important1. No experiment files were created, and no suite was broadened.
- Existing unchanged config, planning, package scanner and event adapter contracts are relied upon through the diff context and retained tests. Full-feature review remains a separate controller gate.

## Assessment

**Task quality: Needs fixes.**

The write-ahead ordering, failure barriers, lease feedback and restart quarantine are cohesive and well exercised. The reproducible global-target-absence gap prevents approval because the executor can report an unverified close as complete and continue destructive work; fix and regress that case before scoped re-review.
