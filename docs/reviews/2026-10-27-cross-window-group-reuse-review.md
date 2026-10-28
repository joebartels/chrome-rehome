# Final whole-feature review: Task007b

Reviewed branch `cross-window-group-reuse`, base `historical-revision`, head `historical-revision`, against the approved design, implementation plan, and the controller's explicit attention/closure ruling. Review performed read-only on `<repository>`; no repository, index, HEAD, branch, or browser-state changes and no subagents.

## Strengths

- **One destination planner, with manual organization still authoritative.** [replacement.ts:67](../../src/planning/replacement.ts) resolves an eligible duplicate anchor before consulting grouping rules. [group-destination.ts:49](../../src/planning/group-destination.ts) implements exact-title/context filtering and current/local/remote ordering, returns the actual remote window, and preserves omitted/explicit window scope. Snapshot coherence and relevant shared-group rejection prevent a bad selected destination from falling through to creation. The existing executor moves only the incoming ID; there is no group-merging path.
- **Global creation intent stays fresh.** [placement.ts:67](../../src/execution/placement.ts) checks for a newly appearing same-title, same-context group across the entire snapshot, including outside the structural windows. Only its own created group is excluded. The guard applies before creation and naming, and stops without replay/replanning. Tests cover creation and rename races plus other-incognito controls at [placement.test.ts:165](../../tests/unit/placement.test.ts).
- **Intent is captured before movement and cannot be promoted later.** [background/placement.ts:34](../../src/background/placement.ts) uses the raw first snapshot rather than the candidate copy that omits active metadata. [planning/presentation.ts:23](../../src/planning/presentation.ts) requires corroborating active/focused evidence and otherwise preserves attention. [browser/placement.ts:14](../../src/browser/placement.ts) validates/detaches native normal-window observations and exposes only the exact activate/focus payloads.
- **Native effects and uncertainty retain one protocol.** [execution/placement.ts:158](../../src/execution/placement.ts) persists pending, repeats full snapshot/document/attention preflight, awaits the native call, settles, verifies, and persists the verified phase. Invalid fulfilled results still reach the settlement `finally`; rejected native calls preserve the original cause even if bookkeeping fails. [execution/presentation.ts:29](../../src/execution/presentation.ts) accepts only bounded effects of the issued mutation, freezes the observed native successor, and requires destination focus when the source disappears.
- **Presentation precedes deletion authority.** [execution/placement.ts:271](../../src/execution/placement.ts) activates then focuses only when needed and verifies the final state. [execution/replacement.ts:140](../../src/execution/replacement.ts) checks attention again after durable `placed`. The following closure loop retains its independent document/snapshot/removal-lease checks and performs no more presentation calls. Ending attention authority at that accepted barrier matches the explicit ruling; later focus-only changes are not silently treated as cancellation of verified cleanup.
- **Recovery compatibility is narrow and conservative.** [journal.ts:42](../../src/execution/journal.ts) retains v1 names/bound 105, adds only activate/focus and bound 107 for v2, and keeps strict keys, participant/context, pending winner target, removal prefix, and terminal checks. New records are v2. [recovery.ts:14](../../src/background/recovery.ts) blocks every pending record without replay and reconciles settled records read-only. No URLs or attention receipts enter persistent records.
- **Behavioral evidence crosses real integration boundaries.** Tests cover raw-active consumer plumbing, unknown evidence, placement ordering, both new native failures, pending/settlement storage failures, post-persistence revocation, unresolved queue ownership, restart quarantine, and source disappearance. Production browser cases exercise all rule/manual/ungrouped foreground and Cmd-click background combinations, history/identity, collapsed groups, minimized destinations, and actual OS launches. The manual HTML trial and options help describe the intended flows without adding Task008 controls.

## Issues

### Critical — must fix

None found.

### Important — should fix

None found.

### Minor — nonblocking

1. **An earlier native activation-gate timeout remains unexplained.** [replacement-recovery.spec.ts:473](../../tests/browser/replacement-recovery.spec.ts), with the retained `.superpowers/sdd/2026-10-27-cross-window-group-reuse/task-2-evidence/pending-activate-gate-timeout-trace.zip`. I inspected the trace: the `reached` assertion repeatedly observed an undefined token and timed out after 10 seconds. The record does not establish the post-click focused state or journal progression needed to distinguish conservative attention cancellation, fixture scheduling, and a product defect. New pre-trigger assertions and failure-state diagnostics at lines 484–492 improve future diagnosis. The reported ten targeted passes, final author run, and independently inspected controller 133-case result support readiness; they do **not** explain the failure or prove it fixed. Keep the trace and disclosure, and diagnose a recurrence from the added observations. Do not weaken production guards or add a blind retry. This is a verification limitation, with no demonstrated unsafe-closure path or reproducible product failure; it does not block this controlled trial.

