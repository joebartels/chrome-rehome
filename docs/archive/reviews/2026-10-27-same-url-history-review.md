# Task 3 independent review

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

## Spec compliance

**✅ Spec compliant.** Reviewed base `historical-revision` through author head `historical-revision` against the Task 3 brief and final history-event compatibility amendment. The product correction is confined to `src/background/navigation.ts:81–101`; it preserves only a fully admitted unchanged history/fragment observation, retaining original navigation authority without emitting another candidate. Changed URL bytes, changed documents, invalid/ineligible metadata, missing ownership, and pending navigation still follow existing invalidation. No new dependency, permission, schema, package file, production control, retry, or Task008 behavior appears in the supplied change inventory.

**⚠️ Completion work outside this author diff:** final trial artifact/export and root-owned completion documentation remain the controller’s responsibility. The reported build/package/typecheck and 1,065 unit/integration passes are author/controller evidence, not commands executed by this reviewer. Minimum Chrome120 native behavior, personal-profile behavior, and arbitrary macOS Spaces/app timing are not established by the isolated 155/156 evidence.

## Strengths

- The admission exception is narrow and easy to audit. `src/background/navigation.ts:82–94` validates URL parsing, timestamp, document/lifecycle/frame metadata, admitted transition and qualifier policy before requiring exact event URL bytes against the original navigation and matching provenance document/href. Only the fingerprint changes at lines 95–96. The original frozen navigation remains intact; no counter or removal-lease state is rewritten.
- The regression tests assert authority rather than only return values. `tests/unit/navigation.test.ts:184` covers original navigation object identity, retained view/lease, unchanged generation/sequence and subsequent real URL change. The following cases cover latest-fingerprint behavior, equal parsed href with changed bytes, malformed metadata, revoked/missing ownership and independently stale views/leases through line 269.
- Native regression coverage exercises the actual event path. `tests/browser/replacement-recovery-fixture.ts:49` awaits the native move before holding its wrapper. `tests/browser/replacement-recovery.spec.ts:511` delivers real page history during that gate and asserts foreground selection/focus/closure, background spare selections and zero presentation calls, and changed-URL abandonment. Its evidence explicitly distinguishes this gate from interruption inside an outstanding Chrome API.
- The external-app case establishes an independently owned foreground process before LaunchServices opens the URL. `tests/browser/foreground-helper.ts:24–47` owns the child and verifies its PID; `tests/browser/external-app-links.spec.ts:137–151` checks all isolated Chrome windows are unfocused. Lines 188–194 additionally require incoming history during the journal interval, and final native active/focused state is checked by the existing remote assertions. `docs/archive/architecture.md:49` and the appended evidence paragraphs describe the narrowed contract and measured limitations.

## Named integration-risk checks

1. **Retained authority must not revive stale state.** Checked the tracker’s unchanged invalidation/removal/replacement and lease rules because the supplied hunk ended mid-`observe`. `src/background/navigation.ts:62–75` removes current navigation on invalidation/removal; lines 124–146 bind leases and tokens to revision/epoch/generation and prevent disposed or stale leases from becoming current. The new branch does not update these fields. An unrelated tab invalidation therefore leaves old views/leases stale, as asserted at `tests/unit/navigation.test.ts:258`.
2. **A no-op must not create work or promote winner rank.** Checked the coordinator’s direct `observe` call and selector ranking. `src/background/coordinator.ts:48–55` returns immediately when observation yields no event, before queueing consumption. `src/planning/candidates.ts:95–103` still ranks by original observed sequence and tab-ID tie break. The correction neither increments that sequence nor changes the navigation object (`src/background/navigation.ts:95–96`, versus the unchanged new-navigation creation at lines 117–120).
3. **Consumer snapshot ownership must remain guarded.** Checked `src/background/placement.ts:20–38`: it captures its view before the snapshot and checks event/view/config currency after asynchronous reads. Lines 62–70 retain an operation removal lease and require current event, configuration, lease and journal throughout execution. Preserving a valid history no-op supplies none of the authority missing from an otherwise stale operation.
4. **Placement and closure must retain exact document/URL and attention checks.** Checked the existing placement mutation preflight/settlement and replacement barrier/closure. `src/execution/placement.ts:128–194` still brackets snapshots/documents with ownership and attention checks, awaits native settlement and performs full verification. Its original URL check remains at line 64. `src/execution/replacement.ts:75–89` compares exact participant URLs and live document IDs; lines 140–155 preserve the post-placed attention barrier and full removal preflight. The no-op change does not bypass or extend the established attention/closure boundary.

## Issues

### Critical

None found.

### Important

None found.

### Minor

No new Task 3 finding. The historical Task 2 pending-activation gate timeout remains the disclosed nonblocking verification limitation in `final-review.md`; this correction’s separate reproduction and RED/GREEN evidence neither diagnoses nor erases it. The accepted non-atomic attention limits likewise remain unchanged.

## Evidence inspected

- Parsed retained `task-3-evidence/native155-red.json`: the no-history control completed sequence 6 with destination focus and the incoming winner active; the real same-URL history case retained exact document/URL metadata but abandoned at completed phase `group`, settled sequence 3, without duplicate removal and with source focus remaining. This matches the defect explained by the old advancement-before-no-op ordering.
- Parsed retained `task-3-evidence/native155-green.json`: both control and history cases completed sequence 6, removed the old duplicate, and left the incoming winner active in the focused destination. The history observation preserves the winner’s navigation in the tracker.
- Parsed `task-3-evidence/full-browser.json`: **137 expected, 0 skipped, 0 unexpected, 0 flaky, errors []**, duration 166,593 ms. No stderr warnings were present; the four stdout entries are pre-existing intentional native-state evidence.
- Read the author’s RED/GREEN report, supplied review package, binding amendment, prior whole-feature review and progress ledger. The initial combined diff output was truncated; recovered only the omitted middle, including source and external-app test changes. Read `navigation.ts` separately to finish the cut-off function and inspect the explicitly named shared-state risk. No Git diff rederivation, test execution, native/browser launch, index/branch mutation, or subagent dispatch was performed. Only this report is written.

## Assessment

**Task quality: Approved.** The small tracker correction implements the confirmed policy amendment without weakening consumer, placement, removal or attention guards. The deterministic authority regressions and real 155/156 history evidence support the causal correction; proceed with controller-owned final verification/documentation and retain the previously disclosed limits before completing007b and pausing before008.
