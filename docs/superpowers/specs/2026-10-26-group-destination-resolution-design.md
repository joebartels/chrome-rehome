# Group destination resolution design — Task 003

Implementation scope is one cohesive feature: a pure destination planner and an opt-in, directly testable service that groups one actual tab. Production navigation consumption remains a no-op.

## Decisions and approach

Resolve the configured title by exact, case-sensitive string equality in the navigating tab's explicitly supplied own window. Prefer that tab's current matching group; otherwise choose the matching group whose observed member has the lowest tab index, then the lowest numeric group ID. A group needs a matching group record and at least one observed member in that window/context. Normal and incognito observations never mix. Skip pinned tabs without unpinning them. Session IDs are observations and return values, never durable configuration or storage.

Choose a pure planner plus narrow grouping service. A resolver that creates empty groups cannot work: Chrome creates groups by grouping actual tabs and removes groups when their last tab leaves. Folding this into Task 005 would leave Task 003's creation/concurrency behavior untestable in isolation. The proposed service gives Task 005 a small future integration point without implementing replacement placement now. [Chrome tabs.group](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-group), [tabGroups.onRemoved](https://developer.chrome.com/docs/extensions/reference/api/tabGroups#event-onRemoved).

No cross-window gathering, explicit moves or index/focus changes; no URLs, duplicate closure, recovery journal, consumer wiring, schema changes, dependencies or permissions. Chrome may reposition a tab as part of grouping; Task 003 promises group membership, not a final relative tab index. Existing group color/collapse/title remain untouched. New groups get only the configured title; Chrome supplies color/collapse defaults.

## Interfaces

`src/planning/group-destination.ts` owns structural, readonly inputs with no Chrome references or browser imports:

```ts
type GroupRequest = Readonly<{
  tabId: number; windowId: number; incognito: boolean; title: string;
}>;
type DestinationTab = Readonly<{
  id: number; windowId: number; index: number;
  groupId: number; pinned: boolean; incognito: boolean;
}>;
type DestinationGroup = Readonly<{
  id: number; windowId: number; title?: string;
}>;
type DestinationSnapshot = Readonly<{
  tabs: readonly DestinationTab[];
  groups: readonly DestinationGroup[];
}>;
type GroupDestination =
  | Readonly<{ kind: 'existing'; windowId: number; groupId: number }>
  | Readonly<{ kind: 'new'; windowId: number; title: string }>;
type GroupPlan =
  | Readonly<{ kind: 'place'; tabId: number;
      destination: GroupDestination; placement: 'group' | 'already-grouped' }>
  | Readonly<{ kind: 'skip'; reason: 'tab-missing' | 'window-changed' |
      'context-changed' | 'pinned' | 'inconsistent-snapshot' }>;
function planGroupDestination(
  request: GroupRequest, snapshot: DestinationSnapshot
): GroupPlan;
```

Requests carry an already validated configured title (the existing grouping compiler owns the 1–80 character contract). IDs must be concrete nonnegative safe integers; reject current-window sentinels/invalid IDs before any adapter call. The observed tab must still have the requested ID, window and incognito value. Foreign windows/contexts cannot supply group candidates. A candidate with contradictory observed members, or a matching group with no observed members, is inconsistent rather than evidence that a new group should be created. A source tab referencing an absent group record is also inconsistent. This handles torn snapshots conservatively; an ungrouped source uses the existing `-1` absence convention internally.

`src/execution/group-placement.ts` owns orchestration, not Chrome calls:

```ts
type GroupPlacementPort = {
  read(windowId: number): Promise<DestinationSnapshot>;
  groupTab(tabId: number, destination: GroupDestination): Promise<number>;
  setTitle(groupId: number, title: string): Promise<void>;
};
type SerialRunner = { run<T>(job: () => Promise<T>): Promise<T> };
type GroupPlacementResult =
  | { kind: 'placed'; windowId: number; groupId: number;
      action: 'already-grouped' | 'reused' | 'created' }
  | { kind: 'skipped'; reason: 'invalid-request' | GroupPlanSkipReason |
      'state-changed' }
  | { kind: 'failed'; stage: 'read' | 'group' | 'title' | 'verify';
      cause: unknown;
      effect: 'not-started' | 'uncertain' | 'grouped' | 'titled';
      groupId?: number };
// GroupPlanSkipReason is the skip reason union above.
function createGroupPlacementService(deps: {
  port: GroupPlacementPort; queue: SerialRunner;
}): { place(request: GroupRequest): Promise<GroupPlacementResult> };
```

`src/browser/group-placement.ts` exports `createGroupPlacementAdapter(api)` using injected Chrome APIs and the existing snapshot reader. Map snapshots structurally; do not expose URLs. Existing destination maps to `tabs.group({tabIds: [tabId], groupId})`; new destination maps to `tabs.group({tabIds: [tabId], createProperties: {windowId}})`. `setTitle` maps only `{title}` to `tabGroups.update`. Query all groups for the explicit window and compare titles in pure code: Chrome's group query title field is a pattern, not the desired exact equality contract. [Chrome tabGroups.query/update](https://developer.chrome.com/docs/extensions/reference/api/tabGroups#method-query).

