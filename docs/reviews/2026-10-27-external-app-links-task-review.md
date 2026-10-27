### Spec Compliance

- ✅ Spec compliant at `historical-revision`. The sole production change admits `start_page` and removes its redundant known-set entry (`src/background/navigation.ts:12`). All eleven requested file hunks are present; no production control flow, queue, recovery, execution, permissions, dependencies, schema, storage or UI changes.
- ✅ Portable assertions cover cold HTTP/HTTPS admission/current event, retained URL bytes, server-redirect final URL, qualified-client provenance, cold history/fragment exclusion, reload revocation and invalid metadata (`tests/unit/navigation.test.ts:10`, `:103`). Coordinator parameterization retains initialization, disabled configuration and stale revocation coverage with explicit recovery readiness assertions (`tests/integration/coordinator.test.ts:31`, `:128`, `:179`). Consumer assertions require named grouping and exactly older duplicate removal, with disabled/recovery/stale no-mutation controls (`tests/integration/placement-consumer.test.ts:108`, `:120`).
- ✅ Native tests load real `dist` into a headed cloned bundled app with random explicit profile, seed while disabled, then send LaunchServices open (`tests/browser/external-app-links.spec.ts:54`, `:68`, `:94`). Enabled assertions require distinct survivor, final URL, named group, old-ID disappearance and every unrelated ID retained (`:97`, `:106`, `:116`). Matrix covers HTTP, HTTPS, HTTP→HTTPS final identity, stopped worker and disabled control (`:11`); non-macOS explicitly skips (`:145`).
- ✅ Stopped-worker case observes native stopped status, sends OS open before any worker evaluation and observes running afterward (`tests/browser/external-app-links.spec.ts:88`). CDP controls/observes lifetime; it does not provide the external URL navigation.
- ✅ Helper validates the enclosing app, clones into its own mkdtemp root, assigns unique bundle ID, rejects non-HTTP(S) and invokes full app path through argument arrays with no installed-Chrome/default-handler fallback (`tests/browser/external-app-launch.ts:13`, `:24`, `:30`). Caller supplies `chromium.executablePath()` and random explicit profile (`tests/browser/external-app-links.spec.ts:27`, `:33`, `:57`).
- ✅ Docs explicitly accept indistinguishable configured startup pages, preserve core reload exclusion, avoid origin/user-intent claims and retain uncaptured native restore limitation (`README.md:73`; `docs/architecture.md:46`; `docs/tasks/todo/006a-external-app-link-compatibility.md:9`). Task 004 historical results remain, with amendment explicit (`docs/tasks/todo/004-navigation-eligibility-and-winner-selection.md:5`).
- ⚠️ Cannot verify from this diff alone: semantic correctness of every unchanged Task 006 guard; Chrome 120/current stable matrix; trusted omnibox; exact user source app/profile; native restore/reopen behavior. These limits remain explicitly documented.
- ⚠️ Controller-owned completion/backlog/plan checkboxes and whole-feature review remain pending as required (`docs/tasks/todo/006a-external-app-link-compatibility.md:3`, `:25`).

### Strengths

- Narrow two-line production correction preserves existing safety authority; native assertions prove actual closure as well as grouping (`src/background/navigation.ts:12`; `tests/browser/external-app-links.spec.ts:106`).
- Redirect test seeds the HTTPS final identity and checks final survivor URL, avoiding accidental HTTP/HTTPS identity equivalence (`tests/browser/external-app-links.spec.ts:54`, `:113`).
- Consumer fixture supplies matching live frame evidence for both participants and asserts concrete removal IDs (`tests/integration/placement-consumer.test.ts:27`, `:108`).
- Native resource paths are owned and isolated; all six retained RED/GREEN clone/profile roots are currently absent (`tests/browser/external-app-links.spec.ts:130`; evidence checked below).

### Issues

#### Critical (Must Fix)

- None found.

#### Important (Should Fix)

- None found.

#### Minor (Nice to Have)

- `tests/browser/external-app-links.spec.ts:131`: cleanup is sequential in one finally. A rejected context.close skips both server closures, clone disposal and profile deletion; a server-close rejection similarly skips later cleanup. Use nested finally blocks or collect errors while attempting all cleanup. Successful evidence confirms cleanup today; this is test failure-path robustness, not a production/acceptance blocker.
- `tests/browser/external-app-links.spec.ts:150`: redundant blank line at EOF. Controller's full-feature `git diff historical-revision..HEAD --check` reports new blank line at EOF. Remove the extra line and check the actual reviewed range, rather than only a clean working-tree diff.

### Checks and evidence

- Read full supplied review package once. Initial output truncated its middle; read omitted package ranges to complete it. Did not recompute Git diff, re-read changed source, crawl unrelated code, mutate source/index/HEAD, run routine test suites or dispatch helpers.
- Named risk: native results could equate grouping with closure. Inspected retained `native-baseline-red/native-external-result.json`, baseline `error-context.md` and every `native-green/*.json` under `.superpowers/sdd/2026-10-27-external-app-links/`. RED retains old 945124771 and new 945124772, both ungrouped. Enabled GREEN survivors 1130280233, 483831287, 747990969 and 1870092398 belong to named External groups, corresponding old IDs are absent and unrelated IDs remain. Disabled GREEN retains 1899615527 and 1899615528 ungrouped with no groups. Stopped GREEN records running → stopped → running-after-open.
- Named risk: metadata could be synthetic or a snapshot-readiness failure. Inspected `native-events.json`: seven OS-open operation labels correspond to rejected active outermost frame-0 start_page commits, server_redirect where applicable, matching tab/frame URL/document snapshots and absent pendingUrl. Stopped case has a new worker realm. Observer metadata and production replacement results remain separate.
- Named risk: test fixtures might target personal resources or leak owned roots. Checked helper/caller operations in supplied diff and existence of only the six evidence-recorded clone/profile roots; each is absent. No installed-app/default-browser/personal-profile path is selected.
- Baseline JSON's launch metadata records executable rather than enclosing app path; report explicitly discloses writer error. Current helper invokes full app path, final GREEN JSON records it, and baseline error context calls launcher.open for the tested external operation.
- Author reports Node 24.22.1/bundled Chrome 156.0.8078.4; 118 focused portable tests; 884/884 full portable tests; 99 browser tests including five native cases with zero skips/failures; typecheck/build/package passing. Native JSON and RED failure artifact were independently inspected. Controller separately confirms fresh 884/884, typecheck/build/package passing; its browser run was still running at review time. Full raw suite stdout is outside this package; retain original execution record rather than rerunning solely for this review.

### Assessment

**Task quality:** Approved, with two minor cleanup improvements.

**Reasoning:** The admission correction matches the adopted compatibility tradeoff and leaves production safety mechanisms unchanged. Actual LaunchServices evidence demonstrates grouping and older-duplicate closure including confirmed worker suspension, with disabled and portable guard controls covering the boundary.

**Report:** `.superpowers/sdd/2026-10-27-external-app-links/task-1-review.md`
