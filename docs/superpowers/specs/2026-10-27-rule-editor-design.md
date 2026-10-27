# Rule editor and matching preview design

Date: 2026-10-27. Task 007. Base `historical-revision`; branch `rule-editor-preview`.

## Intent and authorization

Provide accessible ordered grouping and duplicate-policy editing, with add/edit/reorder/disable/delete, inline validation, explicit whole-document save, and draft preview using the actual runtime compilers. The user authorized delegated implementation and independent review without new approval gates, working in place, then pausing before 008. Choices below are implementation decisions within that scope.

## Constraints and non-goals

Chrome minimum 120; Node 24.x; strict TypeScript/native DOM; no new dependencies, frameworks, permissions, host permissions or network calls. Preserve exactly five built files and existing 006/006a runtime/native-launch behavior. Every shell command starts with `rtk`; browser tests use isolated temporary Chromium profiles, never personal Chrome.

Preserve existing global `enabled`, including default false. No global activation/pause UI: Task 008 owns that scope. No backup/import/export UI, protection policy, page inspection, tab mutation from preview, telemetry, or Task 009/010 work. Pasted preview URLs remain memory-only and never enter storage, diagnostics, logs, links or requests.

## Approaches

Removing disabled rows loses saved rules. A separate enablement map needs persistent IDs and synchronization on reorder/delete. Choose schema 4 with explicit per-rule enabled booleans: self-contained settings, clear migration, same compiler behavior in preview and runtime. This is a builder decision, not a newly elicited preference.

Choose native labeled controls and move buttons, with a pure draft/preview module, async controller and DOM view. Reuse the existing repository, avoiding background messaging, drag-and-drop and framework complexity.

## Existing integration and schema

Current parsing migrates v1–v3 in memory to v3; both compilers strictly validate and freeze rules. Background placement already compiles both lists. Repository subscriptions and generations suppress stale reads, but subscriber publications cannot automatically replace a dirty editor draft.

Canonical Config becomes schemaVersion 4, with the same four top-level keys. Every canonical rule requires own boolean `enabled` plus its exact old fields. Config's rule types refine domain rule types to required enabled. Reject missing/undefined/nonboolean flags and unknown keys.

Keep exact legacy v1–v3 shapes strict: legacy rules containing enabled remain invalid. Migrate accepted old rules to enabled true in memory, preserving global enabled, order, strings and normalization flags. Loads never write; explicit save writes canonical v4. Update future-version fixtures/examples from 4 to 99.

For direct compiler compatibility, `GroupingRule` and `DuplicateRule` gain `enabled?: boolean`. Compilers accept either exact legacy keys or exact keys plus boolean enabled, reject unknown fields/explicit undefined, and preserve field presence/absence in copied public `.rules`. Schema additionally enforces version-specific keys before compilation.

Validate, bound, copy and freeze all entries including disabled ones. Group matching skips enabled false while preserving all entries/order. Duplicate canonical-origin uniqueness applies across all entries, including disabled, while only enabled entries enter the active lookup. Disabling a duplicate policy restores conservative duplicate matching; it does not disable duplicate detection. Invalid disabled rules invalidate the whole document.

Retain grouping `match`, duplicate `identify` and `equivalent`. Add duplicate ready-compilation `match(candidate: DuplicateCandidate): DuplicateRule | undefined`, using the same candidate parser/context validation and active map as identify; return the compiled rule object. This supports policy reporting without a second origin matcher or opaque identity display. No normalization or identity-format changes.

## Editor and preview

Keep installed/status headings and truthful saved activation text; remove unavailable-editor and initial “Tabs are never closed” copy. Explain that saves preserve activation and previews evaluate draft rules even when automation is disabled.

Grouping rows: Enabled, Pattern, Group name, Move up/down, Delete. Duplicate rows: Enabled, Origin, Ignored query names (one exact decoded name per line), three existing normalization checkboxes, Move up/down, Delete. Each section has Add. New rows are enabled, required strings empty, duplicate flags false. Empty names textarea becomes []; otherwise split line breaks without trimming, dropping blanks or deduplicating. Duplicate ordering is saved/display order, with no precedence because canonical origins are unique; explain this.

