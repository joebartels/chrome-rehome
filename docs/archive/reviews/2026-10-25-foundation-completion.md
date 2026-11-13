# ChromeReHome foundation completion

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Completed: 2026-10-25. Paused before feature work at the user's request.

The foundation is implemented in `<repository>` on the local `foundation` branch. No push, merge, publication or feature-backlog implementation was performed.

## Delivered

- Strict TypeScript/Node24 development tooling and locked development dependencies.
- Validated, versioned, fail-closed configuration and Chrome storage adapter.
- Serial operation queue, bounded private diagnostics, navigation generations and read-only browser snapshots.
- Synchronous worker listeners, shared startup coordination, stale-work guards and separate read-only options UI.
- Deterministic five-file ManifestV3 package, boundary/package-policy checks and GitHub Actions configuration.
- Ten feature TODO documents with dependencies, integration points and acceptance criteria.

This foundation has a no-op production consumer. It does not yet match duplicate URLs, move/group tabs or close duplicates.

## Fresh verification

Verified by the controller under Node24.22.1 on implementation head `historical-revision`:

| Check | Result |
|---|---|
| TypeScript typecheck | Pass |
| Unit/integration tests | 159 passed across 12 files |
| Build | Pass |
| Package checks | Pass |
| Isolated bundled-Chromium smoke | 3 passed |
| Feature backlog | All 10 still TODO; contents unchanged from baseline |

The browser checks verify load/options status, preserved tab/group placement with enabled config, exact preservation of invalid/future stored config, forced worker stop and fresh-realm revival, and listener presence. Per-task independent reviews and the final whole-foundation review are clear. The initial settings review found two concurrency defects; both were fixed with failing regression tests before approval.

## Material limits

Hosted CI has not run. Actual Chrome120/current-stable compatibility, natural idle-shutdown timing and 20/200/1000-tab performance measurements remain release work. Bundled Chromium156 smoke does not establish those results. No browser-visible effect proves no-op consumer dispatch; integration tests establish dispatch separately.

## Use the foundation package

Unzip `ChromeReHome-foundation.zip` into its own folder. In Chrome open `chrome://extensions`, enable Developer mode, choose Load unpacked and select that folder. The options page describes the foundation's intentionally unfinished organization behavior. The repository's built package is also in `dist/`.

## Rulings I made

1. Used an in-place `foundation` branch instead of a worktree because the repository had no initial commit. Cost if wrong: change checkout isolation later.
2. Created a documentation-only baseline commit so independent review had a concrete starting revision. Cost if wrong: one extra local commit.
3. Added `coordinator.initialize(): Promise<void>` to the planned interface so lifecycle handlers can await shared initialization. Cost if wrong: a small API revision.
