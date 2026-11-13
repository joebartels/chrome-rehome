# Pause Controls and Replacement Protections Implementation Plan

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../../README.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute sequentially with task review gates; steps use checkbox (`- [ ]`) syntax.

**Goal:** Add reliable toolbar pause/resume and session tab protection without weakening replacement safeguards.

**Architecture:** One worker-owned writer serializes explicit control/rule commands independently of native placement. A versioned session registry and pure eligibility policy feed existing guards/executors. A small action popup consumes typed status and commands.

**Tech Stack:** TypeScript, Chrome MV3, native DOM, Vitest, Playwright, Node24.

**Spec:** `docs/archive/superpowers/specs/2026-10-28-pause-protections-design.md`.

## Global Constraints

- Chrome120 minimum; Node24; MV3; no new dependencies, permissions, host permissions, content scripts or page injection.
- Keep configuration schema4 and existing activation/rules; defaults remain disabled. Complete008 and pause before009;011 is backlog only.
- Preserve incoming identity/history, duplicate-anchor priority, same-URL history correction, normal/incognito isolation, journal quarantine/read-only recovery, serialized native settlement and no replay/retry/timeout.
- Work in place on `pause-controls-protections`, base `historical-revision`; no personal Chrome/profile automation, merge, push or PR.
- Prefix all shell commands with `rtk`. Cached Node24: `node`.

## Review Focus

- A stale options write or queued resume must not undo a newer pause or replace current rules.
- Pause/protect during an unresolved native call must revoke future authority without pretending that call settled.
- A protected/audible older duplicate retains manual anchor priority while all older duplicates remain open.
- Missing session state is empty; malformed/unavailable state fails closed, including worker startup and external storage changes.
- Popup status may not claim active from saved enabled alone, show obsolete target success, expose another browsing context, or reset a quarantined journal.

---

### Task 1: Worker control authority and pause

**Files:** Create `src/controls/protocol.ts`, `src/controls/client.ts`, `src/background/controls.ts`, `src/browser/control-messages.ts`; modify `src/background/index.ts`, `src/background/coordinator.ts`, `src/options/index.ts`, `src/options/controller.ts`; update `src/options/model.ts` and the config adapter/repository only if necessary. Create focused `tests/unit/controls.test.ts`, `tests/unit/control-protocol.test.ts`, `tests/integration/control-messages.test.ts`; extend options/coordinator tests. Include `tests/browser/external-app-cleanup.ts`, `tests/browser/external-app-links.spec.ts`, `tests/unit/external-app-cleanup.test.ts` for the audited cleanup fix.

**Interfaces:** Export protocol types `ControlVersion`, `TabReceipt`, `RuleLists`, `ControlCommand`, `ControlStatus`, `ControlReply`. Version is `{workerId:string,revision:number}`, receipt is `{tabId,windowId,incognito,documentId}`, rules have only grouping/duplicate arrays. Command kinds are `get-status`, `set-enabled`, `set-tab-protected`, `save-rules`; the latter carries `baseRules` and `rules` and preserves current enabled. `createControlClient` sends narrow commands without retry. `createControlService` owns `initialize`, `getStatus`, `handle`, `capture`, `isCurrent`, `invalidate`, `forget`, `dispose`; document exact resulting signatures in the report for Task2. Captures are immutable operation-generation/protected-identity receipts; no UI imports background implementation. Target protection may be unavailable until Task2. Status phase is `checking|active|paused|unavailable|blocked`, with saved enabled nullable when unknown and optional current-target receipt/metadata. Keep command version separate from operation guard generation when ordinary runtime observations revoke execution.

- [x] Add RED protocol/sender/authority tests for exact keys, malformed data, wrong extension/page, unknown commands, stale worker/status versions, blocked recovery and storage failures. Prove a pause barrier appears synchronously before command-queue/storage awaits and status reads do not wait behind an unresolved native call or control write.
- [x] Add deferred race tests for rules-save versus pause in both orders, older writes finishing while pause is pending, queued resume versus newer pause, and pause→resume not reviving queued/in-flight work. Rules-only saves preserve current enabled; two stale rule editors conflict. Enabled-only updates preserve a dirty rule draft; actual rule conflicts retain it with explicit reload.
- [x] Run the focused tests with cached Node24/Vitest and record expected RED before implementation. Implement worker-owned writes and the Chrome120-compatible message adapter (`return true`/sendResponse). Route production options writes through the service; keep existing config validation/migration and external storage invalidation. Use a separate command queue, never the native operation queue.
- [x] Add a throwing-helper cleanup regression, extend the existing independent cleanup attempts to include the optional helper, and update its native fixture call site. Preserve original test failure and attempt all browser/server/launcher/profile cleanup even if helper disposal fails; do not invent another cleanup abstraction.
- [x] Run focused tests and full unit/integration tests, typecheck, build and current five-file package checks. Confirm options and affected production placement still work in isolated browser coverage: first eligible navigation after worker startup, existing multi-duplicate closure credits and external link wakeup;  native launch ownership is exclusive to this implementer during those tests.
- [x] Self-review, commit explicit intended files, report exact interfaces and RED/GREEN/evidence paths. Independent task review must approve before Task2.

### Task 2: Session protection and guarded eligibility

