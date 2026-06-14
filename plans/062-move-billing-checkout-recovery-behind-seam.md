# Plan 062: Move billing checkout recovery behind a billing seam

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/routes/org/[orgId]/billing/success/+page.server.ts src/routes/org/[orgId]/billing/success/page.server.test.ts src/routes/org/[orgId]/billing/cancel/+server.ts src/routes/org/[orgId]/billing/cancel/server.test.ts src/lib/server/core/useCases/billingReconciliation.ts src/lib/server/core/useCases/billingSnapshotTransitions.ts src/lib/server/core/useCases/billingOrganization.ts src/lib/server/stripe.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

Billing checkout success and cancellation are user-facing recovery paths, but
their route helpers still construct Stripe/Supabase providers directly. This
keeps billing recovery policy split between SvelteKit route files and core
billing use cases. After this plan, routes should parse request/query data and
delegate to a billing orchestration seam; provider construction should live in
server adapters.

## Current state

- Checkout success route load can recover a completed Stripe checkout session
  when the billing snapshot has not caught up.
- `_recoverCheckoutSuccessFromStripe` retrieves the Stripe session, calls
  `getAdminClient()`, constructs Supabase/Stripe adapters, reconciles billing,
  and marks the checkout attempt complete.
- Billing cancellation route calls `cancelBillingSubscriptionForOrganization`,
  then directly applies a billing snapshot transition with a Supabase adapter.
- Route tests mock many provider constructors to test route behavior.

Current excerpts:

```ts
// src/routes/org/[orgId]/billing/success/+page.server.ts:131
const recovered = await (input.recoverCheckoutSuccess ?? _recoverCheckoutSuccessFromStripe)(ctx, {
	checkoutAttempt
});
```

```ts
// src/routes/org/[orgId]/billing/success/+page.server.ts:169
const session = await retrieveCheckoutSessionForRecovery(attempt.stripe_checkout_session_id);
```

```ts
// src/routes/org/[orgId]/billing/success/+page.server.ts:174
const adminClient = getAdminClient();
await reconcileOrganizationBilling({
	orgId: ctx.auth.orgId,
	store: createSupabaseBillingReconciliationStore(adminClient),
```

```ts
// src/routes/org/[orgId]/billing/cancel/+server.ts:75
await applyBillingSnapshotTransition(createSupabaseBillingSnapshotTransitionStore(getAdminClient()), {
	kind: 'immediate_cancellation_requested',
```

```ts
// src/routes/org/[orgId]/billing/success/page.server.test.ts:8
const {
	readCurrentBillingSnapshotMock,
	retrieveCheckoutSessionForRecoveryMock,
	reconcileOrganizationBillingMock,
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Success route tests | `npx vitest run src/routes/org/[orgId]/billing/success/page.server.test.ts` | exits 0 |
| Cancel route tests | `npx vitest run src/routes/org/[orgId]/billing/cancel/server.test.ts` | exits 0 |
| Billing use-case tests | `npx vitest run src/lib/server/core/useCases/billingReconciliation.test.ts src/lib/server/core/useCases/billingSnapshotTransitions.test.ts src/lib/server/core/useCases/billingOrganization.test.ts` | exits 0 |
| Provider-leak grep | `rg -n "getAdminClient\|retrieveCheckoutSessionForRecovery\|createSupabaseBillingReconciliationStore\|createStripeBillingReconciliationProvider\|createSupabaseSubscriptionAdapter\|createSupabaseBillingSnapshotTransitionStore" src/routes/org/[orgId]/billing/success/+page.server.ts src/routes/org/[orgId]/billing/cancel/+server.ts` | no matches |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `src/routes/org/[orgId]/billing/success/+page.server.ts`
- `src/routes/org/[orgId]/billing/success/page.server.test.ts`
- `src/routes/org/[orgId]/billing/cancel/+server.ts`
- `src/routes/org/[orgId]/billing/cancel/server.test.ts`
- New billing orchestration use-case/adapter files under
  `src/lib/server/core/useCases/` and `src/lib/server/adapters/`
- Existing billing use-case tests if shared types move
- `plans/README.md` status row only

**Out of scope**:

- Do not change Stripe webhook ingestion or normal reconciliation semantics.
- Do not change checkout-attempt table schema or add migrations.
- Do not change billing response shapes or redirect behavior.
- Do not batch this with plan 050 billing-event retry work.
- Do not touch production or local database state.

## Git workflow

- Branch: `codex/062-move-billing-checkout-recovery-behind-seam`
- Commit style: short imperative subject. Suggested: `Move checkout billing recovery behind seam`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Introduce checkout recovery ports

Create a small billing recovery module, for example
`src/lib/server/core/useCases/billingCheckoutRecovery.ts`, that owns the
checkout-success recovery decision currently in `_recoverCheckoutSuccessFromStripe`.

Suggested shape:

```ts
export interface BillingCheckoutRecoveryPorts {
	retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionRecoveryDetails>;
	reconcileOrganizationBilling(orgId: string): Promise<void>;
	markCheckoutAttemptCompleted(store: DataStore, orgId: string, attemptId: string, now: Date): Promise<void>;
}

