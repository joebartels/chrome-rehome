# Rule Editor and Matching Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accessible ordered rule editing with truthful explicit saves and runtime-equivalent previews.

**Architecture:** Schema 4 adds enabled flags while direct compilers preserve legacy inputs. A pure model validates/previews drafts; a controller owns async repository state; native DOM retains focus while editing. Existing background consumers use the same compilers.

**Tech Stack:** TypeScript, native DOM/URL/URLPattern, Chrome local storage, Vitest and Playwright; existing dependencies only.

**Spec:** `docs/superpowers/specs/2026-10-27-rule-editor-design.md`

## Global Constraints

- Chrome minimum 120; Node 24.x; strict TypeScript/native DOM; no new dependencies/frameworks/network/permissions.
- Exactly five built files; preserve existing 006/006a behavior and external-app/native-launch checks.
- Preserve global enabled; missing storage remains disabled; no Task 008 controls or protections.
- Every shell command starts with `rtk`; browser profiles are isolated temporary Chromium profiles, never personal Chrome.
- Preview URLs are memory-only: no storage, diagnostics, logging, links or requests.
- Work in place on `rule-editor-preview`. Root owns independent reviews, commits, screenshot QA and ledger; no fresh approval gate.

## Review Focus

- Invalid disabled entries and duplicate canonical origins remain errors (Task 1).
- Rejected save must release busy and permit retry with the exact preserved draft (Task 2).
- Old startup/reload/save completions and disposal cannot overwrite newer editor state (Task 2).
- Observed cross-page dirty conflicts block writes without pretending storage has CAS (Task 2).
- Focus/caret, multiline names and unsafe text survive edits without HTML interpretation or preview persistence (Tasks 1–2).

## File map

Schema/rule files own canonical contracts and matching. New `src/options/model.ts` owns pure draft/preview behavior. New `src/options/controller.ts` owns async repository coordination. Existing view/entry/HTML/CSS own native rendering. New unit tests target model/controller; a new browser spec verifies the real extension.

## Task 1: Enabled schema, compilers, and pure draft preview

**Files:** Modify `src/config/schema.ts`, `src/rules/grouping.ts`, `src/rules/duplicates.ts`; create `src/options/model.ts`, `tests/unit/options-model.test.ts`, `tests/fixtures/config/valid-v4.json`, `invalid-v4.json`. Update `tests/unit/{config,grouping,duplicates,options-view}.test.ts`, `tests/integration/config-storage.test.ts`, and canonical Config expectation/typed-fixture locations found with `rtk rg 'schemaVersion: ?[34]' tests`. Known locations include integration placement-consumer/recovery/coordinator/register-events and browser foundation/navigation-fixture/replacement-placement/replacement-recovery/external-app-links. Future fixture/browser examples become version 99. Preserve legacy raw inputs/direct compiler fixtures rather than blanket replacement.

**Interfaces:**
- `parseConfig(raw:unknown):ConfigState` produces frozen Config schemaVersion 4, with required boolean enabled on both rule lists.
- Domain GroupingRule/DuplicateRule enabled is optional for direct legacy callers. Compile accepts only exact old keys or exact old keys+boolean enabled; copied rules preserve presence/absence. Disabled entries stay validated and listed but not active.
- Duplicate ready compiler adds `match(candidate:DuplicateCandidate):DuplicateRule|undefined`, backed by its actual active map/parser. Existing identity/matching APIs remain.
- Model exports mutable `EditorDraft` with global enabled, `groupingRules` of `{enabled,pattern,group}` and `duplicateRules` of `{enabled,origin,ignoredQueryNames,ignoreFragment,ignoreTrailingSlash,sortQueryParameters}`; `ignoredQueryNames` is textarea text.
- `createDraft(config:Config):EditorDraft`, `sameConfig(a:Config,b:Config):boolean` and `validateDraft(draft:EditorDraft):DraftValidation`. Validation result is `{kind:'ready',config:Config}` or `{kind:'invalid',errors:readonly DraftError[]}`. Error has list `groupingRules|duplicateRules`, optional zero-based ruleIndex and message.
- `previewDraft(draft:EditorDraft,url:string,compareUrl:string):PreviewResult`. Invalid-draft result or ready result with grouping (`empty|invalid|unmatched|matched`; match carries ruleIndex/group), duplicate candidates (`empty|invalid|conservative|policy`; policy carries ruleIndex/origin), and comparison (`incomplete|invalid|equivalent|distinct`). Export types; never return opaque identities.

