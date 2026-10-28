# Task008 final whole-branch review

Reviewed range: `historical-revision..historical-revision` (seven commits), using the supplied `review-historical-revision..historical-revision.diff` package. Binding requirements: `docs/superpowers/specs/2026-10-28-pause-protections-design.md` and `docs/superpowers/plans/2026-10-28-pause-protections.md`. Review date: 2026-10-28.

## Strengths

- **Control ownership and cancellation are coherent across the feature.** `src/background/controls.ts:108` validates the narrow command before admission, installs the accepted-intent barrier synchronously, and uses a command queue independent of native settlement. Enabled-intent tickets remain independent of rules/protection cleanup; rules-only saves compare their baseline inside the queue and preserve current enablement. The coordinator carries immutable protection/configuration authority without refreshing old operations after Resume (`src/background/coordinator.ts:53`).
- **Failure recovery respects the relevant authority.** The final control service keeps configuration failure, affected-target failure and startup verification failure distinct. Rules saves cannot certify a failed Pause or stale postwrite unprotect. Explicit verified Pause can resolve ordinary failures without reopening processing or resetting the journal. The targeted tests exercise unchanged as well as changed rule saves, other-tab intent and overlapping faults.
- **Target verification is local and privacy-conscious.** `src/browser/control-target.ts:15` brackets selection/document reads with short-lived observations, and the command observation spans persistence. Same-URL document replacement, selection leave-and-return, window transfer and late document callbacks cannot produce a valid obsolete success. Read-only observations do not change automatic-work generation. Global status has no cached target; per-request results contain only receipt/protection/audio/pin metadata.
- **Protection preserves established placement semantics.** `src/planning/candidates.ts:105` retains older protected/audible duplicates in deterministic anchor order. The plan composes initial and checked closure eligibility, and the replacement executor composes that decision with document evidence. Older protected tabs are not moved or closed; the incoming tab can still inherit their manual location. Participant audio is checked at snapshot barriers and after pending-removal persistence, while unrelated audio is excluded from structural equality. Unprotected removal remains a control no-op, preserving multi-removal lease credits.
- **The UI and package integration remain narrow.** Production options writes use the worker client; enabled-only updates preserve private rule drafts. The popup has stable native controls, explicit session/manual-protection copy and separate global/target readiness. Three independent JS entry graphs and the exact eight-file allowlist extend existing checks without broadening permissions, dependencies or page access. Chrome 120 messaging uses literal `true` and `sendResponse`; newer action APIs occur only in native test setup.
- **The regression assertions have meaningful failure sensitivity.** The revised popup cycle checks exact removed IDs, surviving incoming IDs, Back/Forward history, paused retention and fresh-only Resume. The recorded mutation experiment demonstrates that suppressed removal passed the old test but fails the strengthened test. Deferred tests cover storage, target, journal and native await boundaries; already-issued calls remain awaited.

## Issues

### Critical — must fix

None identified.

### Important — should fix

No new Important implementation defect identified. The two outstanding verification gates below prevent a completion/merge-ready claim at this review snapshot.

### Minor — nice to have

**M1 — Initial connection failure keeps a checking heading and advertises an unavailable Pause action.**

- References: `src/popup/controller.ts:34`, `src/popup/view.ts:4`, `src/popup/view.ts:23`.
- Trigger: open the popup when its first global `get-status` rejects, before any valid status/version has been received. `unavailable()` adds the reconnect message but leaves `status` absent. The view consequently falls back to “Checking processing status,” while the target row says “Global Pause remains available” even though `pauseDisabled` correctly remains true.
- User impact: contradictory feedback about whether checking is still running and whether Pause can be used. This is **Minor**, not a safety bypass: no fabricated version is sent, all mutations remain disabled, a status-unavailable message is visible and Refresh remains available. It does not falsely claim Active or protection success.
- Recommended correction: represent initial connection failure separately from a known worker status, display unavailable/reconnect copy, and condition the target-row Pause claim on actual action availability. Preserve the existing safe Pause path when a genuine worker/version is known; do not manufacture a `ControlVersion`. Cover first-read failure and a later successful refresh in the controller/view tests.

Historical M2 color-environment warnings are evidence noise, not a product finding. Root reports the fresh focused run uses a clean environment and has no warning; retain historical logs unchanged.

