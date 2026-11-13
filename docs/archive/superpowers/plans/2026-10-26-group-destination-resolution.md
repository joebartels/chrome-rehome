# Group Destination Resolution Implementation Plan

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../../README.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete backlog Task 003 with pure destination resolution and an opt-in grouping primitive, then pause before Task 004.

**Architecture:** Structural pure planner chooses exact titles in the request tab's own window. A queue-backed service re-observes Chrome state and returns explicit placement/skip/failure outcomes through a narrow Chrome adapter; production consumption remains a no-op.

**Tech Stack:** Existing TypeScript, native Chrome APIs, Vitest, Playwright, esbuild; Node 24, Chrome 120+.

**Spec:** docs/archive/superpowers/specs/2026-10-26-group-destination-resolution-design.md

## Global Constraints

- Use Node 24 and Chrome 120+; add no dependencies, permissions, storage or production endpoints.
- Keep all existing matching/config/background behavior unchanged.
- Resolve the configured title by exact, case-sensitive string equality in the navigating tab's explicitly supplied own window.
- Prefer that tab's current matching group; otherwise choose the matching group whose observed member has the lowest tab index, then the lowest numeric group ID.
- Normal and incognito observations never mix. Skip pinned tabs without unpinning them.
- Session IDs are observations and return values, never durable configuration or storage.
- No cross-window gathering, explicit moves or index/focus changes; no URLs, duplicate closure, recovery journal, consumer wiring, schema changes, dependencies or permissions.
- No rollback, ungrouping, cleanup, closure, title retry or blind adoption of a new tab/window follows partial failure.
- Enforce planning purity in source and bundle guards, including erased type imports and external imports.

## Review Focus

- Literal wildcard characters in group titles must use exact equality, not Chrome title query patterns; pin with planner and browser tests.
- A missing/renamed last-member group must not cause a stale success or blind reuse; test observation gates and real last-tab behavior.
- Renaming a newly created group externally must not be knowingly overwritten; test changed nonempty title before naming.
- A rejected Chrome mutation may already have affected state; test failure stage/effect and real created membership after title failure.
- Two queued requests can both initially see a missing group; gate reads to prove the second observes the first result and creates no second group.

---

### Task 1: Implement and verify the group destination primitive (backlog 003)

**Files:**
- Create: `src/planning/group-destination.ts`, `src/execution/group-placement.ts`, `src/browser/group-placement.ts`.
- Test: `tests/unit/group-destination.test.ts`, `tests/unit/group-placement.test.ts`, `tests/integration/group-placement-adapter.test.ts`, `tests/browser/group-placement.spec.ts`.
- Modify narrowly: `scripts/check-package.mjs`, `tests/unit/boundaries.test.ts`, `tests/unit/package.test.ts` as needed for planning boundary checks, `GitHub issue #3 (historical task 003)`, `docs/archive/architecture.md`, `README.md`.
- Do not alter Tasks 001/002/004–010, production entry points, config, rules, manifest, dependencies or lockfile.

**Interfaces:**
- Read the design's Interfaces and Execution sections; they define `GroupRequest`, structural `DestinationSnapshot`, `GroupDestination`, `GroupPlan`, `GroupPlacementPort`, `SerialRunner`, `GroupPlacementResult`, `planGroupDestination(request, snapshot)` and `createGroupPlacementService({port,queue}).place(request)`; use these names and signatures. A small request validator/skip reason export may share validation, as the spec allows.
- `createGroupPlacementAdapter(api)` in `src/browser/group-placement.ts` implements the port with explicit `tabs.group` arguments and title-only `tabGroups.update`, narrowing existing snapshot reader output. Native `tabGroups.query({windowId})` reads all titles; never pass title query patterns.
- `SerialRunner.run<T>(job: () => Promise<T>): Promise<T>` is structural; callers can inject existing `createOperationQueue()`. Do not relocate the queue or wire the service into production.
- These public methods perform grouping only when explicitly invoked by tests/future executor. They do not check URL identity or navigation generations; Task 005 owns those preconditions before closure.

