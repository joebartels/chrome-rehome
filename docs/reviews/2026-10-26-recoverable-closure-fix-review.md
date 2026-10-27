- **Require target absence across the full snapshot before verifying a removal.** — **ADDRESSED**. `src/execution/replacement.ts:45` rejects any full-snapshot tab whose ID belongs to the asserted-absent prefix before affected-window filtering. `read()` passes the complete `port.read()` snapshot through this validator (`:69`–71), and `observe()` validates both bracket snapshots (`:75`, `:88`). Post-call verification includes the attempted target (`:158`–159); only successful verification appends it to the verified prefix and persists the removed checkpoint (`:160`–162). Later preflights validate the entire existing prefix (`:147`). Existing coherence, survivor count/order/location, group metadata, document and current-guard checks remain intact.
- **Regression checks:** `tests/unit/replacement-execution.test.ts:140` covers fulfilled relocation to window999; `:161` covers target reappearance during the document read before the final bracket snapshot. Both assert stopped, no verified removals, uncertain target2, no remove3 and no journal write verifying2. The retained RED log shows both failing with completed/[2,3]; the retained GREEN log shows105/105 passing across replacement and placement tests.

### New Breakage in the Fix Diff

- **None.** The production change adds only the global absence rejection; no existing guard or mutation ordering was removed. The two regressions exercise the specific defect and the subsequent bracket-snapshot variant.

### Out-of-Scope Observations

- **None newly observed.** The previous review's deferred Minor findings and controller-owned whole-feature/documentation/manual gates remain outside this scoped fix review.

### Checks

- Read the brief, original Important1 in full, appended fix report and supplied two-file fix diff once. Inspected only the validator/read/observe and removal-prefix call sites needed to establish the invariant; no git recomputation, source/index/HEAD mutation, helpers or subagents.
- Inspected `fix-round-1-red.log`, `fix-round-1-green.log`, `fix-round-1-typecheck.log`, `fix-round-1-build.log`, `fix-round-1-package.log` and `fix-round-1-playwright.log`. Logs corroborate the two regression failures before the fix,105/105 focused tests afterward, successful build/package output and7/7 production browser checks. The empty typecheck log is consistent with the author's reported exit0. No suites or experiments were rerun; code inspection raised no unresolved doubt requiring one.

### Verdict

- **Fix round: All findings addressed, no new Critical/Important breakage.** Important1 is closed. Final whole-feature review and gates remain the controller's next step.
