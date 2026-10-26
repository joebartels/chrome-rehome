# Duplicate URL Equivalence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Complete Task002 through delegated implementation and independent review, then pause before Task003.

**Architecture:** Pure native-URL identity compiler with explicit exact-origin normalizations and browsing-context-qualified keys. Shared validation enters schema3 migrations while grouping and repository/runtime implementations stay unchanged. A lossless raw-query adapter preserves retained token spelling around native parsing/sorting.

**Tech Stack:** Existing Node24, TypeScript, Vitest, esbuild and Playwright; native URL/URLSearchParams; no new dependencies.

**Spec:** [Task002 design](../specs/2026-10-25-duplicate-url-equivalence-design.md), [existing task brief](../../tasks/todo/002-duplicate-url-equivalence.md).

**Authorization:** User explicitly requested the existing task, delegated implementation, independent review and pause afterward. Do not add later feature behavior or reopen already established scope.

## Global Constraints

- Only Task002. No winner selection, Chrome queries, runtime consumer integration, grouping/movement/closure, destination resolution, editor UI or Task003 work.
- Use native URL/URLSearchParams; no custom URL parser, string-similarity algorithm, new library/polyfill, dependency or permission.
- DuplicateRule has exactly origin, ignoreQueryParameters, ignoreFragment, ignoreTrailingSlash, sortQueryParameters. Origin exact HTTP(S), no wildcard/path/query/hash/credentials; canonical origins unique.
- Limits100 rules, origin1–2048 code units,100 distinct ignore names of1–256 code units. Trimmed/nonempty/no controls; required boolean flags; case-sensitive decoded names.
- Default preserve queries/order/repeats/raw tokens, fragments, trailing slash and path case/encoded boundaries. Only explicit per-origin normalization changes identity. No default tracking ignore list.
- Context-qualified opaque keys include explicit normal/incognito separation; invalid pairs are not equivalent. Navigation URL and candidate are never mutated; identities are not logged/persisted.
- Query operations must retain raw spelling of nonignored tokens, multiplicity and equal-key value order; use native stable name sort with token indices rather than reserializing retained values.
- Config3 contains enabled, groupingRules, duplicateRules plus schemaVersion. Strict v1/v2 migrate in memory without writes; v2 grouping values preserved. Save writes canonical3; invalid/future data untouched.
- Existing grouping/repository/background/options implementations remain unchanged; config may import only exact pure validators. Preserve Chrome120 floor/Node24/package policy. No push/merge/publish.

## Review Focus

1. URLSearchParams reserialization can merge distinct malformed/raw byte encodings: preserve retained raw tokens, including when ignoring or sorting.
2. Native URLSearchParams stable ordering must preserve repeated same-name values and empty tokens; test leading ? in a parameter name via URL.searchParams.
3. An opaque key must include browsing context and unambiguous tuple boundaries; never equate two invalid candidates.
4. Exact-origin lookup must normalize case/default ports without matching subdomains, protocols or nondefault ports accidentally.
5. Schema migrations must retain grouping rules and every existing stale-read/save-failure guarantee, and never write on load.

## Task 1: Duplicate identity engine, schema3 migration and integration

**Files:** Create src/rules/duplicates.ts, tests/unit/duplicates.test.ts, tests/fixtures/duplicate-cases.ts, tests/fixtures/config/{valid-v3,invalid-v3}.json. Modify src/config/schema.ts, scripts/check-package.mjs, tests/unit/{config,boundaries}.test.ts, existing coordinator/register/options/storage assertions and tests/browser/foundation.spec.ts as required for canonicalv3; retain legacy v1/v2 fixtures and grouping corpus. Update README, docs/architecture.md, docs/tasks/README.md and only Task002 status/criteria. Other task documents stay unchanged.

