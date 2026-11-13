# Task009 browser regression closeout

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Version **0.1.2**; tested source `historical-revision`, local branch `pause-controls-protections`. Task009 is complete for the local regression handoff; both task reviews and the final correction/evidence review are approved. Task010 and011 have not started. No push or merge.

## What changed

Untouched-package browser cases cover CDP typed-transition navigation, changed-URL SPA history, ordinary HTTP redirect and pinned older duplicate exclusion. The pinned-incoming packaged case is explicitly a state observation without handler-completion proof; its new copied-worker companion waits for the exact incoming document acknowledgment in the same realm before checking exact IDs/order/groups and older survivors. The invalidating later navigation has been removed. Existing manual-group precedence, remote group reuse, winner/history identity, protection/audio, failure and worker-phase matrices are retained.

Explicit `portable`, `headed` and `native-macos` projects replace title-based selection and native skips. A strict result checker rejects skipped, empty, retried, flaky, failed and malformed reports. Ubuntu CI is configured for portable+headed under Xvfb with retained artifacts; hosted execution remains unobserved. The native lane needs an exclusive unlocked interactive Mac and operates only on owned disposable profiles.

Test-only focus diagnostics retain actual native attention, source/winner/document and phase correlation, timestamped Chrome focus events and owned/frontmost PIDs. A lost foreground admission fails promptly as a setup/attention mismatch. Recovery checks now await actual readiness or the intended committed navigation's completion in a new worker realm instead of fixed absence sleeps. No production focus workaround, retry, fake attention or weakened native assertion was introduced.

## Historical verification and current correction status

Controller independently ran **1,384 portable tests in46 files**, typecheck, build, strict package validation and whole-Task009 whitespace checks; all pass. Controller also reran the strict checker against the complete raw browser report: **160/160** passed in one final invocation, with **28 native-macos,125 portable and7 headed**, zero skips/retries/flaky/unexpected/runner errors. Bundled Chromium156.0.8078.4; Node24.22.1; macOS arm64. These results are local, not a claim of hosted Linux execution or Chrome120 runtime certification.

The final eight-file package has three JS graphs and the same five permissions. All four source version values and built manifest read back as0.1.2. Controller hash comparison with the previous approved build proves all seven non-manifest distribution files unchanged; manifest content differs only by version. No `src/` production change exists in Task009. Thus this release adds test/tooling coverage while retaining the extension program already tried by the user.

Independent Task1 and Task2 reviews: Approved. Whole-scope review found one P2: the pinned-incoming synchronization barrier could cancel faulty work. The code correction and its meaningful sensitivity RED/six-case focused GREEN passed scoped independent review; P2 is closed with no new Critical/Important findings. [Whole-scope review](2026-10-30-browser-regression-final-review.md) and [correction/evidence closure](2026-10-30-browser-regression-final-fix-review.md) preserve the review history. See the [coverage matrix](../testing/browser-regression-matrix.md) and [author verification record](2026-10-29-browser-regression-verification.md).

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

The 30 October correction was validated separately: a controlled delayed wrong closure failed the exact retained-ID assertion after same-realm completion while the captured view was current, and the strict checker rejected that RED. Restoring the normal fixture then passed six focused cases (the two packaged pinned cases, instrumented completion companion and three representative recovery barriers), once each with zero skips/retries. The strict portable checker passed. This is focused follow-up evidence, not a single complete 161-case invocation.

The startup blocker was isolated to an incomplete old custom browser cache: 321 bundle files were missing, including main/framework/helper Info.plists; 19 remaining files matched a fresh copy, with no changed contents. A complete separate copy of the same pinned Chromium156.0.8078.4/revision1248 ran the proof successfully. Only the proof runner browser-cache path changed. The old cache and failed reports remain intact. The cause of the missing files is unknown; no OS/security/browser-flag change or automatic retry was made. This does not explain the older options-to-about:blank or attention-null observations.

The normal fixture, all prepared source hashes and every distribution byte were restored and independently rechecked. Raw proof and all failed runs are retained separately. The correction stays within0.1.2; no changed user build was delivered mid-task.
