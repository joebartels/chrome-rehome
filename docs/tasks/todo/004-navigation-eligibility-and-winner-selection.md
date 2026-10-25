# 004: Navigation eligibility and winner selection

Status: TODO

Depends on: 002

## Outcome

Choose the tab receiving the newest eligible navigation as winner. New tabs and existing-tab navigations both participate. Produce stable navigation generations for downstream plans.

## Integration points

background/navigation.ts; planning/candidates.ts; browser snapshots.

## Acceptance criteria and decisions

- [ ] Decide which committed/history/fragment transitions trigger replacement; avoid treating reload callbacks or group changes as new winners accidentally.
- [ ] Specify deterministic ordering for concurrent matching navigations and anchor selection when multiple duplicates exist.
- [ ] Explicitly distinguish browser startup/session restoration from user navigation; do not mass-close restored tabs by accident.
- [ ] Test redirects, SPA transitions, back/forward, prerender tab replacement, navigation during initialization, and two matching navigations arriving together.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.
