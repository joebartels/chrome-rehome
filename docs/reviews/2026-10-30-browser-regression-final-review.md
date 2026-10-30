# Task009 final independent review

Reviewed base `historical-revision` through head `historical-revision`, plus the controller closeout draft. Version: **0.1.2**. Review date: 2026-10-30.

## Strengths

- The production program is preserved. The range has no `src/` changes, dependency additions, new permissions, schema/RPC changes or activation change. Version-only manifest/package/lock edits are consistent. Current distribution hashes match the independently rebuilt controller artifact; all seven non-manifest files and the metafile match pre-bump evidence. The eight-file ZIP passes CRC, matches current dist byte-for-byte and matches its recorded SHA256. This makes the scope claim concrete rather than inferred from test success.
- Browser projects are explicitly disjoint, with a darwin-only native project, one worker, zero retries and CI forbidOnly (`playwright.config.ts:3`). The CLI validates every selected result and independently requires each named project to be configured and nonempty (`scripts/check-browser-results.mjs:20`). Xvfb CI preserves pipeline failure and retains JSON/log/trace artifacts even on failure (`.github/workflows/ci.yml:21`).
- Typed, SPA and redirect cases check actual Chrome metadata, incoming identity/history, older duplicate removal and manual precedence over a configured group (`tests/browser/replacement-placement.spec.ts:498`). The pinned-older case verifies excluded pinned placement plus eligible duplicate closure (`tests/browser/replacement-placement.spec.ts:579`). The incoming-pinned negative case needs the synchronization correction below.
- Foreground diagnostics preserve the native attention object, classify the first relevant committed document, and correlate token, incoming identity and phase. A mismatch takes priority and throws outside the poll. Earlier setup work cannot satisfy the foreground phase (`tests/browser/recovery-observations.ts:6`, `:12`, `:22`; `tests/browser/replacement-recovery-fixture.ts:29`, `:70`; `tests/browser/replacement-recovery.spec.ts:271`). Actual owned/frontmost PID snapshots are read-only; setup activation remains exact-owned-process-only.
- Recovery waits represent real progress: the fixture records initialized, new-realm acknowledgments only after coordinator.handle resolves; the predicate requires exact committed tab/URL/document identity (`tests/browser/replacement-recovery-fixture.ts:130`; `tests/browser/recovery-observations.ts:17`). Production seeded quarantine waits for initialized blocked status and verifies two changed committed documents. Existing journal/survivor/phase assertions are retained.
- Failure reporting is candid. The original 159/160 full run is retained and rejected by the gate. The unknown options-to-about:blank event and historical attention-null failures are not called repaired. The diagnostic field collision was fixed without weakening the exact durable-write assertion. The final 160/160 report is a genuine single invocation, not an aggregate of focused passes.

## Issues

### Critical (Must Fix)

None found.

### Important (Should Fix)

**[P2] The pinned-incoming completion stimulus can cancel the behavior being tested.**

- Location: `tests/browser/replacement-placement.spec.ts:565`–`:567` (the incoming click/waitForURL followed immediately by `barrier.goto`).
- `waitForURL` confirms page navigation, not completion of extension handling. The subsequent unrelated committed navigation advances the tracker’s global revision (`src/background/navigation.ts:98`). An incoming operation that has captured its view and is still awaiting a browser read then fails the whole-view guard (`src/background/placement.ts:20`–`:32`; `src/background/navigation.ts:153`). Thus a regression that wrongly admits the pinned incoming tab can be canceled by the test’s barrier before it mutates anything. The barrier’s later successful grouping and the exact unchanged-state assertions can all pass. This is a concrete false-pass path in the newly required negative coverage, not evidence of a current product defect.
- Why it matters: the coverage matrix calls the later grouping a completed pinned-incoming observation (`docs/testing/browser-regression-matrix.md:25`). It establishes that the later operation ran, but cannot distinguish correct pinned exclusion from cancellation of the earlier operation. The green 160-case invocation does not close that synchronization gap.
- Minimum correction: do not create any intervening navigation or other view-invalidating stimulus before the pinned operation’s completion is known. Use an acknowledgment correlated to that incoming tab/document/URL after its actual handler resolves. If this cannot be obtained honestly from untouched production dist, keep its production state observation explicitly limited and add a clearly labeled copied-worker fixture companion using the existing Task2 completion mechanism. That companion must await the pinned incoming acknowledgment in the same realm, then assert exact retained IDs/order/groups and older survivors, without a later navigation canceling the operation. Preserve production behavior and dist contents; do not add a public endpoint or a fixed delay.
- Verification: show that the corrected synchronization remains pending while the relevant handler is deliberately held, and that a controlled delayed erroneous mutation or equivalent negative control fails the pinned assertion rather than being canceled by the barrier. Run the focused affected cases, not a blanket native rerun merely for this portable harness correction. If evidence moves partly to an instrumented fixture, record the evidence-class/spec adjustment explicitly in the matrix, verification record and closeout claims; do not continue to describe it as full untouched-dist completion proof.

