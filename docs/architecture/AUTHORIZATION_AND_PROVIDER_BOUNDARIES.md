# Authorization and provider boundaries

These are the security rules a change must not break. TypeScript policy decides what the app offers. RLS, SQL helpers and Storage policies still enforce every rule on their own, and a TypeScript decision never replaces them.

## Authentication boundary

### Request admission

- [`src/hooks.server.ts`](../../src/hooks.server.ts) composes [Identity](../../src/features/identity/index.server.ts). It admits an actor only when the bearer session, the claims subject and the provider user agree.
- A session lives 24 hours from the original `auth.sessions.created_at`, read through `get_current_session_started_at()` ([`20260630001400_session_timeout_provenance.sql`](../../supabase/migrations/20260630001400_session_timeout_provenance.sql)). Sign-in token issue, refresh and MFA do not reset it. A missing session is expired. Malformed or future facts and provider failures deny with a retryable 503.
- The hook denies dispatch when it cannot verify MFA assurance or user suspension. Identity accepts a suspension fact only from an explicit successful boolean result.
- Logout stays reachable during suspension, pending MFA, pending flows and session-provenance outages. Logout uses `auth.admin.signOut(token, 'global')` with the user's own token. Cookies clear only after the provider acknowledges revocation.
- A pending setup, recovery, invite or MFA flow is not general application access.
- `locals.actor.userId` is the only actor key. A form field, route parameter, cookie, browser store or client-sent role or capability flag grants nothing.
- [Organization admission](../../src/features/organization/admission.server.ts) reads fresh Organization status. It denies every write under an Organization route and every Organization API request, including GET exports, when the Organization is suspended, missing or unverifiable. Page navigation keeps the suspended shell, but its data loads are denied. Admission grants no membership or capability.
- The requested Organization comes from the route. Shared mutable "active Organization" state never selects it.

### Sensitive-action step-up

- Identity's [sensitive-action authorizer](../../src/features/identity/sensitiveActionAuthorizer.server.ts) guards Organization governance, high-privilege membership changes and platform Access Request administration. It binds the actor to the hook-verified session, requires an unexpired token before and after provider reads, and reads assurance for that exact token.
- Recency is 15 minutes from the token's validated authentication time, never the account's last sign-in. Failed assurance cannot fall back to recency. A pending MFA upgrade must complete. Every retry rereads suspension.
- Step-up sends the browser to `/auth/login?reauth=1&next=…` or the MFA page. It grants no permission. The person repeats the action, and the retry is authorized again.
- The database repeats the rule for direct writes through `current_session_sensitive_action_assured()` ([`20261012000400_governance_direct_write_authority.sql`](../../supabase/migrations/20261012000400_governance_direct_write_authority.sql)). It covers owner changes to an admin membership, admin invitations, the ownership transfer RPC and Organization deletion.

### Passwords, email changes and Account Setup

- Password mutation is admitted through the service-only `password_change_attempt` RPC before the provider is called ([`20260630001500_password_attempt_reconciliation.sql`](../../supabase/migrations/20260630001500_password_attempt_reconciliation.sql)). It serializes each actor and stores no credential. A consumed metadata marker and a database witness confirm the write inside the same GoTrue transaction. A status check either observes the committed change or fences the attempt so a late provider write rolls back.
- Provider responses, including errors, are never rollback evidence. An unknown outcome discards the password draft and offers status-only reconciliation. Replay never repeats a mutation.
- Current-password proof uses an isolated nonpersistent auth client whose temporary session is revoked before mutation. Mutation runs on the original hook-bound client after a fresh assurance read for that token. Pending MFA returns `403 mfa_required`.
- Account email changes use the same proof and fresh assurance. After the hook binds the provider user to the token subject, the provider email wins over the token's older email claim.
- Invite finalization requires a stored completed password attempt and fresh assurance before any membership or cookie effect.
- Account Setup claims serialize password setup by normalized email across Access Requests before Supabase Auth. An unresolved claimed link blocks another claim, even after it expires or is revoked. Claims use the same marker, witness and fence. Provider errors, timeouts, link expiry and a newly delivered link do not release a claim. Staff release follows [Account Setup held-claim recovery](../operations/account-setup-claim-recovery.md).
- Anonymous and authenticated roles have no direct writes to setup-link or attempt tables.

