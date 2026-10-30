# Task 1 review — historical-revision..historical-revision

## Spec compliance

- ✅ The reviewed Task 1 implementation meets the behavioral requirements. The worker-only native entry accepts and observes synchronously before readiness or queue awaits; its original generation survives only owned startup work, and it uses the existing writer and protection transaction (`src/background/controls.ts:115`, `src/background/controls.ts:130`, `src/background/controls.ts:235`).
- ✅ Distinct native and selected factories share private verification. Native reads use `tabs.get` and omit only selection requirements; popup reads retain selection checks. Both bracket document identity with tab/document rereads (`src/browser/control-target.ts:8`, `src/browser/control-target.ts:17`, `src/browser/control-target.ts:59`).
- ✅ Production readiness delegates to coordinator initialization outside the control writer (`src/background/index.ts:29`, `src/background/controls.ts:143`). No menu registration, manifest permission, wire command, dependency, asset, or configuration-schema changes appear in this task diff.
- ⚠️ File-allocation variance: `tests/unit/controls.test.ts` and `tests/unit/protection-controls.test.ts` remain unchanged. The added assertions instead live in `tests/unit/native-protection-controls.test.ts:26` onward, including synchronous admission/config invariance, cold readiness and responsive Pause, competing intents, cleanup, privacy, popup competition, storage failure and final verification. The controller clarified that changes to existing fixtures/tests were conditional on the new capability requiring them; native dependencies are optional (`src/background/controls.ts:12`). This is a reported allocation variance, not a waiver of required behavior.
- ⚠️ Cannot verify from this diff: actual native browser interaction, Chrome 120 runtime behavior, the reported eight-file/three-JavaScript build contents, or unchanged whole-branch journal/retention/recovery guarantees. The implementer reports 1,294 tests in 42 files, clean typecheck/build/package checks, and no native browser run. Those claims were read, not independently rerun. The controller's owned native probe was blocked before UI actions; actual menu metadata/interaction proof remains Task 2 work.

## Strengths

- The outer observation spans startup, queue waiting, both verification reads and persistence. Disposal handles both normal settlement and explicit service disposal, while shared finalization releases pending/protection-intent accounting (`src/background/controls.ts:130`, `src/background/controls.ts:153`, `src/background/controls.ts:288`).
- Native commands retain their captured generation across readiness, then use the current revision only after that generation check. This permits owned startup publication without freshening an older intent after external invalidation or a newer Pause (`src/background/controls.ts:143`).
- Popup commands still supply their original receipt to the shared transaction. Native commands derive their receipt internally, and both compare it after persistence, preserving the existing failure latch, identity separation and 1,000-entry limit (`src/background/controls.ts:178`, `src/background/controls.ts:235`).
- Tests exercise real service/repository/target-adapter composition with controlled asynchronous boundaries. The target matrix covers both tab reads and both document reads; service coverage includes composed coordinator recovery, held readiness with responsive Pause, stale intents, cleanup, private identity mismatch, postwrite failure and listener release (`tests/integration/control-target-currency.test.ts:72`, `tests/unit/native-protection-controls.test.ts:26`).

## Issues

- Critical: none found.
- Important: none found.
- Minor: no code-quality defect identified. The test-file allocation variance is recorded above for the controller's task record.

## Focused checks and limits

- Named risk: initial store publication/pruning might accidentally revoke a valid cold native click or mask external invalidation. Inspected only the unchanged initialization/subscription block at `src/background/controls.ts:46`–104. Its initial-read flags are consumed by synchronous owned invalidations, config's first publication preserves generation, subsequent publications advance it, and pruning checks repository snapshot identity before its narrowly exempt write.
- Named risk: readiness could hold the same queue needed by newer Pause. Inspected `src/background/coordinator.ts:36`–43: coordinator initialization combines controls readiness with recovery on the separate coordinator queue. The new native entry awaits that promise before entering the control writer (`src/background/controls.ts:143`).
- Read the target/readiness sections of the binding design (`docs/superpowers/specs/2026-10-28-tab-context-protection-design.md:17`–25). Read the complete supplied diff; the first tool response truncated its middle, so the missing production/adapter section was recovered from the diff package. No changed implementation file was reread except the explicitly named unchanged initialization block needed to resolve the startup-generation risk.
- No tests, builds, browser actions, helpers, git mutations, or checkout edits were performed. No unresolved code doubt justified repeating the author's suites.

## Assessment

**Task quality: Approved.**

The native path preserves strict popup authority while sharing the existing mutation and failure domains. The implementation and added behavioral tests support proceeding to Task 2; native menu/browser proof remains outside this Task 1 approval.
