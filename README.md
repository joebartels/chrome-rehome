# ChromeReHome

Keep related Chrome tabs together and find your way back to the ones you use.

ChromeReHome groups tabs using rules you choose. When you open a duplicate page, it can move the new tab to the older tab’s place and close the older copy. It keeps your existing window and group arrangement, and the new tab keeps its own browsing history. The toolbar popup also lets you switch between recent tabs across windows.

**Automatic processing starts paused.** Try it in a disposable Chrome profile first. ChromeReHome cannot detect unsaved edits: protect tabs you want to keep. Protection lasts for the session and clears when the extension or browser restarts. Tab changes are not an all-or-nothing operation; some changes may finish before an error stops the rest.

## Get started

Use the Node version declared in [package.json](package.json), then build the extension:

```sh
npm ci
npm run build
npm run check:package
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/`. Pin ChromeReHome to the toolbar, choose **Open settings** in its popup, and add your rules. Choose **Resume** when you are ready.

The [getting started guide](docs/users/getting-started.md) walks through setup and your first trial. Check [manifest.json](manifest.json) for the minimum Chrome version.

## Learn more

- [Features and protections](docs/users/features.md)
- [Writing rules](docs/users/rules.md)
- [Troubleshooting](docs/support/troubleshooting.md) and [privacy](docs/support/privacy.md)
- [Development and testing](docs/engineering/development.md)
- [All documentation](docs/README.md)

Use this repository’s **Issues** tab for bugs, ideas, and completed work. Please remove private URLs and personal details from reports.
