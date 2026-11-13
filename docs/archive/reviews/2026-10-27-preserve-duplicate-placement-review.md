# Independent review: preserve duplicate placement

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Reviewed `historical-revision..historical-revision` in `<repository>`, against the design, implementation plan, and implementation evidence report. Confirmed checkout HEAD `historical-revision`; checkout was clean. Review was read-only; no tests were rerun and no checkout, index, or branch changes were made.

## Strengths

- `src/planning/replacement.ts:67` chooses the existing selected anchor before consulting the configured group, including ungrouped anchors and cross-window destinations. Candidate ordering remains unchanged. The existing validation and shared-group checks still apply.
- `src/background/placement.ts:34` always requests the selected anchor's document. Missing, invalid, or rejected reads cannot reach a rule fallback. The unchanged executor rechecks the anchor's original document ID and surrounding snapshot before mutations, so a subsequent anchor change cannot silently authorize another destination.
- `tests/unit/replacement.test.ts:7` covers same/cross-window conflicting rules, missing/inactive required-anchor evidence, and an ungrouped anchor. `tests/integration/placement-consumer.test.ts:91` checks that a matching rule cannot bypass unavailable anchor evidence.
- `tests/unit/replacement-execution.test.ts:39` now uses a valid selected anchor and a separate passive duplicate for optional-evidence tests. The passive-window title/color/shared/order races at line 478 still target a distinct window and require placement to stop with no closure.
- `tests/browser/replacement-recovery.spec.ts:279` removes duplicate identity before configured group/title phase tests. These remain actual durable-checkpoint termination tests, with original unrelated tab IDs retained for no-replay checks. Native pending-write coverage in `tests/unit/replacement-execution.test.ts:197` still reaches the lone-winner group/title branches.
- `tests/browser/replacement-placement.spec.ts:184` checks exact inherited group/window/position, older-tab closure, retained IDs, and survivor history under a conflicting Group X rule. `tests/browser/external-app-links.spec.ts:77` seeds a real Manual group while retaining the External rule, and line 132 asserts the exact original group ID. The disabled native control remains intact.
- Options help explains optional duplicate policies and the preview's draft-rule purpose without changing matching behavior. README and architecture accurately distinguish required anchor evidence from unused passive evidence, while labeling the older override policy as historical.

## Issues

- Critical: none.
- Important: none.
- Minor: none.

## Verification and limits

Independently inspected all changed production logic, changed test fixtures/assertions, relevant unchanged candidate/placement/closure guard code, and the current documentation. `git diff --check historical-revision historical-revision` passed. The implementation report records 964 tests across 29 files, typecheck/build/package success, and 13 focused production browser cases including five native external-link cases; those runs were reported evidence, not independently repeated in this review. The full 109-case browser run was still pending at review time. Its `EXTERNAL_EVIDENCE/2026-10-27-preserve-duplicate-placement/browser.json` result is finalized only when the run ends; the coordinating agent will record that final verification separately.

## Declined to judge

- Task008 activation/pause/protection controls and unsaved-form protection: explicitly excluded from this correction; no changes to those policies were introduced.
- Chrome 120/current stable release certification and the broader incognito/drag/intent compatibility matrix: unchanged release-validation work; this review does not establish coverage beyond the supplied Chromium evidence.

## Recommendations

Record the full browser run result before declaring final verification complete. No implementation fixes are requested.

## Assessment

**Ready to merge? Yes, subject to completion of the already-running required browser verification.** The two production control-flow changes implement the requested precedence while preserving document, shared-group, stale-state, closure, journal, and recovery safeguards. Test adaptations preserve the old guard intentions under the new placement contract.
