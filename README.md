# ChromeReHome

**Pause your existing configuration before reloading this build; enabled mode can now close duplicate tabs.**

Chrome Manifest V3 extension for an explicitly enabled replacement trial. Eligible navigation places the existing winning tab, preserves its ID/history, then sequentially closes older duplicates only after independent document checks and verified placement. Configured grouping overrides inherited location. A lone winner still groups normally. Configuration defaults to disabled; an already-enabled Task005 installation activates closure when this build loads. There is no rule editor. Task005's retain-all placement behavior is the previous phase; its historical evidence remains in the task/review documents.

Interrupted operations can pause all automatic processing. A small session journal records settlement, never a replayable plan. Pending native calls, malformed/future records or failed journal storage quarantine work; toggling configuration, waiting or restarting the worker cannot establish settlement. A full browser restart is the reliable user-controlled reset for an ambiguous native call, followed by a fresh explicit trial. Extension disable/reload/update can also clear session storage, but does not prove an outstanding native call settled. Never erase the journal to force continuation.

The trial has no unsaved-form protection and no transaction guarantee. Chrome has no atomic compare-document-and-close API; navigation can race the final check. Native calls are never retried, rolled back or released from the queue by a timeout. Previously verified removals remain removed if later work stops. At most 100 participants (winner plus 99 older duplicates) are allowed; larger selections skip all placement/closure without truncation. Missing passive document evidence retains all duplicates while otherwise-valid configured placement can still proceed. Use a disposable profile.
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

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this repository's `dist/` folder. Open the extension's **Details → Extension options** to see status. Reload the extension after rebuilding. Do not load the source tree. The options page opens in a tab; there is no action popup.

The build targets `chrome120`, bundles the worker and options independently, removes stale output, and emits exactly five files in `dist/`. Its dependency graph is stored outside the package at `.build/metafile.json`. Distribute only `dist/` after package verification; source maps, tests, tooling and graph metadata are excluded. Package checks enforce the permission/entry/file allowlist, local code loading, source ownership and separate bundle graphs.

Browser smoke tests use Playwright's bundled Chromium, isolated temporary profiles, test-only CDP, and routed HTTP/HTTPS fixture pages. They load the actual package, inspect options, preserve version 3 grouping and duplicate rules and seeded tab/group membership, force worker termination and observe revival. Temporary test-only bundles of the actual compilers verify native Chromium matching and duplicate identity against shared Node/Chromium cases; these fixtures are excluded from `dist/`. They never use your browser profile. Install Linux browser dependencies with `npx playwright install --with-deps chromium`. `PLAYWRIGHT_BROWSERS_PATH` may point to a download cache outside the repository. Failure traces are in `test-results/`; inspect with `npx playwright show-trace <trace.zip>`.

## Configuration and permissions

`storage.local.chromeReHomeConfig` holds version 3 configuration: `{ "schemaVersion": 3, "enabled": false, "groupingRules": [], "duplicateRules": [] }`. Missing configuration uses this disabled default without writing it. Strict version 1 data (`schemaVersion` and boolean `enabled` only) migrates in memory with empty lists. Strict version 2 data preserves grouping rules exactly and adds empty duplicate rules. Loads never write, including migrations. Explicit repository saves accept valid version 1, 2 or 3 input and write canonical version 3. Invalid fields/rules and future-version data remain unchanged and produce an options-page error; processing stays disabled. Valid changes are observed through `storage.onChanged`. Configurations, rule arrays, records and ignored-name arrays are copied/frozen. The enabled field explicitly activates guarded placement and duplicate closure. No editing UI ships yet.

`compileGroupingRules(raw)` in `src/rules/grouping.ts` validates ordered `{ pattern, group }` rules and returns either `{ kind: 'ready', rules, match(url) }` or `{ kind: 'invalid', message, ruleIndex? }` (zero-based index). Reuse the compiled result across calls; `match` returns the first matching frozen rule or `undefined`. Validation is atomic. Native `URLPattern` performs matching with explicit URL components and escaped literal syntax; no matcher dependency or runtime polyfill is used. Node 24 and the declared Chrome 120 floor provide this API.

