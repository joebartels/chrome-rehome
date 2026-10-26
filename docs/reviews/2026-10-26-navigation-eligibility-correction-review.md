**I1 — Reject holes in qualifier arrays before establishing trust — ADDRESSED.** `src/background/navigation.ts:79` spreads the qualifier array before validation, turning unassigned slots into `undefined`, which fails the known-qualifier check and reaches the existing synchronous revocation/block/provenance-clearing branch. `tests/unit/navigation.test.ts:27` adds the sparse array to the malformed-input table; `tests/unit/navigation.test.ts:43` explicitly checks old token/view revocation, no current navigation, blocked state, suppressed history/fragment updates and no later qualified client-redirect provenance.

**New breakage in the fix diff:** None. Dense empty and known qualifier arrays preserve their validation semantics.

**Out-of-scope observations:** None.

**Checks:** Read the task brief, original finding, appended fix report and supplied `historical-revision..historical-revision` diff. The report names the covering navigation suite and records RED (2 failures, 53 passes), GREEN (55 passes), typecheck and diff-check success. These claims are consistent with the two-file fix; historical execution was not independently verified. No tests were rerun because inspection raised no new doubt requiring a probe. No checkout, index, HEAD or branch changes were made; only this authorized review report was written. No subagents were dispatched.

**Fix round:** All findings addressed, no new Critical/Important breakage.
