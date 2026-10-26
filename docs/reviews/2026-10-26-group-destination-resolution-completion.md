# Task 003 complete — group destination resolution

Completed locally on 2026-10-26 on branch `group-destination-resolution`. Implementation commit `historical-revision`; feature base `historical-revision`. Paused before Task 004. No merge, push or publication performed.

## Result

The new pure `planGroupDestination` resolves an exact configured title in the navigating tab's explicitly supplied own window/context. It prefers the tab's current matching group, otherwise the leftmost observed group with numeric ID as a deterministic tie. Pinned tabs and incoherent/stale observations are skipped. No live tab/group ID is persisted.

The opt-in `createGroupPlacementService` serializes through fresh observation and verification; its Chrome adapter groups an actual tab and names new groups. Results distinguish success, skip and read/group/title/verification failure, with original causes and explicit known/uncertain effects. A failed title update can leave an unnamed group; there is no blind rollback or mutation retry. The dedicated grouping queue must be distinct from the outer coordinator queue awaiting it.

Production navigation consumption remains a no-op. Loading `dist/` still shows the foundation status page; it will not automatically organize, move, replace or close tabs. This task provides callable, tested primitives for later placement work. No dependencies, permissions, schema, storage, matching engines or production entry wiring changed. Tasks 004–010 remain untouched TODO.

## Verification

Fresh independent controller verification on `historical-revision`:

| Check | Observed result |
| --- | --- |
| Node 24 TypeScript check | Passed, no diagnostics |
| Vitest | 560 tests across17 files passed |
| Build and package validation | Passed; exactly5 distribution files |
| Isolated Chromium suite | 17 passed (9 foundation +8 new group tests),8.6 seconds |
| Independent task review | Spec compliant, quality approved; no findings |
| Independent whole-feature review | Approved; no actionable findings |

The implementer recorded RED→GREEN for planner, service, adapter/boundary guards and a Unicode control-character regression before the final run. Real browser tests invoke actual new modules in temporary extension bundles; no test endpoint enters the distribution. Browser-owned checks include creation/naming/reuse, current-group/leftmost choice, literal/case titles, nonfocused-window isolation, last-member removal/stale group rejection, pinned preservation and real created membership after injected naming failure.

Tested Chromium **156.0.8078.4**. Incognito access capability was false in the isolated fixture: this is capability evidence, **not real incognito grouping coverage**. Actual normal/incognito grouping needs the documented disposable-profile check. Chrome120/current-stable release checks, hosted CI and scale/performance budgets remain unverified. Chrome may expand/reposition a group when an active tab joins; exact visibility/relative index is outside this primitive's promise. Browser observations are not transactions, and external actors, worker restart or another service instance can race them. Future execution must validate URL identities/navigation generations and placement before closure.

## Test it locally

Use Node24 in the repository:

```sh
cd <repository>
npm run typecheck
npm test
npm run build
npm run check:package
npm run test:browser
```

The available cached browser used during this delivery lives at `$TEMP_DIR/chromerehome-playwright`; set `PLAYWRIGHT_BROWSERS_PATH` to that directory when using it. Normal browser test setup can instead install the pinned Playwright Chromium with `npx playwright install chromium`. macOS sandboxed agent launches required scoped permission to start Chromium. Tests use disposable profiles.

Planner/service/adapter behavior is exercised by the tests. To inspect the production package, open `chrome://extensions`, enable Developer mode, Load unpacked and select the repository's `dist/` directory; Extension options opens its read-only status page. There is no product rule editor or automatic grouping to try yet.

## Rulings I made

1. Resolve exact titles in the navigating tab's own window; prefer its current group, then leftmost/numeric ID. This avoids surprising cross-window gathering. Changing this policy later requires planner/browser-test revision.
2. Create by grouping a real unpinned tab through an opt-in service, using fresh observations and explicit partial effects. Chrome cannot reserve empty groups or provide a transaction. Later execution must revalidate; failed naming may leave an unnamed group.
3. Use one retained service with a dedicated injected grouping queue, without persisted session IDs or global locks. This handles successful local concurrent creation. Other services/workers/external actors can still compete; future wiring must share this service and keep its queue distinct from an awaiting outer queue.

## Review scope dispositions

All declined-to-judge lines in the whole-feature review are resolved against documented task boundaries: unavailable live incognito coverage remains a manual check; release/browser matrices belong to Task010; URL generations/selection/relative placement/closure belong to Tasks004–006; recovery/global coordination is not claimed; Chrome owns expansion/repositioning; the package scanner is a focused project guard, not a JavaScript security sandbox. None is claimed as verified by passing pure tests.

[Task review](2026-10-26-group-destination-resolution-task-review.md) · [Whole-feature review](2026-10-26-group-destination-resolution-review.md)
