# Releases and delivered builds

Every delivered changeset gets a new extension version, including documentation, tests and configuration changes. This lets someone reloading ChromeReHome identify the build under review. The authoritative requirement is in [AGENTS.md](../../AGENTS.md).

## Version and build identity

Increase the patch component by default; use a minor or major increase when the scope warrants it. Use Chrome-compatible numeric `major.minor.patch` values. Bump once per coherent handoff, and bump again if a changed build is handed off later. Never reuse or decrease a delivered version.

Keep [manifest.json](../../manifest.json), [package.json](../../package.json), and both the root and root-package versions in [package-lock.json](../../package-lock.json) identical. Extension versions identify builds; configuration, protection and journal schema versions describe data contracts and must not change merely to match a release.

After the bump, rebuild and verify the resulting package:

```sh
npm run typecheck
npm test
npm run build
npm run check:package
```

Check that `dist/manifest.json` contains the same version as the source manifests and lockfile. The package checker validates package structure but does not replace this cross-file version check. If distributing a ZIP, create it from that verified `dist/` build and inspect its contents. Keep tests, source, profiles, traces and build metadata out of the distribution. Preserve older versioned artifacts as historical records.

## Qualify the behavior being delivered

Use the [testing guide](../testing/README.md) to select evidence for the changed behavior. Changes to worker lifetime, mutation ordering, permissions, navigation or browser UI require real-browser coverage beyond unit tests. Run release qualification against the declared browser floor and a current target when making compatibility claims. Record gaps rather than treating an unavailable native platform as a pass.

The [release harness](../../tests/release/qualify.mjs) accepts a Chrome executable, previous and candidate package directories, and an evidence destination. It reads both manifests, requires a newer candidate version and checks that the browser meets both declared minimums. It uses isolated profiles and verifies that package copies match the supplied builds by file size and hash. The [Linux container definition](../../tests/release/Dockerfile) supplies a floor browser. Pass the compiled [macOS native helper](../../tests/release/native-macos.swift) on macOS for focus checks and, on browsers with tab-strip context menus, the native menu trial.

The harness uses explicit configuration fixtures for the upgrade and legacy migration checks. Review their expected stored settings when the schema or migration policy changes.

An upgrade trial must exercise both stored settings and activation behavior. Reinstalling into an empty profile does not demonstrate preservation of existing configuration. Reload also clears session protection and recent-tab history, so prepare those user-visible expectations explicitly. Do not erase an unresolved journal to make qualification proceed.

## Record a useful handoff

State the new version, the behavior changed, the checks actually run, and material limitations. Give the loading or reload instruction needed to test the package. Distinguish a local result from a hosted CI result, a focused regression run from a complete suite, and synthetic browser input from native operating-system evidence.

Dated evidence should identify the tested package, runtime, platform and commands, while keeping personal paths and browsing data out of public records. Keep those results in the [archive](../archive/); keep current setup and release guidance here. See [documentation maintenance](../maintaining-docs.md) for deciding which record to update.
