# Browser feature regression matrix

Task009 extends the existing tests; it changes no production behavior. Task1's internal package remains 0.1.1 until Task2 performs the single final 0.1.2 handoff. Duplicate placement takes precedence over a configured grouping rule, including manual and ungrouped anchors. Default processing remains disabled.

## Lanes and selection

| Project | Selection | Capability and evidence |
| --- | --- | --- |
| `portable` | Neither `@headed` nor `@native-macos` | Headless bundled Chromium, disposable persistent extension profiles, local fixture servers. Contains both untouched-dist and explicitly instrumented worker tests. |
| `headed` | `@headed`, excluding `@native-macos` | Real action popup/incognito UI, real audible AudioContext, production protection behavior. A display is required; Linux uses Xvfb. Existing owned-browser activation is retained on macOS for the popup fixture. |
| `native-macos` | `@native-macos`; project exists only on darwin | Exclusive unlocked interactive Mac, actual LaunchServices and owned-browser frontmost/focus checks. Native selection precedes the longer portable lane on darwin. No runtime platform skips. |

These sets are disjoint. One worker, zero retries, `fullyParallel: false`, and CI `forbidOnly` apply to every project. The JSON checker requires every named project to exist and select at least one test; every selected test must pass exactly once with retry0. It rejects malformed/missing reports, skips, flaky/unexpected/expected-failure results, pending/empty results and runner/test errors. A successful Playwright exit alone does not replace the checker.

The retained Task1 `--list` JSON inventory selects **160** tests: **125 portable**, **7 headed**, **28 native-macos**. These are observed counts, not hardcoded count gates. On unsupported platforms, requesting `native-macos` fails project selection rather than silently skipping cases. Inventory is collection evidence, not native execution evidence.

## Acceptance coverage

