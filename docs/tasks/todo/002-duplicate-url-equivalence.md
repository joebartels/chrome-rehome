# 002: Duplicate URL equivalence

Status: TODO

Depends on: Foundation

## Outcome

Build a pure duplicate identity function independent of grouping. Compare explicit canonical keys, not edit distance or general string similarity. Preserve the actual navigation URL.

## Integration points

rules/duplicates.ts; versioned equivalence configuration; normalization fixtures.

## Acceptance criteria and decisions

- [ ] Decide per-site tracking-parameter ignore lists, fragment handling, trailing slashes, and query ordering. Preserve meaningful values and repeated parameters unless an explicit rule says otherwise.
- [ ] Default to conservative canonical URL identity; never merge different issue, PR, file, or document IDs.
- [ ] Include browsing-context separation in candidate eligibility; normal and incognito contexts must never merge.
- [ ] Test tracking variants, meaningful query differences, encoded path delimiters, case-sensitive paths, fragments used as routes, and unsupported schemes.

## Implementation discipline

Start with the behavior tests named above; run them failing before implementation. Keep Chrome calls out of pure matching/planning. Record any product decision in the task before enabling behavior. Complete typecheck, covering tests, and package build; add browser checks where Chrome owns the behavior.
