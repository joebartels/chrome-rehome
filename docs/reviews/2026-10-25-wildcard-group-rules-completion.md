# Wildcard grouping-rule engine — completed

Completed Task001 on 2026-10-25 through delegated implementation and independent task/whole-feature reviews. The sole minor source-policy finding was corrected and independently re-reviewed. Paused before Task002; remaining nine tasks stay TODO.

Repository: `<repository>`, local branch `wildcard-group-rules`. No push, merge or publication.

## Delivered

- Actual URL matching uses native URLPattern, available in Chrome95+; Chrome120 remains the project floor. No custom matching algorithm, library, polyfill, new dependency or new permission.
- A reusable `compileGroupingRules` API validates immutable ordered `{pattern, group}` rules. First match wins. `*` is the sole wildcard; query/hash are ignored on candidates and rejected as configured syntax. Path case and encoded delimiters remain significant.
- HTTP/HTTPS and `*://`, hostname/path stars, literal routing metacharacters, IPv6, IDN and per-scheme port normalization are covered by the shared Node/Chromium case matrix.
- Schema2 adds `groupingRules`; strict v1 migrates in memory to empty rules, preserving enabled. Loads do not rewrite storage. Explicit saves write canonicalv2. Invalid/future data remains untouched.
- Shared config/rules validation is allowed by a narrow, tested source boundary. Scoped external runtime/type-only imports are rejected.

The worker consumer remains no-op. This task does not add a rule editor, automatic grouping, destination resolution, duplicate detection or tab closure.

## Verification

Controller fresh checks at `historical-revision`:

| Check | Result |
|---|---|
| Typecheck | Pass |
| Unit/integration | 308 tests across13 files pass |
| Build | Pass |
| Package validation | Pass |
| Independent task + whole-feature + correction reviews | No open findings |

Controller actual Chromium checks at `historical-revision`: six tests pass, including the actual matcher/shared corpus, no-write v1 migration, v2 data preservation, invalid rules/future values, worker restart and unchanged tab/group placement. Only the build guard and its regressions changed afterward; runtime source/browser tests/manifest/dependency files were verified unchanged. Browser smoke was not repeated for that policy-only correction.

No dependency/lockfile/manifest permission change. Node24.22.1 used throughout. Hosted CI, actual Chrome120/current-stable release qualification and performance benchmarks remain Task010 work.

## Test it

Using Node24 in the repository:

```sh
npm test -- tests/unit/grouping.test.ts
npm run test:browser -- --grep "actual grouping compiler"
```

The first tests matching/validation directly. The second executes the actual compiler in native bundled Chromium using a temporary test-only bundle; install the Playwright test browser if it is not available in your configured cache. Full verification commands and API/configuration examples are in README.md.

The installable package can be unzipped and loaded unpacked through `chrome://extensions`; the options page remains read-only. To update the existing unpacked installation, rebuild and reload it from the same repository `dist/` path.

## Rulings I made

1. Selected native URLPattern rather than a custom matcher or library to satisfy the requested established, lightweight mechanism. Cost if wrong: replace the thin adapter behind the same public rule contract.
2. Defined per-scheme default-port behavior, schema2 `{pattern,group}` rules and limits of100 rules,2048 pattern code units and80 group-title code units. Cost if wrong: adjust validation/schema in a later task.
3. Allowed config to import only the pure grouping module while enforcing equivalent rules-layer isolation. Cost if wrong: revise the narrow dependency policy; no runtime dependency/permission increase.

## Known tooling limit

The pinned TypeScript7 unstable source scanner can fail to advance on certain regex-literal syntax. The implementation uses equivalent simple string checks and all current checks pass. General scanner hardening was not undertaken in this feature. The implementation report documents the bounded diagnosis and corrected test results.

## Mechanism references

- https://developer.chrome.com/docs/web-platform/urlpattern
- https://urlpattern.spec.whatwg.org/
