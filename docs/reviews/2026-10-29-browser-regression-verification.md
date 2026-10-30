# Task009 browser regression verification — 0.1.2

Verification date: 29 October 2026 local time (30 October UTC). Package 0.1.2; processing remains disabled by default. Task010 performance/release qualification and Task011 recent tabs remain TODO.

## Scope and evidence

The [coverage matrix](../testing/browser-regression-matrix.md) maps every 009 criterion to named tests and distinguishes untouched production dist, copied-dist worker fixtures, simulated failures and actual native behavior. Task1 added typed CDP navigation, positive SPA history, ordinary redirects, pinned outcomes, disjoint projects and the strict JSON gate. Task2 adds test-only native admission diagnostics and recovery completion barriers. No production source, permission, dependency, schema or activation-default change was made.

Foreground fixture arms name the source window, expected incoming winner, target URL and previous document. Only the first native admission for its new committed document is classified. Actual native attention is returned unchanged. A mismatch publishes a token-specific failure; phase waiting observes success or mismatch, then throws outside its poll on mismatch. Phase arrival also must belong to that admission, so earlier setup work cannot satisfy it. Bounded timestamped observations retain focus changes, incoming identity and journal operation; AppKit snapshots read the exact CDP-owned browser PID and actual frontmost PID before trigger and on failure. Setup still activates only the owned browser once; execution adds no refocus, retry or grace timer.

All five fixed recovery absence sleeps are removed. Seeded production quarantine waits for authorized options `get-status` to report blocked and verifies two actual committed documents before byte-preserved journal/survivor checks. Instrumented phase recovery waits for a different realm, completed initialization and an acknowledgment after `coordinator.handle` resolves for the exact wake tab/document/URL. Original phase, document, survivor and journal assertions remain. Test instrumentation is absent from dist.

## Historical results before the final-review correction

| Check | Observed result |
| --- | --- |
| Historical portable unit/integration | 1382 tests in 46 files passed. |
| Typecheck/build/strict package | All passed. |
| Historical complete Playwright invocation | 160/160 passed: native-macos 28, portable 125, headed 7. |
| Strict JSON checker | All three projects passed; zero skips/retries/flaky/unexpected/runner errors. |

The final changed-harness invocation ran 2026-10-30T03:36:01.161Z for 174.428s. Retained final evidence: `browser-final.log`, `browser-final.json`, `browser-final-check.log`, `browser-final-results/`. `commands.json` records exact commands and all earlier invocations; `browser-summary.json` records both full-run outcomes. This was a single successful historical invocation; final review later found a pinned-incoming synchronization gap. It does not establish a native startup/focus repair or validate the subsequent correction.

Runtime: macOS 27.0.1 arm64; Node 24.22.1; Playwright 1.64.1; bundled Chromium 156.0.8078.4. One worker, retries 0, isolated owned profiles. JSON reports, stdout/stderr, attachments and failure traces are retained under `.superpowers/sdd/2026-10-29-browser-regression/task-2-evidence/` in the repository; the full implementation report is `.superpowers/sdd/2026-10-29-browser-regression/task-2-report.md`.

The four source version fields and dist manifest all equal 0.1.2. `package-identity.json` records SHA256 values: all seven non-manifest dist files and `.build/metafile.json` remain byte-identical to pre-bump 0.1.1. Only the distributed manifest version changed. Strict package checks retain exactly eight files, three JS bundle graphs, five permissions and minimum Chrome 120.

## Retained failures and limits

The first native-focused invocation passed 4/5. New attention/focus diagnostics had reused the `journal` field, so the unchanged history assertion counted observation snapshots as repeated writes. The retained artifact proves one actual activate write and one focus write. Diagnostic snapshots now use `operation`; the original exact assertion is unchanged, and the single foreground case passed. This was a harness correction, not a production fix.

