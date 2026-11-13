# Troubleshooting

Start with the toolbar popup. Its processing status reflects readiness; the settings page's enabled message reports only the saved preference.

## Nothing happens after saving rules

Check for **Active** in the popup. Saving rules does not resume a paused installation. Choose **Resume** from **Paused**, then open a fresh matching link. Resume does not process tabs opened while paused, and ordinary reloads are skipped.

If the popup is Active, check these common causes:

- The incoming tab is pinned, audible, or manually protected.
- The URL does not match an enabled rule. Use [Matching preview](../users/rules.md#preview-before-saving) to check.
- An existing duplicate supplies a different group or window. Its location takes priority over the grouping rule.
- Chrome cannot provide the document information needed to verify the operation, or a navigation or tab change interrupted the checks. Try a fresh link after the tabs settle.

Only HTTP and HTTPS pages participate in automatic grouping and duplicate replacement. A local file can appear in Recent tabs without being eligible for those operations.

## The popup says Processing unavailable

Choose **Refresh status** to reconnect or read the current status. Refresh does not repair settings or change activation.

If status is available but readiness could not be verified, an explicit **Pause** may establish a verified paused state after an ordinary storage or target failure. Startup verification failures can remain unavailable for that background worker. Check the settings page for an invalid configuration, unavailable storage, or a configuration requiring a newer extension.

Keep any unsaved rule edits before reloading the settings page. If stored settings are invalid or unsupported, preserve the stored data and report the exact message with sanitized reproduction steps; there is no backup/import control in the editor. If the message says the configuration requires a newer extension, update ChromeReHome. Do not hand-edit version fields to bypass the check.

## The popup says Recovery blocked

ChromeReHome stopped because it could not establish that an interrupted operation had settled. Pause/Resume, waiting, or restarting only the extension's background worker cannot prove that an outstanding Chrome action has finished.

Save your work, explicitly choose **Pause** if available, and fully quit and restart Chrome before trying again. Closing one window is not a full restart. For an unresolved native browser call, a full browser restart is the reliable user-controlled reset. Reloading or disabling the extension can clear session state without proving the call settled, so do not use that as a recovery shortcut. Never erase the recovery journal to force continuation.

After restarting, check status, protect important tabs again, and explicitly resume only when ready for a fresh trial. If processing remains blocked or unavailable, leave it paused and report the status. Recovery does not roll back tab moves or restore duplicates already closed.

## A duplicate stays open or moves somewhere unexpected

Check [tab protections](../users/features.md#keep-a-tab): an older audible or protected duplicate can prevent closure while still supplying the incoming tab's location. Pinned tabs are excluded entirely.

Use two URLs in preview to check your [duplicate policy](../users/rules.md#duplicate-policies). URL differences or separate normal/incognito contexts can keep pages distinct; matching the same group rule does not make them duplicates.

Existing duplicate placement outranks group rules. For a rule-only test, use a URL with no duplicate already open. Same-title groups are reused but are not merged automatically.

## Protection is missing

Manual protection is [session-only](../users/features.md#keep-a-tab). After reloading or updating ChromeReHome, restarting Chrome, or changing incognito access, select each important tab and confirm **Protect this tab** in the popup. A new tab does not inherit the old tab's protection.

If **Toggle tab protection** is absent from the tab's right-click menu, use the popup. The menu needs native support from Chrome; its absence does not by itself mean automatic processing is broken.

## Recent tabs are empty or a row no longer works

The list clears on extension and browser restarts. Open or select web, local-file, or new tabs to populate it again. It is a recent-tab list, not a full inventory or browsing history. Normal and incognito windows show separate lists.

A tab may close or move while the popup is open. Reopen the popup or use **Retry recent tabs** if offered. Automatic processing can remain paused while you use this list.

## Report a reproducible problem

Include the extension version shown at `chrome://extensions`, Chrome version, operating system, popup status, and a short sequence of actions with expected and actual results. Reproduce with `example.com` URLs or a disposable profile when possible.

Remove private URLs, query tokens, page titles, group names, account details, and local paths from screenshots or diagnostics before posting them. Browser traces and DevTools output can contain browsing data even though extension diagnostics are limited. See [Privacy](privacy.md) and the [testing guide](../testing/README.md).
