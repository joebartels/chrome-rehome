# 011: Recent tabs across windows

Status: TODO — requested 2026-10-28; record only, not part of Task008 implementation.

Depends on: 008 toolbar popup; existing cross-window activation/focus primitives.

## Outcome

Clicking ChromeReHome shows the most recent currently open tabs across all eligible Chrome windows, helping the user find a tab after re-homing changes its window or position.

## Proposed scope to settle when implementing

- Show the most recent `n` tabs; decide a small default and whether `n` is configurable.
- The request mentions both recently opened and last active tabs. Decide whether the default is recent activity (open/activation), with a separate recently opened ordering, rather than silently equating those concepts.
- Selecting an entry activates the existing tab and focuses its window, revealing a collapsed group as needed. Preserve identity/history; do not navigate, reload, duplicate or re-home it merely because it was selected.
- Use current live titles, URL labels and group/window context so entries are recognizable. Handle tabs closed or moved while the popup is open.
- Keep normal/incognito contexts separate and respect extension incognito access. Do not disclose private entries to an unrelated browsing context.
- Prefer bounded session-only recency IDs/timestamps and live metadata. Decide worker restart/browser restart behavior; avoid persisting browsing URLs/titles by default or adding a history permission without a demonstrated need.
- Extend the Task008 popup as a separate recent-tabs section/model. Keep recency tracking independent of matching, placement, pause/protection authority and the replacement journal.

## Regression coverage

Cross-window focus, background tab creation, manual activation, re-homing, closed entries, duplicate titles, collapsed groups, worker suspension, bounded eviction and normal/incognito isolation. Decide whether extension-induced activation counts as recent activity and test it explicitly.
