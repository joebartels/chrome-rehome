# 006: Recoverable closure and stale-work protection

Status: complete — implemented and locally verified on 2026-10-26

Depends on: 005

## Outcome

Enable older-duplicate closure only after successful placement, precondition revalidation, and restart recovery are implemented together.

## Integration points

execution/replacement.ts; execution/journal.ts; background/recovery.ts; storage.session adapter.

## Acceptance criteria and decisions

- [x] Define a small versioned journal with bounded participants/document IDs, native mutation ordinal/pending state and completed phase; keep URL identity and tracker generations exclusively in memory. Treat live Chrome state as authoritative.
- [x] Revalidate winner and each duplicate immediately before removal; abort stale plans when any participant navigates or disappears.
- [x] Document the residual race: Chrome has no atomic compare-URL-and-close API. Minimize it and never claim full transaction guarantees.
- [x] Never release a mutation queue because Promise.race timed out while its underlying browser call can still mutate.
- [x] Test worker termination after each phase, journal write failures, placement/removal failures, a participant navigating mid-operation, event feedback, and competing winners. No closure on ambiguous recovery.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.

## Product decisions before enabling closure

Existing schemaVersion3 `enabled:true` becomes closure-enabled on loading this build. Configuration still defaults to disabled; there is no second enable flag, migration write or new control. README begins with the pause-before-reload warning and retains disposable-profile backup/disable/enable/pause/restore instructions. Options describes replacement/possible closure and statically warns that interrupted operations may pause processing until Chrome restarts; it does not claim recovery readiness.

The production consumer wraps placement and closure in the coordinator's sole queue. A maximum 100 participants (one winner plus 99 duplicates) is accepted; larger selections skip all mutation. No truncated selection, retry, rollback, fallback anchor/winner, recovered mutation or timeout queue release is allowed. Every native promise must actually settle before the queue can advance. No Task007 rule editor or Task008 unsaved-form protection is included.

The independent closure read obtains active frame0 documents for every passive duplicate, bracketed by coherent normal-window snapshots and the original config/event/view lease. Missing/error/nonactive/subframe passive evidence or a known shared passive group makes closure ineligible while preserving otherwise-valid configured placement. The winner and used inherited anchor retain all Task005 placement checks. After placement, closure compares the immutable verified receipt minus only verified removals; it never adopts a fresh baseline. All remaining participants and affected-window survivor order, native URL, location, membership, context, pending/pin state and group title/color/shared metadata are checked before each single-ID removal. Empty groups/windows may disappear only through known removals.

Chrome exposes no atomic URL/document-and-close predicate. Snapshot/document brackets and the immediate original lease check minimize the final check-to-call race but cannot eliminate it. A same-URL new document, relaxed-equivalent changed URL, competing navigation, configuration unpublication or unrelated event cancels further destructive work. An external close of the exact armed duplicate during the native call interval cannot be distinguished from our own event. Each issued duplicate earns exactly one onRemoved credit; no event rebases a stale lease, and both replacement APIs are always invalidating. Existing native focus/active/collapse effects remain accepted and are never explicitly set.

Only `storage.session.chromeReHomeReplacementJournal` is used, with trusted-context access unchanged. Exact strict v1 fields are version, operationId, participants, completedPhase, sequence, pending, removedTabIds and terminal. IDs/context/document IDs are sensitive session metadata; retain one bounded record only. There are no timestamps, URLs, hashes, opaque duplicate identities, titles, configuration, errors, tracker Symbols or numeric tracker generations in storage. Limits are 100 participants, 99 removed IDs, 128 code units/string, 65536 JSON characters and 105 mutation ordinals. Removed IDs are a duplicate-order prefix. Pending records target the winner for placement or the next older ID for removal. `prepared` precedes native work; every native call has durable pending, fresh full preflight, actual settlement on resolve/reject, authoritative verification and a completed-phase write. A failed write/read/clear blocks further mutation without repair writes. A still-live worker may abandon a preflight cancelled after pending persistence because it knows no native call was issued; a restarted worker cannot make that inference.

Task002's prohibition on persisting URL-derived identity remains intact. Native document IDs in the journal attest only earlier browser observations, not same-document href freshness or navigation ordering. Those preconditions remain in the frozen in-memory plan and tracker/config leases. A new worker has a fresh Symbol and cannot replay any old closure, even with matching document IDs.

## Startup admission table

Listeners register synchronously before configuration/recovery initialization. Configuration loading and a recovery job on the sole queue join before consume admission. Synchronous event observation/invalidation still revokes work during either pending read. Recovery runs for disabled/unavailable/future configuration too and never changes configuration or invokes a native mutation.

| Session record | Startup action |
| --- | --- |
| Missing | Ready after a successful read. |
| Valid, pending null, any settled/nonterminal/terminal phase | Await one read-only live snapshot as the reconciliation gate, discard old work, clear record, then ready. Participant presence never authorizes replay. Read/clear failure blocks. |
| Valid, pending native mutation | Preserve record and quarantine all automatic mutation for this storage session. Matching IDs, absence, late events, time, config toggles and worker restarts cannot prove settlement. |
| Malformed, future version or unreadable storage | Preserve contents without overwrite/migration/clear and quarantine all automatic mutation. |

A terminal-plus-pending record is invalid. A full browser restart is the reliable user-controlled reset for ambiguous native work, followed by an explicit fresh trial. Extension disable/reload/update can discard session data, but cannot itself prove a pending native call settled; never erase the key or automatically reload to force progress.

## Evidence boundaries

Production dist verifies real closure/order/history and disabled/grouping-only retain-all behavior. Seeded public-session recovery tests verify quarantine/abandonment after actual worker stop/start, without claiming native interruption. The temporary phase fixture bundles actual production modules and stops real workers after durable phases, including repeated move ordinals/final reorder and native-remove-fulfilled-before-settlement. Pending-before-call and fulfilled-wrapper gates are identified honestly. No deterministic stop inside a still-outstanding native Chrome API call is claimed; the deferred unit test reconstructs a new tracker/coordinator/queue with the old call unresolved and demonstrates quarantine even after its late effect/event. Controlled rejection tests are labeled simulated. All fixture controls remain outside production source/dist.

Manual disposable-profile Chrome 120/current-stable, enabled incognito, actual drag and user-facing focus/collapse checks remain outstanding. Historical Task005 reports retain their placement-only retain-all claims as evidence of that previous phase.

## Completion evidence

Delegated implementation and independent task/whole-feature reviews are complete, including scoped reviews of the global-target-absence fix and final readability cleanup. No finding remains open. Verification: 855 unit/integration tests, 94 full Chromium cases after the safety fix, 66 affected recovery cases after cleanup, plus typecheck/build/package checks. Both formatted test files compile identically to their pre-cleanup versions. See [completion and Chrome trial](../../reviews/2026-10-26-recoverable-closure-completion.md) and [README trial steps](../../../README.md#controlled-replacement-trial). Paused before Task 007; manual capability limits above remain unverified.
