# Task008 — pause controls and replacement protections

Status: final review and independent verification in progress. Task009 has not started.

## Behavior

The toolbar popup now exposes actual readiness, global Pause/Resume, Protect this tab and Open settings. A single worker-owned command writer handles controls and rules-only editor saves. Pause invalidates queued/in-flight authority before persistence waits; Resume only admits future eligible navigation. It never scans existing tabs or replays old work. Rules saves preserve the current master flag, and enabled-only changes preserve dirty rule drafts. Fresh installations remain paused; existing rules and activation remain preserved.

Protection is manual and session-only. It follows navigation/reload and worker suspension, and ends on tab close/replacement or extension/browser restart. There is no page inspection or automatic unsaved-edit detection. Pinned exclusions remain. Audible/protected incoming tabs skip processing; an older audible/protected duplicate retains its manual location priority and makes the whole operation retain all older duplicates while otherwise-valid placement can proceed. Live audio/protection changes revoke further mutation authority.

The popup never claims Active from saved enablement alone. Unavailable and recovery-blocked states disable unsafe actions while preserving a valid explicit Pause path. Read-only Refresh cannot heal failed persistence or clear quarantine. No native calls are retried, rolled back or released by timeout. Already-issued effects can finish after Pause, and Chrome has no atomic final-check-and-remove API.

The protection registry stores only bounded tab IDs and incognito flags in storage.session. No URLs, titles, form content or browsing history are added to persistence. The strict package expands to eight files with separate worker/options/popup JS bundles. No permissions, host permissions, dependencies, content scripts, config schema changes or default activation were added.

## Verification and review

The focused007b audit found no product correctness issue or timing workaround. A small test-cleanup defect was repaired with a throwing-helper regression. Its same-URL history, native foreground/background and external-app link cases remain in the regression suite.

Task1 control authority passed independent spec/quality review. Task2 protections passed after two independently found safety defects were fixed and scoped re-reviewed: rule saves could clear an unrelated fault gate, and a same-URL document replacement during an awaited target read could accept an obsolete receipt. Failure gates are now scoped, and transient target observations span reads and persistence without globally invalidating status reads.

Final Task3 and whole-branch review results, fresh commands, browser counts and artifact hashes will be recorded here before completion.

## Chrome walkthrough

1. Rebuild if needed, then reload ChromeReHome in chrome://extensions. Load the repository dist directory, not the source tree. Pin and click the toolbar icon. Existing activation/rules remain; manually protected tabs must be protected again after reload.
2. Open settings and save https://example.com/* → Trial. Click Resume and wait for Active. Open a fresh matching link, including from iTerm2, and verify grouping. Reopen the exact URL: the new tab inherits the old location and the verified older tab closes.
3. Click Pause, then open a fresh matching link: no grouping or closure occurs. Resume does not process that paused-era tab. Ordinary reloads remain intentionally excluded. Close the extra paused-era tab before later duplicate or rule-only tests.
4. Select one example.com tab, check Protect this tab and reopen its exact URL. The incoming tab inherits its location but both remain. Any protected/audible older duplicate retains all older duplicates for that operation. Uncheck protection and use a fresh eligible navigation to allow later replacement.
5. Navigate/reload the protected tab and verify protection remains. Stop/revive the worker if desired: it remains. Extension/Chrome restart ends it. This is the manual protection mechanism for unsaved edits.
6. For cross-window focus, keep the destination group in window1 and an ungrouped source tab in window2. Remove older duplicates of the test URL first. A normal foreground link should move into the existing group and focus its window/tab; a deliberate background open stays in the background. Existing duplicate location always outranks a grouping rule.
7. If testing incognito, explicitly allow extension access in Details first. That change may reload the extension and clear session protection. Normal/private tab protection and duplicate identity remain separate; global Pause covers both accessible contexts.

## Decisions made during execution

- Manual protection substitutes for automatic form-edit detection, avoiding page access; the cost is that users must explicitly protect pages with edits.
- One older protected/audible duplicate prevents all older duplicate closure while preserving anchor placement; the cost is that extra older duplicates may remain.
- Protection is session-only across worker suspension and ends at extension/browser restart; the cost is re-protecting tabs after reload/update or Chrome restart.

## Remaining backlog

Task009 regression/default-activation work and Task010 release/performance checks remain pending. Chrome120 and current-stable release-matrix execution, hosted CI and interactive drag/rejection trials are not claimed. Task011 records the requested future bounded recent-tabs popup across windows; no recent-tab tracking/list is implemented in Task008.
