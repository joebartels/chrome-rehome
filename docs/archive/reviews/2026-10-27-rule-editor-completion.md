# Task 007: rule editor and matching preview

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Completed 2026-10-27 on local branch `rule-editor-preview`. Feature base `historical-revision`; final product commit `historical-revision`. Task 008 remains unstarted.

## Outcome

The extension options page now edits ordered grouping rules and exact-origin duplicate policies. Both support add, edit, reorder, enable/disable and delete, with inline domain validation and keyboard controls. Grouping uses the first enabled match. Duplicate policy order is display order because canonical origins must be unique. Disabling a duplicate policy restores conservative comparison; it does not exempt an origin from replacement.

Preview uses the actual runtime compilers for group/policy selection and pair equivalence. Drafts preview before saving, even when automation is disabled. Preview URLs stay in page memory: no requests, tab/group queries or mutation, storage writes, opaque identity exposure or diagnostics. Grouping ignores candidate query/hash; query/hash syntax in grouping patterns remains unsupported. A configured group title is not a resolved live Chrome group.

Canonical schema 4 requires per-rule enabled flags. Strict v1–v3 migrate in memory without rewriting stored bytes. Legacy rules become enabled while global activation, order and values remain unchanged. Disabled entries remain validated and saved. Direct compiler legacy inputs remain compatible. New installations remain disabled; existing installations preserve activation. Task 008 activation/pause/protection controls have not been added.

Save validates the whole document, refreshes its base, performs one storage write and verifies a fresh current read before acknowledging success. Save failures retain drafts and permit retry. Observed external conflicts preserve drafts and require explicit Reload; request/disposal guards reject stale asynchronous results. Chrome storage has no transactional compare-and-swap, so a writer between preflight and write can still race. Drafts and preview text are lost if the page closes/reloads.

## Verification

Final independent verification against the reviewed product code:

- TypeScript: passed without diagnostics.
- Vitest: **962 tests across 29 files**, all passed.
- Build and package: passed; exactly five distribution files and unchanged permissions/dependencies.
- Full Playwright: **108 passed**, zero skipped, unexpected failures or flaky results. The final structured result is `controller-final-browser.json` in the archived verification evidence.
- All five actual macOS LaunchServices regressions passed: warm HTTP, warm HTTPS, HTTP→HTTPS final identity, stopped-worker HTTPS and disabled control. Their five temporary profiles and cloned app roots were independently confirmed removed.
- Eight editor browser cases cover keyboard/caret and row actions, literal unsafe text, validation/limits, exact persistence and legacy byte preservation, preview isolation, clean propagation/dirty conflicts across pages, rejected Chrome writes and retry, and saved enable/disable affecting actual background grouping.
- Whole feature-range whitespace check: clean.

TDD evidence includes schema/enablement failures, nondefault-port preview regressions, deferred-storage failure/ordering/disposal tests, missing-UI browser failures and three final status-transition regressions. Test-only fault injection adds no production endpoint. Browser tests use disposable profiles, never personal Chrome.

Root inspected wide light and narrow dark screenshots. Chromium full-page capture produced a compositor artifact; document/normal-viewport captures and one-heading/four-section DOM assertions provide clear layout evidence without a CSS workaround.

## Independent reviews

[Schema/model review](2026-10-27-rule-editor-model-review.md) and [controller/UI review](2026-10-27-rule-editor-ui-review.md) approved their tasks. The [whole-feature review](2026-10-27-rule-editor-review.md) found no Critical or Important issues and two Minor issues: inaccurate optional-enabled diagnostic text, and stale editor messages after conflict resolution/reverting edits. Both were fixed in one cleanup wave with regression tests. The [scoped cleanup review](2026-10-27-rule-editor-cleanup-review.md) confirms both addressed and no new breakage. No findings are open or parked. Environment-only color warnings in an implementer run were absent from root's final invocation.

## Try it in Chrome

Reload ChromeReHome in `chrome://extensions`, then open **Details → Extension options**. Reload the existing installation from this repository's `dist` to preserve its configuration. Your Trial rules and activation state survive; opening the editor alone does not rewrite legacy storage.

Add `https://example.com/projects/sample/*` → `BarTab`, paste an issues URL into **URL to preview**, and confirm the named rule/group. Add a broader example.com rule and move it above/below to test first-match precedence. Choose **Save settings**, wait for **Settings saved.**, and reopen settings to confirm persistence. Preview uses draft changes before Save; live behavior changes after Save.

Compare two example.com URLs with differing utm_source/hash values. Add a policy for origin `https://example.com` to ignore `utm_source` and fragment: preview should report equivalence. Disable it to restore conservative comparison. Preview does not request these URLs.

With the existing enabled trial, the iTerm2 HTTPS example.com test should still group the incoming survivor and close the verified older duplicate. Disabling a grouping rule affects future grouping only; it neither ungroups existing tabs nor disables duplicate replacement. See the [full Chrome walkthrough](../../README.md) and controlled-trial activation/pause/backup instructions. No activation toggle ships until Task 008.

## Limits and handoff

Validated with bundled Chromium 156.0.8078.4 on macOS. Chrome 120/current-stable runtime matrix, enabled-incognito and interactive drag/focus/collapse trials, hosted CI and performance budgets remain unverified. Existing metadata/intent, unsaved-form and final check-to-call limitations remain. Preview is not a live tab/group dry-run.

The exported trial ZIP contains exactly the five verified distribution files: 28,563 bytes, SHA-256 `360ad60ccd61fd57803f0db1422e0ac424b4c0a3c5c45597c25c56b869dc3c7a`. Reports, final browser JSON, native attachments, screenshots and the plan ledger are archived with this chat's verification evidence. Source and build stay on the local branch; no push, merge or PR was performed. Paused before Task 008.
