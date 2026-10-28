# Task 3 independent review

## Spec Compliance

- ❌ Issues found: the required popup-driven duplicate-closure Pause/Resume browser cycle is not demonstrated. `tests/browser/controls.spec.ts:59` creates same-URL tabs while initially paused, verifies no replay on Resume, then uses different URLs and checks grouping only. It never establishes active duplicate closure, navigates a fresh duplicate while paused after activity, or proves fresh duplicate closure after a subsequent Resume. See Important I1.
- ✅ The implementation otherwise matches the task-scoped source requirements: local native popup DOM and three entry points; neutral control client/protocol; global status independent of target readiness; explicit safe Pause for a known worker; receipt/version guarded mutations; manual protection while paused; no mutation replay; payload-free, read-only status hints; exact eight-file packaging and unchanged permissions (`src/popup/index.ts:1`, `src/popup/controller.ts:38`, `src/popup/controller.ts:87`, `src/popup/index.html:19`, `src/background/index.ts:20`, `scripts/build.mjs:11`, `scripts/check-package.mjs:56`).
- ⚠️ Cannot verify a single all-green 151-case current-head native run. The report and `task3-verification.json:1` explicitly preserve the 150-pass/one-fixture-failure complete run, the corrected focused case, and the later relock-interrupted run. This is an outstanding root-owned verification item, not evidence of a product failure and not pre-graded as missing work.
- ⚠️ Chrome 120 runtime execution, final whole-changeset review, task 008 completion/export and the pause before 009 are outside this task diff. The build target/minimum remain 120; no Node/runtime dependency, permission, host-permission, content-script, schema/default, activation/rule-policy, recency, journal grammar or native-settlement implementation change appears in the supplied diff (`scripts/build.mjs:15`, `manifest.json:18`, `src/background/index.ts:32`).
- ⚠️ The supplied enlarged-text/keyboard capture is the real popup document in a page fixture (`tests/browser/controls.spec.ts:51`); native action captures exist for active/protected/incognito (`tests/browser/controls.spec.ts:127`). I inspected both kinds, but this evidence does not independently establish enlarged-text/keyboard navigation inside the actual native action surface.

## Strengths

- `src/popup/controller.ts:38` starts the global read before selection/document lookup, publishes global readiness independently, and drops stale read sequences. `src/popup/controller.ts:67` rejects obsolete-worker/older-revision mutation success and refreshes without replay. The unit tests exercise delayed reads, worker changes, disconnect, conflict and disposal (`tests/unit/popup-controller.test.ts:18`, `tests/unit/popup-controller.test.ts:49`, `tests/unit/popup-controller.test.ts:65`).
- `src/popup/controller.ts:87` requires known paused readiness for Resume while retaining explicit Pause for any known status. `src/popup/controller.ts:93` keeps protection independent of enabling the master and rechecks the selected identity before sending its displayed receipt. `src/popup/view.ts:18` disables unsafe mutations during pending or unready state.
- `src/background/index.ts:29` connects in-worker notifications to a payload-free read-only bridge, and `src/background/index.ts:35` emits a completion hint even when a consumer fails without a storage event. There is no call to `controls.invalidate` in the bridge. The production browser fault test asserts that a subsequent real status read is blocked, rather than testing only a synthetic notification (`tests/browser/controls.spec.ts:88`).
- `src/popup/index.html:19` explains grouping and closure together, already-issued effects, manual unsaved-edit protection and session lifetime. Stable native controls, textContent rendering and explicit listener disposal keep the UI simple and accessible (`src/popup/view.ts:34`, `src/popup/view.ts:47`).
- `scripts/check-package.mjs:41` extends source/graph boundary checks to all three implementation layers, including type-only import tests; `scripts/check-package.mjs:100` requires the exact eight outputs. The build regression checks deterministic independent bundles and stale-output removal (`tests/integration/build.test.ts:7`, `tests/unit/boundaries.test.ts:9`).
- Actual action-popup CDP attachment and incognito permission changes are confined to disposable test profiles. The native test checks selected normal/private tabs independently and verifies protection reset at extension reload (`tests/browser/action-popup.ts:6`, `tests/browser/controls.spec.ts:115`, `tests/browser/controls.spec.ts:150`).

