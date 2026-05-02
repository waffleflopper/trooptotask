# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view {{TASK_ID}}`. If it has a parent PRD, pull that in too.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits and run tests.

Read `AGENTS.md` and `.sandcastle/CODING_STANDARDS.md` before editing. If the issue touches UI, also read `docs/component-catalog.md` and follow the repo's UI guidance.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task. Prefer the closest existing feature/module patterns over inventing new ones.

Pay extra attention to test files that touch the relevant parts of the code.

Before editing, identify:

1. The smallest vertical slice that satisfies this issue
2. The feature/module that owns the change
3. The closest behavior-focused tests to update or extend
4. Any architecture, authorization, provider-boundary, migration, or product decision that is unclear

If a required decision is unclear, do not guess. Leave an issue comment explaining the blocker and what decision is needed.

# EXECUTION

If applicable, use RGR to complete the task.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

Keep the implementation narrow:

- Preserve existing behavior unless the issue explicitly changes it
- Do not broaden authorization, scope, or provider access as a convenience
- Do not deepen deprecated demo/sandbox-specific behavior
- Do not make unrelated refactors or cleanup commits
- Prefer feature-owned helpers/components over route-local one-offs
- Update architecture, governance, or drift docs only when this issue changes those contracts

# FEEDBACK LOOPS

During implementation, run focused checks for the changed slice instead of the full repo verification suite. Use the closest behavior tests and type/Svelte checks that exercise your change, for example:

- `npm run test -- <relevant test files>`
- `npm run check` only when the change touches Svelte, route load/action typing, shared TypeScript contracts, or another surface where a focused test is not enough
- `npm run format` when edits are substantial or formatting-sensitive

Do not run the full `npm run test` suite during implementation unless the issue explicitly requires it or the focused results point to a broader failure. The merge/final phase owns full verification.

In your commit message and issue handoff, record exactly which focused checks passed and any checks skipped because they are reserved for merge verification.

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix
2. Include task completed + PRD reference
3. Key decisions made
4. Files changed
5. Blockers or notes for next iteration

Keep it concise.

# THE ISSUE

If the task is not complete, leave a comment on the issue with what was done.

Do not close the issue - this will be done later.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
