# Recoverable Closure and Stale-Work Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable duplicate closure only after verified placement and independent fresh evidence, with conservative restart abandonment and a durable uncertainty barrier.

**Architecture:** Keep the coordinator's sole queue and Task005 phase guards. A queue-free replacement executor wraps placement and sequential closure with a small session journal; startup recovery abandons settled work and quarantines unresolved native calls. A narrow removal-aware tracker lease accepts our own expected removal feedback without reviving stale work.

**Tech Stack:** TypeScript, Node24, Chrome120+ Manifest V3, existing Vitest/Playwright/esbuild; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-recoverable-closure-design.md`.

## Global Constraints

- Preserve Node24, Chrome120+, schemaVersion3, permissions, dependencies and the default-disabled configuration.
- Implement only Task 006 and pause before Task 007. No rule editor, popup, broader audible/form protections, retries, rollback, automatic enablement or personal Chrome actions.
- Configured grouping overrides inherited location; preserve the winning ID/history and existing pure matching/planning contracts.
- One coordinator queue; no queue nesting and no timeout releases while native calls can still mutate.
- Recovery never resumes old placement or closure. Pending/invalid/unreadable session state quarantines all automatic mutations.
- Raw native URLs, identity keys, URL hashes, tracker Symbols/generations, config copies and group titles must never enter persisted journal or diagnostics.
- One journal key `chromeReHomeReplacementJournal`; version1; at most100 participants,99 removals,128 code units/string,65536 JSON characters and105 mutation sequence. Selections above the participant bound skip all mutation, not a truncated close.
- Native focus/active/collapse changes remain accepted; never explicitly change them. Missing passive duplicate documents prevent closure only.
- Existing `enabled:true` settings activate closure on this build; README must warn to pause before reload. Manual disposable-profile Chrome trial remains required.
- All shell commands start `rtk`; no new installs. Controller owns independent reviews and final durable completion; implementer spawns no subagents.

## Review Focus

1. Old worker dies with native operation outstanding: new worker must not mutate, even after a delayed native effect/event or configuration toggle.
2. Own removal event arrives before resolution, after resolution, or during the next removal: accept only a single explicitly issued ID; unrelated/navigation/replacement events remain fatal.
3. Relaxed-equivalent URLs or same-URL reloads change passive documents: strict href/document/view evidence must prevent closing stale tabs without blocking valid configured placement on unavailable passive frames.
4. Journal storage rejects before/after native settlement or clear: retain the sole queue until native settlement, retain original native cause, and block later mutation after ambiguous persistence.
5. Already-enabled upgrade, absent/future/malformed session data or disabled configuration: truthful UI/docs, default-disabled behavior, strict preserved bad data and deterministic initialization ordering.

---

### Task 1: Deliver journaled replacement closure and conservative restart recovery

One cohesive implementation/review unit. Closure, journal transitions, startup admission and event feedback must ship and be reviewed together; a successful standalone remove helper is not completion.

**Files** (root `<repository>`):

- Create `src/execution/journal.ts` (strict record/types, ordered durable transitions, blocked state), `src/execution/replacement.ts` (independent closure evidence, placement orchestration, sequential removal), `src/browser/journal-storage.ts` (session adapter), `src/background/recovery.ts` (read-only startup reconciliation).
- Modify `src/execution/placement.ts` (optional checkpoint hooks and final immutable snapshot receipt), `src/browser/placement.ts` (single-ID remove port), `src/background/navigation.ts` (scoped removal lease), `src/background/placement.ts` (production replacement consumer), `src/background/coordinator.ts` (shared initialization/recovery admission), `src/background/index.ts` (one journal/recovery/queue wiring), `src/options/view.ts` (truthful status).
- New tests `tests/unit/journal.test.ts`, `tests/unit/replacement-execution.test.ts`, `tests/integration/journal-storage.test.ts`, `tests/integration/recovery.test.ts`, `tests/browser/replacement-recovery.spec.ts`; test-only `tests/browser/replacement-recovery-fixture.ts` and shared fixture helpers if needed.
- Extend `tests/unit/placement.test.ts`, `tests/unit/navigation.test.ts`, `tests/unit/operation-queue.test.ts`, `tests/unit/options-view.test.ts`, `tests/integration/placement-adapter.test.ts`, `tests/integration/placement-consumer.test.ts`, `tests/integration/coordinator.test.ts`, `tests/integration/register-events.test.ts`, `tests/browser/replacement-placement.spec.ts`, `tests/browser/foundation.spec.ts`. Use `tests/fixtures/placement.ts` as existing pure fixture source.
- Update `docs/tasks/todo/006-recoverable-closure-and-stale-work-protection.md`, `docs/architecture.md`, `README.md`, the canonical design/plan and a completion report under `docs/reviews/`. Preserve historical005 evidence; label its retain-all behavior as the previous placement-only phase rather than rewriting past claims.

**Interfaces:**

Consume existing `ReplacementPlan`, `PlacementPort`, `PlacementGuard`, `PlacementResult`, `MutationPhase`, `validDocument`, `coherentSnapshot`, config `getCurrent()`, tracker view/event methods and `createOperationQueue()`.

Produce exactly the structural types and signatures in the design's Ownership and interfaces and Journal sections. In particular:

- `createReplacementJournal({storage,createOperationId})`; factory injected from background, never call Chrome or import background in execution.
- `createReplacementExecutor({port,journal}).execute(plan,guard)`; `ReplacementPort=PlacementPort&{removeTab(id):Promise<void>}`.
- `createPlacementExecutor({port,checkpoints?})` hooks before native mutation, after both resolve/reject settlement and after verification; success includes detached frozen `snapshot`.
- `tracker.createRemovalLease(view,allowedDuplicateIds)` returns `isCurrent`, `expectRemoval`, `dispose`. Consumer composes config/event/lease guards and disposes in `finally`.
- `createRecovery({journal,port})` exposes `initialize():Promise<void>`, `isReady():boolean`; production coordinator initialization queues recovery before consume admission.
- `createChromeJournalStorage(api:Pick<typeof chrome,'storage'>):JournalStorage`; read/get, write/set, clear/remove only the exact session key.

- [ ] **Step1: Add failing journal and ordering tests.** Use a storage fake preserving values across fresh journal/controller instances and recording call order. Add `strict v1 rejects malformed/future/oversized records without overwrite` covering own keys/dense arrays, invalid counters/IDs/duplicates/context, winner missing document, removed prefix and pending/terminal consistency. Add `journal contains no URL identity generation title or error payload` with secret-bearing URL/rules and assert exact allowed record fields, not just an accidentally clean string. Add `prepared pending settled verified terminal clear are ordered` and rejection cases at each write/read/clear; assert isBlocked and zero later mutation. Add `100 participants accepted and101 skipped before mutation`, `multiple move phases get distinct ordinals`, and round-trip deep immutability.

- [ ] **Step2: Run journal tests RED.** Run cached Node24 with `rtk proxy <node> node_modules/vitest/vitest.mjs run tests/unit/journal.test.ts tests/integration/journal-storage.test.ts`. Expected missing new module/interface or failed behavior assertion; fix test plumbing errors before counting RED. Record actual output.

- [ ] **Step3: Implement journal types/parser/store and session adapter.** Use the exact schema/bounds/transitions from the design, including strict empty-versus-invalid distinction. Single awaited writes, no rewrite after failed persistence, no access-level change, no config migration. `finish` requires pending null. Storage failure blocks the live journal and retains original unknown durable contents. `begin` must be fail-closed if an active record exists; normal recovery clears known settled records first.

- [ ] **Step4: Run journal tests GREEN.** Repeat Step2; expected all pass and precise narrow session adapter forwarding assertions. Do not proceed on a parser test failure.

- [ ] **Step5: Add failing integrated execution, lease and recovery tests.** Use deferred promises and explicit event delivery rather than sleeps. Required cases/assertions:

  | Test name | Assertions |
  |---|---|
  | `closure waits for placed checkpoint and complete independent evidence` | No remove before final placement verification and persisted placed; valid no-op placement closes; unavailable/error/nonactive/subframe passive document yields successful configured placement and zero remove; winner/anchor failure still prevents placement. |
  | `all remaining participants revalidate before each remove` | Table winner and every passive duplicate: URL mismatch including relaxed equivalent; same URL/new document; pendingUrl present even undefined; pin/context/window/group/index/shared change; missing participant; navigation while any document/snapshot/journal await held. Zero further removes. |
  | `closure preserves receipt minus verified removals` | Multiple duplicates across windows/groups close in selector order; remaining original IDs/order/membership/history survive; empty duplicate group/window may disappear; unrelated survivor/group metadata disappearance cannot be accepted. |
  | `every native call is durably pending before fresh preflight` | Include ungroup/cross-window move/group/title/reorder/remove. Pause pending write, mutate participant/config/view, then resolve: zero native call. Current operation abandons safely only if no native invocation occurred. |
  | `native rejection and bookkeeping failure preserve original cause` | Exact rejected native error identity returned, uncertain effect/removal reported, no retry; afterSettlement attempted on rejection; if it fails, journal blocks, native cause retained. |
  | `remove rejection or fulfilled-but-present stops survivors` | First duplicate rejection (effect may have happened) or resolve with tab still present => no second removal; already verified IDs reported honestly. |
  | `sole queue waits for pending native promise` | Advance fake timers beyond any hypothetical timeout; second job cannot mutate. Resolve/reject native promise, journal settled checkpoint runs before next job; blocked journal denies it if persistence failed. |
  | `expected removal credits cannot revive a stale lease` | onRemoved before promise resolution, after resolution and during next remove works once; repeated/unexpected removal, unrelated beforeNavigate, competing winner, both replacement APIs invalidate; later expected event cannot revive. Disposed leases and unallowed/winner IDs reject. |
  | `restart never replays old closure` | Reconstruct tracker/coordinator/queue after each prepared/pending/settled/verified/placed/removed/terminal checkpoint. Pending record blocks all operations; settled record reads live state, abandons/clears, fresh eligible work can run. Neither matching doc IDs nor absent target permits old replay. |
  | `late old-worker native effect stays quarantined` | Keep old native deferred across reconstruction; new worker attempts work and does nothing; settle old effect and deliver late events without old journal callbacks, new worker still does nothing and pending record stays unchanged. |
  | `recovery and configuration initialize before consume admission` | Listeners register synchronously; pending config/recovery reads still allow synchronous invalidation; admitted events await both. Invalid/disabled/future config never mutates; recovery still examines session record. Pending config reload revokes lease immediately. |
  | `bad session records stay intact across restarts and config toggles` | Missing=>ready; future/malformed/unreadable=>blocked, zero overwrite/remove/mutate; pending record cannot be unblocked by matching snapshots, time, new events, disabled->enabled or worker restart. |
  | `truthful enabled disabled unavailable options copy` | Exact design messages; enabled mentions closure and possible interrupted-operation pause; no obsolete never-closed claim and no new control. |

- [ ] **Step6: Run focused execution/integration tests RED.** Run `rtk proxy <node> node_modules/vitest/vitest.mjs run tests/unit/replacement-execution.test.ts tests/unit/navigation.test.ts tests/unit/placement.test.ts tests/integration/recovery.test.ts tests/integration/placement-consumer.test.ts tests/integration/coordinator.test.ts tests/integration/register-events.test.ts tests/unit/options-view.test.ts`. Record real failures from new intended behavior; retain005 invariant cases.

- [ ] **Step7: Implement placement checkpoints, independent closure and removal lease.** Follow design order precisely. Avoid broad executor refactoring: preserve005's observe/mutate/final-index guards and add receipt/checkpoints. Store pending before a fresh full preflight; wrap actual native invocation so settled checkpoint runs for rejection too, then preserve original cause. Capture all passive documents independently before placement without making unavailable overridden frames a placement requirement. New closure validator starts from final verified receipt and only subtracts verified removals; no fresh baseline rebasing. Arm one allowed removal immediately before native call, maintain credits through operation, dispose in finally. No journal storage await between final validated state and remove call.

- [ ] **Step8: Implement recovery wiring and truthful docs/UI.** Share one journal, adapter, recovery and queue. Register listeners before initialize. Initialize config plus recovery queue job, then admit consumers only when both ready and journal not blocked. Ensure guard includes current admission as well as original config/event/view. Add exact startup table and residual-race/privacy rationale to Task006 before enabling production remove. README leads upgrade pause warning and explains pending quarantine,100 participant bound, no unsaved-form protection, no retry/recovery replay and safe full-browser-restart recommendation. Preserve schema3 backup/enable/pause/restore commands and manual disposable-profile requirement.

- [ ] **Step9: Run focused tests GREEN.** Repeat Step6 and Step2. Expected every test pass including old005 guards; no weakened stale-view assertion or removal of meaningful tests. Adapt old consumer expectations only to additional independent closure document reads and new enabled semantics.

- [ ] **Step10: Add browser tests against production dist and isolated phase fixture.** Build current production and add these exact families:

  1. Update `replacement-placement.spec.ts` enabled duplicate tests to await actual older ID disappearance; verify winning ID and back-history, final window/group, expected post-removal index, unrelated IDs/order, source/duplicate-empty window/group behavior. Same-window before/after, grouped/ungrouped cross-window and configured override remain. Add3 duplicates across2 windows and2 groups, one passive with no worker navigation provenance, and assert all3 old IDs close after winner placement. Grouping-only and disabled navigation still retain all IDs. Record Chromium/native active/focus/collapse evidence.
  2. In `replacement-recovery.spec.ts`, use unchanged `dist`, disposable profiles, local HTTP real links and the existing foundation CDP `ServiceWorker.enable/stopWorker` pattern. With config enabled and no active operation, seed a valid public session record from real tab/document IDs, stop the worker, navigate an actual link to wake it. Parameterize pending kinds ungroup/move/group/title/remove, settled placed, settled removed, future and malformed. Pending/future/malformed records survive byte-for-byte and no automatic mutation occurs during a bounded1-second observation while two real eligible navigations occur. For settled records, wait for key removal, assert old duplicates remained, then use a fresh distinct duplicate scenario and prove new closure works. Verify fresh worker realm/observed stop-running transition. Label these **seeded production recovery checks**, not native-interruption proof.
  3. Temporary fixture bundles actual replacement/journal/recovery/adapter and existing real navigation coordinator with test-only gates injected through structural ports/storage wrappers. Stop via CDP after prepared, each placement mutation pending/settled/verified, placed, removal pending/settled/verified and terminal-before-clear. Gate immediately after durable write resolves to make phase deterministic; create a new actual worker on restart and inspect preserved session data/live tabs. A pending phase must never remove any additional survivor. A settled phase must abandon without replay. For actual outstanding-call testing, distinguish native call already issued from merely blocked before invocation; if Chrome cannot reliably be stopped inside a real in-flight API call, unit deferred test is authoritative and browser report states that gap. Never fabricate a successful interruption claim.
  4. Same fixture delays native port/document/journal promises to navigate a passive duplicate, reload it to identical URL, disable config, remove a different participant or commit a competing winner at each closure boundary. Trigger actual browser events, then release; assert no subsequent close. Tests for rejection use controlled wrapper faults and are labeled simulated. Fixture-only globals/control endpoints never appear in production source or dist.

- [ ] **Step11: Verify all gates and independently review.** Run under cached Node24: typecheck, full Vitest, build, package check, full Playwright. Exact commands below. All must pass; package remains existing five-file extension with no endpoint/fixture/no added permission or dependency. Inspect evidence for winner/history/remaining-ID correctness and actual worker-stop transitions. Controller supplies independent task review and whole-feature review; address findings, rerun affected checks and full final gates when needed.

- [ ] **Step12: Commit scoped deliverable and report, then stop before007.** Record actual RED/GREEN evidence, full test totals, production versus fixture browser evidence, recovery limitations and remaining manual Chrome matrix. Give exact dist path and disposable-profile backup/disable-before-reload/enable/pause/restore commands. Do not claim manual trial complete. Controller updates durable review/completion and plan checkboxes; no push/merge/publication unless separately authorized.

## Execution commands and evidence

Current cached Node24 is `node`. Use it in place of `<node>`; no package installation needed. CWD is repository root. Baseline at9db2b00 has687 passing tests, clean before this work.

```sh
rtk proxy <node> node_modules/typescript/bin/tsc --noEmit
rtk proxy <node> node_modules/vitest/vitest.mjs run
rtk proxy <node> scripts/build.mjs
rtk proxy <node> scripts/check-package.mjs
rtk proxy env -u FORCE_COLOR -u NO_COLOR PLAYWRIGHT_BROWSERS_PATH=$TEMP_DIR/chromerehome-playwright <node> node_modules/@playwright/test/cli.js test
```

Browser process/localhost launch may require scoped sandbox escalation already used by this project. Do not install another runtime or touch personal Chrome. Existing TS7 boundary scanner can stall on regex character classes with hash syntax; prefer plain includes checks when applicable. Commit with `rtk git add` explicit scoped paths and `rtk git commit`; do not force-add ignored scratch reports.

## Design self-review

Spec coverage: all006 acceptance points map to Steps1/5/7/8/10. All five Review Focus modes have named tests in Step5 and appropriate native/browser checks in Step10. Independent passive closure evidence, no Symbol/URL persistence, late native effects, last-window removal, delayed own events and already-enabled upgrade are explicit. No unrelated007/008 work or additional dependency is included. One review unit is intentional because shipping any one of closure, journal or recovery without the others would violate the outcome.