2. **Reload instructions conflict about activation.** [README.md:67](../../README.md) says to reload while keeping the current activation setting enabled; [README.md:3](../../README.md) says to pause before reloading. A reader cannot tell whether the new trial assumes an already-enabled 007a installation or overrides the older-build upgrade precaution. Clarify that distinction, or give one pause/reload/explicit-enable sequence. This is documentation clarity, not a finding that the approved already-enabled trial requires another authorization gate.

## Verification and review method

I inspected the supplied review package inventory and the corresponding full Git changes by concern, then read the complete changed production state machines and focused surrounding code: candidate selection/copying, snapshots, consumer, recovery, and closure. I read the plan/spec/ledger, task reports, previous review reports, native browser test implementations, and current user documentation. Previous reviewer verdicts were evidence to consider, not a substitute for this inspection. Truncated combined reads were recovered with focused file/diff reads.

I directly parsed `.superpowers/sdd/2026-10-27-cross-window-group-reuse/controller-browser.json`: **133 expected, 0 skipped, 0 unexpected, 0 flaky, `errors: []`**, duration 160713 ms. Retained native JSON independently shows unchanged source focus and active IDs for all three background variants, and selected incoming IDs plus remote focus for all three foreground variants. The three remote external-launch records identify `/usr/bin/open` and show the incoming survivor active in its focused destination. The browser termination tests explicitly record `nativeOutstanding:false` and distinguish durable-write gates from fulfilled-native wrapper gates.

The controller reports fresh 1045 unit/integration tests across 30 files, typecheck, build, package validation, and 102 matching source/test/dist hashes; the author report provides its separate final verification. I did not rerun suites or launch browsers, and do not present those reported checks as my own execution. The final working-tree status read was clean. The changed-file inventory contains no dependencies, permission additions, configuration-schema changes, or Task008 controls.

## Declined to judge

- Chrome120/current stable, non-macOS native focus, and explicitly enabled incognito runtime behavior: those real-browser environments were not exercised by the supplied Chromium156/macOS evidence; existing manual release gaps remain disclosed.
- Actual mouse-drag/native rejection interaction: simulated rejection tests establish protocol behavior, not the unperformed manual gesture trial.
- Deterministic worker termination while a Chrome activation/focus API itself is still outstanding: browser gates do not prove that interval; portable deferred-native tests establish modeled queue/quarantine behavior only.
- Task008 pause/protection controls, unsaved-form protection, and broader release/performance readiness: explicitly deferred work; this review neither requires their implementation nor certifies them.
- The precise cause of the historical activation-gate timeout: retained evidence is insufficient; classified above rather than silently excluded.

I did judge the documented attention snapshot races, native successor exceptions, and post-placed closure boundary against the explicit approved contract. They are accepted, disclosed limits rather than omitted review subjects. The pending final-review status in task/ledger documents is intentional controller-owned completion work, not a stale-status defect.

## Assessment

**Ready to merge/complete Task007b: Yes, with the two nonblocking minor items above.** No Critical or Important finding requires a code fix. The feature preserves duplicate-first organization and conservative deletion/recovery boundaries while adding global reuse and foreground presentation through the existing serialized protocol. Retain the timeout limitation, clarify the reload wording when finalizing documentation, finish the controller-owned completion record, and pause before Task008.

## Scoped follow-up: README activation cleanup

**Documentation cleanup approved; original Minor issue 2 is resolved.** This follow-up compares the current README (including the working-tree relocation after `historical-revision`) with `historical-revision` and reads `.superpowers/sdd/2026-10-27-cross-window-group-reuse/final-fix-report.md`. No repository edits, tests, or browser launches were performed.

- The opening warning and cross-window trial step 1 consistently distinguish a Task005-or-earlier placement-only upgrade, which must pause before reload, from an already-enabled Task006/007a controlled trial, which may preserve activation across reload. Fresh/disabled installations remain disabled.
- The controlled replacement trial retains its uninterrupted sequence: export the existing configuration, write `enabled:false` while preserving it, verify disabled in Options, reload, then explicitly create the fresh trial configuration. The new existing-configuration activation block is in the cross-window section, outside that pause/verify/reload sequence.
- The new activation block reads the existing stored configuration, rejects absence, and spreads the saved fields while changing only `enabled:true`. Existing grouping/duplicate rules are preserved. The accompanying text explains the master flag, the absence of Task008's toggle, and the need to verify Options before continuing. This resolves the disabled-master-state ambiguity without introducing another activation mechanism or claiming a reload is necessary.

**Product readiness is reopened.** The controller reports a real user focus failure under separate investigation. The earlier whole-feature readiness assessment above is historical and must not be treated as current approval to complete the feature. This follow-up judges only README activation instructions; it does not investigate, resolve, or certify the newly reported focus behavior. The earlier unexplained native fixture timeout likewise remains unresolved.
