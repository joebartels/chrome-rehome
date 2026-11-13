# Working with Chrome extension constraints

ChromeReHome is an event-driven Manifest V3 extension. Its [manifest](../../manifest.json) declares the supported Chrome floor and capabilities; its [build](../../scripts/build.mjs) and [package checks](../../scripts/check-package.mjs) keep the delivered package aligned with those choices. Check these together when adopting an API or changing compatibility.

## Design for worker loss

Chrome can terminate an idle extension worker and revive it for an event. Worker globals disappear on shutdown; an active developer-tools connection can also affect the lifecycle being tested. Do not make correctness depend on a continuously running worker or a particular idle timeout. Chrome documents the lifecycle and its version-dependent behavior in [extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

Register required listeners synchronously during startup, before waiting for storage or other initialization. Chrome needs those registrations to deliver waking events. In this project, the [entry point](../../src/background/index.ts) wires listeners immediately and handlers await readiness afterward. This follows Chrome's [service worker event registration guidance](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events).

Use persistent settings for durable user choices and session storage for state that must survive worker suspension but not extension or browser restart. Chrome clears `storage.session` on extension disable, reload or update and on browser restart. These lifetimes are documented in the [Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage#storage_areas). They explain why protection, recent tabs and the journal survive worker loss but cannot be treated as permanent records.

## Observe documents without inventing atomicity

Tab IDs identify tabs; navigation can replace the document inside a surviving tab. Chrome's [webNavigation API](https://developer.chrome.com/docs/extensions/reference/api/webNavigation) supplies document identifiers and lifecycle information. The runtime uses this evidence alongside tab observations and navigation invalidation, rather than treating URL equality as document identity.

Chrome exposes separate calls to read documents, move tabs, group tabs and remove tabs. The [Tabs API removal operation](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-remove) accepts tab IDs, with no expected-document condition. Therefore the project's preflight checks cannot make compare-document-and-close atomic. Navigation can still race the final check. Preserve this limitation in user-facing behavior and release evidence.

Likewise, a locally serialized queue only coordinates this worker's work; it cannot lock out the user, Chrome or another extension. Keep native-call settlement distinct from observed browser state. The session journal blocks uncertain continuation and never authorizes replay. See [architecture](architecture.md) for the recovery boundary.

## Keep capability and data boundaries narrow

The [manifest](../../manifest.json) is the authoritative permission inventory. Each permission must support an actual capability. For example, `tabs` allows reading sensitive tab properties needed for comparisons; the extension does not need host permissions merely to perform those tab operations. Chrome distinguishes API permissions, host permissions and optional permissions in [Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) and the [Tabs API permission guide](https://developer.chrome.com/docs/extensions/reference/api/tabs#permissions).

The current package has no content scripts, remote executable code or telemetry. Package checks restrict executable loading and network primitives, as well as bundled files and entry points. A proposed dependency or permission must preserve these guarantees or explicitly change and test the product contract; convenience in a test harness is not a production requirement.

Incognito access is user-controlled in Chrome's extension settings. Even when granted, normal and incognito identities, targets and recent-tab displays remain separate. URLs and titles are live browsing data, not suitable diagnostic payloads. The [diagnostic implementation](../../src/diagnostics/diagnostics.ts) deliberately accepts only bounded, limited metadata and is disabled by default.

## Test platform behavior in the platform

Chrome recommends loading the built extension into a browser for [end-to-end tests](https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing). ChromeReHome's browser tests exercise the delivered package in isolated profiles, with test-only instrumentation outside the package. Verify worker stop and revival explicitly; a browser run with a permanently inspected worker does not establish suspension behavior.

Test the declared minimum browser as well as a current release when qualifying compatibility. Features available only on newer Chrome versions need a verified fallback, not a raised assumption hidden in UI code. Browser tab state alone does not prove native operating-system focus or the origin of an external-app navigation. Use the appropriate headed or native evidence described in [testing](../testing/README.md).

Maintain this page when platform assumptions change, using [documentation maintenance](../maintaining-docs.md).