| Criterion | Named tests | Evidence class and limits |
| --- | --- | --- |
| Address-bar-style incoming navigation | `production CDP typed transition retains incoming identity and history with duplicate manual precedence` | New untouched-dist case. Chrome `Page.navigate` uses `transitionType: typed`; real `onCommitted` metadata, incoming ID, old closure, inherited index/manual group, unrelated IDs/order/groups and back/forward history are asserted. CDP stimulus is not trusted omnibox input. |
| Positive SPA and ordinary redirect replacement | `production changed-URL pushState retains incoming identity and history with duplicate manual precedence`; `production ordinary HTTP redirect retains incoming identity and history with duplicate manual precedence` | New untouched-dist cases. Actual history document ID and server-redirect commit qualifiers are observed from a separate extension document; no worker replacement. Same identity/placement/closure/history checks as typed case. |
| Navigation admission metadata | `records real commits, redirects, same-document changes, reload and back-forward`; `loses document provenance across an actual worker restart and records harness capabilities` | Existing instrumented navigation observer. Actual browser events with fixture coordinator observation, separate from packaged outcomes. |
| External new tabs and redirect final identity | `native external warm HTTP/HTTPS inherits manual group and closes older duplicate`; `native external HTTP to HTTPS final identity inherits manual group and closes older duplicate`; stopped-worker and disabled controls | Existing native-macos LaunchServices matrix against production dist. Not run by Task1; other OS launch routing remains unverified. |
| Winner ID/history, duplicate anchor, rule precedence, multiple windows | `production same-window inheritance winner before/after anchor`; `production cross-window inheritance grouped=…`; `production preserves manual Group A over Group X rule, crossWindow=…`; `production closes three duplicates across two windows and groups including passive documents`; `production grouping-only reuses remote Group A without a competing source group and retains history` | Existing untouched-dist portable outcomes. Headless Chrome window/group structure does not certify native desktop focus. |
| Foreground and deliberate background attention | `native production remote … foreground click/Cmd-click background attention`; `native production restores minimized remote destination through focused true`; `native production foreground transfer from lone source closes source and presents destination`; `native history during corrective move preserves … intent` | Existing native-macos focus/selection/collapse and recovery matrix. Task1 retains all phases/assertions and collects these cases only. Same/different desktop success is user-reported manual evidence with version unspecified, not automated Spaces proof. |
| Pinned exclusions | `production pinned incoming retains exact order and groups without closing older duplicates`; `production pinned older duplicate is excluded while eligible duplicates supply manual placement and close` | New untouched-dist portable outcomes. Exact retained/removed IDs/order/groups; a pinned incoming remains index0/ungrouped and retains all older tabs; pinned older remains index0 and is excluded while eligible duplicates close and supply manual placement. A subsequent real admitted grouping completes the pinned-incoming observation. |
| Protected and audible exclusions | `production session protection on winner/anchor/other retains duplicates and native manual placement`; `production session protection survives navigation reload and worker restart and ends on close`; `production audible older anchor retains every duplicate while placing the silent winner`; `production audible incoming same-document navigation skips automatic placement` | Existing untouched-dist headed cases. Real audio must become `audible`, or the test fails. |
| Pause/Resume and controls | `popup Pause prevents future grouping and closure; Resume admits only fresh navigation and preserves rules`; `actual action popup uses the actual selected web tab and owned-profile incognito access`; `open popup reconnects after real worker restart…` | Existing production popup/controls cases. Actual action UI remains headed with all original assertions. |
| Menu boundary and partial failures | `packaged menu registers actual tab contexts and API-boundary intents affect only the inactive supplied tab`; `exposes real created membership after an injected title failure`; `controlled fixture simulated remove-reject/settled-write stops survivors`; blocked popup/menu status tests | Existing Chrome APIs with explicit callback/injection boundaries. Synthetic menu callback is not a native menu click; injected failure is not interactive drag/native rejection. |
| Worker termination and quarantine | `seeded production recovery quarantines … byte-for-byte across real worker restart`; `seeded production settled … abandons without replay then fresh closure works`; `actual phase fixture worker termination after … never replays`; configured/final-reorder/foreground phase matrices | Existing production seeded recovery plus copied-dist worker-entry fixtures. Durable-write gates and native-fulfilled wrappers do not interrupt an outstanding native call. Task2 owns acknowledgment barriers and native admission diagnostics. |
| Isolation and result gate | `browser result CLI gate` unit cases; `--list` inventory; complete portable/headed result JSON | Disposable owned profiles; exact project results checked without skips/retries/zero-test success. Historical native attention-null failures remain historical and unexplained. |

## Reproduce locally and in CI

Use Node24 and the pinned Playwright bundled Chromium. Linux needs Chromium's system dependencies plus an X display for the headed project; CI installs Chromium/dependencies and runs both supported projects under Xvfb. Hosted execution is not claimed until an actual hosted run is observed.

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

## Current Task1 evidence and remaining limits

Task1's 29 October 2026 macOS arm64 baseline uses Node24.22.1, Playwright1.64.1 and bundled Chromium156.0.8078.4; exact runtime/package hashes, inventory, invocation JSON/logs and failure diagnostics are retained in `task009-task1-evidence/` beside the controller workspace report. The final Task1 report at `.superpowers/sdd/2026-10-29-browser-regression/task-1-report.md` records exact paths, browser version and counts. Unit/integration validation passed **1374/45** (tests/files); source typecheck, build and package checks passed. The single complete portable/headed invocation passed **132/132** (125 portable, 7 headed) with zero skips, flaky/unexpected results or retries, and the JSON gate passed both projects. The internal0.1.1 rebuild retained all eight distribution file hashes and the three bundle graphs/metafile unchanged.

Task1 does not run native-macos or certify Linux hosted execution. Trusted omnibox input, real native tab-menu capture/emoji, interactive drag, automated macOS Spaces and Chrome120/current-stable runtime qualification remain manual/release limits. Other OS-native launch routing remains unverified. Task010 and Task011 have not started; passing regression checks does not enable processing by default.