## Verification evidence and open gates

This was a read-only source/evidence review. I did not run builds, suites, browsers, native activation, or personal Chrome. Execution counts below are attributed to the supplied ledger, scoped review and root reports, not claimed as independent execution by this reviewer.

**Evidence available:**

- Root reports fresh 1,222 tests / 41 files passing, typecheck, build and exact eight-file package checks passing, with output hashes matching the author's current production package.
- The existing browser suite passed 144/144 on the popup build, including the prior focus-dependent families. Seven popup cases have passing coverage across recorded runs, including real native action controls and explicitly enabled incognito in an owned profile.
- The first final 151-case run finished 150/151; the failing unsupported-document fixture assumed a scheme lacked a valid document. That assumption was corrected to inject an actual document-read failure, and its focused case passed. A subsequent full run was interrupted after the host relocked. These observations are not equivalent to a single green final run.
- `task-3-fix1-review.md` verifies the closure-cycle mutation-to-RED experiment and final headless 1/1 GREEN. Root additionally reports the exact current-head strengthened case passed 1/1 in 1.8s (`root-closure-browser.*`). The former I1 is addressed; no reopening of that finding is warranted.

**V1 — Final complete browser run remains pending.** References: `docs/superpowers/specs/2026-10-28-pause-protections-design.md:58` and `docs/superpowers/plans/2026-10-28-pause-protections.md:67`. Run the full current final suite after the desktop is unlocked and any final M1 change is incorporated. Preserve actual structured results and package hashes. Historical passing pieces and host-precondition failures must not be represented as 151/151.

**V2 — Newly strengthened actual-native accessibility assertions remain unexecuted.** Reference: `tests/browser/controls.spec.ts:187`. The actual action target now checks 28px text, 360px width/no horizontal overflow, Tab/Shift+Tab focus/outline, Enter Pause/Resume and native screenshots. Source is coherent, but the prior native screenshots and popup-page test are not evidence that these newly added native assertions passed. Execute and inspect their output on the unlocked owned-profile run; the same final suite can close both gates.

Root's last read-only capability observation reports `frontmostIsLoginWindow=true`. That explains the pending native execution, but does not waive the gates. Chrome 120/current-stable release-matrix validation remains an explicitly documented later release gap.

## Plan alignment and recommendations

The implementation follows the agreed worker-service/session-registry/popup architecture. Reusing existing audible snapshot mapping and placing shared rule equality in the neutral protocol are reasonable allocations reflected in the amended plan. The test-only owned-browser focus precondition establishes actual native capability without weakening production or test assertions. No Task009–011 implementation or default activation was introduced; Task011 is backlog documentation only.

Resolve M1 in the proposed consolidated final wave and perform a scoped review of that change. Then close V1/V2, update the plan/task/completion records with actual final evidence, and export only the verified package before pausing at Task009. No additional product redesign is recommended by this review.

## Declined to judge

- Automatic form inspection or unsaved-edit detection: explicitly deferred by the accepted manual-protection decision and would require separate permission/design work.
- Recent-tab tracking/list behavior: Task011 is a requested backlog item only; the branch correctly adds no implementation.
- Default-on activation and performance/release readiness: reserved for Task009/010; this review checks that defaults remain off and those tasks are not silently implemented.
- Chrome 120/current-stable runtime, hosted CI and interactive drag/rejection release trials: existing documented release work outside Task008's local implementation gate. I do not infer runtime compatibility from transpilation or bundled-Chromium execution.
- Atomic prevention of an already-issued native effect or the final check-to-call race: explicitly unavailable in the accepted Chrome API model; judged the implemented awaiting/revocation/no-retry behavior instead.

No other considered behavior was silently excluded. In particular, first-connection error feedback was judged against reasonable user expectations despite the main status contract being otherwise satisfied.

## Assessment

**Ready to merge? No — pending final verification.**

The reviewed implementation has no newly identified Critical/Important product defect, with one concrete Minor UI issue (M1). Task008 must not be declared complete until the final full browser run and strengthened actual-native accessibility evidence pass on the final code/package; source approval does not substitute for those explicit gates.

## Review method

