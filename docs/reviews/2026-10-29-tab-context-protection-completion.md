# 008a — right-clicked tab protection

Status: source implementation and independent task/final source reviews approved; final native acceptance evidence is in progress. Task009 has not started.

The two native tab-handle actions protect or unprotect only the browser-supplied right-clicked tab. Background/highlighted targets use by-ID document verification; popup protection keeps selected-tab receipts. All commands share the worker-owned writer, session registry and failure domains. Native intent is fenced/observed before awaits; cold readiness waits outside the writer so a newer Pause stays responsive. Global master enablement/rules are never changed by these menu actions.

Only contextMenus is added: exact five permissions, eight package files/three JS graphs, no new assets/dependencies/host permissions/content scripts/schema/default activation. Chrome150+ supports native tab contexts; the existing120 floor retains popup fallback. The two stable explicit menu actions avoid stale toggle inversion and a global checkbox misrepresenting different tabs. Cost: two submenu entries.

## Verification and evidence

Task1 independent review approved the trusted target/writer primitive. Task2 and final whole-feature source reviews approved menu integration with no actionable defects. Root independently verified **1,330 portable tests/43 files**, typecheck, build and strict package checks. All eight output hashes match the author's final build. Four real-API boundary browser cases pass in both the scoped run and full run. Those four cases deliberately supply callback metadata and are not native menu-click proof. The initial locked-host broad run passed124/126 with two audible preconditions failing on the Task1 baseline too;29 foreground/native cases were excluded. The unlocked full run recorded **153/155 passing**, zero skips/retries, with both audio preconditions now passing. Two foreground worker-termination fixture cases did not reach their activate gates: actual admission attention reported no focused normal window, so the unchanged planner correctly chose preserve and the operations completed without activation. The underlying native-focus transition is unproven. The fixture imports neither the new control service nor production menu/index; relevant fixture/planner/executor sources are unchanged. See [read-only diagnosis](2026-10-29-native-foreground-gate-diagnosis.md). Native tab-menu proof and focused validation of these two cases remain open; this is not a green full suite.

The standard app-identity UI bridge selected unrelated pre-existing TestingPID57216 rather than owned trial93685; no click was made. An existing test helper cloned the vendor browser with a unique bundle identity, but the bridge's unique-app getApp call stalled785.8s despite a10s timeout. It was interrupted before AX state or input. Owned trialPID98709, temporary profile and cloned app were closed/removed; the unrelated process remained untouched. No native menu callback or screenshot was obtained. Root requested a coordinated user manual native check after all foreground ownership was released. The trial uses temporary profiles only. Actual tested version will be recorded; no Chrome120/current-stable release-matrix claim is implied.

## Chrome trial

1. Reload ChromeReHome in chrome://extensions after building/loading the repository dist. Existing settings/global activation remain; protect important tabs again after reload because protection is session-only.
2. Pause automation in the popup for stationary testing. Load two distinct HTTP(S) tabs A/B; leave A active and right-click B → ChromeReHome → Protect this tab.
3. Inspect the popup on B and A: only B should be protected. Right-click B → Unprotect this tab and verify B clears. These menu actions do not enable/resume global processing.
4. Repeat with both A/B highlighted, right-clicking B: only B changes. Then close popup/worker DevTools, wait for worker inactivity, and repeat the first menu click. Reload the extension and repeat; the new session begins unprotected.

## Scope and decisions

Manual protection requires users to explicitly protect unsaved edits, retains all older duplicates when any older duplicate is protected/audible, and ends on extension/browser restart. Those inherited008 decisions are unchanged. Native menu actions are explicit rather than a per-target checkbox because Chrome exposes no documented onShown hook; two entries are the tradeoff. Chrome120 remains supported through popup fallback, so pre150 users have no tab-handle shortcut. Task011 recent-tabs list remains backlog only; no Task009 work begins here.

## Current trial package

`outputs/ChromeReHome-tab-menu-trial.zip` contains the exact eight checked dist files, SHA-256 `7b4514ae829ac8d70f3e43fc822cfe23409cb59dd7396b1e5045589ad5843130`. ZIP CRC, entry count and raw byte identity were verified. This is a concrete trial artifact with the acceptance gaps above, not a claim of full native verification. The completed008 base trial ZIP remains separate.
