# ChromeReHome

Chrome Manifest V3 foundation for future duplicate-tab replacement and grouping rules. This version renders installation/configuration status, observes navigation, and provides a pure wildcard-rule compiler. Automatic movement, grouping and closure are not implemented. [Task 001](docs/tasks/todo/001-wildcard-group-rules.md) supplies matching and configuration; Tasks 002–010 remain TODO.

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

Browser smoke tests use Playwright's bundled Chromium, isolated temporary profiles, test-only CDP, and routed HTTP/HTTPS fixture pages. They load the actual package, inspect options, preserve version 2 rules and seeded tab/group membership, force worker termination and observe revival. A temporary test-only bundle of the actual compiler verifies native Chromium matching; this fixture is excluded from `dist/`. They never use your browser profile. Install Linux browser dependencies with `npx playwright install --with-deps chromium`. `PLAYWRIGHT_BROWSERS_PATH` may point to a download cache outside the repository. Failure traces are in `test-results/`; inspect with `npx playwright show-trace <trace.zip>`.

## Configuration and permissions

`storage.local.chromeReHomeConfig` holds version 2 configuration: `{ "schemaVersion": 2, "enabled": false, "groupingRules": [] }`. Missing configuration uses this disabled default without writing it. Strict version 1 data (`schemaVersion` and boolean `enabled` only) migrates in memory with empty rules. Loads never write, including migration. Explicit repository saves accept valid version 1 or 2 input and write canonical version 2. Invalid fields/rules and future-version data remain unchanged and produce an options-page error; processing stays disabled. Valid changes are observed through `storage.onChanged`. Configurations, rule arrays and rules are copied/frozen. The enabled field is a foundation switch; it does not enable unfinished organization features. No editing UI ships yet.

`compileGroupingRules(raw)` in `src/rules/grouping.ts` validates ordered `{ pattern, group }` rules and returns either `{ kind: 'ready', rules, match(url) }` or `{ kind: 'invalid', message, ruleIndex? }` (zero-based index). Reuse the compiled result across calls; `match` returns the first matching frozen rule or `undefined`. Validation is atomic. Native `URLPattern` performs matching with explicit URL components and escaped literal syntax; no matcher dependency or runtime polyfill is used. Node 24 and the declared Chrome 120 floor provide this API.

Only `*` is a wildcard. Use `http://`, `https://`, or `*://` (HTTP and HTTPS), a hostname, optional numeric port, and path. Candidate query strings/fragments are ignored; literal `?` or `#` in patterns is rejected. URL parsing normalizes host case, Unicode and default ports while preserving path case and encoded slash boundaries. A missing/default port matches the scheme's default only; `:8080` matches only that port. `*://` compiles separate HTTP/HTTPS alternatives so explicit `:80` and `:443` retain their meanings. Credentials, backslashes, surrounding whitespace, controls, unsupported schemes and malformed URLs are rejected as patterns. Malformed or unsupported candidates never match.

Examples: `https://github.com/example-org/sample/*` matches `/BarTab/` and nested paths, including query/hash variants, but excludes slashless `/BarTab`. `https://*.example.com/*` matches subdomains without implicitly including `example.com`. `https://example.com/:id` and `https://example.com/(a|b)` match those literal paths. Adjacent stars behave as one star; path stars can span slashes. Encoded `%3F`/`%23` remain valid path literals. Limits are 100 rules, 1–2048 UTF-16 code units per pattern and 1–80 per group title; titles also reject surrounding whitespace and controls. The compiler is available to future preview/planning tasks; the worker consumer remains a no-op.

The exact initial permissions are `tabs`, `tabGroups`, `storage`, `webNavigation`. They support tab/group snapshots, configuration, and navigation/lifecycle observation. There are no host permissions, content scripts, injected code, debugger permission, remote executable code, telemetry, network calls or keep-alive timers.

See [architecture](docs/architecture.md), [measurement instructions](docs/performance-baseline.md), and the [approved design](docs/superpowers/specs/2026-10-24-foundation-design.md). CI is configured to install clean dependencies on Node 24, typecheck, run unit/integration tests, build, validate the package, install Chromium and run smoke tests. Local verification does not establish a hosted CI result.
