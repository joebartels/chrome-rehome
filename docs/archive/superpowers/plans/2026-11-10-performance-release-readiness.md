# Task 010 Performance and Release Readiness Implementation Plan

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../../README.md).

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Measure the current product at representative tab and rule counts and qualify the release package at its declared Chrome floor and on current stable.

**Architecture:** Disposable profiles and local fixtures. Measure real packaged behavior and record test-only instrumentation separately for attribution. Preserve fresh reads, navigation guards, and release defaults while collecting evidence.

**Tech stack:** Node 24, Playwright/CDP, Chrome for Testing, existing strict package checks.

**Spec:** Task 010 (GitHub issue #14; historical task 010) and the approved two-pass scope.

## Constraints

- Use the unmodified packaged extension for product assertions. Label any copied instrumented bundle and keep probes out of production.
- Run Chrome in owned profiles. The declared floor is Chrome 120, with popup fallback for tab protection. The current stable native path needs its own coverage.
- Keep performance recommendations evidence-based. Document the measured envelope and uncertainty. Do not add a live index before profiling. Preserve safety checks and default pause.
- Bump to 0.1.3 once, synchronize the four version fields, and verify a new dist build.

## Tasks

- [x] Build a repeatable browser benchmark for 20, 200 and 1000 tabs, increasing rule counts, warm/cold cases, and no-match, grouping, and duplicate scenarios. Capture real foreground/background cross-window behavior, time and resource measurements, and distinguish measured completion from absent work. Observe natural worker idle without worker DevTools. Provide raw data and a concise interpretation for proposed budgets.
- [x] Qualify the package on Chrome 120 and current stable. Verify fresh install and paused defaults, persisted update, settings migration, grouping/replacement, cross-window focus, popup protection and current-stable native context behavior where supported. Check permission rationale, default privacy, lockfile, and two clean build inventories. Report setup constraints and versions from the binaries.
- [x] Reproduce the release qualification Resume failure in a deterministic control test. When a newer storage read overtakes post-write verification, verify the latest matching configuration before reopening admission. Keep unavailable and mismatched snapshots fail-closed. Rebuild and repeat the release qualification on the corrected package.
- [x] Review both changes independently, integrate evidence and budgets, and verify typecheck, unit/integration tests, and versioned strict packaging. Leave Task 011 in the backlog.

## Review focus

- Warm or cold samples can silently include unrelated setup or a different worker realm.
- A worker read or DevTools attachment can perturb idle evidence.
- A focus assertion can pass without a destination window being focused.
- A bundle build target can mask runtime incompatibility on Chrome 120.
- Profile update and fixture-based migration exercise different lifecycle paths. Identify both in the evidence.
