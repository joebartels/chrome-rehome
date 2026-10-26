# Task005 complete — replacement planning and placement

Completed locally2026-10-26 on `replacement-planning-placement`. Feature base `historical-revision`; implementation `historical-revision`; readability cleanup/final code `historical-revision`. Paused before Task006. No merge, push or publication.

## What you can try now

The real production extension now places the eligible incoming tab. A configured group wins in the incoming window; otherwise an equivalent older tab supplies its window/group and immediately-following position. Grouping works without any duplicate. The same tab is moved, preserving history. **Every original tab stays open: duplicate closure is not implemented.** Default configuration stays disabled; settings are manual until Task007.

### Load or reload in Chrome

The build is ready; no build step is needed to try this delivery.

1. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `<repository>/dist`.
2. If that folder is already installed, press its **Reload** button instead of adding a second copy. A ZIP of the same five-file build is also supplied; extract it and load its folder if preferred.
3. Open the extension's **service worker** inspection link to its DevTools Console. Existing saved configuration is preserved by reload; the following example replaces it, so keep the exported backup.

### Back up and enable the example

Run in the extension worker Console:

```js
const backup = (await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig;
copy(JSON.stringify({present: backup !== undefined, value: backup}));
await chrome.storage.local.set({chromeReHomeConfig: {
  schemaVersion: 3,
  enabled: true,
  groupingRules: [{pattern: 'https://example.com/*', group: 'Trial'}],
  duplicateRules: []
}});
```

The `copy()` line puts the backup wrapper on your clipboard. Paste it into a saved file before copying something else or closing DevTools. Extension options should say **Automatic placement is enabled. Tabs are never closed. Rule editing is not available yet.**

Open a fresh tab to `https://example.com/`, then another fresh tab to the same URL (or navigate via ordinary clicked links). Eligible navigation should put the incoming tabs into a **Trial** group in their own window, and both tabs remain open. Reloading an existing tab does not create a new winner under the navigation policy. Back should retain the moved tab's history when it arrived through a link from another page.

To try duplicate inheritance, set `groupingRules: []` in the same schema3 configuration and keep enabled:true. Keep an older target tab grouped or ungrouped, then navigate another tab to that URL. It should land immediately after the selected older tab, inheriting its window/group. Repeat in a second normal window; if the source had only the winner, Chrome can close that emptied window. Add the Trial rule again to verify that configured grouping keeps the incoming window instead of visiting a duplicate in another window.

### Pause and restore

Pause while keeping rules:

```js
const {chromeReHomeConfig: current} = await chrome.storage.local.get('chromeReHomeConfig');
await chrome.storage.local.set({chromeReHomeConfig: {...current, enabled: false}});
```

Options should show disabled, and subsequent navigation should not place. You can also disable the extension on `chrome://extensions`.

Restore during the same Console session:

```js
if (backup === undefined) await chrome.storage.local.remove('chromeReHomeConfig');
else await chrome.storage.local.set({chromeReHomeConfig: backup});
```

After closing/reopening DevTools, use the exported wrapper: restore its value if present:true; otherwise remove only the chromeReHomeConfig key. Do not clear unrelated storage. Keep only one enabled copy of this trial extension. Pinned tabs and known shared-group participants are skipped.

## Verification

Fresh independent controller verification on final code `historical-revision`:

| Check | Observed result |
| --- | --- |
| Node24 TypeScript check | Passed, no diagnostics |
| Vitest | **687 tests across22 files passed**,1.60s |
| Build/package validation | Passed, exactly5 distribution files |
| Isolated Chromium | **27 passed**,18.3s;0 unexpected/skipped/flaky |
| Independent task review | Approved; Minor readability feedback |
| Readability cleanup | Identical compiled JavaScript;41 focused tests/typecheck; included in final review |
| Independent whole-feature review | Approved for explicit005 trial; no remaining findings |

Six new browser cases load the actual production dist and enable its public schema3 configuration; they do not replace its worker or fabricate navigation events. They cover grouping-only/disable/history, both same-window index directions, grouped and ungrouped distinct-window inheritance, lone source group/window removal and a configured incoming-window override with a genuinely inactive background winner. They assert exact retained original tab IDs and winner Back history. Existing21 browser cases also pass.

