# Duplicate URL equivalence design — Task002

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../../README.md).

Status: implemented and independently reviewed on 2026-10-25.

Scope: execute the existing Task002 requested by the user on 2026-10-25 using delegated implementation and independent review, then pause before Task003. Prior task/foundation requirements fix intent. The conservative defaults and API choices below settle routine implementation decisions; they do not add automatic duplicate replacement.

## Intent and selected approach

Create a pure reusable duplicate identity/equivalence engine independent of grouping. Use standard URL and URLSearchParams parsing/sorting, not edit distance, general text similarity or a new URL-normalization dependency. Native canonical URL serialization supplies the default identity; only explicit exact-origin rules relax it. Reusing compileGroupingRules with fake group names would couple unrelated concepts and is rejected. Broad global tracking stripping is rejected because meaningful parameter semantics vary by site.

The engine never changes the supplied navigation URL or candidate object. It never queries Chrome, persists/logs keys, selects winning tabs, moves/groups/closes tabs, or integrates the no-op worker consumer. Existing grouping behavior/API remains unchanged.

## API

DuplicateRule = Readonly<{
  origin: string;
  ignoreQueryParameters: readonly string[];
  ignoreFragment: boolean;
  ignoreTrailingSlash: boolean;
  sortQueryParameters: boolean;
}>.

DuplicateCandidate = Readonly<{ url: string; incognito: boolean }>.

compileDuplicateRules(raw: unknown) returns:
- {kind:'ready';rules:readonly DuplicateRule[];identify(candidate:DuplicateCandidate):string|undefined;equivalent(left:DuplicateCandidate,right:DuplicateCandidate):boolean}
- {kind:'invalid';message:string;ruleIndex?:number}

identify returns an opaque deterministic context-qualified identity key, not a navigation target. Serialize a namespaced tuple containing browsing context and canonical href, avoiding string-concatenation collisions. Normal/incognito keys can never be equal; equivalent requires two valid identities and key equality. Two invalid candidates are never equivalent. Require an explicit boolean incognito; do not silently default missing context to normal. Unsupported/malformed HTTP candidates return undefined/false without throwing within the typed/JSON input contract.

Compilation validates all rules atomically. Copy/freeze array, rule records and parameter-name arrays. Preserve entered origin/name text and rule order in returned configuration; compile a private canonical-origin lookup. Mutating input after compilation cannot change behavior.

## Conservative identity and origin scope

- HTTP(S) URLs only. Reject leading/trailing whitespace, controls, backslashes, missing authority and embedded nonempty credentials. Use URL parsing for validation and canonicalization.
- Default is URL.href, retaining query serialization/order, empty query/hash markers, fragments and trailing path slashes. Host/scheme case and default ports normalize through the standard URL parser. Preserve path case and encoded path delimiters; do not decode paths, collapse internal slashes, strip www, merge HTTP/HTTPS, or change issue/PR/file/document IDs.
- Rule origin is an exact HTTP(S) origin with optional final /. No wildcard, credentials, query, fragment or path. Canonicalize for lookup with URL.origin; different schemes/nondefault ports are separate. Reject duplicate canonical origins. This task does not introduce pattern matching for equivalence selection.
- No built-in tracking ignore list or global relaxations. Rules opt in independently for each origin; absent origin uses conservative defaults. First-match grouping semantics are unrelated and must not leak into duplicate selection.
- Limits:100 rules; origin1–2048 UTF-16 code units; at most100 distinct ignored names, each1–256 code units. All text must be trimmed/nonempty without controls; boolean fields required; exact keys only. Parameter ignore names are exact decoded, case-sensitive names, not wildcard patterns. An ignored name removes every occurrence of that name.

## Optional normalization semantics

- ignoreFragment removes the whole fragment, including an empty marker. False preserves anchors and SPA hash routes.
- ignoreTrailingSlash removes all trailing / characters from pathname except the root /. It does not collapse internal slashes or decode an encoded terminal slash.
- sortQueryParameters sorts by decoded parameter names using URLSearchParams stable key order. Equal-name value order is preserved; values and multiplicity are never sorted/deduplicated. False preserves original order.
- Ignoring parameters and/or sorting must preserve the exact raw spelling of all retained name/value tokens: %20 versus +, %2f case, invalid byte escapes, blank/no-equals values and repeated parameters. Do not serialize the retained user query through URLSearchParams, which can re-encode it or replace invalid UTF-8 bytes.
- Use URL.searchParams (not a freshly parsed raw token starting with ?, which has different constructor behavior) to obtain standard decoded names. Split only the raw query's & delimiters to retain original tokens and empty fields; align decoded names with nonempty tokens. For sorting, URLSearchParams can sort temporary name/index pairs to derive stable ordering while retained raw tokens stay untouched. This is a narrow lossless adapter around standard URL parsing/sorting, not a new matching algorithm.
- Preserve explicit empty ? by leaving search untouched when no query tokens change. Removing the last real ignored token removes the query delimiter; retain nonremoved empty raw fields. Apply changes only to an internal URL object. Keep malformed/distinct retained byte encodings distinct even with ignore/sort enabled.

## Configuration and integration

Canonical Config version3 contains schemaVersion, enabled, groupingRules and duplicateRules only. Missing config is disabled v3 with both rule lists empty. Strict v1 migrates to v3 with empty lists; strict v2 migrates to v3 preserving grouping rules and adding empty duplicateRules. Strict v3 validates both engines; unknown fields, invalid rules and future versions fail closed. Loads never write migrations; explicit saves write canonical v3. Preserve raw stored legacy/invalid/future input and every existing repository ordering/write-failure guarantee.

Allow config imports of the exact pure duplicates validator alongside the exact grouping validator in package source/graph policy. Rules remain free of Chrome globals and external/layer dependencies. Do not refactor grouping or repository implementation without a concrete demonstrated integration defect.

## Verification and limits

Use a shared hand-specified Node24/Chromium corpus: default distinct issue/PR/doc IDs, meaningful queries, fragments/SPA hashes, path case, encoded slash, query order/repeats; explicit tracking ignore, fragment/trailing slash opts, stable key order; exact-origin scheme/port/subdomain boundaries; context separation; invalid and unsupported candidates; raw encodings/invalid bytes/empty tokens; immutable input/output; rule validation bounds and canonical-origin duplicates.

Run actual duplicate engine in a temporary browser-only test bundle as Task001 does, without production hooks. Browser extension tests seed version3 with both rule lists, show healthy status and preserve stored data across reload/restart, migrate v1/v2 read-only, preserve invalid duplicate/future configs and keep tabs/groups unchanged. Keep the complete grouping corpus passing.

Do not claim equivalence knows whether a server treats two URLs identically. Only standards canonicalization and explicit user policies define equality. Actual Chrome120/current-stable qualification, CI execution and performance budgets remain Task010. Pause after Task002.

Reference: https://url.spec.whatwg.org/ (standard URL canonicalization and stable URLSearchParams name ordering; use native algorithms).
