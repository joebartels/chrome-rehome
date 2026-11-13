# Task 008a final whole-feature source review

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Reviewed 29 October 2026. Range: `historical-revision..historical-revision` (three commits), using the supplied `EXTERNAL_EVIDENCE/2026-10-28-tab-context-protection/review-historical-revision..historical-revision.diff`. Binding requirements: the current right-clicked-tab protection design and implementation plan. This is a read-only source/integration review; no repository mutation, browser interaction, build, test rerun, or subagent dispatch was performed.

## Strengths

- **Exact clicked-tab authority is maintained.** The adapter accepts only its two explicit action IDs, copies bounded scalar identity from the singular supplied tab, and directly invokes the worker-only capability. It neither queries the selected/highlighted tabs nor changes selection, focus, placement, navigation, configuration, or global Pause. Explicit boolean intents make repeated Protect/Unprotect operations predictable. References: [tab-context-menu.ts:7](../../../src/browser/tab-context-menu.ts), [tab-context-menu.ts:54](../../../src/browser/tab-context-menu.ts).
- **The cold-worker and queue joins preserve authority.** Native observation and admission happen before the first await; readiness is outside the command writer; the captured generation is checked before entering the shared transaction. A later Pause can settle while recovery is held, and a superseded Unprotect cannot regain authority by waiting. The original observation remains live through queueing, persistence, readback, and final document verification. References: [controls.ts:115](../../../src/background/controls.ts), [controls.ts:130](../../../src/background/controls.ts), [coordinator.ts:36](../../../src/background/coordinator.ts).
- **Popup protection remains strict and the write core remains shared.** Distinct selected/by-ID factories share the private browser verification logic; the native factory changes selection policy only. Popup commands still pass their supplied document receipt to the same protection transaction. Native commands derive a receipt and verify it after persistence. Existing privacy-identity checks, registry capacity, postwrite failure latch, and removal bookkeeping are retained. References: [control-target.ts:8](../../../src/browser/control-target.ts), [control-target.ts:59](../../../src/browser/control-target.ts), [controls.ts:178](../../../src/background/controls.ts), [controls.ts:235](../../../src/background/controls.ts).
- **Menu lifecycle and processing failure domains are separate.** Registration is synchronous at worker evaluation; reconciliation serializes overlapping refreshes, updates persistent IDs before creating missing ones, and cleans up only the two owned items after failure. Callback lastError and synchronous unsupported-context errors are consumed. Readiness updates use a read-only notification path and do not invalidate the journal operation they describe. A menu capability failure records a generic diagnostic without changing control/store readiness. References: [tab-context-menu.ts:20](../../../src/browser/tab-context-menu.ts), [tab-context-menu.ts:26](../../../src/browser/tab-context-menu.ts), [tab-context-menu.ts:66](../../../src/browser/tab-context-menu.ts), [index.ts:21](../../../src/background/index.ts), [index.ts:40](../../../src/background/index.ts).
- **Scope and privacy boundaries are narrow.** Only contextMenus is added to the permission allowlist; the Chrome 120 floor remains. No protocol command, host access, content inspection, dependency, asset, schema, activation, rule, popup, retry/replay/reset, or native-operation settlement change appears in the feature diff. The menu records neither URLs nor raw error details. References: [manifest.json:5](../../../manifest.json), [check-package.mjs:61](../../../scripts/check-package.mjs), [package.test.ts:17](../../../tests/unit/package.test.ts).
- **Tests examine meaningful boundaries.** Added cases cover inactive identity versus popup selection, all four target-read awaits, same-URL document replacement, startup readiness and responsive Pause, competing intents, cleanup, private identity, persistence failures, and observer disposal. Adapter cases cover malformed metadata, stale/cold frontend status, callback failure privacy, lifecycle overlap, latest readiness, partial registration, and unsupported context. Real-browser boundary tests retain Chrome APIs/storage and explicitly identify their synthetic callback limitation. References: [native-protection-controls.test.ts:26](../../../tests/unit/native-protection-controls.test.ts), [control-target-currency.test.ts:72](../../../tests/integration/control-target-currency.test.ts), [tab-context-menu.test.ts:49](../../../tests/unit/tab-context-menu.test.ts), [tab-context-menu.spec.ts:11](../../../tests/browser/tab-context-menu.spec.ts).

