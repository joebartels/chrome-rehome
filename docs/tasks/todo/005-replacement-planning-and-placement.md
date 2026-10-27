# 005: Replacement planning and placement

Status: Complete — locally verified 2026-10-26; paused before Task006.

Depends on: 001, 002, 003, 004

## 2026-10-27 policy amendment

The user’s manual organization now takes precedence. An existing eligible duplicate supplies its group/window and position even when a grouping rule disagrees; rules apply only when there is no duplicate. The selected anchor always needs document evidence. Earlier Task005 completion text below records its original configured-override policy and is historical; see [the correction](007a-preserve-existing-placement.md).

## Original outcome

Build a pure plan: configured group overrides inherited duplicate group/location, which overrides the incoming location. Execute final placement directly without closing tabs yet.

## Integration points

planning/replacement.ts; execution/placement.ts; focused browser mutation ports.

## Acceptance criteria and decisions

- [x] Capture participant IDs, identities, navigation generations, destination window/group, and relative anchor position.
- [x] Resolve final destination before executing moves; retain history by moving the existing winning tab rather than creating another tab.
- [x] Handle active/background tabs, index shifts, collapsed groups, pinned eligibility, and source-window closure. Decide focus policy explicitly.
- [x] Test same-window/cross-window placement, lone-tab groups, configured override, stale anchor, browser drag rejection, and failure that retains both tabs.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.


## Adopted placement trial decisions

Implementation96ac107 and readability cleanupad2efd3 passed independent task and whole-feature review. Fresh controller verification:687 tests across22 files,27 Chromium cases, typecheck/build/package validation. See [completion evidence](../../reviews/2026-10-26-replacement-placement-completion.md). The trial defaults disabled, retains all original tabs and moves only the eligible winner. Configured exact-title grouping in the incoming window takes precedence; otherwise inherit the selected duplicate's group/ungrouped membership and immediately-following position. A lone winner can group through the opt-in selector; ordinary four-argument selection keeps its no-duplicates skip.

One frozen plan, one coordinator queue, a published configuration revision lease, strict event/view/native snapshot and active outermost-document checks guard each await. Passive duplicates need no document; only winner and used inherited anchor are read. A configured override remains independent of unavailable overridden duplicate frames. Source/destination shared groups skip; missing shared metadata remains compatible. No retries, rollback, tab creation/closure, editor, permissions, dependencies or schema changes.

Native tab grouping/movement can change active/focus/collapse state; production never requests these changes. The winner is removed once when calculating after-anchor insertion. Only its expected empty source group/window may disappear; nonwinner relative order and original IDs must survive. Rejection effects are explicit and original causes retained. Real production-dist local HTTP browser trials cover grouping-only/disable, same-window directions, grouped and ungrouped cross-window inheritance, grouped interior positions, collapsed configured override, winner history and all original IDs. Controlled drag/title failures are simulated tests; actual mouse drag, enabled incognito and Chrome120/current-stable matrix remain manual gaps.004's scripted ordinary-link ambiguity and conservative unrelated-navigation cancellation remain accepted trial limits.

See [README trial instructions](../../../README.md#controlled-placement-trial) for the exact unpacked path, schema3 backup/enable/pause/restore commands and visible smoke steps. Task006 is not started.
