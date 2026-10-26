# Replacement planning and placement — Task005

Controller-adopted design, 2026-10-26. Deliver a working, explicitly enabled Chrome placement trial using the real production consumer. Move the existing eligible winning tab, preserving its history; retain every original tab. Stop before006. The user authorized delegated implementation and independent review.

## Scope and decisions

- Node24; Chrome120+; existing schemaVersion3 and permissions. Default configuration remains disabled.
- No tab creation, closure, journal, rollback, rule editor, popup, new dependencies or permissions. No automatic enablement.
- Configured grouping overrides duplicate location and uses Task003's incoming window: current exact-title group first, otherwise leftmost exact-title group, otherwise create there.
- Without a matching grouping rule, inherit004's selected duplicate anchor's window and group (including ungrouped), immediately after that anchor.
- Without either destination, leave the incoming location unchanged. A matching rule must group an eligible lone winner even when no duplicate exists.
- Configured existing group: retain position if already a member; otherwise append to its members. Configured new group: group at the winner's current position, accepting native membership rearrangement. Do not first visit the duplicate window/group.
- Exclude pinned, pending, blocked, context-mismatched and non-normal-window participants. Skip known shared source, inherited-anchor or configured-destination groups, including when a group becomes shared between reads. Preserve optional `shared` metadata (available since Chrome137); absence remains Chrome120-compatible.
- Never explicitly change focus, active/highlighted state, group collapse or existing color/title. Chrome may select another source tab, close an emptied source window or expand a group. Record observed effects; do not promise focus preservation.

The known004 residual is accepted only for this explicit enabled placement trial: Chrome sometimes reports scripted navigation as an ordinary eligible link, even after worker restart. Default-disabled and no closure remain mandatory. Whole-view invalidation is conservative: unrelated navigation may cancel placement.

## Approach

Use the existing pure candidate selector and group destination planner, then one frozen final placement plan and a guarded executor. Calling the003 grouping service inside the coordinator risks queue self-deadlock and allows its reread to choose a different destination. A second global queue or a fresh destination after partial work would also break the single-plan guarantee. Keep003's public service working independently; reuse its native grouping adapter methods, not its orchestration.

The coordinator already owns serialization. The new executor never enqueues itself and never retries rejected mutation calls. Native promises remain awaited; a timeout must not release the queue while a mutation still runs.

## Native API evidence

Verified against Chrome documentation on 2026-10-26: tabs have zero-based indices; `tabs.move` accepts a destination index/window and only moves between normal windows; `tabs.group` joins or creates membership; `tabs.ungroup` deletes emptied groups. Chrome documents drag-related edit rejection. The index description does not fully specify grouped-edge behavior, so real Chromium tests must establish the algorithm below. [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)

