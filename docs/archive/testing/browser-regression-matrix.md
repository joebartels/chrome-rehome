# Browser feature regression matrix

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Task009 extends the existing tests; it changes no production behavior. The final package is 0.1.2; the version is synchronized in manifest/package/lock and rebuilt dist. Duplicate placement takes precedence over a configured grouping rule, including manual and ungrouped anchors. Default processing remains disabled.

## Lanes and selection

| Project | Selection | Capability and evidence |
| --- | --- | --- |
| `portable` | Neither `@headed` nor `@native-macos` | Headless bundled Chromium, disposable persistent extension profiles, local fixture servers. Contains both untouched-dist and explicitly instrumented worker tests. |
| `headed` | `@headed`, excluding `@native-macos` | Real action popup/incognito UI, real audible AudioContext, production protection behavior. A display is required; Linux uses Xvfb. Existing owned-browser activation is retained on macOS for the popup fixture. |
| `native-macos` | `@native-macos`; project exists only on darwin | Exclusive unlocked interactive Mac, actual LaunchServices and owned-browser frontmost/focus checks. Native selection precedes the longer portable lane on darwin. No runtime platform skips. |

These sets are disjoint. One worker, zero retries, `fullyParallel: false`, and CI `forbidOnly` apply to every project. The JSON checker requires every named project to exist and select at least one test; every selected test must pass exactly once with retry0. It rejects malformed/missing reports, skips, flaky/unexpected/expected-failure results, pending/empty results and runner/test errors. A successful Playwright exit alone does not replace the checker.

The 30 October correction inventory selects **161** tests: **126 portable**, **7 headed**, **28 native-macos**. The retained Task1 inventory and Task2 complete invocation selected 160 (125 portable, 7 headed, 28 native-macos); the added copied-worker pinned companion accounts for the difference. These are observed counts, not hardcoded count gates. On unsupported platforms, requesting `native-macos` fails project selection rather than silently skipping cases. Inventory is collection evidence, not native execution evidence.

## Acceptance coverage

