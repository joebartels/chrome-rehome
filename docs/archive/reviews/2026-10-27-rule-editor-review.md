# Task 007 whole-feature independent review

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Reviewed 2026-10-27. Repository: `<repository>`.
Range: `historical-revision..historical-revision` (four commits; 38 changed files).
Reviewer: `/root/editor_final_review`.

## Scope and plan alignment

The review covers schema migration, shared matching engines, pure draft/preview model, asynchronous controller, native editor, runtime integration, tests, and current documentation. I used the supplied whole-feature review package, design, plan, progress ledger, task reports and independent task reviews. I examined all changed source modules directly, inspected relevant diff/test/document sections, and followed the unchanged repository, storage adapter and background consumer boundaries where needed to assess integration. Initial oversized output was truncated; subsequent bounded reads recovered the omitted relevant sections.

The implementation meets Task 007's intended behavior: ordered editable grouping rules and duplicate policies; enabled flags that preserve disabled entries; explicit validated whole-document saves; preview through the real runtime compilers; retained dirty drafts on observable conflicts and storage failures; accessible labeled controls and logical focus; unchanged global activation, including the default false. There are no Task 008 controls, new dependencies, permission changes, production test hooks, or new network paths in this range.

The additional shared `parseGroupingCandidate` export and `rows.ts` presentation split are justified narrow implementation choices. The former preserves the runtime parser's nondefault-port and credential semantics, while the latter keeps DOM row construction outside controller/model ownership. Neither changes the approved matching language or introduces background/UI coupling.

## Strengths

- **Migration and runtime semantics remain coherent.** Schema-specific strict checks distinguish accepted legacy shapes from required v4 boolean flags (`src/config/schema.ts:33`). Legacy migration is in memory, and the dedicated storage adapter still performs one whole-object write only when requested (`src/browser/config-storage.ts:11`). Disabled rules are fully validated; grouping skips them only during matching, and duplicate origin collision checks remain independent of the active lookup (`src/rules/grouping.ts:54`, `src/rules/duplicates.ts:63`). Background placement still compiles the captured lists through these same engines (`src/background/placement.ts:23`).
- **Preview has a narrow, safe boundary.** The model uses the real match/identity/equivalence APIs, returns configured group/policy positions and comparison results rather than opaque identities, and preserves the engines' distinct URL acceptance rules (`src/options/model.ts:79`). Preview input remains view-local, and user-controlled output uses textContent (`src/options/view.ts:119`, `src/options/view.ts:140`). Browser coverage checks literal unsafe text and no preview storage/request/tab effects (`tests/browser/rule-editor.spec.ts:87`).
- **Saving handles the important asynchronous failure orders.** Subscribe-before-load, settled repository snapshots, private draft copies, busy guards, remembered written-candidate baseline, and post-write verification prevent the common stale-read/false-success/draft-loss failures (`src/options/controller.ts:61`, `:82`, `:119`, `:165`, `:193`). Deferred-storage tests use the actual repository and cover newer pending reads, rejected writes, conflicting publications, own echoes, retry, and disposal (`tests/unit/options-controller.test.ts:139`, `:152`, `:165`, `:180`, `:194`, `:215`, `:250`).
- **The UI is appropriately native and testable.** Stable nodes preserve typing/caret, row actions restore logical focus, fields have bounded labels and described errors, and narrow styles wrap without hiding functionality (`src/options/rows.ts:17`, `:68`, `:84`; `src/options/view.ts:80`, `:89`, `:161`; `src/options/styles.css:45`). Browser tests exercise keyboard-only editing, exact serialization, clean cross-page propagation, dirty conflict retention, failed-write retry, and actual background grouping after enabled/disabled saves (`tests/browser/rule-editor.spec.ts:48`, `:120`, `:171`, `:186`, `:204`).
- **Documentation distinguishes configuration, preview, and runtime effects.** README and architecture now explain schema 4, disabled-policy fallback, explicit saves, memory-only preview, preserved activation, and the absence of storage compare-and-swap. Task completion remains pending this review intentionally; that is not evidence of missing implementation.

## Issues

### Critical (Must Fix)

None found.

### Important (Should Fix)

None found.

### Minor (Nice to Have)

