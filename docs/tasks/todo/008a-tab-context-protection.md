# 008a: Protect the right-clicked tab

Status: original functional work complete (2026-10-29), with documented native evidence/foreground reliability limits. New UI simplification/indicator feedback is pending preference.

Depends on008. User explicitly requests per-tab protection from the native tab-handle context menu, not global pause.

- [x] Two explicit Protect/Unprotect actions address only the right-clicked tab, including background tabs, without activation/focus/move.
- [x] Reuse the worker-owned protection writer with distinct by-ID verification; popup selected-tab and global-Pause semantics remain unchanged.
- [x] Add only contextMenus permission, gracefully retain popup on pre150 Chrome, keep existing120 floor/default-off/eight-file package.
- [x] Verify actual native event target/submenu, multiselection, cold worker/reload, races/failures/privacy and full regression suite with independent reviews.

[Design](../../superpowers/specs/2026-10-28-tab-context-protection-design.md) · [Plan](../../superpowers/plans/2026-10-28-tab-context-protection.md). Task009 remains paused.

Sourceabd6bb6: root1,330 portable tests/43 files, typecheck/build/eight-file package pass. Full browser153/155 plus exact two focused passes provides aggregate155 current passing coverage, not one clean full invocation. User confirmed real inactive-target, multiselection, cold-worker and reload menu behavior. Native screenshots/raw-event/full-invariant captures were explicitly substituted with coordinated user observations plus strict source/real-API tests after the UI bridge failed to bind the owned app. No source defect was found, and the historical native-focus transition remains unexplained. [Evidence and Chrome walkthrough](../../reviews/2026-10-29-tab-context-protection-completion.md).

User feedback requests a single state-dependent action and a native tab lock indicator. Supported alternatives are awaiting preference; no UI-polish implementation is claimed here.
