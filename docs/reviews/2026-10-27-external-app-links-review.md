# Whole-feature final review — external-app links

Reviewed feature BASE `historical-revision` through HEAD `historical-revision`, branch `external-app-links`, before Task 007. Read-only except this report; no helpers, source/index/HEAD changes, routine suite reruns or personal-browser actions.

## Strengths

- Production changes only the admitted/known transition sets (`src/background/navigation.ts:12–13`). The unchanged observer still validates URL/document/frame/lifecycle/qualifiers, enforces cold client/same-document provenance, and revokes generations synchronously. Admission does not bypass placement or closure authority.
- Evidence separates seven baseline native observer traces from real production baseline RED and five GREEN cases. Positive native tests require a distinct survivor, final URL, expected group title, exact old-ID disappearance and unrelated-ID retention (`tests/browser/external-app-links.spec.ts:94–117`). Grouping alone cannot pass.
- The helper owns a random app clone and UUID bundle identity, invokes full-path LaunchServices with argument arrays, accepts HTTP(S) only, and the caller supplies a random explicit profile (`tests/browser/external-app-launch.ts:11–44`). No default-browser fallback, installed Chrome, new permissions or production fixture.
- Native stopped status precedes OS open without intervening worker evaluation, followed by running status and actual replacement (`tests/browser/external-app-links.spec.ts:88–114`). Unchanged startup registers listeners synchronously, and coordinator waits for configuration/recovery before consumption (`src/background/index.ts:28–29`; `src/background/coordinator.ts:34–65`).
- Portable cases pin redirects, reload revocation, malformed metadata, initialization/recovery and disabled/stale no-mutation outcomes. Consumer tests require live documents and exactly the old duplicate removal (`tests/integration/placement-consumer.test.ts:108–146`). Existing Task 006 authority remains unchanged.
- Docs explicitly amend historical start_page policy, disclose indistinguishable startup/command-line admission, and retain restore evidence gaps. Missing configuration still defaults to disabled (`src/config/schema.ts:47–49`); README trial instructions require explicit enablement and explain closure.

## Issues

### Critical — none found

### Important — none found

### Minor

1. **Attempt every appropriate owned cleanup after a preceding cleanup error.** `tests/browser/external-app-links.spec.ts:130–138`. Sequential cleanup lets rejected `context.close()`, synchronous server cleanup errors, or rejected launcher disposal skip later cleanup. Successful runs cleaned up, so this is test failure-path robustness. Use nested finally blocks or collected cleanup errors; preserve the original error and the caller's browser-close-before-clone-disposal ownership rule.

2. **Remove redundant EOF blank line.** `tests/browser/external-app-links.spec.ts:150`. The reviewed range adds a blank line at EOF, reported by the controller's range whitespace check. A clean working-tree check misses committed whitespace. Remove it and check the actual feature range.

3. **Strengthen disabled native control's observation point.** `tests/browser/external-app-links.spec.ts:97–104`. Finding the new URL through tabs.query does not establish completed load or asynchronous extension handling. The retention poll can pass at its first pre-mutation snapshot, despite the comment claiming completed native load. Deterministic portable disabled guards remain strong; this is a limitation of the native negative evidence, not a demonstrated enablement bug. Await the actual externally opened page's load completion before retained-ID/group checks, and accurately describe the remaining bounded negative observation instead of claiming deterministic queue completion. Do not add production hooks or keepalive.

## Plan and reasonable-user expectations

The minimal production boundary is met. The required external path groups and closes eligible older duplicates, including worker wake, through the unchanged consumer. Redirect identity uses final HTTPS, without broadening HTTP/HTTPS equivalence. Unsafe URLs and core reload remain rejected; admission alone grants no mutation authority.

A reasonable user can be surprised when configured startup URLs close matching older tabs. I considered this consequence as a product requirement, not an exclusion licensed by spec silence. Available metadata does not distinguish these URLs from the confirmed external path. The adopted policy accepts that consequence, default configuration remains disabled, and explicit trial instructions disclose closure. This is acceptable for the scoped opt-in trial, not default activation or a claim of human intent. Already-enabled installations retain enablement, so the README disable-before-reload procedure matters.

