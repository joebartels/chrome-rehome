# 005: Replacement planning and placement

Status: TODO

Depends on: 001, 002, 003, 004

## Outcome

Build a pure plan: configured group overrides inherited duplicate group/location, which overrides the incoming location. Execute final placement directly without closing tabs yet.

## Integration points

planning/replacement.ts; execution/placement.ts; focused browser mutation ports.

## Acceptance criteria and decisions

- [ ] Capture participant IDs, identities, navigation generations, destination window/group, and relative anchor position.
- [ ] Resolve final destination before executing moves; retain history by moving the existing winning tab rather than creating another tab.
- [ ] Handle active/background tabs, index shifts, collapsed groups, pinned eligibility, and source-window closure. Decide focus policy explicitly.
- [ ] Test same-window/cross-window placement, lone-tab groups, configured override, stale anchor, browser drag rejection, and failure that retains both tabs.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.
