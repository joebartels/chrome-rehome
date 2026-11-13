# Privacy and permissions

ChromeReHome reads tab URLs and browser navigation information to group pages and compare duplicates locally. It reads live titles and group information to display recent tabs. It does not inspect page contents, so it cannot detect unsaved edits.

The extension code does not send telemetry or make network requests. The packaged extension has no host permissions, content scripts, or debugger permission. These statements describe ChromeReHome itself; pages you open and Chrome's own services have their own behavior.

## What is stored

| Data | Where and why |
| --- | --- |
| Saved rules and Pause/Resume preference | Chrome's local extension storage. Rules include patterns, group names, origins, and ignored query names you enter. ChromeReHome does not use Chrome's sync storage. |
| Manual protection | Session storage records tab identifiers and normal/incognito context. It survives page navigation and worker suspension, but clears on extension or browser restart. |
| Recent tabs | Session storage keeps a bounded list of tab identifiers, separated into normal and incognito lists. Titles and groups are read from live tabs for display rather than saved as a history. |
| Recovery record | Session storage holds operation progress and tab/document identifiers so interrupted work can block further processing when necessary. It does not store page URLs or page contents. |
| Unsaved rules and preview input | Settings-page memory until you save rules or close/reload the page. Preview URLs are not saved, logged, fetched, or used to change tabs. |

URL-derived comparison values exist in memory while processing. Local settings can themselves contain sensitive addresses or names you have entered; review them before sharing.

## Why Chrome asks for permissions

The authoritative permission list is in [the manifest](../../manifest.json).

| Permission | Purpose |
| --- | --- |
| `tabs` | Read sensitive tab fields such as URLs and titles for matching and display. |
| `tabGroups` | Read groups and manage tab grouping. |
| `storage` | Save rules and activation locally; retain protection, recent-tab identifiers, and recovery progress for the session. |
| `webNavigation` | Observe eligible main-frame navigation and check document identity. |
| `contextMenus` | Offer the tab-strip protection toggle on Chrome versions that support it. |

ChromeReHome also uses Chrome's tabs API to move, select, and close tabs. Those actions do not each require the `tabs` permission; access to sensitive tab fields is the reason for requesting it.

Incognito access is optional and must be enabled in Chrome's extension details. Duplicate comparison, placement, protection, and recent-tab display keep normal and incognito contexts separate; the global Pause control covers both accessible contexts.

## Diagnostics and sharing

The extension's [diagnostic recorder](../../src/diagnostics/diagnostics.ts) is off by default. Its supported records contain an event code and optional numeric sequence or tab identifier, not URLs or page text.

Browser-level diagnostics are different. DevTools, automation traces, screenshots, and copied tab information can expose URLs, query tokens, titles, local paths, or account details. Inspect and sanitize anything you attach to an issue. Prefer a minimal reproduction using `example.com` and a disposable profile.

For the underlying storage implementation, see [settings storage](../../src/browser/config-storage.ts), [recent-tab state](../../src/browser/recent-tab-state.ts), [protection storage](../../src/browser/protection-storage.ts), and the [recovery record](../../src/execution/journal.ts).
