# 008a: Protect the right-clicked tab

Status: source implementation and independent reviews approved; final native/manual acceptance pending (2026-10-29).

Depends on008. User explicitly requests per-tab protection from the native tab-handle context menu, not global pause.

- [x] Two explicit Protect/Unprotect actions address only the right-clicked tab, including background tabs, without activation/focus/move.
- [x] Reuse the worker-owned protection writer with distinct by-ID verification; popup selected-tab and global-Pause semantics remain unchanged.
- [x] Add only contextMenus permission, gracefully retain popup on pre150 Chrome, keep existing120 floor/default-off/eight-file package.
- [ ] Verify actual native event target/submenu, multiselection, cold worker/reload, races/failures/privacy and full regression suite with independent reviews.

[Design](../../superpowers/specs/2026-10-28-tab-context-protection-design.md) · [Plan](../../superpowers/plans/2026-10-28-tab-context-protection.md). Task009 remains paused.

Sourceabd6bb6: root1,330 portable tests/43 files, typecheck/build/eight-file package pass; four API-boundary browser cases pass. Full browser153/155 has two foreground fixture setup/attention failures under investigation. Native actual menu checks are pending a user check because the UI bridge could not safely bind the owned trial. [Evidence and Chrome walkthrough](../../reviews/2026-10-29-tab-context-protection-completion.md).
