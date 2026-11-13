# ChromeReHome foundation design

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../../README.md).

Status: Approved by the user on 2026-10-25; foundation implementation locally verified on 2026-10-25 (typecheck, unit/integration suite, build/package and bundled Chromium smoke). Hosted CI and release browser/performance validation remain outstanding; all ten product feature tasks remain TODO.
Date: 2026-10-24

## Intent and scope

Build a small Chrome Manifest V3 extension whose later features can replace older duplicate tabs with the tab receiving the latest navigation, preserve useful placement, and apply configured grouping rules. This delivery builds the foundation and tracks product behaviors as separate TODO tasks. It does not enable automatic tab closure or movement.

Agreed product requirements:
- The tab receiving the newest navigation wins, including navigation within an existing tab.
- When duplicates exist, inherit the selected older duplicate's window, group, and relative position unless a configured group overrides that destination.
- Resolve the final destination before moving; avoid an intermediate move into a group that will immediately be overridden.
- Move/group successfully and revalidate relevant URLs before closing any older duplicate.
- Group rules use simple wildcards against scheme, hostname, and pathname, excluding query and fragment. First matching configured rule wins; `*` matches zero or more characters, including `/`. A path ending `/*` does not implicitly include the slashless repository root: configure a second root rule if desired.
- Duplicate equivalence is a separate ruleset, with explicit, site-specific normalization rather than text similarity.

Proposed foundation choices: TypeScript with strict checking; esbuild for separate entry bundles; Vitest for unit/integration tests; Playwright for browser smoke tests; npm lockfile and a supported Node LTS pinned in project tooling. Use Node 24 LTS for development. Target Chrome 120+ initially, with Chrome 120 compatibility and current stable checked before release. No UI framework initially.

## What the foundation delivers

1. A loadable extension with one module service worker and a minimal options page showing foundation status. No popup until there is a useful quick control.
2. Top-level navigation and lifecycle listener registration, with handlers awaiting shared initialization. No required listener is registered after asynchronous initialization.
3. A versioned configuration repository, strict runtime validation, explicit migrations, and fixtures. Version 1 contains only schemaVersion and enabled; feature tasks introduce their own versioned schemas instead of speculative settings.
4. A compact normalized navigation event: tab ID, URL, document ID when available, navigation kind, and observed sequence. Main-frame HTTP(S) events only. Browser-provided timestamps are retained for diagnostics but not compared with wall-clock timestamps.
5. A serial operation queue whose failure does not poison later jobs. Jobs must settle before another starts; a timeout must not release a still-running browser mutation. This is in-memory coordination within one worker lifetime, not durable transaction recovery.
6. Focused browser ports for configuration reads/writes and current tab/group snapshots. Add mutation ports with the feature that first needs them. Domain matching and decisions cannot import Chrome globals.
7. Bounded, opt-in diagnostics without raw URL/query logging by default; no network calls or telemetry.
8. Repeatable builds, meaningful primitive tests, a real Chrome extension smoke test, CI, architecture notes, and the task backlog.

The live navigation pipeline initially records/normalizes events only and performs no product mutations. Dependencies between layers are enforced by imports and tests, not an elaborate plugin framework.

## Boundaries and ownership

- background/index.ts: synchronous listener registration and dependency wiring only.
- background/navigation.ts: normalize supported navigation events and track per-tab generations; equivalent notifications for one navigation must not produce contradictory work.
- background/coordinator.ts: wait for initialization and dispatch normalized work through the queue. Initially a no-op consumer; future tasks supply real planning/execution.
- background/operation-queue.ts: serialize operations and recover from rejected jobs. No arbitrary timeouts that permit overlapping writes.
- config/: schema, validation, migrations, repository; options and worker share these contracts.
- browser/: narrow Chrome adapters with explicit tab/window IDs and typed snapshots; Chrome remains authoritative for live browser state.
- rules/: pure grouping and duplicate matching, added in their feature tasks. These are separate concepts and must remain independently configurable.
- planning/: pure plan generation, added alongside tab replacement. A plan captures source navigation generation, participants, observed identities, destination, and preconditions.
- execution/: browser mutations and recovery, added before automatic replacement is enabled. Only this boundary may perform destructive actions.
- options/: settings UI in its own bundle. It does not directly orchestrate tab mutations.

## State and lifecycle

Durable configuration belongs in storage.local. storage.session is reserved for recovery metadata that must survive worker suspension; add its schema with recovery. Do not store a duplicate permanent tab database or sync live tab/group IDs across devices.

Every worker start initializes configuration once. Listeners are already registered while initialization runs. Validation errors preserve stored data and put the extension in a disabled/error state; they never silently reset user rules. Settings updates invalidate cached compiled rules through storage.onChanged.

Future execution must serialize conflicting operations, invalidate stale navigation generations, query current state before closure, and resume/reconcile interrupted work from Chrome plus a small session journal. A queue alone is insufficient after suspension.

## Permissions and build

Expected initial permissions: tabs, tabGroups, storage, webNavigation. No host_permissions, content_scripts, scripting, webRequest, debugger, offscreen document, keep-alive timer, or remote executable code. Bundle background and options independently; exclude test/dev tooling from the extension package. Validate manifest version, paths, permissions, and packaged files in CI.

## Verification

- Queue: concurrent arrivals execute sequentially; rejection allows the next job; unresolved work never releases the next mutation.
- Configuration: defaults, invalid values, unknown future versions, migration fixtures, and storage failures. Never overwrite invalid input on startup.
- Navigation: ignore subframes/internal URLs, handle committed/history/fragment events deliberately, clear closed-tab state, and invalidate earlier generations.
- Browser adapter: explicit IDs, missing tab/group cases, and API rejection propagation using narrow fakes.
- Smoke: build and load the package in a persistent Chromium context; open options; observe worker startup and restart without tab mutations. Keep browser-owned tab/group behavior tests for feature tasks.
- CI: clean install, typecheck, tests, build/package validation, browser smoke.
- Performance baseline: document idle worker shutdown, startup cost, API-call counts and navigation handling with 20/200/1000 tabs. These are measurement scenarios, not unverified performance promises. Feature task 010 owns expanded measurement and budgets.

## Decisions deliberately left to feature tasks

Fuzzy duplicate normalization details; protecting pinned/audible/unsaved tabs; whether group rules target the current window or a designated group across windows; multiple duplicate anchor selection; explicit restore/startup handling; user bypass; and recovery after partial placement. Each is recorded in a task as a decision required before enabling its behavior.

## References

- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing
- https://github.com/philc/vimium/blob/master/background_scripts/tab_recency.js
- https://github.com/refined-github/refined-github/blob/main/source/options-storage.ts
- https://github.com/TadayukiOkada/tab-auto-grouper/blob/main/background.js
