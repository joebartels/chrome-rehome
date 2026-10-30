# Browser Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Task009's explicit packaged-browser regression gate, protecting native focus and safe recovery.

**Architecture:** Extend existing isolated-profile fixtures; separate portable/headed/native-macos selection and validate raw JSON outcomes. Add test-only native admission diagnostics and completion barriers without changing production behavior.

**Tech Stack:** Existing TypeScript, Vitest, Playwright1.64.1, Chromium, Node24, GitHub Actions; no new dependency.

**Spec:** docs/superpowers/specs/2026-10-29-browser-regression-design.md

## Global Constraints

No production behavior/source changes, activation-default change, new permissions/assets/dependencies/content scripts/schema/RPC/persistence, polling or keepalive in the extension. Existing eight packaged files/three JS graphs/five permissions/Chrome120 minimum remain. One browser worker, zero retries, no hidden skips/zero-test/flaky success. Disposable profiles and exact owned processes only; no CUA, personal profiles, OS lock/security changes or fake focus. Keep duplicate-first manual placement, foreground presentation and deliberate background preservation. Task010/011 remain unstarted. Read AGENTS.md; final coherent handoff is0.1.2, with four source version fields synchronized and dist rebuilt.

## Review Focus

- New navigation cases must assert actual metadata and final IDs/placement, not just an event was observed.
- Tagged native/headed tests must be disjoint from portable selection; requested unsupported or empty lanes must fail visibly.
- Foreground admission mismatch must fail as setup/attention evidence, never pass/skip/retry or become an impossible phase timeout.
- Recovery absence assertions need an acknowledgment from the new realm, not a delay/document load alone.
- Instrumentation and fault injection must not enter production artifacts or be mislabeled as native-in-flight/trusted omnibox/Spaces/UI proof.

### Task 1: Missing packaged outcomes and explicit browser lanes

Read the linked Spec first; it is binding. Coverage audit: EXTERNAL_EVIDENCE/task009-coverage-audit.md (use named gaps, not a mandate to duplicate existing tests).

