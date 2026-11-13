
> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

- **Scoped external rules imports evade the dependency guard** — ADDRESSED. `scripts/check-package.mjs:50` now rejects every non-relative specifier from rules before layer classification; `tests/unit/boundaries.test.ts:19` and `tests/unit/boundaries.test.ts:20` cover runtime and type-only `@vendor/rules` imports.
- **New Breakage in the Fix Diff:** None. The change preserves relative-import handling and the existing config guard while extending the same restriction to rules.
- **Out-of-Scope Observations:** None.
- **Verification checked:** Read the supplied fix diff once and inspected its surrounding guard/test context. The fix report identifies the focused boundaries command and records expected RED failures, GREEN with 22 tests, full suite with 308 tests, typecheck, build, package check and diff check. It provides summarized results rather than verbatim command output; execution claims remain unverified. No tests or Git commands rerun.
- **Fix round:** All findings addressed, no new Critical/Important breakage.
