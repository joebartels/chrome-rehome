# Replacement Planning and Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make explicitly enabled production Chrome navigation place the real winning tab in its resolved destination while retaining every original tab.

**Architecture:** Keep matching and final destination decisions pure. The existing coordinator owns the only queue; a guarded executor revalidates repository revision, navigation/view and native participant state around every await. Reuse003's pure resolver/native grouping methods without calling its queued service.

**Tech Stack:** TypeScript, Node24, Chrome120+ Manifest V3, existing Vitest/Playwright/esbuild; no new dependencies.

**Spec:** docs/superpowers/specs/2026-10-26-replacement-placement-design.md

## Global Constraints

- Node24; Chrome120+; existing schemaVersion3 and permissions. Default configuration remains disabled.
- No tab creation, closure, journal, rollback, rule editor, popup, new dependencies or permissions. No automatic enablement.
- Configured grouping overrides duplicate location and uses Task003's incoming window.
- Without a matching grouping rule, inherit004's selected duplicate anchor's window and group (including ungrouped), immediately after that anchor.
- Without either destination, leave the incoming location unchanged; grouping-only with no duplicate must work.
- Exclude pinned/pending/blocked/context-mismatched/non-normal participants and known shared source/inherited-anchor/final-configured groups.
- No explicit focus/active/highlighted/collapse changes; record native effects.
- No mutation retries, intermediate group/window detours, queue nesting or timeout release of running jobs.
- Plans are immutable, identities sensitive and unlogged; passive anchors use actual document/view evidence, never invented generations.
- Complete only005, using the user's delegated implementation and independent review; pause before006.

## Review Focus

1. Winner before anchor and Chrome's grouping rearrangement: after-anchor index remains correct in both directions and preserves all nonwinner order.
2. Passive anchor reloads to the same URL during document reads: document ID/view mismatch cancels before another mutation.
3. Config storage changes while its asynchronous reload is pending: stale enabled work stops immediately, even before a new config state publishes.
4. Lone member/source window disappears as a result of our own move: accept only our expected empty group/window removal and retain every tab.
5. Production opt-in or known shared destination changes at a boundary: real enabled navigation places; disabled/unavailable/shared work cannot mutate.

---

### Task 1: Deliver guarded production replacement placement (backlog005)

One cohesive deliverable: immutable plan, guarded execution and real enabled consumer. No completion at a test-only primitive.

**Files** (repository root `<repository>`):

- Create: `src/planning/replacement.ts` (final immutable destination/participants), `src/execution/placement.ts` (already-serialized guarded executor), `src/browser/placement.ts` (native port), `src/background/placement.ts` (selection/compilation/consumer).
- Modify: `src/planning/candidates.ts` (opt-in single candidate only), `src/browser/snapshots.ts` (optional shared metadata), `src/config/repository.ts` (current published revision), `src/background/coordinator.ts` (captured config lease), `src/background/index.ts` (real wiring), `src/options/view.ts` (truthful status only).
- Create tests: `tests/unit/replacement.test.ts`, `tests/unit/placement.test.ts`, `tests/integration/placement-adapter.test.ts`, `tests/integration/placement-consumer.test.ts`, `tests/browser/replacement-placement.spec.ts`.
- Extend tests: `tests/unit/candidates.test.ts`, `tests/unit/options-view.test.ts`, `tests/integration/config-storage.test.ts`, `tests/integration/coordinator.test.ts`, `tests/integration/snapshots.test.ts`, `tests/browser/foundation.spec.ts` for changed status.
- Update `docs/tasks/todo/005-replacement-planning-and-placement.md`, `README.md` and `docs/architecture.md` with trial instructions/decisions. Controller owns completion/review reports and plan checkboxes. Preserve003's public service and004 policy.

**Interfaces:**

Consume existing `selectCandidates(trigger:CandidateNavigation,tabs:readonly CandidateTab[],view:NavigationView,identity:DuplicateIdentity):CandidateSelection`; `planGroupDestination(request:GroupRequest,snapshot:DestinationSnapshot):GroupPlan`; `createSnapshotReader(api).read(scope:SnapshotScope)`; `createGroupPlacementAdapter(api):GroupPlacementPort`; tracker `view()`, `isCurrent(event)`, `isViewCurrent(view)`; rule compilers; existing coordinator queue.

Produce the exact structural types/signatures in the design's Public contracts: the opt-in `selectCandidates(...,{allowNoDuplicates:true})` overload; `planReplacement(input):ReplacementDecision`; `createPlacementExecutor({port}).execute(plan,guard):Promise<PlacementResult>`; `createPlacementAdapter(api):PlacementPort`; repository `getCurrent():ConfigSnapshot|undefined`; coordinator `ConsumeContext`; `createPlacementConsumer({tracker,port,diagnostics})`. No alternate queue API or production test endpoint.

