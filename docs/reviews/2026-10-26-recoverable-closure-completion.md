# Task 006: Recoverable closure and stale-work protection

Status: complete and locally verified on 2026-10-26. Paused before Task 007.

An eligible navigation now retains the winning tab and its history, verifies its final placement, then closes older duplicates one at a time after independent live document/snapshot checks. Configured grouping still overrides inherited location. Missing passive closure evidence leaves duplicates open while otherwise-valid placement can proceed. Default configuration remains disabled.

The session journal records bounded participant/document references and native mutation phases, with no URLs, duplicate identity keys, tracker epochs/generations, titles, configuration or error payloads. Every native call gets an awaited pending write, fresh preflight, actual settlement and authoritative verification. There is one mutation queue, no timeout release, retry, rollback or recovery replay. Storage failures block later mutation. Recovery abandons settled work and preserves/quarantines pending or malformed/future/unreadable records.

## Verification

- Fresh controller full Vitest: **855 tests across 26 files passed** after the global-absence fix.
- Fresh controller full Chromium: **94 passed**, zero skipped, unexpected or flaky results; **Chromium 156.0.8078.4**.
- Final cleanup: **855 tests**, typecheck, build and package checks pass; **66 affected recovery browser cases pass**, and scoped review is clean. Both formatted test files have identical minified compiled JavaScript to the pre-cleanup versions.
- Exactly five package files; schema3, Chrome 120 build target, permissions and dependencies unchanged.
- Evidence separates seven production closure cases, nine seeded production recovery cases, 25 actual worker-boundary cases, 30 controlled stale-event races and two simulated faults. The prior 21 browser cases remain included in the full 94.

The actual worker tests observe stopped/running state and loss of the old JavaScript realm; CDP target IDs can be reused. Seeded records prove admission behavior, not interruption inside native calls. Pending-before-call and native-fulfilled-before-settlement gates are labeled honestly. A deterministic real-browser stop while a native API call is actually outstanding remains unverified; deferred discarded-worker tests model late effects and confirm quarantine.

## Independent reviews

The task review found an Important target-absence defect: a fulfilled removal could leave the old tab alive in another window and still permit another close. Commit `historical-revision` adds a full-snapshot absence check before window filtering, with two red-to-green regressions for relocation and subsequent-bracket reappearance. Scoped independent re-review closed the finding.

The whole-feature review found no Critical or Important issue and identified two Minor cleanups: dense safety tests and an unused recovery presence calculation. Both were addressed together; final scoped cleanup review confirms both addressed with no new breakage. No review finding remains open.

- [Task review](2026-10-26-recoverable-closure-task-review.md)
- [Global-absence fix review](2026-10-26-recoverable-closure-fix-review.md)
- [Whole-feature review](2026-10-26-recoverable-closure-review.md)
- [Cleanup review](2026-10-26-recoverable-closure-cleanup-review.md)

## Chrome trial

**Pause the existing configuration before reloading this build: an already-enabled installation now permits duplicate closure. Use a disposable Chrome profile.**

Load or reload `<repository>/dist` from `chrome://extensions`. The [README controlled replacement trial](../../README.md#controlled-replacement-trial) provides complete backup/export, pause-before-reload, explicit trial configuration, restore and inheritance/override cases. It replaces configuration only through the displayed manual command; keep the exported backup across DevTools/worker reloads.

For the simplest visible case, enable the documented `https://example.com/*`→`Trial` rule and open `https://example.com/` twice in separate ordinary tabs. The newer tab should stay in Trial and the older duplicate should close after verification. Confirm unrelated tabs remain and use Back after an ordinary in-tab link to verify winner history. Disable the extension or set enabled:false to stop future work. Do not erase the journal to force continuation; fully restart Chrome if interrupted native work quarantines processing.

There is no unsaved-form protection yet, and Chrome has no atomic URL/document-and-close predicate. Previously verified closures remain closed if later work stops. Native focus/active/collapse effects may occur; the extension never explicitly sets them. Pinned/pending/known-shared participants and stale evidence cause conservative skips. Ordinary-link script ambiguity from Task 004 remains.

Chrome 120/current-stable runtime, enabled-incognito, actual mouse drag/rejection and user-facing focus/collapse checks remain manual and unverified. This is an explicitly enabled controlled trial, not a default-enabled or general-release readiness claim. Tasks 007–010 remain TODO.

## Rulings I made

- Keep existing schema3 enabled flag as placement-and-closure opt-in, with pause-before-upgrade and disposable-profile trial instructions — Task006 authorizes closure and existing schema already owns activation — cost if wrong: enabled005 installs begin closing duplicates after reload; no form/audible protections until008.

- Recovery abandons settled work without replay and quarantines all mutations for the storage session on pending/invalid/unreadable journal; recommend full Chrome restart for unresolved native work — no observation can prove a terminated worker's native call settled — cost if wrong: conservative session-wide loss of automatic placement/closure until reset, rather than unsafe retries.

- Persist only bounded native participant/context/document references and phase/ordinal, keeping strict href/identity/config/tracker evidence memory-only; cap100 participants and skip larger operations — preserve privacy/epoch contracts and bounded recovery — cost if wrong: no resumed completion and large duplicate sets remain untouched.

- Require independent evidence for every duplicate before closure, but unavailable passive evidence/shared passive groups allow otherwise-valid placement; credit only explicitly issued onRemoved IDs while preserving irrevocable stale-view invalidation — preserve005 behavior and stop unsafe/competing work — cost if wrong: conservative incomplete replacement/partial effects; final check-to-native-call race remains.

## Saved work

Local branch: `recoverable-closure`; final code commit `historical-revision` (global-absence fix `historical-revision`, implementation `historical-revision`, design `historical-revision`); completion bookkeeping is committed separately. No push, merge or publication. The canonical [design](../superpowers/specs/2026-10-26-recoverable-closure-design.md), [plan](../superpowers/plans/2026-10-26-recoverable-closure.md), [Task006](../tasks/todo/006-recoverable-closure-and-stale-work-protection.md) and [architecture](../architecture.md) record the contracts and remaining boundaries.

Detailed implementation reports, logs, compiled-output proof and native JSON evidence are archived in `EXTERNAL_EVIDENCE/recoverable-closure-verification-evidence`.
