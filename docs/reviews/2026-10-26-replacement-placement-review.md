# Task005 whole-feature review

Reviewed 2026-10-26, feature range `historical-revision..historical-revision` in `<repository>`.

## Strengths

- The production wiring is real and remains explicitly enabled through the existing configuration: `src/background/index.ts:18` connects the consumer; `src/background/placement.ts:17` captures the tracker view before the initial snapshot and combines config, event and whole-view freshness. `src/config/repository.ts:62` withholds a lease immediately when a newer load/save begins; `src/background/coordinator.ts:55` captures it within the existing queue. No second queue, nested grouping service, timeout release, automatic enablement, or new production test endpoint appears.
- `src/planning/replacement.ts:61` revalidates selection against the supplied snapshot/view before freezing the final destination and detached participant evidence. Configured grouping resolves through the existing own-window resolver, overriding duplicate location directly; inherited placement retains the checked anchor. The opt-in single-candidate path preserves the ordinary selector's previous behavior and eligibility gate. Winner and used inherited anchor require actual active outermost document evidence (`src/planning/replacement.ts:21`); overridden/passive duplicate documents are neither fabricated nor unnecessarily fetched (`src/background/placement.ts:32`).
- `src/execution/placement.ts:57` compares strict URLs, context, pinning, pending state, nonwinner order/membership and relevant group metadata while allowing expected winner index shifts. It permits only the emptied original source group to disappear, and source survivors remain required. Document reads are bracketed by snapshots (`src/execution/placement.ts:122`), and every native await has subsequent guard checks. Shared source, inherited target and configured target memberships are rejected both initially and during execution.
- `src/execution/placement.ts:158` calculates final insertion from the destination list with the winner removed once. Cross-window work lands directly at the final group's boundary before joining, then applies the inherited interior order. Existing IDs stay fixed, redundant moves are avoided, and bounded final observation rejects incompatible native placement. New groups receive only the requested title, with unexpected existing titles rejected. There are no production create/remove-tab, focus, active, highlighted or collapse updates.
- `src/execution/placement.ts:136` records attempted mutations before invocation and distinguishes uncertain, acknowledged and verified effects. Native rejection causes survive; promises remain awaited even when the lease is revoked. This supports honest partial-failure reporting without retries, rollback or false harmless skips after side effects. The consumer emits only redacted diagnostic codes.
- The tests address the meaningful risks: deferred revocation at every observed await (`tests/unit/placement.test.ts:77`), anchor document/location/context/shared changes during reads (`tests/unit/placement.test.ts:90`), pending config reload invalidation, and settlement of the sole queue. The six new production-dist browser cases use actual ordinary HTTP navigation and native tab/group APIs, retain the exact original tab-ID set after placement and check winner Back history. They supplement, rather than relabel, the existing browser fixture coverage.
- The corrected browser setup names the source window in native group creation and explicitly asserts distinct source/anchor windows (`tests/browser/replacement-placement.spec.ts:144`). Retained JSON shows source/target pairs 1914240844/1914240839 and 130285596/130285591, emptied sources disappearing, and the grouped winner between anchor and trailing member. The override JSON records an inactive winner and an expanded target. The earlier invalid cross-window claims are clearly withdrawn; no earlier misleading green was needed for this assessment.
- `README.md:75` supplies a concrete unpacked path and backup/export, explicit enable, rule-preserving pause and exact restore/remove-key instructions. The UI describes enabled/disabled/unavailable placement and the absence of closure/editor truthfully. The readability cleanup makes the executor's awaits, guards and state transitions auditable.

## Issues

### Critical (Must Fix)

None found.

### Important (Should Fix)

None found.

### Minor (Nice to Have)

None raised. The prior executor/consumer/browser readability concern has been addressed sufficiently for this review.

## Recommendations

Preserve the documented trial boundary and the four ledger rulings. When Task006 is separately authorized, obtain fresh closure evidence for every duplicate and add recovery/closure together; this plan's optional passive documents and successful placement result are not closure authorization. This is already stated in the design and architecture and agrees with the existing Task006 acceptance criteria, so it is not a missing Task005 implementation.

## Declined to judge

- Actual mouse-drag behavior, enabled-incognito placement and Chrome120/current-stable behavior: not established by headless Chromium156 evidence or simulated port errors. README explicitly identifies these as manual/release gaps; this review approves the controlled trial, not those environments.
- A universal focus/active/collapse preservation policy: expressly not the selected product behavior. Native changes are accepted, production makes no corresponding update calls, and both-focused headless window evidence cannot establish desktop focus preservation.
- Complete human-intent/restore detection for unqualified scripted `link` navigation: inherited Task004 residual explicitly accepted by the first ledger ruling only for the default-disabled placement trial. This review does not approve default activation or closure under that ambiguity.
- Atomic protection against the final check-to-native-call race, rollback of partial placement, crash recovery, and older-duplicate closure: native calls are not transactions; the third ruling explicitly permits honest partial placement and defers recovery/closure to Task006. No closure path ships here.
- Convenient rule editing, pause/protection controls and automatic/default activation: later tasks, explicitly excluded from this trial. Existing public storage configuration plus documented backup/pause/restore is the authorized interface.
- Placement completion under unrelated navigation or structural changes: conservative cancellation is an adopted policy, not a completion guarantee. The executor's stricter nonwinner snapshot checks are consistent with preserving external state.

## Assessment

**Ready to merge? Yes, for the explicitly enabled Task005 controlled-placement scope.**

The implementation matches the frozen-destination, single-queue, retained-tab design and has no identified correctness or architecture blocker. It keeps the accepted policy limitations visible and leaves Task006 unimplemented; no broad release/default-activation claim is implied.

## Evidence and review discipline

Reviewed the supplied full feature diff by bounded sections, design, implementation plan, constraints, ledger rulings, implementer report and prior task review. Examined all three retained native-evidence JSON files. Additional unchanged-code reads were limited to named integration risks: repository publication and coordinator startup ordering; event registration and own-move invalidation; selector eligibility/ranking; pure group resolver and native grouping window semantics; all-normal-window snapshot mapping; queue settlement; and Task006's closure/recovery boundary. Source, index and HEAD were not changed; only this requested ignored review report was written. No subagents or suite reruns were used.

The controller independently reported fresh verification on `historical-revision`: 687 tests across 22 files, typecheck, build and package checks passed; 27 Chromium tests passed in 18.3 seconds with zero unexpected, skipped or flaky cases. Those are controller-observed results, not tests rerun by this reviewer. Retained native JSON belongs to the corrected earlier full run; the final formatting commit and fresh controller gate are separately identified.