- [ ] **Step 1: Write the failing behavior tests.** Add these named cases and observable assertions, using deferred ports for races (no sleep-based timing).

  | Case | Required assertions |
  | --- | --- |
  | `configured destination wins without duplicate detour` | Winner window10, anchor window20/group8, rule “Work”, existing group3 in window10 => final window10/group3; no call targets20/8. Group absent => new “Work” in10. |
  | `grouping-only uses the same eligible winner gate` | Opt-in produces single with no duplicates; default selector still returns no-duplicates; pinned/pending/stale/superseded input never groups. No rule and no duplicate => unchanged, zero mutations. |
  | `after-anchor index removes winner exactly once` | Same-window winner index1/anchor3 => target3; winner4/anchor1 => target2; cross-window anchor2 => target3; already adjacent => no move. Assert relative order excluding winner unchanged. |
  | `membership operations preserve final group and lone source removal` | Grouped/ungrouped inherited targets, source as last group member, configured existing/current/new destinations and source last-window tab; expected empty source structures may disappear, survivors may not. |
  | `passive anchors require document evidence` | Anchor without navigation token works with current view+active document; same URL/new document, unavailable/error/nonactive/subframe evidence, anchor disappearance/move/pin/context change abort. No fabricated generation. |
  | `every await can revoke further mutation` | Table over initial snapshot, participant document, preflight snapshot, ungroup, cross-window move, group, title, final reorder and verify; change event/view (including unrelated tab), config revision or participant state while deferred; assert no later mutation. |
  | `pending config reload revokes published enabled state` | Storage notification with unresolved read makes getCurrent undefined immediately; running guard false; invalid/newer/disabled state cannot resume; same values at newer revision still revoke old work. |
  | `shared groups cannot acquire or lose a URL` | shared source/inherited destination/configured destination => no mutation; false-to-true between awaits stops next mutation; absent shared field remains compatible. |
  | `rejection preserves cause and acknowledged effects` | Inject exact drag-error object at move and title error after created membership; returned cause is original object, phase correct, effects honest, all tabs remain, no retries/rollback/remove. Queue remains pending until native promise settles. |
  | `native port forwards narrow exact calls` | Single winner ID, explicit window/index, frame0, existing/fresh group distinction, title only; no update-active/focus/remove/create. Normal-window snapshot mapping preserves shared and pending fields. |
  | `production consumer owns no nested queue` | Enabled coordinator reaches placement, latest eligible callback wins; two jobs serialize and complete; disabled/unavailable skips; existing four-argument candidate behavior stays intact. |
  | `options status describes placement truthfully` | Enabled/disabled/unavailable exact design copy; tabs never closed; editor unavailable; no new UI control. |

  Add production-dist Playwright cases now: grouping-only; same-window directions; grouped/ungrouped cross-window; configured override; last member/window; active/background/collapsed target; disable. Use real HTTP navigation and native observed IDs/indices/groups, not synthetic consume calls. Assert every original tab remains and winner ID/history survives. Keep injected failure tests explicitly separate from browser-owned behavior.

- [ ] **Step 2: Run focused tests and observe expected failure.** Use Node24 and RTK-prefixed commands. Run `rtk npm test -- tests/unit/replacement.test.ts tests/unit/placement.test.ts tests/integration/placement-adapter.test.ts tests/integration/placement-consumer.test.ts`, then focused candidate/config/coordinator/status cases. Expected: missing new interfaces or unmet observable placement assertions, not broken fixtures. Build current dist and run new production browser cases to observe real “no placement yet” failures. Record actual RED evidence.

- [ ] **Step 3: Implement the specified interfaces and production path.** Apply the pure precedence decisions and executor operation sequence from design.md. Extend selection through one shared validated path. Expose repository current revision during stable publication, issue coordinator context inside the existing queue and combine it with tracker event/view guards. Preserve source history by moving only the winner. Use frame0 checks for the winner and used inherited anchor only (at most two per observation round); configured grouping must not fetch or depend on irrelevant duplicate documents. Other duplicate document fields remain absent for006 to revalidate; freeze copied observations. Wire index.ts and update exact options copy. Keep normal-window/shared/context/document checks in every preflight and postcondition. Use result phases/effects and original causes without logging sensitive values. Update005 decisions and manual schema3 trial/restore instructions as part of this same deliverable. Add consumer regression proving configured grouping needs only the winner frame even when an overridden duplicate frame is unavailable.

- [ ] **Step 4: Verify behavior and package, then independently review.** Run `rtk npm run typecheck`, `rtk npm test`, `rtk npm run build`, `rtk npm run check:package`, `rtk npm run test:browser` under Node24. Expected: all pass, existing five-file production package with no fixture endpoints, unchanged permission/dependency/schema inputs. Inspect real browser traces for final ordering/membership and retain-all-tabs assertions. Record native focus/active/collapse and empty-window observations. Report unsupported real drag/incognito/Chrome120/current-stable contexts as manual gaps, never synthetic success. Controller will dispatch a fresh task reviewer and whole-feature reviewer after the implementation report; implementer must not dispatch any subagent or review seat.

- [ ] **Step 5: Self-review, commit the implemented005 deliverable and report.** Commit only scoped source/tests/spec/plan/completion updates using RTK git commands. Write the ignored implementer report with revisions, exact RED/GREEN/test evidence, residual004 scripted-link behavior and remaining browser capability gaps; controller owns durable completion recording. Supply exact Load unpacked dist path, schema3 backup/enable/disable/restore console instructions and visible smoke steps proving grouping, both inheritance targets, override, history and all tabs retained. Confirm default-disabled/no closure, then pause before006. No merge, push or publication unless separately authorized.


## Environment and report discipline

All shell commands start `rtk`; use `rtk proxy` for raw execution. Cached Node24 `node`; invoke `node_modules/vitest/vitest.mjs run`, `node_modules/typescript/bin/tsc --noEmit`, `scripts/build.mjs` and `scripts/check-package.mjs` directly. Browser: `rtk proxy env -u FORCE_COLOR -u NO_COLOR PLAYWRIGHT_BROWSERS_PATH=$TEMP_DIR/chromerehome-playwright <node> node_modules/@playwright/test/cli.js test`. Process/localhost launch needs scoped escalation under this macOS sandbox. No installs are needed. All640 baseline tests and typecheck pass at historical-revision. Existing21 browser cases were green. TS7 source scanner can stall on regex character classes containing hash syntax; use includes alternatives. No subagents from implementer; controller handles both review gates. Self-review and commit before reporting. Do not force-add ignored scratch reports.