Respect existing 100 rules/list, 2048 pattern/origin characters, 80 group characters, and 100 distinct names of 256 characters. Native maxLength affordances supplement domain validation; textarea maxLength 25699. Disable Add at limit and boundary move buttons. No silent coercion/truncation in the model.

Use transient row IDs only for DOM labels/keyed reuse; never serialize them. Keep focused input nodes during typing and update errors/preview without rebuilding the form. Structural changes restore logical focus to the moved action or nearest surviving row/Add after deletion. Use fieldsets/legends, explicit bounded row-number labels, aria-describedby/invalid, textContent, focus-visible styles, contrast and narrow wrapping. Compiler row errors may describe the whole row when no field is identified. Compile singleton rows for inline errors and complete lists for cross-row errors; never preview a partial invalid document.

Preview inputs: `URL to preview`, optional `Compare with URL`; no persistence, autocomplete or spellcheck. Keep their text across draft edits and storage errors. Show first active grouping rule's one-based position and configured group title, no match, or invalid/unsupported input. A configured title is not an actual resolved Chrome group; no tab/group query occurs. Duplicate outputs show active policy index/origin or conservative comparison. Compare using actual equivalent and display only `Equivalent duplicate URLs` or `Distinct URLs`, never serialized identities. State that comparison assumes the same normal browsing context. Preserve each engine's existing URL acceptance rules independently, including credential differences. Same group does not imply same duplicate identity.

## State, saving and conflicts

Controller owns separate base/saved config, mutable draft, latest observed state and operation/error state. Compare canonical values, not object identity or revision alone. View owns preview text and transient row IDs. No autosave.

Subscribe before load. A clean editor adopts new valid saved settings. A dirty editor preserves all fields when a different config arrives and shows conflict; equal canonical values do not conflict. `Reload saved settings` explicitly discards only after a successful fresh read. Unavailable/invalid/future external settings preserve any existing draft and block unsafe overwrite. Initial unavailable state shows actionable Reload with no writable editor.

Save validates, enters busy state, and blocks edits/duplicate actions until settlement. Refresh storage immediately before writing; compare with draft base and any newer observed state. Different/invalid/future data prevents write; read errors preserve draft for retry. A matching base permits exactly one existing repository save of the whole document, preserving global enabled. Echoed old-base/pending-candidate events do not erase the draft or create false conflicts during saving.

Guard every asynchronous continuation with controller request generation/disposal checks, separately from repository generations. Older initial/reload/save results cannot replace newer edited or externally loaded state. Explicit reload freezes edits while pending; failure restores the intact draft. Disposal detaches once and ignores all later results.

Write rejection must keep draft/base, release busy, report failure, and permit valid Save retry despite repository unavailable publication. Retry performs a new preflight. After write success, freshly read to verify the current document before `Settings saved.` A different result becomes a conflict retaining the draft. Verification-read failure reports that writing completed but current settings could not be verified; retain the draft and remember the written candidate as retry baseline so retry can recover without a false conflict. Do not expose raw exception details.

Atomic means a single validated whole-document write, not CAS. Chrome storage has no cross-page transactional compare-and-swap. Preflight, subscriptions and verification detect observable conflicts, but a write between preflight and our write can still race; do not promise complete concurrent-write exclusion or add a background writer service in 007.

## Verification and delivery

Two reviewable tasks: schema/domain/model; controller/UI/browser integration. Cover legacy strictness/migration, disabled validation and runtime exclusion, ordering, preview equivalence, failure retry, stale async/disposal, two-page conflicts, focus/keyboard and unsafe strings. Browser tests must prove a saved disabled group rule affects actual background grouping, not merely preview. Preserve old source bytes until explicit save; preview cannot change storage or tabs/groups. Use test-only API failure injection for real-page retry coverage, never production failure hooks.

Run typecheck, full unit/integration suite, build/package checks and native browser suite. Keep existing external-app checks and exactly five artifacts/unchanged permissions. Root owns independent reviews, screenshot QA, commits and Task 007 ledger completion, then pauses before 008.