**Interfaces:**
- Export DuplicateRule and DuplicateCandidate exactly as design. Export compileDuplicateRules(raw:unknown): {kind:'ready';rules:readonly DuplicateRule[];identify(candidate:DuplicateCandidate):string|undefined;equivalent(left:DuplicateCandidate,right:DuplicateCandidate):boolean} | {kind:'invalid';message:string;ruleIndex?:number}.
- Config owner becomes Readonly<{schemaVersion:3;enabled:boolean;groupingRules:readonly GroupingRule[];duplicateRules:readonly DuplicateRule[]}>; ConfigState reasons and repository signatures unchanged.
- Keys are opaque namespaced JSON tuples. Candidate identity is not a URL to navigate; future planner compares it and passes actual incognito metadata explicitly.

- [ ] Read existing modules/tests, design and package guards. Write behavior tests/shared corpus before engine implementation. Default examples must keep /issues/1 and /issues/2, id=1/id=2, differing hash routes, path case, repeated-value order and raw encoding distinctions separate; host case/default-port canonical equivalents should match.
- [ ] Add explicit-origin examples for tracking deletion, fragment/trailing-slash opts, stable query key sort and combinations. Assert raw retained token preservation with %20/+, %FF/%FE, blank/no-equals values, empty fields, leading ? parameter name and repeated values. Test normal/incognito keys distinct, invalid candidates never equivalent, origin validation/collisions, indexed atomic errors, caps and copied/frozen arrays/records.
- [ ] Run focused tests RED; implement pure compiler using native URL and standard decoded query names/stable sort. Keep raw query token adapter narrow and explained. Compare default keys using URL.href; transform only explicit flags on internal objects. Run GREEN.
- [ ] Before schema edits, add migration/storage tests: missing/v1/v2→v3; preserve exact v2 grouping rules; valid3 round trips both rule lists; invalid3 duplicate-rule index useful; future version4 preserved. Explicit v1/v2 saves canonicalize to3, loads never write. Run RED, implement schema3 with shared validators, update existing expected canonical outputs without weakening concurrency/error tests. Retain historical fixtures.
- [ ] Add package-boundary regressions BEFORE allowing config→exact rules/duplicates validator. Permit only that pure module in addition to grouping; preserve rules external/browser/layer bans including scoped/type-only imports. Run RED/GREEN.
- [ ] Run full current tests/typecheck. Keep grouping implementation and repository/worker/options code unchanged. Fix regressions rather than reducing assertions.
- [ ] Extend browser tests to bundle actual duplicate module temporarily and execute shared corpus in native Chromium. Seed valid3 containing both rule lists, verify healthy status and byte-identical stored data across reload/restart; explicitly test read-only v1/v2 migration, invalid3/future preservation and unchanged tab/group placement. No production hooks or new dist files.
- [ ] Run full suite/typecheck/build/package and isolated Chromium tests. Self-review for default false merges, malformed raw query preservation, key collisions/context separation, schema/storage regressions and source-policy purity.
- [ ] Document API/options/defaults, native mechanisms, query-byte preservation and sensitive-key handling; mark only Task002 done after checks and prepare for independent review. Keep Tasks003–010 TODO. Commit owned changes; write full RED/GREEN commands/results, file list, decisions and limitations to assigned ignored report. No force-adding orchestration reports.

Exact anchor assertions:
```ts
expect(engine.equivalent({url:'https://example.test/issues/1',incognito:false},{url:'https://example.test/issues/2',incognito:false})).toBe(false);
expect(engine.identify({url:'https://example.test/a',incognito:false})).not.toBe(engine.identify({url:'https://example.test/a',incognito:true}));
expect(parseConfig({schemaVersion:2,enabled:true,groupingRules:[]})).toEqual({kind:'ready',config:{schemaVersion:3,enabled:true,groupingRules:[],duplicateRules:[]}});
expect(storage.write).not.toHaveBeenCalled(); // migrated loads, invalid/future loads
```

## Self-review/handoff

One cohesive task establishes the equivalence contract and its persisted schema. Independent task review and whole-feature review follow, with regression fixes for material findings. Verify only Task002 completed, all later tasks untouched, dependency/permission files unchanged and working tree clean. Finish with verification evidence and pause.