**Files:** Create `src/protections/state.ts`, `src/protections/repository.ts`, `src/browser/protection-storage.ts`, `src/browser/control-target.ts`; extend Task1 control service/wiring and neutral protocol/client, `src/background/coordinator.ts`, `src/background/register-events.ts`, `src/background/placement.ts`, `src/planning/candidates.ts`, `src/planning/replacement.ts`, `src/execution/placement.ts`, `src/execution/replacement.ts`. Add focused protection tests and extend candidate/planning/consumer/executor/register-events/recovery fixtures/tests. Reuse the existing audible mapping in `src/browser/snapshots.ts`; change it only if additional adapter behavior is necessary. Update architecture.

**Interfaces:** Consume Task1's exact reviewed protocol/service APIs. Session key `chromeReHomeProtections`, strict `{version:1,tabs:[{tabId:number,incognito:boolean}]}`; maximum1000 unique tab IDs, missing=empty, unknown/malformed/future/unavailable=closed admission. Stored identities have no URL/title/document data. Export pure protected-tab identity/policy helpers; `audible` becomes explicit in candidate metadata/copies, with old fixture defaults updated consistently. Supply protected identities to initial selection and planning re-selection. Add a plan-level closure decision composing with existing `closureEligible`; journal participants/removal-prefix format stays unchanged.

- [x] Add RED parse/repository/lifecycle tests for missing versus bad state, bounds/duplicate IDs, detached immutable snapshots, failure, overlapping reads/writes, startup gate, worker suspension/restart, navigation/reload retaining protection, remove/replacement cleanup, another-tab protection racing cleanup, and normal/incognito mismatch. No silent eviction or protection transfer.
- [x] Add RED pure/consumer/executor tests: protected/audible winner skips; older protected/audible anchor and non-anchor preserve existing priority and allow placement while retaining every old duplicate. Initial retention decisions cannot later upgrade to closure. Keep pinned policy unchanged and snapshot coherence intact.
- [x] Add deferred-boundary tests for pause/protect/audio changes during snapshot/document/pending-journal/native/first-removal waits: no next mutation, native promise remains awaited, no old work revival. Verify fresh silent participant evidence after pending-remove persistence and unchanged recovery grammar/quarantine. Audio events revoke control authority without blocking navigation provenance; unrelated-tab audio is not added to structural equality.
- [x] Run focused tests with cached Node24/Vitest and record RED. Implement registry, serialized worker mutations/cleanup, strict active-tab/document command receipts, immutable operation guard capture/current checks, live audio checks and event invalidation. Both registries must be ready before admission; do not replay skipped work or clear journal evidence.
- [x] Run full unit/integration, typecheck, build/package and affected browser regression coverage using isolated profiles. Retain same-URL history, manual placement and background behavior. Record normal/incognito test capability explicitly and do not substitute headless focus flags for native proof.
- [x] Self-review, commit explicit intended files, report API changes/evidence/limitations. Independent task review must approve before Task3.

### Task 3: Toolbar popup, package boundary and Chrome trial

**Files:** Create `src/popup/{index.ts,controller.ts,view.ts,index.html,styles.css}`; update `manifest.json`, `scripts/build.mjs`, `scripts/check-package.mjs`, package/build/boundary tests, options help text where needed. Add `tests/unit/popup-controller.test.ts`, `tests/unit/popup-view.test.ts`, `tests/browser/controls.spec.ts`; extend current browser fixtures for real pause/protection/audio/restart behavior. Root owns task/backlog/completion docs.

**Interfaces:** Consume the reviewed control protocol/client, with no background/options implementation imports. Build action popup local HTML/JS/CSS, exactly eight dist files and three independent bundled JS outputs. Popup commands carry current worker-scoped versions and active-tab receipts; stale/disconnected responses refresh instead of retrying. Open settings uses the normal extension options API. No recency state/listeners/UI.

- [x] Add RED popup controller/DOM tests for current status, pause/resume, protected target, unsupported documents, audible/pinned copy, busy/error/conflict/disposal/stale response, options link and recovery-blocked controls. No URL/history data enters storage, logs or status beyond current-tab identity/receipt.
- [x] Add RED manifest/package/source/graph tests for exact eight-file output/three JS entries, unchanged permission allowlist, popup local script/style/CSP restrictions, extra output rejection, and forbidden popup/options/background implementation imports.
- [x] Implement compact accessible native DOM UI and build/check changes. Clearly explain manual unsaved-edit protection and session lifetime. Preserve dirty options drafts when using global controls; the popup never carries captured rule arrays for an enabled toggle.
- [x] Add isolated browser tests using the actual action popup where supported: fresh disabled install→resume, grouping/closure→pause→new navigation untouched→resume only fresh work; preserve options rules across toggles; protect winner and old anchor/non-anchor; worker restart retention; closed/replaced target; audible native signal and late-change retention; background opens; restored/reload policy; normal/incognito separation; invalid/protection storage failure and quarantined journal truthful status. Keep actual incognito capability/result distinct from portable isolation checks. Reuse existing native fixtures; no personal browser interaction.
- [x] Capture/inspect popup screenshots for active, paused/protected and unavailable/blocked states. Run typecheck, full unit/integration, build, eight-file package check and full browser suite (cached Node24 and isolated Playwright cache). Record structured counts, hashes and native evidence; no overlapping native Chrome owners.
- [x] Self-review, commit explicit intended files and hand report to independent task review. Address findings, then root performs final whole-changeset review/verification, completes docs and Chrome walkthrough, exports the verified build and pauses before009.

Final status (2026-10-28): complete. Final production070a9f8/test-only repair595db69: root1225/41 portable, typecheck/build/eight-file package pass; full151 browser tests and actual-native enlarged/keyboard/incognito checks pass. Independent source/fix reviews are clean. No009 work started; requested008a tab-menu protection has its own scope.
