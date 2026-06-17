# Plan 083: Add public account creation with abuse controls

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This plan edits auth and Svelte surfaces, so follow
> `docs/agents/svelte.md` before editing Svelte files. If anything in the
> "STOP conditions" section occurs, stop and report. When done, update the
> status row for this plan in `plans/README.md` unless a reviewer dispatched you
> and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 0cafdd3e..HEAD -- docs/launch-acquisition-path.md docs/architecture/adrs/0009-beta-access-request-account-setup-links.md docs/architecture/ADR_INDEX.md CONTEXT.md src/routes/auth src/routes/api/access-requests src/lib/server/durableRateLimit.ts src/lib/server/accessRequestRateLimit.ts src/lib/server/authConfirm.ts e2e/specs/auth-email-flows.spec.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plan 080
- **Category**: direction
- **Planned at**: commit `0cafdd3e`, 2026-06-15

## Why this matters

Plan 080 selected an env-gated acquisition direction: reviewed access remains
live while billing is disabled, and paid billing should eventually use open
self-service registration with email confirmation and no request-access gate.
The current app has strong reviewed Access Request and Account Setup Link
guardrails, but no public account creation route. This plan adds the account
creation layer without creating Organizations or starting checkout yet.

## Current state

- `docs/launch-acquisition-path.md` says self-service registration is the paid
  target, but not implemented in Plan 080.
- `src/routes/auth/request-access/+page.svelte` is the public entry point for
  reviewed access.
- `src/routes/auth/setup-account/+page.server.ts` creates or activates a User
  Account only after a valid Account Setup Link and password selection.
- `src/lib/server/authConfirm.ts` only accepts Supabase email link types
  `invite` and `recovery`; `email` signup confirmation is currently invalid.
- `src/lib/server/durableRateLimit.ts` is the shared durable rate-limit helper.
- `src/lib/server/accessRequestRateLimit.ts` and
  `src/lib/server/accountSetupRateLimit.ts` are examples for auth-adjacent
  per-email/per-IP rate limiting.

Current excerpts:

```ts
// src/lib/server/authConfirm.ts
const authConfirmDestinations = {
	invite: '/auth/accept-invite',
	recovery: '/auth/reset-password'
} as const;
```

```svelte
<!-- src/routes/auth/request-access/+page.svelte -->
<AuthShell
	eyebrow="Reviewed Access"
	title="Request access to TroopToTask."
```

