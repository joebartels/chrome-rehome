# Protection Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One reliable native protection toggle plus a selected-tab toolbar lock.

**Architecture:** Extend the existing sole control writer with an atomic native toggle. Add a separate read-only per-tab toolbar presenter and update the existing menu adapter; keep navigation/execution authority unchanged.

**Tech Stack:** TypeScript, Chrome MV3, Vitest, Playwright; no new dependencies.

**Spec:** docs/superpowers/specs/2026-10-29-protection-toggle-design.md

## Global Constraints

Keep Chrome120 minimum with graceful tab-menu fallback before Chrome150; exactly the existing five permissions, eight packaged files and three JS graphs. No new dependencies, assets, page access, content scripts, wire commands, settings schema, polling, keepalives, or persistent presentation state. Global Pause remains in popup; manual protection is session-only. Preserve selected-popup targeting and native background/multiselection targeting, synchronous admission/observation, recovery readiness outside the writer, generation/document/privacy fences, newer Pause responsiveness, fail-closed storage, and cleanup. Do not implement Task009 or011.

## Review Focus

- Cold native click resolves current protection only after readiness without freshening stale authority.
- Multiple pending clicks and newer Pause cannot unprotect from stale state or block Pause.
- A delayed badge write after unprotect must be corrected; unavailable state cannot leave a false lock indefinitely.
- Startup/restart must clear inherited per-tab badges while preserving verified session protection.
- Action API exceptions and tab closure cannot disable replacement, cause global state leaks, or leave stuck rendering.

### Task 1: Atomic native toggle and read-only toolbar indicator

Read the Spec above in full first; its constraints bind this task.

**Files:**
- Modify: src/background/controls.ts, src/background/index.ts, src/browser/tab-context-menu.ts
- Create: src/browser/protection-indicator.ts
- Tests: existing control/native menu suites, new tests/browser/protection-indicator.test.ts (portable location should follow existing tests organization if different), tests/browser/tab-context-menu.spec.ts and existing popup/control browser specs as appropriate.
- Documentation: README.md, docs/architecture.md (use existing architecture path), docs/tasks/todo/008a-tab-context-protection.md, docs/reviews/2026-10-29-protection-ui-feedback.md; add focused follow-up verification report. Update current behavior, retain historical evidence accurately.

**Interfaces:**
- Produce worker-only toggleNativeTabProtected(target: TargetHint): Promise<ControlReply> using the shared native admission/transaction path. Retain explicit setter compatibility where current callers/tests need it, without duplicating transaction logic.
- Produce getProtectedTabs(): readonly ProtectedIdentity[] | undefined; only verified usable in-memory manual protection state, no storage read, mutation, generation change or selected-tab lookup. Pending/unavailable means undefined.
- Produce registerProtectionIndicator(api, controls, reportFailure) with refresh() for read-only hints. Use a narrow structural controls input with getProtectedTabs and a narrow Chrome action/tabs/runtime input; no production-only globals inside the module.
- Menu ID chromeReHome.toggleTabProtection, title Toggle tab protection, context ['tab']; remove only legacy chromeReHome.protectTab and chromeReHome.unprotectTab, including worker restart/update migration. A valid cold callback invokes toggle synchronously before awaits.
- Badge text 🔒 and title ChromeReHome — tab protected for verified protected identity, otherwise empty text and title ChromeReHome. Every action write carries tabId. No global badge/icon override.

- [x] Step1: Add failing portable tests for unprotected->protected->unprotected actual target, no active/highlighted fallback; cold readiness, navigation/privacy/cleanup invalidation, conflicting intent/newer Pause and failed verification; confirm RED before product changes.
- [x] Step2: Implement toggle in shared native writer transaction; add verified read-only accessor; preserve existing explicit and popup semantics.
- [x] Step3: Add failing menu/indicator tests for one action and legacy cleanup, foreground/background target, no extra global command; per-tab snapshot rendering, activation/windows/privacy, startup/restart unknown cleanup, delayed stale writes, closing tabs, exceptions and subsequent recovery. Check bounded/coalesced refresh behavior without implementation-mirroring tests. Confirm RED.
- [x] Step4: Implement menu migration and indicator, wire read-only refresh/subscription/events. Unknown clears claim, presentation never invalidates controls. Avoid all-tabs scans on every navigation/status hint if snapshot unchanged. Own async error handling and lifecycle cleanup.
- [x] Step5: Add real packaged Chrome API-boundary tests for atomic target-only toggle, badge getBadgeText/getTitle readback, multiwindow/multiselection, popup mutation refresh, cold worker and reload. Label synthetic native callback tests accurately. Do not use CUA or touch personal/unowned profiles. No native menu screenshots are required because the UI bridge cannot safely target the owned app.
- [x] Step6: Run focused regressions while iterating; before commit run full portable suite, typecheck, build and strict package check, then relevant packaged browser controls/menu/replacement safety regressions once. Do not alter native focus assertions or run the entire foreground suite just to replace prior evidence. Record exact commands/results and gaps. Use cached Node24 and Playwright paths supplied by controller.
- [x] Step7: Update usage and verification docs, self-review, explicitly stage owned changes, commit locally with per-command signing disabled; do not push/merge. Full report includes RED/GREEN, commands, exact counts, concurrency semantics, limitations, changed files. Return exclusive browser/build ownership to controller.