The correction establishes the tested macOS LaunchServices route, not universal external-origin detection. Exact user-app/profile routing and native restore remain material handoff limits. No later task is completed by this review.

## Evidence and method

Read the complete supplied packaged diff in bounded sections, separately reading truncated documentation sections to complete coverage; did not recompute the diff. Read canonical design/plan, metadata, implementation report, task review, ledger and constraints.

Targeted outside-diff checks addressed only named risks: admission interacting with unchanged provenance/removal state; cold-worker events bypassing initialization/recovery; and the disabled-default/trial claim. Inspected remaining navigation tracker control flow, coordinator, startup registration, configuration default parsing and README controlled-trial instructions. No routine suites rerun.

Author reports Node 24.22.1, bundled Chrome for Testing 156.0.8078.4, 118 focused tests, 884 full portable tests, 99 browser tests with zero skips/failures, and passing typecheck/build/package. Controller separately reports fresh 884 portable passes and passing typecheck/build/package; its full browser run was in progress at dispatch. Controller independently audited all five native JSON records for IDs/group/final URL/stopped status and deletion of owned paths; task reviewer audited baseline/GREEN artifacts and seven observer traces. I reviewed the test implementation and evidence distinctions, not a duplicate raw artifact audit. Do not mark the controller browser run complete based on this report.

## Behaviors considered, then declined to judge as fully verified

Each line needs controller disposition; these are explicit boundaries, not silently dropped requirements:

- Exact user's source app, profile and full URL: not supplied; isolated LaunchServices is verified, but app-specific rewriting/profile routing is not.
- Native session restore and reopen-closed-tab commits: not captured; reload semantics/unit tests are not native restore proof.
- Whole-browser cold launch with restored session: stopped extension worker is narrower; full startup/restore interplay is not tested.
- Configured startup/command-line production grouping/closure: policy consequence is judged above, but no independent full production startup matrix is claimed.
- Non-macOS external routing: native cases explicitly skip; portable tests do not establish Windows/Linux OS integration.
- Chrome 120/current stable release matrix: only bundled 156.0.8078.4 exercised; release trials remain.
- Trusted omnibox: prior UI attempt did not navigate; CDP typed control is not trusted omnibox coverage.
- Every redirect direction in production: observer covers four directions; production covers HTTP→HTTPS plus direct HTTP/HTTPS, not every OS/browser combination.
- Prerender/canceled navigation and cold SPA/hash false negatives: preserved conservative policy with unchanged mechanism, not newly certified broad compatibility.
- Explicit incognito access, native drag/focus/collapse/shared-group interactions and every unchanged Task 006 interruption path: no fresh exhaustive native matrix here; unchanged guards and reported existing regressions support only the scoped change.
- Transient page-state protection beyond existing duplicate/document rules: same-URL tabs can hold different unsaved state; broader protection controls remain later work. No unsaved-form preservation certification; readiness is limited to explicit disposable-profile trial.
- Task 006a completion, backlog/plan checkboxes, durable completion artifact and handoff: controller work remains pending; this implementation review does not complete those or Task 007.

## Recommendations

Resolve the small test-only findings together, then one scoped re-review and affected verification. Retain feature-range whitespace checking and record the final controller browser result. Carry startup/command-line consequences and user-specific/restore limits into the durable record and trial handoff. Do not broaden default activation or begin 007.

## Assessment

**Ready for scoped explicitly enabled, default-disabled disposable-profile trial: Yes.** No Critical/Important production issue found. The narrow admission change has separate native metadata, real production RED/GREEN behavior and portable conservative guard coverage.

**Ready to integrate: Yes, with minor harness improvements recommended and controller final verification/completion pending.** Not a certification for default activation, arbitrary personal profiles, all releases/platforms or native session restoration.
