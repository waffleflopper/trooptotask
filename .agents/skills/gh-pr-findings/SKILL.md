---
name: gh-pr-findings
description: Review GitHub pull request comments, review threads, bot comments, and human feedback to extract unique findings, collapse duplicates, and recommend what to action. Use when the user asks to inspect PR comments, summarize review findings, deduplicate AI bot feedback, decide whether PR feedback should be fixed now, or determine whether deferred feedback should become a follow-up slice issue.
---

# GitHub PR Findings

Review PR discussion as a maintainer triage pass. Produce a clear decision report; do not change code, post comments, resolve threads, or create issues unless the user explicitly asks.

## Workflow

1. Gather PR context:
   - Infer the repository from the current git remote when possible.
   - Read PR title, body, base/head branches, changed files, and diff summary.
   - Read all PR discussion surfaces available: top-level conversation comments, reviews, inline review comments, unresolved/resolved review threads, bot comments, and check-run comments or annotations if they are surfaced in the PR discussion.
   - Prefer APIs that expose review-thread resolution state. If only flat comments are available, say that resolution state may be incomplete.

2. Extract findings:
   - Treat a finding as a claim that code, tests, docs, product behavior, architecture, security, maintainability, or scope should change.
   - Ignore non-findings: acknowledgements, "LGTM", status updates, repeated CI noise, merge instructions, reactions, generic praise, or questions that do not imply a defect or decision.
   - Preserve author/source context, especially whether the source is a human reviewer, a known AI bot, CI, or the PR author.

3. Collapse duplicates:
   - Deduplicate by the underlying problem and affected behavior, not by identical wording.
   - Merge comments that point at the same root cause, same file/line family, same missing test, or same architectural concern.
   - Keep the strongest phrasing as the finding summary and list representative sources.
   - If two comments look similar but require different fixes, keep them separate.

4. Validate each unique finding:
   - Compare it against the current diff and, when needed, the current file contents.
   - Check whether it is already fixed by later commits or already resolved in the PR.
   - Check whether it is in scope for this PR: introduced by the PR, required by acceptance criteria, needed for tests/CI, or a small follow-on needed to make the slice correct.
   - Apply repo instructions and project-specific rules before recommending action. For TroopToTask v2, respect package boundaries, authorization rules, ADR requirements, parity expectations, and Definition of Done.

5. Classify each finding:
   - **Action in this PR** when it is a real defect, regression, security/auth issue, data-loss risk, failing test/CI cause, architecture-boundary violation, acceptance-criteria gap, missing required test, or small in-scope correction.
   - **Defer to slice issue** when it is valid but outside the PR's intended slice, requires product/design/architecture decisions, needs an ADR first, is too broad for the current review, or would create risky scope expansion.
   - **Do not action** when it is incorrect, obsolete, duplicate-only, already fixed, already covered elsewhere, stylistic without material impact, conflicts with project rules, or asks for work the PR should intentionally avoid.

## Output

Start with a brief status line: how many comments/review threads were inspected, how many unique findings were found, and how many are recommended for each classification.

Then group findings in this order:

1. **Action In This PR**
2. **Defer To Slice Issue**
3. **Do Not Action**

For every finding, include:

- **Finding:** plain-language description of what is going on.
- **Sources:** authors and comment/thread references or links when available.
- **Impact:** why it matters, framed in user, system, security, test, or maintainability terms.
- **Recommendation:** proposed fix, follow-up issue title, or reason not to act.
- **Confidence:** high, medium, or low, based on whether the code/diff confirms the comment.

For deferred findings, explicitly say whether to open a slice issue:

- **Open slice issue** when the concern is valid, durable, and independently actionable.
- **Do not open slice issue** when it is speculative, too vague, already tracked, no longer relevant, or better handled by a future PR review only if it recurs.

## Decision Rules

- Prefer fixing PR-introduced correctness, security, authorization, data integrity, architecture-contract, and test failures before merge.
- Prefer deferring broad enhancements, refactors, UX expansions, new provider/pattern decisions, or work that needs explicit human approval.
- Do not let multiple AI bot comments inflate severity; one real issue remains one finding.
- Do not dismiss a human finding only because a bot also reported it.
- Do not treat resolved review threads as automatically fixed; verify against the current diff when the issue matters.
- Do not create GitHub issues or PR comments without showing the draft and getting user confirmation.
- When evidence is insufficient, label confidence low and state exactly what would need to be checked.

## Suggested Report Shape

```markdown
Inspected 42 PR comments/review comments across 8 threads. Found 6 unique findings: 2 action now, 3 defer to slice issues, 1 do not action.

## Action In This PR

### 1. Missing authorization check before updating grants

- **Sources:** @reviewer inline thread on `packages/permissions/...`; @ai-bot duplicate on the same use case
- **Impact:** A caller could update authority without proving they possess that authority, which breaks the app-owned authorization model.
- **Recommendation:** Add the use-case policy check before the repository call and cover allow/deny cases in policy tests.
- **Confidence:** High

## Defer To Slice Issue

### 2. Add bulk import validation preview

- **Sources:** @reviewer top-level comment
- **Impact:** Useful UX, but it expands the current persistence slice into a new workflow.
- **Recommendation:** Open slice issue: "Add validation preview to personnel import flow."
- **Confidence:** Medium

## Do Not Action

### 3. Replace Account terminology with Unit

- **Sources:** @ai-bot inline comment
- **Impact:** This conflicts with the v2 domain language contract; user-facing copy can say "unit," but code/schema should keep `Account`.
- **Recommendation:** Do not action in this PR and do not open a slice issue unless a future ADR reintroduces Unit as a domain concept.
- **Confidence:** High
```
