# 009: Real-browser feature regression suite

Status: TODO

Depends on: 006, 007, 008

## Outcome

Exercise the packaged extension in Chrome rather than relying solely on mocked APIs.

## Integration points

tests/browser/; controlled local navigation fixtures; CI browser configuration.

## Acceptance criteria and decisions

- [ ] Cover external-style new-tab opens, address-bar-style navigation, in-tab links, redirects and SPA history changes.
- [ ] Verify winner identity, inherited placement, configured group override, focus behavior, multiple windows, pinned tabs and partial failures.
- [ ] Terminate/restart the worker between execution phases and assert recovery without unintended closure.
- [ ] Use condition-based waits and isolated profiles; document any external-app launch path requiring a manual OS-level check.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.

## Recorded native-fixture observation (008a verification)

Two foreground worker-termination gates did not reach activate after actual initial attention reported no focused normal window, despite immediately preceding foreground preconditions. The unchanged planner correctly chose preserve and completed replacement; the native focus-loss cause remains unproven. Do not treat this as a recovery replay failure or hide it with timers/retries/fake focus. Future regression work should add timestamped native attention/frontmost-PID evidence and fail immediately on an ineligible foreground setup. See [read-only diagnosis](../../reviews/2026-10-29-native-foreground-gate-diagnosis.md). This note does not startTask009.