- [ ] **1. Write failing schema/domain tests.** Assert v1–v3 strict migration to v4+enabled true preserves global false/order/strings and load bytes. Explicit save writes one canonical object. Reject v4 missing/undefined/string enabled, unknown keys and enabled in legacy rules. Check freezing. Disabled first group remains listed but second matches; toggling restores precedence. Invalid disabled rules/canonical collisions fail. Disabled duplicate policy uses conservative identity; match returns active compiled object only. Preserve old compiler fixture equality.
- [ ] **2. Run red tests.** `rtk proxy node node_modules/vitest/vitest.mjs run tests/unit/config.test.ts tests/unit/grouping.test.ts tests/unit/duplicates.test.ts tests/integration/config-storage.test.ts`; confirm missing-feature failures.
- [ ] **3. Implement schema and compiler contracts.** Enforce version-specific strict shapes before compile; explicit enablement normalization occurs only in schema. Separate all-origin duplicate uniqueness from active lookup; reuse candidate validation for duplicate match. No background redesign.
- [ ] **4. Write failing model tests.** Assert draft independence; empty names=[], whitespace/blank lines/duplicates rejected unchanged; limits 100/2048/80/100/256; invalid disabled rules block preview. Reorder changes first match; disabled broad rule skipped; same group with distinct paths remains distinct; configured query/fragment policy produces equivalent; disabling it gives distinct/conservative; malformed input differs from no match; credential semantics remain engine-specific. Preview does not mutate drafts or expose identities.
- [ ] **5. Run red model tests.** Run cached Node and Vitest as above with `tests/unit/options-model.test.ts`; confirm missing model/behavior fails.
- [ ] **6. Implement model.** Split exact names, use singleton compiler validation for inline rows and full compile/parse for cross-row/schema validation. Preview uses actual compiler match/identify/equivalent and compiled rule positions. No Chrome/storage/network dependencies or new URL matching language.
- [ ] **7. Update schema expectations and run green checks.** Preserve legacy raw fixture meanings; update canonical outputs/direct Config literals, future version99 and new v4 fixtures. Run focused tests then all Vitest and `rtk proxy node node_modules/typescript/bin/tsc --noEmit`. Expect no failures/typed schema3 leftovers.
- [ ] **8. Handoff task1 for root review/commit.** Report red/green evidence and contracts. Do not commit or start008.

## Task 2: Resilient controller, native editor and browser validation

**Files:** Create `src/options/controller.ts`, `tests/unit/options-controller.test.ts`, `tests/browser/rule-editor.spec.ts`. Modify `src/options/{view.ts,index.ts,index.html,styles.css}`, `tests/unit/options-view.test.ts`, `tests/browser/foundation.spec.ts`. Extend storage integration tests as necessary; existing repository/adapter should remain unless a demonstrated bug requires narrow repair.

**Interfaces:** Consume Task1's Config/model contracts and existing repository load/save/subscribe/getCurrent/dispose. Export `createOptionsController(repository:ReturnType<typeof createConfigRepository>)` with `{ready:Promise<void>,getState():EditorState,subscribe(listener):()=>void,edit(update:(draft:EditorDraft)=>void):void,save():Promise<void>,reload():Promise<void>,dispose():void}`. Present readonly state with optional draft, saved ConfigState, validation, dirty/busy/conflict and bounded action message; model remains privately mutable. State excludes preview URLs. View owns preview text/row IDs. mountOptions can evolve its element set but retains ready/dispose; createOptionsView remains pure saved-status formatting.

