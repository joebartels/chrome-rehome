# Whole-feature architecture and correctness review — backlog 004

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Reviewed range: `historical-revision..historical-revision` on 2026-10-26. Scope: navigation eligibility and pure winner/anchor selection, including future 005 integration obligations. The only tracked working-tree difference observed outside that range was the controller’s plan-checkbox update.

## Strengths

- **The architecture preserves the authority boundary.** Planning owns structural readonly contracts and has no browser/background imports (`src/planning/candidates.ts:1`). The actual production entry still supplies `consume: async () => {}` (`src/background/index.ts:15`). The coordinator adds replacement forwarding without changing initialization/configuration guards (`src/background/coordinator.ts:42`, `:57`). The existing snapshot reader supplies native URLs, pending URLs, location and context, and its normal-window query is compatible with the intended caller (`src/browser/snapshots.ts:37`). No implementation of 005–010, mutation activation, schema, permission or dependency change appears in the full diff.

- **Revocation and provenance are coherent.** Observation replaces current work synchronously before eligibility filtering (`src/background/navigation.ts:70`). Main-frame filtering leaves subframes unable to revoke work; invalid/nonactive metadata blocks the tab and clears trust. Before-navigate preserves only redirect-source provenance, while reload/ineligible commits and replacements remove it (`:57`, `:85`, `:104`). Same-document changes require the trusted document and changed native href; foreign-document callbacks cannot acquire or overwrite that provenance (`:93`). Both replacement APIs reach the same clearing operation, and repeated delivery conservatively invalidates without synthesizing rank (`src/background/register-events.ts:45`, `:48`).

- **Runtime ownership and freshness are explicit.** Fresh Symbol epochs distinguish worker instances; tracker-wide generations prevent reuse after tab removal; whole-view revisions detect changes to previously unobserved anchors (`src/background/navigation.ts:40`, `:46`, `:109`, `:112`). Exhaustion clears state and makes freshness checks fail closed. Views expose frozen arrays and frozen current events, with no retained historical event list. Exact latest fingerprints are copied and deduplicated without using browser timestamps as a winner clock.

- **Selection does not confuse duplicate equivalence with current-document freshness.** Complete trigger observations must match the view; native href equality separately validates snapshot/event consistency before duplicate identity is consulted (`src/planning/candidates.ts:75`, `:78`, `:86`). The compiler receives actual snapshot URLs and incognito values. Pinned, pending, blocked, cross-context and inconsistent tabs cannot participate. Only eligible current observations can win, while passive snapshots can become duplicates. Ranking and anchor sorting are deterministic across input permutations (`:93`, `:97`). Results copy/freeze tab and navigation observations and expose neither identity keys nor closure instructions (`:101`).

- **The malformed-collection correction addresses I1 without widening policy.** Densification makes sparse qualifier slots fail the known-qualifier check before provenance can be established (`src/background/navigation.ts:79`); the regression checks synchronous token/view revocation, blocking and suppressed subsequent SPA/fragment/client-redirect trust (`tests/unit/navigation.test.ts:43`). The selector independently checks array shapes and validates every element using `for...of`, which visits sparse holes as undefined; its navigation/tab/blocked-ID loops therefore fail closed rather than skipping holes (`src/planning/candidates.ts:57`, `:61`, `:66`, `:71`). No second sparse-array admission defect was found.

- **Tests exercise observable behavior and meaningful races.** The real duplicate compiler drives selector tests, including relaxed identity against stale actual URLs, full-trigger matching, deterministic ties/anchors and immutable outputs (`tests/unit/candidates.test.ts:24`, `:40`, `:63`, `:104`). The captured-view test explicitly demonstrates that pure selection can return an observation which the caller must reject after anchor invalidation (`:137`), rather than pretending the selector has live browser knowledge. Deferred initialization, synchronous revocation, complete-view supersession and both replacement callback orders have integration coverage (`tests/integration/coordinator.test.ts:134`, `:149`; `tests/integration/register-events.test.ts:204`).

- **Browser evidence is appropriately bounded.** The temporary fixture uses the actual registry/coordinator/tracker/selector and snapshot adapter. Native traces support committed redirects, same-document changes, reload suppression, back/forward, pendingUrl exclusion and a genuinely restarted worker. The unqualified script `link` admission is asserted and prominently disclosed, not mislabeled as qualified cold-client rejection (`tests/browser/navigation.spec.ts:155`; `GitHub issue #4 (historical task 004)`). The failed native prerender attempt is recorded as a capability gap with no replacement callbacks; it is not presented as successful activation coverage.

## Issues

### Critical (Must Fix)

None found.

### Important (Should Fix)

None found in this final range. Previous I1 is addressed by `historical-revision` and its targeted regression.

### Minor (Nice to Have)

None requiring a change for this task gate.

## Recommendations

Carry the documented integration protocol into 005 tests: capture the view before browser reads, reject it if the revision changes, then revalidate event/view and authoritative participant URL/context/location around downstream asynchronous work. A selected observation is not an atomic snapshot or a mutation authorization (`docs/archive/superpowers/specs/2026-10-26-navigation-eligibility-design.md:89`; `GitHub issue #4 (historical task 004)`).

Preserve the explicit activation gate for the ordinary-link script residual and the real-browser manual gaps. The current implementation can be accepted as inactive primitives without implying that restore-safe automatic closure, release compatibility or universal human-intent detection has been demonstrated.

## Review evidence and limitations

Read the complete 1,737-line supplied feature diff in bounded ranges; reread the truncated documentation section. Read the named design and plan, constraints/progress ledger, complete implementation report including native attachments and the I1 fix evidence, original task review and scoped fix review. Also inspected the unchanged production entry, full coordinator and snapshot adapter to verify the integration/no-op claims directly. No subagents were dispatched.

Controller reports fresh verification on `historical-revision`: 640 tests across 18 files, 21 Chromium tests (13.4s), typecheck, build and package validation passing. The implementation report records historical RED/GREEN evidence and the earlier 638-test pre-fix result separately. I did not independently rerun these passing suites or claim their execution as my own. Static inspection raised no specific unresolved suspicion requiring an additional focused probe.

No source, tracked documentation, index, HEAD, branch, dependencies or browser state were modified during this review. Only this explicitly requested scratch report was written under a narrow filesystem grant.

## Declined to judge

- Automatic movement, placement, closure, recovery and pause/protection behavior: intentionally absent from 004; these belong to 005–008, and production consume remains a no-op. Their safety cannot be inferred from selection success.
- Universal human-intent/restoration detection: ordinary-link metadata demonstrably admits an unqualified script after restart; this is an explicitly bounded policy choice, not a claim implemented or validated by 004. Future activation requires a product ruling on that residual.
- Actual session restore/reopen, trusted omnibox/external launch, native prerender activation/replacement and real incognito browser outcomes: the existing harness did not establish them. The design permits documented capability gaps/manual checks; deterministic policy/replacement/context tests are not substituted for those browser results.
- Chrome 120/current-stable release matrix, hosted CI and release/performance readiness: not established by the supplied local Chromium run and explicitly assigned to later release validation.
- Runtime mutation races after selection, including location/pinning/context changes without navigation events: 004 returns observations and explicitly requires downstream authoritative revalidation. No executor exists here to assess against that requirement.

## Assessment

**Ready to merge? Yes — for the scoped, inactive backlog 004 implementation.**

The final change implements the adopted eligibility, provenance, epoch/revision, ranking and selection contracts without crossing into execution authority, and the demonstrated malformed-qualifier defect is fixed. There are no new Critical or Important findings; the explicit browser/policy limits remain future activation constraints rather than evidence of safe automatic organization today.