Read production and test changes from the supplied package in bounded chunks, along with the governing spec/plan, progress ledger, completion/backlog documentation and the exact scoped I1 review. Historical Task1/Task2 review records were not re-reviewed as implementation evidence. Two truncated documentation reads were repaired with bounded excerpts. One focused read of the unchanged replacement-executor continuation checked the cross-task relationship between plan closure eligibility, placement and post-journal removal checks. No diff regeneration, broad source reread, checkout/index/HEAD mutation or subagent delegation occurred. The sole write is this requested report.

---

# Task008 consolidated final fix — scoped re-review

## Finding Verdicts

- **M1 — Initial connection failure keeps a checking heading and advertises an unavailable Pause action — ADDRESSED.** `src/popup/controller.ts:9` adds local connection state separate from the optional genuine worker status. `src/popup/controller.ts:35` records a failed connection without inventing a status or `ControlVersion`; `src/popup/view.ts:4` consequently renders Processing unavailable rather than Checking. The unknown-worker description gives Refresh/reconnect guidance (`src/popup/view.ts:11`), and the target-row Pause claim uses the same `pauseDisabled` predicate as the actual button (`src/popup/view.ts:26`). Genuine known-worker status remains authoritative and retains idle explicit Pause, including unavailable/checking/blocked phases. Refresh changes connection state to checking, removes stale connection-error guidance, and marks a successful global response connected (`src/popup/controller.ts:42`, `src/popup/controller.ts:49`).
- **M1 covering regression evidence — consistent with the fix.** The added controller case (`tests/unit/popup-controller.test.ts:81`) verifies first failure, absent real status/target, all mutation suppression with zero mutation sends, no automatic read retry, pending explicit refresh, and successful reconnection with genuine active version and target. The view cases (`tests/unit/popup-view.test.ts:40`, `tests/unit/popup-view.test.ts:49`) verify unavailable/error/reconnect copy and conditional Pause guidance, including busy state. Existing known-worker safe-Pause, stale response, obsolete worker and disposal cases are unchanged and appear in the reported focused GREEN output.

## New Breakage in the Fix Diff

- **None identified.** The four-file change adds local display state and aligns copy with the existing action predicate; it changes no command payload, backend authority, storage, permissions, defaults, retry behavior or native settlement. Existing read/operation/disposal guards remain intact. Rendering does not infer connection state from message strings.

## Evidence Checks

- Read `final-fix-report.md` in full and read the supplied `review-historical-revision..historical-revision.diff` once without truncation. Scope was exactly `historical-revision` to `historical-revision`.
- Confirmed the report names the exact covering test command and shows three expected RED assertion failures with the other 23 cases passing, followed by all 26 focused cases passing. The added tests and asserted transitions match the implementation delta.
- Confirmed the report includes explicit commands and outputs/exit status for Node 24.22.1, 1,225 portable tests across 41 files, typecheck, build and exact eight-file package verification, plus source/package/metafile hashes. These are author-recorded execution results, not independently rerun by this reviewer; root's fresh verification remains separate.
- No tests, builds, browser/native activity, git commands, source edits or subagent delegation were performed. The only write was this requested report.

## Out-of-Scope Observations

- **No new observations.** Existing V1 (single green full final browser run) and V2 (strengthened actual-native enlarged-text/keyboard assertions and screenshot inspection) remain root-owned evidence gates pending actual execution. They are unchanged by this UI fix and do not reopen M1. This scoped approval does not establish Task008 completion or merge readiness.

## Verdict

**Fix round: All findings addressed, no new Critical/Important breakage.** M1 is closed. No further fix wave is requested by this review. Final native verification gates V1/V2 remain open.


## Controller verification closeout — 2026-10-28

V1 and V2 are closed by the final byte-identical production package run: **151/151 browser cases**, no failures, skips, flakiness or retries, in 3.1m. The native Enter helper repair historical-revision passed scoped independent review. Trusted keypress/click and actual phase changes prove keyboard Pause/Resume; root independently inspected actual native enlarged active/paused captures. Root read raw structured stats (151 expected, zero unexpected/skipped/flaky/errors) and verified the unchanged eight-file package hashes. Portable **1,225/41**, typecheck, build and strict package checks passed. Historical pending verdicts above are retained as the review record; their evidence gates are now resolved. Task008 base is complete; separately requested008a tab-menu protection is not part of this reviewed range.
