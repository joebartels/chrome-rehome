# ChromeReHome

**Upgrading from a Task005-or-earlier placement-only build? Pause processing before reloading: this build can close verified duplicate tabs. An already-enabled Task006/007a controlled trial may reload with activation preserved to try Task007b. Fresh or disabled installations remain disabled; use the controlled trial setup below to explicitly activate when needed.**

Chrome Manifest V3 extension for an explicitly enabled replacement trial. Eligible navigation places the existing winning tab, preserves its ID/history, then sequentially closes older duplicates only after independent document checks and verified placement. An existing eligible duplicate supplies the group/window and position, preserving manual organization even when a grouping rule disagrees. With no duplicate, grouping rules reuse an existing exact-title group across normal windows in the same browsing context, creating one only when none exists. Foreground opens select the incoming tab and focus its destination window; deliberate background opens stay in the background. Configuration defaults to disabled; an already-enabled Task005 installation activates closure when this build loads. The options page edits ordered grouping and duplicate-equivalence rules and previews draft matches before saving. Task005's retain-all placement behavior is the previous phase; its historical evidence remains in the task/review documents.

Interrupted operations can pause all automatic processing. A small session journal records settlement, never a replayable plan. Pending native calls, malformed/future records or failed journal storage quarantine work; toggling configuration, waiting or restarting the worker cannot establish settlement. A full browser restart is the reliable user-controlled reset for an ambiguous native call, followed by a fresh explicit trial. Extension disable/reload/update can also clear session storage, but does not prove an outstanding native call settled. Never erase the journal to force continuation.

The trial has no unsaved-form protection and no transaction guarantee. Chrome has no atomic compare-document-and-close API; navigation can race the final check. Native calls are never retried, rolled back or released from the queue by a timeout. Previously verified removals remain removed if later work stops. At most 100 participants (winner plus 99 older duplicates) are allowed; larger selections skip all placement/closure without truncation. Missing evidence for an unused passive duplicate retains all duplicates while otherwise-valid inherited placement can proceed; missing required anchor evidence prevents placement. Use a disposable profile.
## Develop and load

Use Node 24 LTS and npm. The declared browser floor is Chrome 120; release validation against Chrome 120 and current stable is still required. No UI framework is used.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run check:package
npx playwright install chromium
npm run test:browser
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this repository's `dist/` folder. Open the extension's **Details → Extension options** to edit rules and preview matching. Reload the extension after rebuilding. Do not load the source tree. The options page opens in a tab; there is no action popup.

The build targets `chrome120`, bundles the worker and options independently, removes stale output, and emits exactly five files in `dist/`. Its dependency graph is stored outside the package at `.build/metafile.json`. Distribute only `dist/` after package verification; source maps, tests, tooling and graph metadata are excluded. Package checks enforce the permission/entry/file allowlist, local code loading, source ownership and separate bundle graphs.

Browser smoke tests use Playwright's bundled Chromium, isolated temporary profiles, test-only CDP, and routed HTTP/HTTPS fixture pages. They load the actual package, inspect options, preserve legacy and canonical grouping and duplicate rules and seeded tab/group membership, force worker termination and observe revival. Temporary test-only bundles of the actual compilers verify native Chromium matching and duplicate identity against shared Node/Chromium cases; these fixtures are excluded from `dist/`. They never use your browser profile. Install Linux browser dependencies with `npx playwright install --with-deps chromium`. `PLAYWRIGHT_BROWSERS_PATH` may point to a download cache outside the repository. Failure traces are in `test-results/`; inspect with `npx playwright show-trace <trace.zip>`.

## Configuration and permissions

`storage.local.chromeReHomeConfig` holds canonical version 4 configuration: `{ "schemaVersion": 4, "enabled": false, "groupingRules": [], "duplicateRules": [] }`. Each saved rule has a required boolean `enabled`. Missing configuration uses this disabled default without writing it. Strict versions 1–3 migrate in memory, preserving activation, rule order and values; legacy rules become enabled. Loads never write. Explicit saves write one validated version 4 document. Invalid and future-version data remain unchanged and produce an options error; processing stays unavailable. Valid changes propagate through `storage.onChanged`. Configurations, rule arrays, records and ignored-name arrays are copied/frozen. The global enabled field activates guarded placement and duplicate closure; this editor preserves its current value. Task 008 will add activation/pause and protection controls.

