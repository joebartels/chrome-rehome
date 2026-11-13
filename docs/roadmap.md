# Direction and roadmap

ChromeReHome should make tabs easier to manage while leaving people in control of what moves and closes. Proposed work should support that goal without making browser state harder to reason about.

## Priorities

- **Keep deliberate organization.** Respect existing groups, windows, protected tabs, and background opens.
- **Make uncertainty safe.** When the extension cannot verify that a change is still appropriate, stop and explain the status.
- **Keep controls understandable.** A person should be able to see whether processing is active and how to pause it.
- **Measure before optimizing.** Use realistic browser workloads before adding caches or more state to keep in sync.
- **Keep maintenance manageable.** Favor clear ownership, narrow permissions, useful tests, and documentation that explains lasting decisions.

Specific proposals, priorities, and completion records live in this repository’s **Issues** tab. This page does not duplicate that backlog or promise release dates. Completed historical tasks were migrated there as closed issues.

When proposing a change, describe the problem, the behavior a person should see, and how it will be checked. Include any effect on privacy, browser permissions, recovery, or existing settings. The [engineering principles](engineering/principles.md) provide the review criteria.
