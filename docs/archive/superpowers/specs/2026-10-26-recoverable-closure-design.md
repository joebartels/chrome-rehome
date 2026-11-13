# Recoverable closure and stale-work protection

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../../README.md).

Task006 design, grounded in Task005 at `historical-revision`; implementation is authorized and ends before Task007. Preserve Node24, Chrome120+, schemaVersion3, permissions, dependencies and the default-disabled configuration.

## Product behavior and limits

When existing `enabled:true` configuration is loaded, eligible navigation may now place the existing winning tab and close its older duplicates. Placement must finish and be authoritatively verified before any close. A successful no-op placement can also authorize closure after independent evidence is acquired. A lone winner still groups normally. No tabs are recreated; the winning ID and history survive. Configured grouping still overrides inherited location. Native focus, active state and collapse effects remain accepted; never explicitly change them.

Closure is sequential, one duplicate ID per native call, in existing selector duplicate order. The whole candidate set must have sufficient evidence before the first close. If any participant becomes stale, a read/write fails, removal rejects, or configuration becomes unpublished/disabled, stop immediately. Already-closed tabs remain closed; surviving tabs are retained. No retry, rollback, fallback winner, replacement anchor, or delayed continuation. Missing passive-duplicate evidence prevents closure but does not prevent otherwise-valid Task005 placement.

Recovery means examining/abandoning incomplete work safely, never replaying old mutations. A restart cannot recover the prior tracker Symbol, observation ordering or raw-URL freshness. Persisted document IDs are evidence of previous observations, not permission to close. Every subsequent replacement starts from fresh eligible navigation and a new plan.

There is a final check-to-call race: Chrome's `tabs.remove(tabId)` has no atomic URL/document predicate. Navigation can begin after the last read and before Chrome processes removal. Bracket document reads with snapshots, check the event/config/view lease immediately before the call, and describe the residual race honestly. There are no transaction guarantees. Current eligibility does not detect unsaved forms or all important tab state; those broader protections remain Task008. Recommend disposable-profile trials.

**Upgrade consequence:** an already-enabled Task005 installation becomes closure-enabled on loading this build. README must lead with “Pause your existing configuration before reloading this build; enabled mode can now close duplicate tabs.” Retain schema3 rather than inventing a second enable flag or migration. Do not operate the user's personal Chrome.

## Ownership and interfaces

Keep pure matching/planning unchanged. Existing `createPlacementExecutor` remains queue-free and retains every phase guard. New `execution/replacement.ts` orchestrates evidence capture, journaled placement and closure inside the same coordinator job. New `execution/journal.ts` owns strict structural journal parsing and serialized writes through an injected storage port. `browser/journal-storage.ts` is the only session-storage adapter. `background/recovery.ts` owns startup reconciliation/admission. `background/navigation.ts` provides a narrow removal-aware view lease; it does not suppress tracker events. `browser/placement.ts` extends its native port with `removeTab(tabId)` forwarding exactly `tabs.remove(tabId)`.

Contracts (structural, no browser/background imports in execution):

```ts
type ReplacementPort = PlacementPort & { removeTab(tabId:number):Promise<void> };
type ReplacementGuard = PlacementGuard & {
  expectRemoval(tabId:number):void;
};
type PlacementCheckpoints = {
  beforeMutation(phase:MutationPhase):Promise<void>;
  afterSettlement(phase:MutationPhase):Promise<void>;
  afterVerification(phase:MutationPhase):Promise<void>;
};
type JournalStorage = {
  read():Promise<unknown>;
  write(value:ReplacementJournal):Promise<void>;
  clear():Promise<void>;
};
type ReplacementResult =
  | Readonly<{kind:'completed'; placement:PlacementResult; removedTabIds:readonly number[]; closure:'completed'|'ineligible'}>
  | Readonly<{kind:'stopped'; phase:'evidence'|'journal'|'placement'|'closure'; cause?:unknown; placement?:PlacementResult; removedTabIds:readonly number[]; uncertainRemovalId?:number}>;
```

`createPlacementExecutor({port, checkpoints?}).execute(plan,guard)` keeps its signature; the optional checkpoints allow existing isolated placement users to stay journal-free. Successful `PlacementResult` gains `snapshot:PlacementSnapshot`, a detached frozen copy of its final verified snapshot. This is an observation receipt, not future authority. Failed/skipped outcomes remain as today. The production path always supplies checkpoints through the replacement executor.

