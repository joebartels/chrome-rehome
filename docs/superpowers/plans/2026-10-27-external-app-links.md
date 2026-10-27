# External-app navigation compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make native external-app HTTP(S) opens group and safely replace duplicates, including after worker suspension.

**Architecture:** Add `start_page` to the existing admitted transitions. Preserve every Task 006 guard and execute through the unchanged coordinator, planner and replacement executor. Native regression uses isolated macOS LaunchServices and actual production `dist`.

**Tech Stack:** TypeScript, Chrome MV3, Node 24.x, Vitest, Playwright 1.64.1, existing esbuild.

**Spec:** `docs/superpowers/specs/2026-10-27-external-app-links-design.md`. Native metadata was confirmed before this plan was adopted; see `docs/reviews/2026-10-27-external-app-links-metadata.md`.

## Global Constraints

- Node 24.x; minimum Chrome 120; existing TypeScript/MV3 toolchain and dependencies only.
- No production permissions, content scripts, worker keepalive, timers, schema, storage, UI or Task 007 features.
- Keep the sole queue, recovery readiness, configuration revision, event generation, view revision, document validation, pending URL exclusion, pin/context checks, removal leases, journal durability and per-closure stale checks unchanged.
- Core `reload` remains rejected, including address-bar and forward/back qualifiers, and cannot establish same-document/client-redirect provenance.
- Disabled/unavailable configuration and blocked recovery produce no mutations. No fallback that groups but silently omits required safe duplicate closure.
- All shell commands start with `rtk`; personal Chrome/profile and default-browser settings remain untouched.

## Review Focus

- An external open wakes a stopped worker: its valid committed event qualifies and passes initialization/recovery before mutations.
- Redirect schemes differ: only final committed identity qualifies; HTTP/HTTPS normalization is unchanged.
- Restored/reloaded pages run SPA or redirect scripts: reload rejection and provenance gates still suppress them.
- Configuration/recovery/stale state changes after admission: no grouping or closure escapes existing guards.
- Configured startup URLs share `start_page`: admission is intentional and documented; no unsupported origin heuristic is introduced.

---

### Task 1: Admit observed external transitions and prove native grouping/closure

**Files:**
- Modify: `src/background/navigation.ts`, `tests/unit/navigation.test.ts`, `tests/integration/coordinator.test.ts`, `tests/integration/placement-consumer.test.ts`.
- Create: `tests/browser/external-app-links.spec.ts`, `tests/browser/external-app-launch.ts`.
- Modify policy text: `docs/superpowers/specs/2026-10-26-navigation-eligibility-design.md`, `docs/tasks/todo/004-navigation-eligibility-and-winner-selection.md`, `README.md`, `docs/architecture.md`, and a new `docs/tasks/todo/006a-external-app-link-compatibility.md` (retain historical results; mark superseded policy).
- Evidence source: this directory's `native-events.json` and `findings.md`; sanitized relevant metadata can be retained in test artifacts/docs, never runtime code.

**Interfaces:**
- Existing unchanged: `createNavigationTracker().observe(input: NavigationInput): Navigation | undefined`; `createCoordinator().handle(input: NavigationInput): Promise<void>`; `createPlacementConsumer(...)` and `ReplacementPort`.
- Test helper, new: `createExternalAppLauncher(executablePath: string): Promise<{ executablePath: string; open(url: string): Promise<void>; dispose(): Promise<void> }>` in `tests/browser/external-app-launch.ts`. Clone the cached executable's enclosing macOS `.app` to an `mkdtemp` root, assign a unique CFBundleIdentifier using PlistBuddy, and expose full-path `open -a`; `dispose` removes only the helper-owned clone after caller closes context. Caller uses its own random disposable profile. Fail explicitly on an invalid source app; never fall back to `/Applications/Google Chrome.app` or a default URL handler. Reject non-HTTP(S) URLs. Shell subprocess arguments are arrays, not interpolated command strings.

