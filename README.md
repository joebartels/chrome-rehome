# ChromeReHome

Chrome Manifest V3 extension for an explicitly enabled replacement-placement trial. The real navigation consumer groups eligible tabs by configured rules or moves the existing winner immediately after a duplicate anchor, preserving history and retaining every original tab. Configuration defaults to disabled. There is no tab closure or rule editor. Tasks001–004 supply matching, destination resolution and navigation policy; Task005 connects production placement. Task006 recovery/closure and later UI/release work remain pending.

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

`storage.local.chromeReHomeConfig` holds version 3 configuration: `{ "schemaVersion": 3, "enabled": false, "groupingRules": [], "duplicateRules": [] }`. Missing configuration uses this disabled default without writing it. Strict version 1 data (`schemaVersion` and boolean `enabled` only) migrates in memory with empty lists. Strict version 2 data preserves grouping rules exactly and adds empty duplicate rules. Loads never write, including migrations. Explicit repository saves accept valid version 1, 2 or 3 input and write canonical version 3. Invalid fields/rules and future-version data remain unchanged and produce an options-page error; processing stays disabled. Valid changes are observed through `storage.onChanged`. Configurations, rule arrays, records and ignored-name arrays are copied/frozen. The enabled field explicitly activates the guarded placement trial. No editing UI ships yet.

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

The service validates requests, reads/plans twice, groups an actual tab, and verifies membership/title. Pinned tabs skip. A new group gets only the configured title; existing attributes are never explicitly updated, although Chrome may expand/reposition a group. Results expose `placed`, `skipped`, or `failed` with original cause, stage and known effect (`not-started`, `uncertain`, `grouped`, `titled`). Failed mutations are not retried or rolled back, and title failure can leave an unnamed group. Serialization includes final verification but cannot coordinate other service instances, external actors or restarts. Success is an observation; the production placement executor separately provides document/view/config freshness checks. Closure still requires Task006.

A separate temporary browser extension fixture tests real grouping without adding a production endpoint or changing the five-file package. Tests record Chromium version and incognito capability; the fixture's default lack of incognito access leaves the disposable-profile manual check in Task 003 unautomated. Chrome 120/current stable release checks also remain.


## Navigation policy and Chrome trials

Task 004 adds conservative metadata/document-provenance eligibility and pure deterministic winner/anchor selection. Active ordinary commits may qualify at worker start; reload/start_page and unknown/nonactive metadata do not. Same-document updates and qualified client redirects require trusted provenance within the current worker. Latest observed eligible callback sequence wins; native snapshot URL freshness, browsing context, pinned/pending/block exclusions and epoch/revision checks guard selection. See [Task 004 policy and browser evidence](docs/tasks/todo/004-navigation-eligibility-and-winner-selection.md).

**Chrome metadata does not prove human intent or detect every restored-page script.** An unqualified script navigation reported as ordinary `link` can qualify even after reload or cold worker start; the actual Chromium restart probe recorded that admission. Rejection of cold `client_redirect` applies when Chrome supplies that qualifier. Cold SPA/hash changes, ambiguous external launches reported as `start_page`, canceled navigation and some prerender swaps remain deliberate false negatives. Actual metadata traces and bounded capability probes accompany disposable browser tests; restore/reopen, trusted omnibox/external-app interaction and release-matrix coverage have explicit manual gaps.

The actual production bundle supports the controlled005 placement trial below. **006** adds recovery and closure; **007** adds settings/rule editing and preview; **008** adds protection controls; **009** supplies the full regression/default-activation gate; **010** covers performance/release readiness. None of these later features is implemented here.

## Controlled placement trial

Load unpacked `<repository>/dist` after building and verifying it. Use a disposable profile for trials. Open the extension service worker console from `chrome://extensions` and run:

```js
const backup = (await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig;
// Copy/export backup before closing DevTools (Chrome DevTools supports copy()).
copy(JSON.stringify({present: backup !== undefined, value: backup}));
await chrome.storage.local.set({chromeReHomeConfig: {
  schemaVersion: 3, enabled: true,
  groupingRules: [{pattern:'https://example.com/*', group:'Trial'}],
  duplicateRules: []
}});
```

This replaces configuration. Keep the exported backup, including whether the key was absent. Options should say “Automatic placement is enabled. Tabs are never closed. Rule editing is not available yet.” Open an ordinary link to `https://example.com/` from another page: the same incoming tab should join a `Trial` group in its own window even without a duplicate. Use Back to confirm its history remains. Record tab IDs in the worker console with `await chrome.tabs.query({windowType:'normal'})` before and after each smoke step and confirm every original ID remains.

To test inheritance, set `groupingRules:[]` in the same schema3 configuration. Keep one tab at a target URL, navigate a second tab to that URL using an ordinary link, and confirm the second tab lands immediately after the first. Repeat with the anchor ungrouped and grouped, in the same window (winner on either side) and another normal window. Try the winner as the last member of its old group and the last tab of its source window; Chrome may remove those empty structures. Add a second member after a grouped anchor to exercise the interior position. Repeat with an active and background winner and a collapsed target. Observe native active/focus/collapse changes; the extension never explicitly sets them.

For override, retain an equivalent anchor in another window/group, then enable the `Trial` rule again and navigate the winner via an ordinary link. It should join an existing exact-title `Trial` group in its incoming window, or create one there, without visiting the duplicate window. Repeat with a current matching group and multiple exact-title groups (current first, otherwise leftmost). No duplicate tab is closed.

Pause while preserving rules:

```js
const {chromeReHomeConfig: current} = await chrome.storage.local.get('chromeReHomeConfig');
await chrome.storage.local.set({chromeReHomeConfig:{...current,enabled:false}});
```

Navigate another ordinary link and confirm no placement occurs. Restore in the same DevTools session:

```js
if (backup === undefined) await chrome.storage.local.remove('chromeReHomeConfig');
else await chrome.storage.local.set({chromeReHomeConfig:backup});
```

After reopening DevTools, parse the exported wrapper and restore its `value` when `present` is true; otherwise remove only `chromeReHomeConfig`. Do not clear unrelated storage.

Production-dist browser tests use a real local HTTP server and native navigation, tab IDs, indices, memberships and history. They cover grouping-only, both ordering directions, grouped/ungrouped cross-window placement, last source group/window removal, a collapsed configured override and disabling. Simulated drag/title failures are separate adapter/executor tests. Actual mouse-drag rejection, explicitly enabled incognito, Chrome120 and current-stable release checks remain manual gaps. For actual drag, navigate an eligible tab while dragging a tab in a disposable profile, then release it; observe no retry/closure and confirm every original ID remains. Incognito requires explicitly enabling extension access and repeating same-context cases; normal/incognito must never mix. The accepted004 scripted-link ambiguity remains: Chrome can report a script as eligible ordinary `link`, including after worker restart. Whole-view invalidation may also conservatively cancel placement after unrelated navigation.