### Email links and pending flows

- Recovery and admin invite emails carry one-use token-hash links to `/auth/confirm`. The app generates the link through Supabase Auth, checks recipient and type, and sends it through Resend. Supabase SMTP sends neither email.
- The token is verified only on an explicit POST and is never logged. Identity then issues a signed one-hour pending-flow marker bound to the user and session ([`mfaGate.server.ts`](../../src/features/identity/mfaGate.server.ts)). An OTP session without a valid marker loses its auth cookies before admission.
- `/auth/confirm` never mints an actor. Only a password-authenticated session or a completed marked OTP session receives general actor authority.
- Public recovery returns the same response for an unknown address and a delivery failure.

### Rate limits

- MFA codes against a verified factor are limited to 10 per account per 15 minutes, with no address dimension ([`mfaCodeRateLimit.server.ts`](../../src/features/identity/mfaCodeRateLimit.server.ts)). An unavailable limit returns 503. An exhausted one returns 429 with `Retry-After`.
- Email changes are limited to 5 per user and IP per 15 minutes.
- Admin recovery and resend-invite are limited to 3 per target per hour.
- Public recovery, Access Request submission, Account Setup Link renewal and completion, and invitations keep durable limits.
- The process-local limiter matches the decoded path ([`rateLimit.server.ts`](../../src/lib/access/rateLimit.server.ts)), so percent-encoded spellings share a limit.

### Browser boundary

Provider sessions and tokens stay in HttpOnly cookies. The root layout serializes only Identity's `IdentityViewer`, and no load returns `locals.session`. The browser has no provider client, so the CSP allows no provider origin.

## Authorization model

- An Organization membership row holds the user, role, preset, per-lane overrides and Group scope. A Personnel record is not a user account or a membership.
- There is no self-service sign-up. `/auth/sign-up` sends an anonymous GET or POST to `/auth/request-access`. An authenticated request continues its pending auth or MFA flow.
- Access Request approval issues an Account Setup Link. Completing setup with a password creates the User Account. Neither grants membership or capability. Invitation acceptance binds the authenticated subject and normalized email to a pending, unexpired invitation in SQL ([`20260629000100_accept_invitation_with_completed_email_setup.sql`](../../supabase/migrations/20260629000100_accept_invitation_with_completed_email_setup.sql)). Invitation resend never mints a setup credential.
- Inviting a new person creates an owner-authorized approved Access Request with an Account Setup Link and sends a separate Organization Invitation email. An existing account accepts the invitation directly. A failed setup link blocks the invitation.
- Creating an Organization needs an email-confirmed account and a valid name. One `create_organization` call creates the Organization, its owner membership and the default Groups, status types, assignment types, special days and ranks. A retry with the same request ID never creates a duplicate. No ownership or quantity cap applies.
- Roles are `owner`, `admin` and `member`. Owner and admin are fixed Organization-wide governance roles. Updating admin access, transferring ownership, deleting the Organization and reading audit logs are owner-only ([`policyEvaluator.ts`](../../src/lib/access/policyEvaluator.ts)). Member customization never creates a partial admin.
- Member access is a preset (`viewer`, `operator`, `editor`), per-lane overrides and one shared scope set ([`memberAccessShape.ts`](../../src/lib/access/memberAccessShape.ts)). Presets are platform-defined shapes, not roles. Lane levels are `none`, `view`, `operate` and `configure`.
- Scope is the whole Organization or one or more Groups, shared by every scoped lane. There are no per-feature scope matrices and no Personnel-specific scope.
- Governance (member management, Organization settings, Organization deletion) stays outside the lane map. Platform Administration uses one operator membership in `platform_operators`, separate from Organization membership. `is_platform_operator()` requires operator membership, an `aal2` claim and an unsuspended account for SQL access. Platform admission checks operator membership and MFA at `aal2` before decoding command input. Operators without MFA enroll first. Suspend and unsuspend also require a TOTP verification within ten minutes through the sensitive-action authorizer. The server rejects self-suspension. Every platform command awaits a required audit write and reports its failure. Operator membership changes require reviewed SQL or a migration.
- [`serverPolicy.server.ts`](../../src/lib/access/serverPolicy.server.ts) decides actions. UI visibility is advisory. Page actions, JSON endpoints and every other delivery path reach the same policy.

