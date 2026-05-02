# TASK

Merge the following branches into the current branch:

{{BRANCHES}}

For each branch:

1. Run `git merge <branch> --no-edit`
2. If there are merge conflicts, resolve them intelligently by reading both sides and choosing the correct resolution
3. If conflict resolution touches a risky surface, run focused tests for that surface before proceeding to the next branch
4. Do not run the full repo verification suite after every individual branch; the final verification pass below owns that

# FINAL REQUIRED CHECKS

After all branches are merged, run the full repo verification suite:

1. `npm run format`
2. `npm run lint`
3. `npm run governance:check`
4. `npm run check`
5. `npm run test`

If any check fails because of a merged branch, fix the issue and rerun the affected check. If a failure is unrelated or unsafe to fix in this merge pass, stop and leave the affected issue open with a comment explaining the blocker.

After all branches are merged, make a single commit summarizing the merge.

# CLOSE ISSUES

For each issue whose branch was merged, close the matching GitHub issue by number:

{{ISSUES}}

Use this command shape:

`gh issue close <issue-number> --comment "Completed by Sandcastle"`

Once you've merged everything you can, output <promise>COMPLETE</promise>.
