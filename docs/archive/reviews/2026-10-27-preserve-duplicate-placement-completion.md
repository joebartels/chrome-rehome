# Preserve existing duplicate placement: completion

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Completed 2026-10-27. Product commit `historical-revision`, branch `preserve-duplicate-placement`, base `historical-revision`. This is a policy correction before Task 008, not Task 008 implementation.

An existing eligible duplicate now supplies the surviving new tab’s live group, window and position before any configured grouping rule. Group A therefore wins over a rule requesting Group X. Existing ungrouped placement is preserved too. If several duplicates exist, the unchanged deterministic anchor selector prefers one in the incoming window, then window/index/tab ID order; no manual-move history is inferred. With no duplicate, grouping rules apply normally.

The planner chooses the anchor first, and the consumer always reads its live main-frame document. Missing or changed required anchor evidence stops work instead of falling back to a rule. Executor, stale-work checks, closure verification, recovery journal, configuration schema, activation, dependencies and permissions remain unchanged. Incoming winner ID/history survive as before.

Options help now explains optional duplicate policies with an ignored tracking-parameter example, and matching preview as testing draft rules rather than predicting live placement. Preview never checks open tabs or changes them. Duplicate policies can be left empty for conservative URL comparison.

## Verification

- RED: three planner regression failures (same/cross-window Group A vs Group X, ungrouped existing location) and one consumer failure (matching rule bypassed unavailable anchor evidence) reproduced the previous behavior.
- GREEN: 123 affected tests, then **964 unit/integration tests across 29 files**, typecheck, build/package and whole-range whitespace checks passed.
- **109 real-browser tests passed**, zero skipped, unexpected or flaky results. The eight editor cases still pass. The five macOS external-link cases ran; four enabled cases preserve the exact original Manual group ID/window despite the External rule, close only the verified older tab, and retain unrelated IDs. Disabled control retains both tabs ungrouped. Temporary native profiles/app roots were independently confirmed removed.
- Native same/cross-window Group A vs Group X tests assert exact group/window, position, retained unrelated IDs and survivor history. Conflicting-rule ungrouped inheritance and grouping-only fallback also pass.
- Updated group/title durable recovery fixtures use lone winners; optional-passive evidence fixtures retain a separately valid required anchor. Guard coverage was preserved rather than relaxed.
- [Independent review](2026-10-27-preserve-duplicate-placement-review.md) found no Critical, Important or Minor issues. Its final browser-verification condition was subsequently satisfied by the full 109-case run.

## Chrome test

Reload the existing ChromeReHome installation in `chrome://extensions`. Keep a rule requesting Group X for `https://example.com/*`. Open `https://example.com/`, manually put it in Group A, then click the same HTTPS URL from iTerm2. The new survivor should be in Group A, and the older duplicate should close after verified placement. Repeat across windows or with the older tab ungrouped. With no old duplicate, the rule should create/use Group X. Existing configuration/activation are preserved; opening settings and using preview do not mutate tabs.

Bundled Chromium 156.0.8078.4 was used. Broader release certification, incognito/drag/intent limitations and Task 008 protection work remain unchanged. No new unsaved-form protection is claimed. Local build contains exactly five files. Trial export: ChromeReHome-manual-placement-trial.zip, 28,749 bytes, SHA256 `81bdcf5412ea900020557a4c92c87bf4b7fd277a9d2cbbe8ba310150747b0ffd`. No push, merge or PR. Pause before Task 008.
