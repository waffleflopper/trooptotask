# ADR 0009: Beta Access Request Account Setup Links

Status: Accepted
Date: 2026-05-18

## Context

### Current-state truth

- TroopToTask uses Supabase Auth as the authentication provider.
- The beta **Access Request** flow currently approves requests by sending Supabase invite emails with `inviteUserByEmail`.
- Supabase invite links expire after 24 hours.
- Many beta recipients use military email addresses, may only check those inboxes during the duty week, and may miss links sent or approved near a weekend.
- When the link expires, Supabase may already have a partial **User Account**, which makes the recovery path feel like password reset even though the recipient thinks they are still trying to register.
- `/auth/renew-invite` already provides a self-service escape hatch for approved incomplete requests, but the default approval link still creates avoidable expiry pressure.
- The legacy `/auth/register` invite-code path no longer has known unused codes in the wild.
- Follow-up update, 2026-06-01: `/auth/register`, `registration_invites`, and `access_requests.invite_id` were fully removed.
- Follow-up update, 2026-08-03: **Access Request** approval is no longer always a platform-admin act. Requests bridged from an **Organization Invitation** are auto-approved by the inviting organization owner or admin, and their **Account Setup Link** is issued at invite time. See [ADR 0012](0012-organization-invited-platform-access-auto-approval.md).
- **Access Requests** exist for beta-period platform access control and cost control by the developer, not as a permanent replacement for organization governance.

### Decision pressure

- The 24-hour Supabase invite expiry blocks practical Friday, Saturday, and Sunday approvals.
- The recovery flow is unintuitive because recipients do not know whether they have a **User Account**, an expired setup link, or a pending request.
- Sending temporary passwords would avoid the 24-hour email link but would create worse credential handling and support problems.
- Future contributors need a clear rule for whether beta entry, **User Account** creation, and **Organization Membership** creation are the same workflow. They are not.

## Decision

- Replace Supabase invite emails as the product-level beta setup mechanism with app-owned **Account Setup Links**.
- Keep Supabase Auth as the authentication provider.
- **Access Request** approval creates or renews an app-owned setup token, not a Supabase **User Account**.
- Store setup tokens only as hashes. Raw setup tokens may appear only in the emailed setup URL.
- Each approved **Access Request** may have only one active **Account Setup Link** at a time.
- Creating a fresh setup link revokes any older unused setup links for the same **Access Request**.
- **Account Setup Links** expire after 14 days.
- Approved **Access Requests** remain eligible for fresh setup links for 90 days unless manually rejected or otherwise closed.
- When a valid **Account Setup Link** is used, the recipient chooses their own password before TroopToTask creates or activates the Supabase **User Account**.
- If a Supabase **User Account** already exists for the setup email, completing the **Account Setup Link** activates that existing account and replaces its password with the password entered in the setup form. This keeps overlapping beta access and organization-invite paths on one identity, but the setup page must be treated as an account-credential reset for that email.
- The Supabase **User Account** should be created with the email already confirmed because the one-time setup link sent to that address is the email-control proof.
- Completing beta account setup creates only a **User Account**. It does not create an **Organization Member**.
- Existing **Organization Invitation** and membership acceptance behavior remains a separate organization-governance workflow.
- `/auth/renew-invite` becomes the self-service path for fresh **Account Setup Links** when a setup link expires or is replaced.
- `/auth/request-access` should route duplicate approved-but-incomplete emails into fresh setup delivery instead of creating another pending request.
- `/auth/register` invite-code registration is deprecated and should not remain a parallel registration system.
- Cleanup should revoke or delete stale setup-link records. It should not delete **Access Requests** or Supabase **User Accounts** by default.

## Rejected Or Deferred Alternatives

- Continue using Supabase invite emails as the product-level approval flow.
  - Rejected because the 24-hour expiry is too short for the military-email and weekend approval reality.
- Tell users to use password reset whenever an invite expires.
  - Rejected because it exposes backend implementation details and confuses users who do not know a partial **User Account** may already exist.
