# Plan 045: Count plan usage without full row loads

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 0a6e6000..HEAD -- src/lib/server/core/useCases/organizationPlanUsage.ts src/lib/server/core/useCases/organizationPlanUsage.test.ts src/lib/server/core/ports.ts src/lib/server/adapters/supabaseDataStore.ts src/lib/server/adapters/inMemory.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `0a6e6000`, 2026-06-13

## Why this matters

Billing, settings, admin, and export flows can ask for organization plan usage
just to display counts. The current use case loads every matching row for active
personnel, memberships, pending invitations, and monthly exports, then only uses
array lengths. At scale this makes a small usage card or limit check depend on
full table payloads.

After this plan, count-only parts of the read model should use the existing
count-capable store path, and invitation dedupe should fetch only the narrow
email/expiry columns it needs.

## Current state

- `src/lib/server/core/useCases/organizationPlanUsage.ts:95-127` loads full row
  arrays and counts `.length`:

```ts
const [activePersonnelRows, memberRows, invitationRows, exportRows] = await Promise.all([
	ports.store.findMany<PersonnelUsageRow>('personnel', ports.auth.orgId, {}, { isNull: { archived_at: true } }),
	ports.store.findMany<OrganizationMembershipUsageRow>('organization_memberships', ports.auth.orgId),
	ports.store.findMany<OrganizationInvitationUsageRow>('organization_invitations', ports.auth.orgId, {
		status: 'pending'
	}),
	ports.store.findMany<DataExportUsageRow>('data_exports', ports.auth.orgId, {}, { rangeFilters: [...] })
]);
```

- `src/lib/server/core/ports.ts:95-100` already exposes
  `DataStore.findManyWithCount`, so this plan should not need a new persistence
  port.
- `src/lib/server/adapters/supabaseDataStore.ts:167-207` defaults
  `findMany` to `select('*')` and pages until all rows are loaded when no
  `range` or `limit` is supplied.
- `src/lib/server/core/useCases/organizationPlanUsage.test.ts:11-170` already
  covers active personnel counts, member counts, invitation dedupe, and monthly
  export counts.

## Commands you will need

| Purpose                        | Command                                                                     | Expected on success |
| ------------------------------ | --------------------------------------------------------------------------- | ------------------- |
| Install, if needed             | `npm ci`                                                                    | exit 0              |
| Focused usage tests            | `npx vitest run src/lib/server/core/useCases/organizationPlanUsage.test.ts` | all pass            |
| Adapter regression, if touched | `npx vitest run src/lib/server/adapters`                                    | all pass            |
| Format                         | `npm run format`                                                            | exit 0              |
| Lint                           | `npm run lint`                                                              | exit 0              |
| Governance                     | `npm run governance:check`                                                  | exit 0              |
| Typecheck                      | `npm run check`                                                             | exit 0              |
| Full tests                     | `npm run test`                                                              | exit 0              |

## Scope

**In scope**:

- `src/lib/server/core/useCases/organizationPlanUsage.ts`
- `src/lib/server/core/useCases/organizationPlanUsage.test.ts`
- `src/lib/server/adapters/inMemory.ts` only if the existing count helper cannot
  express the needed tests
- `plans/README.md` status row only

**Out of scope**:

- Do not add billing product logic or change plan limits.
- Do not change source metadata returned by `readOrganizationPlanUsage`.
- Do not add a migration.
- Do not change Supabase RLS or production database state.
- Do not redesign `DataStore`; use the existing `findManyWithCount` contract if
  it still exists after the drift check.

## Git workflow

- Branch: `codex/045-count-plan-usage-without-full-row-loads`
- Commit style: short imperative subject. Suggested:
  `Count plan usage without full row loads`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a count helper inside the use case

In `organizationPlanUsage.ts`, add a small private helper that calls
`ports.store.findManyWithCount` with a skinny select and a one-row range:

```ts
async function countRows(
	store: DataStore,
	table: string,
	orgId: string,
	filters?: Record<string, unknown>,
	options: FindOptions = {}
): Promise<number> {
	const result = await store.findManyWithCount<{ id: string }>(table, orgId, filters, {
		...options,
		select: options.select ?? 'id',
		range: { from: 0, to: 0 },
		count: options.count ?? 'exact'
	});
	return result.count ?? result.data.length;
}
```

Adjust types/imports to match the live code. Keep the helper private unless an
existing local pattern clearly prefers a shared utility.

### Step 2: Use counts for simple usage totals

Replace full-row loads with `countRows` for:

- active personnel: table `personnel`, `isNull: { archived_at: true }`,
- organization memberships: table `organization_memberships`,
- monthly exports: table `data_exports`, preserving the existing
  `created_at >= start` and `created_at < endExclusive` filters.

The returned `OrganizationPlanUsage` values and `sources` metadata must remain
the same.

### Step 3: Narrow pending invitation reads

Pending invitations still need email dedupe and expiry handling, so do not turn
this into a plain row count.

Fetch only the fields needed by `countUniquePendingUnexpiredInvitations`:

- `email`,
- `normalized_email`,
- `expires_at`.

Preferred shape:

- query pending invitations with `expires_at IS NULL`,
- query pending invitations with `expires_at > now`,
- merge those skinny rows and run the existing dedupe helper.

If the store cannot express those two filters cleanly without changing the port,
keep one pending query but pass `select: 'email, normalized_email, expires_at'`
and leave a short comment explaining why the expiry filter remains in memory.

### Step 4: Add regression tests for query shape and behavior

Extend `organizationPlanUsage.test.ts`.

Required assertions:

- existing count behavior still passes for active personnel, members,
  invitations, and monthly exports,
- active personnel, membership, and monthly export counts call
  `findManyWithCount` instead of `findMany`,
- count queries pass `select: 'id'`, `count: 'exact'`, and a bounded range,
- invitation queries do not select `*`,
- invitation dedupe still counts duplicate normalized emails once,
- expired invitations remain excluded and null-expiry pending invitations remain
  included.

Use spies around the in-memory store methods rather than relying on Supabase.

**Verify**:
`npx vitest run src/lib/server/core/useCases/organizationPlanUsage.test.ts`
exits 0.

### Step 5: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`
all exit 0.

## Test plan

- Focused organization usage tests for behavior and query shape.
- Adapter tests only if an adapter is changed.
- Full repo gate.

## Done criteria

- [ ] Active personnel, membership, and monthly export usage counts no longer
      load all matching rows.
- [ ] Pending invitation usage fetches only the narrow fields needed for expiry
      and email dedupe.
- [ ] Returned `OrganizationPlanUsage` values and source metadata are unchanged.
- [ ] Focused tests prove query shape and existing behavior.
- [ ] The full repo gate passes.
- [ ] `plans/README.md` status row for 045 is updated.

## STOP conditions

Stop and report back if:

- `findManyWithCount` no longer exists or no longer returns a reliable count.
- Supabase count semantics require loading all rows for these tables.
- Invitation expiry or dedupe semantics cannot be preserved without a broader
  query-port change.
- The fix would require a database migration or production database access.

## Maintenance notes

This plan intentionally optimizes the current read model. It does not create a
cached billing ledger or change plan enforcement. If usage checks become
write-path critical later, plan a separate persisted usage-summary design.
