# PRD 04 Auth Workflow Coverage Audit

Issue: #1027
Parent PRD: #995
Audit date: 2026-05-23

## Scope

This audit compares PRD 04 against the current implementation evidence from earlier auth PRDs. PRD 04 (#995) has no closed child implementation issues yet; #1027 is its first closeout slice. The reviewed behavior was delivered under PRD 01 (#992), PRD 02 (#993), and PRD 03 (#994), and this document uses that evidence to decide which PRD 04 requirements are already satisfied and which still need quality-net work. It intentionally does not add feature behavior.

In the workflow sections below, "product-feature gap" means a missing user-visible workflow result or missing server-side behavior. Audit/observability and test-quality gaps are tracked separately because PRD 04 is the quality net over the earlier feature work.

Cross-PRD evidence reviewed:

- PRD 01 Account Setup Links and setup delivery: #997 through #1007, including merged PR #1005.
- PRD 02 Organization Invitation lifecycle and Access Request bridge: #1008 through #1015, including merged PR #1016.
- PRD 03 durable rate limits and sensitive-action checks: #1017 through #1025, including merged PR #1026.

## Account Setup Links

Covered:

- Explicit setup-link states for pending, expired, revoked, replaced, claimed, failed, completed, and missing are covered in `src/lib/server/accountSetupLinks.test.ts`.
- Atomic claim-before-auth mutation, duplicate/racing completion, failed-after-claim recovery, completion durability, existing-user activation, password update failure, and sign-in failure are covered in `src/lib/server/accountSetupCompletion.test.ts`, `src/lib/server/accountSetupCompletionSupabase.test.ts`, and `src/routes/auth/setup-account/page.server.test.ts`.
- Raw token removal from the browser URL and hidden form state is covered in `src/routes/auth/setup-account/page.server.test.ts`.
- Official-origin setup URL generation, delivery failure, newest-link-only renewal, quiet public renewal outcomes, and no raw token/setup URL persistence are covered in `src/lib/server/accessRequestSetupDelivery.test.ts`, `src/lib/server/authEmailOutbox.test.ts`, `src/routes/auth/renew-invite/page.server.test.ts`, and admin Access Request route/component tests.
- E2E coverage exists for the main Account Setup Link path, resend/newest-link behavior, double-session race behavior, and failed delivery/failed-after-claim support states in `e2e/specs/access-request-auth.spec.ts`.

Remaining gaps:

- No product-feature gap found for Account Setup Link lifecycle behavior.
- Keep one final E2E smoke in #1031, but do not duplicate the existing detailed Account Setup Link E2E suite.

## Access Requests

Covered:

- Public request creation, duplicate pending prevention, approved incomplete renewal, completed/rejected/stale duplicate no-op behavior, renewal-window boundaries, generic public renewal responses, and delivery failure are covered in `src/lib/server/accessRequestSetupDelivery.test.ts`, `src/routes/api/access-requests/server.test.ts`, and `src/routes/auth/renew-invite/page.server.test.ts`.
- Platform review/admin state for setup supportability, approval/resend, completed setup no-resend, delivery failure visibility, invitation-origin context, and linked invitation blocking on rejection are covered in `src/routes/admin/access-requests/page.server.test.ts` and `src/routes/admin/access-requests/page.svelte.test.ts`.
- Invitation-origin read model coverage exists in `src/lib/server/accessRequestInvitationOrigin.test.ts`.

Remaining gaps:

- Audit/log assertions are present for several denial and transition paths, but PRD 04's cross-workflow audit-event coverage should be made explicit in #1030 so supportable metadata and secret omission are tested uniformly.

## Organization Invitations

Covered:

- Durable lifecycle storage, pending-only uniqueness, normalized-email matching, role/access snapshot preservation, and migration backstops are covered in the organization invitation storage, transition, role snapshot, bridge, and blocking migration tests.
- Existing-user acceptance, expired/already-member/setup-required/blocked outcomes, decline, revoke, terminal history, and notifications are covered in `src/lib/server/core/useCases/dashboardOrgAccess.test.ts`, `src/lib/server/adapters/supabaseDashboardOrgAccess.test.ts`, and `src/lib/server/auto-accept-org-invites.test.ts`.
- Invitation creation governance, admin/member-management escalation prevention, immutable access snapshots, non-user Access Request bridge, duplicate Access Request linking, bridge failure blocking, resend, delivery failure, and rate-limit behavior are covered in `src/lib/server/core/useCases/orgSettingsMemberManagement.test.ts`, `src/lib/server/adapters/supabaseOrgSettingsMemberManagement.test.ts`, `src/lib/server/organizationInvitationDelivery.test.ts`, and `src/lib/server/organizationInvitationRateLimit.test.ts`.
- Organization settings visibility for pending versus terminal invitation history, blocked states, delivery state, and resend/revoke flows is covered in `src/routes/org/[orgId]/settings/organizationSettingsWorkspace.server.test.ts`, `src/routes/org/[orgId]/settings/page.server.test.ts`, and `src/routes/org/[orgId]/settings/page.svelte.test.ts`.

Remaining gaps:

- No product-feature gap found in the invitation lifecycle or platform-approval boundary.
- Final E2E smoke in #1031 should exercise the sign-in/dashboard invitation path lightly, because current E2E coverage is stronger for Account Setup Links than for Organization Invitation acceptance.

## Durable Rate Limits

Covered:

- Shared durable limiter behavior, deterministic time, window reset, retry metadata, and shared storage adapter coverage are in `src/lib/server/rateLimit.test.ts`, `src/lib/server/durableRateLimit.test.ts`, and the workflow-specific limiter tests.
- Public Access Request limits are covered in `src/lib/server/accessRequestRateLimit.test.ts` and `src/routes/api/access-requests/server.test.ts`.
- Account Setup renewal and completion limits are covered in `src/lib/server/accountSetupRateLimit.test.ts`, `src/routes/auth/renew-invite/page.server.test.ts`, and `src/routes/auth/setup-account/page.server.test.ts`.
- Platform Access Request approval/resend limits are covered in `src/lib/server/platformAccessRequestRateLimit.test.ts` and `src/routes/admin/access-requests/page.server.test.ts`.
- Organization Invitation create/resend limits are covered in `src/lib/server/organizationInvitationRateLimit.test.ts` and `src/lib/server/core/useCases/orgSettingsMemberManagement.test.ts`.
- Forgot-password and password-update durable limiters are covered in `src/lib/server/forgotPasswordRateLimit.test.ts`, `src/lib/server/passwordUpdateRateLimit.test.ts`, `src/routes/auth/forgot-password/page.server.test.ts`, and `src/routes/api/auth/update-password/server.test.ts`; #1030 should include them in the cross-workflow metadata consistency check.

Remaining gaps:

- No product-feature gap found for durable limiter behavior.
- #1030 should verify rate-limit audit metadata across workflows uses safe action and target context without raw tokens, setup URLs, passwords, or provider secrets.

## Sensitive Actions

Covered:

- Shared authorizer behavior for recent session, MFA assurance, stale session, suspended actor, denial copy, step-up path, and audit details is covered in `src/lib/server/sensitiveActionAuthorizer.test.ts`.
- Platform Access Request approval/resend enforcement is covered in `src/routes/admin/access-requests/page.server.test.ts`.
- Owner danger-zone ownership transfer and organization deletion enforcement is covered in `src/lib/server/core/useCases/orgSettingsAdministration.test.ts`.
- Billing checkout, portal, and cancellation enforcement is covered in `src/lib/server/core/useCases/billing.test.ts`.
- High-privilege member-management invitation, update, grant/revoke, and removal enforcement is covered in `src/lib/server/core/useCases/orgSettingsMemberManagement.test.ts`.
- Ordinary low-risk member invitation remains usable without step-up when governance allows it.

Remaining gaps:

- No product-feature gap found for sensitive-action enforcement.
- #1030 should ensure denials and high-risk allowed actions have consistent audit-safe metadata across all migrated sensitive-action call sites.

## Audit And Observability

Covered:

- Admin Access Request support summaries distinguish delivery, setup-link, completion, failed, replaced, revoked, and invitation-origin states.
- Organization settings separates pending invitation actionability from terminal invitation history and exposes delivery/retry state.
- Multiple tests assert secret redaction for Account Setup email outbox and setup-rate-limit metadata.

Remaining gaps:

- Add supportable audit-event gap coverage in #1030. Focus on behavior assertions at audit seams, not source-text matching:
  - major lifecycle transition events exist where product support needs them;
  - metadata includes safe identifiers such as Access Request ID, setup link ID, invitation ID, organization ID, actor, target, state transition, and failure category;
  - metadata omits raw setup tokens, full setup URLs, passwords, service role keys, raw sessions, and provider secrets;
  - rate-limit and sensitive-action denial events include stable action/reason context.

PRD 04 event inventory for #1030:

| PRD 04 event category | Current status |
| --- | --- |
| `access_request.submitted` | Behavior exists through public Access Request submission; add explicit safe audit metadata coverage if an audit event is expected. |
| `access_request.approved` | Covered by admin Access Request tests. |
| `access_request.rejected` | Covered by admin Access Request rejection tests. |
| `account_setup.link_created` | Adapted as `access_request.account_setup_link_sent` / resent delivery events; #1030 should confirm the setup link ID and target context are audit-safe. |
| `account_setup.link_revoked` | Setup-link replacement/revocation behavior is covered; explicit audit-event coverage is a gap unless already emitted indirectly through sent/resent events. |
| `account_setup.link_claimed` | Claim behavior is covered; explicit audit-event coverage is a gap. |
| `account_setup.completed` | Completion behavior is covered; explicit audit-event coverage is a gap. |
| `account_setup.failed` | Failed-after-claim behavior is covered; explicit audit-event coverage is a gap. |
| `account_setup.email_queued` | Delivery outbox persistence is covered; explicit event naming may remain implementation-specific. |
| `account_setup.email_sent` | Adapted as `access_request.account_setup_link_sent` / resent events and outbox sent state. |
| `account_setup.email_failed` | Covered as `access_request.account_setup_link_delivery_failed` and outbox failed state. |
| `organization_invitation.created` | Invitation creation audit behavior is covered in member-management use-case tests. |
| `organization_invitation.email_queued` | Invitation outbox persistence is covered; explicit event naming may remain implementation-specific. |
| `organization_invitation.email_sent` | Invitation delivery behavior is covered; #1030 should confirm audit-safe metadata. |
| `organization_invitation.email_failed` | Invitation delivery failure behavior is covered; #1030 should confirm audit-safe metadata. |
| `organization_invitation.accepted` | Acceptance behavior and notifications are covered; #1030 should confirm supportable audit metadata. |
| `organization_invitation.declined` | Decline behavior and notifications are covered; #1030 should confirm supportable audit metadata. |
| `organization_invitation.revoked` | Revoke behavior and audit event are covered in member-management use-case tests. |
| `organization_invitation.expired` | Expired behavior is covered; #1030 should confirm whether an explicit audit event is needed or whether non-actionable support state is enough. |
| `organization_invitation.blocked` | Covered through `organization_invitation.blocked_by_access_request_rejection` migration/use-case tests. |
| `security.rate_limit_exceeded` | Covered for public Access Requests; workflow-specific rate-limit events also exist for setup, invites, forgot-password, password update, and platform setup actions. |
| `security.sensitive_action_step_up_required` | Sensitive-action denial behavior is covered; #1030 should confirm consistent event naming and reason metadata across call sites. |

## Test Cleanup

Covered:

- The high-value behavior suites now cover the main PRD 04 workflows at use-case, route, adapter, component, and selected E2E seams.

Remaining gaps:

- #1028 should prune or rewrite low-value tests that only assert migration/source text when higher-value behavior tests already cover the same contract.
- The highest-risk cleanup candidates are static migration/source-shape tests under `src/lib/server/db/*Migration.test.ts`, especially auth workflow files that assert SQL string fragments instead of a behavior seam:
  - `accountSetupLinksMigration.test.ts`
  - `accountSetupRateLimitsMigration.test.ts`
  - `authEmailOutboxMigration.test.ts`
  - `organizationInvitationLifecycleStorageMigration.test.ts`
  - `organizationInvitationLifecycleTransitionsMigration.test.ts`
  - `organizationInvitationMembershipRoleSnapshotMigration.test.ts`
  - `organizationInvitationEmailOutboxMigration.test.ts`
  - `accessRequestOrganizationInvitationLinksMigration.test.ts`
  - `acceptOrganizationInvitationTransitionMigration.test.ts`
  - `acceptInvitationRequiresCompletedAccessRequestSetupMigration.test.ts`
  - `rejectAccessRequestBlocksLinkedInvitationsMigration.test.ts`
  - `durableRateLimitsMigration.test.ts`
- Keep static migration guards only when they protect a schema or RLS (row-level security) contract that is not currently covered by a better behavior test. Prefer converting important checks into adapter/use-case tests, local RPC smoke tests, or focused governance checks.

## Test Utility Inventory

PRD 04 asks for reusable factories for Access Requests, Account Setup Links, Organization Invitations, Organization Memberships, fake email delivery records, and users in specific states. Current coverage uses useful helpers, but they are spread across individual test files:

- Access Requests: local helpers such as `makeSelectAccessRequest` and `makeUpdateAccessRequest` exist in `src/routes/admin/access-requests/page.server.test.ts`; Access Request rows are also hand-built in `src/lib/server/accessRequestSetupDelivery.test.ts`.
- Account Setup Links and sessions: `createAccountSetupLinkService` and `createAccountSetupSession` are production helpers reused in tests, but scenario setup is still local to `src/lib/server/accountSetupLinks.test.ts`, `src/lib/server/accountSetupCompletion.test.ts`, and `src/routes/auth/setup-account/page.server.test.ts`.
- Organization Invitations: pending-invitation builders exist in `src/lib/server/adapters/supabaseDashboardOrgAccess.test.ts` and `src/lib/server/adapters/supabaseOrgSettingsMemberManagement.test.ts`; invitation workflow state is also assembled inline in `src/lib/server/core/useCases/dashboardOrgAccess.test.ts` and `src/lib/server/core/useCases/orgSettingsMemberManagement.test.ts`.
- Organization Memberships and users: membership/user shapes are created inline across dashboard, org settings, authorization, and adapter tests rather than through one shared auth-workflow fixture.
- Fake email delivery records: Account Setup outbox tests and Organization Invitation delivery tests have local stores/builders, but no shared delivery-row factory.
- Rate-limit decisions: workflow-specific tests use shared durable limiter stores and local fake stores, but no shared fixture creates limited/allowed decisions across Access Request, setup, invitation, forgot-password, and password-update paths.

Remaining gap for #1029: consolidate these into behavior fixtures that describe workflow states rather than private implementation shape. The fixture set should cover at least Access Request states, setup-link/session states, invitation lifecycle states, membership/user identities, email delivery rows, and limiter decisions.

## Recommended Remaining Slices

1. #1028: prune low-value migration/source-shape tests and keep only contract-worthy static guards.
2. #1029: consolidate auth workflow test utilities around behavior fixtures so future tests can create Access Requests, setup links/sessions, invitations, delivery rows, and limiter decisions without duplicating private setup details.
3. #1030: add supportable audit-event gap coverage for lifecycle transitions, rate limits, sensitive-action denials, and secret omission.
4. #1031: add final auth workflow E2E smoke coverage that lightly crosses Account Setup, Organization Invitation acceptance, and support/admin visibility without duplicating existing focused suites.

## PRD 04 User Story Cross-Check

- User stories 1-5: covered by admin Access Request support state and Account Setup Link completion history tests; audit-event consistency remains for #1030.
- User stories 6-8 and 10: covered by Organization Invitation settings/dashboard lifecycle tests; final invitation E2E smoke remains for #1031.
- User story 11: covered by setup-link recovery copy tests for expired, replaced, used, claimed, and failed states in `src/routes/auth/setup-account/page.server.test.ts`; final smoke coverage should avoid duplicating those focused cases.
- User stories 9, 15, and 28: covered by sensitive-action use-case tests; consistent audit metadata remains for #1030.
- User stories 12-14: partially covered by existing audit/log assertions and redaction tests; complete cross-workflow audit-event coverage remains for #1030.
- User stories 16-20: supported by existing test helpers and fake adapters, but #1029 should consolidate them into reusable behavior fixtures.
- User stories 21-27: covered by focused behavior tests for double-submit setup, double-accept invitations, admin escalation blocking, non-user invite onboarding, durable rate limits, tokenless setup URLs, public-origin generation, and password-policy handling.
- User story 29: workflow-state vocabulary is represented in user-facing route/component tests; #1030 or #1031 should keep any final smoke assertions in TroopToTask vocabulary rather than provider-specific copy.
- User story 30: this audit keeps the remaining work as vertical slices (#1028 through #1031) and avoids adding parallel feature logic.

## Conclusion

PRD 04's product behavior is substantially satisfied by implementation work from PRDs #992, #993, and #994. The remaining PRD #995 closeout should not add parallel feature logic. It should make the quality net smaller, clearer, and more supportable: prune brittle tests, centralize test fixtures, add targeted audit-event coverage, and finish with one small end-to-end smoke path.
