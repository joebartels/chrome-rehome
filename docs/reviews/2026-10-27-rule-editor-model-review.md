# Task 1 independent review

## Spec Compliance

- ✅ Spec compliant for the reviewed Task 1 scope. Schema 4 requires per-rule boolean enablement while migrations preserve global state and rule values (`src/config/schema.ts:4`, `:16`, `:33`). Both compilers preserve direct legacy field presence, validate disabled rules, retain configured ordering, and exclude disabled rules from active lookup (`src/rules/grouping.ts:54`, `:84`; `src/rules/duplicates.ts:60`, `:97`).
- ✅ The mutable draft, exact-name conversion, semantic equality, indexed validation, and actual-compiler preview contracts are present (`src/options/model.ts:5`, `:30`, `:40`, `:54`, `:79`). Preview results contain report fields rather than candidate URLs or opaque identities (`src/options/model.ts:18`, `:26`, `:104`).
- ✅ All requested file categories have corresponding hunks. Legacy fixture/compiler inputs remain legacy; canonical expectations and browser setup migrate to v4, and future examples use 99 (`tests/unit/config.test.ts:43`, `tests/integration/config-storage.test.ts:36`, `tests/browser/foundation.spec.ts:195`). No dependency, manifest, background implementation, or build configuration changes appear in the package.
- ⚠️ Cannot verify the unchanged Chrome 120 minimum, Node 24 runtime setting, exact five built files, or baseline 006/006a behavior from this task diff. Root should retain its planned final build/package/browser checks. Nothing in this diff changes those settings or starts 008.

## Strengths

- Disabled duplicate origins remain part of collision detection while a separate map supplies active policies; `match` returns the actual frozen compiled object (`src/rules/duplicates.ts:65`, `:89`, `:98`, `:115`).
- Preview reuses grouping candidate parsing and both real compilers, preserving engine-specific credentials and nondefault ports without another matching language (`src/rules/grouping.ts:44`, `src/options/model.ts:87`). New tests cover disabled precedence, canonical collisions, exact textarea values, limits, no mutation, and identity omission (`tests/unit/options-model.test.ts:28`, `:43`, `:54`, `:94`, `:113`, `:125`).

## Issues

### Critical / Important

None found.

### Minor

- `src/rules/grouping.ts:65` and `src/rules/duplicates.ts:75`: shape-error messages still describe only the legacy keys, although these same validators now accept optional boolean `enabled`. Invalid extended input therefore receives an inaccurate explanation of the supported shape. Mention optional boolean `enabled` in both messages. This does not block Task 1.

## Assessment

**Task quality: Approved.** The implementation is task-scoped, pure at the model boundary, and preserves the existing compilers' semantic decisions. The only identified issue is diagnostic wording.

**Checks/evidence:** Reviewed the supplied `historical-revision..historical-revision` package, task brief, and implementer report. The initial combined tool output was truncated; omitted package ranges were read to complete the review. No changed source file was separately reread, no external code check was needed, no tests were rerun, and no code/index/HEAD changes were made. The report records 932 passing tests, clean typecheck and whitespace checks, and explicit red evidence; no warning output was reported.
