# 003: Group destination resolution

Status: TODO

Depends on: 001

## Outcome

Resolve a logical configured group to a concrete live group/window. Reuse existing groups or create a group when needed without persisting session IDs as durable identities.

## Integration points

planning/group-destination.ts; browser group mutation adapter introduced here.

## Acceptance criteria and decisions

- [ ] Decide current-window versus designated cross-window group behavior and tie-breaking for duplicate group titles.
- [ ] Return an explicit destination and placement intent; pass window IDs rather than relying on service-worker current-window defaults.
- [ ] Handle group deletion/rename, last-tab removal, pinned-tab restrictions, incognito separation, and API failures.
- [ ] Test creation, reuse, ambiguous titles, stale IDs, and two simultaneous requests for the same missing group.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.
