# ChromeReHome Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build and verify a loadable, non-destructive extension foundation with explicit seams for the ten feature tasks already in docs/tasks/todo.

**Architecture:** A small worker entry point registers events synchronously. A coordinator awaits shared configuration initialization and feeds normalized navigation through a serial queue to a no-op consumer. Configuration and navigation contracts are independent of Chrome; narrow adapters own Chrome calls. Options has a separate bundle.

**Tech Stack:** TypeScript strict mode, esbuild, Vitest, Playwright, npm lockfile, Node 24 LTS, Manifest V3, Chrome 120+; no UI framework.

**Spec:** [Approved foundation design](../specs/2026-10-24-foundation-design.md)

**Status:** Completed on 2026-10-25 through delegated implementation, per-task independent reviews, and a final whole-foundation review. Paused before feature work at the user's request. All ten feature tasks remain TODO.

## Global Constraints

- This delivery builds the foundation and tracks product behaviors as separate TODO tasks. It does not enable automatic tab closure or movement.
- Use Node 24 LTS for development. Target Chrome 120+ initially, with Chrome 120 compatibility and current stable checked before release. No UI framework initially.
- Version 1 contains only schemaVersion and enabled; feature tasks introduce their own versioned schemas instead of speculative settings.
- No required listener is registered after asynchronous initialization.
- Jobs must settle before another starts; a timeout must not release a still-running browser mutation.
- Domain matching and decisions cannot import Chrome globals.
- Durable configuration belongs in storage.local. storage.session is reserved for recovery metadata that must survive worker suspension; add its schema with recovery.
- Expected initial permissions: tabs, tabGroups, storage, webNavigation. No host_permissions, content_scripts, scripting, webRequest, debugger, offscreen document, keep-alive timer, or remote executable code.
- Bundle background and options independently; exclude test/dev tooling from the extension package.
- Bounded, opt-in diagnostics without raw URL/query logging by default; no network calls or telemetry.

## Review Focus

1. Navigation received while configuration is still loading must not disappear or run early: Task 4 coordinator tests.
2. A tab navigating to an unsupported URL must invalidate older queued work even though the unsupported event itself is ignored: Task 3 generation tests.
3. A future config version or malformed config must remain byte-for-byte untouched, with an actionable unavailable state: Task 1 repository tests and Task 4 UI tests.
4. An unresolved/rejected operation must not allow concurrent mutations or permanently block later settled work: Task 2 deferred-promise tests.
5. Worker restart and build entry-point changes must not lose event registration or pull UI code into the worker: Task 5 smoke and package/boundary checks.

## File ownership and implementation order

| Task | Deliverable | Dependencies |
|---|---|---|
| 1 | Tooling and validated configuration repository | None |
| 2 | Serial queue and private, bounded diagnostics | 1 |
| 3 | Navigation lifecycle model and live snapshot adapters | 1 |
| 4 | Worker wiring, coordinator, minimal options UI | 1–3 |
| 5 | Package validation, browser smoke, CI, handoff docs | 4 |

Tasks 2 and 3 have disjoint files and can be delegated independently once Task 1 contracts land. The worker integrates only reviewed interfaces. Preserve existing user changes; the initial .gitignore contains node_module and .DS_Stores typos, so correct those deliberately while adding generated-file exclusions. The repository currently has no commits; work in the requested checkout unless the user requests isolation. Do not push, publish, or execute automatic tab actions.

## Task 1: Configuration repository and test tooling

