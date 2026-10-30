# Right-clicked tab protection implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development task by task with independent task and final reviews.

**Goal:** Protect/unprotect the browser-supplied right-clicked tab from its native tab-strip menu without changing global Pause or tab selection.

**Architecture:** A trusted worker-only intent uses a separate by-ID target capability and the existing protection writer/failure domains. A small browser adapter owns two explicit menu IDs and registration. Popup wire semantics stay unchanged.

**Tech Stack:** MV3, TypeScript, Node24, Chrome120 floor with150+ tab-menu capability, native DOM, Vitest/Playwright; no new dependency.

**Spec:** docs/superpowers/specs/2026-10-28-tab-context-protection-design.md

## Global Constraints

- In-place existing pause-controls-protections branch, baseline historical-revision; user-authorized008a only, no009/011, merge/push/PR or personal profile.
- Add only contextMenus permission. Retain Chrome120, eight dist files/three JS graphs, schema4/default-off/activation/rules, dependencies/assets and existing popup.
- Explicit Protect/Unprotect affects only event tab. No activation, focus, selection, movement, reload, global-flag change or new wire command.
- Synchronous native intent barrier before awaits; shared control queue/transaction; by-ID observation spans startup/queue/read/write; popup selection guard remains strict.
- Preserve session registry limits/lifetime/privacy, all-older retention, journal quarantine/noreset/noReplay/retry/timeouts and issued native settlement.
- Every shell starts rtk. CachedNode24 node; Playwrightcache $TEMP_DIR/chromerehome-playwright. One exclusive browser/build owner.

## Review Focus

- Background/right-clicked and highlighted tabs differ: only exact Chrome event ID changes; no selected-tab fallback.
- Cold-worker readiness cannot hold the command writer hostage or delay a later Pause; admission is fenced before awaits.
- Target navigates at same URL, closes/replaces/moves or changes privacy during any await: no stale success, postwrite uncertainty stays closed.
- Rapid opposing intents and lifecycle cleanup cannot undo newer protection/Pause or lose expected removal credits.
- Persistent/partial/unsupported menu registration cannot create duplicates, leak raw URLs/errors or break existing popup/runtime.

### Task 1: Trusted native intent and by-ID target capability

**Files:** Modify src/background/controls.ts and src/browser/control-target.ts; add neutral/internal type definitions only where existing ownership requires; wire dependencies in src/background/index.ts. Create tests/unit/native-protection-controls.test.ts; extend tests/integration/control-target.test.ts, tests/integration/control-target-currency.test.ts and tests/fixtures/control-target.ts. Run existing tests/unit/controls.test.ts and tests/unit/protection-controls.test.ts unchanged unless their shared fixtures need the new optional capability. The implementer must report exact producer contracts before Task2.

**Interfaces:** Consume existing TargetHint/TargetSnapshot/TargetObservation, protected identity registry, writer/version/failure domains. Produce worker-only `setNativeTabProtected(target: TargetHint, protected: boolean): Promise<ControlReply>`; selected-target factory remains `createControlTargets(chrome)`, distinct native factory `createNativeControlTargets(chrome)` supplies read/observe by ID. A narrowly injected readiness callback can await coordinator initialization outside the writer. No protocol command or selected-policy flag.

- [x] Add RED tests for inactive target acceptance versus still-strict popup selection, by-ID same-URL document replacement and observation disposal at all existing target await boundaries.
- [x] Add RED native-intent tests for synchronous barrier before readiness/queue awaits, held cold-worker readiness plus responsive newer Pause, Protect/Unprotect/Protect, stale Unprotect, cleanup/protectionIntents/removal credits, context/window mismatch, close/replacement/navigation during queue wait and postwrite failure gate. Assert global enabled/rules unchanged and normal/private separation.
- [x] Implement shared private verification/mutation primitives with no duplicated protection write core. Keep wire sender/parser/receipt behavior and existing runtime/recovery gates unchanged. Cold wake waits safely outside writer while observing original target.
- [x] Run focused RED/GREEN, full portable tests, typecheck and current eight-file build/package. Add focused production cold-worker coverage if it can be exercised without yet registering menus. No competing native owner.
- [x] Self-review, commit explicit files, report exact signatures/commands/output to owned task-1-report.md, then independent task review/fix gate before Task2.

### Task 2: Native tab menu, permission boundary and real click proof

**Files:** Create src/browser/tab-context-menu.ts; modify src/background/index.ts, manifest.json, diagnostics codes only if needed for privacy-safe failure, scripts/check-package.mjs and strict permission fixtures/tests. Add tests/unit/tab-context-menu.test.ts and tests/browser/tab-context-menu.spec.ts plus narrow native test helper if necessary. Root owns task/spec/plan/README/completion docs.

**Interfaces:** Consume reviewed worker-only native intent service. Produce stable action IDs `chromeReHome.protectTab` and `chromeReHome.unprotectTab`, titles `Protect this tab` / `Unprotect this tab`, contexts exactly ['tab']. Adapter invokes true/false explicitly; no state toggle. Add only contextMenus to exact permission allowlist; package files/graphs remain8/3.

- [x] Add RED adapter tests for exact IDs/contexts, malformed/array/absent metadata, inactive event identity over active/highlighted IDs, no activation/global commands, normal/private IDs, failure containment, and genuine readiness.
- [x] Add RED lifecycle tests for worker listener registration, persistent IDs after wake, overlapping install/startup, reload, synchronous unsupported context, callback lastError, partial owned-item cleanup and popup fallback. Add strict package test proving exact five permissions and rejecting extras.
- [x] Implement menu registration/lifecycle and trusted click wiring; never write storage in adapter. No raw pageUrl/URL/error logging, optimistic checkbox/badge or automatic retry. Preserve cold-wake admission ordering from Task1.
- [ ] Capture actual owned native tab-strip/submenu interaction before claiming support: inactive B with A active, Protect/Unprotect, actual callback target ID/context, tab/group/window/active invariants, multiselection affects B only, repeat cold worker and extension reload. Record tested browser version and inspect native menu screenshot. Do not use synthetic callback evidence as native proof or touch personal Chrome.
- [ ] Run affected browser controls/protection/placement and new menu tests; full portable/typecheck/build/exact8file package/full browser suite. Retain structured results/hashes and any host capability gap honestly; native owner exclusive.
- [ ] Self-review, explicit commit/report and independent task gate; root final scope review, walkthrough, byte-verified trial export and pause before009.

Current acceptance status (2026-10-29): Task1 andTask2 source/final source reviews approved with no actionable findings. Root1330/43/typecheck/build/strict5permissions8files pass. Actual native menu proof remains a coordinated user check after CUA binding/stall; full153/155 retains two foreground fixture attention failures. Keep the owned SDD ledger and do not mark008a complete or start009 yet.
