# Single protection toggle and toolbar lock verification

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Implemented the user-selected refinement of Task008a on 2026-10-29. The native menu has one **Toggle tab protection** action. It flips only the verified clicked identity inside the existing writer, while the toolbar uses per-tab **🔒** / **ChromeReHome — tab protected** for usable manual protection state and empty text / **ChromeReHome** otherwise.

## Verification

All commands below ran in `<repository>` using the cached Node24 binary. Final results:

```sh
rtk proxy node node_modules/vitest/vitest.mjs run
# 1,353 passed, 44 files
rtk proxy node node_modules/typescript/bin/tsc --noEmit
# exit 0
rtk proxy node scripts/build.mjs
# exit 0, Chrome120 build
rtk proxy node scripts/check-package.mjs
# Package checks passed: unchanged eight files, three JS graphs, five permissions
rtk proxy env PLAYWRIGHT_BROWSERS_PATH=$TEMP_DIR/chromerehome-playwright node node_modules/@playwright/test/cli.js test tests/browser/tab-context-menu.spec.ts tests/browser/controls.spec.ts tests/browser/replacement-placement.spec.ts --grep-invert 'native action popup|native production'
# 25 passed in one final invocation, Chrome156.0.8078.4
```

The final browser selection covers six popup/control cases, fifteen placement/protection/audio safety cases, and four menu/indicator API cases. It verifies target-only toggling, multiselection, two windows, actual badge/title readback, no global badge, popup mutation refresh, page reload, worker restart, extension reload, removal of only the two legacy IDs, and unsupported-menu fallback. Synthetic callback inputs are explicitly instrumented in the test fixture; real Chrome APIs, session storage and document checks remain in use. This is not a native menu visual-click test.

Portable tests cover cold admission/readiness, newer Pause and conflicting toggle intent, navigation/privacy/cleanup fences, failed verification, unknown snapshots, per-tab privacy, activation/creation/replacement, delayed writes, close/disposal, transient API errors and later recovery, and bounded refresh work. Browser reload testing caught Chrome resetting per-tab action state on navigation. Two new portable regressions failed before the fix and now verify repaint, including a reset between delayed badge/title writes.

## Failures found and resolved

- Native toggle/accessor tests first failed because those APIs did not exist (9 failures, 37 existing passes). Menu tests first failed against the old explicit pair (13 failures, 23 passes). Indicator tests first had a missing-module bootstrap error, then a no-op implementation produced nine assertion failures before implementation.
- A transient identity-read failure initially left a stale lock; a failing portable regression drove clearing and later-refresh recovery.
- The first full portable run found the production-entry fixture lacked the new Chrome event API surface. The fixture was updated while preserving synchronous registration and no-storage-write assertions. Final full run passes.
- A new multiwindow fixture initially navigated via `chrome.windows.create({url})`; Chrome's first request escaped the route and `getFrame` reported `errorOccurred: true`. Production correctly refused that document. The fixture now loads a routed page before moving it into the new window, with an explicit healthy-document assertion.
- The new page-reload assertion exposed the display-cache defect described above. It was fixed without changing control/replacement authority. The final four-case menu run and final 25-case selected run pass.

An earlier selector accidentally included eight unchanged native attention cases; those eight passed within a run that overall had 32 passes and the new multiwindow fixture failure. This extra evidence is not a focus reliability fix. Final verification intentionally excludes `native production` attention cases and the native action-popup case. No foreground assertions were changed or weakened.

## Concurrency and limits

Native observation and admission are synchronous. Initialization/recovery readiness remains outside the serialized writer so a newer Pause can proceed. The toggle derives its desired value within the shared protection transaction, retains document/privacy/generation checks and verified persistence, and never reads state first and calls a setter later. Superseded clicks can conflict; they are not replayed. The explicit setter and popup receipt contract remain available.

The toolbar's narrow input exposes only a read-only frozen in-memory snapshot. Unknown/pending/unavailable state asserts no protection. Every action write has a tab ID. One renderer serializes writes and corrects stale results; initial discovery uses one tab query, subsequent lifecycle work is coalesced per ID, and unchanged status hints do not scan all tabs. Navigation resets invalidate only that tab's display cache. Presentation failures do not invalidate controls, write storage, move/focus/close tabs, or replay replacements; a later refresh can retry display/identity reads.

No CUA/native app binding was attempted, and only disposable test profiles were used. Emoji appearance and the final menu's native visual interaction remain manual checks. Private identity isolation is covered portably; the existing native incognito popup case was not rerun in the final selection. Cold synchronous admission is covered portably; browser restart/reload tests use synthetic callbacks and real API readback, not a native cold-click UI capture.

The previous008a evidence remains historical: a full155 run had153 passes, followed by focused passes for the two remaining cases. That was not one clean full invocation and did not fix the unexplained native foreground transition. See [prior closeout](2026-10-29-tab-context-protection-verification-closeout.md) and [foreground diagnosis](2026-10-29-native-foreground-gate-diagnosis.md). Task009 and011 remain untouched.
