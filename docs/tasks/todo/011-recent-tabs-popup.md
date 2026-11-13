# 011: Recent tabs across windows

Status: Implemented in 0.1.4.

Clicking ChromeReHome shows up to eight currently open tabs recently created or selected in eligible normal browser windows. The popup includes web, local file and new or blank tabs. Background opens and browser selection during re-homing count. Moving a tab without selecting it preserves its rank. Window focus alone does not rank a tab. The feature works while automatic processing is paused.

The worker records up to 32 IDs per normal or incognito context in session storage. Entries survive worker suspension, and extension or browser restart clears them. The list is populated by observed browser events. Browser settings and extension pages are hidden when the popup reads live labels. Their recent IDs can occupy slots in the bounded list. Tab URLs, titles, and labels are read live and are never persisted by this feature.

Selecting a row activates the same tab and brings its current window forward. It reveals a collapsed group when needed and preserves the tab’s navigation history. The popup validates live tab and window context before reading labels and again before switching. It refreshes after relevant changes and reports an unavailable tab if the switch can no longer proceed. Incognito rows require the existing Chrome incognito permission and are isolated from the normal popup.

## Verification

The browser test failed on 0.1.3 because no recent IDs were saved. The final 0.1.4 package passed typecheck, 1,420 unit and integration tests, and the strict package check. The affected Playwright run passed 38 checks in disposable profiles using Chromium 156.0.8078.4. This included the real action popup for same-window and collapsed cross-window selection, actual re-homing and ranking, separation of normal and incognito entries, and rehydration after a forced worker stop. The browser run had zero skips and retries. Independent review approved the stale-selection and label fixes. The feature uses APIs available at the declared Chrome 120 floor. The Task 011 browser run used Chromium 156.
