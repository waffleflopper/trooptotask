# Phase 0–2 deployment prompt

Copy the prompt below into a new agent session in this repository when ready to release. Creating this file does not execute or authorize production work in the current preparation session.

---

Deploy PR https://github.com/waffleflopper/trooptotask/pull/1289 to production. Carry this through preflight, the coordinated database/application cutover, PR merge, deployment confirmation and live in-app browser verification. I will have linked the Supabase CLI to the intended remote project. Ask for missing production identities and test credentials before the maintenance window; discover everything else you can from authenticated tools and repository configuration.

## Authorization for this run

I explicitly authorize production read-only preflight, secure release backups/exports, applying only the five reviewed migrations listed below, merging this PR after its checks pass, and completing its normal Vercel production deployment. I also authorize temporary, reversible maintenance controls on the identified production services, restoring their prior configuration after successful verification, and browser mutations confined to a dedicated test Organization and disposable accounts that I identify. This narrowly overrides the repository's default prohibition on remote database access/migration for this release. Proceed through these authorized steps without asking me to approve them again.

Existing customer data may change only as specified by the reviewed migrations. Do not reset databases, repair migration history, drop customer data, seed production, run SQL test suites against production or existing local stacks, weaken RLS, bypass branch protections, or guess mappings for invalid historical assignments. Leave unrelated local work intact. Keep credentials, tokens and customer data out of chat, committed files, command arguments and screenshots. Use protected credential input/environment and restricted temporary artifacts; report only aggregate results and non-secret identifiers.

## 1. Establish the release candidate and prerequisites

