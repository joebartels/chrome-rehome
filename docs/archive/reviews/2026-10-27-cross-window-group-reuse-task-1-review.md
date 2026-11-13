# Task 1 review: remote existing-group resolution and placement

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

## Spec Compliance

- ✅ Spec compliant for the Task 1 changes in `historical-revision..historical-revision`. The seven planned implementation/test files all have corresponding changes. The optional resolver scope preserves omitted/explicit window behavior; production replacement alone opts into all-normal-windows (`src/planning/group-destination.ts:28`, `src/planning/replacement.ts:72`).
- Exact titles and matching incognito context remain required. The resolver checks relevant group coherence before selection and returns the actual chosen window. Current group wins, then local groups, then remote groups ordered by window/index/group ID (`src/planning/group-destination.ts:41`, `src/planning/group-destination.ts:51`, `src/planning/group-destination.ts:57`).
- Duplicate anchor selection still precedes rule lookup; grouped Manual B and ungrouped duplicates retain their destinations. Existing-group rule placement uses keep/end and selected shared groups are rejected without falling back to creation (`src/planning/replacement.ts:67`, `src/planning/replacement.ts:74`, `src/planning/replacement.ts:78`; `tests/unit/replacement.test.ts:56`).
- Tests cover remote reuse, scope preservation, current/local precedence, deterministic remote ties, case/context mismatch, malformed membership, duplicate precedence, selected shared groups, grouped and lone sources, unchanged member order, stale destination changes, and pending-write disappearance (`tests/unit/group-destination.test.ts:58`, `tests/unit/replacement.test.ts:49`, `tests/unit/placement.test.ts:122`). The consumer and browser cases exercise the production path; the browser case checks incoming ID/history, member order, unchanged groups, and absence of a source Group A (`tests/integration/placement-consumer.test.ts:165`, `tests/browser/replacement-placement.spec.ts:275`).
- ⚠️ Cross-task requirements cannot be verified by this Task 1 diff: foreground/background attention and journal changes belong to Task 2. Native focus/presentation is explicitly outside the reported portable browser evidence. The minimum Chrome 120 runtime is not exercised by the reported Chromium 156 browser run; the controller should retain the planned compatibility/package gate. Dependency, permission, schema, UI-control, and five-built-file constraints have no changed hunks here; final whole-branch/package verification remains the controller's gate.

## Strengths

- The production change is small and stays within the resolver and planner. It reuses the existing executor instead of introducing another placement path (`src/planning/group-destination.ts:28`, `src/planning/replacement.ts:72`).
- Sorting is independent of snapshot order, and returning the candidate's actual window avoids an inconsistent remote group/window pair (`src/planning/group-destination.ts:58`, `src/planning/group-destination.ts:63`).
- The added executor tests assert both resulting order and the exact native operations, including no creation/title operation, while stale destination tests require zero mutation (`tests/unit/placement.test.ts:122`). The integration fixture now models existing-group membership instead of always manufacturing a group (`tests/integration/placement-consumer.test.ts:64`).

## Issues

### Critical (Must Fix)

None found.

### Important (Should Fix)

None found.

### Minor (Nice to Have)

None found.

## Focused checks and verification evidence

- Read the review package once. The aggregate tool output truncated its opening production hunks, so recovered only the package's opening 110 lines. The replacement hunk cut off the containing function; read `src/planning/replacement.ts:1–99` to evaluate its coherence/shared checks and branch ordering.
- Named risk: the new optional/global API might inadvertently broaden legacy service scope or allow non-normal-window candidates. Focused call-site search and adapter reads confirmed legacy service calls omit options and read one window (`src/execution/group-placement.ts:39`, `src/browser/group-placement.ts:7`), while production reads all-normal-windows (`src/browser/placement.ts:9`). The snapshot reader uses tabs.query({windowType:'normal'}) and filters groups to selected windows (`src/browser/snapshots.ts:34`, `src/browser/snapshots.ts:37`, `src/browser/snapshots.ts:55`).
- Named risk: remote candidates could bypass planner coherence or shared-group rejection. The containing-function read confirmed coherentSnapshot runs before destination resolution and selected source/anchor/destination shared groups are rejected afterward (`src/planning/replacement.ts:28`, `src/planning/replacement.ts:60`, `src/planning/replacement.ts:78`).
- Reviewed the implementer's RED/GREEN and final validation report: initial 9 expected failures; subsequent 58/58 resolver/planner and 110/110 focused tests; final 989/989 Vitest tests, typecheck, build, package checks, and 9/9 browser tests. The initial sandbox EPERM browser fixture failure is documented with the successful exact-command escalated rerun; it does not indicate a code defect. These are reported results, not independently rerun results. No concrete unanswered test doubt required another execution.
- No test suites rerun; no code, index, HEAD, or branch edits made. Report written outside the repository as requested.

## Assessment

**Task quality: Approved.** The implementation meets Task 1's interface and selection contract with a narrow production diff and behavior-focused coverage through the resolver, planner, executor, consumer, and browser. No Critical, Important, or Minor findings were identified within this task's scope.
