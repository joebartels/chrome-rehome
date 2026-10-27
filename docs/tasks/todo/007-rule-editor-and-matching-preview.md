# 007: Rule editor and matching preview

Status: IN PROGRESS (2026-10-27)

Depends on: 001, 002, 003

## Outcome

Build settings that edit ordered wildcard group rules and separately edit supported duplicate equivalence rules. Reuse domain validators and matchers for previews.

## Integration points

options/; config migrations and repository; typed internal messaging only where necessary.

## Acceptance criteria and decisions

- [ ] Support adding, editing, ordering, disabling, and deleting rules with inline validation.
- [ ] Show which rule matches a pasted URL and distinguish group destination from duplicate identity.
- [ ] Persist atomically as a validated settings document; surface storage errors without claiming a save.
- [ ] Test invalid input, first-match precedence after reorder, config change propagation, migration, keyboard operation and accessible labels.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.

## Task 007 implementation decisions (2026-10-27)

See [design](../../superpowers/specs/2026-10-27-rule-editor-design.md) and [plan](../../superpowers/plans/2026-10-27-rule-editor.md). Canonical schema 4 stores enabled flags on each rule; strict legacy versions migrate in memory without writes. Disabled rules remain editable and validated. Disabling a duplicate policy restores conservative duplicate comparison; it does not exempt an origin from replacement. Both lists retain order; duplicate origins must be unique, so duplicate-policy order has no precedence.

The native options page uses explicit Save, with separate grouping and duplicate previews powered by the same runtime compilers. Preview URLs are memory-only. Global activation stays unchanged; Task 008 owns activation/pause and protection controls. Dirty drafts survive observed external conflicts and save failures. Storage has no compare-and-swap: preflight and verification detect observed changes without promising fully serialized cross-page writes.