Open **Extension options** to add, edit, move, disable or delete rules. Grouping is first active match wins. Duplicate policies use exact unique origins, so their displayed order does not set precedence. A disabled rule remains saved and must still be valid. Disabling a duplicate policy restores conservative URL comparison for that origin; it does not disable duplicate detection. Use **Save settings** to apply the whole draft, or **Reload saved settings** to discard it after a successful read. Save failures retain the draft for retry. Observed external changes preserve a dirty draft and report a conflict. Chrome storage has no compare-and-swap, so simultaneous writes can still race despite pre-save refresh and post-save verification.

The matching preview evaluates draft rules even when automatic replacement is disabled. Paste a **URL to preview** to see the first matching grouping rule and active duplicate policy; optionally enter **Compare with URL** to compare duplicate equivalence in the same normal browsing context. The grouping result is a rule match, not a prediction of actual placement: an existing duplicate’s location takes priority. Matching the same group does not make two URLs duplicates. Preview text stays in page memory and does not write settings, query or mutate tabs/groups, log URLs or make requests. Fix invalid rows before previewing; query and fragment syntax remain unsupported in grouping patterns.

`compileGroupingRules(raw)` in `src/rules/grouping.ts` validates ordered `{ pattern, group, enabled? }` rules and returns either `{ kind: 'ready', rules, match(url) }` or `{ kind: 'invalid', message, ruleIndex? }` (zero-based index). Reuse the compiled result across calls; `match` returns the first active matching frozen rule or `undefined`. Validation is atomic. Native `URLPattern` performs matching with explicit URL components and escaped literal syntax; no matcher dependency or runtime polyfill is used. Node 24 and the declared Chrome 120 floor provide this API.

Only `*` is a wildcard. Use `http://`, `https://`, or `*://` (HTTP and HTTPS), a hostname, optional numeric port, and path. Candidate query strings/fragments are ignored; literal `?` or `#` in patterns is rejected. URL parsing normalizes host case, Unicode and default ports while preserving path case and encoded slash boundaries. A missing/default port matches the scheme's default only; `:8080` matches only that port. `*://` compiles separate HTTP/HTTPS alternatives so explicit `:80` and `:443` retain their meanings. Credentials, backslashes, surrounding whitespace, controls, unsupported schemes and malformed URLs are rejected as patterns. Malformed or unsupported candidates never match.

Examples: `https://github.com/example-org/sample/*` matches `/BarTab/` and nested paths, including query/hash variants, but excludes slashless `/BarTab`. `https://*.example.com/*` matches subdomains without implicitly including `example.com`. `https://example.com/:id` and `https://example.com/(a|b)` match those literal paths. Adjacent stars behave as one star; path stars can span slashes. Encoded `%3F`/`%23` remain valid path literals. Limits are 100 rules, 1–2048 UTF-16 code units per pattern and 1–80 per group title; titles also reject surrounding whitespace and controls. The production consumer compiles captured rules for placement; the options preview reuses this compiler.

`compileDuplicateRules(raw)` in `src/rules/duplicates.ts` returns `{ kind: 'ready', rules, match(candidate), identify(candidate), equivalent(left, right) }` or `{ kind: 'invalid', message, ruleIndex? }`. A candidate is `{ url, incognito }`, with an explicit boolean browsing context. HTTP(S) candidates use native `URL.href` as the conservative identity: queries, repeated-value order, raw escaping, fragments (including hash routes), path case, empty markers and trailing slashes remain significant. Standard URL canonicalization still applies, including host case and default ports. Malformed/unsupported URLs, whitespace, controls, backslashes, missing authority and nonempty credentials have no identity; invalid candidates never match each other.