## Issues

### Critical — must fix

None found in the reviewed source.

### Important — should fix

None found in the reviewed source. The acceptance evidence gaps below remain open; they are not product defects inferred from the lack of a native click.

### Minor — nice to have

None requiring a change. The current plan explicitly makes changes to the older controls/protection test files conditional on shared fixture needs. Concentrating native assertions in the dedicated test file is reasonable and does not warrant editing unrelated tests merely to satisfy an earlier file allocation.

## Integration and reasonable user expectations

The reviewed behavior supports a user who right-clicks an inactive or highlighted tab and expects only that tab's protection intent to change. There is no selected-tab fallback, global toggle, hidden activation, local state inversion, or optimistic success indicator. Both visible menu actions derive enablement from genuine control/recovery readiness. Existing popup state remains authoritative, and the approved session-only lifetime and older-Chrome popup fallback are preserved.

I specifically checked the unchanged joins around the diff for hidden integration conflicts:

- `controls.ts:46–104`: owned initial config/protection publication and pruning are narrowly exempt from generation invalidation; later invalidations remain effective. Status depends on pending work and runtime/store readiness, not saved enabled alone.
- `coordinator.ts:36–78`: recovery uses the coordinator queue; native readiness waiting does not occupy the separate control writer. Automatic admission still requires a current capture and ready recovery.
- `register-events.ts:38–54`: selection is not globally translated into control invalidation, so omitting the native observation's selection listener is meaningful in production. Existing audible invalidation and removal/replacement cleanup remain intact.
- `control-status-hints.ts:1–6`: the notification helper sends a read-only hint and contains closed-popup failure. The new menu refresh does not feed back into controls.invalidate or repository publication.
- `protocol.ts:28–47`: imported hint validation requires exact keys, bounded integer tab/window IDs, and boolean privacy identity. The trusted native entry does not expand the external command parser.

No specific unresolved source doubt justified repeating the author's suites.

## Evidence and remaining acceptance gates

The following execution results are reported in the author/controller records and were not independently rerun by this reviewer:

- Portable suite: **1,330 tests / 43 files passed**, with clean typecheck, build, and strict package checks.
- Package: **eight files / three JavaScript graphs / exactly five permissions**. The six existing UI/asset hashes are reported unchanged. Package bytes/hashes are recorded in the Task 2 evidence; this source review does not independently regenerate or certify the export.
- New browser API-boundary spec: **four cases passed** on Chrome for Testing **156.0.8078.4**. It verifies Chrome registration, real storage/document handling, supplied inactive/multihighlight identity, readiness after journal failure, actual worker restart/reload, and simulated unsupported-context popup fallback.
- Earlier broad browser run: **124/126 passed**, with **29 foreground/native cases excluded**. The two audio-precondition failures reproduced against the Task 1 baseline before feature behavior was enabled. That run is neither a full green suite nor evidence of a new menu defect.
- At the review handoff, the author owned the unlocked-host full **155-case** foreground run; its result was pending. The controller must incorporate its actual result before declaring final verification complete.

**Native tab-strip acceptance is still unproven.** The supplied evidence does not show an actual menu screenshot or native Protect/Unprotect callback for inactive B with A active, actual multiselection target semantics, first native click after worker suspension, or native click after extension reload. The boundary fixture deliberately calls a captured listener ([tab-context-menu.spec.ts:11](../../../tests/browser/tab-context-menu.spec.ts)); API registration and synthetic event metadata cannot establish what Chrome delivers for a real tab-strip action.

The updated host report distinguishes two constraints: initial locked/foreground failure, then successful owned-PID foreground activation but CUA binding to a different pre-existing Testing process. No click on that unowned process was made. This is an honest execution-capability gap. Resolve it with documented owned-profile interaction or a coordinated user manual check only after the foreground suite releases ownership; do not close or operate the unrelated process to make the test easier. Record actual scalar callback identity, protection state, and tab/window/group/active invariants across the required cases.

