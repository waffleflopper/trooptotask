# Launch Acquisition Path

## Selected path

Public acquisition uses reviewed Access Requests. Anonymous GET and POST to
`/auth/sign-up` redirect to `/auth/request-access` regardless of billing settings;
authenticated requests retain their authentication/MFA continuation. The public
signup form, provider signup operation and signup-only limiter have been removed
by stabilization task 03-01a.

Public CTAs say `Request Access` and link directly to `/auth/request-access`.

1. The user submits an Access Request.
2. A platform admin reviews the request.
3. Approval creates or renews an app-owned Account Setup Link.
4. The user completes account setup and chooses a password, activating only the User Account.
5. Organization creation and Organization Membership remain separate workflows.

New invitees receive an owner-authorized approved Access Request, an Account
Setup Link email and a separate Organization Invitation email, independent of
billing settings. Existing accounts keep invitation acceptance. Invitation resend
and outbox retry never mint a setup credential: linked incomplete accounts receive the
setup-recovery destination; completed accounts receive sign-in. Legacy unlinked
recipients without a usable account receive Request Access and must obtain approval
before account setup. Setup alone does
not grant Organization Membership. The signup-only provider confirmation template
and its local configuration have been removed. Local provider signup is disabled;
reviewed setup uses the server admin API and email sign-in remains enabled.
Shared confirmation still handles
previously issued links, provider invitations and password recovery.

Before releasing this cutover, the owner must check hosted auth configuration and
any pending legacy unlinked invitations. Resend does not retrospectively approve
access: an invitee with no reviewed request must use Request Access or receive a
new authorized invitation. No live invitation disposition is claimed here.

The billing/support/activation sections below describe still-existing consumers
owned by later Phase 03 deliverables; they do not authorize restoring public signup
or activating billing. [The stabilization queue](stabilization/TODO.md) supersedes
the former self-service launch plans.

## Billing entry point

The current billing entry point remains authenticated Organization billing:
`/org/[orgId]/billing`. Checkout is gated by `PUBLIC_BILLING_ENABLED`, server
catalog validation, and Organization billing authorization.

Self-service billing must not start before email confirmation and Organization
creation are settled. After Organization creation, the owner lands on the
dashboard with Free active and can open Billing to choose Team or Unit checkout
only when billing is enabled. Pending checkout, failed payment, duplicate
checkout attempts, expired checkout, and cancellation recovery must use
customer-safe copy before any platform approval step exists.

## Support

Support owner: Robert.

Support channel: `support@trooptotask.org` for billing and account support.
Privacy requests use `privacy@trooptotask.org`; security reports use
`security@trooptotask.org`. Billing and account support notes must follow the
no-secret evidence rules in
`docs/security/operational-control-evidence.md` and
`docs/billing-operations-launch-checklist.md`.

Support must be able to answer:

- whether a user is still in reviewed access from Admin -> Access Requests,
- whether a self-service user confirmed email from Admin -> Users,
- whether an Organization exists and who owns it from Admin -> Organizations
  and the user's Organization memberships,
- whether checkout is active, failed, expired, canceled, or pending recovery
  from Admin -> Subscriptions and Admin -> Billing Events,
- which Stripe customer ID, subscription ID, invoice ID, and webhook event ID
  types are safe to use for support correlation.

Support must not ask customers for card details, raw payment method data,
webhook secrets, API keys, session cookies, or screenshots that expose secret
values. Use Organization ID, user ID, Stripe customer ID, subscription ID,
invoice ID, webhook event ID, and app audit-log ID as identifier types only in
repo docs and PR notes.

## Activation health

Acquisition support answers whether a customer reached the app and checkout.
Activation health answers whether a self-service or paid Organization has enough
coarse setup to reach first product value. It is an Organization-level support
view, not personal analytics, and must use existing operational records unless a
separate privacy-reviewed persistence plan is approved.

| Stage                                       | Existing support-safe source                                                                       | Current handling                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Signup submitted                            | Admin -> Users account creation and signup support logs                                            | User-level support fact; not copied into activation health rows.                                                                                |
| Email confirmed                             | Admin -> Users email confirmation state; Organization creation is already email-confirmation gated | Treat Organization creation as confirmation-gated; use Admin -> Users for exact user confirmation questions.                                    |
| Organization created                        | `organizations.created_at`, owner membership, and Admin -> Organizations                           | Computed directly.                                                                                                                              |
| Checkout started                            | `organization_checkout_attempts.status` and `created_at`                                           | Computed as a coarse checkout attempt count/status without checkout URLs or session IDs.                                                        |
| Checkout completed or recovered             | `organization_checkout_attempts.completed_at/status` plus `organization_billing_snapshots` state   | Computed as completed/recovered at Organization level; detailed billing repair remains in Admin -> Subscriptions and Admin -> Billing Events.   |
| Meaningful roster                           | active `personnel` count                                                                           | Computed as at least 5 active personnel. Exact roster import completion is deferred because no durable import milestone exists.                 |
| Invited leader accepted                     | `organization_memberships` owner/admin count                                                       | Computed as more than one accepted owner/admin Organization Membership. Pending invite analysis stays in member-management/support views.       |
| Seeded defaults reviewed                    | `status_types` and `assignment_types` counts only                                                  | Counts show defaults/configuration exist; they are not proof a leader reviewed them. Exact reviewed state requires a separate persistence plan. |
| First Duty Roster activity                  | `duty_roster_templates`, `duty_roster_template_runs`, and legacy `duty_roster_history` counts      | Computed when templates or runs/history exist.                                                                                                  |
| Onboarding, training, or eval setup started | `onboarding_template_steps`, `training_types`, and `rating_scheme_entries` counts                  | Computed as aggregate setup-started signals.                                                                                                    |

Organization creation still seeds only the basic day-one defaults such as
Groups, availability statuses, assignment types, and federal holidays. Starter
configuration packs are opt-in from the first-run setup path and must not be
silently applied during Organization creation.

The First Week Operations starter pack creates editable workflow configuration
artifacts: starter Training Types, an onboarding template with ordered steps,
and a Duty Roster template scaffold. Treat those artifacts as setup progress
for activation-health support views, not as proof that a workflow is high
quality, formally reviewed, command-ready, certified, or doctrinally complete.

Activation health must not capture raw IP addresses, checkout URLs, Stripe
Checkout session URLs, raw emails beyond existing account records, source URLs
with secrets, Vercel Analytics identifiers, raw webhook payloads, card details,
API keys, webhook secrets, session cookies, or personal behavior streams. If
Robert needs exact milestone history later, create a separate schema and
retention plan before adding new analytics persistence.

## Anti-abuse and rate limits

Reviewed access retains durable limits around Access Request submission, Account
Setup Link renewal/completion and invitations. User Account activation still
requires valid setup proof and password selection. Organization creation requires
confirmed email. Setup and confirmation do not create Organization Membership.
Shared authentication, confirmation, recovery and limiter helpers remain owned by
their retained callers; deleting public signup does not remove their protections.

## ADR compatibility

[ADR 0009](architecture/adrs/0009-beta-access-request-account-setup-links.md) governs
reviewed acquisition. Its former billing-enabled public signup exception is
superseded by stabilization. Access Requests, Account Setup Links, User Accounts
and Organization Membership remain separate concepts. Historical self-service
plans are not current execution instructions.
