# Task 1 review

## Spec compliance

✅ Spec compliant for the inspected task: the single native toggle, migration, verified read-only snapshot, per-tab toolbar presentation, tests and requested documentation are present. No blocking missing, extra or misunderstood requirement found. Reviewed base `historical-revision` through head `historical-revision`.

- `src/background/controls.ts:131`: explicit setter and native toggle share admission and transaction logic. Observation and acceptance precede awaits; the readiness wait occurs outside the writer. The unchanged writer continuation retains the accepted generation, so newer commands cancel older toggles instead of freshening them.
- `src/background/controls.ts:242`: toggle inversion occurs inside `setProtected`, after verified target/document/privacy checks, using the ready registry snapshot. Save verification and post-save generation/document checks remain intact. Popup commands still supply their receipt and use their existing selected-target capability (`src/background/controls.ts:180`).
- `src/background/controls.ts:274`: accessor returns the current registry array only for active/paused usable controls; checking, pending, blocked and unavailable states produce undefined. It performs no storage/selection query or authority mutation.
- `src/browser/tab-context-menu.ts:7`: exactly one neutral toggle ID/title replaces the explicit pair. Migration removes only the two named legacy IDs (`:29`); callback dispatch invokes the toggle synchronously using validated scalar clicked-tab identity (`:58`). Unsupported registration retains the existing local-failure path.
- `src/browser/protection-indicator.ts:3`: narrow action/tabs/runtime and snapshot-only interfaces isolate presentation. All badge/title writes specify tabId (`:62`, `:65`). Initial discovery, affected-ID reads, changed-snapshot scheduling, retry-on-later-refresh, startup reset and listener disposal are present (`:28`, `:72`, `:83`, `:100`, `:112`). No new dependency, permission, package entry, wire command, settings schema, page injection or persistent display state appears in the diff.
- Requested documentation is updated in `README.md:110`, `docs/architecture.md:125`, `docs/tasks/todo/008a-tab-context-protection.md:3`, `docs/reviews/2026-10-29-protection-ui-feedback.md:9` and the new verification record. Historical native-focus evidence remains qualified; Task009/011 are not implemented.

## Strengths

- Atomicity and cancellation reuse the established writer rather than introducing a separate state-read/set path (`src/background/controls.ts:137`, `:256`). The new cold-toggle cases exercise later Pause, navigation, privacy, cleanup and superseding toggle intent (`tests/unit/native-protection-controls.test.ts:191`).
- One renderer serializes action calls, schedules correction when the snapshot changes, and avoids caching a display superseded by navigation (`src/browser/protection-indicator.ts:49`, `:66`, `:91`). These choices address stale asynchronous results without giving presentation control over replacement authority.
- Identity-read failure clears prior claims and queues a later retry; display failures remain local and retryable without a self-sustaining retry loop (`src/browser/protection-indicator.ts:47`, `:67`, `:74`). Cleanup removes listeners and queued state (`:112`).
- Tests assert observable badges, titles, persisted target-only protection and unchanged tab state. Browser cases retain real storage/document/action APIs while explicitly labeling synthetic callbacks (`tests/browser/tab-context-menu.spec.ts:43`; `tests/browser/controls.spec.ts:40`). The report records genuine navigation-reset failures and their regression fixes rather than claiming the first attempt passed (`docs/reviews/2026-10-29-protection-toggle-verification.md:25`).

## Issues

### Critical

None found.

### Important

None found.

### Minor

- `.superpowers/sdd/2026-10-29-protection-toggle/task-1-report.md:35`: validation still emits the existing NO_COLOR/FORCE_COLOR warning. This is environment noise, not evidence of a product failure, but makes diagnostic output less clean. Use one consistent color setting for subsequent verification commands; no test rerun is needed solely for this review note.

## Cannot verify from this diff

- ⚠️ Final native menu visual interaction and emoji appearance are explicitly outside the supplied proof (`docs/reviews/2026-10-29-protection-toggle-verification.md:42`). Required concrete check if visual certification is needed: in an owned Chrome profile, select a protected tab and inspect the pinned toolbar glyph/title, then right-click an inactive tab and invoke the single toggle. This is an acknowledged limitation, not a task blocker or instruction to retry the unsafe UI bridge.
- ⚠️ Chrome120 runtime compatibility is not directly established by a Chrome156 run; the report supplies a Chrome120 build target and an unsupported-menu simulation (`.superpowers/sdd/2026-10-29-protection-toggle/task-1-report.md:75`, `:79`). Required concrete check for runtime certification: load the package in an owned Chrome120 profile and verify popup controls and the action indicator while the unsupported native menu degrades locally.
- ⚠️ The exact built eight-file/three-graph/five-permission artifact and unchanged replacement safety outside this task are represented by reported package/regression evidence, not independently regenerated here (`docs/reviews/2026-10-29-protection-toggle-verification.md:10`). Controller should use its independent final package/regression verification; this reviewer did not rerun it.

## Focused context checks

- Risk: a native toggle could wait inside the writer or lose accepted authority. The controls hunk ended mid-function, so inspected its complete continuation plus the adjacent existing admission/status/popup paths in `src/background/controls.ts:64` through `:232`. Confirmed synchronous acceptance, readiness outside the writer, generation cancellation, finally-based observation cleanup and retained popup receipt semantics.
- Risk: the new accessor could expose a mutable, unverified or stale registry array. Inspected unchanged `src/protections/repository.ts:15` through `:43` and `src/protections/state.ts:7` through `:17`. The repository verifies writes by readback and withholds non-current revisions; the parser freezes each identity, the array and its enclosing value.
- Read the supplied brief, full linked follow-up design, implementation report and diff. Tool-output truncation required reading the omitted diff portions in bounded chunks; no changed implementation was re-read except the concretely cut-off controls function and its named contract checks. No git command, test, build, browser, CUA action, source/index/HEAD mutation or helper agent was used. Only this review report was written.

## Task quality

**Approved.** The changes preserve the existing command authority and storage safeguards while adding a bounded, read-only presentation adapter. The identified warning and explicitly documented visual/runtime limits do not invalidate the task's supplied portable and API-boundary evidence.