A duplicate rule contains `{ origin, ignoreQueryParameters, ignoreFragment, ignoreTrailingSlash, sortQueryParameters }`, optionally with boolean `enabled` for direct compiler callers; canonical stored version 4 requires it. Disabled entries are validated and preserved but excluded from matching. `match(candidate)` returns the active policy or undefined. All flags are required booleans and default policies are conservative (no implicit tracking list). `origin` is an exact HTTP(S) origin, optionally ending in `/`; paths, queries, fragments, credentials and wildcards are rejected. Canonically duplicate origins are rejected. Scheme, nondefault port and subdomain boundaries are independent. For example, `{ "origin": "https://example.test", "ignoreQueryParameters": ["utm_source"], "ignoreFragment": false, "ignoreTrailingSlash": false, "sortQueryParameters": true }` ignores all occurrences of the exact decoded case-sensitive tracking name and sorts decoded query names stably, preserving equal-name value order. Fragment removal and removal of all trailing path slashes (except root `/`) require separate flags. Limits are 100 rules, 1–2048 UTF-16 code units per origin and 100 distinct ignored names of 1–256 code units, trimmed and without controls.

Query normalization uses native `URLSearchParams` decoded names and stable sorting with temporary token indices. A narrow raw-token adapter retains original names/values, escape case, `%20` versus `+`, invalid UTF-8 bytes, repeats, blank/no-equals values and empty fields rather than reserializing user tokens. Empty fields retain their slots among the remaining fields during sorting. An untouched explicit `?` survives; removing every real token removes its query marker unless empty fields remain. Input candidates and navigation URLs are never mutated. Identity strings are opaque namespaced keys containing normal/incognito context; they are sensitive URL-derived data, must not be logged/persisted or used as navigation targets, and are only for comparison. The engine expresses configured equivalence, not a claim about server semantics. Pure winner selection feeds the explicitly enabled production placement consumer.

The exact initial permissions are `tabs`, `tabGroups`, `storage`, `webNavigation`. They support tab/group snapshots, configuration, and navigation/lifecycle observation. There are no host permissions, content scripts, injected code, debugger permission, remote executable code, telemetry, network calls or keep-alive timers.

See [architecture](docs/architecture.md), [measurement instructions](docs/performance-baseline.md), and the [approved design](docs/superpowers/specs/2026-10-24-foundation-design.md). CI is configured to install clean dependencies on Node 24, typecheck, run unit/integration tests, build, validate the package, install Chromium and run smoke tests. Local verification does not establish a hosted CI result.

## Try the rule editor in Chrome

1. Rebuild if needed, then reload **ChromeReHome** in `chrome://extensions`. Open **Details → Extension options**. Existing rules and global activation are preserved; legacy storage is not rewritten just by opening the page.
2. Add a grouping rule: pattern `https://github.com/example-org/sample/*`, group `BarTab`. Paste `https://github.com/example-org/sample/issues?view=all#top` into **URL to preview**. The result should name that rule and group. Query/fragment are ignored for grouping; do not put them in the pattern.
3. Add `https://github.com/*` → `GitHub`. Move it above the specific rule: preview should now choose `GitHub`. Move it below or disable it to see `BarTab` again.
4. For duplicate preview, compare `https://example.com/demo?utm_source=a#one` with `https://example.com/demo?utm_source=b#two`. Without a custom policy these are distinct. Add a duplicate policy for origin `https://example.com`, enter `utm_source` as an ignored name and select **ignore fragment**: the draft preview should report equivalent URLs. Disabling that policy restores conservative comparison. This never requests either page.
5. Try a grouping pattern containing `?`: inline validation should explain the problem and Save should be unavailable. Correct it, choose **Save settings**, wait for **Settings saved.**, and reopen/reload settings to verify persistence.
6. If your existing trial is enabled, open a fresh matching URL (including the established iTerm2 `https://example.com/` test with the `Trial` rule). Without a duplicate, saved active rules should group it. With a duplicate, the incoming tab inherits its location; verified older duplicates can close. A disabled grouping rule only stops assigning that configured group on new navigations; it does not undo existing groups or disable duplicate replacement.

Saving keeps your global activation state; a fresh installation remains disabled. Use the controlled trial setup below if you need to explicitly enable it. Task 008 will provide activation/pause and protection UI. Preview is safe to try while automation is disabled. Unsaved drafts and preview text are page-memory only and are lost if you close/reload the page.

## Try cross-window group reuse and focus