**Files:** Create package.json, package-lock.json, tsconfig.json, vitest.config.ts, .nvmrc, src/config/schema.ts, src/config/repository.ts, src/browser/config-storage.ts, tests/unit/config.test.ts, tests/integration/config-storage.test.ts, tests/fixtures/config/*.json. Modify .gitignore. No extension feature behavior here.

**Interfaces:**
- Config = Readonly<{ schemaVersion: 1; enabled: boolean }>.
- ConfigStorage: read(): Promise<unknown>; write(value: Config): Promise<void>; subscribe(listener: () => void): () => void.
- ConfigState = { kind: 'ready'; config: Config } | { kind: 'unavailable'; reason: 'invalid' | 'future-version' | 'storage'; message: string }.
- parseConfig(raw: unknown): ConfigState. Missing value means { schemaVersion: 1, enabled: false }; reject unknown properties and types; reject future schema versions distinctly.
- createConfigRepository(storage: ConfigStorage): { load(): Promise<ConfigState>; save(raw: unknown): Promise<ConfigState>; subscribe(listener: (state: ConfigState) => void): () => void; dispose(): void }.
- createChromeConfigStorage(api: Pick<typeof chrome, 'storage'>): ConfigStorage; storage.local key chromeReHomeConfig; observe only changes to that key in local.

- [x] Install dev-only TypeScript, esbuild, Vitest, @types/chrome, @types/node and @playwright/test; commit exact resolved lockfile. Pin Node major 24 in .nvmrc and engines. Configure strict checking, noUncheckedIndexedAccess and exactOptionalPropertyTypes. Commands: typecheck, test, build, check:package, test:browser; later tasks implement the last three.
- [x] Write tests that assert parseConfig(undefined) equals ready/default-disabled; valid v1 round-trips; malformed values, unknown keys and future versions do not trigger writes. save validates before writing and returns unavailable on storage failure. subscribe refreshes after relevant changes and dispose detaches its listener. A delayed older read cannot replace a later completed settings read.
- [x] Run `rtk npm test -- tests/unit/config.test.ts tests/integration/config-storage.test.ts`; expect missing implementation failures.
- [x] Implement pure schema parsing and a version-dispatch migration entry in schema.ts. Support only missing/default and v1; future migration functions are introduced with actual schema changes, rather than inventing historical formats. Repository owns load/refresh coordination; expose no mutable config references. Chrome adapter translates storage callbacks to the narrow port.
- [x] Run covering tests plus `rtk npm run typecheck`; require green. Commit only Task 1 files and approved design/backlog documentation, preserving unrelated files.

Illustrative exact assertions:
```ts
expect(parseConfig(undefined)).toEqual({kind: 'ready', config: {schemaVersion: 1, enabled: false}});
expect(parseConfig({schemaVersion: 2, enabled: true})).toMatchObject({kind: 'unavailable', reason: 'future-version'});
expect(storage.write).not.toHaveBeenCalled(); // after loading invalid/future data
```

## Task 2: Serial queue and bounded diagnostics

**Files:** src/background/operation-queue.ts, src/diagnostics/diagnostics.ts, tests/unit/operation-queue.test.ts, tests/unit/diagnostics.test.ts.

**Interfaces:**
- createOperationQueue(): { run<T>(job: () => Promise<T>): Promise<T> }. Individual errors reach the caller; internal queue tail absorbs them so later jobs can proceed.
- DiagnosticEvent = Readonly<{ code: 'worker-started' | 'navigation-observed' | 'configuration-unavailable' | 'operation-failed'; sequence?: number; tabId?: number }>.
- createDiagnostics(options?: { enabled?: boolean; capacity?: number }): { record(event: DiagnosticEvent): void; snapshot(): readonly DiagnosticEvent[] }. Defaults: disabled, capacity 100. Enabled capacity must be an integer 1–1000; invalid capacity throws. Copy records and strip unknown runtime properties; do not retain URLs, arbitrary exceptions or payloads.

- [x] Write deferred-promise tests: second job cannot start before first settles; FIFO order; original return/error preserved; failure allows third job; unresolved first job blocks second without timers. Test diagnostics disabled stores nothing, capacity drops oldest, runtime extra URL field is excluded, and returned snapshots cannot mutate retained records.
- [x] Run `rtk npm test -- tests/unit/operation-queue.test.ts tests/unit/diagnostics.test.ts`; expect missing implementation failures.
- [x] Implement queue and diagnostics. No polling, timeouts, production globals, persistence, or network. Diagnostics opt-in is programmatic in this foundation; a persistent preference would require a real schema change later.
- [x] Run covering tests and typecheck; require green and commit Task 2 files.

```ts
expect(order).toEqual(['first-start']); // while first is unresolved, after second was submitted
expect(diagnostics.snapshot()).toEqual([]); // disabled by default
```

## Task 3: Navigation generations and live snapshots

**Files:** src/background/navigation.ts, src/browser/snapshots.ts, tests/unit/navigation.test.ts, tests/integration/snapshots.test.ts.

**Interfaces:**
- NavigationKind = 'committed' | 'history' | 'fragment'.
- NavigationInput = { tabId: number; frameId: number; url: string; timeStamp: number; documentId?: string; kind: NavigationKind }.
- Navigation = Readonly<{ tabId: number; url: string; documentId?: string; kind: NavigationKind; observedSequence: number; generation: number; browserTimeStamp: number }>.
- createNavigationTracker(): { observe(input: NavigationInput): Navigation | undefined; invalidate(tabId: number): void; forget(tabId: number): void; isCurrent(event: Navigation): boolean }.
- SnapshotScope = {kind: 'all-normal-windows'} | {kind: 'window'; windowId: number}.
- TabSnapshot fields: id, windowId, index, groupId, pinned, active, audible, incognito, url?: string, pendingUrl?: string. GroupSnapshot fields: id, windowId, title?: string, color, collapsed. Types are readonly; url absence is allowed.
- createSnapshotReader(api: Pick<typeof chrome, 'tabs' | 'tabGroups'>): { read(scope: SnapshotScope): Promise<{ tabs: readonly TabSnapshot[]; groups: readonly GroupSnapshot[] }> }. The all-normal-windows scope means normal Chrome window type, not exclusion of incognito; retain incognito flag for later eligibility policy.

- [x] Write tests: subframes do nothing; main-frame HTTP(S) retains actual URL/query/hash; internal/malformed main-frame URLs invalidate previous generation but emit no event; stale generations fail isCurrent; forget removes ownership; repeated identical input tuple (kind/documentId/url/timeStamp) is deduplicated. Same URL with a later timestamp is a new observation. No wall-clock comparisons. Invalid tab IDs and nonfinite timestamps do not emit events.
- [x] Run `rtk npm test -- tests/unit/navigation.test.ts`; expect missing implementation failures.
- [x] Implement tracker with bounded per-live-tab state, globally increasing observedSequence, and generation tokens that cannot collide if a forgotten tab ID is reused. One latest fingerprint per tab is sufficient; do not retain navigation history.
- [x] Write snapshot tests for explicit window/all-normal queries, missing URL, API failure, tab/group disappearing between calls, and filtering groups to selected windows. Document snapshots are observations, not atomic cross-API transactions. Adapter must not invoke mutation methods.
- [x] Run snapshots tests failing; implement adapter with batched independent reads and narrow result mapping. Chrome globals occur only in adapter types, not navigation domain code.
- [x] Run both suites and typecheck; require green and commit Task 3 files.

```ts
expect(tracker.isCurrent(firstNavigation)).toBe(false); // after unsupported main-frame navigation
expect(tracker.observe(subframeNavigation)).toBeUndefined();
```

## Task 4: Worker lifecycle wiring and minimal options page

**Files:** src/background/index.ts, src/background/register-events.ts, src/background/coordinator.ts, src/options/index.ts, src/options/view.ts, src/options/index.html, src/options/styles.css, tests/integration/coordinator.test.ts, tests/integration/register-events.test.ts, tests/unit/options-view.test.ts.

**Interfaces:**
- createCoordinator(deps: { config: ConfigRepository; tracker: NavigationTracker; queue: OperationQueue; diagnostics: Diagnostics; consume: (event: Navigation) => Promise<void> }): { handle(input: NavigationInput): Promise<void>; invalidate(tabId: number): void; forget(tabId: number): void; dispose(): void }. Use inferred exported types from earlier factory return types rather than duplicating interfaces.
- registerEvents(api, coordinator, reportFailure): void. api is a narrow selection of webNavigation, tabs, runtime events; reportFailure: () => void receives no raw error payload.
- options view produces {heading: string; message: string; severity: 'info' | 'error'} from ConfigState; render with textContent, not HTML interpolation.

- [x] Write tests with delayed initial load: immediately arriving navigation is handled only after readiness; two concurrent handlers share one initialization; disabled/unavailable config skips consume; config change to disabled invalidates queued work through a revision check; stale navigation is skipped at execution time. Invalid/future configs remain unchanged and UI gives an actionable message without a reset action.
- [x] Run coordinator and view tests failing; implement coordinator with shared init promise and short queue jobs. Default production consumer is async no-op; no tab placement or closure APIs exist in this foundation.
- [x] Write registration tests: all listener addListener calls occur synchronously even with an unresolved storage read. Observe onCommitted, onHistoryStateUpdated and onReferenceFragmentUpdated. onBeforeNavigate invalidates current main-frame work without emitting a product navigation. onRemoved forgets tab state; onReplaced forgets removed ID and invalidates added ID. runtime startup/install handlers await initialization and record only safe diagnostics. Rejections are caught through reportFailure.
- [x] Run registration tests failing; implement registerEvents as a synchronously invoked wiring helper. index.ts constructs adapters/repository/tracker/queue/disabled diagnostics, coordinator and listeners. Initialization failure must not remove event listeners or produce unhandled rejections.
- [x] Build minimal options page displaying: ChromeReHome, Foundation installed, and Automatic tab organization is not implemented yet. Show enabled/disabled foundation configuration and unavailable reason; expose no controls suggesting unfinished features work. Subscribe using the same repository validation, not duplicated parsing; dispose subscriptions on page teardown.
- [x] Run covering tests and typecheck; require green and commit Task 4 files.

```ts
expect(consume).not.toHaveBeenCalled(); // while init read remains unresolved
expect(configStorage.write).not.toHaveBeenCalled(); // invalid config viewed in options
```

## Task 5: Build, package verification, browser smoke and handoff

**Files:** manifest.json, scripts/build.mjs, scripts/check-package.mjs, playwright.config.ts, tests/browser/foundation.spec.ts, tests/unit/boundaries.test.ts, .github/workflows/ci.yml, README.md, docs/architecture.md, docs/performance-baseline.md. Update docs/tasks/README.md foundation status and approved spec implementation status only after verification.

**Interfaces:** build writes dist/manifest.json, dist/background/index.js, dist/options/index.js, dist/options/index.html, dist/options/styles.css. Manifest background is module; options_ui opens options/index.html in a tab; minimum_chrome_version is 120. Permissions exactly match Global Constraints. No action popup.

- [x] Add package checks that fail for missing entry files, broadened permissions, unexpected packaged files, forbidden code loading, or UI imports in worker. Boundary tests reject Chrome globals/imports in src/config except browser adapters, options-to-background imports, and background imports of options code. Dist allowlist contains only five files above; no source maps in distribution.
- [x] Run `rtk npm run build` and `rtk npm run check:package` before implementation; expect missing-script/file failures. Implement esbuild bundling with chrome120 target, two independent entries, copied HTML/CSS/manifest, deterministic output and local executable code only. Validate permissions/manifest and emitted metafile dependency graph. Keep metafile outside dist.
- [x] Write a Playwright persistent-context test using the bundled Chromium channel and --load-extension/--disable-extensions-except flags. Assert options page renders, service worker starts, and normal HTTP(S) fixture navigation leaves tab count/group membership unchanged. Seed invalid/future config and assert error display without overwriting it.
- [x] Add explicit worker termination via test-only browser CDP ServiceWorker APIs, then trigger a fresh fixture navigation; verify worker revival and synchronous event registration using observable startup plus covered integration tests. Never add debugger permission, a production test endpoint or keep-alive solely for tests. If CDP instrumentation cannot prove event delivery, record that limit rather than overclaiming a browser assertion.
- [x] Run browser smoke failing before build is available, then run `rtk npm run build`, `rtk npm run check:package` and `rtk npm run test:browser`; require green. Install the required Playwright Chromium through its supported installer. Keep browser downloads outside git and use isolated temporary profiles.
- [x] Add CI for clean npm ci on Node 24, typecheck, Vitest, build/package checks, Playwright install with dependencies, and browser smoke. A local passing run does not establish CI passed; report actual CI status honestly.
- [x] Document extension load steps, commands, module ownership, future feature integration points, config/error behavior, permissions, supported versions and unfinished product features. Preserve all ten TODOs as TODOs. Add measurement instructions for 20/200/1000 tabs, worker cold start, idle shutdown, API calls and storage writes; record only results actually measured. Expanded budgets and Chrome 120 compatibility remain release-task requirements.
- [x] Run `rtk npm run typecheck`, `rtk npm test`, `rtk npm run build`, `rtk npm run check:package`, `rtk npm run test:browser`. Review full diff and test evidence independently. Fix material findings and rerun covering checks. Commit Task 5 and report foundation completion separately from feature backlog status. No push or publish.

## Plan self-review

- Spec coverage: tooling/config → 1; queue/diagnostics → 2; navigation/snapshots → 3; listeners/coordinator/UI → 4; package/smoke/CI/docs → 5. Future matcher/planner/executor/journal responsibilities remain in the existing feature tasks.
- Constraints: no automatic movement/closure, telemetry, page injection or keep-alive; no speculative runtime plugin system; explicit version/permission floors retained.
- Interface consistency: all shared types originate from their owning modules; options uses the same config contracts; read-only snapshots do not imply transaction consistency.
- Review-focus tests are assigned above. No worker-lifetime durability is attributed to the in-memory queue or generations.
- Execution recommendation: subagent-driven implementation with per-task reviews; Tasks 2 and 3 may run in parallel, Task 4 waits for both. The user approved delegated implementation. All five implementation tasks and their independent reviews are complete.
