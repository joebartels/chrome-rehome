# Task002 duplicate URL equivalence — completed

Completed on2026-10-25 through delegated implementation, independent task/whole-feature reviews and scoped correction review. Paused before Task003. Task001 remains unchanged and complete; Tasks003–010 remain TODO.

Repository: `<repository>`. Local branch: `duplicate-url-equivalence`. No push, merge or publication.

## Delivered

A pure `compileDuplicateRules` engine, independent of grouping. It returns reusable `identify`/`equivalent` operations with conservative native URL identity and unambiguous context-qualified keys. Normal and incognito identities cannot merge. Invalid/unsupported candidates never compare equal.

Explicit exact-origin rules can ignore named tracking parameters, ignore fragments, ignore trailing slashes or sort query names. Nothing is ignored globally by default. Meaningful parameters, repeated-value order, path case/encoded delimiters and raw retained query spellings stay significant. Native URL and URLSearchParams own parsing/stable sorting; a small lossless adapter preserves retained raw query tokens instead of reserializing their values. No dependencies, polyfills or permissions were added.

Schema3 adds duplicateRules alongside groupingRules. Strictv1/v2 migrate only in memory, preserving enabled and existing grouping rules; loads do not write. Explicit saves write canonicalv3. Invalid/future data and existing repository concurrency/write-failure guarantees remain intact.

The worker consumer remains no-op. This task does not find/replace/close duplicate tabs, move/group tabs, select a winner, or add a rule editor. Those tasks remain separate.

## Verification

Controller fresh checks on implementation head `historical-revision`:

| Check | Result |
|---|---|
| Typecheck | Pass |
| Unit/integration |460 passed across14 files|
| Build |Pass|
| Package validation |Pass|
| Isolated Chromium |9 passed|
| Independent reviews |No remaining findings after correction|

Native Chromium executes both the shared identity corpus and a14-case positive/negative rule-compilation corpus. Coverage includes raw query tokens/repeats/empty fields, context separation, exact-origin boundaries/collisions, immutable rules, v1/v2 no-write migrations, v3 byte preservation, invalid/future settings, worker revival and unchanged tab/group placement.

The whole-feature review reproduced an encoded-wildcard origin that Node rejected but Chromium accepted. The validator now rejects literal and encoded canonical stars consistently. A real Chromium regression failed before the fix and passes afterward; scoped independent review confirms the issue is addressed.

Dependencies, manifest permissions, existing grouping/repository/background/options implementations and later task documents are unchanged. Actual Chrome120/current-stable qualification, hosted CI and performance budgets remain Task010. Equivalence is explicitly configured policy, not a guarantee about arbitrary server semantics. Keys contain URL data and are comparison-only: never log, persist or navigate to them.

## Test it

Use Node24 in the project directory:

```sh
npm test -- tests/unit/duplicates.test.ts
npm run test:browser -- --grep "actual duplicate compiler"
```

The first tests the engine directly. The second runs the actual module and shared positive/negative cases in isolated native Chromium. Install the Playwright browser if needed in your configured cache. README.md contains the public API/configuration examples and full commands.

To update an existing unpacked installation, reload the extension after building the repository's `dist/`. The downloadable package contains only the five extension files and can be unzipped and loaded unpacked. The options page remains read-only; no automatic tab replacement is enabled.

## Rulings I made

1. Used conservative native identities, opt-in exact-origin rules and explicit context-qualified keys to limit false merges and keep grouping separate. Cost if wrong: extend the selector/policy contract in a later schema.
2. Preserved retained query-token bytes around native parsing/stable sorting to avoid encoding and invalid-byte collisions. Cost if wrong: revise the small lossless adapter.
3. Added schema3 with no-write legacy migrations and caps of100 origins/100 ignored names/2048 origin units/256 name units. Cost if wrong: adjust validation/schema later.

Reference: https://url.spec.whatwg.org/