### Feature lanes

The six lanes are `calendar`, `personnel`, `training`, `criticalTasks`, `onboarding` and `ratingScheme`. Each is independently grantable, and no lane borrows another. A feature that needs roster data reads it through a Personnel-owned server port that checks the caller's own lane before a privileged, Organization- and Group-scoped read. A Rating Scheme-only member can use Evals without Personnel access. Dashboard shows Training readiness only with Training `view`.

An Organization feature switch ([`featureSwitches.ts`](../../src/lib/access/featureSwitches.ts)) turns a feature off for every role, owners and admins included ([`20261021000200_organization_feature_switch_enforcement.sql`](../../supabase/migrations/20261021000200_organization_feature_switch_enforcement.sql)).

- The app projects the lane to `none`. RLS, Storage policies and RPCs deny it too, because `member_access_has_capability` reads the switch outside the owner/admin bypass. `organization_feature_enabled` covers the paths without a lane: Onboarding reads through Personnel `view`, Calendar onboarding markers and award-tracking acknowledgements. Deletion approvals for a switched-off feature stay pending.
- Fresh request authorization denies a switched lane before its page or API operation loads data. Pages render the feature-off state, refresh the shell, and remove the feature from navigation. APIs return 403 with the same feature-off message.
- Onboarding references contain only Training type IDs and names. While Training is off, every packet response presents Training steps as manual checkboxes. Stored hand completion remains visible after re-enabling Training, alongside completion derived from Training records.
- The award acknowledgement column has no direct authenticated SELECT grant. Its member-scoped RPC requires Losses and awards to be on. Other Data Sheet columns have explicit SELECT grants; new columns require a grant. Inserts and updates return only those readable fields.
- Organization JSON and Excel exports omit disabled feature sections and list the omissions in notes. They omit award acknowledgement values while Losses and awards is off. A per-Person workbook omits its Training sheet and includes the same note while Training is off.
- Exception: the owner-only retained-file Storage policy that Organization deletion uses still reads Training certificates and roster scans, so deletion leaves no orphaned files. The owner can turn the feature back on anyway.
- Settings stay readable and writable by role. Member edits and switch changes keep stored lane levels, so turning a feature back on restores exactly the earlier access.

### Group scope

- An empty Group scope sees no Personnel rows and no Groups.
- Unassigned Personnel are visible only to owners, admins and Organization-scoped members with the needed capability ([`20260926000700_personnel_unassigned_scope.sql`](../../supabase/migrations/20260926000700_personnel_unassigned_scope.sql)). The same rule covers Calendar, Training and Rating Scheme rows for those People.
- A Group-scoped member reads only its own Groups ([`20261012000700_group_catalog_scope.sql`](../../supabase/migrations/20261012000700_group_catalog_scope.sql)). Creating, renaming and deleting Groups needs Personnel `configure` over the whole Organization.
- Calendar Group targets must be same-Organization Groups inside the caller's scope ([`20260918000100_enforce_calendar_assignment_group_scope.sql`](../../supabase/migrations/20260918000100_enforce_calendar_assignment_group_scope.sql)).
- Any Calendar `view` member reads every Event of the Organization. Creating, editing and cancelling an Event needs Calendar `operate` over the whole Organization, so a Group-scoped operator reads Events but cannot change them ([`20261026010000_calendar_events.sql`](../../supabase/migrations/20261026010000_calendar_events.sql)). Attribution and Event Activity are written by the database, and cancellation goes through `cancel_calendar_event`. The Events & Taskings switch hides every Event and Tasking route and row.
- A Calendar `view` member reads the Taskings their Group Scope covers: every Tasking when Organization-wide, otherwise only those of their Groups. A Calendar `operate` member creates and edits Taskings within that scope, and only an Organization-wide operator sets Organization level or moves responsibility ([`20261026020000_calendar_taskings.sql`](../../supabase/migrations/20261026020000_calendar_taskings.sql)). Attribution and Tasking Activity are written by the database, and every status move goes through `transition_calendar_tasking`.
- Membership and invitation scopes reject Groups from another Organization.