| Criterion | Named tests | Evidence class and limits |
| --- | --- | --- |
| Address-bar-style incoming navigation | `production CDP typed transition retains incoming identity and history with duplicate manual precedence` | New untouched-dist case. Chrome `Page.navigate` uses `transitionType: typed`; real `onCommitted` metadata, incoming ID, old closure, inherited index/manual group, unrelated IDs/order/groups and back/forward history are asserted. CDP stimulus is not trusted omnibox input. |
| Positive SPA and ordinary redirect replacement | `production changed-URL pushState retains incoming identity and history with duplicate manual precedence`; `production ordinary HTTP redirect retains incoming identity and history with duplicate manual precedence` | New untouched-dist cases. Actual history document ID and server-redirect commit qualifiers are observed from a separate extension document; no worker replacement. Same identity/placement/closure/history checks as typed case. |
| Navigation admission metadata | `records real commits, redirects, same-document changes, reload and back-forward`; `loses document provenance across an actual worker restart and records harness capabilities` | Existing instrumented navigation observer. Actual browser events with fixture coordinator observation, separate from packaged outcomes. |
| External new tabs and redirect final identity | `native external warm HTTP/HTTPS inherits manual group and closes older duplicate`; `native external HTTP to HTTPS final identity inherits manual group and closes older duplicate`; stopped-worker and disabled controls | Existing native-macos LaunchServices matrix against production dist. Task2 exercises the native lane; other OS launch routing remains unverified. |
| Winner ID/history, duplicate anchor, rule precedence, multiple windows | `production same-window inheritance winner before/after anchor`; `production cross-window inheritance grouped=…`; `production preserves manual Group A over Group X rule, crossWindow=…`; `production closes three duplicates across two windows and groups including passive documents`; `production grouping-only reuses remote Group A without a competing source group and retains history` | Existing untouched-dist portable outcomes. Headless Chrome window/group structure does not certify native desktop focus. |
| Foreground and deliberate background attention | `native production remote … foreground click/Cmd-click background attention`; `native production restores minimized remote destination through focused true`; `native production foreground transfer from lone source closes source and presents destination`; `native history during corrective move preserves … intent` | Existing native-macos focus/selection/collapse and recovery matrix. Task2 retains all phases/assertions, records actual native attention and OS PIDs, and correlates foreground admission and phase gates to the intended incoming document. Same/different desktop success is user-reported manual evidence with version unspecified, not automated Spaces proof. |
| Pinned exclusions | `production pinned incoming state observation retains exact order and groups without closing older duplicates`; `instrumented pinned incoming awaits held handler completion and retains exact order groups and older survivors`; `production pinned older duplicate is excluded while eligible duplicates supply manual placement and close` | Untouched-dist pinned-incoming state observation retains exact IDs/order/groups and older survivors, but page load does not prove handler completion. The copied-worker companion holds its initial snapshot read, checks the exact committed document has no acknowledgment while held, then releases and awaits the same realm's post-handler acknowledgment before asserting those invariants. No later navigation is used as a barrier. Pinned older remains an untouched-dist positive outcome: eligible duplicates close and supply manual placement. The corrected companion and both packaged observations pass in the six-case follow-up; a controlled delayed wrong closure fails its exact invariant, as recorded below. |
| Protected and audible exclusions | `production session protection on winner/anchor/other retains duplicates and native manual placement`; `production session protection survives navigation reload and worker restart and ends on close`; `production audible older anchor retains every duplicate while placing the silent winner`; `production audible incoming same-document navigation skips automatic placement` | Existing untouched-dist headed cases. Real audio must become `audible`, or the test fails. |
| Pause/Resume and controls | `popup Pause prevents future grouping and closure; Resume admits only fresh navigation and preserves rules`; `actual action popup uses the actual selected web tab and owned-profile incognito access`; `open popup reconnects after real worker restart…` | Existing production popup/controls cases. Actual action UI remains headed with all original assertions. |
| Menu boundary and partial failures | `packaged menu registers actual tab contexts and API-boundary intents affect only the inactive supplied tab`; `exposes real created membership after an injected title failure`; `controlled fixture simulated remove-reject/settled-write stops survivors`; blocked popup/menu status tests | Existing Chrome APIs with explicit callback/injection boundaries. Synthetic menu callback is not a native menu click; injected failure is not interactive drag/native rejection. |
| Worker termination and quarantine | `seeded production recovery quarantines … byte-for-byte across real worker restart`; `seeded production settled … abandons without replay then fresh closure works`; `actual phase fixture worker termination after … never replays`; configured/final-reorder/foreground phase matrices | Existing production seeded recovery plus copied-dist worker-entry fixtures. Durable-write gates and native-fulfilled wrappers do not interrupt an outstanding native call. Task2 replaces absence sleeps with blocked production control-status plus actual new commits, or initialized new-realm acknowledgments after coordinator.handle resolves for the exact wake tab/document/URL. Foreground mismatches fail promptly, preserving actual native attention. |
| Isolation and result gate | `browser result CLI gate` unit cases; `--list` inventory; complete portable/headed result JSON | Disposable owned profiles; exact project results checked without skips/retries/zero-test success. Historical native attention-null failures remain historical and unexplained. |

## Reproduce locally and in CI

Use Node 24 and the pinned Playwright bundled Chromium. Linux needs Chromium's system dependencies plus an X display for the headed project; CI installs Chromium/dependencies and runs both supported projects under Xvfb. Hosted execution is not claimed until an actual hosted run is observed.

```sh
rtk npm ci
rtk npx playwright install --with-deps chromium
rtk npm run typecheck
rtk npm test
rtk npm run build
rtk npm run check:package
rtk proxy mkdir -p browser-reports
rtk proxy env PLAYWRIGHT_JSON_OUTPUT_NAME=browser-reports/inventory.json npm run test:browser -- --list --reporter=json
# Linux; pipefail preserves a browser failure while retaining its log.
rtk proxy bash -o pipefail -c 'PLAYWRIGHT_JSON_OUTPUT_NAME=browser-reports/results.json xvfb-run --auto-servernum npm run test:browser -- --project=portable --project=headed --reporter=list,json 2>&1 | tee browser-reports/run.log'
rtk npm run check:browser-results -- browser-reports/results.json portable headed
```

On a local Mac with a display, omit `xvfb-run`. An exclusive unlocked interactive Mac may run the separate native lane:

```sh
rtk proxy env PLAYWRIGHT_JSON_OUTPUT_NAME=browser-reports/native.json npm run test:browser -- --project=native-macos --reporter=list,json
rtk npm run check:browser-results -- browser-reports/native.json native-macos
```

Retain JSON, stdout/stderr logs and `test-results/` attachments/traces for each invocation, including failures. The CI artifact step runs even when tests/checker fail. Do not retry failures or pass `--pass-with-no-tests`, add focus repairs, or mask selected native cases with skips.

## Historical Task1 evidence and remaining limits

