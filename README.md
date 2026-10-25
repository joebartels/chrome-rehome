# ChromeReHome

Chrome Manifest V3 foundation for future duplicate-tab replacement and grouping rules. This version renders installation/configuration status and observes navigation. Automatic movement, grouping and closure are not implemented. All ten [feature tasks](docs/tasks/README.md) remain TODO.

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

Browser smoke tests use Playwright's bundled Chromium, isolated temporary profiles, test-only CDP, and routed HTTP/HTTPS fixture pages. They load the actual package, inspect options, preserve seeded tab/group membership, force worker termination and observe revival. They never use your browser profile. Install Linux browser dependencies with `npx playwright install --with-deps chromium`. `PLAYWRIGHT_BROWSERS_PATH` may point to a download cache outside the repository. Failure traces are in `test-results/`; inspect with `npx playwright show-trace <trace.zip>`.

## Configuration and permissions

`storage.local.chromeReHomeConfig` holds version 1 configuration: `{ "schemaVersion": 1, "enabled": false }`. Missing configuration uses this disabled default without writing it. Invalid or future-version data remains unchanged and produces an options-page error; processing stays disabled. Valid changes are observed through `storage.onChanged`. The enabled field is a foundation switch; it does not enable unfinished organization features. No editing UI ships yet.

The exact initial permissions are `tabs`, `tabGroups`, `storage`, `webNavigation`. They support tab/group snapshots, configuration, and navigation/lifecycle observation. There are no host permissions, content scripts, injected code, debugger permission, remote executable code, telemetry, network calls or keep-alive timers.

See [architecture](docs/architecture.md), [measurement instructions](docs/performance-baseline.md), and the [approved design](docs/superpowers/specs/2026-10-24-foundation-design.md). CI is configured to install clean dependencies on Node 24, typecheck, run unit/integration tests, build, validate the package, install Chromium and run smoke tests. Local verification does not establish a hosted CI result.
