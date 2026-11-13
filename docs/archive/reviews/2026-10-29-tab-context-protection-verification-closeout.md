# Task 008a acceptance-evidence closeout

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

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
