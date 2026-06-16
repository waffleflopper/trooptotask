# Plan 074: Guard billing mirror writes with event ordering

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat b3acfabb..HEAD -- src/lib/server/core/useCases/billingSnapshotTransitions.ts src/lib/server/core/useCases/billingSnapshotTransitions.test.ts src/lib/server/adapters/supabaseBillingSnapshotTransitions.ts src/lib/server/adapters/supabaseBillingSnapshotTransitions.test.ts src/lib/server/billing/stripeWebhookProcessing.ts src/lib/server/adapters/billingCancellationTransition.ts supabase/migrations src/lib/server/db plans/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plans 069-073 (operator sequencing)
- **Category**: bug
- **Planned at**: commit `b3acfabb`, 2026-06-14

## Why this matters

Stripe webhook snapshot writes are protected by event ordering, but the legacy
billing mirror on `organizations` is updated afterward with a plain row update.
If a stale event loses the snapshot race but later reaches the mirror update
path, or if retry/concurrency creates partial behavior, the canonical
`organization_billing_snapshots` row can be current while compatibility fields
on `organizations` show stale billing state. Billing access and support UI
should not depend on whichever write won the last unguarded mirror update.

## Current state

- `BillingSnapshotTransitionStore.upsertSnapshotIfCurrent()` returns `boolean`
  and is event-position aware.
- `applyBillingSnapshotTransition()` reads the current snapshot, plans the
  transition, writes the snapshot through the guarded store method, then calls
  `updateOrganizationBillingMirror()` separately.
- `supabaseBillingSnapshotTransitions.ts` calls
  `upsert_organization_billing_snapshot_if_current` for event-position writes.
- The same adapter updates `organizations` with
  `supabase.from('organizations').update(values).eq('id', orgId)`.
- Tests cover skipping the mirror when the snapshot race is lost before mirror
  write, but there is no store contract that makes snapshot plus mirror one
  ordered database operation.
- Billing reconciliation has its own store and mirror update path; it is
  out-of-scope for this Stripe event-ordering plan.

Current excerpts:

```ts
// src/lib/server/core/useCases/billingSnapshotTransitions.ts:61
export interface BillingSnapshotTransitionStore {
	readSnapshot(orgId: string): Promise<ExistingBillingSnapshot | null>;
	/**
	 * When eventPosition is present, implementations must use the stale-event-protected write path.
	 * The event fields in values remain the source of truth for persisted snapshot metadata.
	 */
	upsertSnapshotIfCurrent(values: BillingSnapshotUpsert, eventPosition?: BillingEventPosition): Promise<boolean>;
	updateOrganizationBillingMirror(orgId: string, values: Record<string, unknown>): Promise<void>;
}
```

```ts
// src/lib/server/core/useCases/billingSnapshotTransitions.ts:176
const planned = planEventTransition(transition, snapshot);
const snapshotUpdated = await store.upsertSnapshotIfCurrent(planned.snapshot, eventPosition(transition.event));

if (!snapshotUpdated) {
	return superseded(
```

```ts
// src/lib/server/core/useCases/billingSnapshotTransitions.ts:187
await store.updateOrganizationBillingMirror(transition.orgId, planned.mirror);
invalidateTierCache(transition.orgId);
```

```ts
// src/lib/server/adapters/supabaseBillingSnapshotTransitions.ts:25
async upsertSnapshotIfCurrent(values, eventPosition) {
	if (eventPosition) {
		return upsertSnapshotThroughCurrentEventRpc(supabase, values);
	}
```

```ts
// src/lib/server/adapters/supabaseBillingSnapshotTransitions.ts:37
async updateOrganizationBillingMirror(orgId, values) {
	const { error } = await supabase.from('organizations').update(values).eq('id', orgId);
	if (error) throw new Error(`Failed to update org ${orgId}: ${error.message}`);
}
```

```sql
-- supabase/migrations/20260524000700_billing_snapshot_cancellation_details.sql:101
ON CONFLICT ("organization_id") DO UPDATE
SET
    "source" = EXCLUDED."source",
```

