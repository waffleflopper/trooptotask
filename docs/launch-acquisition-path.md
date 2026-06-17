# Launch Acquisition Path

Selected path: Env-gated public acquisition path for paid launch

Date selected: 2026-06-15

## Selected path

TroopToTask will keep acquisition environment-gated for launch readiness:

- When `PUBLIC_BILLING_ENABLED` is off, public users use the reviewed
  `/auth/request-access` flow. Platform admins approve access, and approved
  users receive an Account Setup Link.
- When paid billing is turned on, the target path is open self-service
  registration with email confirmation and no request-access gate.
- Plans 083-087 add the self-service signup identity layer, post-confirmation
  first Organization setup path, explicit Free-first checkout entry,
  support/admin visibility, and focused E2E coverage.

This document selects one launch direction: reviewed access remains the live
public path until the self-service acquisition plans are complete and billing is
enabled.

## Who this path is for

The reviewed path is for early paid-launch and pre-billing users whose account
creation should still be manually approved before a User Account is activated.
It is also the safe fallback while billing is disabled.

The billing-enabled self-service path is for public paid customers who should be able to
create a User Account, confirm email control, create an Organization, and enter
checkout without a platform-admin approval step.

## Public CTA

While billing is disabled, public CTAs should continue
to say `Request Access` and route unauthenticated users to
`/auth/request-access`. Public pricing may show final Team and Unit prices, but
it must not imply that an unapproved public user can create an Organization or
start checkout today.

When billing is enabled and the self-service route is exposed, the public CTA should
move to account creation language such as `Create Account` or `Get Started`,
backed by a real route and email-confirmation flow. Do not use trial language
for launch; new self-service Organizations start on Free until the owner chooses
an explicit Team or Unit upgrade checkout from Billing.

## After approval or signup

Reviewed access:

1. The user submits an Access Request.
2. A platform admin reviews the request.
3. Approval creates or renews an app-owned Account Setup Link.
4. The user completes account setup, chooses a password, and activates only the
   User Account.
5. Organization creation and Organization Membership remain separate workflows.

Self-service target:

1. The user creates a User Account through a public registration route.
2. The user confirms email control before entering app-owned onboarding.
3. The user creates the first Organization.
4. The new Organization lands on the owner dashboard with Free active.
5. The owner can open Billing and choose `Upgrade to Team` or
   `Upgrade to Unit` checkout, or continue on Free.

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

Support channel: Robert-owned launch support channel or mailbox, to be
confirmed before enabling paid billing. Billing and account support notes must
follow the no-secret evidence rules in
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

## Anti-abuse and rate limits

Reviewed access already uses durable rate limiting around Access Request
submission, Account Setup Link renewal, and Account Setup Link completion.

Self-service registration must add equivalent or stronger protections before it
replaces the request-access gate:

- per-email and per-IP signup limits,
- email confirmation before Organization creation or checkout,
- no User Account creation from unvalidated setup or invitation tokens,
- safe generic error copy that does not expose whether an email already has an
  account,
- audit-safe telemetry for repeated signup, confirmation, organization-create,
  and checkout attempts,
- operational support visibility for blocked or suspicious attempts.

## Follow-up implementation plans

The self-service target is larger than a copy update. Plan 080 created the
following implementation plans, and PR #1230 completed plans 083-087 as the
baseline self-service acquisition path. The separate paid invitation branch
remains tracked by plan 088.

- `plans/083-public-account-creation-abuse-controls.md`
- `plans/084-self-service-organization-onboarding.md`
- `plans/085-checkout-trial-entry-billing-recovery.md`
- `plans/086-support-admin-visibility-self-service.md`
- `plans/087-self-service-acquisition-e2e-coverage.md`

## ADR compatibility

ADR 0009 still holds for the currently live reviewed access path. Access
Request approval still creates or renews an app-owned Account Setup Link, not a
Supabase User Account, and it does not create an Organization Membership.

The self-service registration path must not silently change ADR 0009 semantics.
Plan 083 updated ADR 0009 with a billing-enabled signup exception for User
Account creation, while Access Request, Account Setup Link, User Account, and
Organization Membership remain separate concepts.
