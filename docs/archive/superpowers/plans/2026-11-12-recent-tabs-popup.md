# Task 011 Recent Tabs Popup Implementation Plan

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../../README.md).

**Goal** Show the eight most recently opened or selected live tabs from the popup, across normal browser windows in the same browsing context.

**Design** Use tab creation and activation events, including browser selection caused by re-homing. Preserve the tab ID across movement. Record only bounded ordered IDs in session storage, clear on extension or browser restart, and hydrate labels from Chrome on demand in the popup. Chrome 120 supports the event-based path. Only observed events rank entries. This is an independent UI action and never calls the navigation, journal, or placement pipeline.

- [x] Worker tracks creation, activation, removal and replacement in serialized order. Keep separate normal/incognito ID lists, cap at 32 per context, filter all displayed metadata against the popup window's live context. Persist only IDs. Verify suspension and lifetime behavior.
- [x] Popup independently loads eight live rows with title, site, and window/group context. Verify context again on click, follow the latest window, reveal a collapsed group and focus/select the existing tab. Recover from stale tabs and show load/empty/error states. Keep existing controls usable.
- [x] Integrate, independently review, bump to 0.1.4, build and verify the strict package. Exercise existing Chrome controls and recent-tab behavior in a disposable browser profile.