- [x] **Step 1: Pin failing policy assertions.** In `navigation.test.ts`, add `start_page` to the cold-admission table and remove it from the unconditional rejection table. Add tests `start_page redirects preserve final identity and provenance gates`, `cold start_page history cannot bootstrap provenance`, and `reload after start_page still revokes provenance`. Assert cold valid HTTP/HTTPS committed input returns a current event, server_redirect returns final URL, cold client_redirect returns undefined, trusted commit then client_redirect qualifies, and history/fragment after reload remains undefined. Assert invalid document/lifecycle/qualifier metadata still invalidates without returning an event.
- [x] **Step 2: Verify red before the production change.** Run `rtk proxy <node> node_modules/vitest/vitest.mjs run tests/unit/navigation.test.ts`; expect new valid `start_page` assertions to fail. Build the unchanged baseline, implement the test-only native launcher and first warm HTTPS production case from Step 5, then run that focused native test against baseline `dist`; require failure showing the externally opened tab remains ungrouped and the older duplicate stays open. Preserve RED evidence and exact native metadata. Add the remaining native matrix in Step 5.
- [x] **Step 3: Make the minimal policy change.** Add `start_page` to `admitted` in `src/background/navigation.ts`; remove its redundant separate entry in `known` if appropriate. Do not change observe's guard/provenance/control flow or any execution API.
- [x] **Step 4: Pin guard integration.** Parameterize existing coordinator cold-initialization/recovery-readiness, disabled-config and stale revocation scenarios with `transitionType: 'start_page'`. In placement-consumer integration, use matching live frames for both tabs and assert grouping plus exactly the old duplicate removal; with disabled config/recovery blocked/stale snapshot gate assert no mutation. Reuse existing fixture gates and actual assertions rather than introducing another event coordinator.
- [x] **Step 5: Add the native regression.** Build the helper and `external-app-links.spec.ts`. On macOS with bundled Chromium, launch headed using clone executable and fresh explicit profile; load untouched `dist`. Write the existing local rule/enabled configuration from the options execution context; the options page has no editing UI. Seed older same-identity tab while disabled; enable then call helper `open(url)`. Assert a distinct new tab survives, belongs to expected named group and old tab ID disappears. Run warm HTTP, warm HTTPS, HTTP→HTTPS final identity and stopped-worker HTTPS. For stopped case, confirm native worker status `stopped`, invoke OS open before any worker evaluation, confirm worker restarts, assert same grouping/closure outcome. Attach browser version, launch method, before/after IDs/groups and worker status. Non-macOS gets explicit skip; no fake event fallback. Run a real disabled native open control and assert the two tabs remain ungrouped/unclosed.
- [x] **Step 6: Verify focused and full gates.** Run `rtk proxy <node> node_modules/vitest/vitest.mjs run tests/unit/navigation.test.ts tests/integration/coordinator.test.ts tests/integration/placement-consumer.test.ts`, then `rtk proxy <node> node_modules/typescript/bin/tsc --noEmit`, `rtk proxy <node> node_modules/vitest/vitest.mjs run`, `rtk proxy <node> scripts/build.mjs`, `rtk proxy <node> scripts/check-package.mjs`, and the full existing Playwright command with the existing cached browser and Node 24 environment. Require native external cases to execute on this macOS host; record true pass/skip totals and any capability gaps. No content scripts or test fixture enters `dist`.
- [x] **Step 7: Update the policy/evidence record.** State that `start_page` now qualifies including configured startup pages, core reload still does not, origin/user intent is not proven, and native restore commits were not captured. Record actual commands, versions and native production outcomes. Preserve Task 006 invariants and pause before Task 007.
- [x] **Step 8: Review and commit.** The controller dispatches one independent task reviewer for spec compliance and quality, then one whole-feature reviewer. Resolve findings through scoped fixes/re-reviews and rerun affected gates. Commit scoped files with `fix: process external-app start-page navigation`; controller handles integration and user handoff.

Self-review: one cohesive admission correction; interfaces unchanged outside test helper. Every review-focus condition is assigned above. Native trace is evidence for metadata, and production OS-open tests are required separately for grouping/closure. No runtime heuristic, permission, dependency or broad refactor is implied.

## Runtime and ownership

Use cached Node24 `node` for `<node>`; do not use the default host Node26 or install dependencies. Browser command: `rtk proxy env -u FORCE_COLOR -u NO_COLOR PLAYWRIGHT_BROWSERS_PATH=$TEMP_DIR/chromerehome-playwright <node> node_modules/@playwright/test/cli.js test`. Browser/localhost/LaunchServices operations need scoped sandbox escalation for disposable profiles only. Use per-command `git -c commit.gpgsign=false` if sandbox GPG signing fails; no persistent config changes.

Controller owns plan checkboxes, progress ledger, durable completion/review artifacts, backlog completion and final handoff. Implementer may update current policy docs/README and006a decisions, but does not mark task complete before independent reviews. No subagents/helpers/reviewers dispatched by implementer. Keep the work local and pause before007.

## Completion

Complete on 2026-10-27 after metadata confirmation, delegated implementation, independent task and whole-feature reviews, and one consolidated test-only cleanup/scoped review. All findings closed. Final 889 tests and typecheck/build/package/range checks pass; full 99 browser cases passed, then all five affected native cases passed after cleanup with identical production package hashes. See [completion evidence and Chrome trial](../../reviews/2026-10-27-external-app-links-completion.md). Paused before Task 007.
