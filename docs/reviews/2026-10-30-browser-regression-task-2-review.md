# Task 2 spec and quality review

## Spec compliance

**✅ Spec compliant.** Reviewed `historical-revision..historical-revision` using the supplied diff, Task 2 brief/report, full `docs/superpowers/specs/2026-10-29-browser-regression-design.md`, and AGENTS/RTK instructions.

- First relevant new committed-document admission preserves the actual reader result and correlates source/winner/URL/document/token. Matching mismatch outranks success; the waiter throws outside expect.poll, making mismatch terminal. Foreground phase holds require that admission identity; background remains unclassified with native assertions unchanged. Evidence: `tests/browser/recovery-observations.ts:6`, `:12`, `:22`; `tests/browser/replacement-recovery-fixture.ts:28`, `:59`; `tests/browser/replacement-recovery.spec.ts:261`, `:569`.
- Read-only AppKit snapshots expose timestamp, CDP-owned browser PID and actual frontmost PID. Setup activation remains owned-process-only; execution adds no activation/retry/focus substitution. Bounded timestamped observations include focus events, incoming identity and journal operation. Evidence: `tests/browser/owned-browser-focus.ts:5`, `:21`, `:33`; `tests/browser/replacement-recovery-fixture.ts:47`; `tests/browser/replacement-recovery.spec.ts:517`, `:569`.
- All five absence sleeps are replaced meaningfully. Instrumented recovery requires a different realm, completed initialization and post-handle committed acknowledgment matching wake tab/URL/document. Production quarantine uses existing blocked status plus two changed committed-document identities before exact serialized-journal/survivor checks. Existing phase/removal/document assertions remain. Evidence: `tests/browser/recovery-observations.ts:16`; `tests/browser/replacement-recovery-fixture.ts:122`; `tests/browser/replacement-recovery.spec.ts:152`, `:200`, `:359`, `:399`, `:488`, `:517`.
- Version-only changes synchronize the four source values at 0.1.2. The diff adds no production source, permissions, dependencies, schema, RPC, persistence, content scripts or distribution assets. Disabled activation, duplicate-first manual placement and unstarted 010/011 remain explicit. Evidence: `manifest.json:4`, `package.json:3`, `package-lock.json:3`, `:9`; `docs/reviews/2026-10-29-browser-regression-verification.md:3`, `:7`, `:45`.
- All required file categories have corresponding hunks. Step 5 authorizes the 008a stale-prose fix; external-case additions are passive diagnostics preserving the config assertion. Evidence: supplied diff inventory; `tests/browser/external-app-links.spec.ts:75`; `docs/tasks/todo/008a-tab-context-protection.md:12`.

## Strengths

- Token/first-read/new-document/phase correlation forms a concrete false-positive barrier. Tests cover missing/wrong attention, background nonclassification, stale tokens/documents and actual phase arrival (`tests/unit/recovery-observations.test.ts:6`, `:23`, `:29`, `:37`).
- Recovery acknowledgments represent real asynchronous handling after initialization; old realms, wrong identities and history-only acknowledgments cannot satisfy the predicate (`tests/browser/recovery-observations.ts:17`; `tests/browser/replacement-recovery-fixture.ts:122`; `tests/unit/recovery-observations.test.ts:42`).
- Observation snapshots use `operation`, separate from durable `journal` writes, preserving exact write-count assertions. Original failure/confirmation artifacts corroborate the correction without assertion weakening (`tests/browser/replacement-recovery-fixture.ts:59`; native-focused and native-diagnosis-confirmation evidence).
- Documentation preserves original failed runs and distinguishes later success from causal repair; fixture/CDP/synthetic/manual limitations are accurately labeled (`docs/reviews/2026-10-29-browser-regression-verification.md:25`, `:27`, `:29`, `:31`, `:33`).

## Issues

### Critical (Must Fix)

None found.

### Important (Should Fix)

None found.

### Minor (Nice to Have)

None found. The unexplained prior external setup transition is a retained evidence limitation, not an established defect in this diff.

## Raw evidence inspected

Evidence paths below are relative to `.superpowers/sdd/2026-10-29-browser-regression/task-2-evidence/`. No tests, builds, browser/CUA operations or Git commands were run.

