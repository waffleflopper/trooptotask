# Decision fixtures

Use these synthetic snapshots to forward-test the coordinator. Each starts with: “Continue #1352 through its next verified PR. You may publish; I'll merge.” Read the skill and applicable repository contracts. Treat snapshots as complete inputs for the exercise; do not contact GitHub, launch services, edit application code or mutate tracker state. Return the next action, PR/issue completion verdicts, proof needed, closing reference, tracker disposition and owner handoff for each. Judge decisions and side effects, not wording.

## A — Intermediate merge

- Default branch `main` contains squash merge P1. Its CI and independent review passed.
- P1 declared reusable Calendar coverage and bounded repairs. All nine checks are implemented; eight live receipts pass, and bulk completion fails because its results disappear. Evidence records that failure. The checks correctly detect it.
- The issue is open. Calendar owner/consumer cutover and obsolete-path deletion remain. The approved contract requires reviewable bulk completion; the selected issue owns its repair.
- TODO still says AWAITING_MERGE for P1. A separate worker has unrelated uncommitted Calendar edits in another worktree.

## B — Premature closure

Use A, except P1 contained `Closes #1352` and the issue is closed. A dependent issue is now labeled ready based only on that closure. Native relationships and remaining acceptance are unambiguous. Run twice: (1) prior explicit activation grants the bounded tracker authority described in issue-tracker.md; (2) publication is authorized but no tracker-write authority exists. No correction has yet been posted.

## C — Missing and stale proof

- The issue's nine-entry claim set exists. Seven claims are implemented with passing receipts on old executable candidate X. Two have no implementation or fixture actor. Current candidate is Y.
- Current-head CI passes. There is no accepted refactor baseline. No application cutover has started.
- The owned verifier is available. An attempted new check reports INCONCLUSIVE because a fixture selector is wrong; expected behavior is specified by an approved contract.
- Separately, two owner-approved requirements conflict over whether a catalog deletion must remove or preserve linked records; no source establishes precedence. The decision affects that deletion only.

## D — Open PR needs fixes

- P2 is open with `Refs #1352`; it declares a complete catalog seam, not the whole issue. Availability remains afterward.
- CodeRabbit reviewed base B/head H and found one actionable authorization defect and two optional wording suggestions. Independent acceptance identified stale catalog proof. No other consumer omission was found.
- A repair commit H2 exists locally, unpushed. CI passes H only. CodeRabbit's completed H review remains available; the local runner cannot use `gh pr checks`, but read-only host check runs and Depot results are accessible.
- The user has authorized publication and fixes, but no review-thread replies/resolution or merge.

## E — Completed issue

- All issue acceptance items, consumers and deletions are independently accepted. Every required behavioral and lower-level check passes for the integrated result; exact-head CI and requested review completed.
- The final PR merged to default, and fetched content verifies its squash result. The issue is closed. TODO still says AWAITING_MERGE. The phase has other unfinished children and no further work is authorized.
- Run a second variant with the final PR still open and all pre-merge gates passing.

## F — Review unavailable

- A complete bounded repair has current passing behavioral proof, required CI and independent acceptance.
- CodeRabbit has no completed review for the candidate. The installed CLI reports a service outage twice, with no actionable recovery. No additional runner is available.
- Publication remains authorized; the user has not waived the requested CodeRabbit review.

For each run, retain the evaluator's observed decisions and any concrete correction in the tooling PR's validation record. These examples are synthetic; their issue numbers and candidate letters authorize no live changes.