1. For an already-enabled Task006/007a controlled trial, reload ChromeReHome in `chrome://extensions` with activation preserved, then continue the trial. For a Task005-or-earlier placement-only build, follow the pause-before-reload precaution above. Fresh or disabled installations stay disabled. If Options says **Automatic replacement is disabled** for an existing configuration, both grouping and duplicate handling are off; use the existing-config activation block below to enable the controlled trial without replacing saved rules. Saving rules preserves the master activation flag. This flag takes effect immediately without a reload; Task 008's activation toggle UI is not implemented yet.
2. Save a grouping rule `https://example.com/*` → `Group A`. In window 1, keep exactly one live group named `Group A` with at least one tab. Existing same-name groups are not automatically merged; rename/consolidate extras for this test.
3. In window 2, open [the script-free local test page](docs/testing/cross-window-links.html) using Chrome’s Open File command (Cmd+O on macOS). Close older tabs at the two test URLs first so duplicate inheritance does not select another location.
4. Click **Foreground test** normally. The incoming tab should move into the original Group A in window 1, become active, and bring window 1 forward. The group ID/title and the incoming tab ID are retained.
5. Return to window 2 and **Cmd-click Background test** (Ctrl-click on Windows/Linux). It should join Group A while window 2 stays in front and window 1 keeps its prior active tab. The native focus test automation currently runs on macOS; other platforms still need their manual release trial.
6. Check that there is still one Group A. To verify manual organization, place an older exact-URL duplicate in another group and reopen its URL: that duplicate’s location still wins over the configured group title. With no eligible group or duplicate anywhere, a matching rule creates the group in the incoming window.

Foreground intent requires the incoming tab to be active in the first snapshot and its source window focused in corroborating evidence, before movement. Missing/ambiguous initial attention grants no focus authority. User attention changes during guarded placement stop further presentation and duplicate closure. Once verified placement is durably accepted, later focus-only switches do not cancel otherwise-safe duplicate cleanup; there are no further presentation calls. Snapshot checks cannot distinguish every user action during native selection changes or eliminate the final check-to-call interval.

## Explicit group placement API

`planGroupDestination(request, snapshot, options?)` in `src/planning/group-destination.ts` returns an existing/new destination or a skip. Its default and explicit `{scope:'window'}` preserve the source-window contract used by the standalone service below. Production opts into `{scope:'all-normal-windows'}`: prefer the current matching group, then another local matching group, then remote groups ordered by window ID, first member index and group ID. Titles match exactly and browsing contexts remain separate. Existing destinations carry the chosen group's actual window ID. Inputs are readonly structural records with no URLs or Chrome types.

Future callers can construct the service explicitly:

```ts
const port = createGroupPlacementAdapter(chrome);
const groupQueue = createOperationQueue();
const groups = createGroupPlacementService({ port, queue: groupQueue });
const result = await groups.place({ tabId: 1, windowId: 10, incognito: false, title: 'BarTab' });
```

Use live concrete IDs and actual browsing context. Retain one service and dedicated shared grouping queue per worker. This queue must differ from an outer coordinator queue whose active job awaits `place`; nesting on the same queue deadlocks. The production placement consumer reuses the pure resolver and native adapter methods directly; it does not call this queued service.

The service validates requests, reads/plans twice, groups an actual tab, and verifies membership/title. Pinned tabs skip. A new group gets only the configured title; existing attributes are never explicitly updated, although Chrome may expand/reposition a group. Results expose `placed`, `skipped`, or `failed` with original cause, stage and known effect (`not-started`, `uncertain`, `grouped`, `titled`). Failed mutations are not retried or rolled back, and title failure can leave an unnamed group. Serialization includes final verification but cannot coordinate other service instances, external actors or restarts. Success is an observation; the production placement executor separately provides document/view/config freshness checks. The replacement executor supplies independent closure evidence and session recovery around production placement.

A separate temporary browser extension fixture tests real grouping without adding a production endpoint or changing the five-file package. Tests record Chromium version and incognito capability; the fixture's default lack of incognito access leaves the disposable-profile manual check in Task 003 unautomated. Chrome 120/current stable release checks also remain.


## Navigation policy and Chrome trials

