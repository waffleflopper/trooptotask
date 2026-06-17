# Plan 085: Add self-service checkout entry and billing recovery

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This plan touches billing and may edit Svelte files, so follow
> `docs/agents/svelte.md` before Svelte edits. If anything in the "STOP
> conditions" section occurs, stop and report. When done, update the status row
> for this plan in `plans/README.md` unless a reviewer dispatched you and told
> you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d485cdc5..HEAD -- docs/launch-acquisition-path.md docs/billing-operations-launch-checklist.md docs/billing-launch-verification.md src/lib/config/billing.ts 'src/routes/org/[orgId]/billing' src/lib/server/core/useCases/billing.ts src/lib/server/core/useCases/billingCheckoutAttempts.ts src/lib/server/billing src/lib/types/subscription.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/083-public-account-creation-abuse-controls.md, plans/084-self-service-organization-onboarding.md, plan 078
- **Category**: direction
- **Planned at**: commit `d485cdc5`, 2026-06-16 (reconciled; originally planned at `0cafdd3e`)

## Reconciliation note

On 2026-06-17, PR #1230 completed this plan after the `d485cdc5`
reconciliation. Billing checkout remains explicit from the authenticated
Organization billing page, new self-service Organizations start on Free, and
Team/Unit checkout starts only when the owner chooses an upgrade.

## Why this matters

Paid self-service acquisition is not complete until a confirmed owner can pick a
plan, enter checkout, and recover from failed or abandoned payment without a
manual approval queue. The current billing system is Organization-authenticated
and already has strong checkout catalog validation, webhook processing, pending
checkout attempts, and recovery surfaces. This plan connects those pieces to
the self-service first-run path without weakening billing authorization.

## Current state

- `src/lib/config/billing.ts` gates billing with `PUBLIC_BILLING_ENABLED`.
- `src/routes/org/[orgId]/billing/checkout/+server.ts` rejects checkout when
  billing is disabled, rejects arbitrary Stripe price IDs, resolves the server
  catalog entry, requires `organization.manageBilling`, and allows only the
  named `billing-recovery` read-only-mode exception.
- `src/routes/org/[orgId]/billing/+page.server.ts` loads pending checkout
  attempts and current billing state for authenticated Organization context.
- `docs/billing-launch-verification.md` documents checkout, renewal, failed
  payment, cancellation, and recovery scenarios.
- `docs/billing-operations-launch-checklist.md` documents the environment-gated
  acquisition path and the Free-first checkout entry.

Current excerpts:

```ts
// src/routes/org/[orgId]/billing/checkout/+server.ts
if (!isBillingEnabled) {
	return json({ error: 'Billing is not enabled' }, { status: 400 });
}
```

```ts
// src/routes/org/[orgId]/billing/checkout/+server.ts
if (typeof body.priceId === 'string' && body.priceId.trim()) {
	fail(400, 'Stripe price IDs cannot be selected directly.');
}
```

```ts
// src/routes/org/[orgId]/billing/checkout/+server.ts
readOnlyModeException: 'billing-recovery'
```

