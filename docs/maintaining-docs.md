# Keep documentation useful

Write for the person trying to use, change, or debug the extension. Start with what they need to do or understand. Explain a constraint when knowing the reason helps them make a good decision.

## Give each fact one home

| Information | Where it belongs |
| --- | --- |
| Installation and a short introduction | Root README |
| User behavior and practical limitations | User and support guides |
| Design intent, ownership, safety rules, and tradeoffs | Engineering guides |
| Exact types, schemas, signatures, limits, and supported versions | Source, tests, and package metadata |
| Commands and test configuration | Package scripts and runner configuration; guides show only useful entry commands |
| Planned work, acceptance criteria, and completion | GitHub Issues |
| Results for a particular build or investigation | Dated evidence, with its scope and limitations |

Link to the file that owns a detail instead of copying its contents. Prefer file links over line numbers, which drift. A small invented example is useful when it explains how to use a feature; a copy of production code usually creates another thing to maintain.

## Review docs with the change

Ask whether a user action, safety promise, design boundary, or supported workflow changed. Update the relevant guide if it did. A renamed private helper or a new test should rarely need a prose edit.

Run `npm run check:docs` to check local Markdown file and heading links. The check skips external URLs. Keep the README short and use the [index](README.md) to help readers find details. Summarize information briefly and link to its home.

Separate measurements from advice. A successful run describes the tested build and environment; it does not certify every later version. Preserve failures and verification limits when recording evidence. The [archive](archive/README.md) is historical, and its old instructions must not override current guidance.

## Write for a public repository

Use plain language and neutral examples such as `example.com`. Names and usernames may appear where relevant. Remove credentials, tokens, private URLs, and private browsing or session data. Check screenshots, traces, logs, generated output, and Git changes before sharing them.

Use portable paths and pass machine-dependent inputs explicitly. Temporary files should use the operating system or test runner’s temporary directory. Keep local settings outside the repository.

With [Gitleaks](https://github.com/gitleaks/gitleaks) installed, run `npm run check:secrets` to scan the full Git history and staged changes. Stage the files you intend to commit first. The scanner redacts matches in its output.
