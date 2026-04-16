---
name: verify-work
description: Audit completed GitHub issue work against a prd-to-issues slice, its parent PRD, issue comments, and TDD test evidence. Use when the user says "verify-work 123", asks to verify a GitHub issue implementation, or wants to check a prd-to-issues/TDD slice for missed criteria before shipping.
---

# Verify Work

Audit whether completed work satisfies a GitHub issue created by `prd-to-issues`.
Default to report-only: identify blockers and remediation steps, but do not implement fixes or post GitHub comments unless the user explicitly asks.

## Quick Start

Accept these forms:

- `verify-work 123`
- `verify-work #123`
- `verify-work https://github.com/OWNER/REPO/issues/123`

If the issue number is missing or ambiguous, ask for it.

## Workflow

1. Read project guidance first:
   - `AGENTS.md`
   - Relevant local skills when applicable, especially TDD, UI consistency, Supabase/server safety, or feature workflow skills.
2. Fetch the slice issue and comments:
   ```bash
   gh issue view "$ISSUE" --json number,title,state,body,comments,url,labels,closedByPullRequestsReferences
   ```
3. Extract exactly one parent PRD issue from the slice's `## Parent PRD` section. If the section or issue reference is missing, stop and report that the issue does not match the `prd-to-issues` slice format.
4. Fetch the parent PRD and comments:
   ```bash
   gh issue view "$PARENT_PRD" --json number,title,state,body,comments,url,labels
   ```
5. Build a verification matrix from:
   - Slice `## What to build`
   - Slice `## Acceptance criteria`
   - Slice `## User stories addressed`
   - Slice `## Blocked by`
   - Parent PRD requirements tied to those user stories or referenced sections
   - Slice and parent PRD comments that clarify, add, narrow, or defer scope
6. Check blockers. Fetch every issue in `## Blocked by`; if any blocker is open, report `BLOCKED` separately from implementation gaps.
7. Inspect current work and evidence:
   ```bash
   git status --short --branch
   git diff --stat main...HEAD
   git diff --name-only main...HEAD
   git log --oneline main..HEAD
   ```
   Read changed files, nearby tests, and any PRs linked by `closedByPullRequestsReferences`. Use `rg` for source and test searches.
8. Apply TDD standards while judging tests:
   - Tests should verify behavior through public interfaces.
   - Tests should not mainly assert private implementation shape.
   - Each major acceptance criterion needs behavior-focused test evidence or an explicit manual-verification reason.
9. Cross-check PRD scope:
   - For normal slices, audit the parent PRD portions connected to the slice's user stories and references.
   - For final hardening or verification slices, audit against the full parent PRD.
   - If the slice is narrower than the parent PRD implies, report a scope mismatch instead of silently expanding the slice.
10. Run required verification before a passing verdict. Prefer `/verify all` or `verify_project` when available; otherwise run:
    ```bash
    npm run format
    npm run lint
    npm run check
    npm run test
    ```
    Running format is allowed as part of the repo's completion workflow, but do not implement missing feature or test work during verification.

## Report Format

Lead with the verdict:

- `PASS`: no missed criteria, no open blockers, required verification passed.
- `BLOCKED`: open blocker issue, missing criterion, weak or missing required test evidence, or failing verification.
- `NEEDS USER DECISION`: scope conflict, unclear PRD/comment decision, or explicitly deferred work that needs confirmation.

Include:

- Slice issue and parent PRD links.
- Acceptance matrix with `Covered`, `Partial`, `Missing`, `Manual`, or `Not Applicable`.
- Evidence paths and test names for each covered criterion.
- Parent PRD/comment deltas that changed the checklist.
- TDD coverage assessment.
- Verification command results.
- Exact remediation steps for every blocker.
- Manual follow-ups, especially migrations or remote environment steps that must not be run from the agent.
