# Historical records

These documents preserve past design decisions, investigations, and verification results. They are not current instructions, a feature inventory, or a backlog. Start with the [current documentation](../README.md) when using or changing ChromeReHome.

- [Reviews and completion records](reviews/) describe what was observed for particular builds, including failed runs and limits.
- [Past designs](superpowers/specs/) and [implementation plans](superpowers/plans/) explain how work was scoped at the time. Their checklists and embedded agent instructions are inactive.
- [Past architecture notes](architecture.md) record the implementation as it evolved.
- [Performance measurements](performance-baseline.md), [browser regression evidence](testing/browser-regression-matrix.md), and [release qualification](testing/chrome-release-qualification.md) apply only to the packages and environments they identify.

Completed task records were moved to GitHub Issues. References here identify the original task so its completion record can be found there. New work belongs in Issues; do not add another file-based task queue.

Personal paths and examples were replaced during public-release preparation. Repository links now use relative paths. `EXTERNAL_EVIDENCE` denotes artifacts that were recorded outside the repository and are not included here; `$TEMP_DIR` denotes a test-owned temporary directory. These placeholders do not establish that an artifact is still available. Old line numbers, commands, API descriptions, test counts, and version claims remain historical context and should not be copied into current guidance.

Preserve the substance of failures and limitations when correcting or sanitizing evidence. A later passing run does not explain an earlier failure, and an archived pass does not qualify the current build.

Repository history was rewritten during privacy cleanup. Personal author metadata and machine paths were removed from old revisions. Commit references in these notes were replaced with `historical-revision`; dates and build versions still identify the recorded work. The original verification results describe the builds tested at the time.
