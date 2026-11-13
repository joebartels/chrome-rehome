# Task008 protection implementation review record

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Initial review and scoped fix-round approval follow. The implementation gate is approved after both Important findings were addressed; native focus and real-incognito verification remain final gates.

# Task 2 independent review

## Spec compliance

**Issues found.** The session registry, policy wiring, retained-anchor behavior, audio checks, cleanup serialization, and startup gate substantially implement the brief, but two protection-authority defects prevent approval. Both were reproduced against the submitted implementation without editing source or rerunning suites.

Reviewed base `historical-revision`, head `historical-revision`, using the supplied 35-file package. Task 1 was already approved; popup/UI broadcasts and eight-file packaging belong to Task 3. Root-owned dirty documentation was not treated as author code.

## Strengths

- `src/protections/state.ts:7` distinguishes missing state from malformed/future state, bounds entries and IDs, rejects duplicate IDs across contexts, and returns detached frozen identities. `src/browser/protection-storage.ts:3` limits persistence to the dedicated session key without browsing content.
- `src/protections/repository.ts:14` invalidates before awaited reads/writes, publishes current revisions, verifies writes, and consumes one exact-value echo. `src/background/controls.ts:65` exempts only synchronous owned initialization starts and keeps a separate startup-failure latch. Tests at `tests/unit/protection-controls.test.ts:17`, `:26`, `:124`, and `:133` exercise these distinctions.
- `src/background/placement.ts` passes captured identities to both selection passes. `src/planning/replacement.ts:92` combines initial and checked closure decisions, preventing retention from upgrading to closure. Tests at `tests/unit/protection-policy.test.ts:17` and `:29` preserve protected/audible anchor and non-anchor priority while retaining every duplicate.
- `src/execution/replacement.ts:42` checks participant audio without making unrelated audio structural equality. Removal preflight remains after pending persistence, and native removal remains awaited. `tests/unit/protection-policy.test.ts:35`, `:42`, and `:67` cover late audio, real control-capture revocation, native settlement, and unrelated audio tolerance.
- `src/background/controls.ts:210` makes absent-ID cleanup a control no-op and serializes actual cleanup without changing enabled-command cancellation tickets. The new multi-close consumer test checks three issued-removal credits; `tests/unit/protection-controls.test.ts:76` verifies cleanup does not cancel accepted pause.
- `src/browser/control-target.ts:7` uses UI-supplied window selection; target metadata stays per-request rather than cached in global status. Paused protection commands do not enable processing (`tests/unit/protection-controls.test.ts:47`).

## Issues

### Critical

None found.

### Important

**P1 — A rules save clears the stale-unprotect safety gate without verifying protection intent.** `src/background/controls.ts:204` correctly latches `failed` after stale postwrite target verification, but the common config writer unconditionally resets it at `src/background/controls.ts:152`, including for `save-rules`. A persisted unprotect whose target became unavailable returns conflict/unavailable; a subsequent options rules save returns active and admits replacement with that protection absent. The target has never been reverified. This violates the brief's conservative gate and the report's stated recovery paths (fresh verified protection intent or valid explicit Pause).

A read-only in-memory probe using the real service/config repository/protection fixture produced:

```json
{"stale":{"kind":"conflict","phase":"unavailable"},"rulesSave":{"kind":"ok","phase":"active"},"capture":true,"protections":{"version":1,"tabs":[]}}
```

The rules were unchanged in the probe; changing a rule follows the same branch. Existing `tests/unit/protection-controls.test.ts:59` checks recovery by fresh protection intent but not an unrelated rules save. Preserve the appropriate failure reason across rule saves and test stale-unprotect → rules-save → capture remains unavailable, followed by explicitly permitted recovery. A related focused probe requested by the controller confirmed failed Pause → successful rules save returns active with `enabled:true`, without Resume. The unconditional clear predates this task, but Task 2 newly relies on this shared flag to protect stale unprotect. Address failure-cause distinctions rather than only the demonstrated command sequence.

