# Task009 browser regression closeout

Version **0.1.2**; tested source `historical-revision`, local branch `pause-controls-protections`. Task009 final-review correction is implemented; focused browser validation and independent re-review are pending. Task010 and011 have not started. No push or merge.

## What changed

Untouched-package browser cases cover CDP typed-transition navigation, changed-URL SPA history, ordinary HTTP redirect and pinned older duplicate exclusion. The pinned-incoming packaged case is explicitly a state observation without handler-completion proof; its new copied-worker companion waits for the exact incoming document acknowledgment in the same realm before checking exact IDs/order/groups and older survivors. The invalidating later navigation has been removed. Existing manual-group precedence, remote group reuse, winner/history identity, protection/audio, failure and worker-phase matrices are retained.

Explicit `portable`, `headed` and `native-macos` projects replace title-based selection and native skips. A strict result checker rejects skipped, empty, retried, flaky, failed and malformed reports. Ubuntu CI is configured for portable+headed under Xvfb with retained artifacts; hosted execution remains unobserved. The native lane needs an exclusive unlocked interactive Mac and operates only on owned disposable profiles.

Test-only focus diagnostics retain actual native attention, source/winner/document and phase correlation, timestamped Chrome focus events and owned/frontmost PIDs. A lost foreground admission fails promptly as a setup/attention mismatch. Recovery checks now await actual readiness or the intended committed navigation's completion in a new worker realm instead of fixed absence sleeps. No production focus workaround, retry, fake attention or weakened native assertion was introduced.

## Historical verification and current correction status

Controller independently ran **1,382 portable tests in46 files**, typecheck, build, strict package validation and whole-Task009 whitespace checks; all pass. Controller also reran the strict checker against the complete raw browser report: **160/160** passed in one final invocation, with **28 native-macos,125 portable and7 headed**, zero skips/retries/flaky/unexpected/runner errors. Bundled Chromium156.0.8078.4; Node24.22.1; macOS arm64. These results are local, not a claim of hosted Linux execution or Chrome120 runtime certification.

The final eight-file package has three JS graphs and the same five permissions. All four source version values and built manifest read back as0.1.2. Controller hash comparison with the previous approved build proves all seven non-manifest distribution files unchanged; manifest content differs only by version. No `src/` production change exists in Task009. Thus this release adds test/tooling coverage while retaining the extension program already tried by the user.

Independent Task1 and Task2 reviews: Approved. Whole-scope review found one P2: the pinned-incoming synchronization barrier could cancel faulty work. The correction needs focused validation and scoped re-review; no final approval is claimed. See the [coverage matrix](../testing/browser-regression-matrix.md) and [author verification record](2026-10-29-browser-regression-verification.md).

## Preserved failures and limits

An earlier full invocation was **159/160**, rejected by the checker: an external stopped-worker HTTPS case's options page unexpectedly became `about:blank` during setup, before worker stop or external launch. Original JSON/log/trace are retained. Passive navigation/PID diagnostics were added, the focused case passed, and the changed diagnostic harness's final full invocation passed160/160. The original navigation's cause remains unknown; this is not a claimed repair or proof that the setup cannot recur. No automatic retry or re-navigation was added.

An introduced diagnostic-field collision in a focused history test was corrected without changing its original exact durable-write assertion; original failed evidence is preserved. Historical008a native attention-null failures also remain historical/unexplained; current passes do not establish their cause.

The user reports successful rehomed foreground focus both within a macOS desktop and across different desktops; the loaded version was not captured. This is manual evidence, not automated Spaces coverage. Trusted omnibox input, native tab-menu/emoji visual capture, interactive drag, other OS launch routing, hosted Linux and Chrome120/current-stable runtime release qualification remain manual/release limits. CDP typed navigation and synthetic native-menu callbacks are labeled accordingly.

## Try0.1.2 in Chrome

Reload ChromeReHome at `chrome://extensions` and confirm0.1.2. Existing activation/rules persist; extension reload clears manual tab protection, so re-protect important tabs. There is no new user setting in this testing release.

With an existing matching group in window A, open a fresh matching link normally from window B or an external app: the incoming tab should move to A and its window/tab should come forward. Cmd-click a matching link from B: it should be rehomed in the background while your current window/tab remain selected. The manual cross-desktop check can be repeated with A/B on different macOS desktops. Existing duplicate placement takes priority over grouping rules, so use URLs without older duplicates when specifically checking rule-only group reuse.

## Decision and next task

Fresh installs remain paused. Task009 authorizes regression coverage, not an activation-policy change; the cost of this conservative decision is that a new user still presses Resume. Existing enabled installations keep their setting. Task010 performance/release readiness is next, pending user instruction; Task011 recent tabs remains future work.

## Correction validation, 30 October

Helper RED/GREEN is retained (1 failed/9 passed, then 10/10), and full portable tests now pass 1384/46 with typecheck/build/package. Current inventory is 161 (126 portable, 28 native, 7 headed); the historical 160/160 report remains a separate single invocation. All eight candidate distribution files plus metafile remain byte-identical to the earlier verified 0.1.2 package, so no new user build/version is delivered.

The required focused browser and delayed-wrong-work proof remain blocked: three isolated startup attempts never registered the extension worker, with owned Chromium GPU/network helper exit 5 and main-browser SIGTRAP in launch diagnostics. The initial fault attempt is not valid sensitivity RED. Reports/logs/traces, strict-checker failures and copied-worker fault bytes are retained; the cause is unproven. No flags, OS security, retries or re-navigation were used to hide it. Final Task009 completion is pending this validation and scoped review, while all prior failure/manual/runtime limits remain.
