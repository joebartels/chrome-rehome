# Foreground fixture gate diagnosis — 008a

Read-only investigation of saved full-run evidence and source; no app, build, test, browser, or Git-state mutations performed.
Repository: `<repository>`.
Evidence root: `.superpowers/sdd/2026-10-28-tab-context-protection/browser-full-results/`.

## Finding

The immediate cause is proven: both failed trials reached the producer with native attention reporting **no focused normal window**. The unchanged planner therefore selected `preserve`, making the requested activate gate unreachable. Why native focus changed after the precondition snapshot is **not proven**. This is neither evidence of a new production defect nor sufficient evidence to dismiss the failures as baseline flakiness.

## Actual evidence

- `browser-full.log` records 155 tests, 153 passes and two failures, with one worker and zero retries configured.
- `replacement-recovery-nativ-38f15-ays-presentation-or-removal/foreground-gate-failure.json`: phase `settled:activate:4`.
- `replacement-recovery-nativ-c639d-ays-presentation-or-removal/foreground-gate-failure.json`: phase `presentation:native-fulfilled:activate`.
- Both fail at the `reached()` token poll, before worker termination/restart assertions execute. They do not demonstrate a recovery replay failure.
- Both matching `foreground-preconditions.json` files show the source as the sole focused window, winner as its active tab, inactive source spare present, and no journal.
- Each failure has exactly one recorded attention read: `focusedWindowId: null`; source winner and destination passive duplicate remain the active tabs.
- In each observation sequence, an earlier unrelated zero-mutation operation completes; the next operation includes the winner plus both duplicate documents and runs ungroup(1), move(2), group(3), placed, remove(4), remove(5), completed. No activate/focus write or call occurs.
- The main operation IDs are `cafcba80-93f3-4cc5-8870-a0070ba5e137` and `b34f080f-e1fb-4672-a686-4141eaed0d75` respectively.
- Final snapshots show both duplicates gone, both normal windows unfocused, winner inactive in destination, source spare active; `FixtureDone` exists and requested `FixtureControl` remains armed. This is completed ordinary replacement, not a hung mutation.
- All six other native foreground termination phases in the same run passed; their precondition layouts match the failures, and their saved journals show the requested activate/focus phases with duplicates still present.

## Causal source path

- `replacement-recovery.spec.ts:56–66` launches the headed isolated context and activates its exact browser PID once, before creating options and scenario tabs.
- `owned-browser-focus.ts` checks the actual AppKit frontmost PID at that launch point. The log confirms success for failed-case PIDs 97845 and 97974; it does not record the frontmost PID at navigation/admission.
- `replacement-recovery.spec.ts:478–493` builds the cross-window scenario, creates an inactive spare, explicitly selects the winner and focuses its source via Chrome APIs, waits for spare completion, arms the fixture, snapshots windows, writes evidence, asserts source/winner selection, then clicks the real link.
- The existing traces make the timing bounded: first precondition call ends at 185348.278 ms and click starts at 185349.808 ms; second ends at 198400.016 ms and click starts at 198402.248 ms. There is no large observed attachment-writing delay to blame.
- Clicks finish at 185397.299 ms / 198463.689 ms; both navigate to `/target`. Trace data contains no native OS-focus event stream or identification of the application/window taking focus.
- `replacement-recovery-fixture.ts:57–59` opts into the actual `native.readPresentation()` when `presentation:true`; it records the real result without substituting focus.
- `src/browser/placement.ts:15–39` reads `chrome.windows.getAll({populate:true,windowTypes:['normal']})`; null means no returned normal window has `focused:true`, not a thrown read or malformed attention.
- `src/background/placement.ts:30–37` captures initial snapshot/selection then calls `planPresentation` with that native attention.
- `src/planning/presentation.ts:23–28` returns `preserve` unless the focused window is the source and winner is its selected tab. Null alone rules out foreground for both cases.
- `src/execution/placement.ts:271–275` only performs activate/focus for foreground plans. The observed placement/removal sequence follows the preserve branch, so increasing the gate timeout cannot make these already-completed operations reach activate.

## Changed control/readiness risk

The fixture rebuilds its own worker entry over copied dist. It instantiates coordinator/config/recovery directly without a control service and never imports production `background/index.ts` or registers native menus. Coordinator's controls import is type-only. Consequently the new `setNativeTabProtected` / `whenReady` path cannot be an executed worker cause in these cases.
`git diff --quiet historical-revision..historical-revision` returned 0 for the recovery spec/fixture, owned-focus helper, coordinator, placement consumer/adapter, presentation planner/receipt, placement executor and Playwright config. Changes include the copied manifest's new contextMenus permission; no evidence links that permission to these focus losses. Do not claim an identical entire package/environment baseline.

## What remains unproven

The artifacts do not distinguish external application activation, screen/session transitions, Chromium native focus behavior during the click, or another host event. No causal attribution to another agent/application is supported. The producer attention record is untimestamped and contains no event/document attribution beyond adjacent journal records; source flow establishes the preserve consequence, not the precise focus-loss instant.
The completed008 record documents 151/151 passing on production070a9f8/test-only595db69. The historical007b timeout is not a reproduction or explanation of this run. Those records cannot establish current baseline behavior under matched host conditions.

## Minimal next verification, only by the exclusive native owner

1. Preserve these artifacts; do not regenerate them. Run only the two failed phase cases when the native lane is available, on the current revision with ordinary native attention unchanged.
2. Add diagnostic-only evidence spanning the boundary: actual owned/browser frontmost PID immediately before trigger and at failure, Chrome focus-change events, timestamped native attention reads tied to winner/event/document and journal operation, and resulting presentation kind. Use observed-state readiness, never fixed delays or fake focus.
3. If classification still becomes preserve despite the initial native foreground assertion, report that as a setup/attention-contract failure immediately instead of waiting for an impossible gate. This improves diagnosis; it must not turn such a case into a pass or retry it silently.
4. If attribution to008a is still needed, run the same two cases once on the known completed008 baseline with the same diagnostic observer, browser/runtime, native lane ownership and host conditions; record exact revisions/package identity. A pass on either side alone does not prove intermittency resolved.
5. Only after the actual focus-loss boundary is identified should setup be repaired. The evidence supports strengthening causal precondition observation; it does not yet support a particular native focus intervention.

Preserve real OS focus, real document/provenance and exact removal/recovery assertions. No production workaround, focus override, timer, extra retry, broad suite rerun, or weakened assertion is justified by this investigation.