Task1's 29 October 2026 macOS arm64 baseline uses Node 24.22.1, Playwright 1.64.1 and bundled Chromium 156.0.8078.4; exact runtime/package hashes, inventory, invocation JSON/logs and failure diagnostics are retained in `task009-task1-evidence/` beside the controller workspace report. The final Task1 report at `EXTERNAL_EVIDENCE/2026-10-29-browser-regression/task-1-report.md` records exact paths, browser version and counts. Unit/integration validation passed **1374/45** (tests/files); source typecheck, build and package checks passed. The single complete portable/headed invocation passed **132/132** (125 portable, 7 headed) with zero skips, flaky/unexpected results or retries, and the JSON gate passed both projects. The internal0.1.1 rebuild retained all eight distribution file hashes and the three bundle graphs/metafile unchanged.

Task1 does not run native-macos or certify Linux hosted execution. Trusted omnibox input, real native tab-menu capture/emoji, interactive drag, automated macOS Spaces and Chrome 120/current-stable runtime qualification remain manual/release limits. Other OS-native launch routing remains unverified. Task010 and Task011 have not started; passing regression checks does not enable processing by default.

## Historical complete Task009 invocation — 0.1.2

The pre-correction complete local invocation passed **160/160**: native-macos 28, portable 125 and headed 7. Strict JSON result checks passed all three projects with zero skips, retries, flaky/unexpected results or runner errors. Final portable unit/integration tests passed **1382/46** (tests/files); typecheck, build and strict package checks passed. Runtime was macOS 27.0.1 arm64, Node 24.22.1, Playwright 1.64.1 and bundled Chromium 156.0.8078.4. Native ran first under one exclusive owner. All original phase/document/survivor assertions remain.

Raw final evidence is `EXTERNAL_EVIDENCE/2026-10-29-browser-regression/task-2-evidence/browser-final.{log,json}`, `browser-final-check.log` and `browser-final-results/`; exact invocations and hashes are in `commands.json` and `package-identity.json` in that evidence directory. Version0.1.2 is synchronized in all four source version fields and dist. Seven non-manifest distribution files and all three bundle graphs/metafile remain byte-identical to pre-bump0.1.1.

The earlier full run remains **159/160**, with its strict checker failing: an external stopped-worker HTTPS case's options document became about:blank during initial setup. The cause is unknown. Passive navigation/PID diagnostics were added; a focused case and then one controller-authorized final full invocation passed. No re-navigation, retry, timing or focus workaround was added. This pass does not explain the original failure. The separate introduced diagnostic-counting defect and its focused correction are also retained. See [full verification, original evidence and walkthrough](../reviews/2026-10-29-browser-regression-verification.md).

The independent final review identified a pinned-incoming synchronization gap in that historical invocation. Final closeout requires the focused correction validation below; default activation remains disabled by decision. Task010/011 remain TODO and all manual/hosted/runtime limits above remain in force.

## 30 October pinned-incoming correction

The later admitted navigation could invalidate the pinned operation's captured whole-view revision and cancel faulty work. It has been removed. Completion proof now belongs to the explicitly instrumented companion, not untouched dist. The copied worker reuses the existing post-`coordinator.handle` completion observer; no production endpoint or distributed byte changes were made. A temporary sensitivity fault is retained separately for a delayed wrong closure guarded by the captured view; it must make the normal exact survivor assertion fail after acknowledgment, without expected-failure marking or retries.

Current verification: 1384 portable unit/integration tests in46 files, typecheck, build and package checks pass; all eight dist files and the metafile match the original0.1.2 candidate byte-for-byte. Collection confirms161 cases. The 30 October correction was validated separately: a controlled delayed wrong closure failed the exact retained-ID assertion after same-realm completion while the captured view was current, and the strict checker rejected that RED. Restoring the normal fixture then passed six focused cases (the two packaged pinned cases, instrumented completion companion and three representative recovery barriers), once each with zero skips/retries. The strict portable checker passed. This is focused follow-up evidence, not a single complete 161-case invocation. The startup blocker was isolated to an incomplete old custom browser cache: 321 bundle files were missing, including main/framework/helper Info.plists; 19 remaining files matched a fresh copy, with no changed contents. A complete separate copy of the same pinned Chromium156.0.8078.4/revision1248 ran the proof successfully. Only the proof runner browser-cache path changed. The old cache and failed reports remain intact. The cause of the missing files is unknown; no OS/security/browser-flag change or automatic retry was made. This does not explain the older options-to-about:blank or attention-null observations.

Raw correction evidence is retained in `task009-final-fix-evidence/` beside the controller workspace, with exact commands, JSON/logs, traces, normal/fault worker bytes and artifact identity. The final-fix report records its absolute path. The original 160/160 and 159/160 full reports remain historical evidence, never aggregated with focused results.