Self-review caught an important harness flaw: early supposedly cross-window setup used tabs.group without an explicit creation window, which moved its source into the options window. Those early6/full27 greens are not cross-window evidence. The corrected fixture supplies explicit window IDs and asserts distinct source/anchor windows before navigating. Corrected native JSON and the fresh controller27 gate establish the reported cross-window behavior. No production algorithm adjustment was needed.

Tested Chromium **156.0.8078.4**. Native collapsed targets expanded, an emptied source window/group disappeared, and the override winner stayed inactive. Headless windows can both report focused:true, so focus preservation is not claimed. The extension never explicitly requests focus/active/highlight/collapse changes.

Run locally with Node24:

```sh
cd <repository>
npm run typecheck
npm test
npm run build
npm run check:package
npm run test:browser
```

Delivery used cached Node24 `node` directly with TypeScript/Vitest/build/check scripts. Playwright used `$TEMP_DIR/chromerehome-playwright`, cleared FORCE_COLOR/NO_COLOR, and scoped launch permission for disposable Chromium profiles/local HTTP servers. No dependency installation or personal Chrome settings change occurred.

## Implementation and limits

Pure matching, selection and final destination remain separate from native execution. One coordinator queue owns operations; the executor never nests into it. Repository revision leases become unavailable as soon as a newer load/save begins. Config/event/view checks, bracketed native snapshots and actual document checks surround every await. Only winner and used inherited anchor frame evidence is fetched per round; passive/overridden duplicate documents are not invented or read unnecessarily. Original failure causes and uncertain/acknowledged/verified effects remain available in memory; diagnostics contain only redacted codes.

Known004 ambiguity remains: Chrome can report a script navigation as ordinary eligible link, including after restart. This trial deliberately requires explicit enablement and does not close tabs. Unrelated navigation can conservatively cancel work. A stale guard or failed API call can leave partial placement; there is no rollback or crash recovery. Native APIs cannot make the final check-to-call interval atomic. Task006 must collect fresh evidence for every duplicate and add recovery/closure together.

Actual mouse-drag rejection, extension-enabled incognito, Chrome120 and current-stable release compatibility remain manual checks. Simulated drag/title failures are labeled as such. Rule editing, protection controls, default activation and performance/release budgets remain later work. No tab creation/removal API, journal, editor, schema/dependency/permission change ships here. Tasks006–010 remain untouched TODO.

## Rulings I made

1. Connect opted-in placement using existing schema3 enabled, defaultdisabled; manual backup/configuration/pause/restore and truthful status only. This makes005 testable without building007. The trial retains004's script-link ambiguity and lacks later everyday controls.
2. Configured own-window grouping overrides inherited after-anchor membership/location; request no focus/active/collapse changes. This resolves the destination first and preserves tab history. Chrome may expand groups/select tabs/close emptied source windows; a different focus policy needs new native tests.
3. Keep one queue and immutable destination, phase guards, native URL/document evidence, original causes/effects, and no retry/rollback. Read only winner+used anchor frames. Invalidation can leave partial placement, native races remain, and006 must collect closure evidence for passive duplicates.
4. Skip pinned/pending/blocked/non-normal/cross-context and known shared source/anchor/destination groups; preserve optional shared metadata. This avoids knowingly changing shared URL membership. Those groups will not organize here; absent metadata stays Chrome120-compatible.

## Review scope dispositions

All six declined-to-judge boundaries follow the adopted trial contract: actual drag/incognito/release contexts remain manual; native focus/collapse side effects are accepted; universal intent/restore detection is not claimed; atomicity/rollback/recovery/closure are outside005; editor/controls/default activation are later tasks; unrelated changes may conservatively cancel placement. None is mislabeled complete by passing synthetic tests.

[Task review](2026-10-26-replacement-placement-task-review.md) · [Whole-feature review](2026-10-26-replacement-placement-review.md)
