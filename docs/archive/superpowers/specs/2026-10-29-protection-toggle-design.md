# Single tab-protection toggle and toolbar lock

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](../../README.md).

The user chose **Single toggle + toolbar lock** on 2026-10-29 after reviewing Chrome API limits. This refines completed Task008a; Task009 remains paused. The user already authorized delegated implementation and independent review. This small follow-up uses that authorization without another approval gate.

## Intent and approach

Replace the confusing simultaneous Protect/Unprotect entries with one neutral **Toggle tab protection** action. Resolve its desired value from verified session protection state inside the existing serialized control writer, acting only on the actual native right-clicked tab. The selected tab shows **🔒** on ChromeReHome's toolbar action when manually protected. Tooltip: **ChromeReHome — tab protected**; otherwise clear badge and use **ChromeReHome**. Pinning the extension exposes this indicator.

Alternatives considered: the old explicit action pair (clear intent but clutter), a state-dependent native menu label (Chrome has no before-opening target event), and page title/favicon injection (requires page access and unreliable page coordination). The user explicitly selected the supported neutral toggle and per-tab toolbar approach. Background tab handles get no custom marker.

## Constraints

Keep Chrome120 minimum with graceful tab-menu fallback before Chrome150; exactly the existing five permissions, eight packaged files and three JS graphs. No new dependencies, assets, page access, content scripts, wire commands, settings schema, polling, keepalives, or persistent presentation state. Global Pause remains in popup; manual protection is session-only. Preserve selected-popup targeting and native background/multiselection targeting, synchronous admission/observation, recovery readiness outside the writer, generation/document/privacy fences, newer Pause responsiveness, fail-closed storage, and cleanup. Do not implement Task009 or011.

The native toggle shares the protection transaction; it must not read outside the writer and then call an explicit setter. Newer conflicting intent can cancel an earlier toggle under the existing conservative authority model; never flip stale state or replay a cancelled click. Migrate only owned legacy menu IDs, never remove unrelated extension menus.

Toolbar presentation is read-only. It consumes a verified in-memory snapshot through a narrow worker-only accessor, never automation capture or selected-popup RPC. Unknown/pending/unavailable state must not assert protection. Use explicit tabId for every action write; never a global badge. Reconcile startup, control mutations, activation/new tabs, close/replacement and worker restart, with bounded/coalesced work and stale-render correction. Cross-window/incognito states cannot leak. API failures must not block controls, mutate authority, close/move/focus tabs or trigger replacement replay. A failed display must be eligible to recover on subsequent refresh.

## Validation

Portable regression tests for atomic native toggle, invalid/stale/cold input, newer intent, failed writes, legacy menu migration, badge state and delayed/out-of-order updates, failure isolation and bounded rendering. Real packaged Chrome API readback tests for target-only toggle and badges across windows/multiselection, worker restart and extension reload where supported. These synthetic callback tests do not establish native menu visual interaction. Existing user manual native targeting proof remains valid; emoji appearance is a remaining manual visual check if no safely owned UI bridge is available.

Prior native focus gate diagnostics remain documented: prior full155 run153 passed plus focused original two later passed, not one full green invocation and not a focus reliability fix. Never weaken native foreground assertions or repeat unsafe UI binding attempts. Retain default-off and all previous replacement semantics. Deliver local build/testing instructions and pause before Task009.
