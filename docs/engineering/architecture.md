# Architecture

ChromeReHome observes navigation, keeps the eligible incoming tab, and moves that tab before considering older duplicates for closure. It preserves the incoming tab's identity and history. Existing duplicate placement takes precedence over grouping rules so automatic work respects manual organization.

The browser remains authoritative. A snapshot is an observation assembled from asynchronous reads, not a transaction or a lock on tabs. Plans describe work that may still be permitted; they do not grant lasting authority to execute it.

## Responsibilities and dependencies

The [worker entry point](../../src/background/index.ts) composes the runtime. The options page and toolbar popup are independent entry points; neither imports worker orchestration. They share validated contracts and use browser adapters or messages for effects.

| Area | Responsibility and boundary |
| --- | --- |
| [Configuration](../../src/config/) | Validate, migrate in memory, and publish immutable settings. Browser storage is injected. Only the shared rule validators cross into rule code. |
| [Rules](../../src/rules/) | Compile grouping and duplicate-equivalence policies without browser access. Preview and production use the same semantics. |
| [Planning](../../src/planning/) | Select eligible participants, destinations and presentation from supplied observations. Planning can depend on rules, but cannot mutate Chrome. |
| [Execution](../../src/execution/) | Apply a plan through injected capabilities, recheck evidence, and record partial outcomes. It depends on planning, not browser globals or worker wiring. |
| [Browser adapters](../../src/browser/) | Translate Chrome APIs and events into the narrow operations needed by the runtime and UI. |
| [Background runtime](../../src/background/) | Own initialization, navigation currency, admission, serialization, controls and recovery. |
| [Options](../../src/options/) and [popup](../../src/popup/) | Own draft editing, preview and user interaction. Displayed state is not authorization for later mutations. |

The [package checker](../../scripts/check-package.mjs) enforces important import boundaries in source and bundle graphs, including type-only dependencies. These checks support review; they do not prove every possible dependency or security property.

## Navigation to mutation

Listeners register synchronously when the worker starts. Handlers then await configuration, protection and recovery readiness. The [coordinator](../../src/background/coordinator.ts) captures immutable state and serializes admitted work. Navigation generations, worker-local provenance and control changes invalidate old work rather than quietly updating its intent.

The [placement consumer](../../src/background/placement.ts) compiles captured rules, reads current browser state and selects candidates. Duplicate identity and grouping are separate decisions: matching a group does not make two URLs duplicates. Normal and incognito contexts remain distinct. [Chrome navigation metadata](../../src/background/navigation.ts) does not prove a deliberate user action: qualifying startup-page events and scripts reported as ordinary links can be admitted, including after worker restart. Rejecting ordinary reloads does not exclude every restored-page script. With duplicates, the existing anchor supplies placement; without one, grouping can reuse an exact-title destination in the same browsing context.

The [replacement executor](../../src/execution/replacement.ts) gathers document evidence, journals the operation, places the winner and verifies the resulting state. Closure requires its own eligibility and repeated checks. Older tabs close sequentially; each verified removal becomes part of the expected remaining state. A later failure retains that partial outcome. Missing evidence can prohibit closure even when placement remains valid; missing evidence essential to placement stops that placement.

Presentation is part of the plan. A foreground open may select the winner and focus its destination window; a deliberate background open preserves foreground state. Fresh checks prevent stale foreground intent from becoming a blanket permission to steal focus.

## Settlement and recovery

The [operation queue](../../src/background/operation-queue.ts) holds an operation until its promise settles. A timeout is not proof that a Chrome mutation stopped. Automatic mutation calls are not retried or rolled back, and queue capacity is not released by racing them against a timer.

The [journal](../../src/execution/journal.ts) records bounded participant identities and mutation settlement in session storage. It deliberately omits a replayable plan. On restart, [recovery](../../src/background/recovery.ts) may read current state and clear a settled record; it never replays placement or closure. A pending call, malformed record or failed journal storage keeps automatic work unavailable. A fresh snapshot showing the desired state does not establish that an outstanding call has settled.

Pause revokes admission through the control path without waiting behind the mutation queue. It cannot cancel a native call already issued. Clearing session storage by reloading the extension also does not prove settlement; a full browser restart is the reliable user-controlled reset for that uncertainty.

## Controls, persistence and presentation

The [control service](../../src/background/controls.ts) serializes supported configuration and protection writes. Rule saves preserve the current master activation setting. The options controller retains dirty drafts on conflicts and failed saves. Direct external storage writers remain outside this serialization.

Settings persist locally. Loading them does not rewrite migrations or replace invalid data with defaults. Protection and recovery records belong to the browser session, with validation before they authorize work. The [recent-tab tracker](../../src/browser/recent-tab-tracker.ts) separately stores bounded tab IDs by browsing context and resolves live display information in the popup. Its history is not replacement authority.

Badges, menu enablement and status notifications present verified state; they must not create execution authority. The popup's active status depends on runtime readiness as well as saved enablement. See [engineering principles](principles.md), [Chrome constraints](chrome-extensions.md), and [documentation maintenance](../maintaining-docs.md) before changing these boundaries.