### Minor (Nice to Have)

None found. Draft review-pending wording is an expected pre-closeout state, not a source defect.

## Evidence checks

I read the complete 163,748-byte / 1,811-line supplied review package in consecutive bounded chunks, including the full spec and plan, before reading changed-file continuations. I read both task reports/reviews, the ledger, root verification/export manifests and controller closeout draft. A combined report read was truncated; the affected Task2 report and both reviews were subsequently read separately in full.

Read-only Git name inventory matches the supplied 23-file range and contains no production source files. No tests, build, browser, CUA, worker restart, source/index/HEAD mutation or subagent invocation was performed by this reviewer. The only write is this review report.

Direct checks of raw retained artifacts:

- `root-unit.json`: success true; 1,382 passed, zero failed/pending/todo; 46 actual file results, all passed. `root-verification.json` records independent typecheck/unit/build/package/whitespace exit 0. Build/package logs confirm build and package success; typecheck and whitespace logs are empty.
- `task-2-evidence/browser-final.json`: 160 unique file/line/title cases; 28 native-macos, 125 portable, 7 headed. All have one passing attempt at retry 0 and expected passed status. Configured retries 0, workers 1; report errors empty; skips/flaky/unexpected all zero. Start 2026-10-30T03:36:01.161Z, duration 174427.673 ms. Final checker log accepts each lane.
- `task-2-evidence/browser-full.json`: 159 passed and one failed attempt, all retry 0; native 27/28, portable 125/125, headed 7/7. The single failed case is the stopped-worker external HTTPS test’s initial disabled-options status assertion. Its strict checker log rejects the report. The extracted trace snapshots show options loaded, then the same assertion ending at about:blank. They support the symptom, not a cause. The exact command ledger retains failed, focused and final runs separately.
- All 33 final instrumented restart artifacts with completion state have different old/new realms, initialized true, and committed wake acknowledgments; 13 other restart artifacts are production cases without fixture completion state. All eight foreground phase artifacts retain matching admission winner/document and mismatch false, plus actual native attention; nativeOutstanding remains false. The inspected OS artifact has identical owned and frontmost PIDs at its timestamp.
- All nine seeded-quarantine artifacts report blocked readiness, two target commits and preserved journal records. All three history artifacts preserve expected presentation writes: foreground activate/focus, background none, changed-URL cancellation none. Raw typed/SPA/redirect attachments contain the claimed actual event kinds/metadata.
- `package-identity.json`, `pre-bump-artifacts.json`, current dist and root export manifest agree. Current dist contains exactly eight files, manifest version 0.1.2, five permissions and minimum Chrome 120. The metafile has exactly the three expected JS outputs. Seven non-manifest program hashes match pre-bump records. The versioned ZIP has eight entries, valid CRC, the declared SHA256 and byte identity with dist.
- Prior task approvals were considered as evidence, not substituted for this integration review. The P2 above is a newly identified interaction between a Task1 negative-case barrier and existing whole-view cancellation.

## Focused unchanged-context checks

Each expansion had a specific integration risk:

