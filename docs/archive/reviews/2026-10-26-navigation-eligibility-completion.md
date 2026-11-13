# Task 004 complete — navigation eligibility and winner selection

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../README.md).

Completed locally on 2026-10-26. Branch `navigation-eligibility-winners`, feature base `historical-revision`, implementation `historical-revision`, correction `historical-revision`. Paused before Task 005; no merge, push or publication.

## Result

The navigation tracker now validates main-frame lifecycle/transition metadata, rejects known reload/restore/startup types and gates same-document updates and qualified client redirects using document provenance from the current worker. Every distinct main-frame observation revokes old work synchronously. Worker-local Symbol epochs, monotone generations and detached view revisions prevent stale numeric tokens from reviving; both tab replacement APIs clear identities and provenance.

Pure `selectCandidates` uses actual browser snapshots and the existing duplicate identity compiler. It independently checks native URL freshness, excludes pending/blocked/pinned/context-mismatched participants, selects the latest observed eligible navigation and chooses deterministic anchors. Results are immutable observations with no movement/closure authority. Future callers must capture a view before reading Chrome state, check its revision afterward and revalidate around asynchronous work.

Production `consume` remains a no-op. Existing config/schema, rule engines, grouping/placement primitives, browser adapters, manifest and dependency inputs are unchanged. No automatic organization, closing, settings feature or Tasks005–010 implementation was enabled.

## Can I try it in Chrome now?

**You can install it now to inspect status, but Task004 does not yet perform automatic grouping or duplicate replacement.**

1. Open `chrome://extensions` in Chrome and enable Developer mode.
2. Choose **Load unpacked** and select `<repository>/dist`.
3. Open the extension's **Details → Extension options** to see installation/configuration status. There is no toolbar popup or rule editor yet.

The supplied ZIP contains the same five-file build. Extract it to a folder and load that folder if preferred. Loading the source repository root does not work: Chrome needs the built `dist` folder.

| Completed milestone | Planned hands-on capability |
| --- | --- |
| Now, through004 | Installation/status only; automated tests exercise the primitives in disposable profiles |
| **005: Replacement planning and placement** | Earliest controlled grouping/placement trial once its executor is connected; configuration will initially be manual, with no duplicate closure |
| **006: Recoverable closure** | Controlled duplicate-replacement trial with revalidation/recovery; still manual configuration until settings exist |
| **007: Rule editor and preview** | Convenient configuration and matching preview in the extension; the natural milestone for a hands-on configured trial when005/006 are also complete |
| **008 +009** | Pause/protection controls and the full browser regression gate before default automatic activation |
| **010** | Performance and release readiness |

Those are planned integration milestones, not claims about unimplemented functionality. This delivery completes only004. Later activation must explicitly account for the metadata residual and browser checks below.

## Verification

Independent controller verification on final code `historical-revision`:

| Check | Observed result |
| --- | --- |
| Node24 typecheck | Passed; no diagnostics |
| Vitest | **640 tests across18 files passed** (1.65s) |
| Build and package validation | Passed; exactly5 distribution files |
| Isolated Chromium suite | **21 passed** (13.4s):9 foundation,8 group-placement,4 navigation |
| Independent task review | One malformed-qualifier finding; fixed in historical-revision |
| Scoped correction review | Finding addressed; no new breakage |
| Independent whole-feature review | Approved for inactive004; no remaining findings |

The original implementation ran638 tests and21 browser cases before review. The correction added two tracker regressions: RED2 failed/53 passed, GREEN55 passed. It densifies qualifier arrays before validation, ensuring sparse holes cannot establish eligibility/provenance. Final controller full verification includes that correction. Source/build inputs did not change after the verified revision; later completion commits contain documentation only.

Use Node24 in the repository:

```sh
cd <repository>
npm run typecheck
npm test
npm run build
npm run check:package
npm run test:browser
```

Delivery used cached Node24 `node` with the TypeScript/Vitest/build/check scripts directly. Browser command used `PLAYWRIGHT_BROWSERS_PATH=$TEMP_DIR/chromerehome-playwright`, cleared FORCE_COLOR/NO_COLOR and launched the pinned Playwright CLI with scoped process/local-server permission. Normal test setup may instead install the pinned browser using `npx playwright install chromium`. All profiles and local HTTP pages are disposable; the user's Chrome settings/profile were untouched.

Actual Chromium **156.0.8078.4** traces cover ordinary commits, final server and immediate qualified client redirects, push/replaceState, hash and no-op updates, reload suppression, back/forward, latest matching callback selection, pendingUrl exclusion and actual worker-stop/restart provenance loss. Unit/integration cases cover controlled initialization/races, replacement callback orders, malformed inputs, exact trigger/view ownership, ties and immutable results. No fixture or production test endpoint is packaged.

## Limits retained explicitly

**Chrome can report a script-triggered commit as an ordinary unqualified link. That event can qualify under this policy, including after worker restart.** Browser tests observed and asserted this outcome. Transition metadata is not proof of human intent or universal restored-page-script rejection. Known reload/startup types and untrusted same-document/qualified client redirects are suppressed; later activation needs a deliberate product decision about the residual.

The native prerender probe returned `PrerenderingDisabledByDevTools`, fell back to an ordinary navigation and emitted no replacement event. This is capability evidence, not verified prerender activation. Actual session restore/reopen, trusted external-application/omnibox actions, native prerender activation, real incognito eligibility and Chrome120/current-stable release compatibility remain unverified browser contexts. Disposable-profile manual steps are in Task004. Hosted CI and performance budgets remain later work.

Cold SPA/hash activity, ambiguous external launches reported as start_page, canceled navigation and prerender swaps without a fresh eligible commit can be missed. Whole-view invalidation is conservative and unrelated navigation can revoke a view. Selection is not an atomic browser snapshot; future executors must revalidate current document/URL/context/location and apply replacement protections before closure.

## Rulings I made

1. Admit explicit active commits; reject reload/start_page; require current-worker provenance for SPA/hash and qualified client redirects; allow eligible back/forward. This avoids known restore/reload winners without startup timers. It misses some external/cold SPA events and can admit unqualified script links; revising it requires new provenance evidence and tests.
2. Use worker-local Symbol epochs, whole-view revisions, native URL freshness and blocked pending/replaced tabs. This avoids token reuse and relaxed-identity masking. Canceled/prerender paths can stay suppressed, unrelated navigation can revoke a view and later recovery must not persist/compare epochs across workers.
3. Rank by observed sequence/tab-ID tie; choose same-window/window/index/tab-ID anchors; exclude pinned participants. This avoids clock/focus inference. Later anchor/pinned policy changes require planner/tests revision; no selection authorizes closure.

## Review scope dispositions

All five whole-feature declined-to-judge lines follow existing explicit boundaries: execution/recovery/controls belong to005–008; universal human-intent/restoration detection is not claimed and its residual gates activation; unreproduced browser contexts stay manual rather than inferred from synthetic tests; release/CI/performance belong to later validation; post-selection mutation races require downstream authoritative checks. No unverified behavior is labeled complete by passing pure tests.

[Original task review](2026-10-26-navigation-eligibility-task-review.md) · [Correction review](2026-10-26-navigation-eligibility-correction-review.md) · [Whole-feature review](2026-10-26-navigation-eligibility-review.md)
