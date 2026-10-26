# 004: Navigation eligibility and winner selection

Status: Complete — locally verified 2026-10-26; paused before Task 005.

Depends on: 002

## Outcome and authority

`background/navigation.ts` synchronously observes eligibility; `planning/candidates.ts` selects a newest eligible winner and deterministic duplicate anchor. Production `consume` remains a no-op. Selection grants no movement, grouping or closure authority. Configuration/schema, existing pure engines and Task 003 APIs are unchanged.

**Residual policy risk:** Chrome transition metadata does not prove human intent or identify every restored-page script. An unqualified script navigation reported as ordinary `link` can qualify, including after reload or a cold worker start. The actual Chromium probe recorded a delayed script navigation as `link` with an empty qualifier list after worker restart, and it qualified. Cold `client_redirect` rejection applies only when Chrome actually supplies that qualifier. This policy is not universal restored-page-script detection and must be reviewed before future activation.

## Eligibility decisions

- Require main frame 0, HTTP(S), finite timestamp, nonempty document ID, active lifecycle, recognized transition metadata and known qualifiers. Supplied frame type must be `outermost_frame`. Reject credentials, whitespace, controls and backslashes. Preserve actual URL bytes.
- Admit active commits of `link`, `typed`, `auto_bookmark`, `generated`, `form_submit`, `keyword`, `keyword_generated`, even at worker start or during configuration load. `forward_back` is allowed on those transitions.
- Reject core `reload`, including `from_address_bar` and `forward_back`; reject `start_page`, unknown/missing metadata and nonactive lifecycles. No startup timer, preexisting-tab heuristic or restored flag is inferred.
- Server redirect final commits can qualify; before-navigate URLs never become candidates. `client_redirect` additionally needs trusted active-document provenance in this worker, preserved across before-navigate and cleared by ineligible commits/removal/replacement.
- History/hash updates require trusted matching document ID, changed native `URL.href`, eligible metadata and no pending full navigation. No-op updates revoke prior work but retain trusted provenance. Delayed callbacks for another document cannot adopt provenance. Reload/cold-worker SPA updates cannot establish it.
- Subframes cannot revoke main-frame work. Every distinct valid main-frame observation revokes prior generations before filtering. Exact full-fingerprint repeats do nothing. Nonactive/malformed input blocks the tab; a later recognized active commit clears that block even if reload/start_page is ineligible.
- Both `tabs.onReplaced` and `webNavigation.onTabReplaced` clear both identities/provenance, block the added ID and synthesize no event or rank transfer. Removal forgets state. No error-event unblocking is attempted.

This intentionally misses ambiguous external-app navigation reported as `start_page`, first SPA/hash activity after worker suspension, canceled navigation until another active commit, and prerender swaps without a fresh eligible commit. Ordinary link metadata may also admit scripts, as described above.

## Freshness and selection

Each worker tracker owns a fresh Symbol epoch, increasing generation/eligible-observation sequence and whole-view revision. Tokens from another epoch never validate despite matching numeric generations. The tracker retains only latest per-tab fingerprint/provenance/event and blocked IDs; nothing is persisted. Detached views/arrays/events are frozen; unsafe counter exhaustion fails closed.

Selection validates structural IDs, counters, browsing contexts and unique records. The supplied trigger must exactly match the view's token, URL bytes, document and sequence. Native snapshot/event `URL.href` must match independently of relaxed duplicate rules. Identity comes exclusively from the existing compiled duplicate engine and actual incognito metadata. Pinned, pending (any `pendingUrl` property), blocked, malformed and cross-context tabs are excluded; an inconsistent current event excludes its tab entirely.

The greatest observed sequence wins; equal sequence chooses lowest tab ID. Browser timestamps are retained evidence, never a winner clock. An older queued trigger skips as superseded. Passive snapshots can be duplicates but cannot independently win. Anchor ordering is same winner window, then window ID, index, tab ID; it is invariant under input order. Results contain frozen copies and no close list or execution plan.

