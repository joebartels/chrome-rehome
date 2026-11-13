# Get started

ChromeReHome brings newly opened pages into your existing tab organization. When a matching page is already open, the incoming tab can take its place and older duplicates can close. Try it first in a disposable Chrome profile.

## Build and load

1. Follow [Build and develop](../engineering/development.md) to install dependencies, build, and check the package. Browser requirements live in [the manifest](../../manifest.json).
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked** and select the built **dist** folder. Do not select the repository's source folder.
4. Pin ChromeReHome in the Chrome toolbar, then click its icon.

A fresh installation starts **Paused**. Recent tabs work while paused, so you can try switching tabs before enabling automatic grouping and duplicate closure.

## Try one rule

1. In the popup, choose **Open settings**, then **Add grouping rule**.
2. Enter `https://example.com/*` as the pattern and `Example` as the group name.
3. Paste `https://example.com/guide` into **URL to preview**. The preview should name your rule and group.
4. Choose **Save settings** and wait for **Settings saved.** Saving rules does not resume processing.
5. Return to the popup, choose **Resume**, and wait for **Active**. Open a fresh link to `https://example.com/` to try the rule.

Preview uses your draft without opening pages or changing tabs. Actual placement can differ: an existing duplicate's group and window take priority over your grouping rule. See [Rules and preview](rules.md) for examples.

## Protect tabs you need to keep

ChromeReHome cannot detect unsaved edits. Before enabling it, select each important tab and check **Protect this tab** in the popup. Use protection for deliberate duplicates, too. Protection lasts for the session; mark those tabs again after reloading the extension or restarting Chrome.

Choose **Pause** whenever you want to stop automatic grouping and duplicate closure. An action already issued to Chrome may still finish. **Resume** handles future eligible navigation; it does not sweep through tabs opened while paused.

After rebuilding, reload ChromeReHome at `chrome://extensions` and check its displayed version against [the manifest](../../manifest.json). Saved rules and activation remain, but manual protection clears. Pause before reloading if you want time to protect tabs again.

Continue with [Features and behavior](features.md), or use [Troubleshooting](../support/troubleshooting.md) if the popup does not show the status you expect.
