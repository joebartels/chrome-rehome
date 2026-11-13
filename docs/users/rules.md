# Rules and preview

Open the toolbar popup and choose **Open settings**. Changes stay in a draft until you choose **Save settings**. Saving applies all rules together and preserves the current Pause/Resume setting.

Use **Reload saved settings** to discard the draft and read saved rules again. Closing or reloading the page loses unsaved edits and preview text. A failed save keeps the draft so you can retry.

## Grouping rules

Each rule has a pattern, group name, and enabled checkbox. The first enabled matching rule wins, so place specific rules above broad ones with **Move up** and **Move down**.

| Pattern | Matches |
| --- | --- |
| `https://example.com/projects/*` | Paths under `/projects/`, including nested paths. It does not match the slashless `/projects`. |
| `https://example.com/*` | All paths on that HTTPS host. |
| `*://example.com/*` | HTTP and HTTPS on that host. |
| `https://*.example.com/*` | Subdomains, such as `docs.example.com`; it does not implicitly include `example.com`. |

Only `*` is a wildcard. Other pattern syntax is literal, so `:id` does not stand for a path parameter. Path case matters. An explicit nondefault port matches that port; omitting the port uses the scheme's default.

Query strings and fragments do not affect grouping. Leave `?` and `#` out of patterns; test a full URL such as `https://example.com/projects/guide?view=all#intro` in preview instead.

Grouping rules apply when no eligible duplicate is already open. A duplicate's existing location takes priority, even when preview shows another group. Disabling a grouping rule stops that rule from assigning groups on future navigation; it does not undo existing organization or disable duplicate replacement.

## Duplicate policies

Without a custom policy, URL differences such as query values, fragments, and trailing slashes remain significant. Normal URL normalization still applies, including host case and default ports.

Choose **Add duplicate rule** to relax comparison for one exact origin, such as `https://example.com`. An origin has a scheme, hostname, and optional port, with no path, query, fragment, or wildcard. HTTP, HTTPS, subdomains, and nondefault ports are separate origins. Each origin can have one policy; rule order does not set precedence.

| Setting | Effect |
| --- | --- |
| **ignored query names** | Ignores every occurrence of each listed query name. Enter one exact decoded name per line; names are case-sensitive. |
| **ignore fragment** | Treats URLs differing only after `#` as equivalent. |
| **ignore trailing slash** | Ignores trailing path slashes, leaving the root `/` intact. |
| **sort query parameters** | Ignores differences in query-name order while preserving the order of repeated values for the same name. |

For example, compare `https://example.com/guide?utm_source=one#intro` with `https://example.com/guide?utm_source=two#details`. They are distinct by default. A policy for `https://example.com` with ignored query name `utm_source` and **ignore fragment** enabled makes them equivalent.

Only ignore a URL component when it does not identify content you want to keep separate. A fragment can identify a different page in some web apps. Policies change comparison; they do not rewrite the URL a tab visits.

Disabling a duplicate policy restores conservative comparison for that origin. It does not turn off duplicate detection. Disabled rules remain saved and must still be valid.

## Preview before saving

Enter **URL to preview** to see the matching grouping rule and duplicate policy. Add **Compare with URL** to see whether two URLs count as duplicates. Comparison assumes both are in the same normal browsing context.

Preview evaluates the current draft, including while processing is paused. It does not fetch those URLs, inspect open tabs, or change settings or tab placement. Fix any invalid rule rows before previewing. Use the result to check matching, then save and test with a fresh link if you want to observe real placement.

For implementation details and edge cases, see the [grouping matcher](../../src/rules/grouping.ts), [duplicate matcher](../../src/rules/duplicates.ts), and their [shared test cases](../../tests/fixtures/duplicate-cases.ts).
