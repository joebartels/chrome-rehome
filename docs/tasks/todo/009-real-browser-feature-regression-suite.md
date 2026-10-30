# 009: Real-browser feature regression suite

Status: complete — local regression gate verified on 2026-10-29 in 0.1.2, with retained native setup/focus uncertainty and manual/runtime limits.

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
