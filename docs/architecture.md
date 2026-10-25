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
| `rules/grouping.ts` | Pure ordered wildcard compiler using native `URLPattern`; shared validation for schema 2 and future preview/planning. No browser globals or config/background/options/browser imports. |
| `browser/` | Narrow Chrome adapters for `storage.local` and current tab/group snapshots. New mutation ports belong to features requiring them. |
| `diagnostics/` | Bounded, opt-in, redacted diagnostic records; no telemetry or raw URL/query logging by default. |
| `options/` | Minimal installation/configuration status; shares config contracts through browser adapters. |

Every worker start constructs dependencies, registers listeners synchronously and initiates configuration loading. Event handlers await initialization; no asynchronous initialization gates listener registration. Errors preserve stored configuration and disable processing. `storage.session` has no schema yet; the recovery feature must define it before using it.

Grouping rules and future duplicate equivalence are independent pure concepts. `compileGroupingRules(unknown)` returns immutable rules plus `match(url)` or an indexed validation error. It parses each configured HTTP(S) URL with `URL`, escapes native metacharacters except `*`, and compiles reusable component-based `URLPattern` objects. HTTP and HTTPS alternatives for `*://` normalize default ports independently. Candidate search/hash are ignored, first configured match wins, path case/encoded delimiters remain significant, and invalid candidates return undefined. Rule validation is atomic and bounded (100 rules, 2048 code units per pattern, 80 per group title). See [Task 001](tasks/todo/001-wildcard-group-rules.md) for examples and constraints.

`Config` and `ConfigState` remain owned by `config/schema.ts`. Canonical config is `{ schemaVersion: 2, enabled: boolean, groupingRules: readonly GroupingRule[] }`. Missing config defaults to disabled v2; strict v1 migrates in memory with empty rules. V2 delegates rule validation to the same compiler and copies/freezes all accepted data. Loads never persist migrations or overwrite invalid/future input. Explicit validated saves write v2; repository ordering, subscriber notification and write-failure behavior are unchanged. The options UI remains read-only and the worker consumer remains a no-op.

`planning/` will resolve destinations and preconditions before mutations. `execution/` will own move/group/closure, stale identity revalidation and a recovery journal. Closure must wait for successful placement and revalidation; none of those behaviors are enabled. Preserve the feature dependency order in the backlog.

Build checks scan typed source, including erased type imports, and inspect esbuild's emitted dependency graph. Source guards permit only `rules/grouping` as a dependency outside `config/` for config validation, reject rules imports outside `rules/` and browser globals in both pure layers, and reject options/background coupling and UI code in worker bundles. The scanner uses the pinned TypeScript 7 AST scanner entry point, whose API must be rechecked during dependency upgrades. Package checks deliberately enforce this small project's invariants; they are not a general JavaScript security analyzer.

Browser smoke confirms load, options errors, byte-preserved v2 rules across reload, unchanged v1/invalid/future storage, unchanged tab/group snapshots, stopped/running CDP worker state and a fresh JavaScript realm after navigation. A compiler bundle generated in a temporary test fixture runs the same hand-checked literal/wildcard/query/hash/port matrix as Node against native Chromium `URLPattern`. No fixture enters the extension package. The no-op consumer has no observable application result proving event consumption. Deterministic synchronous registration, navigation dispatch and delayed initialization are covered by integration tests. There is no production test endpoint or worker keep-alive.