Only `*` is a wildcard. Use `http://`, `https://`, or `*://` (HTTP and HTTPS), a hostname, optional numeric port, and path. Candidate query strings/fragments are ignored; literal `?` or `#` in patterns is rejected. URL parsing normalizes host case, Unicode and default ports while preserving path case and encoded slash boundaries. A missing/default port matches the scheme's default only; `:8080` matches only that port. `*://` compiles separate HTTP/HTTPS alternatives so explicit `:80` and `:443` retain their meanings. Credentials, backslashes, surrounding whitespace, controls, unsupported schemes and malformed URLs are rejected as patterns. Malformed or unsupported candidates never match.

Examples: `https://github.com/example-org/sample/*` matches `/BarTab/` and nested paths, including query/hash variants, but excludes slashless `/BarTab`. `https://*.example.com/*` matches subdomains without implicitly including `example.com`. `https://example.com/:id` and `https://example.com/(a|b)` match those literal paths. Adjacent stars behave as one star; path stars can span slashes. Encoded `%3F`/`%23` remain valid path literals. Limits are 100 rules, 1–2048 UTF-16 code units per pattern and 1–80 per group title; titles also reject surrounding whitespace and controls. The production consumer compiles captured rules for placement; future preview can reuse this compiler.

`compileDuplicateRules(raw)` in `src/rules/duplicates.ts` returns `{ kind: 'ready', rules, identify(candidate), equivalent(left, right) }` or `{ kind: 'invalid', message, ruleIndex? }`. A candidate is `{ url, incognito }`, with an explicit boolean browsing context. HTTP(S) candidates use native `URL.href` as the conservative identity: queries, repeated-value order, raw escaping, fragments (including hash routes), path case, empty markers and trailing slashes remain significant. Standard URL canonicalization still applies, including host case and default ports. Malformed/unsupported URLs, whitespace, controls, backslashes, missing authority and nonempty credentials have no identity; invalid candidates never match each other.

A duplicate rule contains exactly `{ origin, ignoreQueryParameters, ignoreFragment, ignoreTrailingSlash, sortQueryParameters }`. All flags are required booleans and default policies are conservative (no implicit tracking list). `origin` is an exact HTTP(S) origin, optionally ending in `/`; paths, queries, fragments, credentials and wildcards are rejected. Canonically duplicate origins are rejected. Scheme, nondefault port and subdomain boundaries are independent. For example, `{ "origin": "https://example.test", "ignoreQueryParameters": ["utm_source"], "ignoreFragment": false, "ignoreTrailingSlash": false, "sortQueryParameters": true }` ignores all occurrences of the exact decoded case-sensitive tracking name and sorts decoded query names stably, preserving equal-name value order. Fragment removal and removal of all trailing path slashes (except root `/`) require separate flags. Limits are 100 rules, 1–2048 UTF-16 code units per origin and 100 distinct ignored names of 1–256 code units, trimmed and without controls.

Query normalization uses native `URLSearchParams` decoded names and stable sorting with temporary token indices. A narrow raw-token adapter retains original names/values, escape case, `%20` versus `+`, invalid UTF-8 bytes, repeats, blank/no-equals values and empty fields rather than reserializing user tokens. Empty fields retain their slots among the remaining fields during sorting. An untouched explicit `?` survives; removing every real token removes its query marker unless empty fields remain. Input candidates and navigation URLs are never mutated. Identity strings are opaque namespaced keys containing normal/incognito context; they are sensitive URL-derived data, must not be logged/persisted or used as navigation targets, and are only for comparison. The engine expresses configured equivalence, not a claim about server semantics. Pure winner selection feeds the explicitly enabled production placement consumer.

The exact initial permissions are `tabs`, `tabGroups`, `storage`, `webNavigation`. They support tab/group snapshots, configuration, and navigation/lifecycle observation. There are no host permissions, content scripts, injected code, debugger permission, remote executable code, telemetry, network calls or keep-alive timers.

See [architecture](docs/architecture.md), [measurement instructions](docs/performance-baseline.md), and the [approved design](docs/superpowers/specs/2026-10-24-foundation-design.md). CI is configured to install clean dependencies on Node 24, typecheck, run unit/integration tests, build, validate the package, install Chromium and run smoke tests. Local verification does not establish a hosted CI result.

## Explicit group placement API

`planGroupDestination(request, snapshot)` in `src/planning/group-destination.ts` returns an existing/new destination or a skip. It compares titles exactly in the source tab's own explicit window/context, prefers its current group, then lowest observed member index and numeric group ID. Inputs are readonly structural records with no URLs or Chrome types.

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

