# External-app link compatibility — 2026-10-27

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Status: complete and locally verified on 2026-10-27. Paused before Task 007.

## Outcome

External-app HTTP(S) opens now enter the existing replacement pipeline, including after worker suspension. The new surviving tab is grouped by configured rules and older eligible duplicates close only after Task 006 document/snapshot checks and verified placement. The production change is exactly the admitted/known transition sets in `src/background/navigation.ts`; no execution, recovery, permission, schema, dependency, default-enablement or UI change.

## Metadata confirmed before fixing

Seven actual macOS LaunchServices opens into a unique cloned testing app/profile emitted active outermost frame0 `start_page` commits, rejected by the baseline tracker. HTTP, HTTPS, four redirect directions and a stopped-worker case were observed. Commit snapshots had no pendingUrl and matched actual document ID/URL/lifecycle, locating the failure before the consumer. A page-link control emitted admitted `link`; the CDP typed control is not trusted omnibox evidence. Configured startup pages also emitted `start_page` with indistinguishable admission fields.

The production baseline regression opened a distinct external HTTPS tab but observed `grouped:false` and `oldClosed:false`. The same native path passed after the minimal policy correction. HTTP/HTTPS duplicate equivalence was not broadened; redirects compare the final committed identity.

## Verification and reviews

- Final controller fresh full portable run: **889 tests across 27 files**; typecheck/build/package and complete-feature whitespace checks passed.
- Controller full browser run: **99 passed**, zero skipped, unexpected or flaky; Chrome for Testing 156.0.8078.4 on macOS. The five affected native cases passed again after test-only cleanup.
- Native production cases: warm HTTP, warm HTTPS, HTTP→HTTPS final identity, stopped-worker HTTPS and disabled HTTPS control. Enabled cases retain a distinct new ID in named group External, remove exactly the old ID and preserve unrelated IDs. The stopped case observes running→stopped→running with OS open before any worker evaluation. The disabled control retains both IDs.
- Final harness cleanup verification: five fault-injection regressions failed before correction and passed afterward; all 889 portable tests and all five native external cases pass. Native JSON records the externally opened page at the exact final URL with readyState complete. Disabled retention is a bounded native observation after load; portable guards supply deterministic queue evidence.
- Exactly five dist files; controller verified all five SHA-256 hashes remain byte-identical after the test-only cleanup.

[Task review](2026-10-27-external-app-links-task-review.md) and [whole-feature review](2026-10-27-external-app-links-review.md) found no Critical or Important production issue. Three Minor test findings were addressed together: complete owned-resource cleanup after errors, EOF whitespace and waiting for the disabled externally opened page's final URL/load before retention checks. [Scoped cleanup review](2026-10-27-external-app-links-cleanup-review.md) confirms all three findings addressed with no new breakage; no review finding remains open. Metadata and real production behavior evidence are separate; no synthetic CDP navigation is claimed as an external OS open.

## Try it in Chrome

Use a disposable profile. Preserve/export configuration and pause before upgrading, following the [README controlled trial](../../users/getting-started.md). Load or reload `<repository>/dist` in chrome://extensions, then enable your Trial configuration.

1. Keep one tab open at the exact full URL `https://example.com/` in the same Chrome profile where this extension is installed and enabled.
2. Click that exact URL from iTerm (the reported source application) or another application outside Chrome. The new tab should join Trial; the older duplicate should close. The new ID and navigation history survive.
3. Close worker DevTools and repeat after the extension worker becomes inactive; external navigation should wake it and follow the same pipeline.
4. Pause enabled:false or disable the extension and repeat: both tabs should remain and no grouping should occur.

The sample grouping rule is HTTPS-specific. For HTTP grouping too, an explicit `*://example.com/*` pattern covers both schemes. Duplicate identity still distinguishes HTTP from HTTPS unless a real redirect ends at the same final URL. Do not silently overwrite existing configuration; keep the exported backup.

## Ruling and tradeoff

Admit valid active start_page navigation through the same existing guards because native external-app and configured-startup opens share that category — required external-app grouping/closure cannot rely on a nonexistent origin discriminator — cost if wrong: configured startup/command-line pages can also group or replace duplicates when enabled; core reload stays excluded and this remains a documented default-disabled trial.

## Evidence boundaries

The user confirmed iTerm as the source app and `https://example.com` as the input URL after implementation. Verified native routing is macOS LaunchServices into the isolated bundled testing browser; no personal iTerm/Chrome profile was driven. Ensure the actual external link reaches the profile with the extension installed. Native restore/reopen committed events and a whole-browser cold/restored-session matrix were not captured; core reload remains excluded, but unit/official semantics are not native restore proof. Configured startup/command-line grouping is a documented policy consequence, not a complete native startup matrix. Non-macOS native routing and Chrome 120/current-stable release coverage remain unverified; non-macOS explicitly skips these native cases. Trusted omnibox automation did not navigate, although the user reported manual typed navigation working. Production tests cover direct HTTP/HTTPS and one cross-scheme redirect; observer metadata covers four directions. Existing conservative prerender/canceled/cold-SPA behavior and broader Task 006 manual limits remain. Unsaved-form protection and default activation are later work.

## Saved work

Local branch external-app-links; implementation historical-revision, test-only cleanup `historical-revision`; completion documentation is committed separately. No push or merge. Task 006a is complete; Tasks 007–010 remain TODO. See the [design](../superpowers/specs/2026-10-27-external-app-links-design.md), [plan](../superpowers/plans/2026-10-27-external-app-links.md), [native metadata findings](2026-10-27-external-app-links-metadata.md) and task record (GitHub issue #7; historical task 006a).

Detailed investigation scripts, raw metadata, native RED/GREEN evidence, verification logs and review packages are archived in `EXTERNAL_EVIDENCE/external-app-links-verification-evidence`.