- [x] **Step 1: Add pure planner behavior tests and run RED.** Pin: request `{tabId:1,windowId:10,incognito:false,title:'BarTab'}`; no matching group yields `{kind:'place',tabId:1,destination:{kind:'new',windowId:10,title:'BarTab'},placement:'group'}`; current matching group yields existing/already-grouped; otherwise leftmost matching group then numeric ID; `'BarTab'` differs from `'bartab'` and literal `'Work*'` differs from `'WorkX'`. Add invalid IDs/title, pinned, missing/moved/context changed, foreign window/context, orphan/contradictory snapshot and readonly inputs cases from the spec. Run the focused file and record expected missing-module/export failure before implementation.
- [x] **Step 2: Implement the planner and run GREEN.** Implement only structural data and pure policy; runtime request checks precede mutation. A matching orphan record is inconsistent, not a cue to create duplicates. Verify all planner cases pass.
- [x] **Step 3: Add queue-backed service tests and run RED.** Pin two fresh observations and replan before mutation, already-grouped no-op, create/group/read/title/read verification, reuse/read verification, exact partial stages/effects, original rejection causes, deletion/rename/last-member disappearance, external naming before title, latest pinned/moved/context skip, queued simultaneous requests creating one group and recovery after rejection. Use deterministic promise gates and observable state effects; no sleeps. Then implement service per spec and run GREEN. Queue serialization includes final verification. No automatic failed-mutation retries or fallback rollback.
- [x] **Step 4: Add adapter and boundary tests and run RED.** Pin existing destination args `{tabIds:[1],groupId:7}`, new destination args `{tabIds:[1],createProperties:{windowId:10}}`, update args `(7,{title:'BarTab'})`, explicit-window snapshot queries, no URL fields escaping adapter, original rejection causes. Extend source/graph guard tests for planning browser globals, value/type imports, and scoped external dependency rejection. Implement adapter/guards narrowly and run GREEN.
- [x] **Step 5: Add isolated real-browser coverage.** Use a separate temporary extension fixture with an actual service/adapter bundle accessible only to tests. Keep the five-file distributable and original production wiring unchanged. Test real create/title/reuse, current-group preference, leftmost duplicate title, exact literal title, nonfocused own-window isolation, last-tab group removal, pinned preservation, stale group rejection and real group creation followed by injected title failure. Observe browser-owned expansion honestly; preserve unrelated attributes without promising transactionality. Record Chromium version; test incognito capability and document any unautomated manual incognito check rather than claiming coverage. Keep deterministic invalidation races in gated unit tests.
- [x] **Step 6: Document decisions and verify the complete feature.** Mark Task003 decisions/acceptance with evidence (controller owns initial window/tie/failure policy), update architecture/README with API usage and current limitations. Run Node24 typecheck, all Vitest tests, build, package validation, all Playwright tests. Use cached Node24/browser paths below. Report RED/GREEN evidence, all changed files, exact commands, outcomes and limitations. Commit only this task and self-review the diff. Controller will independently review and record completion; do not begin Task004.

**Commands/environment:** Every shell command starts with `rtk`; use `rtk proxy` for raw commands. Cached Node24: `node`. Invoke `node_modules/vitest/vitest.mjs run`, `node_modules/typescript/bin/tsc --noEmit`, `scripts/build.mjs`, `scripts/check-package.mjs` directly with that node. Browser: `rtk proxy env -u FORCE_COLOR -u NO_COLOR PLAYWRIGHT_BROWSERS_PATH=$TEMP_DIR/chromerehome-playwright <node> node_modules/@playwright/test/cli.js test`; request scoped exec escalation for browser launch if macOS sandbox blocks it. Repository writes may need a turn-scoped `request_permissions` grant. Avoid regex character-class forms containing `#`: the pinned TS7 AST scanner can stall; use `.includes` alternatives. Existing baseline:460 tests and9 browser tests, typecheck clean on02a0a14.

## Completion

Complete on 2026-10-26. Implementation53c9b62; independent task and whole-feature reviews approved with no findings. Controller verified560 tests,17 isolated Chromium tests, typecheck/build/package. Actual incognito grouping and Chrome120/current-stable release checks remain visibly unverified. Paused before backlog004; production consumer remains no-op. See [completion](../../reviews/2026-10-26-group-destination-resolution-completion.md).