`createReplacementExecutor({port,journal}).execute(plan,guard):Promise<ReplacementResult>` consumes an already-frozen Task005 plan. `createReplacementJournal({storage,createOperationId}:{storage:JournalStorage;createOperationId():string})` exposes `load():Promise<JournalRead>`, `begin(participants:readonly JournalParticipant[]):Promise<void>`, `beforeMutation(kind:JournalMutation,tabId:number):Promise<void>`, `settled():Promise<void>`, `verified(phase:ReplacementJournal['completedPhase'],removedTabId?:number):Promise<void>`, `finish(outcome:'completed'|'abandoned'):Promise<void>`, `clear():Promise<void>`, `isBlocked():boolean`. `begin` creates a random operation ID using the injected factory supplied by background (`crypto.randomUUID`), keeping execution independent of browser globals and making tests deterministic. Only one transaction may exist. No writes run concurrently.

`createRecovery({journal,port}).initialize():Promise<void>` performs the bounded read-only startup reconciliation and exposes `isReady():boolean`. Coordinator accepts optional `recovery:{initialize():Promise<void>;isReady():boolean}` for existing tests/fixtures; production always supplies it. Configuration remains a separate repository.

## Small session journal and privacy

Use only key `chromeReHomeReplacementJournal` in `chrome.storage.session`. Do not call `setAccessLevel`; default trusted-context access remains. No `storage.local` journal, per-operation history, timestamps, log payloads, URL strings, identity keys, URL hashes, group titles, config copies, stack traces or error text. Session storage survives service-worker restart but is cleared by browser restart or extension disable/reload/update ([Chrome storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage)). Browser tab IDs, context and native document IDs are still sensitive session metadata; retain at most one bounded record and clear it on safe completion/abandonment.

Exact v1 record:

```ts
type JournalMutation = 'ungroup'|'move'|'group'|'title'|'remove';
type JournalParticipant = Readonly<{tabId:number;incognito:boolean;documentId?:string}>;
type ReplacementJournal = Readonly<{
  version:1;
  operationId:string;
  participants:readonly JournalParticipant[]; // first is winner; remaining are duplicates
  completedPhase:'prepared'|'ungroup'|'move'|'group'|'title'|'placed'|'removed'|'completed';
  sequence:number;
  pending:null|Readonly<{sequence:number;kind:JournalMutation;tabId:number}>;
  removedTabIds:readonly number[];
  terminal:null|'completed'|'abandoned';
}>;
type JournalRead = Readonly<{kind:'empty'}>|Readonly<{kind:'valid';value:ReplacementJournal}>|Readonly<{kind:'invalid'}>;
```

Reject unexpected keys at every level; reject malformed/future versions, inherited properties masquerading as fields, sparse arrays or extra array properties, unsafe/negative IDs/counters, duplicate participants, missing winner document evidence, mixed contexts, duplicate/foreign/winner removed IDs, impossible pending target/sequence and terminal-plus-pending combinations. All strings are nonempty and at most128 code units; record at most100 participants, at most99 removed IDs, at most65536 JSON characters. Bound raw serialized size before detailed validation; serialization failures are invalid. Sequence starts0, increments once per attempted native mutation, maximum105 (five placement mutations including final reorder plus99 removals leaves headroom); pending sequence equals record sequence. Removed IDs must be an ordered prefix of duplicate IDs; remove pending targets the next ID. Placement pending targets the winner. Generated records exceeding these bounds cause a conservative no-mutation skip; do not truncate participants. This deliberately means a selection with100 or more older duplicates receives neither placement nor closure; document the limit as a conservative trial cost. Optional duplicate document IDs mean closure evidence unavailable, not permission to invent one.

The “identity/generation preconditions” split is intentional: strict native href, opaque duplicate identity, tracker Symbol/generations and config revision stay exclusively in the in-memory plan/lease. The journal records browser document identity and operation phase/ordinal; it cannot attest same-document URL generation. Consequently no restart resumes a closure, even if document IDs match. Document this explicitly in Task006 rather than weakening Task002's prohibition on persisting identity keys. No Symbol or numeric tracker generation crosses worker lifetimes.

## Write-ahead ordering and queue safety

All production mutations, including grouping-only placement, are covered. Before placement, acquire optional independent document evidence for every duplicate, bracketed by snapshots and the original lease. Retain raw URL/document observations only in memory. Catch unavailable passive documents as closure-ineligible; preserve valid configured placement. A genuine lease/snapshot conflict still stops the plan. Persist `prepared` with participants before the first native mutation.

