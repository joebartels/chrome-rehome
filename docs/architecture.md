# Foundation architecture

The worker and options page are independent ES module entry bundles. Configuration contracts are shared; options does not import background orchestration. Browser state remains authoritative, and snapshots are read-only observations rather than transactions.

| Module | Ownership and next integration point |
| --- | --- |
| `background/index.ts` | Wire dependencies and synchronously register every required listener before initialization. |
| `background/register-events.ts` | Observe committed/history/fragment navigation, pre-navigation invalidation, tab removal/replacement and install/startup. Integration tests cover registration and delayed initialization. |
| `background/coordinator.ts` | Await one shared initialization, validate generations and enqueue normalized work. Its current consumer is a no-op; future planning/execution attaches here. |
| `background/navigation.ts` | Normalize main-frame HTTP(S) events; per-tab generations reject stale work within one worker lifetime. |
| `background/operation-queue.ts` | Serialize jobs until settlement and recover after rejection. An in-memory queue provides no durability after suspension. |
| `config/` | Pure schema, validation, migration dispatch and repository; no Chrome globals or browser-adapter imports. |
| `browser/` | Narrow Chrome adapters for `storage.local` and current tab/group snapshots. New mutation ports belong to features requiring them. |
| `diagnostics/` | Bounded, opt-in, redacted diagnostic records; no telemetry or raw URL/query logging by default. |
| `options/` | Minimal installation/configuration status; shares config contracts through browser adapters. |

Every worker start constructs dependencies, registers listeners synchronously and initiates configuration loading. Event handlers await initialization; no asynchronous initialization gates listener registration. Errors preserve stored configuration and disable processing. `storage.session` has no schema yet; the recovery feature must define it before using it.

Future `rules/` grouping and duplicate equivalence remain independent pure concepts. `planning/` will resolve destinations and preconditions before mutations. `execution/` will own move/group/closure, stale identity revalidation and a recovery journal. Closure must wait for successful placement and revalidation; none of those behaviors are enabled by this foundation. Preserve the feature dependency order in the backlog.

Build checks scan typed source, including erased type imports, and inspect esbuild's emitted dependency graph. Source guards reject config/browser coupling, options/background coupling, and UI code in worker bundles. The scanner uses the pinned TypeScript 7 AST scanner entry point, whose API must be rechecked during dependency upgrades. Package checks deliberately enforce this small project's invariants; they are not a general JavaScript security analyzer.

Browser smoke confirms load, options errors, unchanged tab/group snapshots, stopped/running CDP worker state and a fresh JavaScript realm after navigation. The no-op consumer has no observable application result proving event consumption. Deterministic synchronous registration, navigation dispatch and delayed initialization are covered by integration tests. There is no production test endpoint or worker keep-alive.
