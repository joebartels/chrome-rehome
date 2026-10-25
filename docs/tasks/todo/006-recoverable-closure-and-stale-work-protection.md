# 006: Recoverable closure and stale-work protection

Status: TODO

Depends on: 005

## Outcome

Enable older-duplicate closure only after successful placement, precondition revalidation, and restart recovery are implemented together.

## Integration points

execution/replacement.ts; execution/journal.ts; background/recovery.ts; storage.session adapter.

## Acceptance criteria and decisions

- [ ] Define a small versioned journal with participants, identity/generation preconditions and completed phase. Treat live Chrome state as authoritative.
- [ ] Revalidate winner and each duplicate immediately before removal; abort stale plans when any participant navigates or disappears.
- [ ] Document the residual race: Chrome has no atomic compare-URL-and-close API. Minimize it and never claim full transaction guarantees.
- [ ] Never release a mutation queue because Promise.race timed out while its underlying browser call can still mutate.
- [ ] Test worker termination after each phase, journal write failures, placement/removal failures, a participant navigating mid-operation, event feedback, and competing winners. No closure on ambiguous recovery.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.
