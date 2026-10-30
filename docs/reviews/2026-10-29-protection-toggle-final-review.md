# Final whole-follow-up review

Reviewed `historical-revision..historical-revision`, including the approved design and plan. Current HEAD matches the reviewed head. Scope is the complete single native toggle / toolbar lock refinement, integrated with the already-reviewed 008/008a baseline.

## Strengths

- The command path preserves one writer and one admission model. `src/background/controls.ts:137` observes and accepts the native identity synchronously; `:150` waits for initialization/recovery outside the writer; `:154` retains original generation and observation authority. At `:256`, inversion uses the verified registry inside the transaction after document/privacy checks. Existing verified-save and post-save fences remain intact. The popup receipt path remains separate (`:180`), and a later Pause can proceed while a cold native command awaits readiness.
- `src/browser/tab-context-menu.ts:7` exposes exactly one neutral action. Migration at `:29` touches only the two legacy IDs. Dispatch at `:58` copies and validates the supplied clicked identity, with no selected/highlighted substitution or global Pause. Existing local-failure cleanup preserves pre150 popup operation.
- Presentation is structurally read-only: `src/background/controls.ts:274` exposes usable verified state, and `src/browser/protection-indicator.ts:8` accepts only that accessor. The underlying parser freezes identities and arrays (`src/protections/state.ts:15`), and the repository withholds superseded revisions (`src/protections/repository.ts:43`). Every action write has an explicit tab ID (`src/browser/protection-indicator.ts:62`, `:65`); no mutation or placement capability crosses into the presenter.
- Lifecycle handling includes initial discovery, affected-tab reads, close/replacement/attachment, startup reset, navigation reset and disposal (`src/browser/protection-indicator.ts:28`, `:83`, `:91`, `:96`, `:112`). A single renderer corrects stale results after subsequent passes; it avoids caching a navigation-superseded display (`:66`). Failed reads clear claims and failed writes remain eligible for later refresh (`:47`, `:67`, `:74`), without polling or self-sustaining retries. Sets coalesce repeated events; unchanged snapshots do not cause all-tab queries or rewrites.
- Integration is appropriately small: the existing status subscription feeds both menu and indicator, and recovery/consume completion also refresh presentation (`src/background/index.ts:25`, `:36`, `:43`). No new permission, asset, dependency, RPC, configuration schema, content script, persistent presentation state or automation authority appears in the complete diff.
- Tests cover observable outcomes and important asynchronous boundaries. Cold toggle cases exercise newer Pause, navigation, privacy, cleanup and superseding intent (`tests/unit/native-protection-controls.test.ts:191`). Presenter tests exercise unknown/privacy state, delayed writes, transient errors, bounded bursts and Chrome navigation reset (`tests/unit/protection-indicator.test.ts:26`, `:41`, `:62`, `:74`, `:82`, `:89`). Packaged cases assert actual storage/action API readback and unchanged tab placement, including windows, multiselection, worker restart and extension reload (`tests/browser/tab-context-menu.spec.ts:43`, `:94`). Popup mutation also updates the indicator (`tests/browser/controls.spec.ts:40`).

## Issues

### Critical

None found.

### Important

None found.

### Minor

No additional actionable findings. The task review's color-environment warning is already dispositioned as nonblocking diagnostic noise in `progress.md`; it does not justify repeating verification.

## Evidence assessment

I read the complete bounded diff, task implementation/review reports, ledger, root verification manifest and export manifest. I also inspected the underlying root Vitest JSON rather than relying solely on the reported count: it records success, 1,353 passed tests, zero failed/pending tests, and 44 passing test-file records. Root build and package logs confirm the Chrome120-target build and successful package check; root verification records exit 0 for typecheck and range whitespace checks. The eight-file export manifest records CRC and dist byte identity passing, tied to the reviewed source. I did not regenerate the artifact or independently recompute its hash.

The author reports one final 25/25 packaged run: six controls, fifteen replacement safety and four menu/indicator cases. I inspected the changed browser assertions and their explicit synthetic-callback boundary. These are useful real Chrome API integration checks, not proof of native menu interaction or rendered emoji appearance. No final browser raw-results file was among the supplied review inputs; the executed browser result is attributed to the author report, not claimed as independently rerun here.

The final evidence does not claim a clean full native foreground suite, fix the prior focus transition, or certify Chrome120 at runtime. The earlier 153/155 plus two focused passes remains historical. The new documents preserve these distinctions (`docs/reviews/2026-10-29-protection-toggle-verification.md:22`, `:33`, `:42`, `:44`). Default-off behavior, session protection and existing replacement semantics remain intact by the inspected integration and current regression evidence. Task009/011 are untouched.

## Focused unchanged-context checks

1. Risk: the diff omits the native writer continuation and status/admission definitions. Read `src/background/controls.ts:1-231` to establish synchronous acceptance, pending-state suppression, original-generation checks, recovery waits outside the queue, cleanup and unchanged popup receipt handling. No separate command writer was introduced.
2. Risk: the accessor could expose mutable/unverified data. Read `src/protections/repository.ts` and `src/protections/state.ts` to verify publication revision checks, persistence readback and deep freezing of the exposed identities/array.
3. Risk: the new presenter might miss control-state invalidation despite having a correct local renderer. Read `src/background/index.ts:26-43` to confirm the existing subscription and recovery notification feed the new notifier.
4. Risk: changing the menu action set might break unsupported-runtime containment. Read `src/browser/tab-context-menu.ts:34-58` to verify retained callback error handling, owned-ID cleanup and local failure latch.

No tests, builds, browser sessions, CUA actions or helper reviewers were run. No source, index, HEAD or branch state was changed; only this report was written.

## Recommendations

No code changes are required by this review. Keep the documented owned-profile visual check and Chrome120 runtime check as explicit release-evidence limitations; do not relabel synthetic callback/API readback as native UI proof. Continue honoring the pause before Task009/011.

## Declined to judge

- Original008/008a unrelated features and full replacement-policy correctness: already completed and independently reviewed; only integration impact of this refinement was assessed.
- Repair of the historical native foreground/focus reliability issue: outside the approved refinement; no foreground assertions changed and no repair is claimed.
- A native background-tab-strip lock or dynamically state-labeled native menu: explicitly superseded by the user's supported neutral toggle plus toolbar choice.
- Task009 activation gate and Task011 work: explicitly paused and outside this change.
- Final native menu visual interaction, emoji rendering, native incognito rerun and Chrome120 runtime certification: unavailable in this review's supplied evidence, explicitly documented as limitations rather than inferred successes.

## Assessment

**Ready to merge? Yes, for this approved refinement.** No blocking correctness, architecture, integration, requirement or test issue was found. This verdict supports completing the authorized local implementation/trial handoff; it neither performs a merge nor certifies the documented native-UI and oldest-runtime evidence gaps.