The actual production bundle supports the controlled Task 006 replacement trial below. **007** adds settings/rule editing and preview; **008** adds protection controls; **009** supplies the full regression/default-activation gate; **010** covers performance/release readiness. None of these later features is implemented here.

## Controlled replacement trial

Load unpacked `<repository>/dist` after building and verifying it. Use a disposable profile only. Before reloading an existing installation, open its service worker console from `chrome://extensions`, export the current configuration and disable processing:

```js
const backup = (await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig;
// Export before closing DevTools; Chrome DevTools supports copy().
copy(JSON.stringify({present: backup !== undefined, value: backup}));
await chrome.storage.local.set({chromeReHomeConfig: {
  schemaVersion: 3, enabled: false,
  groupingRules: backup?.groupingRules ?? [],
  duplicateRules: backup?.duplicateRules ?? []
}});
```

Verify options says disabled, then reload the unpacked extension after building. Reopening DevTools loses the `backup` binding; keep the exported wrapper. Enable a fresh explicit trial with schema3:

```js
await chrome.storage.local.set({chromeReHomeConfig: {
  schemaVersion: 3, enabled: true,
  groupingRules: [{pattern:'https://example.com/*', group:'Trial'}],
  duplicateRules: []
}});
```

This replaces configuration. Options should say “Automatic replacement is enabled. Older duplicate tabs may close after verified placement. Rule editing is not available yet. Interrupted operations may pause processing until Chrome restarts.” This describes configured enablement, not recovery readiness.

For the external-app compatibility check, first reload this build and keep one tab at the exact full URL `https://example.com/`. Click that exact URL from an application outside Chrome. The incoming tab should join `Trial`, and the older duplicate should close. Use the same Chrome profile where the extension is installed/enabled. Close worker DevTools and repeat after the worker becomes inactive to check wakeup. With processing paused, repeat and verify no grouping or closure occurs. Native disabled observations are bounded after page load; deterministic disabled queue guards are tested separately.

The sample rule above matches HTTPS. An explicit `*://example.com/*` pattern groups HTTP too, while duplicate identity continues to distinguish schemes unless a real redirect ends at the same final URL. Supporting external `start_page` also permits indistinguishable configured startup/command-line pages to qualify when enabled; core reload remains excluded. See [compatibility completion and evidence](docs/reviews/2026-10-27-external-app-links-completion.md).

Open an ordinary link to `https://example.com/` from another page: the same incoming tab should join a `Trial` group in its own window even without a duplicate. Use Back to confirm its history remains. Record native IDs with `await chrome.tabs.query({windowType:'normal'})`. Grouping-only navigation retains every original ID.

To test inheritance, set `groupingRules:[]` in the same schema3 configuration. Keep one tab at a target URL, navigate another tab to it using an ordinary link, and verify the incoming winner survives in the anchor's location and the older anchor closes. The winner's final index accounts for that removal. Repeat grouped/ungrouped, same-window on either side and cross-window, with multiple older duplicates across groups/windows. Only verified older IDs should disappear; unrelated IDs/order and winner history survive. Empty duplicate groups/windows and the winner's emptied source group/window may disappear. A participant navigating, reloading to the same URL, disappearing or becoming pinned/shared/pending cancels further closure. Already-closed tabs are not recreated.

For configured override, keep an older equivalent tab in another window/group, enable the `Trial` rule and navigate the winner via an ordinary link. It joins an existing exact-title `Trial` group in its incoming window or creates one there, then may close the old duplicate after verification. Repeat with a current matching group, multiple exact-title groups, active/background winner and a collapsed target. Observe Chrome's active/focus/collapse effects; the extension never explicitly sets them.

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

Manual Chrome trials remain required for actual mouse drag/rejection, user-facing focus/collapse, explicitly enabled incognito, Chrome120 and current stable. This work does not claim those trials complete. For drag, navigate while dragging in the disposable profile, release, and verify no retry and no further closure after failure; prior verified removals can remain removed. Incognito requires explicitly enabling extension access and repeating same-context cases; normal/incognito must never mix. The accepted004 scripted-link ambiguity remains: Chrome can report a script as ordinary eligible `link`, including after worker restart. Whole-view invalidation may conservatively cancel work after unrelated navigation. Tasks007–010 (rule editing/preview, broader protections, default-activation regression and release/performance readiness) remain pending.