The retained Chrome 120 floor is a source/package compatibility choice. Unsupported-context rejection is simulated on 156; no actual 120 runtime or separate current-stable native-tab behavior is established by this review. Report the tested version precisely.

Final public completion docs and the byte-verified trial export are controller-owned, unfinished acceptance work, not source defects. Keep Task 008a open until the required proof is captured or explicitly handed back as a remaining limitation; do not describe the feature as fully verified merely because the source gate passes.

## Recommendations

1. No source fix wave is indicated by this review.
2. Incorporate the in-progress full-suite result and retain any baseline comparison without weakening preconditions or silently excluding failures.
3. Close the native click/inactive/multiselection/cold-worker/reload proof gap, then update completion records and verify exported artifact bytes. Additional synthetic callback cases cannot replace that proof.

## Declined to judge

- Task 009 default-activation/general regression expansion and Task 011 recent-tabs functionality: explicitly outside 008a; neither is implemented by this diff.
- Automatic unsaved-form detection or page inspection: the inherited approved design uses explicit session protection; adding page access would exceed this feature and permission scope.
- Cross-browser-restart or extension-reload persistence of manual protections: the accepted protection contract is session-only; this change must preserve that contract rather than introduce durable identity migration.
- A full new audit of unchanged journal, retry/replay, retention, and placement algorithms: outside this bounded changeset review. Their changed control/readiness integration was reviewed; broader baseline correctness is not newly certified here.
- Release-wide performance budgets and every supported Chrome/platform runtime: outside this source gate. The pending required native acceptance cases and claimed minimum-version coverage are explicitly recorded above rather than silently waived.

## Assessment

**Source quality: Approved; no actionable findings.**

**Ready to merge / declare Task 008a complete: No, pending acceptance evidence.** No merge is authorized by the task. The implementation matches the approved architecture and reasonable clicked-tab expectations, with coherent protection, readiness, and lifecycle boundaries. The remaining native tab-strip proof and full-suite result must be resolved before a complete/fully-verified claim; their absence does not establish a source defect.

---

# Task 008a acceptance-evidence closeout

Reviewed 29 October 2026 local time; focused run started 30 October 01:12 UTC. Scope: evidence closeout only for unchanged source `historical-revision` and reported documentation HEAD `historical-revision`. No new source review, test, build, browser action, helper execution, or repository mutation was performed. The earlier source approval remains unchanged.

## Evidence inspected

- `EXTERNAL_EVIDENCE/2026-10-28-tab-context-protection/root-focused-foreground-command.json`, `.log`, and `.json`.
- Both focused cases' attached foreground preconditions, actual-worker-restart, and foreground-phase records.
- The final failure summary in `browser-full.log` and the read-only `foreground-gate-diagnosis.md`.
- `root-final-package-sha256.json`; its background hash is `956125b025e2245cd87d449f88caf591d6f89860e3e80afac8053f15b18c10a8`, and manifest hash is `f446c665f35e49eb1699bb9f14e748b32b22e5466da6ec30f0b3739cc6039083`, matching the previously reviewed package record. I read the hash record, not a fresh byte recomputation.
- The controller-supplied summary of the user's three manual answers: Protect/Unprotect work on right-clicked inactive B with A active; multiselection changes only B; first native click after cold worker and after reload both work. These are user-reported native observations, not independently captured callbacks or screenshots.
- Controller-reported fresh portable result of 1,330/43 plus typecheck/build/package success; those checks were not rerun here.

## Full-browser requirement

The full run executed all 155 cases and finished **153 passed, 2 failed**. The original failures are preserved. The subsequent focused command selected exactly those two failed foreground phases, with unchanged original tests/fixtures, one worker, zero configured retries, and exit code 0: **2 passed in 3.6 seconds**. JSON records one passed attempt with retry 0 for each case, no skips, errors, or unexpected results. Owned browser PIDs 31161 and 31187 were actually frontmost at their activation assertions.

