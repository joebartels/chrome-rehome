# 009: Real-browser feature regression suite

Status: complete — local regression gate and final-review correction/evidence closure approved on2026-10-30 in0.1.2. Historical complete local invocation passed on 2026-10-29 in 0.1.2, with retained native setup/focus uncertainty and manual/runtime limits.

Depends on: 006, 007, 008

## Outcome

Exercise the packaged extension in Chrome rather than relying solely on mocked APIs.

## Integration points

tests/browser/; controlled local navigation fixtures; CI browser configuration.

## Acceptance criteria and decisions

- [x] Cover external-style new-tab opens, address-bar-style navigation, in-tab links, redirects and SPA history changes.
- [x] Verify winner identity, inherited placement, rule-only grouping and accepted duplicate/manual-group precedence, focus behavior, multiple windows, pinned tabs and partial failures.
- [x] Terminate/restart the worker between execution phases and assert recovery without unintended closure.
- [x] Use condition-based waits and isolated profiles; document any external-app launch path requiring a manual OS-level check.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.

## Recorded native-fixture observation (008a verification)

Two foreground worker-termination gates did not reach activate after actual initial attention reported no focused normal window, despite immediately preceding foreground preconditions. The unchanged planner correctly chose preserve and completed replacement; the native focus-loss cause remains unproven. Do not treat this as a recovery replay failure or hide it with timers/retries/fake focus. Future regression work should add timestamped native attention/frontmost-PID evidence and fail immediately on an ineligible foreground setup. See [read-only diagnosis](../../reviews/2026-10-29-native-foreground-gate-diagnosis.md). This remains historical evidence; the Task009 work below does not establish the original focus-loss cause.

The two original cases subsequently passed unchanged in a focused run; no native focus repair is claimed. Also track a safely process-bound native tab-menu capture harness: user manual checks confirm functionality, but the CUA bridge could not bind the isolated browser and no native screenshot/raw callback/full-invariant capture was obtained. Native visual capture remains a manual/tooling limitation. Task009 adds admission diagnostics and the local regression gate described below.

## Completion evidence and remaining scope

[Coverage matrix](../../testing/browser-regression-matrix.md) · [verification and Chrome walkthrough](../../reviews/2026-10-29-browser-regression-verification.md).

Version0.1.2 passed 1382 portable unit/integration tests in 46 files, typecheck/build/strict package checks, and a complete160-case browser invocation:28 native-macos,125 portable,7 headed. The strict JSON checker confirms zero skips/retries/flaky/unexpected results or runner errors. Five recovery absence sleeps now use genuine production readiness or exact new-realm handled-navigation barriers. Foreground fixtures retain actual native attention and fail promptly on mismatched admission, correlated to the expected winner/document/navigation.

An earlier full invocation failed 159/160 because one external case's options page became about:blank during setup. The original trace/JSON/log and unknown cause remain documented; a passive diagnostic addition, focused pass and final complete pass do not establish a repair. Historical008a attention-null failures likewise remain unexplained. User-reported same/different-desktop foreground success has no captured version and is manual evidence only.

Default processing remains disabled by decision. Hosted CI, Chrome 120/current-stable qualification, trusted omnibox input, actual native menu/emoji visual capture, interactive drag/rejection, automated macOS Spaces and other OS launch routing remain unverified. Task010 and 011 remain TODO; this task does not authorize release/performance work or default activation.

## Final-review correction, 30 October

The pinned-incoming barrier navigation could cancel faulty work by invalidating the captured whole view. That navigation is removed. Untouched dist now supplies an explicitly limited exact-state observation; an existing copied-worker fixture companion awaits the same realm's exact incoming tab/document/URL acknowledgment after the held actual handler resolves, then checks order/groups/IDs and older survivors. This completion evidence is instrumented, not a production hook.

Portable verification passes 1384 tests in 46 files plus typecheck/build/package, with all eight 0.1.2 dist files and metafile unchanged. Inventory is 161 (126 portable, 28 native, 7 headed), distinct from the historical 160-case run. The 30 October correction was validated separately: a controlled delayed wrong closure failed the exact retained-ID assertion after same-realm completion while the captured view was current, and the strict checker rejected that RED. Restoring the normal fixture then passed six focused cases (the two packaged pinned cases, instrumented completion companion and three representative recovery barriers), once each with zero skips/retries. The strict portable checker passed. This is focused follow-up evidence, not a single complete 161-case invocation. The startup blocker was isolated to an incomplete old custom browser cache: 321 bundle files were missing, including main/framework/helper Info.plists; 19 remaining files matched a fresh copy, with no changed contents. A complete separate copy of the same pinned Chromium156.0.8078.4/revision1248 ran the proof successfully. Only the proof runner browser-cache path changed. The old cache and failed reports remain intact. The cause of the missing files is unknown; no OS/security/browser-flag change or automatic retry was made. This does not explain the older options-to-about:blank or attention-null observations. See the verification record for exact evidence and limits. The correction changes no distribution bytes; the coherent handoff version remains0.1.2.
