# 003: Group destination resolution

Status: Implemented; controller review pending

Depends on: 001

## Outcome

Resolve an exact configured title to a live group in the supplied tab's own window and browsing context. The opt-in placement service groups an actual tab and names newly created groups. Session IDs are observations, never durable configuration. Production navigation consumption remains a no-op; Task 005 will supply identity, generation and closure preconditions.

## Integration points

`planning/group-destination.ts` exports readonly structural requests/snapshots, placement plans, request validation and `planGroupDestination`. `execution/group-placement.ts` exports the injected structural grouping port and `createGroupPlacementService({port,queue}).place(request)`. `browser/group-placement.ts` implements the port with the existing snapshot reader and explicit Chrome grouping calls.

## Acceptance criteria and decisions

- [x] Controller policy: resolve in the source tab's explicit own window, prefer its current exact-title group, otherwise lowest observed member index then numeric group ID. Title equality is literal and case-sensitive. No designated cross-window gathering or new product setting.
- [x] Return an explicit destination and placement intent; all observations and new groups use concrete window IDs. Existing grouping supplies a concrete group ID. Reject invalid request IDs/context/title before browser calls.
- [x] Fresh observations detect deletion/rename, last-member disappearance, pinning, movement and context changes. Matching orphan groups and contradictory observations skip conservatively; a coherent second observation can recover a torn first observation. No unbounded retries.
- [x] Creation, reuse, current preference, ambiguous titles, stale IDs, pinned preservation and partial failures have focused unit/integration and isolated real-browser evidence. A promise-gated simultaneous-request test proves serialization through final verification and one successful creation.

The controller chose bounded replanning, explicit failure stages/effects and no rollback or failed-mutation retry. A failed grouping call has uncertain effects; a failed naming call may leave an unnamed group containing the source. Subsequent calls do not adopt unnamed groups as the configured title. New groups receive only a title update; existing title/color/collapse are never explicitly updated. Chrome can expand/reposition a group while grouping an active tab. Success describes an observed membership/title, not transactionality or permission to close another tab.

## Verification and limits

Planner tests pin case/literal titles, tie-breaking, frozen inputs, invalid requests and torn/foreign/context observations. Service tests cover two reads/replanning, post-group/pre-title/post-title verification, original rejection causes, precise partial effects, deterministic invalidation and queue recovery. Adapter tests pin exact native arguments and detached URL-free structural snapshots. Source/graph guard tests enforce pure planning and structural execution dependencies, including erased type imports and scoped external packages.

`tests/browser/group-placement.spec.ts` builds the actual service/adapter into a temporary extension fixture, leaving the five-file distribution and production entry wiring intact. It verifies real create/title/reuse, current preference, leftmost duplicates, literal/case titles, nonfocused own-window isolation, last-member removal/stale rejection, pinned tabs and real grouping followed by injected title rejection. The capability check records whether this isolated extension can access incognito; unavailable access is not claimed as real incognito coverage.

Manual incognito validation remains: in a disposable Chrome profile, load an equivalent test fixture, explicitly allow it in incognito, create normal and incognito windows with the same title, invoke the service using each source's actual window/context, and verify it never adopts the other context's group. Do not change the user's normal browser settings. Also validate the declared Chrome 120 floor and current stable before release. Exact commands, Chromium version, results and limitations are recorded in the implementation report.

## Queue ownership

Future wiring must retain one group placement service and dedicated shared group placement queue per worker lifetime. Inject `createOperationQueue()` structurally; do not pass an outer coordinator queue whose active job awaits placement, because nested scheduling on that same queue deadlocks. Serialization lasts only until this service settles verification, and does not coordinate other service instances, external actors or worker restarts.
