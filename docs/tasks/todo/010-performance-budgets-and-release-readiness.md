# 010: Performance budgets and release readiness

Status: Complete in 0.1.3

Depends on: 009

## Outcome

Measure the complete product and set supported limits before choosing indexing or caching optimizations.

## Integration points

tests/performance/; benchmark report; release/package checks; user documentation.

## Acceptance criteria and decisions

- [x] Measure 20/200/1000 tabs and increasing rule counts; record environment, warm/cold worker, percentile latency, API calls, storage writes, memory and package size.
- [x] Confirm no polling or unintended worker keep-alive; compare fresh-query behavior before adding an incremental index.
- [x] Set evidence-based budgets and configuration limits. If indexing is needed, specify reconciliation for startup, removal, attachment, replacement and worker suspension.
- [x] Verify Chrome 120 and current stable compatibility, permission rationale, no raw URL logging by default, settings migration, clean install/update, lockfile and reproducible package contents.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.

## Results

The [performance baseline](../../performance-baseline.md) records 270 warm and cold matrix trials, ten headed foreground trials, four untouched-package outcome checks, and two natural idle stops on the pre-fix candidate. The corrected 0.1.3 package passed 24 additional instrumented performance spot checks and four untouched-package checks. Up to 200 tabs is the routine performance envelope for the tested workload. The 1,000-tab stress profile had mostly discarded filler tabs. Keep the existing rule limits and fresh browser reads.

The [release qualification](../../testing/chrome-release-qualification.md) passed the exact final package on Chrome 120 for Testing on Linux and current stable Chrome 157 for Testing on macOS. A repeated Chrome 120 popup trial exposed a settings verification race. The corrected package passed 24 alternating Pause and Resume actions on Chrome 120, and deterministic tests cover the storage and command ordering. The Chrome 120 macOS binary exited before extension startup on the test host.

The [closeout](../../reviews/2026-11-10-performance-and-release-readiness.md) records the package inventory, privacy check, verified version, and remaining scope. Task 011 remains in the backlog.