- `src/background/coordinator.ts:36`–`:72` and `src/background/operation-queue.ts:1`: check that the fixture’s global incoming state cannot overlap another consume, and that post-handle acknowledgment follows shared initialization and queued work. Serialized consumption and awaited initialization support the Task2 design.
- `src/background/placement.ts:19`–`:38`: check that the first read represents presentation admission and that the pinned barrier cannot safely serve as completion. The first native attention read precedes plan execution; the captured whole-view guard also establishes the P2 cancellation path.
- `src/background/index.ts:32`–`:45` and `src/background/controls.ts:65`–`:98`: check that blocked is initialized recovery state rather than startup still checking. It is a meaningful production quarantine readiness condition.
- `src/background/navigation.ts:39`–`:65`, `:78`–`:120`, `:145`–`:155`: check the named pinned-test invalidation risk. New committed navigation advances global revision; whole-view equality fails independently of the incoming tab’s own generation.
- `src/planning/candidates.ts:56`–`:115`: confirm the pinned exclusion being exercised and distinguish correct current selection from an observation that could pass through cancellation. Current source excludes pinned tabs; no current policy defect is asserted.
- Existing fixture setup in `tests/browser/controls.spec.ts:11`–`:29` and `tests/browser/replacement-placement.spec.ts:27`–`:56`: confirm lane tags preserve real headed execution and owned temporary profiles rather than merely relabeling headless tests.
- Changed recovery-fixture function context and the cut-off history-test continuation (`tests/browser/replacement-recovery.spec.ts:575`–`:624`): confirm actual activate/focus write-count and background selection assertions remain intact after the diagnostic-field change.

## Declined to judge

- Hosted Ubuntu/Xvfb execution: CI configuration is reviewed, but no hosted-run evidence exists; retain the explicit unobserved-environment limit.
- Chrome 120 and current stable runtime certification: the bundle target/manifest floor is preserved, but recorded execution uses bundled Chromium 156; release qualification is outside Task009.
- Trusted omnibox input: CDP typed stimulation verifies real typed metadata, not trusted user input; no UI capture supplied.
- Actual native tab-menu click, emoji appearance and full menu visual/event capture: prior user observations and synthetic API-boundary tests do not supply those captures; completed 008a behavior is baseline, not reopened here.
- Interactive drag and genuine native rejection: injected wrapper failures are distinct evidence and do not establish real drag behavior; manual/release work remains.
- Automated macOS Spaces behavior: same/different-desktop success is user-reported with version unspecified, not captured automation evidence.
- External-app launch routing on other operating systems: this native lane uses macOS LaunchServices only.
- Interruption inside an outstanding native Chrome API call: durable-write and native-fulfilled gates explicitly do not establish that boundary; this review does not enlarge their evidence class.
- Causes of the historical attention-null failures and original options-to-about:blank transition: retained symptoms and later passes do not identify causality. No repair or nonrecurrence conclusion is made.
- Host-wide historical exclusivity/unlocked state and complete process cleanup: owned PID/profile code, artifacts and the ownership/cleanup report support scope, but cannot reconstruct all host activity retrospectively. No unowned manipulation is claimed.
- Broad re-audit of completed 008/008a production policy, all legacy tests and unrelated security/performance architecture: they are the accepted baseline; only named integration risks were expanded.
- Task010 performance/release readiness and Task011 recent tabs: neither is implemented or authorized by this task; no readiness claim is inferred from the local gate.
- Long-run reliability/failure probability: one final clean invocation is valid regression evidence, not a statistical reliability guarantee, particularly with the preserved unknown setup failure.

## Recommendations and assessment

Resolve the single P2 in one focused harness/evidence correction and update the completion claims to the resulting evidence class. Preserve the original 160/160 result as historical evidence rather than silently replacing it, retain the original failures, and obtain scoped independent re-review of the correction. No production fix, blanket sleep, native refocus or broad re-audit is warranted by this finding.

**Ready for final local Task009 handoff: With fixes.** The package identity, native diagnostics, recovery barriers and reported results are substantiated. One newly required pinned-incoming negative case can currently succeed through test-induced cancellation, so I do not approve the unqualified completed-regression claim until that coverage gap is resolved. No production behavior defect was found. No push or merge was performed or authorized by this review.
