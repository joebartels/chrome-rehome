# Task 1 independent review — historical-revision..historical-revision

## Spec compliance

✅ **Spec compliant for Task 1.** Worker-owned configuration writes, immediate pause fencing, independent command serialization, immutable operation guards, rules-only saves, draft retention, strict messaging, startup currency, and cleanup requirements are implemented. No Critical or Important findings.

The original file list named `src/options/model.ts`, which has no hunk. The controller explicitly accepted the allocation amendment during review: shared `sameRules` belongs in neutral `src/controls/protocol.ts:43` and is consumed by the worker and options controller. Root will make model changes conditional in the plan/brief and record the reason. This is an accepted file-plan variance, not a missing behavior.

Task 2 session protections/audio and Task 3 popup/package expansion remain intentionally outside this gate. `src/background/controls.ts:73` returns unavailable for protection commands and `src/background/controls.ts:60` captures an empty protected list; these are explicit Task 1 staging points.

## Strengths and requirements checked

- **Immediate authority and responsive status:** `src/background/controls.ts:77` separates enabled intent tickets from the operation generation. Lines 79–82 advance status revision, increment pending work, and invalidate before entering the command queue. `getStatus` at line 40 reads current state synchronously. `tests/integration/coordinator.test.ts:207` exercises pause while native consumption remains deferred and proves resume cannot revive old or queued work.
- **Pause/rule ordering:** `src/background/controls.ts:78` only cancels superseded enabled commands. Rules commands therefore cannot cancel accepted pause; line 102 compares the baseline inside the writer queue and lines 103–105 preserve current enabled state. Readback at lines 107–115 gates successful completion. The deferred controls tests cover older-write completion, both save/pause orderings, queued resume, stale editors, and failed writes.
- **Runtime/UI version separation:** `src/background/controls.ts:27` changes only operation generation during ordinary invalidation. Resume separately checks accepted revision, post-read repository revision, and runtime readiness at lines 88–99. Recovery is evaluated in production through `src/background/index.ts:24`; a valid pause does not unblock recovery.
- **Startup and incomplete reads:** `src/config/repository.ts:29` announces load invalidation synchronously; `src/background/controls.ts:28` exempts only the service's own first load-start callback. Later/reentrant reads invalidate immediately. The initial publication does not discard a legitimate first navigation, while `src/background/coordinator.ts:53` and line 59 preserve the observed generation rather than refreshing stale work. The unit regression at `tests/unit/controls.test.ts:168` covers external invalidation during initial load; the recorded stopped-worker external navigation passed.
- **Removal credit preservation:** `src/background/controls.ts:128` deliberately leaves unprotected removal as a control no-op. `src/background/coordinator.ts:74` forwards lifecycle removal into the existing tracker. Focused unchanged-code inspection of `src/background/navigation.ts:67` confirmed issued-removal credits advance the lease revision; `src/background/placement.ts:65` composes the coordinator guard with that lease. The recorded three-duplicate production closure passed.
- **One production writer and private drafts:** `src/options/index.ts:8` installs a read-only repository adapter and lines 15–19 supply the worker callback. `src/options/view.ts:29` forwards it. The source call-site search found the service write at `src/background/controls.ts:105` and the controller's standalone fallback at `src/options/controller.ts:175`; production cannot use that fallback to write storage. Rules-only dirty/conflict checks at controller lines 50, 77, 84, 163 and 199 retain edits through enabled-only updates and require reload for real rule conflicts. `tests/unit/options-controller.test.ts:309` and `tests/browser/rule-editor.spec.ts:247` exercise that wiring and pause preservation.
- **Narrow validated messaging:** `src/controls/protocol.ts:23` validates exact keys, bounded identifiers and revisions; rule parsing delegates to the existing schema/compilers at line 55. `src/browser/control-messages.ts:7` checks extension ID, exact page URL and top-level frame; line 10 returns literal true while using sendResponse. `tests/integration/control-messages.test.ts:5` verifies forbidden senders and exact listener behavior. The client sends once without retry at `src/controls/client.ts:5`.
- **Cleanup:** `tests/browser/external-app-cleanup.ts:20` puts helper disposal into the existing independent attempts; `tests/browser/external-app-links.spec.ts:215` passes the helper into that path. `tests/unit/external-app-cleanup.test.ts:7` includes throwing-helper coverage, checks all attempts and profile deletion, and preserves the original test failure.

## Issues

### Critical

None.

### Important

None.

### Minor

None requiring a code change. The file-plan allocation variance above was explicitly accepted by the controller.

## Evidence and review boundaries

- Read the supplied full-context review package, not a regenerated git diff. The first tool response truncated its middle; recovered only omitted ranges from that same package. No changed source file was independently reread.
- Focused checks outside the diff were limited to named integration risks: independent queue behavior (`src/background/operation-queue.ts:1`), repository/storage event semantics and schema immutability (`src/browser/config-storage.ts:6`, `src/config/schema.ts:18`), production writer call sites, and tracker/consumer removal credit propagation. No broad codebase audit or test rerun.
- Inspected `evidence/task-1/task1-full-test-final.log`: **1,090 tests / 33 files passed**, no warnings.
- Inspected `evidence/task-1/task1-browser-final.log`: **22 tests passed**, including rule-editor behavior, enabled-only pause/draft preservation, failed-worker-write retry, foundation checks, three-duplicate closure, warm external navigation, and stopped-worker external navigation. No warnings in the final log.
- Inspected final build/package logs: Chrome 120 build and package checks passed. Package hashes are retained in `evidence/task-1/package-sha256.json`.
- Located and inspected RED evidence for missing initial modules, draft retention, cleanup, stale queued resume, resume preflight currency/readiness, removal credits, pause/rules ordering, and startup invalidation. These are substantive failing assertions or expected missing-module failures.
- Final typecheck log exists and is empty, consistent with a clean `tsc --noEmit`; the report records exit 0, but that empty log does not independently encode the exit status. No redundant typecheck rerun was performed.
- Native result JSON and six editor screenshots exist under `evidence/task-1/browser-results/`. Screenshot visual styling is unchanged by Task 1; no new visual review claim is made.
- Full feature browser verification, session registry/audio safety, runtime-status notification bridging, popup UI and the eight-file package contract remain later-task/final gates. This approval does not certify them.
- Checkout source, index, HEAD and branch state were not changed; only this requested review artifact was authored.

## Assessment

**Task quality: Approved.**

The implementation is compact and appropriately separated: the service owns persistence and admission, the protocol is neutral, and production options is a client. Race tests and affected native evidence support the required pause, startup and removal-credit invariants without coupling control commands to native settlement.