The focused attachments establish more than reaching a setup precondition: both requested phase records exist, worker stop was observed, and a fresh worker realm was verified. Their stated meanings remain precise: one is a durable-write gate, the other holds the wrapper after the native call already fulfilled. Neither claims interruption inside an outstanding Chrome API call.

**The current build now has passing coverage for all 155 cases across the full run and the focused follow-up. This is not a single 155/155 green run.** The binding plan requires running the full suite and relevant verification; it does not explicitly require every case to pass in one uninterrupted invocation. No additional broad run is necessary solely to manufacture that stronger claim. Preserve both results together rather than replacing the full-run outcome with “155 passed.”

## Remaining focus limitation

The diagnosis supports the immediate failure path: actual native attention reported `focusedWindowId: null`, so the unchanged planner selected preserve and the activate gate was unreachable. The failed full-run trials did not reach their worker-termination/recovery assertions. The focused passes close that missing execution coverage.

**The reason OS/browser focus changed remains unknown.** A later pass does not prove the cause was repaired, establish baseline flakiness, identify another application/agent as responsible, or demonstrate reliable repeated execution. No production or fixture fix occurred. Retain this as a disclosed verification-reliability limitation; the evidence does not establish a new 008a product defect or require a speculative source fix.

## Native functional acceptance versus literal evidence requirements

The user's manual answers close the previously unobserved functional scenarios: actual menu use on an inactive tab, exact-target multiselection behavior, cold-worker first click, and post-reload use. Combined with the approved source and API-boundary tests, **no demonstrated functional blocker remains for the original two-action 008a implementation**.

The original design/plan nevertheless explicitly call for inspecting a native menu screenshot, capturing the real callback's scalar target metadata, and recording tab/window/group/active invariants. The supplied manual summary confirms outcomes but does not supply those artifacts or every invariant. It also does not state a tested manual browser version. The automated evidence remains Chrome for Testing 156.0.8078.4; do not transfer that version to the user's manual test without evidence.

Therefore distinguish these claims:

- Supported: “The user verified the native inactive-tab, multiselection, cold-worker, and reload behavior; all 155 automated cases have current passing coverage across the full and focused runs.”
- Unsupported: “Every original proof artifact is captured,” “a single full run passed 155/155,” “native focus reliability is fixed,” or “Chrome 120/current-stable execution is verified.”

The controller explicitly rules that the coordinated user confirmations plus approved source and real-API invariant tests are accepted in place of the literal native screenshot, raw callback, and full native-invariant capture. Record that substitution and its cost in the completion documents: those documentary native-UI artifacts remain unavailable. This is a disclosed acceptance-evidence change, not a claim that the artifacts exist or automated native UI validation succeeded. It avoids another user-upload loop after three successful functional checks. A future native capture harness may be tracked under Task 009 without implementing it now.

## New UI feedback

The user's request for one correct action and a tab lock indicator is new product feedback on the approved two-action design. It does not invalidate the verified protection behavior, but user satisfaction with the menu presentation remains open. This closeout does not approve an implementation, certify the newly researched API alternatives, or claim that feedback is handled. Preserve it as a separate pending design decision; do not lose it when closing the original functional work.

## Declined to judge

- New conditional-menu/lock-indicator alternatives: outside this evidence-only closeout; no new source has been supplied for review.
- Root cause or repair of the native focus transition: the saved evidence does not establish one; no new experiments were authorized for this review.

## Verdict

**Original 008a functional acceptance: approved with the controller's explicit evidence substitution and documented limitations; no source fix indicated.** The run-full requirement is satisfied, aggregate current passing coverage is complete, and user manual verification closes the functional native scenarios. The controller can close the original work after recording its ruling and caveats. **Unqualified “all original proof artifacts captured” remains unsupported**: native screenshot/callback/full-invariant capture is unavailable, no single 155/155 green run occurred, and the native focus-loss cause remains unknown and unfixed. New menu-presentation feedback remains pending separately.