- Raw TDD logs: diagnostics RED 4 failed/3 passed, GREEN 7/7; correlation RED 1 failed/7 passed, GREEN 8/8. Failures concern the specified missing admission/barrier/correlation behavior.
- Parsed actual JSON: recovery-focused 12/12; native-focused 4/5; native-diagnosis-confirmation 1/1; browser-full 159/160; external-setup-focused 1/1; browser-final 160/160. Final is 28 native-macos, 125 portable, 7 headed, one worker, every result passed once at retry 0, no runner errors/skips/flaky/unexpected results. Start 2026-10-30T03:36:01.161Z; duration 174427.673 ms.
- Read full/final strict checker logs: initial report rejected; final all three projects accepted. Read portable-final.log: 1382 tests/46 files pass. Final typecheck/build/package logs contain no reported failure and retain build/package success. Principal final/focused logs contain no warning/stderr lines.
- Sampled final actual-worker-restart.json artifacts: different realm UUIDs, initialized true, actual committed wake-document acknowledgments. Sampled foreground-phase.json: matching token/document and native attention, focus events and operation snapshots. OS snapshot has timestamp plus owned/frontmost PID fields.
- Read external-setup-trace-snapshots.json endpoints: options loaded at 11468.578 ms; disabled snapshots at 11471.248/11477.067 ms; assertion after snapshot at 21482.909 ms is about:blank. This supports the symptom, not its cause.
- Compared retained foreground history-corrective-move.json observations: initial native-focused artifact repeats journal pending activate/focus because snapshots shared that field; confirmation shows exactly actual activate/focus journal writes with separate operation snapshots. The diff leaves the exact assertion unchanged.
- Read runtime/package-identity/artifact-recheck JSON: Node24.22.1, Playwright1.64.1, darwin arm64; all five recorded version values 0.1.2; only dist manifest changed from pre-bump artifacts. Current independent rebuild/hash checks are controller-owned.

## Focused unchanged-context checks

- **Risk: global fixture incoming could be overwritten concurrently, or acknowledgment could precede initialization.** Checked `src/background/coordinator.ts:35`, `:44`: shared awaited initialization and queued serialized consumption support the incoming lifetime and post-handle acknowledgment.
- **Risk: first read might not represent initial presentation admission.** Checked `src/background/placement.ts:18`: initial selection directly precedes the first native read used for planPresentation, before execution.
- **Risk: blocked status could merely mean incomplete startup.** Checked `src/background/index.ts:34`, `:42` and `src/background/controls.ts:65`: pending initialization yields checking; initialized non-ready recovery yields blocked after config/protection prerequisites. Initial focused search guessed nonexistent singular control filenames; corrected to controls.ts without broader source crawling.
- Diff read in bounded chunks. An initial tool-output truncation required fetching the omitted README/new-verification-record portion. No changed source file was separately reread; no cut-off changed function required expansion.

## Cannot verify from this diff

- **⚠️ Current dist/package/source identity and cross-task integration:** controller should finish independent source/unit/typecheck/build/package/version/artifact and final JSON-gate checks, including eight packaged files, three JS graphs, five permissions and Chrome120 floor. This reviewer inspected recorded results without rerunning them (`docs/reviews/2026-10-29-browser-regression-verification.md:21`, `:23`).
- **⚠️ Host-wide exclusivity/unlocked state and exact-process cleanup:** disposable ownership is supported by code/artifacts, but historical complete host state cannot be proven by this diff. Retain controller ownership/cleanup evidence; no browser rerun requested.
- **⚠️ Hosted Linux, Chrome120/current-stable, native menu/emoji capture, trusted omnibox, interactive drag/native rejection, automated Spaces and other OS routing:** explicitly unverified and outside the local completion claim. Retain as manual/release qualification gaps and check in their actual environments when authorized (`docs/reviews/2026-10-29-browser-regression-verification.md:33`).
- **⚠️ Causes of historical attention-null and options-to-about:blank events:** preserve original failures and avoid causal-repair claims; diagnose a future recurrence using new observations (`docs/reviews/2026-10-29-browser-regression-verification.md:29`, `:31`).

## Assessment

**Task quality: Approved.** Diagnostics preserve native behavior and exact assertions; recovery waits now establish completion rather than elapsed absence. Raw evidence substantiates the final local gate while candidly retaining prior failures and manual/runtime limits.
