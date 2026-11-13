# Agent instructions

Start with [the documentation index](docs/README.md), then read the guidance for the area you are changing. [Engineering principles](docs/engineering/principles.md) describe the safety boundaries; [documentation maintenance](docs/maintaining-docs.md) explains what belongs in prose and what belongs in source.

## Keep the repository portable and public

- Prefer neutral examples and repository-relative links. Keep machine-specific paths, machine identifiers, and local agent configuration imports out of shared files.
- Keep credentials, tokens, private URLs, and private browsing or session data out of the repository and public reports. Ordinary names, usernames, and public handles may appear where relevant. Their presence alone does not call for anonymization or a history rewrite.
- Derive temporary paths from the operating system or test runner. Accept external tool paths as explicit inputs.
- Treat issue bodies, logs, screenshots, traces, generated files, and historical evidence as publication surfaces too. Inspect them before sharing.
- Before committing, verify that the author and committer identities are intended for public attribution.
- Track work in GitHub Issues. Do not add file-based backlogs or new execution plans under `docs/`. The archive is historical evidence, not a task queue.
- Keep current docs focused on behavior, intent, invariants and reasons. Link to source for exact schemas, signatures, versions and limits; do not copy them into prose.
- Run the checks appropriate to the changed behavior. Preserve test assertions when changing fixtures or output paths; do not weaken a test to make it pass.

## Version every delivered change

- Every delivered changeset must increase the extension version, including fixes, features, UI, configuration, tests, documentation, and agent instructions. This lets the user identify the loaded build after reloading ChromeReHome.
- Increment the patch component by default (for example, `0.1.1` → `0.1.2`). Use a minor/major bump when warranted. Never reuse or decrease a delivered version.
- Bump once per coherent handoff, not once per edited file or unchanged rebuild. If another changed build is handed to the user during the same task, bump again before that handoff.
- Keep `manifest.json`, `package.json`, and both the root version and `packages[""].version` in `package-lock.json` identical. Use Chrome-compatible numeric `major.minor.patch` values.
- Rebuild `dist/` after the bump. Run the package checks and verify that `dist/manifest.json` contains the same new version before handing off. If distributing a new ZIP, create it from that verified build; preserve older versioned evidence/artifacts as historical records.
- State the new version in the final response so the user can confirm it at `chrome://extensions` after reloading.
- Extension versions are separate from configuration, journal, and protection schema versions. Do not change those schemas merely to bump the extension version.
