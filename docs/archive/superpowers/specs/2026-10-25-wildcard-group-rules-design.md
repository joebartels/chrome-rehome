# Wildcard group-rule engine design

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../../README.md).

Status: implemented and independently reviewed on 2026-10-25.

Scope: implement approved backlog Task 001 only, as requested on 2026-10-25, through delegated implementation and independent review; pause afterward. The task description and prior foundation design fix the product behavior. Remaining limits/shape choices below are implementation defaults, not new user requirements.

## Intent and boundaries

Provide a pure, reusable engine and validated configuration for the future settings preview and destination planner. Match HTTP(S) URLs against ordered wildcard rules, ignoring candidate query strings and hash fragments. The first matching rule wins. This delivery does not add automatic tab grouping, destination resolution, duplicate matching, rule-editor UI, or runtime planner integration.

## Approaches and selected mechanism

The user asked for an established, well-tested URL matcher without heavy dependencies. Use native URLPattern, supported in Chrome95+ and the installed Node24 runtime. The WHATWG standard links its web-platform test suite. Chrome120 remains the browser floor. Do not implement a custom matching algorithm, translate to home-grown matching regexes, add a polyfill, or add a runtime dependency.

Considered picomatch: established, dependency-free, but file-glob defaults differ on slashes/dotfiles and expose extra glob syntax requiring restrictions. Native URLPattern directly models URL components and adds zero package weight. Considered raw URLPattern syntax: rejected because named groups and regex groups exceed the agreed simple wildcard language. A small input/escaping adapter around native URLPattern preserves the simple contract.

## Public configuration and API

GroupingRule = Readonly<{ pattern: string; group: string }>. No speculative per-rule IDs, colors or disabled flags; future tasks can extend the schema when those are needed.

compileGroupingRules(raw: unknown) returns either:
- { kind: 'ready'; rules: readonly GroupingRule[]; match(url: string): GroupingRule | undefined }
- { kind: 'invalid'; message: string; ruleIndex?: number }

The ready rules array and each rule are copied/frozen. match returns the first matching frozen rule or undefined. Matching malformed/unsupported candidates returns undefined without throwing. Compilation validates all rules atomically and returns no partial result.

## Pattern semantics

- Accept full patterns beginning http://, https://, or *:// (case-insensitive scheme); *:// means HTTP or HTTPS only. Require an authority and absolute path; a URL without a written path can normalize to /.
- Use the standard URL parser for protocol, hostname, numeric port and pathname canonicalization. Hostnames are case-normalized; pathname case and encoded delimiters remain significant.
- Only * is a wildcard, matching zero or more characters within its component, including slashes in pathname. Adjacent stars have the same semantics as one star. Other pattern/regex characters remain literal through URLPattern syntax escaping.
- Never pass user input directly as a native pattern string. Pass explicit component patterns to native URLPattern; escape native metacharacters other than *. Query/hash components are ignored, not interpreted as user pattern syntax.
- Reject any literal ? or # in configured patterns; encoded %3F/%23 in paths remain valid literals. Reject relative URLs, unsupported schemes, credentials, backslashes, control characters and leading/trailing whitespace with useful errors. Numeric ports are supported, wildcard ports are not.
- For *://, expand into HTTP and HTTPS canonical component patterns when compiling. This lets standard default-port normalization work correctly for both protocols. A missing/default port matches the default port only; an explicit non-default port matches only that port.
- /BarTab/* includes /BarTab/ and nested paths, but excludes slashless /BarTab. It has no implicit repository-root inclusion. *.example.com has no implicit bare-domain inclusion.
- Practical configuration limits: at most100 rules, pattern length1–2048 UTF-16 code units, group title1–80 UTF-16 code units with no surrounding whitespace or controls. Preserve rule order; do not sort or deduplicate. Pattern text/group labels remain as entered; canonicalization affects compiled matching only.

## Configuration migration

Current Config becomes Readonly<{ schemaVersion: 2; enabled: boolean; groupingRules: readonly GroupingRule[] }>.

Missing config returns disabled version2 with an empty rules array. A strictly valid version1 document migrates in memory to version2, retaining enabled and supplying empty rules. load must not write migrated data. Explicit save accepts validated version1/2 input and writes the canonical version2 result. Version2 requires all three known fields and validates groupingRules with the same engine contract. Unknown fields, invalid rules, malformed versions and future versions remain fail-closed and preserve the stored raw value. Existing repository caller/subscriber race guarantees must remain intact. No automatic migration writes or configuration-reset behavior.

## Integration and verification

The worker's consumer remains no-op. The options page remains read-only and can continue explaining that automatic organization is unfinished. Schema validation may use the engine compiler; config and rules must remain free of Chrome globals. Future preview/planning tasks call the same compiler and reuse it across match calls.

Tests cover exact/wildcard URLs; root versus /*; nested/dot paths; literal native group/regex metacharacters; overlaps and rule order; query/hash exclusion; encoded slash distinction; case; default/non-default ports; * scheme; hostname wildcards; supported IPv6 where applicable; invalid patterns/candidates; immutable outputs; bounds and no dependency addition. No custom comparator or fake matcher may stand in for native URLPattern in the matching tests.

Migration coverage proves strict v1 compatibility, no writes on load, canonical v2 saves, unchanged invalid/future stored bytes, immutable rules, and all existing ordering guarantees. Update old assertions to expect canonical v2 rather than weakening them. Browser regression should seed valid v2 rules, show healthy status, preserve the exact stored rules across reload and confirm no automatic grouping. Keep invalid/future preservation and worker restart smoke passing.

Run Node24 typecheck, full Vitest suite, build/package validation and isolated Chromium smoke. No new dependencies or permissions. Mark only Task001 complete after independent review; leave Tasks002–010 TODO and pause.

## Sources

- https://developer.chrome.com/docs/web-platform/urlpattern (Chrome95 availability, component patterns and avoiding a polyfill when native support exists)
- https://urlpattern.spec.whatwg.org/ (standard, escaping/canonicalization and linked web-platform tests)
- https://github.com/micromatch/picomatch (alternative considered)