**005 integration requirement:** capture `tracker.view()` BEFORE starting the existing all-normal-windows snapshot read; check `isViewCurrent(captured)` after the read. Never combine a pre-removal snapshot with a newly captured view. Revalidate event/view and authoritative participant URL/context/location before downstream async work and mutations. Unobserved anchor invalidation also revokes the whole view. This is conservative race detection, not an atomic browser snapshot.

## Verification and browser limits

Unit/integration gates cover eligibility, complete-view winner selection, strict native freshness under relaxed identity, pending/context/pinning, replacement order, deferred initialization, configuration revision invalidation, immutable ownership and redacted failures. Tests were observed failing before implementation. Fresh independent controller verification on `historical-revision`: 640 tests across 18 files, 21 isolated Chromium tests, typecheck, build and package validation passed. The task review found one sparse-qualifier validation defect, corrected with RED/GREEN regressions and approved scoped re-review; the whole-feature review found no remaining issue. See [completion evidence](../../reviews/2026-10-26-navigation-eligibility-completion.md) for commands, results and limits.

`tests/browser/navigation.spec.ts` builds a disposable extension containing the actual registry/tracker/selector and a localhost fixture. Its test-only memory captures native transition/lifecycle/document metadata. Browser assertions cover link/commit, server and immediate client redirects, push/replaceState, no-op state, hash, reload, back/forward, latest matching navigation, real pendingUrl exclusion and actual worker-stop/restart provenance loss. No fabricated event is browser evidence. Delayed script metadata is recorded separately from qualified client redirects.

The bounded prerender probe uses native `Preload` CDP events plus supported speculation rules and a link activation. The native probe returned `Failure / PrerenderingDisabledByDevTools`; activation fell back to an ordinary eligible link commit and no replacement callback was observed. This does not establish activation/replacement coverage; the native trace and empty replacement list are attached. The fixture has no `sessions` permission/API and headless page automation cannot drive trusted browser omnibox/external-app/profile-restore UI. These are capability gaps, not passing restore/external-launch tests. Chrome 120 and current stable release-matrix checks remain later work.

### Disposable-profile manual checks

Use a disposable copy of `dist/` with the same test-only background bundle from `tests/browser/navigation-fixture.ts`, launch headed Chromium with its own empty user-data directory, and inspect `navigationFixture.trace`, `.replacements` and `.state()` in that worker's DevTools. Never use a personal profile or add permissions to the production manifest.

1. Navigate normally, close the fixture tab, then use browser **Reopen closed tab**. Inspect the actual committed type/qualifiers/document/lifecycle and eligibility. A core reload must be suppressed; history/hash and qualified client redirects from an untrusted restored document must not bootstrap trust. Record any unqualified `link` admission as the residual policy risk above.
2. In that disposable profile only, enable **Continue where you left off**, open fixture pages, exit and relaunch the same isolated instance. Inspect actual restored commits and early script updates; do not infer restore completion from `runtime.onStartup`.
3. Paste an HTTP(S) URL into the real browser address bar; record the reported transition and qualifiers. Open a URL from a separate application into that isolated browser instance and record metadata. Eligible types can qualify; `start_page` must be suppressed. The current harness cannot safely target a trusted external-app/omnibox action.
4. With speculation rules available, prerender a local target and activate it via a link. Record native lifecycle and both replacement APIs. Replacement must clear both identities without transferring provenance/rank; subsequent ordinary active commit may qualify. If Chrome refuses prerender, record its native reason rather than manufacturing callbacks.

## Chrome trial roadmap

Load unpacked now to inspect installation/configuration status; no automatic organization runs. The earliest planned controlled placement trial is **005**, once the executor is connected. **006** adds recoverable closure and stale-work protection. **007** adds convenient settings/rule editor and preview; **008** adds pause/protection controls; **009** supplies the full browser regression gate before default activation. **010** remains performance/release readiness. No later task is implemented here.