### Sensitive Personnel artifacts and files

- Reading counseling records, leader notes, follow-ups and documents needs Personnel `configure` and an in-scope Person ([`20260926001100_personnel_sensitive_artifact_reads.sql`](../../supabase/migrations/20260926001100_personnel_sensitive_artifact_reads.sql)). Writing them needs `operate`. The Soldier Data Sheet needs `operate` for reads and writes.
- Files live in the private `counseling-files` and `personnel-documents` buckets. The browser never authenticates to Storage. Downloads go through app routes that mint short-lived signed URLs. Sign-in Roster files follow the Training lane.
- A counseling or document `file_path` must sit under its own Person's prefix, which a trigger enforces. Only the server removes those files. Every new upload first registers its exact key through `register_organization_file_upload`, and a retired key is never reused.
- A current unsuspended owner can list and delete Storage objects under the Organization prefix for Organization cleanup ([`20261002001000_organization_storage_cleanup.sql`](../../supabase/migrations/20261002001000_organization_storage_cleanup.sql)).

## Database enforcement

- Feedback replies are append-only through RPCs. `reply_to_own_feedback` locks the reporter's own thread, attributes the session account, and changes an open thread to `new`. Operator replies change it to `reviewed` or `resolved`. Resolved threads reject either reply path. Authenticated clients cannot insert reply rows directly.
- Direct table writes need the same authority as the app operation ([`20261012000600_feature_direct_write_authority.sql`](../../supabase/migrations/20261012000600_feature_direct_write_authority.sql)). Archive, restore and permanent delete of a Person need Personnel `configure`. People and Personnel artifacts must be archived before deletion.
- Creating active People through Personnel Add Person, Onboarding Add Person and Import needs Personnel `operate` within the member's allowed Groups. Creating an already archived Person still needs `configure`; Group-scoped members cannot create unassigned People.
- Onboarding packets and steps are created only by `start_onboarding_packet` and `reconcile_onboarding_packet`. Clients update only the columns the app's Onboarding operations write. The Onboarding scope helpers live in the unexposed `onboarding_private` schema.
- Clients cannot insert or delete deletion requests directly. The submission route loads the target with the requester's scope and policy and takes Organization and requester from the admitted actor.
- Authenticated invitation updates touch only lifecycle columns.
- Every membership authority helper requires an unsuspended caller and Organization ([`20261012000500_suspension_sql_admission.sql`](../../supabase/migrations/20261012000500_suspension_sql_admission.sql)). Records the account owns, such as its notifications, its deletion requests and invitations to its email, stay readable during suspension.

## Service-role use

- Closing a duty roster DA 6 uses the service-only `close_roster_form` RPC ([`20261023000900_roster_close_server_only.sql`](../../supabase/migrations/20261023000900_roster_close_server_only.sql)). The server computes its record and carry counts with the roster engine. SQL rechecks the signed-in actor's Organization-wide Calendar configuration authority and writes every carry row as `carried`.
- Service-role clients serve one named purpose each and run only after authorization. They never make tenant operations generally privileged.
- An Organization-scoped screen may read platform-owned state only through a narrow port that returns the minimum shape, such as `OrganizationInvitationSetupStateLookupPort` (ADR 0012). Never add an RLS grant on a platform table or a mirror table for it.
- Bind service-role ports in a Delivery adapter under `src/lib/server/adapters/`. `scripts/check-governance.mjs` rejects route server files that acquire the admin client.
- Cron routes check `CLEANUP_SECRET` or `CRON_SECRET` before opening an admin client.

## Data retention

The weekly `/api/cleanup-old-data` job also deletes read notifications older than 30 days. It retains unread notifications regardless of age.

[Scheduled Maintenance](../../src/features/scheduled-maintenance/index.server.ts) deletes archived rows older than the Organization's `archive_retention_months` (default 36). Active rows and rows inside the window stay. Retention never deletes an archived assignment type with saved Calendar assignments or a Critical Task with a saved completion. Their RPCs lock candidates and recheck references before deleting. Earlier families stay committed if a later family fails.
