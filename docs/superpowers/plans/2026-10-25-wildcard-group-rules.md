# Wildcard Group-rule Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Status:** Completed with delegated implementation, independent task/whole-feature reviews and scoped correction review on 2026-10-25. Paused before Task002.

**Goal:** Complete backlog Task001 (pure matching and versioned configuration) and pause before Task002.

**Architecture:** A native URLPattern-backed compiler validates ordered wildcard-only rules and exposes a reusable match function. Schema v2 incorporates those same validated immutable rules and migrates strict v1 documents in memory. No Chrome mutations, automatic grouping or editor UI are added.

**Tech Stack:** Existing Node24/TypeScript/Vitest/esbuild/Playwright; native URL and URLPattern; zero new dependencies.

**Spec:** [Wildcard design](../specs/2026-10-25-wildcard-group-rules-design.md); [approved Task001](../../tasks/todo/001-wildcard-group-rules.md).

**Authorization:** User explicitly requested this existing task, delegated implementation, independent review, then pause. The existing task/spec fix scope; routine validation/API defaults are recorded in the design. Do not reopen approvals or start later tasks.

## Global Constraints

- Complete only Task001, then pause before Task002. No movement/grouping/closure, duplicate identity, destination resolution, editor UI, runtime pipeline integration or new permissions.
- Use native URLPattern for actual matching; no custom matching algorithm, home-grown matching regex, runtime library/polyfill or dependency changes.
- GroupingRule = Readonly<{ pattern: string; group: string }>; first configured matching rule wins.
- Pattern schemes: http://, https://, *://; HTTP(S) only. Numeric port supported; missing/default port matches default only. *:// compiles HTTP and HTTPS alternatives to normalize ports per scheme.
- * is the sole wildcard; other native metacharacters are escaped as literals. Ignore candidate query/hash; reject literal ?/# in configured patterns.
- Limits:100 rules, pattern1–2048 code units, group1–80 code units, no surrounding whitespace/controls. Validation is atomic; outputs are copied/frozen.
- Config v2 = Readonly<{schemaVersion:2; enabled:boolean; groupingRules:readonly GroupingRule[]}>. Strict v1 → v2 with empty rules; no writes on load. Explicit save writes canonical v2. Preserve invalid/future input and all existing race guarantees.
- Chrome120 floor, Node24, existing separate worker/options bundles and package policy remain intact.

## Review Focus

1. Native URLPattern treats colon/groups specially; a literal path such as /:id or /(a|b) must not broaden matches.
2. Scheme-wildcard ports must normalize per actual scheme, not according to one placeholder protocol.
3. Version1 migration must not rewrite storage during read or weaken strict unknown-field validation.
4. Changing Config typing must preserve older-read/newer-save/rejected-write guarantees across callers and subscriptions.
5. Native Node24 and bundled Chromium behavior must both be exercised; no runtime matcher hooks or dependencies added solely for tests.

## Task 1: Implement matcher, migration and integration tests

**Files:** Create src/rules/grouping.ts, tests/unit/grouping.test.ts and relevant version2 config fixtures. Modify src/config/schema.ts, tests/unit/config.test.ts, tests/integration/config-storage.test.ts and any existing coordinator/register/options assertions/fixtures that encode current config shape. Extend tests/browser/foundation.spec.ts for v2 rules preservation. Update README.md, docs/architecture.md and docs/tasks/{README.md,todo/001-wildcard-group-rules.md}; do not modify other feature tasks. Add a focused browser matching test/fixture only if needed to exercise actual native browser matching without production hooks.

**Interfaces:**
- Export GroupingRule and compileGroupingRules(raw: unknown): {kind:'ready';rules:readonly GroupingRule[];match(url:string):GroupingRule|undefined} | {kind:'invalid';message:string;ruleIndex?:number} from src/rules/grouping.ts.
- Export Config and ConfigState from their existing owner with canonical schema2 shape. ConfigStorage remains the same port with Config-typed writes. Keep createConfigRepository caller/subscriber contracts unchanged.
- Future Tasks003/007 consume config.groupingRules and compiler.match; no routing decisions or browser API calls belong here.

- [x] Read actual existing schema, repository, tests, package checks and design before editing. Native URLPattern is available in cached Node24. Use the constructor/type provided by existing tooling; if type declarations require adjustment, add the narrow platform typing only, no runtime polyfill.
- [x] Add matcher tests BEFORE implementation. Assert nested GitHub match.group is BarTab; slashless root is undefined; query/hash variants match identically; first overlap wins; /:id and /(a|b) match their literal paths only. Add port80/443/8080 cases for both protocols including *://, hostname wildcard, path case/encoded slash, adjacent stars, valid punctuation and malformed patterns/candidates. Assert bounds and immutability.
- [x] Run focused matcher tests and capture expected RED. Implement parsing/validation and literal escaping adapter, then construct/reuse native URLPattern objects for match calls. No handwritten matching algorithm. Run matcher tests GREEN.
- [x] Add migration/storage tests BEFORE schema change: missing→disabledv2; strictv1 true/false→v2 empty rules; v1 unknown fields rejected; valid v2 rules preserved/frozen; invalid rule/index error; explicit saves writev2; migration loads never write; future versions remain untouched; failed writes remain failures amid newer successful reads. Run RED, then implement schema2 and narrow updates to existing expectations. Keep historical v1 fixtures for compatibility tests and add v2 fixtures rather than erasing v1 coverage.
- [x] Run full unit/integration suite and typecheck; fix regression causes rather than weakening assertions. Keep production worker consumer no-op and options UI read-only.
- [x] Extend isolated browser smoke to seed version2 rules and verify healthy settings, byte-preserved rule data across reload and unchanged tab/group placement. Native browser matching must be covered by test-side loading of the actual matcher source bundled only to a temporary test fixture (not dist), or another test-only route with no production hook; use the same representative matrix as Node for literals, wildcard, query/hash and ports. No user-profile browser access.
- [x] Run build/package checks and browser tests under Node24. Capture RED/GREEN evidence for new assertions where implementation changed. Use isolated profiles and the existing browser cache. Run full current suite once more before commit.
- [x] Document actual native mechanism, public API/schema, migration/no-write semantics, pattern examples and constraints. Do not claim automatic grouping is available. Mark only Task001 complete once implementation and checks pass; reviewer/controller will confirm. Preserve remaining nine TODOs. Self-review and commit owned changes. Write full report with commands/output, RED/GREEN, files, deviations and limitations to assigned report path.

Exact core assertions:
```ts
expect(compiled.match('https://github.com/example-org/sample/issues?x=1#y')?.group).toBe('BarTab');
expect(compiled.match('https://github.com/example-org/sample')).toBeUndefined();
expect(parseConfig({schemaVersion:1, enabled:true})).toEqual({kind:'ready',config:{schemaVersion:2,enabled:true,groupingRules:[]}});
expect(storage.write).not.toHaveBeenCalled(); // after loading/migrating valid v1, invalid v2, or future config
```

## Self-review and handoff

The one task intentionally carries matching plus migration because they establish one supported feature contract. Review the whole feature diff for correct URLPattern escaping/port behavior and unchanged repository semantics. Independent task review followed by whole-feature review is required. Fix material findings with regression tests. Finish with fresh typecheck, full suite, build/package and browser evidence. No pushes, merges or subsequent feature tasks; keep the branch and pause.
