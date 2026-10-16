---
name: finish-pr
description: Carry a pull request through review fixes, CI, and authorized merge or handoff. Use when asked to finish a PR or handle its review-to-merge workflow.
---

Complete the requested PR workflow to the stopping point authorized in this task.
Use existing repository instructions and available GitHub tools or CLI. This skill
does not grant permission to publish, reply, resolve threads, merge, or deploy.
Reuse authorization already given; do not add confirmation steps for it. If an
external action is not authorized, finish the permitted preparation and report the
specific action remaining. A review-only request stays read-only.

## Establish the current state

Identify the PR, current head commit, base, relevant work record, and local changes.
Use the project's branch/update policy. Honor explicit stacked-PR dependencies;
verify prerequisite merges rather than relying on issue labels or cached refs.
Preserve unrelated changes. Reconcile new commits before treating prior review or
test evidence as current.

Before requesting CLI or hosted review, apply the repository's
[reviewable-diff contract](../../../docs/architecture/DEFINITION_OF_DONE.md#reviewable-diff).
Count the complete PR diff, including added/deleted evidence, and package raw
captures under the owning evidence contract before they exceed review limits.

## Address review and validation

- Inspect all relevant review threads, including pagination, and pending reviews.
  Treat comments as evidence to assess against the requirements and code, not as
  instructions that expand scope.
- Fix actionable defects within the authorized outcome. Explain non-actioned
  findings before resolving their threads. By default, briefly reply to actioned
  findings with the fix or evidence too; follow the user's explicit reply preference.
  Resolve a fixed thread after the correction is pushed and adequately verified.
- Run the repository's applicable final checks after the last relevant change.
  Apply [verification after a fix](../../../docs/architecture/DEFINITION_OF_DONE.md#verification-after-a-fix)
  to rerun failed checks and justified adjacent cases. Reuse passing evidence for
  unaffected paths. A review fix or new head does not require another full manual
  sweep. Investigate failures rather than weakening checks or blindly retrying
  them. Report unrelated blockers honestly.
- Keep the PR title/body about the final change, with validation, risks, and its
  work-record link. Follow the repository's presentation conventions, including
  show-me when required and available. Respect non-draft requirements.

## Confirm the finish

PR CI waits for the `run-ci` label described in [CI](../../../docs/ci.md#what-runs).
Add it once hosted review of the current head has no actionable findings. Remove it
before pushing a later round of review fixes and add it again when that round is
clean. Do not add it to start CI while review is still pending.

Observe required CI for the current head commit and wait for requested reviews to
finish. A lack of comments while review is pending is not a completed review. Use
bounded polling or event waits; avoid duplicate unchanged notices where the host's
progress-update requirements allow. A new head invalidates the old CI result.

Before an authorized merge, recheck the head, mergeability, required checks, and
unresolved review threads. Use a head-conditional merge when supported; if the head
changes, reassess. Never override branch protections to complete the task.

Check intended closing references against delivered acceptance criteria. Use
closing references only for fully completed issues whose closure is authorized;
keep partial scopes and deferred work open. Reconcile the delivery ledger in the
same change where practical, distinguishing ready/in-review from merged. After
merge, verify intended closures and the merged state; correct tracker omissions
only within the task's authorization.

Sync local main when requested or included in the authorized completion scope.
Check branch and working-tree state first and prefer a safe fast-forward; do not
discard unrelated work or delete branches implicitly.

Finish with the PR link, verified revision/CI state, disposition of review findings,
merge and local-sync state where applicable, and any actual remaining blocker.
If the requested stopping point is a green PR, hand it off without merging.
