# Protection toggle and toolbar lock closeout

Source commit: `historical-revision`, branch `pause-controls-protections`. User explicitly chose the single-toggle/toolbar-lock approach. Task009 and011 remain paused; no push or merge.

The native menu now has one **Toggle tab protection** action. It resolves verified state for the right-clicked tab inside the shared writer. Pin ChromeReHome: the selected manually protected tab shows **🔒**, with **ChromeReHome — tab protected** tooltip. Unprotected or unavailable state clears the lock. The indicator follows page reload and worker restart. It appears on the extension toolbar icon; Chrome has no supported custom background-tab-handle badge in this scope.

## Verification and review

Controller independently ran the full portable suite (1,353 passed in44 files), typecheck, build, strict package check, and full refinement-range whitespace check. Each exited0. The build remains exactly eight files, three JS graphs and five permissions with no new dependency, page access, content script or persistence schema. The exported trial was checked byte-for-byte against these verified dist files and its ZIP CRC passed.

Author's final packaged Chrome156.0.8078.4 run passed25/25: six controls, fifteen placement/protection safety and four menu/indicator cases. Chrome action badge/title readback, clicked-target identity, multiselection, two windows, popup mutations, navigation reset, worker restart and extension reload are covered. Native callback inputs in those cases are synthetic; real Chrome storage/document/action APIs run underneath. Browser testing found a genuine navigation-reset display bug; two failing portable regressions drove the fix. No native assertions were weakened.

Independent task review: spec compliant and Approved, no Critical/Important findings. A nonblocking color-environment warning was recorded. Final whole-follow-up review: Approved for the authorized local handoff, with no Critical/Important findings and no additional actionable Minor findings. See the [final review](2026-10-29-protection-toggle-final-review.md).

Actual final native menu appearance, emoji glyph rendering, and Chrome120 runtime certification remain manual/release checks. The unsafe UI bridge was not retried. Prior native foreground limitations remain as documented in the historical008a closeout; neither extra passing attention cases nor this UI refinement claim a general focus reliability fix. See the [detailed verification](2026-10-29-protection-toggle-verification.md) and [task review](2026-10-29-protection-toggle-task-review.md).

## Try it in Chrome

1. In `chrome://extensions`, reload the existing unpacked ChromeReHome build from this repository's `dist/`. Settings/activation persist, but extension reload clears manual protection. Fresh installs remain paused.
2. Pin ChromeReHome through Chrome's Extensions menu. Pause automatic processing in the popup while checking this UI with two loaded HTTP(S) tabs A and B.
3. Leave A active; right-click background tab B → ChromeReHome → **Toggle tab protection**. There should be one action. A should stay selected.
4. Select B: the pinned icon should show **🔒** and the protected tooltip; the popup should confirm protection. Select A: it should have no lock.
5. Toggle B again to clear protection. Repeat with A/B multi-selected: only the tab you right-click should change. Protect B and reload its page: the lock and protection should remain. Resume processing afterward if desired.

Manual protection lasts through page navigation/reload and service-worker suspension; it ends when the tab closes/is replaced or the extension/browser restarts. Pinned/audible automatic exclusions do not themselves display this manual-protection lock.

## Controller decision

Continued without another approval question because the user's explicit approach selection and existing delegated-execution authorization cover this small follow-up. Cost if that interpretation was wrong: routine implementation details were settled through review instead of a separate approval gate. All work remains local and reviewable.