- Email temporary passwords and force a password change on first sign-in.
  - Rejected because credentials in email create worse security, support, and cleanup problems than app-owned setup tokens.
- Create Supabase **User Accounts** at approval time and clean up unclaimed accounts later.
  - Rejected because account deletion is riskier than deleting setup-link records, and account identity should be created only after valid setup plus password entry.
- Keep invite-code registration as a long-term parallel path.
  - Rejected because known legacy invite codes have already been used and the path exists only as old compatibility.
- Create **Organization Members** during beta access setup.
  - Rejected because beta platform access, **User Account** activation, and **Organization Membership** are separate domain concepts with different governance rules.

## Guardrails And Exceptions

- Do not use Supabase invite email expiry as the product-level beta approval window.
- Do not email temporary passwords.
- Do not create unaffiliated Supabase **User Accounts** before a valid setup link is used and a password is chosen.
- The 2026-06-16 billing-enabled public signup exception was superseded by
  stabilization task 03-01a on 2026-09-18. Public GET/POST `/auth/sign-up`
  always redirects to reviewed acquisition; authenticated requests preserve
  their existing continuation. Account setup remains distinct from Organization Membership.
- Do not treat **Access Requests** as **Organization Invitations**.
- Do not create **Organization Members** from beta **Access Request** completion.
- Keep auth-provider-specific implementation at auth edges or adapters as allowed by ADR 0004.
- Legacy code that handles existing Supabase invite or recovery states may remain temporarily as migration compatibility, but new beta setup behavior should follow this ADR.
- Exception, 2026-08-03: **Account Setup Links** may be issued by a second, non-platform-admin path — the organization-invitation auto-approval flow in [ADR 0012](0012-organization-invited-platform-access-auto-approval.md) — for new invitees unconditionally since stabilization 03-01b. Every rule in this ADR about token hashing, single active link, 14-day expiry, and identity creation after password entry applies unchanged to that path. New issuers must compose the shared `accountSetupLinkIssuance` module rather than re-implementing create-then-deliver.

## Consequences

- Expected benefits:
  - Friday and weekend approvals become practical because the setup window is 14 days instead of 24 hours.
  - Expired setup recovery becomes self-service and understandable.
  - User identity is created only after the recipient proves email control and chooses a password.
  - Cleanup becomes low-risk because stale setup records can be removed without deleting real accounts.
  - Beta access control remains platform-level and does not muddy organization membership semantics.
- Tradeoffs:
  - TroopToTask now owns token creation, hashing, expiry, renewal, and delivery for beta account setup.
  - The setup flow needs careful audit and rate-limit treatment because it can create **User Accounts**.
  - Some existing auth routes and copy need migration away from Supabase-invite language.
- New risks or migration costs:
  - Existing partial Supabase invite users need a legacy compatibility branch during rollout.
  - Email delivery templates and local auth testing need updates.
  - Admin UI must explain setup states without leaking token details.

## Rollout And Follow-Up

- Add setup-link storage for approved **Access Requests**, including hashed token, `expires_at`, `used_at`, and `revoked_at`.
- Add explicit setup completion tracking such as `access_requests.setup_completed_at`.
- Update approval and resend actions to create **Account Setup Links** instead of calling `inviteUserByEmail` as the main path.
- Build `/auth/setup-account` to validate setup tokens and create or activate Supabase **User Accounts** after password entry.
- Convert `/auth/renew-invite` into the fresh setup-link request path.
- Removed `/auth/register` on 2026-06-01 after legacy invite-code links no longer needed a handoff route.
- Update request-access copy so the user understands the 14-day setup window and the fresh-link path.
- Add cleanup for stale setup-link records.
- Keep tests around expired links, replaced links, duplicate requests, existing-user compatibility, and setup completion.

## Links

- Related PRD:
- Related issue:
- Related ADRs:
  - [ADR 0004: V1 Provider Boundary Contract](0004-v1-provider-boundary-contract.md)
- Related docs:
  - `CONTEXT.md`
  - `UBIQUITOUS_LANGUAGE.md`
  - `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
  - `docs/architecture/ADR_INDEX.md`