```ts
// src/routes/org/[orgId]/billing/+page.server.ts
const [billingSnapshot, effectivePlanPolicy, planUsage, pendingCheckoutSession] = await Promise.all([
	readCurrentBillingSnapshot({ auth: ctx.auth, store: ctx.rawStore }),
	readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore }),
	readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore }),
	readPendingCheckoutSession(ctx)
]);
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Svelte docs | Svelte MCP `list-sections`, then `get-documentation` for relevant Svelte/SvelteKit sections | docs read before editing `.svelte` files |
| Svelte autofix | `svelte-autofixer` on edited Svelte files | no issues or suggestions remain |
| Billing focused tests | `npx vitest run 'src/routes/org/[orgId]/billing/page.server.test.ts' 'src/routes/org/[orgId]/billing/page.svelte.test.ts' 'src/routes/org/[orgId]/billing/checkout/server.test.ts' 'src/routes/org/[orgId]/billing/portal/server.test.ts' 'src/routes/org/[orgId]/billing/cancel/server.test.ts'` | all pass |
| Billing E2E | `npm run test:e2e:billing` | all pass when Stripe test-mode/local E2E config is available |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- First-run billing entry from a newly created Organization to
  `/org/[orgId]/billing`.
- Billing page/checkout UI copy and route tests for self-service owners.
- Checkout recovery and abandoned pending checkout messaging if current
  surfaces are insufficient for a public customer.
- Docs updates to `docs/launch-acquisition-path.md`,
  `docs/billing-operations-launch-checklist.md`, and
  `docs/billing-launch-verification.md`.
- Tests around billing-disabled fallback and billing-enabled checkout entry.
- `plans/README.md` status row only.

**Out of scope**:

- No live Stripe Dashboard changes, live price changes, production checkout, or
  production DB work.
- No arbitrary client-selected Stripe price IDs.
- No Customer Portal settings changes.
- No new paid tiers, coupons, enterprise invoicing, metered usage, or
  multi-currency.
- No organization creation or signup changes except redirect/copy handoff from
  Plans 083 and 084.

## Git workflow

- Branch: `codex/085-self-service-checkout-recovery`
- Commit style: short imperative subject, for example
  `Wire self-service checkout entry`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm prerequisite paths exist

Verify the signup and first Organization paths from Plans 083 and 084 exist and
that a confirmed owner can land in an authenticated Organization context.

**Verify**:
`rg -n "sign-up|signup|org/new|PUBLIC_BILLING_ENABLED|billing" src/routes/auth src/routes/org docs/launch-acquisition-path.md`
shows real signup, Organization creation, and billing-gated paths.

### Step 2: Keep the Free-first billing decision

The first-run billing decision is already made: a new self-service Organization
lands on Free first. Do not introduce trial language or require immediate
checkout; Team and Unit remain explicit upgrades from Billing.

Keep the chosen behavior documented in `docs/launch-acquisition-path.md`.

**Verify**:
`rg -n "trial|Free|Team|Unit|checkout|billing entry point" docs/launch-acquisition-path.md docs/billing-operations-launch-checklist.md`
shows the chosen path without contradiction.

### Step 3: Make checkout entry explicit for self-service owners

Add or adjust the authenticated billing UI so a self-service owner can pick Team
or Unit and start checkout only when `PUBLIC_BILLING_ENABLED=true`. Keep the
server checkout route as the authority for catalog selection and authorization.

**Verify**:
`npx vitest run 'src/routes/org/[orgId]/billing/page.svelte.test.ts' 'src/routes/org/[orgId]/billing/checkout/server.test.ts'`
passes, including billing-disabled and billing-enabled cases.

### Step 4: Cover abandoned and failed checkout recovery

Review pending checkout attempt behavior in
`src/lib/server/core/useCases/billingCheckoutAttempts.ts`,
`src/routes/org/[orgId]/billing/+page.server.ts`, and the billing page. Ensure a
public self-service customer can resume or restart safely after pending,
expired, failed, or canceled checkout.

Do not bypass webhook-driven billing snapshots.

**Verify**:
`npx vitest run 'src/routes/org/[orgId]/billing/page.server.test.ts' 'src/routes/org/[orgId]/billing/page.svelte.test.ts'`
passes with recovery-state assertions.

### Step 5: Update launch docs and run billing verification

Update billing launch docs with the self-service checkout entry and recovery
support model. Run focused billing tests, billing E2E if available, and the full
repo gate.

**Verify**:

- `npx vitest run 'src/routes/org/[orgId]/billing/page.server.test.ts' 'src/routes/org/[orgId]/billing/page.svelte.test.ts' 'src/routes/org/[orgId]/billing/checkout/server.test.ts' 'src/routes/org/[orgId]/billing/portal/server.test.ts' 'src/routes/org/[orgId]/billing/cancel/server.test.ts'` exits 0.
- `npm run test:e2e:billing` passes, or the final report records the missing
  local Stripe/test-mode blocker.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` exits 0.

## Test plan

- Extend billing route tests for self-service owner checkout entry.
- Add UI tests for billing-disabled fallback, pending checkout resume/restart,
  failed payment recovery messaging, and cancellation state.
- Keep Stripe catalog tests asserting client price IDs are rejected.
- Run billing E2E when Stripe test-mode config is available.

## Done criteria

- [ ] A confirmed self-service owner has a truthful billing entry path.
- [ ] Checkout remains disabled when `PUBLIC_BILLING_ENABLED=false`.
- [ ] Checkout still uses server-side Team/Unit catalog validation.
- [ ] Failed, abandoned, expired, and canceled checkout states have safe user
      recovery copy.
- [ ] Launch/billing docs match the implemented path.
- [ ] Svelte autofixer is clean for edited Svelte files.
- [ ] Focused billing tests and full repo gate pass; billing E2E passes or the
      blocker is documented.
- [ ] `plans/README.md` status row updated unless the reviewer maintains the
      index.

## STOP conditions

Stop and report back if:

- Trial semantics are required but not already represented in billing policy.
- The implementation would start checkout before email confirmation or before
  an Organization exists.
- The implementation requires live Stripe objects, production DB, secrets, or
  local DB reset/deletion.
- Checkout would need arbitrary client-submitted Stripe price IDs.
- Svelte MCP docs or `svelte-autofixer` are unavailable for edited Svelte files.

## Maintenance notes

Self-service checkout should still be boring billing code: authenticated
Organization context, server catalog selection, webhook snapshots, and
support-safe recovery states. Plan 086 adds platform visibility around this
path, and Plan 087 proves the end-to-end acquisition workflow.