**Files:**
- Modify: playwright.config.ts, .github/workflows/ci.yml, package.json (scripts only), existing tests/browser/* specs for lane tags and missing outcomes; tests/browser/replacement-placement.spec.ts or new focused packaged-navigation.spec.ts if that keeps responsibilities clearer.
- Create: scripts/check-browser-results.mjs and tests/unit/browser-results.test.ts; docs/testing/browser-regression-matrix.md.
- Do not edit src/, recovery instrumentation, version fields or final backlog/README closeout. Task2 owns these later test-only/verification edits.

**Interfaces and exact contracts:**
- Project names `portable`, `headed`, `native-macos`; tags `@headed`, `@native-macos`. Native/headed/portable sets disjoint; native takes precedence, no duplicate cases across projects. Native project exists only on darwin; eliminate native runtime skips for selected native cases. Keep workers1/retries0/fullyParallelfalse; forbidOnly in CI.
- CLI `node scripts/check-browser-results.mjs REPORT_JSON PROJECT...` exits0 only if each requested project has >=1 selected test, every selected result passes once with retries0, no skipped/flaky/unexpected/pending/empty/errors. Invalid/missing report/nonzero lanes fail clearly. It may export a small pure validator for unit testing, but add no runtime dependency. Add `check:browser-results` package script. Preserve raw JSON and logs.
- CI name reflects feature regression; Ubuntu installs bundled Chromium/deps, runs portable+headed under Xvfb with JSON output and result checker, retains report/trace artifacts even on failure. Native local lane documented separately; do not claim hosted execution or attempt a hosted interactive Mac.

- [ ] Step1: TDD JSON gate with valid two-project report and malformed/missing/zero-project/skipped/flaky/retry/unexpected/error cases. Demonstrate meaningful RED before gate implementation. Test lane inventory via Playwright --list JSON and check disjoint/nonempty selection. Do not contrive a product failure for behavior already implemented.
- [ ] Step2: Implement minimal lanes, tags, result checker and CI; retain actual headed popup/audio behavior. Linux requirements must be explicit. Changes in legacy native titles/selection must not remove any phase/assertion. Record counts/inventory rather than hardcoding all existing totals.
- [ ] Step3: Add untouched-dist real Chrome typed-transition replacement with Page.navigate transitionType typed plus observed onCommitted metadata, positive changed-URL pushState replacement and controlled ordinary HTTP redirect outcome. Assert incoming ID/history retained, old duplicate closure, duplicate anchor/manual group precedence and unrelated tab state; reuse existing helpers without a broad fixture rewrite. Label CDP typed input honestly.
- [ ] Step4: Add compact pinned incoming/older duplicate cases on production dist: pinned incoming unchanged and no older closure; pinned older excluded from anchor/closure while unpinned eligible duplicates still follow current behavior. Assert exact retained/removed IDs/order/groups.
- [ ] Step5: Run focused browser/harness tests, then portable full Vitest/typecheck/build/package and all portable+headed projects once with JSON/logs/result check. Preserve failures and diagnose narrowly; do not run native cases or CUA. Source version remains0.1.1 during internal tasks; no intermediate user build handoff. Record unchanged product graphs and raw selection evidence.
- [ ] Step6: Write coverage matrix with named existing/new tests, evidence classes, manual limits, lane commands and current baseline; self-review and commit owned files explicitly, no push/merge. Report commands/RED-GREEN/counts/raw paths/concerns and return build/browser ownership. Task2 consumes lane names and result checker; do not start Task2.

### Task 2: Native attention diagnostics, condition-based recovery and completion

Read the linked Spec first; it is binding. Task1 delivers disjoint projects/tags and `node scripts/check-browser-results.mjs REPORT_JSON PROJECT...`. Existing public foreground diagnosis is docs/reviews/2026-10-29-native-foreground-gate-diagnosis.md. Do not redispatch/rebuild completed old008a tasks.

**Files:**
- Modify: tests/browser/owned-browser-focus.ts, tests/browser/replacement-recovery-fixture.ts, tests/browser/replacement-recovery.spec.ts; placement/external specs only where needed for diagnostic evidence, not product behavior.
- Create focused test-only diagnostic/barrier helper(s) and portable tests if useful; keep fixtures small and narrowly responsible.
- Modify: manifest.json, package.json, package-lock.json (version fields only, preserve Task1 scripts); docs/tasks/todo/009-real-browser-feature-regression-suite.md, docs/tasks/README.md, README.md, docs/testing/browser-regression-matrix.md; add docs/reviews/2026-10-29-browser-regression-verification.md.

**Interfaces and exact contracts:**
- Extend exact-owned-process helper with a read-only focus snapshot returning timestamps, owned browser PID and actual frontmost PID. Existing activation helper still activates only once as setup. Reuse CDP-owned PID lookup; do not activate another app or alter focus while replacement executes.
- Test fixture diagnostics carry token, timestamped native attention/focus events, incoming tab/document/navigation identity and current journal operation/phase when available. A foreground arm declares expected source window/winner. First relevant native admission mismatch publishes an explicit failure signal. `reached` observes success OR mismatch for that token and throws immediately on mismatch, with attention, owned/frontmost PID before/failure and focus-event artifacts. Return actual native reader output unchanged.
- New-realm completion evidence after coordinator.handle resolves proves recovery initialized and the intended wake navigation was handled. For production seeded quarantine use existing authorized options-page get-status blocked readiness and actual commit completion before exact byte/survivor checks. No production diagnostics endpoint or storage mutation to bypass recovery. Do not replace a time delay with a vacuous immediate unchanged-state assertion.
- Version exactly0.1.2 in manifest/package/root lock/package-root lock; build/check dist version before final report. No config/journal/protection schema version change.

- [ ] Step1: TDD diagnostic-gate reduction/reader behavior and barriers using explicit mismatch versus matching foreground, background preservation, stale token, actual phase arrival, and a delayed new-realm acknowledgment. Meaningful RED before implementing harness changes; preserve all existing native phase/removal/document assertions.
- [ ] Step2: Add bounded timestamped observations and actual OS read-only PID snapshots before trigger/on failure. Fail a declared foreground admission mismatch promptly as setup/attention-contract failure; no fake focus, retry, polling keepalive in product, timing workaround or weakened native assertion. Link admission to correct winner/document and journal where available.
- [ ] Step3: Replace all five fixed recovery absence sleeps (1000ms/250ms locations) with appropriate production readiness or test-fixture handled-navigation/initialization barriers, followed by exact byte-preserved journal and survivor/state assertions. Guard against old realm/stale earlier navigation. Leave stimulus timers and bounded condition-timeout guards alone.
- [ ] Step4: Bump0.1.2 consistently, build and run focused diagnostics/recovery regressions. Run full portable suite/typecheck/strict package, then one complete local Playwright invocation across all supported projects with machine-readable JSON/log and result gate, one exclusive native owner and an unlocked interactive desktop. Record real runtime/platform/counts/capabilities and archive original failures if any. If host is locked or a genuine focus failure occurs, report evidence and request only the necessary user action via controller; continue independent work, do not invent proof or rerun broad suite blindly.
- [ ] Step5: Update coverage/task/docs with actual evidence, user-reported same/different desktop success (version unspecified), artifact byte identity, exact remaining manual/hosted-CI/Chrome120/runtime limits and default-disabled decision. Mark009 complete only if its regression requirements are met. Fix stale008a UI-pending prose. Leave010/011 TODO and default activation unchanged. Self-review, explicitly stage/commit locally, no push/merge. Return full report/raw artifacts, ownership and concerns to controller for independent review.