For each native mutation, including final reorder:

1. Write/await `pending` with incremented sequence before calling Chrome.
2. Perform the complete existing fresh preflight again after that journal await. Recheck guard immediately before the native call. Never let a journal await widen the last validation-to-call window.
3. Invoke exactly once and await actual native settlement. On both resolve and reject, await `settled()` to persist `pending:null` before returning/rethrowing. If the native call rejects, preserve its original cause; a bookkeeping failure additionally blocks admission without replacing the original cause.
4. After successful native settlement, perform existing authoritative postverification. Only then persist `completedPhase`. Recheck guard after that write before further native work.

If a pending marker was written but preflight cancels before invocation, it is safe for this still-live worker to clear pending, mark abandoned and clear. It knows no call was issued. A restarted worker does not know that and must quarantine.

Any storage read/write/clear rejection blocks all further mutations in this worker; preserve whatever durable record exists, do not attempt “repair” writes after an ambiguous failed write. The current native call, if already issued, must still settle before the sole queue releases. Native and storage calls are never wrapped in timeout-based queue release. If a call never settles, the queue remains occupied. A later worker starts with a fresh in-memory queue but must honor the persisted barrier before admitting work. This addresses unexpected worker termination documented by [Chrome's worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

After successful placement persist `placed`; then closure may proceed. On final success write terminal completed then clear; after safe failure with no pending call write abandoned then clear. A finish/clear failure blocks admission. Stop outcomes expose verified removed IDs and the uncertain attempted removal ID; diagnostics emit only existing redacted `operation-failed`.

## Independent closure evidence and invariants

Do not promote placement success or a passive duplicate's URL into closure authority. Before placement obtain active frame0 evidence for every duplicate, independently of Task005's winner/used-anchor reads. All must satisfy `validDocument` against original tabs and any existing navigation token. An unavailable/error/nonactive/subframe document means placement can continue but all closure is skipped. A passive duplicate in a known shared group also makes closure ineligible; configured placement may still proceed because that group is not modified by placement.

After placement, start from its verified snapshot receipt, not an arbitrary newly-read baseline. Maintain expected state separately from the immutable plan/receipt. Before each close, bracket fresh document reads for the winner and **all remaining duplicates** with coherent normal-window snapshots. Each must match captured native URL, context, pinning=false, absent `pendingUrl`, active outermost frame/error=false and the originally captured document ID; existing navigation tokens remain valid. Check the original config/event/removal-aware view lease around every await. Recompute duplicate equivalence using the already-captured compiler in the background/evidence construction if needed; strict original href equality remains mandatory regardless of relaxed policy.

Compare snapshots with the placement receipt minus only already-verified removed IDs. Preserve remaining IDs, windows, group membership, native URLs and relative order in every affected window, not just winner/anchor windows. All remaining duplicate locations are guarded. Index changes must equal the shifts caused by our removals, never be silently rebased. Preserve group title/shared/color metadata; permit only the expected disappearance of groups/windows emptied by removing the duplicate. Native active/focus/collapse changes remain acceptable. Never remove a duplicate in a newly-shared group. No mutation knowingly proceeds after any other participant disappears or navigates.

Immediately before `removeTab`, after pending-journal write and complete preflight, call `guard.expectRemoval(id)` and immediately invoke the single native remove without another await. Successful settlement is not proof of absence: verify target absent plus surviving participants and structure. If a fulfilled call leaves the target present, stop; never retry. Rejected removal remains uncertain even if later observation suggests the target vanished; do not close another duplicate. After verification record that ID and `removed` before continuing. Any already-verified removed IDs are excluded from later document reads.

## Native removal feedback without weakening stale-work guards

Add `tracker.createRemovalLease(view:NavigationView, allowedDuplicateIds:readonly number[])` returning `{isCurrent():boolean,expectRemoval(tabId:number):void,dispose():void}`. It captures epoch/revision, tracks a set of issued removal IDs, and belongs to only the active replacement job. The consumer passes exactly `plan.duplicates.map(p=>p.tab.id)`, never the winner. `expectRemoval` throws when the lease is stale/disposed, the ID is not in this immutable allowlist, or that ID was already armed/credited. The consumer composes its `isCurrent` with the existing context/event checks and executes `try { await replacement.execute(plan,guard); } finally { lease.dispose(); }`. Disposal removes registrations and permanently invalidates that lease; creating a lease must not refresh an already-stale original view.

`tracker.forget(id)` still advances revision and forgets state for every event. Only when the lease was current immediately before that advance and ID was registered as issued may it advance that lease's expected revision by exactly this one event. Consume the credit once. Never refresh a lease from `tracker.view()` after any arbitrary event. Navigation, before-navigation, both replacement APIs, unexpected removal and any unrelated change invalidate normally; `replace` must never route through the creditable path. Keep issued credits until received or operation disposal, allowing an earlier successful removal's event to arrive during the next removal. Promise completion alone does not spend event credit. A duplicate late removal event invalidates conservatively. Missing events do not fabricate tracker state.

An external actor closing the exact armed duplicate during the final call interval is indistinguishable from native feedback; its absence alone causes no additional destructive action, and a rejected native removal still stops. This is part of the residual API race, not an excuse to credit other events. A competing winner observed while removal is pending irrevocably invalidates the lease; subsequent own onRemoved cannot restore it.

## Startup and recovery

Construct dependencies, then register every listener synchronously, then call coordinator initialization. Event observation/invalidation remains synchronous before any config/recovery await. Initialization joins config loading and a recovery job on the **same queue**; consume jobs await the entire initialization promise before entering the queue. Never enqueue recovery from inside an active consume job. `isCurrent`/admission additionally requires recovery ready and journal not blocked.

Recovery runs even for disabled, unavailable or future config; it never changes config or invokes a native mutation. It does not need enabled mode to clean a known settled record. Table:

| Session record | Startup action |
|---|---|
| Missing | Ready after successful read. |
| Valid, `pending:null`, any completed/abandoned/nonterminal phase | Await one read-only live snapshot as the reconciliation gate; discard the old plan, clear record, then ready. Participant presence never authorizes replay. Any read/clear failure blocks. Never close because a record says `placed`. |
| Valid, pending mutation | Preserve record and quarantine **all** automatic mutations for the remainder of that storage session. A fresh snapshot, missing tab, delayed event, config toggle, timeout or worker restart cannot establish settlement. |
| Malformed, unknown/future version, storage failure | Preserve data and quarantine all automatic mutations; no overwrite/migration/clear. |

Terminal records with pending are malformed. A record with pending null can safely admit new work because the old worker persisted native settlement; it does not imply the old mutation succeeded. Interrupted `beforeMutation`/`settled` writes conservatively look pending or invalid. Session-clear actions (browser restart or extension reload/disable/update) discard evidence; recommend a full browser restart as the reliable user-controlled reset for an ambiguous native call, followed by a fresh explicit trial. Do not automatically reload/disable, erase the key, infer settlement from late events, or promise a config toggle unblocks it. Document extension reload clearing storage but do not advertise it as proof a pending native call settled.

## Verification and truthful UI

Use deferred promises, immutable fixture snapshots and a recording in-memory journal. Tests reconstruct fresh tracker/coordinator/queue while preserving storage to model termination after every write/native/verification boundary. Discarded worker promises must remain unresolved when testing a native call that may complete later; demonstrate the new worker cannot issue any mutation even after that late effect/event.

Actual production `dist` browser tests prove real grouping/closure/order/history and restart admission using public config/session storage and CDP worker stop/start. Seeded records prove recovery handling but must be labeled seeded; they do not prove real interruption boundaries. A separate temporary fixture bundles the actual journal/replacement/recovery/native adapter and installs test-only phase gates to terminate after each phase. Its hooks never enter production source or package. Existing Task005 retention assertions must change only for enabled duplicate cases: retained IDs equal originals minus verified older duplicates; unrelated IDs and winner history survive. Keep disabled/grouping-only retain-all assertions.

Options ready copy: `Automatic replacement is enabled. Older duplicate tabs may close after verified placement. Rule editing is not available yet.` Disabled: `Automatic replacement is disabled. Rule editing is not available yet.` Unavailable retains current error guidance then `Automatic replacement is unavailable.` Configuration display does not assert recovery readiness; add one short static sentence to enabled copy: `Interrupted operations may pause processing until Chrome restarts.` No new recovery UI/control or Task007 work.

Manual Chrome trial remains required for actual user-facing focus/collapse/drag behavior, Chrome120/current-stable and enabled incognito capability. Supply backup/disable/reload/enable/pause/restore instructions for a disposable profile; no personal-profile actions. Report automated Chromium evidence separately from these manual gaps.