- [ ] **1. Write failing controller tests with deferred storage.** Test clean adoption, dirty equal config/no conflict, dirty different config/conflict/no write, reload discard only after success, initial unavailable/no writable draft, external invalid/future state preserves draft, preflight detects unseen change, global enabled preservation and one write/save. Test duplicate action blocking while busy.
- [ ] **2. Add failure-order tests.** Late initial read after newer result; reload after newer event; dispose with pending read/write; own old-base/pending-candidate events during saving. Reject first write: draft/base intact, busy false, valid Save retry succeeds after fresh read. Preflight failure also retries. Post-write verification failure gives truthful unverified message and preserves written-candidate baseline for retry. Changed storage before verification yields conflict, never saved acknowledgement.
- [ ] **3. Run red controller tests.** Cached Node/Vitest with `tests/unit/options-controller.test.ts`; confirm missing controller/behavior failures.
- [ ] **4. Implement controller.** Follow spec base/draft/latest separation, subscribe-before-load, canonical comparison and request/disposal generations. Save validates, preflight compares, writes once, verifies via fresh read. Freeze edits during save/explicit reload. Release busy on every path; repository unavailable publication must not permanently block retry. Preserve drafts until successful adoption/discard. Never claim saved before verified write.
- [ ] **5. Write failing browser editor tests.** Follow existing foundation mkdtemp/finally isolated-profile fixture. Assert labeled add/edit/enable/delete/move, keyboard-only operation, focus/caret during multi-character typing, limits/inline aria errors, multiline duplicate names and literal unsafe text. Verify exact saved object and reload; preview reorder/policies/equivalence with unchanged storage and tab/group snapshot. Prefer bounded role/name selectors.
- [ ] **6. Run red browser tests.** Build via cached Node `scripts/build.mjs`; run `rtk proxy node node_modules/@playwright/test/cli.js test tests/browser/rule-editor.spec.ts`. Confirm missing UI failures; unavailable Chromium must be reported rather than using personal Chrome.
- [ ] **7. Implement view and entry.** Native two-list forms, row actions/errors, Save/Reload and two-input preview. Retain `#status-message` as sole role=status saved-status region so foundation selectors stay unambiguous; other action/result regions use stable IDs/aria-live. Remove old false copy, show persisted activation and draft-preview explanation, no activation toggle. Use stable row nodes while typing; restore logical focus after structural actions. TextContent, labels, fieldsets, descriptions/invalid, native bounds, light/dark/narrow/focus styles. Preview excluded from serialization and retained during updates.
- [ ] **8. Complete entry/browser integration coverage.** Update old stub/copy tests deliberately and verify teardown. Two pages demonstrate clean propagation then dirty conflict/no clobber. Test-only intercept one local.set rejection; UI retains draft and retry succeeds. v3 fixture bytes remain unchanged until explicit v4 Save. Preview never writes/mutates tabs. Seed global enabled true through harness, save rules via UI, navigate routed tab and verify active background grouping; disable via UI/save and verify a new matching tab is not grouped. Do not require old tabs to ungroup retroactively.
- [ ] **9. Verify completed change.** Cached Node runs TypeScript, full Vitest, scripts/build.mjs, scripts/check-package.mjs and full Playwright suite. Preserve existing external-app environment gating/harness and report skipped native checks accurately. Expect five artifacts/unchanged permissions/no page errors/all covering checks pass. Capture narrow/wide/light/dark editor screenshots for root QA.
- [ ] **10. Handoff for root review/completion.** Report evidence and no-CAS limitation. Root owns independent review/fixes/rechecks, commit and 007 decisions/checklist/ledger. Pause before008.