`tabGroups` exposes membership window, collapsed/color/title and, since137, shared state. [TabGroups API](https://developer.chrome.com/docs/extensions/reference/api/tabGroups) `webNavigation.getFrame({tabId, frameId:0})` is covered by the existing webNavigation permission; its document ID and lifecycle support authoritative document checks. A URL alone does not establish a live document. [WebNavigation API](https://developer.chrome.com/docs/extensions/reference/api/webNavigation#method-getFrame)

## Public contracts

All observation/plan fields and arrays below are readonly and copied/frozen; `Readonly<...>` is implied inside abbreviated nested records. Existing `CandidateTab`, `CandidateNavigation`, `NavigationView`, `DuplicateIdentity`, `DestinationGroup`, `GroupDestination` retain their names.

In `planning/candidates.ts`, preserve the existing four-argument behavior and add:

```ts
type SingleCandidate = Readonly<{
  kind: 'single'; epoch: symbol; revision: number;
  winner: CandidateTab; navigation: CandidateNavigation;
  duplicates: readonly [];
}>;
type PlacementSelection = Extract<CandidateSelection, {kind:'selected'}> | SingleCandidate;
function selectCandidates(
  trigger: CandidateNavigation, tabs: readonly CandidateTab[],
  view: NavigationView, identity: DuplicateIdentity,
): CandidateSelection;
function selectCandidates(
  trigger: CandidateNavigation, tabs: readonly CandidateTab[],
  view: NavigationView, identity: DuplicateIdentity,
  options: {allowNoDuplicates: true},
): CandidateSelection | SingleCandidate;
```

Use the same validated selection path; only replace its final `no-duplicates` outcome when opted in. Never synthesize eligibility, bypass freshness, or catch arbitrary skip results as permission for grouping.

In `planning/replacement.ts`:

```ts
type PlacementGroup = DestinationGroup & Readonly<{shared?: boolean}>;
type PlacementSnapshot = Readonly<{
  tabs: readonly CandidateTab[]; groups: readonly PlacementGroup[];
}>; // supplied only from all-normal-windows observations
type PlacementDocument = Readonly<{
  tabId: number; documentId: string; url: string;
  documentLifecycle: string; frameType: string;
  parentFrameId: number; errorOccurred: boolean;
}>;
type Participant = Readonly<{
  tab: CandidateTab; identity: string; document?: PlacementDocument;
  navigation?: CandidateNavigation;
}>;
type PlacementDestination =
  | Readonly<{kind:'unchanged'}>
  | Readonly<{kind:'ungrouped'; windowId:number; afterTabId:number}>
  | Readonly<{kind:'existing'; windowId:number; groupId:number;
      position: 'keep' | 'end' | Readonly<{afterTabId:number}>}>
  | Readonly<{kind:'new'; windowId:number; title:string}>;
type ReplacementPlan = Readonly<{
  kind:'place'; epoch:symbol; revision:number; configRevision:number;
  winner:Participant; duplicates:readonly Participant[];
  anchorTabId?:number; destination:PlacementDestination;
  baseline:PlacementSnapshot;
}>;
type ReplacementDecision = ReplacementPlan | Readonly<{
  kind:'skip'; reason:'invalid-input'|'state-changed'|'unavailable-document'|'shared-group'
}>;
function planReplacement(input: Readonly<{
  selection:PlacementSelection; view:NavigationView; snapshot:PlacementSnapshot;
  documents:readonly PlacementDocument[]; identity:DuplicateIdentity;
  configRevision:number; groupTitle?:string;
}>): ReplacementDecision;
```

Validate the selection against its view/snapshot evidence, all relevant group coherence, strict native URL equality, context and document evidence. Use `planGroupDestination(request: GroupRequest, snapshot: DestinationSnapshot): GroupPlan` for configured grouping; map any skip to `state-changed`. The final configured group must be checked for shared state after resolving it. Passive duplicates can lack a navigation token: record their actual snapshot URL/identity plus the plan's worker epoch/view revision, never invented generations or documents. Only the winner and the inherited anchor actually used by this placement require active outermost document evidence; document URL must match tab URL, winner document ID must equal004's event ID, and a used anchor's observed navigation must match its document when present. A used participant with unavailable document is skipped. Configured grouping must not depend on document availability of overridden/passive duplicates. Other duplicate document fields remain absent:005 never closes them, and006 must acquire/revalidate closure evidence independently. This bounds document API fanout to at most two participants per observation round rather than every matching tab.

In `execution/placement.ts`:

```ts
type PlacementGuard = Readonly<{isCurrent():boolean}>;
type PlacementPort = {
  read():Promise<PlacementSnapshot>;
  readDocument(tabId:number):Promise<PlacementDocument|undefined>;
  moveTab(tabId:number, windowId:number, index:number):Promise<void>;
  ungroupTab(tabId:number):Promise<void>;
  groupTab(tabId:number, destination:GroupDestination):Promise<number>;
  setTitle(groupId:number, title:string):Promise<void>;
};
type MutationPhase = 'ungroup'|'move'|'group'|'title';
type PlacementPhase = 'read'|'document'|MutationPhase|'verify';
type PlacementEffect = Readonly<{
  phase:MutationPhase; outcome:'uncertain'|'acknowledged'|'verified'; groupId?:number;
}>;
type PlacementResult =
  | Readonly<{kind:'placed'|'unchanged'; windowId:number; groupId:number; index:number}>
  | Readonly<{kind:'skipped'; reason:'state-changed'}>
  | Readonly<{kind:'failed'; phase:PlacementPhase; cause:unknown;
      effects:readonly PlacementEffect[]}>;
function createPlacementExecutor(deps:{port:PlacementPort}):{
  execute(plan:ReplacementPlan, guard:PlacementGuard):Promise<PlacementResult>;
};
```

In `browser/placement.ts`, `createPlacementAdapter(api: Pick<typeof chrome, 'tabs'|'tabGroups'|'webNavigation'>): PlacementPort` composes the existing snapshot reader and003 adapter. Its `read` uses all-normal-windows; `readDocument` uses frame0 and preserves supplied metadata. Add optional shared to `GroupSnapshot` in `browser/snapshots.ts`. No browser globals/imports enter planning/execution.

In `config/repository.ts`, export `ConfigSnapshot = Readonly<{revision:number; state:ConfigState}>` and add `getCurrent():ConfigSnapshot|undefined`. It returns only the published state whose operation equals the repository's current generation, and returns undefined during load/save or after disposal. This exposes existing operation ordering, not a persisted version. Storage notification starts load synchronously, so it revokes placement before the read resolves.

In `background/coordinator.ts`, export `ConsumeContext = Readonly<{config:Config; revision:number; isCurrent():boolean}>`; change dependency `consume` to `(event:Navigation, context:ConsumeContext)=>Promise<void>`. Inside its existing queue, take `config.getCurrent()`; require ready/enabled and equality with coordinator state. The closure must keep checking captured repository revision, coordinator revision/disposal, current ready/enabled state and tracker event ownership.

In `background/placement.ts`, export `createPlacementConsumer({tracker,port,diagnostics}): (event:Navigation, context:ConsumeContext)=>Promise<void>`, using actual existing factory return types for tracker/diagnostics and `PlacementPort`. Compile both rule engines from the captured config, capture `tracker.view()` before any snapshot await, select with `allowNoDuplicates:true`, read the winner document and only the inherited anchor document if used (a configured group overrides the anchor), and create/execute the plan. Its guard combines context freshness, `tracker.isCurrent(event)` and `tracker.isViewCurrent(view)`. Record only existing redacted `operation-failed` diagnostics on failure. Plan identities/URLs/titles/document IDs and causes must never be logged or persisted.

## Executor preconditions and operation order

Before and after every asynchronous read/mutation check the guard. Before each mutation, reread relevant participant documents (winner and used inherited anchor) and a complete normal-window snapshot; compare native href, identity evidence, context, pinning, pending URL, document ID/lifecycle/error/frame, expected location and destination membership/title/shared state. Compare snapshots bracketing document reads so location changes during those reads fail closed. Absent/closed participants or stale anchor end work; never silently choose a replacement anchor or destination. Validate the captured view revision after every snapshot, including the initial planning read.

The immutable plan is never rewritten. The executor maintains a separate expected state after its own successful operations. In source/destination windows, relative order of all tabs except the winner must remain unchanged; compute participant index shifts from that order. Only winner membership/movement, removal of its now-empty old group, and creation/title of its new final group are permitted differences. Preserve other group metadata; native collapsed/active effects may differ. This distinguishes our own index shifts from external anchor moves. After a cross-window move of the last source tab, the now-empty source window may disappear; if any source survivors existed, their absence is a conflict.

1. If changing group/window, ungroup the winner only when its current membership differs from the final existing group. Reread before doing anything else; its lone old group may now be gone.
2. Cross-window: move the winner directly to the final window. For ungrouped destination use after-anchor insertion; for grouped destination land at the boundary after that group's last member, then join the already-resolved final group. Never move a group or visit an intermediate group/window.
3. Same-window membership changes join/create only the final group. Existing destination IDs remain fixed. New group ID returned by Chrome is accepted only after observing winner membership, window/context and a non-shared group; title it only if empty (or accept already-correct title), never overwrite an unexpected title.
4. Re-read and apply the final after-anchor order (inherited) or end-of-group order (configured newcomer), retaining correct membership. Calculate the destination final index by removing the winner from the current ordered destination tabs and inserting after the anchor. Equivalently, same-window after-anchor index is `anchor.index + 1 - Number(winner.index < anchor.index)`; cross-window uses `anchor.index + 1`. Do not subtract twice. Skip redundant move calls.
5. Verify final window, group and position plus all guards. Return success only on observed final state. Native adjustment to an incompatible position is failure, not success or an unlimited correction loop.

Each attempted mutation appends an uncertain effect; resolution acknowledges it, authoritative post-read verifies it. Rejected promises retain their original cause/phase and uncertain effect. Validation/guard failure after any attempted mutation is failed with known effects, never a harmless skip. Before mutation, invalidation returns skipped; read errors retain their original cause. Stop immediately on failure; no deletion, rollback, retry or delayed continuation. This cannot eliminate the last check-to-native-call race; native APIs are not transactions.

## Production trial and evidence

Wire `background/index.ts` to one tracker, config repository, queue, placement adapter and consumer. Update existing options status text only: heading “ChromeReHome installed”; ready text “Automatic placement is enabled/disabled. Tabs are never closed. Rule editing is not available yet.” Unavailable text retains the existing error guidance and states “Automatic placement is unavailable. Tabs are never closed.” No new controls.

Completion instructions must load the actual built `dist` in chrome://extensions, open its service worker console, preserve the current storage value, and explicitly enable schema3:

```js
const backup = (await chrome.storage.local.get('chromeReHomeConfig')).chromeReHomeConfig;
await chrome.storage.local.set({chromeReHomeConfig: {
  schemaVersion: 3, enabled: true,
  groupingRules: [{pattern:'https://example.com/*', group:'Trial'}],
  duplicateRules: []
}});
```

This replaces configuration; tell the user to copy/export `backup` before closing DevTools. To pause preserve rules and set enabled:false. To restore, write the backup or remove only that key if it was originally absent. No production test endpoint is needed.

A disposable-profile browser test must load unchanged production dist, set this public storage config, navigate real HTTP(S) pages with real004 events, and observe actual tab IDs/indices/groups/history. Required trials: grouping with no duplicate; same-window after-anchor in both directions; grouped and ungrouped cross-window inheritance; configured override staying in incoming window; lone source group/window; active/background winner and collapsed target. Assert all original tab IDs still exist after every placement. Disable and prove later navigation does not place. Observe and report native active/focus/collapse effects rather than hiding them. A controlled adapter test covers drag rejection and partial failure; label simulated failures clearly. Manual own-Chrome instructions cover actions/capabilities unavailable in headless Chromium, including actual drag and incognito when not enabled. Do not describe synthetic eligibility or temporary fixture bundles as production integration proof.

