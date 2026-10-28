# 008a: Protect the right-clicked tab

Status: authorized follow-up, design/implementation in progress (2026-10-28).

Depends on008. User explicitly requests per-tab protection from the native tab-handle context menu, not global pause.

- [ ] Two explicit Protect/Unprotect actions address only the right-clicked tab, including background tabs, without activation/focus/move.
- [ ] Reuse the worker-owned protection writer with distinct by-ID verification; popup selected-tab and global-Pause semantics remain unchanged.
- [ ] Add only contextMenus permission, gracefully retain popup on pre150 Chrome, keep existing120 floor/default-off/eight-file package.
- [ ] Verify actual native event target/submenu, multiselection, cold worker/reload, races/failures/privacy and full regression suite with independent reviews.

[Design](../../superpowers/specs/2026-10-28-tab-context-protection-design.md) · [Plan](../../superpowers/plans/2026-10-28-tab-context-protection.md). Task009 remains paused.
