# Testing ChromeReHome

Testing must show both that intended work happens and that stale or ineligible work cannot mutate tabs later. Browser observations, native-call settlement and operating-system focus are different claims; use evidence that reaches the relevant boundary.

## What each layer establishes

| Layer | What it establishes |
| --- | --- |
| [Unit tests](../../tests/unit/) | Rule semantics, pure decisions, validation, UI state, and controlled asynchronous failure behavior. |
| [Integration tests](../../tests/integration/) | Adapter mappings, listener wiring, repositories, queue coordination and recovery across component boundaries. |
| [Browser tests](../../tests/browser/) | The built extension's behavior with actual Chrome APIs, pages, tab/group state and worker restart. |
| [Release qualification](../../tests/release/) | A particular package's fresh-install and upgrade behavior on explicitly selected browser/platform combinations. |
| [Performance harness](../../tests/performance/) | Measured workloads with verified outcomes, separating instrumented timing from unmodified package observations. |

The executable test cases and [Playwright configuration](../../playwright.config.ts) are the current inventory. Historical counts or a passing archived run do not describe the present tree.

## Run the checks

Follow [development setup](../engineering/development.md) for dependencies. The basic package gate is:

```sh
npm run typecheck
npm test
npm run build
npm run check:package
npx playwright install chromium
npm run test:browser
```

Browser tests load `dist/`; rebuild after source changes. The `portable` project excludes headed and native scenarios. The `headed` project requires a display. The `native-macos` project is registered on macOS and exercises platform-specific interactions. Select a project with `npm run test:browser -- --project=portable` when narrowing a run, and label the result accordingly. An absent native project on another platform is a coverage limitation, not proof of equivalent behavior there.

For a machine-checkable browser report, request Playwright's JSON reporter and pass the resulting report plus the intended project names to `npm run check:browser-results -- REPORT_JSON PROJECT...`. The [checker](../../scripts/check-browser-results.mjs) rejects skips, retries, failures and empty requested projects. It cannot establish that a filtered selection covered the complete suite; retain the command and selection with the report.

## Test isolation and race coverage

Browser fixtures own temporary profiles and routed test pages. Test-only CDP and instrumented bundles must remain outside the distributed extension. Native helpers must target only the browser created for the test. Never substitute a personal profile or unrelated foreground application to satisfy a scenario.

Use deferred operations to exercise changes while reads, writes and native calls are pending. Relevant assertions include which tab survived, what location was preserved, which calls were never issued, and whether queued work remained blocked until settlement. For negative browser assertions, first prove the triggering work was observed or completed; a quiet interval alone can hide a late mutation.

Worker restart tests must demonstrate a new worker and re-established readiness. Recovery tests must distinguish a settled journal from a pending native call. Successful reads after restart do not authorize replay. Grouping, navigation and closure checks should retain tab and document identity assertions, not merely count visible tabs.

For focus and external-app behavior, distinguish Chrome's reported window state from the OS foreground application. The native tests and helpers exercise the latter where supported. A synthetic callback test establishes handler behavior, not proof that a native menu or application produced the event.

## Debug and retain evidence

Playwright retains failure traces under `test-results/`; open a trace with `npx playwright show-trace PATH_TO_TRACE`. Start with the failing test, its fixture and its assertions. Preserve the original failure and report any later focused run separately from a full rerun. Diagnose setup failures before changing assertions or adding delays.

Use bounded diagnostic metadata rather than logging URLs, titles or duplicate keys. Public evidence should use synthetic browsing data and portable paths. Screenshots, traces and reports may contain local or browsing details even when the extension itself has no telemetry, so inspect them before publishing.

The [historical regression matrix](../archive/testing/browser-regression-matrix.md) and [historical release qualification](../archive/testing/chrome-release-qualification.md) explain past evidence and limitations. They are records, not the current test inventory or release instructions. Follow [release guidance](../engineering/releases.md) for a new build and [documentation maintenance](../maintaining-docs.md) when recording results.
