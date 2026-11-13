# Development

Use the Node version declared in [package.json](../../package.json), with npm and the committed lockfile. The supported Chrome floor is declared in [manifest.json](../../manifest.json). The application uses TypeScript and native DOM views; the [build script](../../scripts/build.mjs) bundles the worker, options page and popup independently.

## Set up and check a build

From the repository root:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run check:package
```

The build replaces `dist/`, so do not keep manual edits there. It stores dependency metadata in `.build/`, outside the loadable extension. Package verification checks the manifest, files, code loading and dependency boundaries. Passing TypeScript alone does not establish that a package is suitable to load.

To load it, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/`. Use a disposable browser profile for mutation trials. Rebuild and reload the extension after edits; an already loaded extension does not automatically use new bundle contents. Confirm the version shown by Chrome matches the built manifest.

Open **Details → Extension options** to edit or preview rules. Pin the toolbar action to use Pause, Resume, protection and recent tabs. Fresh configuration is paused. Rule preview evaluates in page memory without navigating or changing tabs, so it is a useful first check before enabling automatic work.

## Choose the owning layer

Read [architecture](architecture.md) and [principles](principles.md) before changing runtime behavior. Start from the responsible contract: matching belongs in rules, selection in planning, Chrome translation in browser adapters, and admission or lifecycle coordination in the worker. Keep UI drafts and rendering independent of execution authority.

When changing stored configuration, inspect both the [schema](../../src/config/schema.ts) and [repository](../../src/config/repository.ts). Loads preserve unsupported data and migrations do not write until an explicit save. Configuration, journal and protection schemas have independent purposes; an extension version bump does not require changing them.

For asynchronous changes, identify what invalidates the work while each await is pending, who owns settlement, and what state survives worker loss. Add regression coverage at that boundary rather than relying only on a successful-path test.

## Run browser checks

Install the browser used by the test harness, then run against a fresh build:

```sh
npx playwright install chromium
npm run test:browser
```

Linux hosts may need Playwright's browser dependencies installed as well. Headed tests require a usable display; native cases have additional platform requirements. See [testing](../testing/README.md) for project selection, evidence and debugging. The tests own temporary profiles; do not point them at your daily profile.

## Prepare a handoff

Run the checks appropriate to the change and record what was actually exercised. Update user-facing guidance when behavior changes and keep engineering explanations aligned with the affected boundaries. Follow [documentation maintenance](../maintaining-docs.md) and [releases](releases.md), including the version increase required for every delivered changeset.
