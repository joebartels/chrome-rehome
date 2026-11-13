# Cross-window group reuse and focus completion

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Completed locally on 2026-10-27. Task008 remains unstarted.

ChromeReHome reuses an existing exact-title group across normal Chrome windows in the same browsing context. A foreground incoming tab joins that group, becomes active and brings its destination window forward. A deliberate background open joins without activation or focus. An existing eligible duplicate's manual group/window/position still takes priority over grouping rules. Existing same-name groups are not merged.

The reported focus failure was reproduced on Chrome for Testing155.0.8059.84. Placement succeeded, but a valid same-URL, same-document history event revoked the navigation token and removal lease before presentation. The tracker now treats only fully validated eligible history/fragment observations with exact unchanged URL bytes, matching native href/document, and existing trusted unblocked navigation as no-ops. It preserves current ownership without creating a candidate or advancing winner rank. Real navigation, invalid metadata, stale ownership, document/snapshot changes and attention changes retain their guards. No retry, debounce or focus override was added.

## Verification

- Independent controller: typecheck, **1,065 unit/integration tests**, build and five-file package check passed. All101 recorded source/test/config/package hashes match the implementer's verified files.
- Independent controller full browser run: **137 expected, zero skipped/unexpected/flaky, no errors**, 166,963ms on Chromium156.0.8078.4. The implementer's separate full137 run also passed.
- Chrome155 real-worker reproduction: unchanged source failed after settled corrective move3; the fixed source completes activation, focus and duplicate closure. The no-history control completes in both versions.
- Native156 regressions verify foreground and Cmd-click background behavior during real same-URL history updates, plus cancellation on a real URL change.
- Nine real OS launches passed. The added external-app case starts an owned foreground helper with all isolated Chrome windows unfocused, opens a local URL through LaunchServices, and verifies incoming activation/destination focus despite15 history events during the operation. Temporary app/profile removal was independently checked.
- [Whole-feature review](2026-10-27-cross-window-group-reuse-review.md), [Task2 review](2026-10-27-cross-window-group-reuse-task-2-review.md), and [history correction review](2026-10-27-same-url-history-review.md) are retained. The correction has independent spec and quality approval with no new findings.

One earlier Task2 pending-activation test-gate timeout remains unexplained; its original trace is retained. The confirmed history defect does not retroactively diagnose that timeout. Both final137-test runs passed. Isolated155/156 tests do not establish every personal-profile/macOS Spaces timing, minimumChrome120 runtime behavior, enabled incognito or manual drag behavior; those release checks remain documented.

## Try it in Chrome

1. Reload ChromeReHome in `chrome://extensions`, using the existing unpacked repository `dist/`. This build is already rebuilt. Keep the existing enabled configuration; Options must say automatic replacement is enabled. Reloading preserves saved settings. The README has a preserve-rules activation command if the master flag is disabled.
2. Keep one `Group A` in window1 with a rule `https://example.com/*` → `Group A`. For a rule-only test, use a URL with no existing equivalent tab, such as `https://example.com/?rehome_trial=foreground`.
3. Open that URL normally in window2, then from iTerm2. It should join the existing Group A, select the incoming tab and focus window1. Repeat with windows on the same desktop and different Spaces to confirm the personal-profile behavior.
4. Use the [local test links](../../testing/cross-window-links.html) for a deliberate Cmd-click background open. Window2 should stay in front and window1 retain its previous active tab. Close an earlier equivalent test tab before repeating a rule-only trial.
5. Put an older duplicate in a different manually chosen group and reopen its exact URL. That group still wins; the older duplicate closes only after guarded placement/presentation succeeds. Back should preserve the incoming tab's history.

## Decisions retained

Attention authority is checked through durable accepted placement. Subsequent focus-only changes do not cancel otherwise-verified duplicate cleanup; no more focus calls occur. The cost is that switching attention after accepted placement can still be followed by older-duplicate closure.

Fully validated same-URL/document history state updates preserve an already-current operation. The cost is that state-only page updates no longer cancel it. Exact URL/document checks and real-navigation invalidation remain in force.

## Trial artifact

`ChromeReHome-cross-window-trial.zip` contains exactly the five verified dist files, 30,558bytes. SHA256: `db53a677e2c71f2b3fe084146fdf8dea58337a98a79ad0d71515acf476580660`. Its contents were compared byte-for-byte with the rebuilt package. Source, test tooling and diagnostic scripts are excluded. Detailed evidence and the historical timeout trace are retained in the chat's verification archive.
