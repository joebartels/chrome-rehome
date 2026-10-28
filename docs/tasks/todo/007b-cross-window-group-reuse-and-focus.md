# 007b: Cross-window group reuse and foreground focus

Status: complete and independently reviewed, with local verification (2026-10-27). Task008 remains unstarted.

User requests that a matching group in another Chrome window be reused instead of creating another same-name group, and that foreground opens select the incoming tab and focus that window. Deliberate background opens must remain background. Complete this correction, then pause before008.

Existing007a duplicate-first manual placement remains authoritative. With no duplicate, prefer current matching group, then same-window group, then deterministic remote window/member-index/group-ID order, in the same browsing context. Create only when no matching eligible group exists. Existing same-name groups are not merged. Foreground attention is observed before movement and verified through placement; unknown/ambiguous initial evidence grants no focus authority. Background intent never upgrades to foreground.

Use journaled activate/focus stages before any duplicate closure. Keep strict legacy v1 recovery, new v2 pending barriers, serialized native settlement, document/snapshot guards and no replay. No dependencies, permissions, config schema changes or Task008 controls. The exact matching language remains unchanged.

[Design](../../superpowers/specs/2026-10-27-cross-window-group-reuse-design.md) · [Plan](../../superpowers/plans/2026-10-27-cross-window-group-reuse.md).

Current verification: 1,065 unit/integration tests, typecheck, build/package and137 browser tests pass. Native Chrome155 RED/GREEN confirms the same-URL history correction; native156 verifies foreground/background and real external-app handoff. Both final full137 runs pass. One earlier native activation-gate timeout remains separately unexplained and documented.

[Completion evidence, decisions and Chrome trial](../../reviews/2026-10-27-cross-window-group-reuse-completion.md).