## Issues

### Critical (Must Fix)

- None found in the scoped diff.

### Important (Should Fix)

- **I1 — Required duplicate-closure browser cycle is absent.** `tests/browser/controls.spec.ts:59` is titled “Pause prevents future grouping and closure,” but its only duplicate URL pair is created before the initial Resume. It asserts both remain after Resume (useful no-replay coverage); its active `fresh` and paused `future` navigations are distinct URLs and only assert `groupId` (`tests/browser/controls.spec.ts:64`, `tests/browser/controls.spec.ts:69`). Consequently the test can pass even if popup-controlled closure never works or closure ignores the subsequent pause. Empty duplicate rules do not themselves establish that closure is disabled: the issue is the missing native tab-identity/removal assertions. Add a real matching-duplicate cycle that proves active incoming-tab retention/older-tab closure, popup Pause retaining a fresh duplicate opportunity, Resume causing no replay, and a later fresh navigation closing the eligible older duplicate while preserving incoming identity/history. Reuse the existing native fixture and keep focus/native ownership rules. This is the explicit browser validation requirement in the task brief, not a request to broaden unrelated coverage.

### Minor (Nice to Have)

- **M1 — An initial global read failure still renders “Checking” and says Pause is available while it is disabled.** `src/popup/controller.ts:35` changes the phase to unavailable only when `state.status` already exists. On the first failed connection there is no status, so `src/popup/view.ts:4` falls back to checking, while `src/popup/view.ts:23` says “Global Pause remains available” even though `pauseDisabled` is true. Preserve a separate unavailable connection/view phase without inventing a worker version, render truthful unavailable copy, and condition the Pause-availability sentence on known status. Add a focused first-read rejection view/controller assertion.
- **M2 — Browser evidence contains avoidable warning noise.** `task3-unavailable-frame.log:4`, `task3-journal-hint-final.log:4` and `task3-existing-browser.log:4` report that NO_COLOR is ignored because FORCE_COLOR is also set. The portable/type/build/package logs inspected were clean. Normalize the browser-run environment to one color policy on the next root-owned verification run; this warning does not invalidate the recorded test assertions.

## Checks and limits

- Reviewed the supplied `review-historical-revision..historical-revision.diff` for base `historical-revision` and head `historical-revision`. The first tool output cut off inside popup controller mutation handling; resumed the missing middle of the diff. No changed source file was separately reread, no git state command/mutation was run, and no suite, build, browser or native activation was rerun.
- Focused outside-diff check, **risk: reconnect or malformed replies could weaken popup mutation validation**: read `src/controls/client.ts:5`; it validates every response through the neutral protocol and has one-shot transport semantics.
- Focused outside-diff check, **risk: refresh hints could recurse through status reads, mutate operation authority, or incorrectly recover a failure domain**: read `src/background/controls.ts:60`, `src/background/controls.ts:114` and the Task 2 exact-interface/postfix handoff. Global status reads do not notify or invalidate; explicit mutations retain worker/revision validation and backend failure gates. No additional source exploration was needed.
- Focused outside-diff check, **risk: I1 might already be covered by an unchanged browser fixture**: searched only pause/set-enabled references in `tests/browser/replacement-placement.spec.ts`, `tests/browser/foundation.spec.ts` and `tests/browser/rule-editor.spec.ts`. The latter covers dirty-draft Pause/rules preservation at `tests/browser/rule-editor.spec.ts:247`; no alternative active/paused/fresh-resumed duplicate-closure cycle was identified by this focused check.
- Read structured verification metadata and the relevant log tails. `task3-full-final.log` records 1,222 tests/41 files passing; typecheck has no diagnostics; build/package logs record success; the existing browser log records 144 passing; popup controls records seven passing; corrected unavailable-document and failed-journal-hint subsets each record one passing. These are existing recorded runs, not reviewer reruns. The complete native run gap remains explicit above.
- Inspected recorded enlarged-keyboard, native-action-active, unavailable and blocked PNGs from `task3-browser-final-results/`. Text wraps, focus outline is visible in the enlarged document capture, native active layout is compact, and unavailable/blocked captures retain explicit Pause without offering Resume or reset. No screenshot manipulation or browser activation was performed.

