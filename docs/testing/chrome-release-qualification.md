# Chrome release qualification

The opt-in harness under `tests/release/` runs the packaged ChromeReHome extension in disposable browser profiles. Node 24 uses Chrome DevTools Protocol directly and verifies the browser PID and version against the process it launched. Every web fixture comes from an in-process loopback server. ChromeReHome's service worker is discovered by its packaged script path. The harness never attaches a debugger to it.

## Run

Supply the official Chrome for Testing binaries, a preserved 0.1.2 unpacked build, and the strict-packaged 0.1.3 build. Use absolute paths to the directories containing each package manifest. Set `OLD_DIST` to the 0.1.2 directory and `EVIDENCE` to an existing output directory. The harness copies their bytes into temporary directories, records SHA-256 and byte counts for each file, and cleans up after each profile.

### Stable on macOS

Run on an unlocked desktop with macOS Accessibility and synthetic input available to the invoking test process. During the native check, the helper reads the foreground PID, resolves the named tab through Accessibility, confirms that Chrome owns the hit point, and posts a right click there. It invokes the named menu action only when that same browser PID owns the menu item.

```sh
swiftc tests/release/native-macos.swift -o /tmp/chromerehome-native-macos
node tests/release/qualify.mjs "$STABLE_CHROME" "$OLD_DIST" "$PWD/dist" \
  "$EVIDENCE/chrome157-macos-release.json" /tmp/chromerehome-native-macos
```

Set `STABLE_CHROME` to the executable inside the Chrome for Testing app bundle. Chrome's test-only mock keychain flag prevents macOS keychain waits in the isolated process. The browser's host resolution excludes non-fixture domains.

### Chrome 120 on Linux

The container uses official Chrome for Testing `120.0.6099.109` for Linux amd64. Its virtual X11 display has a real window manager, so the harness checks the foreground X11 window and its owning PID independently of Chrome extension APIs. The runtime container has no external network. It mounts the package inputs and harness read-only and writes only the evidence to the designated output directory.

```sh
docker build --platform linux/amd64 -t chromerehome-release-chrome120 tests/release
docker run --rm --platform linux/amd64 --network none \
  --mount "type=bind,src=$PWD/tests/release,dst=/harness,readonly" \
  --mount "type=bind,src=$OLD_DIST,dst=/old,readonly" \
  --mount "type=bind,src=$PWD/dist,dst=/release,readonly" \
  --mount "type=bind,src=$EVIDENCE,dst=/evidence" \
  chromerehome-release-chrome120 sh -ec '
    export DISPLAY=:99
    Xvfb :99 -ac -screen 0 1600x1000x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
    for n in 1 2 3 4 5 6 7 8 9 10; do
      if xdpyinfo >/dev/null 2>&1; then break; fi
      sleep 0.3
    done
    xdpyinfo >/dev/null
    openbox >/tmp/openbox.log 2>&1 &
    exec node /harness/qualify.mjs /opt/chrome-linux64/chrome /old /release \
      /evidence/chrome120-linux-release.json
  '
```

## What the harness exercises

- Fresh install presents the paused status and leaves two identical completed navigations intact and ungrouped. It verifies the config store is empty.
- Schema 3 rules are seeded as a fixture, opened through the production options editor and read without a write. Saving through the editor persists the exact schema 4 shape while preserving pause and rule values.
- Popup protection toggles the selected tab's session record and action badge in both directions. The harness opens the packaged popup document in an inactive extension tab while the fixture page remains selected. That exercises its worker communication and selection checks. The toolbar button is outside this check.
- Ordinary foreground navigation creates and reuses a named group across windows. The harness compares Chrome window/selection state with the OS foreground PID and window title. A trusted Command-click on macOS or Ctrl-click on Linux opens a background duplicate, replaces the older tab in its remote group, and preserves source and destination selections at completion.
- The unpacked update uses an independent profile. It saves a rule through the packaged 0.1.2 editor, swaps the verified 0.1.3 files into the same unpacked path, and uses Chrome's Extensions manager reload API. It then verifies the installed version changed, the ID and enabled installation state stayed the same, and the saved settings survived exactly. This exercises Chrome's unpacked update workflow.
- Stable additionally checks the actual tab-strip context menu for the inactive fixture tab. The checked effects are the target-only session record, action badge and clearing on a second native action, with config and tab layout held constant.

The attention assertions cover the source and destination at the start and completion of each action in the tested desktop session. The floor mac-arm64 binary exited before Chrome DevTools and before extension execution on the macOS 27.0.1 host. The Chrome 120 runtime result comes from the Linux binary.

## 0.1.3 qualification record

| Chrome for Testing binary | Host | Final result |
| --- | --- | --- |
| 120.0.6099.109 | Linux amd64 in an offline OrbStack container with Xvfb and Openbox | 6 of 6 checks passed, including X11 window focus and popup protection fallback. |
| Stable 157.0.8103.50 | macOS 27.0.1 on Apple Silicon | 7 of 7 checks passed, including the real tab-strip menu action and AppKit window focus. |

The Linux and macOS reports are `chrome120-linux-release.json` and `chrome157-macos-release.json`. Every file in the runtime inventory matched the corresponding entry in `ChromeReHome-0.1.3-trial.zip` by byte count and SHA-256.

On the earlier 0.1.3 build, a Chrome 120 Pause wrote `enabled: false` while the worker remained unavailable. A controlled regression test reproduced the underlying timing when a newer storage-change read superseded the verification read. After the fix, a separate Chrome 120 run verified 12 Resume and 12 Pause actions through the same packaged popup, including exact saved settings and worker phase after every action. The before and after evidence is in `chrome120-linux-popup-pre-fix.json` and `chrome120-linux-popup-fixed.json`. The evidence bundle includes `popup-diagnostic.patch`. Apply it to a disposable copy of `qualify.mjs` and run that copy with the same Chrome 120 container and package inputs to repeat this diagnostic.

[Official Chrome for Testing downloads](https://googlechromelabs.github.io/chrome-for-testing/) · [Chrome extension API release notes](https://developer.chrome.com/docs/extensions/whats-new#chrome_150_tab_strip_context_menus)
