# Preserve existing duplicate placement

The user tested Task007 and requests that an existing tab in Group A supplies the replacement location even when a grouping rule chooses Group X. This supersedes the earlier configured-group override policy. Implement this correction before008, leaving008 unstarted.

Use the existing deterministic eligible duplicate anchor, with its live group/window and after-anchor position, before considering any grouping rule. This also preserves explicitly ungrouped placement. With multiple duplicates, keep existing anchor selection (winner window preferred, then window/index/ID); do not invent manual-move history. With no duplicate, ordered wildcard rules still group normally. Unsupported/pinned/pending/context/shared-group and document guards remain conservative. A missing/changed anchor document must prevent replacement; never fall back to a rule that overrides the uncertain manual location.

Two approaches: persist manual overrides, or inherit the current live duplicate location. Choose live inheritance: it meets the request without new storage, permissions, dependencies or stale override state. No global pause/protection UI or other008 work. Incoming winner identity/history and independently verified closure remain unchanged.

Planner prioritizes selected.anchor; consumer reads winner plus selected anchor regardless of rule match. Existing executor, recovery journal and closure protocol remain unchanged. Adapt old override-specific tests to the new contract, preserving isolated new-group mutation/settlement coverage using lone winners. Unused passive duplicate evidence tests must use an independently valid anchor plus a different passive duplicate; never weaken anchor guards.

Explain optional duplicate policies with an ignored tracking-parameter example. Preview evaluates draft rules and optional pair equivalence without querying tabs; its copy must state that a live duplicate location takes priority during navigation.

Verify RED regression before code, unit/integration full checks, production Chromium grouped/ungrouped same/cross-window conflicts, grouping-only fallback, real native external link compatibility, typecheck/build/package. Independently review the changes. Keep local branch, rebuild dist, pause before008.