Read AGENTS.md, the finish-pr skill, [Calendar cutover](calendar-group-assignees.md), [verification contract](../architecture/DEFINITION_OF_DONE.md#verification-contract), and the relevant final entries in [evidence](../stabilization/EVIDENCE.md). Identify the actual repository/worktree, clean candidate, current PR head and current main SHA. Review the complete diff and all review threads, including pagination. Reassess any changes since the recorded verification; do not treat old results as verification of changed code.

Verify the intended Supabase project ref and production API host against the currently deployed application, plus the Vercel team/project, production domains and deployment branch. A linked CLI alone is not proof of identity. Verify authenticated access for read-only SQL, migrations, backup recovery, GitHub merge, deployment inspection and maintenance control before taking service offline. Read installed CLI help and current official documentation where needed; never assume a maintenance flag or provider feature exists.

Use the repository's required npm checks and production build with synthetic/unreachable provider settings for local verification. Reuse recorded isolated database/browser evidence only for unchanged artifacts and explicitly state its limits. Any new database verification must use a newly created disposable stack with checked project identity, working directory and unused ports; existing 543xx/553xx/563xx stacks and the linked remote are excluded. A successful preview build is staging evidence, not proof of a production deployment. Account for required checks, approvals, unresolved actionable reviews and the actual merge policy; if a merge queue or delayed deployment prevents the planned cutover, settle that before maintenance. No admin/force merge.

Ask me now for any identities that cannot be independently verified, the approved maintenance window if one has not been given, and credentials/MFA support for a dedicated production test Organization with an owner and a Group-scoped member. Identify which test accounts and inboxes are disposable. Gather these before the outage. If I provide only a real customer account, restrict it to read-only checks and report the missing mutation coverage.

Completion criterion: one identified release candidate, passing applicable checks, known production targets, usable deployment/recovery access, and a feasible maintenance and test plan.

## 2. Preflight production and prepare recovery

Inspect remote migration history and compare it with the candidate's migration files. The only authorized forward migrations are:

- `20260630001400_session_timeout_provenance.sql`
- `20260630001500_password_attempt_reconciliation.sql`
- `20260918000100_enforce_calendar_assignment_group_scope.sql`
- `20260918000200_allow_completed_password_attempt_restart.sql`
- `20260918000300_canonicalize_calendar_group_assignees.sql`

Inspect each SQL file before execution. Run `supabase db push --linked --dry-run` from the verified project directory and require the pending set to be exactly the unapplied suffix of this list, in order. Investigate any already-applied prefix and verify its effective schema; an already-applied Calendar policy may mean an active compatibility incident. Unknown pending migrations, gaps, divergent history or unexpected schema drift block execution. Do not use include-all, seed/role flags or migration repair to make the list pass.

Run the read-only SQL preflight from the Calendar cutover document against the verified production database; require zero invalid/ambiguous/foreign Group references. Verify prerequisites and effective objects touched by the auth migrations as well. Invalid historical rows require my data-mapping decision; do not delete or reinterpret them. Estimate affected rows, lock impact and available maintenance time.

Verify a recent recoverable backup/PITR point, its scope, timestamp, retention and operator recovery access. Securely capture migration history and enough pre-migration row state to verify retained assignment IDs, fields and exact expected name-to-UUID conversions, including unchanged person and existing UUID assignments. Avoid placing data dumps in the checkout. A snapshot of assignment rows alone is not a complete recovery plan. Establish a recovery route for a partially applied chain before proceeding; restoration itself requires a separate decision if it would discard later customer writes.

Completion criterion: migration allowlist/history agree, preflight returns zero problems, and recovery artifacts/access and verification comparisons are ready.

## 3. Pause old writers, then apply the migrations

Stage the compatible application artifact and confirm the deployment path first. Use supported maintenance controls to prevent old application traffic and writes throughout the cutover. Cover existing browser sessions, direct Supabase requests, alternate/preview deployments connected to production, API clients and scheduled/background writers. A landing page on the primary domain or a request to reload tabs alone is insufficient. Preserve a restricted operator path for verification without exposing general traffic. Capture prior settings for restoration and verify that a representative old client cannot write.

If available infrastructure cannot enforce that pause without unreviewed application/schema changes or weakened security, stop before migration and explain the missing capability. Do not invent a control, silently revoke database privileges, or proceed on the assumption that two deployments are simultaneous.

With the pause confirmed, recheck PR head/main, migration history, dry-run and data preflight. Refresh the protected comparison snapshot as needed after writers have drained. A changed candidate/base requires reassessment. Run `supabase db push --linked` from the verified project directory, accepting only the reviewed pending list. Capture exit status and applied versions without logging credentials.

Verify remote migration history, expected functions/triggers/RLS/privileges, zero remaining invalid Group references, the expected conversion count, and preservation of assignment IDs and all non-assignee fields. Confirm person assignments and already-canonical Group assignments are unchanged. Keep maintenance enabled on any discrepancy. Earlier migrations may have committed even if a later migration fails; determine the actual applied prefix before any retry. Do not resume old main against a partially applied chain or improvise a downgrade.

Completion criterion: the complete intended migration chain and retained-data comparisons pass while old writers remain paused.

## 4. Merge and confirm the production deployment

Recheck the audited head, current main, required checks, reviews and mergeability. Merge PR #1289 with the repository's allowed strategy and a head condition (`--match-head-commit` with the audited SHA). Do not merely enable auto-merge and assume it completed. Confirm the PR is merged and record the resulting main commit SHA.

Track the normal Vercel production deployment for that exact resulting commit. Require successful production build/deployment, correct environment/project, production alias routing to that deployment and a healthy live response through the operator path. A Ready preview for the branch SHA is insufficient. Keep maintenance enabled until the compatible application is verified. If deployment fails, report its actual state and retain the protected service state; retry only an understood transient failure of the same reviewed artifact. Do not roll back just the application to incompatible old main after conversion.

Completion criterion: the merged commit is the healthy application serving the intended production domains behind maintenance controls.

## 5. Verify in the in-app browser, then reopen

Use the in-app browser against the actual production URL with the supplied credentials. Use normal sign-in/MFA; never forge sessions or bypass application guards. Record expected and observed results, persistence after reload, and relevant browser/network errors without capturing secrets or customer details. Obtain missing credentials when needed; do not replace live verification with a build result.

Check login/logout, authenticated navigation, account/security screen, existing Personnel and availability views, and readable existing Calendar/dashboard Group assignments. In the designated test Organization, create uniquely tagged synthetic records and record their IDs. Exercise daily assignment save/reload, monthly save and quick fill, Group rename reflected in Calendar/three-month view/dashboard, and unchanged person assignments. As the supplied scoped member, verify allowed Group access and denial of out-of-scope access without modifying real records. The recorded generic 500 when replacing an invisible out-of-scope slot is a known presentation limitation; verify the protected row remains intact and report the actual response.

Test password change/recovery, fresh-session restart after completion, and email/MFA changes only on explicitly disposable accounts with a controlled inbox/MFA recovery path. Never change my real account's credentials or send invitations/recovery messages to customers. Mark unavailable flows as not run, with the exact missing prerequisite. If a release-critical check cannot run, keep the cutover protected and ask for that prerequisite rather than declaring release success.

Clean up only the synthetic records created in this run, using their recorded IDs and normal application operations; preserve unrelated test/customer records. Require stale clients to reload onto the new build before permitting writes. Restore temporary maintenance/job settings deliberately, verify fresh sign-in and normal production access once reopened, and check deployment/application errors for regressions. If a critical failure appears after reopening, reapply the verified maintenance controls and report recovery options.

Completion criterion: required live smoke checks pass, task-owned fixture cleanup is accounted for, compatible clients can use production, and temporary controls are restored. Report PR/head/merge/deployment identifiers, applied migrations, preflight and preservation results, backup reference, browser checks and omissions, cleanup, and remaining risks. Do not claim all existing Organizations were individually tested or guarantee zero regressions.
