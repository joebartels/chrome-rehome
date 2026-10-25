# 007: Rule editor and matching preview

Status: TODO

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
