# Features and behavior

## Reuse your organization

For an eligible HTTP or HTTPS navigation, ChromeReHome keeps the incoming tab and its history. If an eligible duplicate is open, the incoming tab inherits that duplicate's window, group, and position. Your manual organization takes priority over a grouping rule, including an ungrouped location.

Without a duplicate, the first enabled matching grouping rule supplies a group title. ChromeReHome reuses an existing group with that exact title across windows in the same browsing context, or creates one in the incoming window. Existing groups with the same title are not automatically merged.

A foreground open selects the incoming tab and brings its destination window forward. A deliberate background open stays in the background.

## Replace duplicate tabs

After checking the documents and placement, ChromeReHome can close older duplicates one at a time. It compares URLs conservatively unless you add a [duplicate policy](rules.md#duplicate-policies). Two pages matching the same group rule are not necessarily duplicates.

Replacement is not an all-or-nothing operation. A tab can navigate between the last check and Chrome closing it, and earlier closures remain if a later step stops. ChromeReHome has no undo or rollback for the operation. Use manual protection for pages with work you need to retain.

## Pause and resume

The toolbar popup controls both automatic grouping and duplicate closure. **Active** means processing readiness has been checked. **Paused** means automatic processing is off.

Pause covers normal windows and incognito windows the extension can access. Already issued browser actions may finish after you pause. Resume applies to future eligible navigation, with no scan or replay of existing tabs. Ordinary page reloads are skipped; opening a fresh link is a better way to try a rule.

### Navigation does not always mean a click

Chrome's navigation information cannot prove that you deliberately opened a page. Some script-driven links and configured startup pages can qualify for automatic grouping and duplicate closure, including after the extension's background worker restarts. Skipping reloads does not guarantee that later scripts on a restored page are excluded. These navigations still have to pass the normal checks, but they do not always require a click.

Use **Pause** when you want automatic processing off, and [protect tabs](#keep-a-tab) whose contents you need to keep. The [navigation rules in source](../../src/background/navigation.ts) define which browser events qualify.

## Keep a tab

Select a tab and check **Protect this tab** in the popup. ChromeReHome does not inspect page contents or detect unsaved edits, so protect forms, editors, and deliberate duplicates yourself.

| Situation | Behavior |
| --- | --- |
| Pinned tab | Excluded from automatic placement and duplicate replacement. |
| Incoming tab is audible or manually protected | Automatic processing skips it. |
| An older duplicate is audible or manually protected | The incoming tab can still inherit its location, but all older duplicates remain for that operation. |

Manual protection follows the same tab through navigation, page reload, and background-worker suspension. It ends when the tab closes or is replaced, or when the extension or Chrome restarts. A new tab does not inherit an older tab's protection.

On Chrome versions that support the tab-strip menu, right-click a tab and choose **Toggle tab protection**. This affects only the tab you right-click, even if several tabs are highlighted. The popup remains available when that menu is unsupported. Both controls work while processing is paused.

The toolbar shows a lock badge for the selected protected tab. Background tabs have no custom marker; select the tab and open the popup to confirm protection.

## Recent tabs

The popup offers a short list of recently opened or selected tabs across windows. Background opens count, as does selection during a re-home. Click a row to switch to the existing tab and bring its window forward; a collapsed destination group opens so the tab is visible.

Recent tabs work while automatic processing is paused. They include web pages, local files, and new tabs, but are not a complete browsing history. The list clears when the extension or browser restarts and fills again as you open or select tabs.

## Incognito

To use ChromeReHome in private windows, enable **Allow in Incognito** in its Chrome extension details. Normal and incognito tabs stay separate for duplicate comparison, placement, manual protection, and recent-tab display. Global Pause applies to both.

Changing incognito access can reload the extension and clear manual protection. Recheck important tabs afterward. See [Privacy and permissions](../support/privacy.md) for what the extension reads and stores.
