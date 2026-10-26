# Navigation Eligibility and Winner Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete backlog004 with conservative navigation eligibility, stable runtime tokens and pure deterministic winner/anchor selection; pause before005.

**Architecture:** The synchronous navigation tracker owns provenance, current observations and a worker-local epoch/revision. Pure planning consumes detached structural views and authoritative tab snapshots through the existing duplicate-identity interface. The coordinator keeps startup/configuration queue guards and a no-op production consumer.

**Tech Stack:** Existing TypeScript/native URL/Chrome APIs, Vitest, Playwright, esbuild; Node24, Chrome120+.

**Spec:** docs/superpowers/specs/2026-10-26-navigation-eligibility-design.md

## Global Constraints

- Scope is only 004. Production `consume` remains the existing no-op.
- Selection neither performs nor authorizes movement, grouping, closure, UI changes, persistence, dependencies or permissions.
- Subframes do not invalidate main-frame work. Retain actual URL bytes; identity normalization stays in `rules/duplicates.ts`.
- Reject `reload` even with an address-bar qualifier, and reject `start_page` rather than guessing that an external application launched it.
- History/fragment updates require trusted active document provenance within this worker, changed native URL and no pending full navigation.
- Never persist these symbols/counters or compare them across worker lifetimes.
- Candidate freshness uses native `URL.href` equality; duplicate-rule equivalence alone is insufficient freshness proof.
- Exclude pinned, pending, blocked, malformed and cross-context candidate tabs; duplicate identity comes only from the supplied existing engine.
- No polling, worker keep-alive, permanent event history, or startup clock heuristics. Target Node24 and Chrome120+.
- Preserve Task003 modules and backlog005–010. No config/schema/storage/dependency/permission changes.

## Review Focus

- Reload plus from_address_bar and restored-page script events must never bootstrap winners; test commit→SPA/client chains and cold-worker negatives.
- A delayed callback from an old document or a prerender/replacement can revoke work but must not transfer/adopt provenance; test both replacement event orders and same-document mismatches.
- A newer equivalent callback arriving during initialization must supersede an older queued candidate, independent of browser timestamp; test deferred config/queue and complete views.
- A previously unobserved anchor navigating during snapshot read must revoke the captured view; test revision before/after plus strict actual URL mismatch under relaxed identity.
- Snapshot and view permutations must preserve winner/anchor decisions and readonly ownership; test duplicate/conflicting IDs, pinned/context/pending changes, ties and frozen inputs.

---

### Task 1: Build and verify navigation eligibility and candidate selection (backlog004)

**Files:**
- Modify: `src/background/navigation.ts`, `src/background/register-events.ts`, `src/background/coordinator.ts` (only required integration).
- Create: `src/planning/candidates.ts`, `tests/unit/candidates.test.ts`, `tests/browser/navigation.spec.ts`; a small browser-only helper file under tests is permitted if fixture code merits separation.
- Modify tests: `tests/unit/navigation.test.ts`, `tests/integration/coordinator.test.ts`, `tests/integration/register-events.test.ts`, existing browser smoke assertions only if the new listener contract needs them.
- Modify docs: `docs/tasks/todo/004-navigation-eligibility-and-winner-selection.md`, `docs/architecture.md`, `README.md`, `docs/tasks/README.md`.
- Keep production index consume no-op; do not touch prior pure engines/config/Task003 production or implement005–010. No snapshot adapter change expected; report a genuine contract gap before changing it.

**Interfaces:**
- The spec Small interfaces and state section defines exact structural types `NavigationToken`, `CandidateNavigation`, `NavigationView`, `CandidateTab`, `DuplicateIdentity`, `CandidateSelection`, and `selectCandidates(trigger,tabs,view,identity):CandidateSelection`; planning owns them and imports no background/browser/Chrome types.
- `Navigation` retains kind/browserTimeStamp and extends CandidateNavigation. `NavigationInput` gains optional structural transitionType/transitionQualifiers/documentLifecycle/frameType fields for fail-closed malformed input handling. Existing observe/invalidate/forget/isCurrent remain; add view/isViewCurrent and replace methods defined by spec. Coordinator forwards replacement to tracker and keeps synchronous observe before any await.
- Both native replacement APIs route to `replace(addedTabId,removedTabId)`. onBeforeNavigate preserves only redirect-source provenance and blocks candidates. No error-event unblocking or synthetic re-emission is required.
- Existing `compileDuplicateRules` ready result satisfies DuplicateIdentity structurally; use it in real policy tests. Existing snapshot reader supplies actual URLs, pendingUrl and incognito. Future005 must capture tracker view BEFORE browser read and verify revision after, then revalidate before mutations.

