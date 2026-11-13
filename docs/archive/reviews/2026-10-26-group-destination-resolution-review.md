# Independent whole-feature review — backlog 003

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Reviewed range: `historical-revision..historical-revision` (scope/design commit `historical-revision`, implementation commit `historical-revision`).

## Scope and evidence

Read the packaged whole-feature diff, approved design, implementation plan, binding constraints, implementation report and progress ledger. Independently assessed planner policy, orchestration, error effects, privacy, races, browser fixture isolation and package guards. Focused unchanged-code reads covered `browser/snapshots.ts` (non-atomic reads and narrowing), `background/operation-queue.ts` (settlement/rejection behavior), `background/coordinator.ts` and `background/index.ts` (future queue integration and current no-op consumer), and `rules/grouping.ts` (title validation compatibility).

No source, index, HEAD or branch changes; only this requested report was written. No subagents and no passing suites rerun. There was no unresolved suspicion requiring a focused executable probe. Verification evidence below is attributed to the implementation report, not claimed as a fresh reviewer run. Controller owns final verification and completion recording.

## Strengths

- `src/planning/group-destination.ts:21` validates concrete IDs, explicit context and the established title contract, including Unicode control characters. `:28` implements exact literal title equality, current matching-group preference, deterministic leftmost/numeric ties and conservative rejection of orphan or contradictory observations without mutating input. Foreign context/window observations cannot become valid candidates.
- `src/execution/group-placement.ts:29` keeps the whole operation inside an injected structural queue. The second observation controls every mutation and the already-grouped result; a torn first observation can recover without a retry loop. Post-group and post-title observations check membership, window, context, pinning and title before reporting success.
- `src/execution/group-placement.ts:46` distinguishes uncertain rejected grouping from successful grouping and successful titling. Original rejection causes survive, known IDs do not imply current membership, and failures trigger no rollback or duplicate-closing action. `:55` avoids knowingly overwriting an externally supplied nonempty new-group title.
- `src/browser/group-placement.ts:4` keeps Chrome operations narrow: explicit-window queries, one actual tab per grouping call and title-only updates. Detached snapshots remove URLs and unrelated fields before crossing into planning/execution; no logging, persistence, telemetry or permissions were added.
- `scripts/check-package.mjs:35` extends the existing source and bundle policy without changing package structure. It rejects erased forbidden type dependencies and scoped external-package paths that resemble allowed layers. Tests cover both allowed and rejected dependency shapes.
- The tests combine stateful fake-port effects and deterministic promise gates with a temporary real-browser fixture. They exercise creation, reuse, exact titles, concurrent missing-group requests, group disappearance, pinning and partial title failure. The fixture does not add a production endpoint. The report explicitly distinguishes Chromium evidence from unavailable incognito and release-matrix coverage.
- Future integration is bounded and documented: one retained placement service with its own shared queue, separate from an awaiting coordinator queue. The unchanged production entry still supplies `consume: async () => {}`. The feature introduces neither Task 004 implementation nor runtime activation.

## Issues

### Critical (must fix)

None found.

### Important (should fix)

None found.

### Minor (nice to have)

None requiring action in this changeset.

## Architecture and race assessment

The planner/port/service split is appropriate for the next execution layer: policy remains pure and the service does not import coordinator implementation details. Reusing the foundation queue structurally avoids unnecessary abstraction or relocation. The title validator matches the existing grouping compiler. Snapshot consistency checks are conservative for real browser observations; typed port implementations must preserve their structural contract.

The browser operations are not transactions. A drag, rename, pin or deletion after the last observation can race a mutation, and tab/group reads can be torn. The implementation checks what it can observe, reports post-mutation failure honestly, and makes no guarantee that would require a Chrome compare-and-swap primitive. A title rejection can leave an unnamed group; later requests do not silently adopt it. Serialization prevents duplicate creation only within the retained service/queue lifetime and successful observed sequence. These are explicit design limits, not hidden retries or claimed atomicity.

The existing coordinator cannot safely pass its currently executing queue into an awaited placement call. The design, architecture and README explicitly require a distinct grouping queue, so there is no current integration defect. Production activation must still implement URL/navigation-generation and closure preconditions; the current result cannot serve as authorization to close a duplicate.

## Verification assessment

The implementation report records Node 24 typecheck, 560 Vitest cases, build/package checks and 17 Playwright cases passing; it also records the subsequent focused service run after assertion-only changes. Browser evidence used Chromium 156.0.8078.4. I read the tests and the recorded outcomes, and did not independently rerun those suites. During this review the controller separately reported fresh verification on `historical-revision`: 560 tests, 17 Chromium tests, typecheck, build and package checks passed, with no code edits since the reviewed diff. This is controller-provided evidence; I did not rerun it.

## Recommendations

No corrective code change requested. Preserve the documented opt-in/no-op production boundary and stop before backlog 004. Keep the manual incognito and Chrome 120/current-stable release checks visibly unverified; do not count the capability query as incognito grouping coverage.

## Declined to judge

- Actual incognito grouping in an incognito-enabled extension profile: capability was false in the tested fixture; this review cannot establish live behavior from pure context tests or the capability query. The task explicitly permits this documented manual check.
- Chrome 120-floor and current-stable release behavior: the reported browser is Chromium 156.0.8078.4, not either claimed release-matrix result; those release checks remain outstanding.
- Navigation-generation/URL freshness, duplicate selection, replacement positioning and closure safety: these belong to later execution tasks and have no production caller here; this review assesses the primitive's explicit observation contract only.
- Cross-service/worker-restart coordination and crash recovery: no durable queue, global lock or journal is part of Task 003. The implementation does not claim those guarantees.
- Exact final tab index, active-tab visibility and collapsed-state preservation: Chrome can reposition or expand a group during native grouping, and the approved contract explicitly excludes those browser-owned guarantees.
- General-purpose security enforcement for arbitrary JavaScript syntax by the package scanner: it is an existing project policy guard, not a JavaScript sandbox; the new scoped source/graph dependency requirements are covered and were reviewed.

## Assessment

**Ready to merge? Yes**, for backlog 003's opt-in primitive. The controller reports fresh verification passed; completion/status recording remains its responsibility.

**Reasoning:** The feature meets the approved policy and binding constraints, keeps production inactive, and provides coherent placement/error contracts with appropriate browser and deterministic race evidence. No actionable architecture or correctness defect was found; the unverified browser environments and later execution responsibilities remain explicit.
