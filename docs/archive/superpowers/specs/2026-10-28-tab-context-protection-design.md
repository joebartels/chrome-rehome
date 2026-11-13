# Right-clicked tab protection

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../../README.md).

User requested a tab-handle context-menu shortcut and explicitly corrected an initial global-Pause interpretation: **protect/unprotect the tab being right-clicked**. This is authorized follow-up008a to completed008, not Task009. Keep delegated implementation and independent reviews, in this checkout/branch. Task008 baseline is historical-revision; production070a9f8 and151-case native verification/test repair595db69 are complete.

## Behavior and choices

Add native **Protect this tab** and **Unprotect this tab** actions in ChromeReHome's tab-strip menu. Affect only Chrome's event-supplied tab, including inactive/background tabs. Never substitute the active tab or expand to highlighted tabs. The extension must not activate, focus, select, move or reload a tab. Global Pause/Resume stays exclusively in the existing popup and is never changed by these actions. Manual/session lifetime, audio/pinned behavior and all-older retention remain008 semantics.

Use two stable, explicit idempotent action IDs, rather than one toggle or checkbox. Chrome has no documented onShown event for refreshing per-target state, so a global checkbox could show another tab's protection and a stale toggle could invert intent. Cost: two entries, normally in Chrome's extension submenu. No optimistic checkmark/badge/success notification; existing popup remains authoritative when opened on that tab.

Add only the **contextMenus** permission; the user-requested capability supersedes008's no-new-permission constraint for008a only. Keep minimum Chrome120, eight dist files, three JS graphs, existing assets/dependencies/schema4/default-off and existing activation/rules. Tab menus are Chrome150+; unsupported registration must fail cleanly while popup/protection/automatic processing continue. No page/action/all-context fallback, new host permission, content script, page inspection or recency implementation.

## API evidence

[Chrome release notes](https://developer.chrome.com/docs/extensions/whats-new#chrome_150_tab_strip_context_menus) document tab-strip contexts from150. [API reference](https://developer.chrome.com/docs/extensions/reference/api/contextMenus) requires contextMenus, documents callback errors and singular optional tab in onClicked, and lists no onShown. [Chrome-team announcement](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/RReE8dtY4Ok/m/hOQaYDNYAwAJ) says the event tab is the specific right-clicked tab with multiselection; the summary release note disagrees. Capture actual native callback metadata instead of inferring behavior. Ignore pageUrl entirely. Record actual tested browser version; bundled runtime is156.0.8078.4, not a claim of155 or120 execution.

## Trusted target primitive

Existing popup/options wire commands must retain selected-tab/document receipts and exact protocol/sender validation. Add no runtime RPC or UI-controlled selection-policy switch.

Add distinct by-ID target read/observation capability through shared private target verification, and a worker-only service entry `setNativeTabProtected(target: TargetHint, protected: boolean): Promise<ControlReply>`. Chrome's menu listener is its trusted caller. Validate bounded IDs/window/context and copy event metadata immediately; absent, array-shaped or malformed targets fail closed. A native hint proves provenance, not current existence/document currency.

Accept native intent and install its generation/pending/protection-intent barrier **synchronously before any await**, with a by-ID observation already spanning initialization, queue waiting, reads, persistence and final verification. Use the existing command writer and protection transaction/failure domains, without copying its write core. Native commands derive a document receipt internally; popup commands still match the UI receipt. By-ID verification uses actual tabs.get and outermost document rereads, rejecting pending navigation, changed document/window/privacy, close/replacement/detach/attach, stale callbacks and postwrite uncertainty. Selection changes alone do not invalidate native commands; they still invalidate popup commands. Dispose temporary observations on every path.

Cold-worker menu clicks must work after normal store/recovery readiness, not silently fail just because the worker woke. Any readiness wait occurs **outside** the control writer and keeps the synchronous admission barrier alive; a later explicit Pause must remain responsive even while readiness is held. Never wait for placement/native-operation settlement inside that writer. Preserve failure gates, cancellation/version rules, startup pruning, removal credits,1000-entry bound, privacy separation and no retry/replay/reset. A stale queued Unprotect cannot undo a newer Protect/Pause. Menu commands never enable global processing.

## Menu lifecycle

Register the native click listener synchronously each worker evaluation. Stable IDs survive ordinary worker suspension/revival. Reconcile owned registrations on install/update/startup without duplicate IDs; serialize lifecycle overlap and partial-failure cleanup. Consume callback lastError and synchronous unsupported-context failures. Menu capability failure is not protection-store failure and cannot disable popup or processing. Gate actions with genuine readiness; never infer readiness from saved enabled. Bind explicit action ID to requested true/false, not current state at click.

## Verification and limits

Behavior-first RED/GREEN, per-task review, final scope review, typecheck, full portable suite, build/strict package checks and relevant/full browser tests. Prove inactive target reads and popup selection checks separately; native observation spans every await; close/replace/same-URL reload/move/private mismatch; queued Protect/Unprotect/Protect; cleanup credits; new Pause during held startup readiness; unavailable/blocked recovery; malformed metadata; duplicate lifecycle triggers; partial menu creation; unsupported old Chrome; and unchanged global flag/rules.

Actual native owned-profile interaction must show both menu entries, invoke Protect/Unprotect on an inactive tab, capture real event target metadata, verify only that tab changes and extension issues no activation/focus/move, then repeat multiselection and worker wake/reload. CUA or a scoped native helper may operate only the test-owned browser/PID. No personal profile or lock/security/idle-setting changes. Portable callback simulation alone is not native menu proof; record capability gaps honestly. Chromium156 evidence does not establish Chrome120/current-stable release coverage.

No Task009 or011 implementation. Complete008a, explain Chrome testing, then pause.
