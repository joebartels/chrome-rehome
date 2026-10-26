### Spec Compliance

- ❌ Issues found: the malformed-metadata fail-closed requirement has one concrete hole: a sparse `transitionQualifiers` array is admitted as eligible (`src/background/navigation.ts:79`). See Important issue I1 and its focused probe below.
- ✅ The requested structural contracts, detached/frozen outputs, strict native URL freshness independent of duplicate identity, complete-trigger matching, context/pinned/pending/block exclusions, latest-observed ranking and deterministic anchor ordering are implemented (`src/planning/candidates.ts:1`, `:41`, `:57`, `:75`, `:78`, `:86`, `:93`, `:97`, `:101`).
- ✅ Worker-local epoch/generation/view revision, synchronous revocation, trusted same-document/client-redirect provenance and replacement clearing match the adopted design (`src/background/navigation.ts:40`, `:46`, `:57`, `:70`, `:85`, `:93`, `:104`, `:109`, `:112`). Registry preserves the required metadata and routes both native replacement APIs to the same operation (`src/background/register-events.ts:29`, `:38`, `:45`, `:48`). Coordinator integration is limited to replacement forwarding (`src/background/coordinator.ts:57`).
- ✅ All brief-listed files have the corresponding changes; the 14-file package contains no production consumer, configuration/schema/storage, Task003 module, dependency, permission, or backlog005–010 implementation hunk (`.superpowers/sdd/2026-10-26-navigation-eligibility/review-historical-revision..historical-revision.diff:6`). No-op authority and future activation milestones are stated explicitly (`docs/tasks/todo/004-navigation-eligibility-and-winner-selection.md:9`, `README.md:71`, `docs/tasks/README.md:23`).
- ⚠️ Cannot verify from this diff: unchanged production `consume` contents or independent historical execution of the reported commands. The package excludes the production entry; the implementer reports its no-op and empty scope-boundary diff at `task-1-report.md:18`. Controller should retain that boundary check. I read the report's complete RED/GREEN and final command evidence (`task-1-report.md:24`, `:36`, `:54`, `:72`); I did not regenerate it by rerunning suites.
- ⚠️ Actual restore/reopen, trusted omnibox/external-app navigation, native prerender replacement, incognito eligibility and Chrome120/current-stable compatibility remain unverified browser contexts. This is accurately bounded by the permitted capability-gap/manual-check provision, not hidden missing browser coverage (`docs/tasks/todo/004-navigation-eligibility-and-winner-selection.md:41`, `:45`, `:47`).

### Strengths

- The selector uses the real supplied duplicate compiler while separately checking native-href freshness, so a relaxed identity cannot rehabilitate a stale observed URL (`src/planning/candidates.ts:79`, `:86`; `tests/unit/candidates.test.ts:63`). It returns copied immutable tab/navigation records without leaking identity keys or mutation authority (`src/planning/candidates.ts:44`, `:101`; `tests/unit/candidates.test.ts:31`).
- Observation is revoked before policy filtering; a foreign-document same-document callback cannot establish provenance, and before-navigate preserves only source trust while blocking candidates (`src/background/navigation.ts:60`, `:70`, `:93`; `tests/unit/navigation.test.ts:102`). Revision checks also cover invalidation of previously unobserved anchors (`src/background/navigation.ts:117`; `tests/unit/candidates.test.ts:137`).
- Deterministic tests pin equal-rank tie-breaking, complete observations, immutable copies and competing queued handlers; ranking is explicitly independent of browser timestamp (`tests/unit/candidates.test.ts:28`, `:40`, `:47`; `tests/integration/coordinator.test.ts:149`). Both actual replacement callback orders are tested through the registry (`tests/integration/register-events.test.ts:204`).
- Real browser evidence is candid about policy reach: the restarted worker genuinely admits an unqualified script `link` commit (`tests/browser/navigation.spec.ts:155`; `task-1-report.md:458`), and the docs prominently explain that this cannot prove human intent or universal restored-page-script rejection (`docs/tasks/todo/004-navigation-eligibility-and-winner-selection.md:11`). That admission follows the controller-adopted ordinary-link policy and is not itself an implementation deviation; future mutation activation still needs an explicit product judgment about the residual.
- The real prerender attempt records native Failure/PrerenderingDisabledByDevTools and an empty replacement list, without calling fallback link navigation successful prerender coverage (`tests/browser/navigation.spec.ts:178`, `:200`; `task-1-report.md:506`). Exact disposable-profile checks cover the remaining restore/external/omnibox limits (`docs/tasks/todo/004-navigation-eligibility-and-winner-selection.md:45`).

### Issues

#### Critical (Must Fix)

- None found in this task-scoped change.

#### Important (Should Fix)

- **I1 — Reject holes in qualifier arrays before establishing trust.** `src/background/navigation.ts:79`: `Array.prototype.every` skips unassigned slots, so `transitionQualifiers: Array(1)` passes the “well-formed list of known qualifiers” check. The later `includes('client_redirect')` is false, allowing an active ordinary commit with that malformed metadata to create an eligible navigation and trusted document provenance (`:85`, `:91`, `:97`). This contradicts the explicit fail-closed malformed-input contract. Native Chrome normally supplies dense arrays, so this is a bounded validation defect rather than evidence of observed browser exploitation; production remains no-op. Validate every numeric slot (or densify before validating) and add this case to the malformed-input regression table (`tests/unit/navigation.test.ts:22`), asserting synchronous revocation, blocking, no eligible navigation, and no later same-document/client-redirect provenance.

#### Minor (Nice to Have)

- None required for this task gate.

### Checks Run

- Read the task brief, exact binding constraints, named design, complete implementer report, and all 1,535 lines of the supplied review package in bounded ranges. One initially truncated documentation range was reread; no changed source file was separately recrawled. Review base `historical-revision`, head `historical-revision`.
- One focused, read-only Node24 probe addressed the named sparse-qualifier doubt: `rtk proxy node --input-type=module -e 'import { createNavigationTracker } from "./src/background/navigation.ts"; const tracker = createNavigationTracker(); const transitionQualifiers = Array(1); const event = tracker.observe({ tabId: 7, frameId: 0, url: "https://example.com/", timeStamp: 1, documentId: "doc", kind: "committed", transitionType: "link", transitionQualifiers, documentLifecycle: "active" }); console.log(JSON.stringify({ qualifierLength: transitionQualifiers.length, qualifierEntries: Object.keys(transitionQualifiers), eligible: event !== undefined, navigations: tracker.view().navigations.length }));'`. Exit 0, output `{"qualifierLength":1,"qualifierEntries":[],"eligible":true,"navigations":1}`. This confirms I1; no passing suite was rerun.
- Reported validation is clean: 638 Vitest tests, Node24 typecheck/build/package validation, 21 Playwright cases on Chromium156, and four final covering navigation cases after fixture-only cleanup (`task-1-report.md:77`, `:88`, `:96`). Earlier sandbox/capability failures are disclosed separately, not represented as successful policy coverage (`task-1-report.md:98`).
- No source, index, HEAD, branch, dependencies or browser settings were modified; only this authorized scratch review report was written. No subagents were dispatched.

### Assessment

**Task quality:** Needs fixes.

**Reasoning:** The task implements the adopted eligibility/selection design with focused boundaries and meaningful race/browser evidence. Repair the small but demonstrated malformed-qualifier admission hole and cover it with a focused regression; the documented ordinary-link residual and real-browser capability gaps remain future activation constraints rather than claims this implementation has solved them.
