# Plan 088: Add the self-service Organization Invitation branch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This plan touches auth and invitation behavior; if Svelte files
> are edited, follow `docs/agents/svelte.md` and run `svelte-autofixer` until
> clean. If anything in the "STOP conditions" section occurs, stop and report.
> When done, update the status row for this plan in `plans/README.md` unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 97389a0e..HEAD -- docs/launch-acquisition-path.md src/lib/server/organizationInvitationDelivery.ts src/lib/server/organizationInvitationDelivery.test.ts src/lib/server/authConfirm.ts src/routes/auth/sign-up src/routes/auth/confirm src/lib/server/core/useCases/orgSettingsMemberManagement.ts src/lib/server/core/useCases/dashboardOrgAccess.ts src/routes/dashboard`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/083-public-account-creation-abuse-controls.md
- **Category**: direction
- **Planned at**: commit `97389a0e`, 2026-06-22 (reconciled after PR #1230; originally planned at `c6760c16`)

## Reconciliation note

On 2026-06-22, this plan was refreshed after PR #1230 landed plans 083-087 on
`main`. The public signup route, signup confirmation flow, dashboard invitation
surface, and acquisition E2E baseline now exist. The remaining gap is narrower:
no-account Organization Invitation delivery still routes invitees to reviewed
`/auth/request-access`, and signup confirmation still defaults ordinary
self-service users to first Organization creation at `/org/new`.

## Why this matters

The selected self-service launch path says a public paid customer can create a
User Account, confirm email control, then create an Organization or accept an
Organization Invitation. Plans 083-087 cover signup, first Organization
creation, checkout, support visibility, and E2E, but the no-account invitation
branch still points invitees back through reviewed access. Paid launch should
not force invited staff into the old review queue when signup is enabled.

## Current state

- `docs/launch-acquisition-path.md:59-66` defines the completed self-service
  path as signup -> email confirmation -> first Organization -> Free/Billing,
  while `docs/launch-acquisition-path.md:127-130` keeps this paid invitation
  branch tracked separately by plan 088.
- `src/routes/auth/sign-up/+page.server.ts:90-99` sends ordinary signup email
  confirmation through `getAuthConfirmRedirectTo(url.origin, 'email')`.
- `src/lib/server/authConfirm.ts:4-9` maps `email` and `signup`
  confirmations to `/org/new`.
- `src/lib/server/organizationInvitationDelivery.ts:132-139` builds invite URLs
  with `/auth/request-access` when `requiresAccountSetup` is true.
- `src/lib/server/organizationInvitationDelivery.ts:150-175` tells no-account
  invitees to use platform approval and a separate Account Setup Link.
- `src/lib/server/organizationInvitationDelivery.test.ts:89-94` asserts that
  invitees who need account setup go to `/auth/request-access`.
- `src/lib/server/core/useCases/dashboardOrgAccess.ts:154` rejects invitation
  acceptance until account setup is complete.

Current excerpts:

```ts
// src/lib/server/organizationInvitationDelivery.ts:136
return makePublicAppUrl(options.requiresAccountSetup ? '/auth/request-access' : '/auth/login?next=%2Fdashboard', {
	inboundOrigin: publicOrigin
});
```

```ts
// src/lib/server/authConfirm.ts:4
const authConfirmDestinations = {
	email: '/org/new',
	invite: '/auth/accept-invite',
	recovery: '/auth/reset-password',
	signup: '/org/new'
} as const;
```

```ts
// src/routes/auth/sign-up/+page.server.ts:90
const redirectTo = getAuthConfirmRedirectTo(url.origin, 'email');
```

```ts
// src/lib/server/organizationInvitationDelivery.test.ts:89
it('builds a request-access destination for invitees who still need account setup', () => {
```

```md
<!-- docs/launch-acquisition-path.md:59-66 -->
Self-service target:

1. The user creates a User Account through a public registration route.
2. The user confirms email control before entering app-owned onboarding.
3. The user creates the first Organization.
4. The new Organization lands on the owner dashboard with Free active.
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Svelte docs | Svelte MCP `list-sections`, then `get-documentation` for relevant auth/SvelteKit sections if editing `.svelte` files | docs read before Svelte edits |
| Svelte autofix | `svelte-autofixer` on edited Svelte files | no issues or suggestions remain |
| Invitation delivery tests | `npx vitest run src/lib/server/organizationInvitationDelivery.test.ts` | all pass |
| Signup confirmation tests | `npx vitest run src/routes/auth/sign-up/page.server.test.ts src/routes/auth/confirm/page.server.test.ts` | all pass |
| Invitation acceptance tests | `npx vitest run src/lib/server/core/useCases/dashboardOrgAccess.test.ts src/routes/dashboard/page.server.test.ts` | all pass when files exist |
| Auth confirmation tests | `npx vitest run src/routes/auth/confirm/page.server.test.ts` | all pass |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- `src/lib/server/organizationInvitationDelivery.ts`
- `src/lib/server/organizationInvitationDelivery.test.ts`
- `src/lib/server/authConfirm.ts` and `src/routes/auth/confirm/page.server.test.ts`
  only to whitelist the invitation signup confirmation destination if needed.
- `src/routes/auth/sign-up/+page.server.ts` and
  `src/routes/auth/sign-up/page.server.test.ts` only to carry a whitelisted,
  non-secret invitation handoff destination if needed.
- Signup/auth confirmation handoff code from Plan 083 only as needed to carry
  invitation context safely.
- Dashboard pending-invitation acceptance tests if the redirect/flow changes.
- `docs/launch-acquisition-path.md` if the self-service invitation branch needs
  a precise launch note.
- Plan 087 E2E notes only if this branch should become part of final
  acquisition E2E.
- `plans/README.md` status row only.

**Out of scope**:

- Do not remove reviewed `/auth/request-access`; it remains the billing-disabled
  and manual-approval path.
- Do not create Organizations in this plan.
- Do not weaken Organization Invitation expiry, revocation, rate limiting, or
  platform access rejection behavior.
- Do not accept an Organization Invitation before email confirmation and
  authenticated User Account creation.
- Do not touch production Auth, production database state, live Stripe, secrets,
  or local DB reset/deletion.

## Git workflow

- Branch: `codex/088-self-service-invitation-branch`
- Commit style: short imperative subject, for example
  `Add self-service invitation signup branch`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm Plan 083 signup exists

Read the implemented signup route from Plan 083. Confirm billing-enabled signup
exists, billing-disabled signup falls back to reviewed access, and email
confirmation can land on a whitelisted destination. If there is no real signup
route and no signup email-confirmation destination, stop. This plan depends on
the public User Account creation layer.

**Verify**:
`rg -n "sign-up|signup|type=email|/auth/confirm|/dashboard|/org/new" src/routes/auth src/lib/server/authConfirm.ts`
shows a real signup path and email confirmation support.

### Step 2: Define invitation-aware signup handoff

Choose the smallest safe handoff from an Organization Invitation email to the
signup path. A good default is a billing-enabled no-account invitation URL like
`/auth/sign-up?next=%2Fdashboard`, with signup confirmation whitelisting
`/dashboard` for this branch while ordinary signup keeps `/org/new`. This carries
only a non-secret destination and lets the dashboard own final acceptance after
authentication.

Do not place invitation IDs, raw invitation tokens, secrets, or unbounded
user-provided `next` values in email URLs. Preserve `makePublicAppUrl` origin
allowlist behavior. If you add a `next` query, validate it against a fixed
allowlist before passing it into Supabase signup confirmation.

**Verify**:
Add or update tests in `src/lib/server/organizationInvitationDelivery.test.ts`
for billing-enabled self-service invitees and billing-disabled reviewed-access
invitees. Add or update signup/auth-confirm tests that prove unsafe `next`
values are ignored or rejected.

### Step 3: Update invitation delivery copy

When billing/self-service signup is enabled, no-account invitees should be told
to create their User Account, confirm email, then accept the Organization
Invitation from the dashboard. When billing is disabled, preserve the
reviewed-access copy and `/auth/request-access` destination.

**Verify**:
`npx vitest run src/lib/server/organizationInvitationDelivery.test.ts src/routes/auth/sign-up/page.server.test.ts src/routes/auth/confirm/page.server.test.ts`
exits 0 and asserts both copy branches plus the whitelisted confirmation
destination.

### Step 4: Preserve final invitation acceptance semantics

Ensure the signed-in acceptance path still goes through the existing
Organization Invitation acceptance logic. The self-service branch must not
create Organization Membership from signup alone.

**Verify**:
`npx vitest run src/lib/server/core/useCases/dashboardOrgAccess.test.ts src/routes/dashboard/page.server.test.ts`
exits 0 or, if one file does not exist on the live branch, run the closest
existing pending-invitation acceptance tests and record the exact command.

### Step 5: Update docs and final verification

Update `docs/launch-acquisition-path.md` only if the current selected path
needs a clearer sentence about self-service invitees. Then run the focused auth
tests and full repo gate.

**Verify**:

- `npx vitest run src/routes/auth/confirm/page.server.test.ts src/routes/auth/sign-up/page.server.test.ts src/lib/server/organizationInvitationDelivery.test.ts` exits 0.
- Svelte autofixer reports no issues/suggestions for edited Svelte files.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` exits 0.

## Test plan

- Invitation delivery tests:
  - existing-user invitation still routes to sign-in/dashboard;
  - billing-disabled no-account invitation still routes to reviewed access;
  - billing-enabled no-account invitation routes to the self-service signup or
    invitation-aware signup entry;
  - email body copy explains the correct branch without claiming membership is
    created before acceptance.
- Auth/dashboard tests:
  - signup confirmation can continue to the invitation/dashboard destination;
  - pending invitation acceptance still requires an authenticated User Account;
  - rejected, expired, and revoked invitations remain blocked.

## Done criteria

- [ ] Billing-enabled no-account Organization Invitation emails no longer send
      public paid-launch invitees through reviewed access.
- [ ] Billing-disabled and manual-review behavior is preserved.
- [ ] Organization Membership is created only through existing invitation
      acceptance, not by signup.
- [ ] Invitation expiry, revocation, rejection, and rate-limit behavior is
      preserved.
- [ ] Focused tests and full repo gate pass.
- [ ] `plans/README.md` status row updated unless the reviewer maintains the
      index.

## STOP conditions

Stop and report back if:

- Plan 083 has not landed or signup confirmation cannot carry a safe invitation
  handoff.
- The solution needs raw invitation tokens or secret-bearing URLs in email.
- The change would accept an Organization Invitation before email confirmation.
- The change would require production Auth, production DB, live Stripe, secrets,
  or local DB reset/deletion.

## Maintenance notes

If Plan 087 E2E has not run yet, include this branch in the final acquisition
coverage or add a focused E2E for signup -> confirm email -> pending invitation
-> accept. Keep reviewed access and self-service signup distinct; the former is
manual platform entry, the latter is paid public acquisition.