- [ ] **Step 1: Add tracker policy tests and run RED.** Pin cold active typed/link commits eligible; reload+from_address_bar/start_page/missing metadata/nonactive lifecycles invalidating without eligibility; server redirect final URL; trusted vs cold/restored client redirects; ordinary back/forward vs core reload; trusted same-document URL changes vs no-op/mismatched-document/pending/cold updates; subframes do not revoke; malformed/nonHTTP main-frame revokes; duplicate fingerprint no-op; two tracker epochs with matching numeric generation never validate each other. Extend existing fixture builders with real metadata while preserving relevant foundation races. Record expected failures before implementation, then implement minimal tracker/types and run GREEN.
- [ ] **Step 2: Add pure selector tests and run RED.** Use actual duplicate compiler, not another matcher. Latest observedSequence wins for equivalent current live tabs despite lower browser timestamp; equal-sequence tie chooses lowest tab ID. The supplied trigger must exactly match current token/url/document/sequence and live native URL. Relaxed identity must not mask stale URL changes. PendingUrl property excludes even equivalent or empty destinations. Exclude pinned/blocked/wrong-context/inconsistent current events; reject conflicting/duplicate snapshot/navigation IDs. Anchor order is same-window, then window/index/tab ID, invariant under input permutations. Return frozen copies, no mutation of frozen input. Capture view before simulated read; anchor invalidation revokes it. Implement `selectCandidates` and run GREEN.
- [ ] **Step 3: Add coordinator/registry races and run RED.** Registry preserves metadata for committed/history/fragment and registers both replacement APIs synchronously before initialization. Eligibility observed during deferred configuration survives if still current; beforeNavigate/reload/replace revokes synchronously. A later matching navigation supersedes the earlier one using a complete view, without timestamp ordering. Test both replacement callback orders, no rank/provenance transfer, config revision invalidation, disabled/error states and redacted handler errors. Implement narrow integration and run GREEN; preserve no-op production consumer.
- [ ] **Step 4: Add real browser event evidence.** Disposable extension/profile uses a temporary bundle of actual tracker/registry/selector and local fixture server for links/server/client redirects/history/hash/back/forward/reload. Record actual transition/lifecycle/document metadata and observed policy outcomes in test-only memory. Assert real navigation/redirect/reload/same-document/back-forward behavior, latest winner, pending snapshot where observable and worker restart provenance loss. Attempt supported restore/reopen, external launch/omnibox and prerender controls; if inaccessible, document exact manual check/capability gap. No fabricated event is browser evidence, no production endpoint/keep-alive, no changes to user's Chrome settings. Deterministic races remain gated unit tests. Record Chromium version and limits.
- [ ] **Step 5: Document and verify.** Record controller policy/false negatives in Task004 and architecture, explain runtime epoch/revision integration and no closure authority. Add clear Chrome trial roadmap to README/backlog: loadstatus now,005 placement,006 closure,007 settings/preview,008 controls and009 full browser gate. Run Node24 typecheck, covering tests, full Vitest once, build, package validation and all Playwright tests. Inspect scope/no-op boundary. Commit scoped work and self-review; report full RED/GREEN evidence, commands, counts and limits. Controller owns reviews/completion; do not mark other tasks complete or begin005.

**Environment:** All shell commands start `rtk`; raw commands via `rtk proxy`. Cached Node24 `node`; use it with `node_modules/vitest/vitest.mjs run`, `node_modules/typescript/bin/tsc --noEmit`, `scripts/build.mjs`, `scripts/check-package.mjs`. Cached browser `$TEMP_DIR/chromerehome-playwright`; launch command `rtk proxy env -u FORCE_COLOR -u NO_COLOR PLAYWRIGHT_BROWSERS_PATH=$TEMP_DIR/chromerehome-playwright <node> node_modules/@playwright/test/cli.js test`. Browser/local fixture server may need scoped escalation because default macOS sandbox blocks launch/bind. No installs/network needed. Node24 baseline560 tests + typecheck clean on historical-revision; previous17 Chromium cases green. Pinned TS7 scanner can stall on regex character classes containing hash syntax; use includes alternatives. Request own narrow repo write permission if required.
