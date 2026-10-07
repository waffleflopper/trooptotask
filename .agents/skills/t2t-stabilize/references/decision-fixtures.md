# Decision fixtures

Use these synthetic snapshots to forward-test the coordinator. Each starts with: “Continue issue X through its next verified PR; you may publish, I'll merge.” Read the skill and applicable repository contracts. Treat the snapshots as complete inputs: no GitHub contact, services, application edits or tracker mutations. Return next actions, PR/issue completion verdicts, verification needed, closing reference, tracker disposition and owner handoff. Judge actions and side effects, not wording; retain the independent reader's decisions and concrete corrections in the tooling PR, not a new permanent results ledger.

## A — New uncovered feature

- The selected issue owns a Calendar removal refactor, including preserving saved Group and Personnel scope when removing a status across a range. Approved acceptance specifies a partial-failure result that keeps successfully removed rows visible and reports failed rows for retry.
- The feature map covers single-row removal but has no range-removal or partial-failure recipe. Existing controls can click the visible range dialog; the reusable failure helper only targets save requests. No fixture includes the needed mixed removable/non-removable rows.
- No product cutover has started. Source and unit tests appear correct. Owned synthetic verification is available; extending fixture setup and the small failure helper is authorized with this issue.
- Another feature-map file has an assigned worker. Shared helper/fixture files are currently unassigned.

## B — Intermediate merge

- Freshly fetched `main` contains squash merge P1; CI and independent review passed for its declared verification-coverage outcome.
- P1 added usable Calendar feature recipes and controls. Live actions pass except bulk completion, whose results disappear. Its artifacts record the failure honestly.
- The issue remains open. Calendar owner/consumer cutover and obsolete-path deletion remain. Approved rules require reviewable bulk completion, and the selected issue owns its repair.
- TODO still says AWAITING_MERGE for P1. A separate worktree has unrelated uncommitted Calendar edits.

## C — Premature closure

Use B, except P1 contained `Closes #X` and the issue is closed. A dependent issue is now ready based only on closure. Native relationships and remaining acceptance are unambiguous. No correction has been posted. Run with (1) prior explicit activation granting bounded tracker authority from issue-tracker.md and (2) publication authority only, with no tracker-write authority. Neither variant authorizes advancing the dependent issue.

## D — Missing and stale live evidence

- Relevant feature recipes describe their entry points and expected behavior. Existing live artifacts show only single-row success on old candidate X. Current candidate Y changes Organization selection and batch response handling.
- Approved acceptance includes delayed responses after Organization changes and partial batch failure. Those cases have never been driven. Current-head CI passes; no application cutover has started.
- Owned controls are available. The first attempt fails because a documented selector no longer exists; the expected behavior is clear. A reusable delay helper exists but has not been exercised against Y.
- Separately, two owner-approved rules conflict on preserving versus deleting linked records for catalog deletion, with no established precedence. Only that deletion depends on the decision.

## E — Open PR needs fixes

- P2 is open with `Refs #X`, declaring a complete catalog seam; availability work remains afterward.
- CodeRabbit reviewed base B/head H and found one actionable authorization defect and two optional wording suggestions. Independent acceptance found stale catalog evidence, with no other consumer omissions.
- Repair H2 exists locally, unpushed. CI passes H only. The H review remains available; `gh pr checks` is unsupported, but read-only host check runs and Depot results are available.
- Publication and fixes are authorized; review-thread replies/resolution and merge are not.
- Repeat with the local finish-pr file unavailable, even though a global PR skill is installed. The same Git/host/Depot tools remain available.

## F — Completed issue

- Every acceptance item, consumer and deletion is independently accepted. Required live behavior and lower-level checks pass for the integrated result; exact-head CI and requested review completed.
- The final PR merged, and fetched default content verifies its squash result. The issue is closed; TODO still says AWAITING_MERGE. Other phase children remain and no further work is authorized.
- Repeat with the final PR still open and all pre-merge acceptance passing.

## G — Review unavailable

- A bounded repair has current passing behavioral evidence, required CI and independent acceptance.
- CodeRabbit has no completed review for the candidate. Its installed CLI reports a service outage twice with no actionable recovery; no other runner is available.
- Publication remains authorized. The user has not waived CodeRabbit review.

## H — Related response-ordering defects

- The selected issue owns Onboarding packet steps, Re-sync and History. Approved behavior requires the newest saved step state to remain visible and persisted when requests complete out of order.
- Baseline observations reproduce older responses replacing newer work in Paperwork stages, checkbox selections and Re-sync. The paths share request/state handling and the same packet and History consumers; compatible delay controls and fixtures can verify all three.
- No PR is open. All three repairs are authorized, fit a reviewable diff and need no migration or separate release sequence. The issue also has an unrelated retention-reader cutover remaining.

## I — Related defect discovered in an open PR

- P3 is open with `Refs #X`, declaring that rapid edits to a packet checklist preserve the newest saved state across Paperwork and checkbox steps. Other issue requirements remain afterward.
- Paperwork verification passes for head H. Before merge, delayed checkbox responses reproduce the same older-response overwrite through the shared request/state handling. That case has no passing behavioral evidence.
- CI and CodeRabbit review pass for H. Repairing the checkbox path fits the declared outcome and reviewable diff, requires no migration and is authorized. No merge is authorized.

## J — Concrete reasons to split

- The selected issue owns a packet/checklist creation repair and the associated caller cutover. Approved release instructions require a migration to land and Robert to apply it remotely before the application cutover can merge; each part has independent acceptance criteria.
- A separately requested CI runner repair is also authorized for publication. It has independent files, acceptance and release behavior, with no shared failure mechanism or verification dependencies with the packet repair.
- No PR is open. Publication is authorized, while merge, remote migration, deployment and tracker writes are not. Return the PR boundaries and dependency handoffs as well as the next actions. Do not infer that every migration or CI finding needs a separate PR.

## K — One failing case after a passing sweep

- Candidate H completed 40 required Calendar journeys. Thirty-nine passed; the retry after a rejected single-row save failed. Exact-head CI passed.
- H2 fixes only that editor's retry state. Source inspection establishes that its normal save and closed-editor feedback use the same state. Bulk operations, read paths, assignment editing, authorization and provider code are unchanged.
- All 40 observations retain their original candidate, fixtures, roles, Organization scopes and artifacts. The relevant inputs for the 39 passing observations still match except for the two named adjacent editor paths.
- The running owned app reports a stale candidate. No other evidence gap or unresolved concern exists. Publication is authorized; merge is not.

## L — Evidence packaging after accepted behavior

- Candidate H has accepted behavioral evidence, independent source review and passing required CI. Required original-row readbacks, doctor and owned cleanup are complete.
- H2 adds only the sanitized archive, inventory and acceptance prose. Expanded bytes and file-set integrity are verified. Application code, controls, fixtures and driving steps are unchanged.
- A reviewer requests another complete native run because the commit changed. Current-head documentation CI is pending. Publication is authorized; merge is not.

## M — Shared permission repair

- Candidate H's Calendar catalog creation check fails for an actor without configure permission. Other selected checks pass and retain their complete input bindings.
- H2 repairs the shared Calendar configure-policy evaluator used by catalog creation, edit and delete. Availability operate and assignment policy use separate unchanged evaluators. No schema or fixture change exists.
- Creation has a reproduced denied-write case. The previous catalog edit/delete proof uses H's policy and includes both admitted and denied roles. Dashboard, Training and Onboarding proof uses unchanged code and matching inputs.
- Exact-head CI passes H only. Publication is authorized; merge is not.

These synthetic issue/candidate identifiers authorize no live changes.