**P1 — Same-URL document replacement during the final selection await can produce a stale successful unprotect.** `src/browser/control-target.ts:27` reads document D1, then awaits another `tabs.query` at `:30`; `:31` compares only URL against that document. If reload completes to D2 at the same URL during this final query, the adapter returns D1's receipt. During the service's postwrite read (`src/background/controls.ts:201`), this passes the receipt comparison at `:203`, clears failure, and claims success after the displayed document changed. Navigation invalidation goes to the navigation tracker, not the control generation used by this command (`src/background/coordinator.ts`, `invalidate`).

A read-only in-memory probe used the real adapter and service, completed the same-URL document replacement in the final postwrite selection query, and produced:

```json
{"reply":{"kind":"ok","phase":"active"},"liveDocument":"reloaded-document","commandDocument":"document","capture":true}
```

This occurs during an awaited observation before receipt acceptance; it is distinct from the documented final-check-to-native-call limitation. Add document-currency evidence spanning target-read awaits (for example a document invalidation token or suitable repeated document check), preserving selection/window/privacy validation. Add an adapter-plus-service deferred regression for same-URL reload during the final postwrite selection query; require conflict with admission closed after unprotect. `tests/integration/control-target.test.ts:16` checks selection change after frame lookup, but not same-URL document replacement.

### Minor

No separate polish findings. The author's “every observed executor await” evidence covers the structural/removal fixture's observed boundaries; that fixture returns undefined presentation and does not establish native focus behavior. The report otherwise separates that capability gap honestly.

## Verification and limitations

- Inspected retained `task2-full-final.log`: 1,170 passed across 37 files, with no warnings in that final log. Inspected RED logs for registry/policy, 14 control failures, five wiring failures, adapter receipt mismatch, startup failure, and prune failure. Inspected package success output and recorded five-file hashes. The typecheck log is empty; its claimed exit success is supplied by the author/controller, not encoded in the log contents.
- Inspected final protection browser log/JSON: six passed, zero unexpected/flaky, 5.1 seconds. Retained normal-context records report `allowedIncognito:false` for winner, anchor, and other. Real incognito execution remains unverified; portable context parsing/pruning/receipt tests are present.
- Inspected affected-suite JSON: 104 passed, 23 failed, zero flaky. Failures include remote foreground/background setup, external handoff, minimized/lone-source final presentation, foreground termination phases, and same-URL/changed-URL history cases. These are failed/unverified results, not passes.
- Inspected corrected native log/JSON: 18 activation-precondition failures, one interrupted, ten not run. `native-focus-probe.json` shows the owned Chromium window stayed unfocused after Chrome's focus request; `task2-native-focus-capability.json` reports `frontmostIsLoginWindow:true`. This supports a host-capability block, but does not prove all 23 cases would pass after unlock. No native/focus rerun was attempted.
- Ran only three focused portable read-only probes answering uncovered doubts: stale-unprotect then rules save; same-URL reload during postwrite target query; failed Pause then rules save. Bundles were generated in memory with esbuild `write:false`. No tests/source/index/HEAD were modified.

## Scope and named integration checks

The package was read in bounded sections. It has limited-context hunks despite being described as full context. Two changed executor hunks ended mid-function, so I read the relevant functions to evaluate post-journal/pre-native barriers. The coordinator hunk omitted initialization, so I read that function for the owned-startup risk. These were targeted context completions, not a broader audit.

Focused unchanged-code checks: config repository synchronous invalidation/publication (`src/config/repository.ts:31`) for startup and shared failure recovery; snapshot audible mapping (`src/browser/snapshots.ts:51`) for explicit candidate metadata; replacement fixture boundary instrumentation (`tests/fixtures/replacement.ts:26`) for claimed await coverage. Lifecycle/removal-credit and privacy-hint risks were evaluated through changed call sites/tests. Journal grammar, recovery quarantine, Chrome120 packaging, and prior history behavior were not independently re-audited beyond unchanged formats, retained evidence, and these focused integration checks. No new permissions/dependencies/config schema/default activation appear in the diff.

## Assessment

**Task quality: Needs fixes.** The registry and execution policy have targeted tests and preserve the main planning/execution contracts, but the two reproduced gaps can release protection without required fresh document verification.