The first complete invocation passed 159/160: native 27/28, portable 125/125, headed 7/7, zero skips/retries/flaky results. Its strict checker failed. `native external stopped-worker HTTPS inherits manual group and closes older duplicate` failed before worker-stop/external launch: the options page loaded HTML/CSS/JS successfully and showed disabled, then the same frame became `about:blank` during the status assertion. Saved trace snapshots and screencast establish that boundary; the cause is unknown. No evidence attributes it to production, host lock, a user action or another agent. Passive options-navigation/CDP reason events and owned profile/app/PID snapshots were added; a single focused diagnostic run passed. No auto-renavigation, timing workaround, refocus, retry or weakened assertion was added. The controller authorized one final complete invocation for this changed diagnostic harness, retaining the original failed report. A subsequent pass does not explain or repair that original failure.

Historical 008a native attention-null failures likewise remain unexplained. Successful current gates do not establish their cause or repair. User-reported foreground success across windows on the same desktop and across different desktops is manual functional evidence with version unspecified; it is not automated macOS Spaces proof.

Hosted Linux CI execution, Chrome 120/current-stable runtime certification, trusted omnibox input, real native tab-menu/emoji visual capture, interactive drag/native-rejection trials, other OS launch routing and automated Spaces remain unverified. CDP typed navigation is address-bar-style stimulation. Synthetic menu callbacks are API-boundary tests. Durable-write/native-fulfilled recovery gates do not prove interruption inside an outstanding Chrome API call. No CUA binding, OS lock/security change or personal Chrome profile was used. Passing regression checks does not change default activation or establish Task010 release/performance readiness.

## Chrome walkthrough

1. Use a disposable profile, load this repository's `dist/` at `chrome://extensions`, reload an existing trial if needed, and confirm version 0.1.2. Existing enabled settings are preserved; a new installation starts disabled.
2. Pin the toolbar action and explicitly Resume. Put an older duplicate in a manual group, then follow an ordinary link from a second tab/window to that URL. Verify the incoming tab keeps its identity/history, inherits the older manual placement and becomes selected in the destination for a foreground open.
3. Repeat with Cmd-click background navigation. Verify the incoming tab is placed without taking foreground selection/focus. Pinned, audible and manually protected exclusions remain in force.
4. Pause again when finished. Cross-desktop behavior has user-reported manual success; capture the actual loaded version/browser when repeating a manual Spaces trial.

Do not begin 010/011 or enable processing by default as part of this handoff.

## 30 October final-review correction — validation pending

The pinned-incoming test's later grouping navigation could advance the navigation tracker's global revision and cancel the very operation under test. The corrected untouched-dist case reports only its immediate exact retained-state observation. Completion evidence is supplied by one clearly labeled copied-worker companion: it holds the actual initial placement snapshot read for the incoming tab/URL, checks the matching committed tab/document/URL has not been acknowledged in the original realm, releases only the fixture gate, then awaits that realm's acknowledgment after `coordinator.handle` resolves. It asserts exact retained IDs/order/groups and older survivors without intervening navigation. This is an evidence-class adjustment, not a production fix.

Helper RED was 1 failed/9 passed for missing same-realm completion, followed by 10/10 GREEN. Full portable tests pass 1384/46; final typecheck, build and package checks pass. The initial typecheck's three test-only typing errors and correction are retained. All eight distribution files and the metafile are byte-identical to the verified 0.1.2 candidate. Current collection is 161 cases: 126 portable, 28 native-macos, 7 headed; no 161-case full-run claim is made.

Browser validation remains blocked at startup. The initial temporary delayed-wrong-closure sensitivity attempt never reached an extension worker. A launch diagnostic and one direct Node execution diagnostic also ended before worker registration: owned GPU/network helpers repeatedly exited signal 5 and the browser exited SIGTRAP. The first warning is Crashpad's out-of-range numeric cast; no causal explanation is established. These failed JSON/logs/traces are preserved and rejected by the strict checker. They are not meaningful sensitivity RED and do not demonstrate the pinned assertion yet. No automatic retry, re-navigation, alternate flags, security change, or broad native rerun was used. Focused packaged/companion/shared-barrier validation and actual delayed-wrong-work sensitivity remain required.

Correction raw evidence: `EXTERNAL_EVIDENCE/task009-final-fix-evidence`; exact arguments/environment/exit codes are in `commands.json`. Existing Task2 raw 160/160 and failed 159/160 artifacts are unchanged and remain separate from this correction.
