# 007a: Preserve existing duplicate placement

Status: COMPLETE (2026-10-27)

User requirement: if an older equivalent tab is in Group A and a grouping rule requests Group X, keep the new survivor in Group A. Manual organization should not be undone by repeated opens.

The current eligible duplicate anchor takes precedence, including ungrouped locations and cross-window placement. With multiple duplicates the existing deterministic selector remains unchanged. Rules still handle URLs with no duplicate. Missing/changed required anchor evidence prevents mutation instead of falling back to a rule. Executor, closure journal, recovery, matching language, activation and permissions remain unchanged. Task008 has not started.

See [design](../../superpowers/specs/2026-10-27-preserve-duplicate-placement-design.md) and [plan](../../superpowers/plans/2026-10-27-preserve-duplicate-placement.md). Options help now explains optional duplicate policies with a tracking-parameter example, and makes clear that preview tests rules rather than live tab placement.

[Completion and Chrome test](../../reviews/2026-10-27-preserve-duplicate-placement-completion.md): 964 unit/integration tests, 109 browser tests (zero skips/failures/flaky), typecheck/build/package, independent review clear. Task008 remains unstarted.
