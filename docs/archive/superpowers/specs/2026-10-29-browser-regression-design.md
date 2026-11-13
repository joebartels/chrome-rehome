# Task009 real-browser regression gate

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../../README.md).

## Intent and authorization

The user requests Task009 and confirms foreground rehoming now works both between windows on the same macOS desktop and between different desktops. Protect this behavior through regressions while preserving deliberate background opens. Treat this report as manual functional evidence, not a captured browser version or automated Spaces result. The approved backlog provides the behavior scope; existing delegated implementation and independent review continue without an additional approval round.

## Approach

Build on the extensive existing suite. Add only missing untouched-dist typed-transition, positive SPA, ordinary redirect and pinned replacement outcomes. Retain existing external LaunchServices, inheritance/manual-group precedence, cross-window foreground/background, protection/audio, partial-failure and phase-recovery matrices.

Use three explicit Playwright projects: `portable` for headless-capable cases, `headed` for platform-independent real popup/audio/UI behavior requiring a display, and `native-macos` for actual macOS LaunchServices/frontmost/focus behavior. Tag headed/native cases rather than selecting by fragile title fragments; native cases are excluded from other lanes. Only expose the native project on darwin so explicit unsupported selection fails rather than reports a green skip. One worker, zero retries, no hidden skips or zero-test success. A small JSON-result gate verifies selected projects collected tests and passed with no skips/flaky/unexpected/errors/retries, preserving machine-readable reports. Linux CI uses Xvfb for portable+headed; an exclusive unlocked interactive Mac owns the native lane. Hosted CI execution is not claimed until observed.

Alternatives: rerunning the current undifferentiated suite would leave CI display requirements and native skips ambiguous; rebuilding all tests would duplicate strong existing evidence. The selected extension of existing helpers and explicit lanes gives actionable regressions without changing product behavior or adding dependencies.

## Focus and recovery evidence

Preserve actual native attention unchanged. Add bounded timestamped fixture diagnostics linking incoming event/winner/document, actual Chrome focus/selection and journal operation. Record exact owned browser PID and actual frontmost PID immediately before trigger and on native failure; capture Chrome focus-change events. A declared foreground fixture whose first relevant admission is ineligible must signal a distinct setup/attention-contract failure immediately. Race phase-gate readiness against that signal. Do not return substitute focus, retry/refocus during execution, wait a fixed grace period or weaken original phase/removal/document assertions. Prior attention-null failures remain historical unexplained failures even when new runs pass.

Replace fixed absence sleeps in recovery tests with real readiness/completion barriers. For production seeded quarantine use the existing control-status protocol's blocked readiness, actual navigation completion and exact journal/survivor assertions. For instrumented worker tests expose only test-fixture initialization/handled-navigation completion acknowledgments after coordinator.handle resolves, correlated to the wake navigation and new realm. A mere elapsed duration, stopped-worker notification or document load alone is not proof recovery finished. Fault injection and worker-entry fixtures must remain clearly labeled; durable-write/native-fulfilled gates are not interruption inside an outstanding native call.

## Boundaries

No production behavior/source changes, activation-default change, new permissions/assets/dependencies/content scripts/schema/RPC/persistence, polling or keepalive in the extension. Test-only polling of observed conditions and bounded timeout guards are allowed. Existing eight packaged files/three JS graphs/five permissions/Chrome120 minimum remain. Version becomes **0.1.2** once for the final coherent handoff, synchronizing all four source version fields and rebuilding dist. Preserve source and historical artifacts from previous versions.

Group precedence remains the accepted duplicate-first rule: an existing eligible duplicate supplies manual placement over a configured grouping rule; rule-only navigation reuses matching groups. Pinned, audible and manually protected exclusions remain unchanged. Task010 performance/release qualification and Task011 recent tabs do not start.

Use disposable profiles and exact owned processes only. No personal/unowned Chrome profiles or app manipulation; no CUA retry, OS lock/security changes or invented UI input. CDP typed navigation is address-bar-style, not trusted omnibox input. Native menu callback tests remain synthetic API-boundary tests, not UI clicks. Trusted omnibox, real native tab-menu capture/emoji, interactive drag, macOS Spaces automation and Chrome120/current-stable runtime certification remain explicit manual/release limitations. No external messages/push/merge/publish.

## Completion proof

Coverage matrix maps every009 criterion to named tests and evidence class. Each lane has retained raw JSON/log, exact pass/fail/skip counts, browser/platform/package identity and declared capabilities. Task1 runs portable/headed and harness checks; Task2 runs complete local suite once with all supported lanes after its edits, diagnosing failures narrowly and honestly. No retries/skips manufacture a green run. Final independent task and whole-scope reviews evaluate all code/evidence. Deliver version, Chrome walkthrough and pause before010.

Primary technical references: [Playwright extensions](https://playwright.dev/docs/chrome-extensions), [headed Linux CI/Xvfb](https://playwright.dev/docs/ci), and existing repository runtime APIs. Bundled Chromium with persistent isolated contexts matches the existing extension harness.

## 30 October evidence-class addendum

Final review identified that a later committed navigation used as a pinned-incoming completion barrier can invalidate the earlier operation's whole-view guard. Remove that stimulus. Untouched production dist provides an explicitly limited state observation, not handler-completion proof. Reuse the existing copied-worker completion fixture for an instrumented companion that waits for the same realm and exact committed incoming tab/document/URL after its handler resolves, then asserts exact retained IDs/order/groups and older survivors. A deliberately held initial snapshot read must keep that acknowledgment pending; a controlled delayed wrong mutation guarded by the captured view must fail the normal assertion after acknowledgment. Fault controls remain test-only, with raw failed evidence and no expected-failure/retry gate bypass.

Preserve the historical full 160-case invocation and original failed report. Validate the portable correction with focused affected/representative shared-barrier cases and the strict JSON gate; do not run another full native suite solely for this correction or merge focused counts into a fictitious final full run. Update collection counts and evidence claims separately. The coherent handoff remains 0.1.2 with unchanged production bytes.
