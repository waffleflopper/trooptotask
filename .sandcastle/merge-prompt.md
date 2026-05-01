# TASK

Merge the following branches into the current branch:

{{BRANCHES}}

For each branch:

1. Run `git merge <branch> --no-edit`
2. If there are merge conflicts, resolve them intelligently by reading both sides and choosing the correct resolution
3. After resolving conflicts, run `npm run check` and `npm run test` to verify everything works
4. If tests fail, fix the issues before proceeding to the next branch

After all branches are merged, make a single commit summarizing the merge.

# CLOSE ISSUES

For each issue whose branch was merged, close the matching GitHub issue by number:

{{ISSUES}}

Use this command shape:

`gh issue close <issue-number> --comment "Completed by Sandcastle"`

Once you've merged everything you can, output <promise>COMPLETE</promise>.
