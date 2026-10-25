# 008: Pause controls and replacement protections

Status: TODO

Depends on: 006, 007

## Outcome

Make automatic replacement controllable and define explicit exclusions before enabling it by default.

## Integration points

popup/; shared configuration; planning eligibility policy.

## Acceptance criteria and decisions

- [ ] Decide pinned/audible-tab behavior, deliberate duplicates/bypass, and form-edit protection. Browser metadata alone cannot reliably detect arbitrary unsaved edits.
- [ ] Keep any stronger page-inspection requirement optional and review its permissions separately.
- [ ] Provide global pause and clear status; configuration changes must invalidate queued work that is no longer eligible.
- [ ] Test pause during queued replacement, protected duplicates, background opens, restored sessions, and normal/incognito separation.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.
