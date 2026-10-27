# External-app link investigation — 2026-10-27

Baseline: `historical-revision`. No repository production source was edited. Observer only imports the unchanged navigation tracker and records native callbacks; no placement/closure consumer is installed and enabled configuration is false.

## Confirmed

- Actual macOS LaunchServices `/usr/bin/open -a <unique cloned app> <URL>` produces `onCommitted.transitionType: "start_page"`. All seven external cases were rejected by the unchanged tracker: warm HTTP, warm HTTPS, HTTP→HTTP, HTTP→HTTPS, HTTPS→HTTP, HTTPS→HTTPS, and HTTPS after a confirmed stopped service worker. Redirects retain `start_page` plus `server_redirect`; direct cases have no qualifiers.
- All seven commits have frame 0, `outermost_frame`, `active`, nonempty document ID, and valid URLs. Each immediate `tabs.get` snapshot has no `pendingUrl` property; its URL and `getFrame` document ID/URL/lifecycle match the commit. The observed failure occurs in admission, before candidate/placement/closure work. There is no observed snapshot-readiness failure in these cases.
- Native in-page link click control emits `link` and is admitted. CDP initial `page.goto` emits `typed` and is admitted; this is explicitly a CDP control. The Playwright Meta+L typing attempt did not navigate and supplies no trusted omnibox evidence.
- After `ServiceWorker.stopWorker`, status `stopped` was observed. External OS open was sent before any subsequent worker evaluation. Native events woke a new worker realm and still emitted rejected `start_page`.
- A configured startup page set through Chromium's own settings API also emits `start_page`, `active`, outermost frame, qualifiers `[]`. Those admission fields do not distinguish it from external launch. A new-tab/pending URL/opener heuristic is not an established source-of-intent API.

## Limits

This confirms a real macOS external-launch incompatibility in the current tracker, not the exact user's source application/profile. The user subsequently identified the source app as iTerm and the input URL as `https://example.com`. The recorded native metadata below comes from the equivalent isolated macOS LaunchServices route, not from the personal iTerm/Chrome profile. HTTP and HTTPS are not interchangeable duplicate identities; tests must seed the same final identity. The personal Chrome profile was never read or targeted, and installed Chrome was not launched. The controller read only installed application version metadata (156.0.8078.48).

Actual session restore reopened the two saved URLs, but the observer captured no post-restart committed events within the bounded observation. Pre-restart `typed` events in the cumulative trace are setup, not restored events. Do not report empirical `reload` restore coverage. Chromium's [official history transition documentation](https://developer.chrome.com/docs/extensions/reference/api/history#type-TransitionType) classifies session restore/reopen as reload; the [webNavigation API](https://developer.chrome.com/docs/extensions/reference/api/webNavigation#type-TransitionType) exposes the transition metadata used by this tracker. The proposed change keeps core reload rejected. Broad proof of all restore mechanisms remains outside this evidence.

## Reproduction and routing

Runtime: Node `v24.22.1`, Playwright `1.64.1`, bundled Chrome for Testing `156.0.8078.4`, macOS arm64. Exact OS version is in `environment.json`.

The cached app was cloned with `cp -cR` into `$TEMP_DIR/chromerehome-external-isolation/ChromeReHome External Probe.app`. Only that clone's CFBundleIdentifier was set to `org.chromerehome.externalprobe.20261027`. Each launch used explicit `$TEMP_DIR/chromerehome-external-isolation/profile`; no default-browser change. `open -a` targets the full cloned app path, without command-line URL forwarding. The app exits through its own Playwright/CDP browser close. All HTTP/TLS fixtures bind only `127.0.0.1`. TLS certificate validation is bypassed only by the test browser for the self-signed local server.

Run from the saved investigation directory, after preparing the named clone and local certificate as recorded in `setup.sh`:

```sh
rtk proxy node EXTERNAL_EVIDENCE/capture.mjs
rtk proxy node EXTERNAL_EVIDENCE/startup-restore.mjs
```

Evidence: `native-events.json` contains raw callbacks, operation labels, commit snapshots and worker realms. `startup-restore-events.json` contains startup settings readback and cumulative observer traces; distinguish realms before interpreting restores. `trace-fixture.ts`, `capture.mjs`, `startup-restore.mjs` are disposable investigation code, not production package additions. Native startup capture uses a 1.5s slow local response to give the observer time to register; this is not a proposed product timer.

Cleanup: both scripts close only their own browser and servers. Remove only `$TEMP_DIR/chromerehome-external-isolation` after saving any desired evidence; it contains the cloned app, disposable profile and test certificate. Keep evidence files under this investigation directory. The durable regression must allocate a fresh random directory/bundle ID each run, unlike this single-investigation path.
