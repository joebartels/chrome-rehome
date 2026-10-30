# Agent instructions


## Version every delivered change

- Every delivered changeset must increase the extension version, including fixes, features, UI, configuration, tests, documentation, and agent instructions. This lets the user identify the loaded build after reloading ChromeReHome.
- Increment the patch component by default (for example, `0.1.1` → `0.1.2`). Use a minor/major bump when warranted. Never reuse or decrease a delivered version.
- Bump once per coherent handoff, not once per edited file or unchanged rebuild. If another changed build is handed to the user during the same task, bump again before that handoff.
- Keep `manifest.json`, `package.json`, and both the root version and `packages[""].version` in `package-lock.json` identical. Use Chrome-compatible numeric `major.minor.patch` values.
- Rebuild `dist/` after the bump. Run the package checks and verify that `dist/manifest.json` contains the same new version before handing off. If distributing a new ZIP, create it from that verified build; preserve older versioned evidence/artifacts as historical records.
- State the new version in the final response so the user can confirm it at `chrome://extensions` after reloading.
- Extension versions are separate from configuration, journal, and protection schema versions. Do not change those schemas merely to bump the extension version.