The caller injects one `createOperationQueue()` instance for the service. Reuse its structural `run` interface; do not relocate foundation code, add a global lock or construct this service in production yet. Document that future wiring must share one service/queue per worker. The queue serializes through post-verification and survives failures within that service lifetime only.

## Execution and failures

1. Inside `queue.run`, validate concrete request IDs; read the explicit window and plan. Read again immediately before a mutating call and replan once from this newer observation. If either observation is torn, the newer coherent one can recover it; if the newer one remains inconsistent, skip. There is no unbounded retry loop. Any skip on the latest observation prevents mutation. An `already-grouped` result also requires the fresh observation.
2. Group the tab into the existing or new destination. A rejected read/group call returns a visible failure with the original cause; do not parse Chrome error strings or automatically retry a mutation. A rejected group call has `effect: 'uncertain'`; do not assert that no change occurred.
3. After a successful group call, read authoritative state again. Verify the tab is still unpinned in the requested window/context and returned group, and the group still exists there. For reuse, also require its exact title. A mismatch returns `failed/verify` with a stable local error and `effect: 'grouped'`. Do not report success or attempt corrective regrouping.
4. For a new group, the post-group observation is also the pre-title check. If title is already exact, accept it; if absent/empty, set only the configured title. If another actor has already supplied a different nonempty title, return a verification failure rather than knowingly overwriting that rename. A title API rejection exposes `effect: 'grouped'` and the known group ID. After a successful title call, read once more and verify membership/window/context/pinning/title; failure exposes `effect: 'titled'`.
5. Success means the requested membership/title was observed at verification time. Failed results carry known effects and a known group ID where available; that ID is not proof of current membership. No rollback, ungrouping, cleanup, closure, title retry or blind adoption of a new tab/window follows partial failure. Causes remain in memory and are not automatically logged or persisted.

Deletion/rename before the final read changes the plan. Deletion, last-member removal, drag, pinning or rename after that read can still race an API call or verification. No Chrome transaction/CAS protects these steps; even a final observation can become stale immediately. Per-service serialization prevents two local missing-title requests from creating two groups when both succeed: the second reads after the first settles and reuses it. It does not prevent duplicates from external actors, another service instance, worker restart, or a failed/partial first creation. In particular an unnamed group left by title failure is not silently treated as the configured title on a later call.

## Controller choices and boundaries

This design follows the user's authorization to proceed with the next backlog task and delegated implementation/review. Own-window resolution and tie-breaking are controller choices, not user-selected product settings. Changing to designated cross-window gathering later requires an explicit policy change; no schema change is needed now. Creating a group necessarily groups a real tab. These callable primitives remain absent from production entry wiring; Task 005 will compose them with navigation generations, final destination and placement checks. Returned success is an observation, never authorization to close a duplicate.

Use Node 24 and Chrome 120+; add no dependencies, permissions, storage or production endpoints. Keep all existing matching/config/background behavior unchanged. Enforce planning purity in source and bundle guards, including erased type imports and external imports. Planning may depend only on planning/rules; execution may depend on planning and structural ports. Runtime input validation prevents invalid IDs and titles before adapter calls; titles follow the grouping contract (1–80 code units, no surrounding whitespace or controls). The planner may include invalid-request in its skip union and expose a small shared request validator to avoid duplicate validation.

Browser-owned API effects and external changes are not transactions. Existing group attributes are not explicitly updated; Chrome may expand/reposition groups itself when grouping an active tab. No exact active-tab visibility or relative position promise is made here. Bounded fresh observations improve detection without polling or retrying mutations. No cached session IDs survive calls. Inject one shared queue/service per worker when eventually wired.

## Acceptance and verification

Pure planner tests: exact title/case/literal wildcard characters; current matching group preference; leftmost and numeric ties; own-window/context isolation; pinned/missing/moved tabs; orphan/contradictory observations; frozen input preservation.

Service tests: two observation replanning; zero mutations on latest skip; create/reuse/already; post-group/pre-title/post-title verification; rename/deletion/last-member removal; read/group/title/verify rejections and explicit partial effects; queue recovery and gated simultaneous missing-group requests with one creation. Never retry a failed mutation or roll back blindly.

Adapter tests pin exact explicit-window Chrome arguments, title-only updates, detached narrow snapshots and rejection propagation. Isolated browser fixture invokes actual service/adapter using a temporary test-only bundle; exercise real creation, reuse/ties, nonfocused-window isolation, last-member removal, pinned preservation, stale-group rejection and real partial creation with injected title failure. Preserve the unchanged production smoke. Incognito fixture may be unavailable without allowing extension incognito access; verify capability and record automated coverage limits with manual instructions, rather than changing the user's browser settings or claiming fake coverage as a browser test.

Primary API references checked 2026-10-26: [tabs.group](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-group), [tabGroups.query/update and lifecycle](https://developer.chrome.com/docs/extensions/reference/api/tabGroups).
