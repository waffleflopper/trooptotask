# TASK

Review the code changes on branch `{{BRANCH}}` and improve code clarity, consistency, and maintainability while preserving exact functionality.

Read `AGENTS.md`, `.sandcastle/CODING_STANDARDS.md`, and any issue/PRD context needed to understand the branch intent. If the branch changes UI, read `docs/component-catalog.md` and apply the repo's UI guidance.

# CONTEXT

## Branch diff

!`git diff {{SOURCE_BRANCH}}...{{BRANCH}}`

## Commits on this branch

!`git log {{SOURCE_BRANCH}}..{{BRANCH}} --oneline`

# REVIEW PROCESS

1. **Understand the change**: Read the diff and commits above to understand the intent.

2. **Validate scope and intent**:
   - Does the branch solve only the requested issue?
   - Does it preserve existing behavior except where the issue explicitly changes it?
   - Does it follow the owning feature/module's existing patterns?
   - Does it avoid unrelated refactors, formatting churn, or broad cleanup?

3. **Analyze for improvements**: Look for opportunities to:
   - Reduce unnecessary complexity and nesting
   - Eliminate redundant code and abstractions
   - Improve readability through clear variable and function names
   - Consolidate related logic
   - Remove unnecessary comments that describe obvious code
   - Avoid nested ternary operators - prefer switch statements or if/else chains
   - Choose clarity over brevity - explicit code is often better than overly compact code

4. **Check correctness**:
   - Does the implementation match the intent? Are edge cases handled?
   - Are new/changed behaviours covered by tests?
   - Are there unsafe casts, `any` types, or unchecked assumptions?
   - Does the change introduce injection vulnerabilities, credential leaks, or other security issues?

5. **Check TroopToTask guardrails**:
   - Does authorization still use Organization membership and respect Group scope?
   - Does the change avoid new direct provider-specific business logic such as `locals.supabase` outside approved boundaries?
   - Does it avoid new cross-feature permission piggybacking?
   - Does it avoid expanding deprecated demo/sandbox behavior?
   - Does new UX copy use current Army/military-oriented domain language where applicable?
   - If architecture/governance contracts changed, are the relevant docs or baselines updated?

6. **Maintain balance**: Avoid over-simplification that could:
   - Reduce code clarity or maintainability
   - Create overly clever solutions that are hard to understand
   - Combine too many concerns into single functions or components
   - Remove helpful abstractions that improve code organization
   - Make the code harder to debug or extend

7. **Apply project standards**: Follow the coding standards defined in @.sandcastle/CODING_STANDARDS.md

8. **Preserve functionality**: Never change what the code does - only how it does it. All original features, outputs, and behaviors must remain intact.

# EXECUTION

If you find improvements to make:

1. Make the changes directly on this branch
2. Run focused checks for the branch and your review edits
3. Commit describing the refinements

If the code is already clean and well-structured, do nothing.

# FOCUSED REVIEW CHECKS

During review, run checks that are specific to the branch instead of the full repo verification suite. Prefer:

- `npm run test -- <relevant test files>`
- `npm run check` only when the branch touches Svelte, route load/action typing, shared TypeScript contracts, or another surface where focused tests are not enough
- `npm run format` when you changed files in the review pass

Do not run the full `npm run test` suite during review unless the branch explicitly requires it or focused results point to a broader failure. The merge/final phase owns full verification.

If any focused check fails, fix the issue if it is caused by this branch. If the failure is unrelated or cannot be fixed safely in this review pass, leave an issue comment with the exact blocker and do not output completion as if the branch is clean.

Once complete, output <promise>COMPLETE</promise>.
