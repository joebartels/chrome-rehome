# External-app navigation compatibility design

Design grounded in the [native metadata findings](../../reviews/2026-10-27-external-app-links-metadata.md); limited correction after Task 006, before Task 007. The controller adopted the policy expansion after native metadata confirmation. Desired result: external OS-launched URLs group and replace eligible duplicates through the full existing execution path, including after worker suspension.

## Approaches and ruling

1. Keep rejecting `start_page`: preserves the old conservative boundary but demonstrably breaks the critical external-launch flow.
2. Infer external origin from timers, startup state, newly created tabs or opener: native data does not establish a reliable distinction and cold-worker/startup races add false exclusions.
3. **Adopt:** admit valid active `start_page` through the same tracker and all existing Task 006 guards. Configured startup/command-line URLs sharing this metadata may also group and replace duplicates. This is a documented compatibility policy, not a claim of proven user intent.

## Scope and invariants

- Node 24.x; minimum Chrome 120; existing TypeScript/MV3 toolchain and dependencies only.
- No production permissions, content scripts, worker keepalive, timers, schema, storage, UI or Task 007 features.
- Keep the sole queue, recovery readiness, configuration revision, event generation, view revision, document validation, pending URL exclusion, pin/context checks, removal leases, journal durability and per-closure stale checks unchanged.
- Core `reload` remains rejected, including address-bar and forward/back qualifiers, and cannot establish same-document/client-redirect provenance.
- Unknown/missing metadata, unsupported/nonactive lifecycle, subframes and unsafe URLs retain existing rejection/invalidation behavior.
- `start_page` server redirects qualify only at the final valid committed URL. Client redirects retain the existing trusted-provenance requirement. History/fragment events still require a prior admitted same-document commit in the current worker; a cold `start_page` same-document event cannot bootstrap itself.
- Disabled/unavailable configuration and blocked recovery produce no mutations. No fallback that groups but silently omits required safe duplicate closure.

## Implementation boundary

Change only the admission policy in `src/background/navigation.ts`: include `start_page` in the admitted transition set. Keep `createNavigationTracker().observe(input: NavigationInput): Navigation | undefined` and all public/internal contracts unchanged. Tests and policy docs should carry the compatibility tradeoff. No production change is justified in placement or recovery by this investigation.

## Verification

Portable tests pin valid `start_page`, redirects, cold worker provenance, reload exclusion and existing guards. A durable macOS-only real LaunchServices test uses a uniquely identified cloned bundled Chromium app plus random disposable profile, loads real `dist`, enables a local rule through the existing options flow and asserts that external launch both groups the new surviving tab and closes its older same-identity duplicate. Repeat after stopping the extension worker. Include HTTP, HTTPS and a cross-scheme redirect to a seeded final identity; do not fake external events or label CDP navigation as external launch.

Observer metadata and production behavior tests are separate: the observer never mutates tabs; production runs exercise the real package. Platforms unable to execute macOS LaunchServices explicitly skip that native test and do not count it as exercised coverage. Retain the startup/restore evidence gap in the completion record; official reload semantics plus regression tests do not become claimed native restore proof.