## Assessment

**Spec-compliance verdict:** Needs fixes for I1; remaining root-owned/native verification gaps are reported separately.

**Code-quality verdict:** Needs fixes for required closure validation. No blocking production correctness or authority/settlement regression was found in this scoped review; M1 and M2 are minor.

**Task quality:** Needs fixes.

**Reasoning:** The production change is small, separates presentation and authority well, and preserves the reviewed backend contracts. The task cannot yet claim its requested popup-driven closure validation because its named closure case contains no active closure/removal assertion.

---

# Task 3 fix round 1 scoped re-review

## Finding Verdicts

- **I1 — Required duplicate-closure browser cycle is absent — ADDRESSED.** `tests/browser/controls.spec.ts:78` retains the initial paused duplicate pair and checks no replay at Resume. The fresh active incoming navigation now proves both older IDs disappear while the incoming ID survives, then checks that ID through actual Back/Forward history (`tests/browser/controls.spec.ts:85`). After popup Pause, the fresh matching duplicate preserves the exact whole-tab ID set and stays ungrouped; Resume preserves those IDs without replay (`tests/browser/controls.spec.ts:100`). A later fresh incoming navigation closes the eligible older pair and again preserves incoming identity/history (`tests/browser/controls.spec.ts:114`). The exact four native removal events and final rules/paused configuration are asserted at `tests/browser/controls.spec.ts:124`. Separate active/paused grouping assertions remain at `tests/browser/controls.spec.ts:98`.
- **I1 covering evidence — verified from recorded output.** The fix appendix names the exact test, commands, output files and exit codes. `task3-fix1-old-closure-fault.log` records the original insufficient case passing with removal suppressed; `task3-fix1-closure-red.log` records the strengthened case failing its first active removal assertion under that fault. `task3-fix1-closure-final.log` records the exact final tracked case passing 1/1 in 1.9s with the temporary fault removed. The tracked diff contains no removal fault. `task3-fix1-portable.log` records 1,222 tests/41 files passing; `task3-fix1-typecheck.log` is empty and the structured verification records exit 0. No test was rerun by this reviewer.

## New Breakage in the Fix Diff

- **None found.** The closure test uses isolated fixture-owned tabs and exact ID/removal assertions, preserves the reviewed ungrouped/manual-anchor preference (`tests/browser/controls.spec.ts:91`), and disposes its event listener with the owning context. The helper adds only bounded test-side keyboard dispatch with Tab/Enter key codes and the documented Shift modifier; it does not touch production APIs, permissions or settlement (`tests/browser/action-popup.ts:50`).
- **Native evidence gap retained.** `tests/browser/controls.spec.ts:187` adds actual-action-target 28px text, 360px width/overflow, keyboard focus/outline, Enter Pause/Resume and native screenshot assertions. These new native assertions are explicitly unexecuted while the host is locked. Their source is coherent, but their execution and screenshots remain root-owned unlocked verification, along with the single green full browser run. The prior native captures do not count as execution of these additions.

## Out-of-Scope Observations

- **None newly raised.** Prior minor M1 remains deferred to final review and M2 remains root-owned environment cleanup, as instructed. The final focused fix log uses one color policy and has no warning noise; historical fault logs retain their original color warning. Intervening root documentation commit `historical-revision` is outside this scoped test/helper review.

## Checks and Scope

- Reviewed the supplied fix package for `historical-revision` → `historical-revision`, the Task 3 brief, prior I1 and the fix-report appendix. The aggregate initial tool output truncated root-document/report material; the relevant test/helper hunks were complete, and the report appendix was separately read without truncation.
- Read `task3-fix1-verification.json` and the existing old-fault, strengthened-RED, final focused, portable and typecheck logs. No untouched source was inspected, no suite/browser/build/native activation was run, no git state command or mutation occurred, and no subagent was dispatched. The only write was this requested review report.

## Verdict

**Fix round:** All scoped findings addressed, no new Critical/Important breakage.

**Open root-owned evidence:** unlocked execution of the newly added actual-native enlarged-text/keyboard assertions and the single green full browser suite. These are evidence gaps, not reopened I1 or a source-review failure.
