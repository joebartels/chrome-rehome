# 008: Pause controls and replacement protections

Status: in progress (2026-10-28); delegated implementation and independent review authorized.

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

## Recorded product decisions

Use worker-owned global pause/resume and rules-only editor saves; retain schema4 and default-off. A session-only Protect this tab control supports deliberate duplicates and unsaved edits without page inspection. Pinned exclusions stay; audible/protected incoming tabs skip work. Older audible/protected duplicates retain anchor priority, allow valid incoming placement, and retain all older duplicates for that plan. Live protection/audio changes revoke further work. Protection follows tab navigation/worker suspension and ends at tab close/replacement or extension/browser restart. No reset bypasses journal quarantine. Expand the strict package to eight files for the action popup; add no permissions/dependencies. Task011 recent tabs is backlog only.

[Design](../../superpowers/specs/2026-10-28-pause-protections-design.md) · [Plan](../../superpowers/plans/2026-10-28-pause-protections.md).
