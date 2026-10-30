# Protection UI feedback and current Chrome limits

The user confirmed all008a native functional checks, but finds simultaneous Protect/Unprotect menu entries confusing and requests only the state-appropriate action plus a lock on protected tab handles.

Chrome's documented [context-menu API](https://developer.chrome.com/docs/extensions/reference/api/contextMenus) has onClicked but no before-opening/onShown event identifying the right-clicked background tab. Selected-tab events cannot identify an already-highlighted right-clicked target reliably, especially with multiselection or equivalent-URL tabs, so they cannot safely choose a per-target label. A neutral **Toggle tab protection** action can resolve the clicked target's actual state when invoked, but cannot advertise that state before the click.

The [tabs.update API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-update) exposes no native tab-title/favicon/custom badge setter. A lock in the actual tab strip would require modifying page title/favicon via page access, with page-update/lifecycle tradeoffs. The existing scope intentionally has no page injection. The supported native alternative is [per-tab toolbar action state](https://developer.chrome.com/docs/extensions/reference/api/action#per-tab_state): a lock/icon/badge on ChromeReHome's toolbar icon for the selected tab, not a visible marker on background tab handles.

Root asked the user to choose single neutral toggle+toolbar lock versus explicit pair+toolbar lock, clearly stating these limits. No fallback was silently selected, no page permissions were added, and no new UI source has been written. Task009 remains paused.
