# Agent Operating Rules

## Scope and decisions

Complete the authorized outcome, including required consumers, cleanup and verification. Routine local edits, read-only investigation and the prescribed local checks do not need another approval. Inspect lifecycle scripts and environment targets before commands that could reach services or data; database work follows the [isolated database contract](../architecture/DEFINITION_OF_DONE.md#isolated-database-checks) and root [data protections](../../AGENTS.md).

Use the user's current request and prior authorization to resolve routine choices. Ask a focused question when missing information would materially change the result or an action needs authorization not already supplied. Continue independent work while that question is pending. A status question or correction steers the active task; it does not cancel the remaining work unless the user says so.

If a repo or skill instruction requires a pause, link the exact file, quote the relevant rule and explain the concrete unresolved decision. Distinguish an explicit requirement from an inferred preference. Prepare the reviewable result before requesting approval for an external action. Publication, communications, merge and deployment require authorization covering that action; a local implementation request alone does not supply it.

Use available skills when requested or relevant to the workflow. A historical skill name in a reference is not a dependency on an unavailable tool. Follow the current session's delegation policy; when delegation is authorized, use bounded independent tasks where parallel work adds value, and verify the integrated result.

## Communication

Robert has technical experience but is not overly technical. Lead with the outcome, use plain language and explain unfamiliar technical terms briefly. Keep progress updates focused on findings, decisions and blockers. Report what changed, verification results and remaining limitations without a work-log transcript.

## Completion checks

The [verification contract](../architecture/DEFINITION_OF_DONE.md#verification-contract) owns required commands and evidence. Use focused checks during edits, then complete the required sequence. Once checks pass, repeat or broaden them only for subsequent changes, failures or unresolved concerns. Documentation edits need meaningful link/contract review, not new tests that match prose.

Record each required check as passed, failed or unavailable. Missing flow evidence, failed tests and unavailable tools remain explicit; keep the owning task open when that evidence is required for acceptance. Notify Robert when a completed schema change needs a separately operated remote migration before merge; never run it as part of local verification.

## Stabilization tasks

For activation or each next-task invocation, read [workflow #1275](https://github.com/waffleflopper/trooptotask/issues/1275), the active phase parent/child and relevant comments. Reconcile [TODO](../stabilization/TODO.md), relevant [evidence](../stabilization/EVIDENCE.md), [program decisions](../architecture/ARCHITECTURE.md#stabilization-decisions), repository/default branch, local edits and actual open/closed PR state before choosing work. Recover stale metadata from verified issue mappings/PRs; record BLOCKED when uncertainty prevents verified advancement. A separate docs/tooling request does not advance the queue.

- **Activation:** Verify preceding-phase acceptance and merged changes on fetched default content; checkboxes or closed issues alone do not suffice. Reconcile native children/milestone and map every actionable phase task. Start the first deliverable on a safe new local branch from current verified default content, preserving existing branches/unrelated edits. Carry small planning/instruction edits with that deliverable's PR. Record READY and STOP before implementation.
- **READY / IMPLEMENTING:** Complete only the first ready unchecked task mapped to the active child. Expand an oversized task into bounded local leaves with prerequisites and measurable acceptance before doing one. Finish implementation, full caller/removal cutover, meaningful tests and required verification. Update TODO and concise EVIDENCE; check tasks only when acceptance is met.
- **Deliverable complete:** Review every mapped task, child acceptance and the full PR diff. Record AWAITING_PR; prepare title/body, base/head, verification/deletions, independent-review needs, exact owner commands and `Closes #<child>` (reference the parent without a closing keyword). Keep the child open and STOP before another child.
- **AWAITING_PR / AWAITING_MERGE:** Verify actual repository/head/base and child links across open/closed PRs. No PR or an open PR means report the checkpoint and STOP; review fixes stay within this child and require an explicit request. A closed-unmerged PR, failed/cancelled required verification, ambiguous linkage or manually closed issue cannot unlock advancement. Observed PR numbers alone need no documentation-only commit.
- **Verified merge:** Confirm merge to the default branch, required verification/review status and the merged result in freshly fetched default content, accounting for squash/rebase. Reconcile child closure, then safely branch the next deliverable from updated default in a clean worktree without discarding local/unpushed edits. Carry merge evidence with normal next work; one task for that next child may run.
- **All children merged:** Enter PHASE_CHECK on the integrated candidate. Record necessary repairs as bounded children with ordinary PR checkpoints. Only verified phase-wide acceptance permits a candidate-SHA/evidence summary and parent/milestone closure; recover partial closure idempotently. STOP and report the next activation command; never activate another phase automatically.

Preserve verification guards, scan paths and budgets: no allowlists, skipped tests, weakened assertions or hidden failures. No repository E2E suite or runtime bypass. [Bounded tracker writes](issue-tracker.md) are authorized by explicit phase activation; Git publication/merge, production/remote actions, live data and deployment remain separately protected. Safe fetch/local branching is allowed; never force-reset, force-push, silently stash or discard work. Root data protections and the canonical isolated database contract remain unchanged.

Every handoff reports phase/active child, completed local task, state, changed/deleted scope, actual checks/blockers, PR status and exact next owner action (or repeat the driver when appropriate). Flag whether push/merge appears to trigger deployment or remote migration from repository configuration, and identify unknown external settings. Owner notice, backups and app/schema compatibility must precede a merge that releases destructive/removal behavior; waiting for phase 15 does not prevent automatic deployment.
