# 010: Performance budgets and release readiness

Status: TODO

Depends on: 009

## Outcome

Measure the complete product and set supported limits before choosing indexing or caching optimizations.

## Integration points

tests/performance/; benchmark report; release/package checks; user documentation.

## Acceptance criteria and decisions

- [ ] Measure 20/200/1000 tabs and increasing rule counts; record environment, warm/cold worker, percentile latency, API calls, storage writes, memory and package size.
- [ ] Confirm no polling or unintended worker keep-alive; compare fresh-query behavior before adding an incremental index.
- [ ] Set evidence-based budgets and configuration limits. If indexing is needed, specify reconciliation for startup, removal, attachment, replacement and worker suspension.
- [ ] Verify Chrome 120 and current stable compatibility, permission rationale, no raw URL logging by default, settings migration, clean install/update, lockfile and reproducible package contents.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.