export async function recoverCompletedCheckout(input: {
	ports: BillingCheckoutRecoveryPorts;
	store: DataStore;
	orgId: string;
	checkoutAttempt: CheckoutAttemptRow;
	now?: Date;
}): Promise<boolean> { ... }
```

Preserve the current guardrails:

- return `false` when no Stripe session id exists,
- return `false` unless the attempt status is `in_progress`,
- return `false` unless Stripe reports complete/paid with a subscription id,
- return `false` when Stripe metadata org id or checkout attempt id does not
  match,
- reconcile billing before marking the checkout attempt completed.

**Verify**:
Add focused tests for the new module, then run them with the existing billing
tests. They should pass without importing route files.

### Step 2: Move provider construction to an adapter

Create an adapter factory, for example
`createSupabaseBillingCheckoutRecoveryPorts(ctx.auth.orgId)`, that is the only
place in this flow that imports:

- `getAdminClient`,
- `retrieveCheckoutSessionForRecovery`,
- `createSupabaseBillingReconciliationStore`,
- `createStripeBillingReconciliationProvider`,
- `createSupabaseSubscriptionAdapter`,
- `getConfiguredPriceCatalog`,
- `reconcileOrganizationBilling`.

The route may import the adapter factory, but it must not import any of those
provider details directly.

**Verify**:
`rg -n "getAdminClient\|retrieveCheckoutSessionForRecovery\|createSupabaseBillingReconciliationStore\|createStripeBillingReconciliationProvider\|createSupabaseSubscriptionAdapter" src/routes/org/[orgId]/billing/success/+page.server.ts`
returns no matches.

### Step 3: Thin checkout success route recovery

Update `_loadCheckoutSuccessPageData` so its injectable recovery function
receives an app-level recovery function, not a provider-rich route helper.

Target behavior:

- route load still reads the current snapshot and checkout attempt,
- route still gates recovery with `requireGovernancePolicy(...manageBilling...)`,
- route calls the recovery use case,
- route still catches non-HTTP recovery failures and displays the existing
  "still syncing" status.

Remove `_recoverCheckoutSuccessFromStripe` from the route file or replace it
with a thin wrapper that only calls the adapter-backed use case.

**Verify**:
`npx vitest run src/routes/org/[orgId]/billing/success/page.server.test.ts`
exits 0.

### Step 4: Introduce cancellation snapshot transition seam

Move the cancellation snapshot transition out of
`src/routes/org/[orgId]/billing/cancel/+server.ts`. Either:

- extend `cancelBillingSubscriptionForOrganization` with an optional
  cancellation transition port, or
- create a sibling orchestration use case that calls
  `cancelBillingSubscriptionForOrganization` and then applies the transition.

The route must continue to return `{ success: true, billingTransitionApplied }`
and must continue warning, not failing, when the local snapshot transition
cannot be applied.

**Verify**:
`npx vitest run src/routes/org/[orgId]/billing/cancel/server.test.ts`
exits 0.

### Step 5: Run the full gate

Run:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

**Verify**: every command exits 0.

## Test plan

- New core tests for checkout recovery decision branches.
- Route success tests own page-state mapping and recovery delegation.
- Cancel route tests own HTTP parsing/result mapping.
- Existing billing reconciliation, organization, and snapshot transition tests
  remain green.
- Full repo gate.

## Done criteria

- [ ] Billing success route no longer imports Stripe/Supabase provider details.
- [ ] Billing cancel route no longer constructs the snapshot transition store.
- [ ] Checkout recovery and cancellation transition behavior are covered outside
      route tests.
- [ ] Public billing responses and page states are unchanged.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 062 is updated.

## STOP conditions

Stop and report back if:

- Moving the cancellation transition would change billing audit or webhook
  reconciliation semantics.
- The new seam conflicts with plan 050 changes already landed in this worktree.
- A provider factory would need to import from a route file.
- Any verification requires migrations or database resets.

## Maintenance notes

Keep this focused on checkout success/cancel recovery. Stripe webhook retry and
ledger processing are owned by plan 050 and should remain separate for review.
