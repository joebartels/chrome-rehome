# Engineering principles

ChromeReHome can move and close a user's tabs. Correctness therefore includes declining work when evidence is missing, preserving deliberate organization, and describing partial effects honestly. These principles explain the choices behind the [architecture](architecture.md).

## Preserve user intent

Keep the winning tab instead of recreating it. Existing duplicate placement takes priority over a grouping rule, and foreground behavior follows the observed opening intent. Do not infer that a matching URL makes a tab disposable: pinning, audio, manual protection, document identity and navigation provenance all matter.

Fresh configuration is disabled. Explicit user control, valid settings and verified runtime readiness are separate requirements for automatic processing. Pause must remain responsive even while a native operation is unresolved. Protection is an explicit user action; the extension does not inspect forms or infer unsaved work.

## Make uncertainty restrictive

A fresh read can disprove an assumption; it cannot turn unrelated work into an authorized continuation. Capture the operation's intent, then recheck its currency across asynchronous boundaries. Do not silently replace a stale plan with whichever state happens to be visible later.

Prefer skipping an operation to guessing at identity, truncating its participants or broadening its matching policy. When a failure follows a mutation, report the known partial result rather than claiming an all-or-nothing outcome. Retrying, compensating or timing out a browser call requires more than an error message: the original side effect may still have occurred. The automatic execution path consequently waits for settlement and does not replay interrupted work.

## Keep decisions pure and effects explicit

Rule compilers and planners operate on supplied values. They do not query Chrome, write storage or depend on UI state. Executors receive narrow capabilities so tests can control real failure boundaries without giving decision code broad browser access.

Keep orchestration in the worker and UI state in the UI. Reuse the production validators for previews instead of implementing a friendlier but inconsistent approximation. Treat configuration and protocol inputs as untrusted: validate the complete value, preserve unsupported stored data, and publish copied immutable state. See the [schema](../../src/config/schema.ts) and [control protocol](../../src/controls/protocol.ts) for authoritative contracts.

## Minimize retained browsing data

URLs and duplicate identity keys can contain credentials, account details or private application state. Compare them in memory; do not persist or log them as diagnostics. User-authored settings necessarily contain their configured patterns, while session features retain only the identities they need. Preview inputs stay in the options page's memory.

Normal and incognito context must be explicit in identity and targeting decisions. A shared worker or storage area is not permission to mix those contexts. Keep permissions tied to a concrete product capability and review changes to both the manifest and package policy. The [Chrome guidance](chrome-extensions.md) explains the platform implications.

## Verify behavior at the boundary that matters

Pure tests establish matching and planning semantics. Controlled adapters establish ordering, invalidation and settlement behavior. Real browsers establish navigation, worker restart, tab movement and UI behavior. Native focus and external-app claims need their own platform evidence. A passing lower layer cannot stand in for a higher one.

Test failures should be observable consequences, including forbidden side effects after delayed work. Avoid tests that merely repeat the implementation's steps. Use stable completion signals and deliberate deferred calls for races; arbitrary delays cannot prove that work is finished. See [testing](../testing/README.md).

## Keep maintenance proportionate

Prefer a small explicit boundary over a general framework built for hypothetical features. Bound retained state and input size. Measure performance with correct outcomes and the intended workload before weakening verification or adding caching. Keep build and package rules executable so architecture cannot drift unnoticed.

Document intent, invariants and limitations alongside the affected work. Link to source for changing schemas and signatures, and keep dated test results as historical evidence. Follow [documentation maintenance](../maintaining-docs.md) and [release discipline](releases.md) for every handoff.