1. **Compiler shape diagnostics omit the supported optional enabled field.**
   - Evidence: `src/rules/grouping.ts:65`; `src/rules/duplicates.ts:75`.
   - Both validators now accept an optional boolean `enabled`, but their error messages still describe only the legacy field set. For example, an explicit nonboolean `enabled` receives wording that incorrectly suggests enabled itself is unsupported.
   - This is inaccurate developer-facing diagnostic copy, not a validation or runtime defect. Mention optional boolean enabled in both messages while retaining strict rejection of unknown/nonboolean fields. This confirms the previously deferred Task 1 minor finding.

2. **Editor action text can contradict the current conflict/dirty state.**
   - Evidence: `src/options/controller.ts:74`–`:78` and `:204`; rendered alongside derived state at `src/options/view.ts:161`–`:162`.
   - Reproduction A: begin with saved A; edit draft B; observe external C, which creates a conflict; observe A again. The controller correctly clears conflict, but keeps “Saved settings changed. Reload saved settings before saving your draft.” Save is now enabled, so the message gives an obsolete required action.
   - Reproduction B: edit B back to the original A. The controller correctly reports dirty=false while its message is “Unsaved changes.” The page therefore simultaneously says the draft matches saved settings and has unsaved changes.
   - A focused in-memory reproduction against the actual controller/repository confirmed both outcomes. Neither path loses data or bypasses preflight, so this is nonblocking UI consistency. Clear/recompute stale conflict text when observation resolves the conflict, and derive the ordinary edit message from the resulting dirty state. Small behavioral assertions for these two transitions would protect the fix.

## Verification evidence and limits

- I independently parsed `EXTERNAL_EVIDENCE/2026-10-27-rule-editor/controller-browser.json`: **108 expected, zero skipped, zero unexpected, zero flaky, errors=[]**. All five native external-app cases are explicitly successful, including the disabled control and stopped-worker case.
- Root reports fresh final TypeScript, **959 unit/integration tests across 29 files**, build and package checks passing. Task reports document the preceding RED/GREEN evidence and final fault-order regression tests. I did not rerun those suites because no unresolved behavioral doubt required duplication.
- I confirmed exactly five files in `dist`, the declared Chrome 120 floor, Node 24.x engine, and unchanged permission set. These are artifact/configuration checks, not a claim of runtime execution on Chrome 120.
- Root reports clear wide/light and narrow/dark screenshot QA. I inspected source/CSS and browser assertions; I did not independently repeat screenshot capture or a full visual accessibility audit.
- I ran only a focused in-memory esbuild/Node reproduction for Minor 2. Its output was `dirty:true, conflict:false` with the stale reload instruction, then `dirty:false, conflict:false` with “Unsaved changes.” Bundling used `write:false`; no test suite or browser was launched.
- The earlier task review's NO_COLOR/FORCE_COLOR warning is reported resolved by root's fresh invocation. It is not an open product finding.
- No checkout, index, HEAD, or branch changes were made by this review. The review report is written outside the checkout at the requested workspace path.

## Recommendations

Resolve the two minor copy/state-consistency findings in a narrow follow-up, then update the Task 007 completion evidence and ledger. Retain the documented storage race limit and pause before Task 008. No architectural rewrite or additional feature scope is warranted by this review.

## Declined to judge

- **Global activation/pause and replacement protections:** Task 008 scope; this review instead verified that the editor preserves existing activation and default false.
- **Backup/import/export UI:** explicit Task 007 non-goal; README's existing controlled-trial backup/restore workflow is retained.
- **Complete cross-page write serialization:** Chrome storage lacks compare-and-swap and the approved design explicitly accepts the final preflight-to-write race. I reviewed observable conflict detection and truthful verification rather than requiring a new writer service.
- **Retroactive ungrouping of existing tabs when disabling a rule:** not the saved-rule/runtime contract; the feature controls future matching, and documentation explains this behavior.
- **A fresh full audit of pre-existing navigation eligibility, recovery journal, and native closure policy:** outside this changeset. I checked shared-compiler integration and regression evidence; existing 006/006a limitations remain documented.
- **Release certification on Chrome 120/current stable, enabled incognito, interactive drag/focus/collapse, hosted CI, and performance budgets:** later/manual release gates remain expressly unverified. Current bundled Chromium results do not establish those claims. I did assess rule bounds and basic architecture without imposing Task 010 benchmarks.

## Assessment

**Ready to merge? Yes, with two nonblocking minor follow-ups.**

The feature is coherent across storage, domain, controller and real-browser integration, and the important failure orders have substantial behavioral coverage. No Critical or Important defect was found; the remaining findings affect diagnostic and status-message accuracy rather than persistence safety or matching correctness.