Task 004 adds conservative metadata/document-provenance eligibility and pure deterministic winner/anchor selection. Active ordinary commits may qualify at worker start; `start_page` also qualifies under the 27 October compatibility amendment; core reload and unknown/nonactive metadata do not. Same-document updates and qualified client redirects require trusted provenance within the current worker. Latest observed eligible callback sequence wins; native snapshot URL freshness, browsing context, pinned/pending/block exclusions and epoch/revision checks guard selection. See [Task 004 policy and browser evidence](docs/tasks/todo/004-navigation-eligibility-and-winner-selection.md).

**Chrome metadata does not prove human intent or detect every restored-page script.** An unqualified script navigation reported as ordinary `link` can qualify even after reload or cold worker start; the actual Chromium restart probe recorded that admission. Rejection of cold `client_redirect` applies when Chrome supplies that qualifier. Valid `start_page` now qualifies, including external-app and configured startup URLs with indistinguishable metadata. This policy expansion does not prove origin or user intent. Cold SPA/hash changes, canceled navigation and some prerender swaps remain deliberate false negatives. Real macOS LaunchServices tests against production `dist` prove grouping and older duplicate closure for HTTP, HTTPS, HTTP→HTTPS and stopped-worker HTTPS; a disabled control retains both tabs. Native restore/reopen commits were not captured, and trusted omnibox and release-matrix coverage remain gaps. See [the compatibility decision](docs/tasks/todo/006a-external-app-link-compatibility.md).

The actual production bundle supports the controlled Task 006 replacement trial below. **007** supplies settings/rule editing and preview. **008** adds protection controls; **009** supplies the full regression/default-activation gate; **010** covers performance/release readiness. Tasks 008–010 remain unimplemented.

## Controlled replacement trial

Load unpacked `<repository>/dist` after building and verifying it. Use a disposable profile only. Before reloading an existing installation, open its service worker console from `chrome://extensions`, export the current configuration and disable processing:

```js
const backup = (await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig;
// Export before closing DevTools; Chrome DevTools supports copy().
copy(JSON.stringify({present: backup !== undefined, value: backup}));
if (backup !== undefined) {
  await chrome.storage.local.set({chromeReHomeConfig: {...backup, enabled:false}});
} // Missing configuration is already disabled.
```

For an existing configuration that should be enabled for a controlled trial, use the service worker console to set only the master flag, preserving all saved rules:

```js
{
  const key = 'chromeReHomeConfig';
  const saved = (await chrome.storage.local.get(key))[key];
  if (!saved) throw new Error('No saved configuration found.');
  await chrome.storage.local.set({[key]: {...saved, enabled:true}});
}
```

The change takes effect immediately; no reload is needed. Verify Options no longer says **Automatic replacement is disabled** before continuing the trial.

Verify options says disabled, then reload the unpacked extension after building. Reopening DevTools loses the `backup` binding; keep the exported wrapper. Enable a fresh explicit trial with schema 4:

```js
await chrome.storage.local.set({chromeReHomeConfig: {
  schemaVersion: 4, enabled: true,
  groupingRules: [{enabled:true, pattern:'https://example.com/*', group:'Trial'}],
  duplicateRules: []
}});
```

This replaces configuration. Options should say “Automatic replacement is enabled. Older duplicate tabs may close after verified placement. Interrupted operations may pause processing until Chrome restarts.” This describes configured enablement, not recovery readiness.

For the external-app compatibility check, first reload this build and keep one tab at the exact full URL `https://example.com/` inside `Trial`. Click that exact URL from an application outside Chrome. The incoming tab should inherit `Trial`, and the older duplicate should close. Move the old tab into another group and repeat: that group should now win over the rule. An ungrouped old tab should also remain ungrouped after replacement. Use the same Chrome profile where the extension is installed/enabled. Close worker DevTools and repeat after the worker becomes inactive to check wakeup. With processing paused, repeat and verify no grouping or closure occurs. Native disabled observations are bounded after page load; deterministic disabled queue guards are tested separately.