```sql
-- supabase/migrations/20260524000700_billing_snapshot_cancellation_details.sql:124
WHERE
    "organization_billing_snapshots"."last_stripe_event_created_at" IS NULL
    OR (
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Billing transition tests | `npx vitest run src/lib/server/core/useCases/billingSnapshotTransitions.test.ts` | exits 0 |
| Supabase transition adapter tests | `npx vitest run src/lib/server/adapters/supabaseBillingSnapshotTransitions.test.ts` | exits 0 if this file is added |
| Migration text tests | `npx vitest run src/lib/server/db/conditionalBillingSnapshotUpsertMigration.test.ts src/lib/server/db/billingSnapshotCancellationDetailsMigration.test.ts src/lib/server/db/billingSnapshotMirrorOrderingMigration.test.ts` | exits 0 if a new migration test is added |
| DB contracts | `npm run db:test` | exits 0 if this plan adds a migration or SQL test |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `src/lib/server/core/useCases/billingSnapshotTransitions.ts`
- `src/lib/server/core/useCases/billingSnapshotTransitions.test.ts`
- `src/lib/server/adapters/supabaseBillingSnapshotTransitions.ts`
- `src/lib/server/adapters/supabaseBillingSnapshotTransitions.test.ts` if added
- A new migration under `supabase/migrations/` that updates/adds a service-role
  RPC for ordered snapshot plus mirror writes
- A new migration text test under `src/lib/server/db/`
- `src/lib/server/billing/stripeWebhookProcessing.ts` only if interface changes
  require call-site type updates
- `src/lib/server/adapters/billingCancellationTransition.ts` only if interface
  changes require call-site type updates
- `plans/README.md` status row only

**Out of scope**:

- Do not change normal Stripe event parsing or webhook dedupe semantics.
- Do not change billing reconciliation's drift repair store in this plan.
- Do not remove legacy organization billing mirror fields.
- Do not change price catalog tier mapping.
- Do not target production or run remote migrations.
- Do not reset or delete the local database without Robert's explicit
  permission.

## Git workflow

- Branch: `codex/074-guard-billing-mirror-with-event-order`
- Commit style: short imperative subject. Suggested:
  `Guard billing mirror writes by event order`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Collapse snapshot and mirror into one transition-store write

Change the `BillingSnapshotTransitionStore` contract so Stripe event
transitions can write the snapshot and legacy mirror together through a single
ordered operation. Suggested shape:

```ts
writeSnapshotAndMirrorIfCurrent(input: {
	snapshot: BillingSnapshotUpsert;
	mirror: Record<string, unknown>;
	eventPosition?: BillingEventPosition;
}): Promise<boolean>;
```

Update `applyBillingSnapshotTransition()` and immediate cancellation handling
to call this one method instead of:

1. `upsertSnapshotIfCurrent(...)`
2. `updateOrganizationBillingMirror(...)`

The use case should still:

- return `superseded` when the combined write returns `false`,
- call `invalidateTierCache(orgId)` only after the combined write returns
  `true`,
- preserve existing result strings and planned mirror values.

**Verify**:
`npx vitest run src/lib/server/core/useCases/billingSnapshotTransitions.test.ts`
fails before test updates and passes after implementation.

### Step 2: Update core tests for combined write semantics

Update the fake store in `billingSnapshotTransitions.test.ts` to record combined
writes. Preserve existing behavior assertions, then add a replay/concurrency
test that proves a stale event cannot update the mirror when the snapshot write
is rejected.

Cover at least:

- checkout completion writes one combined snapshot/mirror payload,
- subscription update writes one combined payload,
- stale event detected before write produces no combined write,
- combined write returning `false` skips cache invalidation,
- mirror/write provider failure still rejects so webhook retry behavior remains
  visible.

**Verify**:
`npx vitest run src/lib/server/core/useCases/billingSnapshotTransitions.test.ts`
exits 0.

### Step 3: Add a service-role RPC for atomic ordered snapshot plus mirror writes

Add a new migration that either replaces the existing
`upsert_organization_billing_snapshot_if_current(jsonb)` function with a
backward-compatible implementation or adds a new function, for example:

```sql
public.upsert_organization_billing_snapshot_and_mirror_if_current(
	p_snapshot jsonb,
	p_mirror jsonb
) returns boolean
```

The function must:

- use the same event ordering predicate as the current snapshot RPC,
- upsert/update `organization_billing_snapshots`,
- update `organizations` mirror fields only when the snapshot insert/update
  actually happened,
- run in one database function call/transaction,
- return `true` only when both snapshot and mirror effects were applied,
- preserve service-role-only execute grants and revoke public/anon/authenticated
  execute.

Keep the mirror update explicit to the known legacy fields used by transition
plans (`tier`, `stripe_customer_id`, `stripe_subscription_id`,
`subscription_status`, `current_period_end`). Do not blindly splat arbitrary
JSON keys into SQL.

Add a migration text test asserting the new function exists, includes the
ordering predicate, updates `public.organizations`, and has the right grants.

**Verify**:
run the migration text test.

### Step 4: Wire the Supabase adapter to the combined RPC

Update `createSupabaseBillingSnapshotTransitionStore()` so
`writeSnapshotAndMirrorIfCurrent()` calls the combined RPC for transition
writes. If `eventPosition` is absent, still use a single operation that writes
snapshot plus mirror together; do not fall back to separate adapter calls.

Add `src/lib/server/adapters/supabaseBillingSnapshotTransitions.test.ts` if it
does not exist. Test that:

- the adapter calls the combined RPC with `p_snapshot` and `p_mirror`,
- it returns `true` only when the RPC returns true,
- it throws a sanitized adapter error if the RPC fails,
- it no longer calls `from('organizations').update(...)` from this transition
  adapter.

**Verify**:
`npx vitest run src/lib/server/adapters/supabaseBillingSnapshotTransitions.test.ts`
exits 0.

### Step 5: Check webhook call sites and billing reconciliation boundaries

Run a typecheck after interface updates and fix only the Stripe transition call
sites that compile against the changed interface:

- `src/lib/server/billing/stripeWebhookProcessing.ts`
- `src/lib/server/adapters/billingCancellationTransition.ts`

Do not modify billing reconciliation's separate store in this plan. Its
`plannedWrites` and drift repair semantics are not event-order guarded webhook
processing.

**Verify**:
`npm run check` exits 0.

### Step 6: Run local DB contracts and the full gate

If a migration or SQL test was added, run:

```bash
npm run db:test
```

Then run:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

**Verify**: every command exits 0.

## Test plan

- Core use-case tests for combined snapshot/mirror write behavior and stale
  replay.
- Supabase adapter tests for combined RPC payload and no direct organization
  update.
- Migration text test for function body and grants.
- `npm run db:test` if a migration is added.
- Full repo gate.

## Done criteria

- [ ] Stripe billing transitions use one store method for snapshot plus mirror.
- [ ] Supabase transition adapter writes snapshot and organization mirror in one
      ordered RPC/database operation.
- [ ] Stale or lost-race events cannot update the legacy mirror.
- [ ] Tier cache invalidation happens only after the combined write succeeds.
- [ ] Billing reconciliation behavior is unchanged.
- [ ] Full repo gate passes, and `npm run db:test` passes if migration work was
      added.
- [ ] `plans/README.md` status row for 074 is updated.

## STOP conditions

Stop and report back if:

- The existing database function cannot be changed compatibly without breaking
  already-applied migration assumptions.
- The legacy mirror needs fields outside the known billing mirror set.
- A correct fix requires removing the legacy mirror entirely instead of
  guarding it.
- Local Supabase migration testing requires a database reset or destructive
  operation.

## Maintenance notes

The canonical billing state should remain `organization_billing_snapshots`.
The legacy organization mirror is compatibility state and must never be updated
from Stripe events with weaker ordering than the snapshot. Reviewers should
look for any new `organizations` billing-field writes in webhook paths and ask
why they are not part of the ordered transition store.
