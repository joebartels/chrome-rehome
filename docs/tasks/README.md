# Feature backlog

Foundation status: implemented and locally verified on 2026-10-25; see [foundation design](../superpowers/specs/2026-10-24-foundation-design.md).

Tasks 001–008, 006a, 007a and 007b are implemented and locally verified. External-app compatibility (006a) completed on 2026-10-27; see [confirmed metadata, completion and Chrome trial](../reviews/2026-10-27-external-app-links-completion.md). Task 006 recoverable closure and stale-work protection completed on 2026-10-26; see [completion evidence and Chrome trial](../reviews/2026-10-26-recoverable-closure-completion.md). Task 007 editor and matching preview completed on 2026-10-27; see [completion evidence and Chrome walkthrough](../reviews/2026-10-27-rule-editor-completion.md). Task008 is complete with 1,225 portable tests and 151 browser cases passing. 008a per-tab protection is functionally complete with documented evidence/reliability limits; the approved single-toggle/toolbar-lock refinement is implemented. Task009 local regression gate completed in 0.1.2 with 1384 portable tests, a160-case complete browser run and six focused correction cases plus a valid sensitivity negative control; original native setup/focus uncertainties and manual/runtime limits remain documented in the [verification record](../reviews/2026-10-29-browser-regression-verification.md). Task 010 is complete in 0.1.3 with a [performance baseline](../performance-baseline.md) and [release qualification](../testing/chrome-release-qualification.md). Chrome 120 was tested on Linux and current stable on macOS. Hosted CI and interactive drag/rejection trials remain unverified. Task 011 is implemented in 0.1.4.

The explicitly enabled production trial places the winning tab, retains its ID/history and closes older duplicates only after independent evidence, verified placement and fresh preconditions. A session journal quarantines ambiguous interrupted work and never replays old closure. Configuration defaults to disabled; the editor preserves activation and the toolbar popup provides Pause/Resume. The editor supplies explicit saves and matching previews; Task008 adds manual session protection.

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
- [008: Pause controls and replacement protections](todo/008-pause-controls-and-replacement-protections.md) — complete; depends on 006, 007
- [008a: Protect the right-clicked tab](todo/008a-tab-context-protection.md) — functional work and approved toggle/toolbar-lock refinement complete; native visual-capture limits remain; depends on 008
- [009: Real-browser feature regression suite](todo/009-real-browser-feature-regression-suite.md) — local regression gate complete in 0.1.2; depends on 006, 007, 008
- [010: Performance budgets and release readiness](todo/010-performance-budgets-and-release-readiness.md) — depends on 009
- [011: Recent tabs across windows](todo/011-recent-tabs-popup.md) — complete; extends the Task 008 popup

Tasks 001 and 002 are independent pure rule engines. Task numbers are stable identifiers; completion is tracked in each file. Defaults remain disabled by decision; satisfying the Task009 regression gate does not automatically enable processing.

Chrome trial milestones: **load unpacked now for the controlled replacement trial (006 and 006a)**, using a disposable profile and explicit configuration. An already-enabled Task005 installation becomes closure-enabled on reload; pause before upgrading. **007** provides settings/rule editing and matching preview; **008** adds pause/protection controls; **009** supplies the browser regression gate; **010** covers release/performance validation. Task 004 metadata/intent limitations and manual capability gaps remain documented. Valid external/startup `start_page` admission is the explicit 006a amendment; core reload stays excluded. Historical Task005 completion evidence describes its previous placement-only phase.
