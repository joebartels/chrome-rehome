# 006a: External-app link compatibility

Status: complete — implemented and locally verified on 2026-10-27. Paused before Task 007.

Depends on: 004, 006

## Decision

Actual macOS LaunchServices opens into isolated bundled Chromium reported active main-frame `start_page` commits. The original rejection prevented both grouping and replacement. Admit valid `start_page` through the existing tracker by changing only its transition set. No runtime heuristic distinguishes external opens from configured startup or command-line pages; those valid commits also qualify. This compatibility expansion does not prove external origin or user intent.

Core reload remains rejected, including address-bar and forward/back qualifiers. Server redirects use the actual final committed URL and preserve scheme identity. Qualified client redirects require existing trusted provenance; cold history/fragment events cannot establish it, and reload revokes it. Unknown/missing metadata, invalid document/lifecycle/qualifiers, pending navigation, configuration, recovery readiness, document validation, stale snapshots, journals and per-closure guards retain their existing authority.

## Evidence and verification

See the [design](../../superpowers/specs/2026-10-27-external-app-links-design.md) and [native metadata record](../../reviews/2026-10-27-external-app-links-metadata.md). The metadata observer is separate from production behavior tests. Native restore/reopen commits were not captured; configured startup metadata is indistinguishable, not a restore proof.

The native regression uses full-path `/usr/bin/open -a` with a unique `CFBundleIdentifier` on a helper-owned clone of the cached bundled Chromium app and an explicit random disposable profile. It never opens installed Chrome or a default URL handler. Untouched production `dist` is loaded; options-context storage uses the existing local schema3 configuration. No fixture enters `dist`.

Before the production change, warm native HTTPS produced a distinct external tab but left it ungrouped and the older duplicate open. After the change, warm HTTP, warm HTTPS, HTTP→HTTPS final identity and confirmed stopped-worker HTTPS group the new survivor in `External` and close exactly its older duplicate. The real disabled native control retains both ungrouped tabs. Non-macOS explicitly skips native coverage; synthetic events do not replace it.

Portable regressions cover cold admission, final identity, provenance, reload revocation, initialization/recovery readiness, disabled/unavailable config and stale-snapshot cancellation. Full gate commands, counts, versions, cleanup and remaining limitations belong in the implementation report and controller completion record after review.

## Boundary

No new permissions, dependencies, schema, timer, keepalive, UI, recovery behavior or placement behavior. Task 006 guarantees remain unchanged. Independent task/whole-feature reviews and the scoped test-cleanup review are complete; no finding remains open.

## Completion

Delegated implementation, independent task/whole-feature review, consolidated test cleanup and scoped re-review are complete. No finding remains open. Final verification: 889 portable tests, 99 full browser cases with no skips, five affected native cases rechecked after cleanup, typecheck/build/package/range-whitespace gates and exact five-file production package hash equality. Metadata was confirmed before the admission fix; native production RED then GREEN proves grouping and exact old-ID closure. See [completion and Chrome instructions](../../reviews/2026-10-27-external-app-links-completion.md). Paused before Task 007.