The sample rule above matches HTTPS. An explicit `*://example.com/*` pattern groups HTTP too, while duplicate identity continues to distinguish schemes unless a real redirect ends at the same final URL. Supporting external `start_page` also permits indistinguishable configured startup/command-line pages to qualify when enabled; core reload remains excluded. See [compatibility completion and evidence](docs/reviews/2026-10-27-external-app-links-completion.md).

Open an ordinary link to `https://example.com/` from another page: the same incoming tab should reuse an existing `Trial` group in any eligible normal window, or create one in its own window when none exists, even without a duplicate. Use Back to confirm its history remains. Record native IDs with `await chrome.tabs.query({windowType:'normal'})`. Grouping-only navigation retains every original ID.

To test inheritance, set `groupingRules:[]` in the same schema 4 configuration. Keep one tab at a target URL, navigate another tab to it using an ordinary link, and verify the incoming winner survives in the anchor's location and the older anchor closes. The winner's final index accounts for that removal. Repeat grouped/ungrouped, same-window on either side and cross-window, with multiple older duplicates across groups/windows. Only verified older IDs should disappear; unrelated IDs/order and winner history survive. Empty duplicate groups/windows and the winner's emptied source group/window may disappear. A participant navigating, reloading to the same URL, disappearing or becoming pinned/shared/pending cancels further closure. Already-closed tabs are not recreated.

For manual organization, keep an older equivalent tab in `Group A`, enable a rule requesting `Group X`, and open the same URL again (including from iTerm2). The incoming survivor should join `Group A` in the older tab's window and replace that tab after verification. Repeat with an ungrouped old tab: the survivor should remain ungrouped. With multiple duplicates, existing deterministic anchor selection prefers one in the incoming window, then window/index/tab ID order; no manual-move history is inferred. When no equivalent tab exists, the first matching grouping rule supplies the group title; an existing eligible group with that title is reused across windows.

Pause while preserving rules:

```js
const {chromeReHomeConfig: current} = await chrome.storage.local.get('chromeReHomeConfig');
await chrome.storage.local.set({chromeReHomeConfig:{...current,enabled:false}});
```

Navigate another ordinary link and confirm no placement or closure occurs. Pausing does not unblock a quarantined journal. If an operation was interrupted with uncertain native settlement, fully restart Chrome before a new explicit disposable-profile trial. Recovery reads/abandons settled work; it never resumes old closure even when document IDs match.

Restore in the same DevTools session:

```js
if (backup === undefined) await chrome.storage.local.remove('chromeReHomeConfig');
else await chrome.storage.local.set({chromeReHomeConfig:backup});
```

After reopening DevTools, parse the exported wrapper and restore its `value` when `present` is true; otherwise remove only `chromeReHomeConfig`. Do not clear unrelated storage or the replacement journal.

Production-dist browser tests use real local HTTP links and native IDs, order, memberships/history, grouped/ungrouped cross-window closure, last-tab/group disappearance and disabled/grouping-only retention. **Seeded production recovery checks** use real document IDs and actual CDP worker stop/start; they verify admission and byte-preserved bad/pending data, not native interruption. A separate temporary fixture bundles the actual replacement/journal/recovery/adapters and coordinator with controlled gates, stops real workers after durable prepared/pending/settled/verified/placed/removed/terminal boundaries, and delivers actual participant events during held promises. Those endpoints never enter production. Wrapper rejection tests are simulated faults. Gates before invocation or after native fulfillment do not prove termination inside an outstanding Chrome API call; a deferred unit test with a discarded old worker's late effect supplies that coverage.

Isolated headed macOS tests cover foreground/background focus and collapse in the bundled browser. Broader manual Chrome trials remain required for actual mouse drag/rejection, explicitly enabled incognito, Chrome120 and current stable. This work does not claim those trials complete. For drag, navigate while dragging in the disposable profile, release, and verify no retry and no further closure after failure; prior verified removals can remain removed. Incognito requires explicitly enabling extension access and repeating same-context cases; normal/incognito must never mix. The accepted004 scripted-link ambiguity remains: Chrome can report a script as ordinary eligible `link`, including after worker restart. Whole-view invalidation may conservatively cancel work after unrelated navigation. Tasks008–010 (broader protections, default-activation regression and release/performance readiness) remain pending.