```svelte
<!-- src/routes/auth/setup-account/+page.svelte -->
supportDescription="Account Setup Links activate only your User Account. Organization membership is handled separately inside TroopToTask."
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Svelte docs | Svelte MCP `list-sections`, then `get-documentation` for relevant Svelte/SvelteKit sections | docs read before editing `.svelte` files |
| Svelte autofix | `svelte-autofixer` on edited Svelte files | no issues or suggestions remain |
| Auth route tests | `npx vitest run src/routes/auth/confirm/page.server.test.ts src/routes/auth/login/page.server.test.ts src/lib/server/durableRateLimit.test.ts src/lib/server/accountSetupRateLimit.test.ts` | all pass |
| Auth E2E | `npm run test:e2e:auth` | all pass when local Supabase/Mailpit are available |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- A new public signup route under `src/routes/auth`, for example
  `src/routes/auth/sign-up/+page.svelte` and `+page.server.ts`.
- `src/lib/server/authConfirm.ts` and `src/routes/auth/confirm/+page.server.ts`
  only to support Supabase `email` confirmation for signup.
- A new signup rate-limit helper near existing auth rate-limit modules.
- Route/component/server tests for signup, confirmation, duplicate account copy,
  rate limiting, and safe redirects.
- Public CTA copy only where it can truthfully point to an implemented signup
  route while preserving reviewed access when billing is disabled.
- ADR/docs update if the implementation changes ADR 0009 semantics.
- `plans/README.md` status row only.

**Out of scope**:

- Do not create Organizations in this plan.
- Do not start Stripe checkout in this plan.
- Do not create Organization Members from signup or Access Request completion.
- Do not weaken Account Setup Link token hashing, expiry, or completion checks.
- Do not remove `/auth/request-access`; it remains the billing-disabled path.
- Do not touch production auth settings, production database state, live Stripe,
  or secrets.

## Git workflow

- Branch: `codex/083-public-account-creation`
- Commit style: short imperative subject, for example
  `Add self-service account signup guardrails`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reconfirm the acquisition and ADR boundary

Read `docs/launch-acquisition-path.md`, ADR 0009, `CONTEXT.md`, and
`docs/agents/architecture-governance.md`. Decide whether the new signup route
needs a new ADR or an ADR 0009 update. It likely does, because signup is a new
parallel account-creation path rather than an Access Request setup path.

Do not proceed silently if ADR semantics change.

**Verify**:
`rg -n "ADR compatibility|self-service|Account Setup Link|Access Request" docs/launch-acquisition-path.md docs/architecture/adrs/0009-beta-access-request-account-setup-links.md CONTEXT.md`
shows the reviewed path remains distinct from self-service signup.

### Step 2: Add signup rate limiting before creating accounts

Create a signup-specific rate-limit helper modeled on
`src/lib/server/accessRequestRateLimit.ts` and
`src/lib/server/accountSetupRateLimit.ts`. It must check at least normalized
email and client IP dimensions through `checkDurableRateLimit`.

The route must evaluate the rate limit before calling Supabase signup.
Returned audit details must not include raw email, raw IP, tokens, or secrets.

**Verify**:
`npx vitest run src/lib/server/durableRateLimit.test.ts <new-signup-rate-limit-test>` passes and includes limited and non-limited cases.

### Step 3: Add the public signup route behind billing-enabled posture

Add a signup page and server action. If billing is disabled, the public route
should redirect or point users back to reviewed `/auth/request-access`.
If billing is enabled, the action may call Supabase signup with email redirect
through `/auth/confirm`.

Use generic result copy. Do not reveal whether an email already has a User
Account.

**Verify**:
`npx vitest run <new-signup-route-test>` passes for billing-disabled fallback,
successful signup request, invalid email/password, duplicate-safe copy, and
rate-limited responses.

### Step 4: Extend auth confirmation for signup email links

Extend `src/lib/server/authConfirm.ts` so Supabase signup confirmation links
can land on a safe destination. The destination should be a real post-confirm
path such as `/org/new` or a lightweight "continue setup" page created in this
plan. Keep invite and recovery behavior unchanged.

**Verify**:
`npx vitest run src/routes/auth/confirm/page.server.test.ts` passes, including
existing invite/recovery tests and new signup email-confirmation tests.

### Step 5: Keep reviewed access available when billing is off

Public nav and landing CTAs may point to signup only when the route exists and
the copy clearly respects `PUBLIC_BILLING_ENABLED`. If static public copy cannot
truthfully branch by billing-enabled state, keep `Request Access` until a later
plan adds the right runtime presentation.

**Verify**:
`rg -n "Request Access|Create Account|Start Trial|/auth/sign-up|/auth/request-access" src/routes src/lib/components/public`
shows no link to a route that does not exist.

### Step 6: Run auth and repo verification

Run Svelte autofixer on edited `.svelte` files until clean, then run focused
auth tests, auth E2E, and the full repo gate.

**Verify**:

- Svelte autofixer reports no issues/suggestions.
- `npm run test:e2e:auth` passes, or the final report records the local
  Supabase/Mailpit blocker.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` exits 0.

## Test plan

- Unit-test signup rate limiting with normalized email, IP, limited, and
  audit-safe detail cases.
- Route-test signup server actions for invalid input, billing-disabled fallback,
  rate-limited response, provider error, and generic duplicate-safe success
  copy.
- Extend auth-confirm tests for `type=email` and unsafe `next` rejection.
- Add or update auth E2E only for the account confirmation surface created here;
  organization creation and checkout E2E belong to later plans.

## Done criteria

- [ ] A public signup path exists or the plan is stopped with a documented ADR
      conflict.
- [ ] Signup has durable per-email and per-IP rate limiting.
- [ ] Signup email confirmation is supported without breaking invite/recovery
      confirmation.
- [ ] Reviewed `/auth/request-access` remains available when billing is off.
- [ ] No Organization, Organization Membership, or Stripe checkout is created
      directly by signup.
- [ ] Svelte autofixer is clean for edited Svelte files.
- [ ] Focused tests, relevant E2E, and full repo gate pass or E2E blockers are
      reported.
- [ ] `plans/README.md` status row updated unless the reviewer maintains the
      index.

## STOP conditions

Stop and report back if:

- The implementation would create a User Account before email-control proof in
  a way that contradicts the selected ADR direction.
- The route needs to create an Organization or start checkout to be useful.
- Supabase email confirmation cannot be safely routed through `/auth/confirm`
  without weakening invite/recovery flows.
- Svelte MCP docs or `svelte-autofixer` are unavailable for edited Svelte files.
- Any step would require production Auth, production DB, live Stripe, secrets,
  or local DB reset/deletion.

## Maintenance notes

This plan is the account identity layer only. Plans 084 and 085 depend on it
for Organization creation and checkout entry. Reviewers should scrutinize
generic error copy, rate-limit dimensions, redirect safety, and whether any new
route accidentally blends Access Request, Account Setup Link, User Account, or
Organization Membership semantics.
