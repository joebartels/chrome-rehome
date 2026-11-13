# Navigation eligibility and winner selection design — Task 004

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../../README.md).

**Policy amended 2026-10-27:** the [external-app compatibility design](2026-10-27-external-app-links-design.md) admits valid `start_page`, including configured startup URLs. Original Task 004 verification remains historical; native restore commits were not captured. Core reload and all provenance/freshness guards remain unchanged.

Controller-adopted design, 2026-10-26. The user authorized delegated implementation and independent review of Task 004. Scope is only 004. Production `consume` remains the existing no-op. Selection neither performs nor authorizes movement, grouping, closure, UI changes, persistence, dependencies or permissions.

## Evidence and policy boundary

Chrome exposes transition metadata, not a reliable per-tab restored flag. Its [history transition definitions](https://developer.chrome.com/docs/extensions/reference/api/history#type-TransitionType) expressly classify session restore and reopening a closed tab as `reload`; command-line URLs and startup pages share `auto_toplevel`. [webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation#type-TransitionType) uses `start_page` for that latter value. Reject `reload` even with an address-bar qualifier. The original Task 004 policy rejected `start_page`; the 27 October amendment admits it because real external LaunchServices opens use this value. Configured startup and command-line URLs sharing it also qualify; no external-origin inference is made.

[runtime.onStartup](https://developer.chrome.com/docs/extensions/reference/api/runtime#event-onStartup) denotes profile startup, not restoration completion; it also does not fire for an incognito profile starting. It is not a worker-start detector. Do not classify events by wall-clock thresholds, a startup timer, preexisting-tab membership, or asynchronous initialization completion.

The alternative of accepting all HTTP(S) callbacks would admit restore/reload and initialization scripts. An initialization quarantine would also lose real navigation without identifying restore. Recommend metadata-based admission plus document provenance for same-document changes and client redirects. This preserves ordinary navigation at cold worker start while retaining core reload exclusion; the later `start_page` amendment accepts the documented startup ambiguity. It is a conservative policy, not proof of human intent or a complete restore detector.

## Eligibility decisions (controller choices)

For a valid tab's outermost/main-frame event, invalidate previous work synchronously, before configuration loading or any await, even if the new event is ineligible. Subframes do not invalidate main-frame work. Exact repeated delivery of the full latest event fingerprint is a no-op. Retain actual URL bytes; identity normalization stays in `rules/duplicates.ts`.

An eligible event requires HTTP(S), finite browser timestamp, nonempty document ID, `documentLifecycle === 'active'`, a known transition type and a well-formed list of known qualifiers. The manifest already targets Chrome 120; absent lifecycle/document metadata fails closed rather than guessing. Frame 0 is required; if supplied, frame type must be `outermost_frame`.

| Observation | Outcome |
| --- | --- |
| Active committed `link`, `typed`, `auto_bookmark`, `generated`, `form_submit`, `keyword`, `keyword_generated` | Eligible, even first observation of this worker and while config initialization is pending. Applies equally to new and existing tabs. |
| Active `start_page` commit | Eligible under the 2026-10-27 amendment, including configured startup pages; all metadata and provenance gates apply. |
| `reload`, subframe types, unknown/missing metadata | Invalidate, no winner; no trusted document provenance. `from_address_bar` does not override this. |
| `server_redirect` on an otherwise eligible committed transition | Eligible at the final committed URL. `onBeforeNavigate` URLs never become candidates. |
| `client_redirect` | Additionally require the prior active document in that tab to have eligible provenance within this worker. Preserve that provenance across `onBeforeNavigate`, but reset it at reload/unknown/ineligible commit/removal/replacement. A cold worker client redirect is suppressed. |
| `forward_back` on otherwise eligible commit | Eligible: it is a documented user navigation. A core `reload` still loses. BFCache document reuse does not itself imply reload. |
| History/fragment update | Require active document ID matching the tab's trusted committed document in this worker, eligible transition metadata, no pending full navigation, and a changed native `URL.href`. Then emit a new generation. A no-URL-change state update invalidates prior work but emits no winner. Retain trusted document provenance for later real changes. |
| Restored/reloaded document immediately calls pushState, replaceState, hash change or client redirect | No winner: that document has no trusted provenance. A subsequent ordinary eligible committed navigation can establish provenance. |
| Prerender/cached/pending-deletion document | Invalidate, no winner. No trust inferred from lifecycle changes. |
| Either replacement event (`tabs.onReplaced`, `webNavigation.onTabReplaced`) | Invalidate both IDs and clear document provenance. Do not transfer rank or synthesize an eligible event. A subsequent ordinary eligible active commit may qualify. |

This admits pasted URLs when Chrome reports eligible address-bar transitions and external-app URLs when it reports an eligible transition. Valid external-app `start_page` commits now qualify; configured startup URLs sharing the metadata also qualify. It still misses first SPA/hash activity after worker suspension and prerender activation with no later eligible commit. Those are unavoidable/intentional false negatives under this policy. Link/script metadata is not a user-gesture guarantee; accepting ordinary `link` commits cannot prove that every event originated in a human action. Record these limitations in 004 before enabling any future mutation behavior.

## Small interfaces and state

Keep normalization/state in `background/navigation.ts`; add pure `planning/candidates.ts`. Planning owns its structural input contracts so the boundary checker never needs planning-to-background/browser imports. Background can import/re-export those types. `browser/snapshots.ts` already provides required URL, pending URL, window, index, pinning and incognito fields; do not replace its observations with an event URL cache.

Contracts (all fields/arrays readonly):

```ts
// planning/candidates.ts — structural contracts, no Chrome globals
type NavigationToken = { epoch: symbol; tabId: number; generation: number };
type CandidateNavigation = NavigationToken & {
  url: string; documentId: string; observedSequence: number;
};
type NavigationView = {
  epoch: symbol; revision: number;
  navigations: readonly CandidateNavigation[];
  blockedTabIds: readonly number[];
};
type CandidateTab = {
  id: number; windowId: number; index: number; groupId: number;
  pinned: boolean; incognito: boolean; url?: string; pendingUrl?: string;
};
type DuplicateIdentity = {
  identify(candidate: { url: string; incognito: boolean }): string | undefined;
};
type CandidateSelection =
  | { kind: 'skip'; reason: 'invalid-input' | 'stale-trigger' |
      'unavailable-trigger' | 'superseded' | 'no-duplicates' }
  | { kind: 'selected'; epoch: symbol; revision: number;
      winner: CandidateTab; navigation: CandidateNavigation;
      duplicates: readonly CandidateTab[]; anchor: CandidateTab };
function selectCandidates(
  trigger: CandidateNavigation,
  tabs: readonly CandidateTab[],
  view: NavigationView,
  identity: DuplicateIdentity,
): CandidateSelection;
```

`Navigation` retains current kind/browser timestamp fields and extends `CandidateNavigation`. `NavigationInput` gains optional structural `transitionType`, `transitionQualifiers`, `documentLifecycle`, `frameType` fields; optionality lets tests and malformed-input handling exercise fail-closed behavior, not compatibility admission. Registry forwards them without discarding qualifiers.

Keep existing tracker `observe(input): Navigation | undefined`, `invalidate(tabId): void`, `forget(tabId): void`, `isCurrent(event): boolean`; add `view(): NavigationView` and `isViewCurrent(view: Pick<NavigationView, 'epoch' | 'revision'>): boolean`. Each tracker creates a fresh `Symbol()` epoch; generation and observed-sequence counters are strictly increasing inside it. A token from another tracker can never compare current, even when its numeric generation matches. Never persist these symbols/counters or compare them across worker lifetimes.

`invalidate` advances revision, removes the current eligible navigation, marks the tab blocked, and preserves only redirect-source document provenance. `forget` advances revision and removes all state for that ID, including its blocked entry. Replacement must forget the removed ID and invalidate the added ID with cleared provenance. There is no historical navigation list or removed-ID tombstone set; retain one event/fingerprint/provenance entry per live observed tab. The globally monotone generation prevents tab-ID reuse reviving old tokens.

Every distinct valid main-frame observation advances revision/generation before eligibility filtering. A recognized active commit ends the pending block even if core `reload` is ineligible; it can subsequently be a passive duplicate from a current snapshot. Nonactive/malformed observations keep the tab blocked. History/fragment events during pending navigation cannot clear it or acquire provenance. `onErrorOccurred` need not be added: conservative block lasts until a later valid active commit; cancellation is a documented false negative rather than an unsafe restoration of stale work. Keep counters monotone; fail closed on unsafe-integer exhaustion.

`view()` returns detached immutable arrays/current eligible observations and blocked IDs. Whole-view revision detects invalidation of previously unobserved duplicate anchors too; it is deliberately conservative if an unrelated tab navigates. The coordinator continues observing synchronously, awaiting shared config initialization, then checking config revision and `tracker.isCurrent` at queue execution. No planner is attached to production consume in 004.

## Pure winner and anchor selection

Validate structural IDs/indices, booleans, epoch and positive safe integer counters; conflicting/duplicate tab IDs or navigation records fail closed. Snapshot order and event-array order must not affect results. Only compare navigations from the view epoch.

1. Require the supplied trigger's full token and immutable observation fields to match a current navigation in the view. Its tab must exist, be unpinned, have an identifiable snapshot URL, have no `pendingUrl` property and not be blocked. Missing trigger is a skip. Snapshot/native `URL.href` must equal event/native `URL.href`; duplicate-rule equivalence alone is insufficient freshness proof.
2. Obtain identity exclusively through the supplied compiled `rules/duplicates.ts` engine using each snapshot's actual `incognito` boolean. Search across supplied normal-window snapshots but never across normal/incognito contexts. Ignore pinned tabs, unidentifiable/missing URLs, any pending URL (including same-identity destination), and blocked tabs. If a tab has a current event inconsistent with its snapshot URL, exclude that tab entirely.
3. Among same-identity tabs with a current, snapshot-consistent eligible navigation, winner is largest `observedSequence`; break a supplied equal-sequence tie by smallest tab ID. Browser timestamp is evidence retained in the event, not a winner clock. No eligible observation means an old/restored duplicate cannot independently win. If winner is not this trigger, return `superseded`; the winner's queued handler owns future work.
4. Remaining matching snapshot tabs are duplicate observations. Sort by same-window-as-winner first, then ascending window ID, tab index, tab ID. First is anchor. Never prefer active/focused tab or group title here. Return `no-duplicates` if none. Ordering and pinned exclusion are explicit policy decisions, not closure eligibility.
5. Return immutable observations and epoch/revision only. No close list, destination, grouping decision or navigation operation. The caller must capture the view BEFORE starting its browser snapshot read, verify the same view is current after the read, and use that view/snapshot pair. It must not pair a pre-removal snapshot with a newly captured post-removal view. Before any downstream asynchronous work, 005 must check event and view freshness; after a browser read it must check again and revalidate authoritative participant URL/context/location. A selection never claims an atomic snapshot or authorizes closure.

“Newest” means newest eligible callback observed in one worker epoch among the complete current view. If B arrives before A's queued work begins, A is superseded; if B arrives after selection, it invalidates the view for downstream revalidation. No debounce can promise knowledge of future events.

## Integration clarifications

Add `replace(addedTabId: number, removedTabId: number): void` to tracker and coordinator, clearing both identities/provenance and blocking the added ID. Forward both replacement event APIs to this single operation; duplicate delivery is conservative invalidation, never winner synthesis. Preserve the existing coordinator initialization/configuration guards and redacted diagnostics. Required event metadata is forwarded synchronously without awaiting configuration. Every distinct valid main-frame observation invalidates prior generation even when malformed/unsupported metadata suppresses eligibility. Do not allow a delayed same-document callback for a different document to overwrite trusted current-document provenance or become a winner.

Use the current native HTTP(S) candidate parsing discipline: no credentials, controls, whitespace or backslashes; malformed input fails closed. URL equality for freshness uses native `URL.href`, independently of relaxed duplicate identity. Candidate decisions return copied/frozen observations, not mutable port-owned objects or opaque identity keys for logging. Winner/anchor tab metadata remains a snapshot; the planner does not infer a window is normal from its ID. Future caller supplies snapshots from the existing all-normal-windows reader and checks the captured view revision after its read.

Only modifications needed for Task004 are authorized: navigation tracking/registry/coordinator metadata and stale guards, pure candidates, focused tests/docs. Production `consume` stays no-op. No mutation APIs, configuration/schema/storage/UI/dependency/permission changes. No polling, worker keep-alive, permanent event history, or startup clock heuristics. Target Node24 and Chrome120+. Preserve Task003 modules and backlog005–010.

## Verification and Chrome trial milestones

Unit/integration tests pin all eligibility table rows, epoch/revision staleness, deferred initialization, replacement ordering, candidate freshness/matching/context, pending navigation, pinned exclusions, deterministic order and immutable inputs. Actual Chrome event evidence uses disposable browser profiles and a temporary extension bundle; do not fabricate event metadata and call it browser evidence. Attempt session-restore/reopen, external launch/omnibox and prerender with supported harness controls, record any capability gap with manual instructions. No promise is made that all cross-app or restored-session environments are validated by one Chromium run. Release matrix and full feature regression remain later tasks.

The production package can already be loaded unpacked to inspect status. Task004 still provides no automatic movement/closure. The planned first controlled placement trial is Task005 after its executor is connected; Task006 adds recoverable closure, Task007 adds rule editor/preview for convenient configuration, Task008 adds pause/protection controls and Task009 completes the end-to-end browser regression gate before default activation. These are milestone expectations, not a claim that an unimplemented task is already usable. Do not implement the later tasks while explaining this roadmap.

## Rulings and revision costs

- Admit explicit active committed metadata including valid `start_page` (27 October amendment); reject core reload, require same-worker provenance for same-document/client redirects, and allow eligible back/forward. Configured startup URLs sharing `start_page` qualify. Cold SPA changes remain excluded; metadata is not proof of intent or a complete restore detector.
- Use worker-local Symbol epochs, whole-view revisions, strict native URL freshness and blocked pending/replaced tabs. This avoids stale numeric-token reuse and relaxed-identity masking. Canceled navigation and prerender swaps may remain suppressed until a fresh eligible commit; journal/recovery must never persist or compare these epochs across workers.
- Rank by observed callback sequence (tab ID tie), choose same-window/window/index/tab ID anchors, and exclude pinned participants. This is deterministic without wall-clock/focus inference. Future changes to anchor/pinned policy require planner/tests revision; selection itself never authorizes closure.
