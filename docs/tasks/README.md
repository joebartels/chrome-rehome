# Feature backlog

Foundation status: implemented and locally verified on 2026-10-25; see [foundation design](../superpowers/specs/2026-10-24-foundation-design.md).

Tasks 001–007, 006a, 007a and 007b are implemented and locally verified. External-app compatibility (006a) completed on 2026-10-27; see [confirmed metadata, completion and Chrome trial](../reviews/2026-10-27-external-app-links-completion.md). Task 006 recoverable closure and stale-work protection completed on 2026-10-26; see [completion evidence and Chrome trial](../reviews/2026-10-26-recoverable-closure-completion.md). Task 007 editor and matching preview completed on 2026-10-27; see [completion evidence and Chrome walkthrough](../reviews/2026-10-27-rule-editor-completion.md). Work is paused before Task 008. Tasks 008–010 remain TODO. Hosted CI, Chrome 120/current-stable runtime compatibility, enabled-incognito/interactive manual trials and release/performance readiness remain unverified.

The explicitly enabled production trial places the winning tab, retains its ID/history and closes older duplicates only after independent evidence, verified placement and fresh preconditions. A session journal quarantines ambiguous interrupted work and never replays old closure. Configuration defaults to disabled; the editor preserves activation, with manual trial activation setup in the README. The editor now supplies explicit saves and matching previews; broader protections remain later tasks.

- [001: Wildcard group rules](todo/001-wildcard-group-rules.md) — complete; depends on foundation
- [002: Duplicate URL equivalence](todo/002-duplicate-url-equivalence.md) — complete; depends on foundation
- [003: Group destination resolution](todo/003-group-destination-resolution.md) — complete; depends on 001
- [004: Navigation eligibility and winner selection](todo/004-navigation-eligibility-and-winner-selection.md) — complete; depends on 002
- [005: Replacement planning and placement](todo/005-replacement-planning-and-placement.md) — complete; depends on 001, 002, 003, 004
- [006: Recoverable closure and stale-work protection](todo/006-recoverable-closure-and-stale-work-protection.md) — complete; depends on 005
- [006a: External-app link compatibility](todo/006a-external-app-link-compatibility.md) — complete; depends on 004, 006
- [007: Rule editor and matching preview](todo/007-rule-editor-and-matching-preview.md) — complete; depends on 001, 002, 003
- [007a: Preserve existing duplicate placement](todo/007a-preserve-existing-placement.md) — complete; existing group/window wins over a grouping rule
- [007b: Cross-window group reuse and foreground focus](todo/007b-cross-window-group-reuse-and-focus.md) — complete; [verification and Chrome trial](../reviews/2026-10-27-cross-window-group-reuse-completion.md)
- [008: Pause controls and replacement protections](todo/008-pause-controls-and-replacement-protections.md) — depends on 006, 007
- [009: Real-browser feature regression suite](todo/009-real-browser-feature-regression-suite.md) — depends on 006, 007, 008
- [010: Performance budgets and release readiness](todo/010-performance-budgets-and-release-readiness.md) — depends on 009

Tasks 001 and 002 are independent pure rule engines. Task numbers are stable identifiers; completion is tracked in each file. Default activation still waits for protections in 008 and the full regression gate in 009.

Chrome trial milestones: **load unpacked now for the controlled replacement trial (006 and 006a)**, using a disposable profile and explicit configuration. An already-enabled Task005 installation becomes closure-enabled on reload; pause before upgrading. **007** provides settings/rule editing and matching preview; **008** adds pause/protection controls; **009** completes the default-activation regression gate; **010** covers release/performance validation. Task 004 metadata/intent limitations and manual capability gaps remain documented. Valid external/startup `start_page` admission is the explicit 006a amendment; core reload stays excluded. Historical Task005 completion evidence describes its previous placement-only phase.
