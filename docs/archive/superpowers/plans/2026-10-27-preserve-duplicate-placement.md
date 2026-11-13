# Preserve Duplicate Placement Implementation Plan

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../../README.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline implementation. Steps use checkbox syntax.

**Goal:** Existing duplicate placement wins over grouping rules.
**Architecture:** Change planner precedence and consumer anchor evidence admission; retain executor/recovery safeguards. Clarify options help without changing matching APIs.
**Tech Stack:** Existing strict TypeScript, native Chrome APIs, Vitest, Playwright, Node24; no dependencies.
**Spec:** docs/archive/superpowers/specs/2026-10-27-preserve-duplicate-placement-design.md

## Global Constraints

- Chrome120 floor; five package files and existing permissions/dependencies.
- Preserve disabled default/global activation and schema4.
- Every shell starts rtk; use isolated Chromium profiles, never personal Chrome.
- No008 controls, no matching-language changes, no weakened document/shared/stale/closure guards.

## Review Focus

- Grouped/ungrouped anchor with conflicting rule; same/cross-window.
- Anchor document unavailable/changed with matching rule must fail closed.
- No duplicate retains rule-driven group creation, including pending/settlement fault coverage.
- Unused passive duplicate evidence remains closure-ineligible, distinct from required anchor evidence.
- External links preserve manual location; preview promises rule matching rather than actual tab placement.

## Task1: Correct placement precedence and regression coverage

- [x] Write RED planner grouped/ungrouped conflicting-rule cases and required-anchor evidence cases in tests/unit/replacement.test.ts; browser conflict scenarios in replacement-placement.spec.ts.
- [x] Run focused Vitest and record missing-behavior failures.
- [x] Prioritize selected anchor in src/planning/replacement.ts; always include selected anchor in src/background/placement.ts frame reads. No executor changes.
- [x] Adapt override-specific tests/fixtures in placement.test.ts, replacement-execution.test.ts, placement-consumer.test.ts and browser recovery/external tests without losing phase/settlement coverage.
- [x] Clarify src/options/view.ts help and current README/architecture; record the explicit policy amendment without rewriting dated historical reports.
- [x] Run full Vitest/typecheck/build/package; focused production browser cases then complete browser suite/native cases. Resolve regressions with behavior-specific evidence.
- [x] Independent changeset review, fix/recheck findings, commit completion evidence, rebuild verified dist and pause before008.