**Gate condition:** resolve both Important findings, add focused regression evidence, and obtain independent approval before Task 3. Host-limited native checks remain a separate completion gate: after controller authorization and a focus-capable session, rerun affected foreground/background/history/external cases against the then-current build. Do not claim full browser verification while those results or real-incognito capability remain unresolved; capability-based acceptance must be explicit.


---

# Task 2 scoped re-review — fix round 1

## Finding verdicts

- **P1 — A rules save clears the stale-unprotect safety gate without verifying protection intent. — ADDRESSED.** `src/background/controls.ts:26` separates config/global failure from the bounded protection failure identity at `:27`. `failProtection` (`:38`) conservatively escalates different identities or uncertain cleanup to pause-required. The config writer clears ordinary faults only after a verified, uncancelled explicit Pause (`:160`); rules saves do not clear them. Successful protection intent clears only the same affected identity (`:222`), leaving config/global faults intact. This fixes both stale-unprotect → rules-save and failed-Pause → rules-save, including overlapping faults and other-tab intent, without changing the startup failure latch. Regressions at `tests/unit/controls.test.ts:186` and `tests/unit/protection-controls.test.ts:156`, `:163`, `:174`, `:187`, and `:194` assert admission/status and recovery behavior, including changed and unchanged rules, explicit Pause then Resume, and multiple fault identities.

- **P1 — Same-URL document replacement during the final selection await can produce a stale successful unprotect. — ADDRESSED.** `src/browser/control-target.ts:63` rereads the active outermost document after the second selection query and compares document IDs. Its read-owned observation (`:16`, `:52`) spans all four awaits, catching delivered document/selection/lifecycle changes even when an old API response arrives. `src/background/controls.ts:200` also owns an observation across preflight, persistence, and postwrite verification; it cannot miss selection leaving and returning between reads. Failed postwrite currency enters the affected-identity failure gate. Both owners dispose in `finally` (`src/background/controls.ts:224`, `src/browser/control-target.ts:70`). `tests/integration/control-target-currency.test.ts:17` reproduces the original final-selection race with and without a delivered navigation event; `:29` defers the new final document await and supplies old responses after selection/window/context/removal/replacement/reload events; `:45` covers leave-and-return during persistence. These tests use the real adapter and service, not an observer fixture branch.

## New breakage in the fix diff

**None found.** The new observation is request/command-local, bounded, and detached; it does not increment automatic control authority. `tests/integration/control-target-currency.test.ts:52` verifies a read-only target lookup cannot invalidate an independent automatic capture. `:60` verifies same-document history, subframes and other-window selections remain valid; `:65` verifies rejected document reads release listeners. The added `ControlTargets.observe` dependency is wired through the real adapter and shared service fixture. The wire protocol and client API remain unchanged.

## Checks and evidence

Reviewed the supplied nine-file fix package once in bounded sections, scoped to `historical-revision..historical-revision`, the original findings, task brief, and appended Review round 1 report. No unchanged-code audit, git rederivation, source/index/HEAD mutation, subagent, test execution, or browser run was performed.

Inspected retained covering outputs: gate RED 8 failed/43 passed; gate GREEN 51 passed; target RED 10 failed/17 passed; combined covering GREEN 78 passed across four files. The deferred regressions assert conflict/unavailable, closed capture, actual persisted unprotect state, and listener disposal at the relevant boundaries. Inspected full portable output: 1,190 passed across 38 files. Inspected build/package success output and final headed protection/audio log plus JSON: six passed, zero unexpected/flaky, 4.9 seconds. The typecheck output file is empty; successful exit is reported by the author/controller rather than encoded in that file. No warnings appear in the final covering/full logs inspected.

## Out-of-scope observations

No new out-of-scope code findings. Prior native capability and real-incognito verification gaps remain unchanged. The earlier affected run is still 104 passed/23 failed; corrected activation attempts remain 18 precondition failures, one interrupted, ten not run. This fix round's six headed protection/audio passes do not replace native foreground/background/history/external regression verification. No focus/unlock action was attempted.

## Verdict

**Fix round: All findings addressed, no new Critical/Important breakage.** No findings remain open from this review. Task 2's scoped implementation review gate is approved. Final native verification still requires controller authorization and a focus-capable session; real-incognito capability remains explicitly unverified. This approval does not claim a full browser pass or final Task 008 completion.
