# Feature backlog

Foundation status: implemented and locally verified on 2026-10-25; see [foundation design](../superpowers/specs/2026-10-24-foundation-design.md).

Tasks 001 matching/configuration and 002 duplicate identity/schema 3 are implemented and locally verified; Tasks 003–010 remain TODO. Hosted CI, Chrome 120/current-stable release compatibility, and expanded performance budgets remain unverified.

The foundation establishes contracts, lifecycle wiring, configuration, a mutation queue, tests and build tooling. Automatic movement and closure remain disabled until the corresponding tasks are complete.

- [001: Wildcard group rules](todo/001-wildcard-group-rules.md) — complete; depends on foundation
- [002: Duplicate URL equivalence](todo/002-duplicate-url-equivalence.md) — complete; depends on foundation
- [003: Group destination resolution](todo/003-group-destination-resolution.md) — depends on 001
- [004: Navigation eligibility and winner selection](todo/004-navigation-eligibility-and-winner-selection.md) — depends on 002
- [005: Replacement planning and placement](todo/005-replacement-planning-and-placement.md) — depends on 001, 002, 003, 004
- [006: Recoverable closure and stale-work protection](todo/006-recoverable-closure-and-stale-work-protection.md) — depends on 005
- [007: Rule editor and matching preview](todo/007-rule-editor-and-matching-preview.md) — depends on 001, 002, 003
- [008: Pause controls and replacement protections](todo/008-pause-controls-and-replacement-protections.md) — depends on 006, 007
- [009: Real-browser feature regression suite](todo/009-real-browser-feature-regression-suite.md) — depends on 006, 007, 008
- [010: Performance budgets and release readiness](todo/010-performance-budgets-and-release-readiness.md) — depends on 009

Tasks 001 and 002 are independent pure rule engines. Task 007 can progress alongside replacement/recovery after its dependencies. Automatic duplicate closure must not ship before task 006; default activation waits for protections in 008 and regression checks in 009. Task numbers are stable identifiers; completion can be tracked in each file.
