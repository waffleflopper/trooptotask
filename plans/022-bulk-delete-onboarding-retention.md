# Plan 022: Bulk delete expired onboarding retention rows

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report -- do not improvise. When done, update the status row for this plan
> in `plans/README.md` -- unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 22e6e184..HEAD -- src/lib/server/core/useCases/onboardingRetention.ts src/lib/server/core/useCases/onboardingRetention.test.ts src/lib/server/core/useCases/archiveRetention.ts supabase/migrations/20260413001158_remote_schema.sql`
> If any listed path changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `22e6e184`, 2026-06-11

## Why this matters

The onboarding retention cleanup currently fetches completed/cancelled records into Node, computes
expiration there, then deletes each onboarding and each step progress row one at a time. That makes
cleanup cost grow with the number of expired onboardings and their steps. The store already has
range filters, `deleteWhereAny`, and `deleteManyByIds`, and the database has an
`ON DELETE CASCADE` foreign key from step progress to onboardings. This plan turns the per-record
delete loop into bounded bulk operations per organization while keeping notification behavior and
test-visible step cleanup intact.

## Current state

- `src/lib/server/core/useCases/onboardingRetention.ts` loads all completed and cancelled rows for
  each org, computes expiry in Node, then deletes records one by one:

```ts
// src/lib/server/core/useCases/onboardingRetention.ts:76-95
const completed = await store.findMany<OnboardingRow>('personnel_onboardings', org.id, {
	status: 'completed'
});
const cancelled = await store.findMany<OnboardingRow>('personnel_onboardings', org.id, {
	status: 'cancelled'
});

const toDelete: OnboardingRow[] = [];

for (const ob of [...completed, ...cancelled]) {
	const dateField = ob.status === 'completed' ? ob.completed_at : ob.cancelled_at;
	if (!dateField) continue;

	const expiresAt = new Date(dateField);
	expiresAt.setMonth(expiresAt.getMonth() + org.retentionMonths);

	if (now > expiresAt) {
		toDelete.push(ob);
	}
}
```

```ts
// src/lib/server/core/useCases/onboardingRetention.ts:102-110
for (const ob of toDelete) {
	// Cascade: delete step progress rows for this onboarding
	const steps = await store.findMany<{ id: string }>('onboarding_step_progress', org.id, {
		onboarding_id: ob.id
	});
	for (const step of steps) {
		await store.delete('onboarding_step_progress', org.id, step.id);
	}
	await store.delete('personnel_onboardings', org.id, ob.id);
}
```

- `src/lib/server/core/useCases/archiveRetention.ts` shows the preferred pattern: compute a cutoff,
  query IDs with `rangeFilters`, then call `deleteManyByIds`:

```ts
// src/lib/server/core/useCases/archiveRetention.ts:341-356
let rows = await ports.store.findMany<CleanupCandidate>(family.table, org.id, family.filters, {
	select: family.select ?? 'id',
	rangeFilters: [{ column: family.timestampColumn, op: 'lt', value: cutoff }],
	isNull: { [family.timestampColumn]: false }
});
...
const deletedCount = await ports.store.deleteManyByIds(
	family.table,
	org.id,
	rows.map((row) => row.id)
);
```

- The database has cascade safety for step progress:

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:3505-3506
ALTER TABLE ONLY "public"."onboarding_step_progress"
    ADD CONSTRAINT "onboarding_step_progress_onboarding_id_fkey"
    FOREIGN KEY ("onboarding_id") REFERENCES "public"."personnel_onboardings"("id") ON DELETE CASCADE;
```

- The current unit test `src/lib/server/core/useCases/onboardingRetention.test.ts` includes
  "cascades deletion to step progress rows" at lines 120-159. The in-memory store does not enforce
  database FKs, so the use case still needs to keep tests and local behavior aligned.

## Commands you will need

| Purpose       | Command                                                              | Expected on success |
|---------------|----------------------------------------------------------------------|---------------------|
| Focused tests | `npx vitest run src/lib/server/core/useCases/onboardingRetention.test.ts` | all pass            |
| Typecheck     | `npm run check`                                                      | exit 0, 0 errors    |
| Lint          | `npm run lint`                                                       | exit 0              |
| Format        | `npm run format`                                                     | exit 0              |
| Governance    | `npm run governance:check`                                           | exit 0              |
| Full tests    | `npm run test`                                                       | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `src/lib/server/core/useCases/onboardingRetention.ts`
- `src/lib/server/core/useCases/onboardingRetention.test.ts`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- Supabase migrations -- the FK cascade already exists; do not add retention indexes in this
  small plan.
- Archive retention use case -- use it as a pattern only.
- Notification text/recipient behavior.
- Local or production database cleanup commands.

## Git workflow

- Branch: `advisor/022-bulk-delete-onboarding-retention`
- Commit style: short imperative subject. Suggested:
  `Bulk delete expired onboarding records`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Query expired candidates with date cutoffs

In `src/lib/server/core/useCases/onboardingRetention.ts`, replace the "load all completed/cancelled
then compute expiry in Node" pattern with cutoff-based queries.

For each org:

1. Compute `cutoff` by subtracting `org.retentionMonths` from `now`.
2. Query completed rows by `completed_at < cutoff`:

```ts
const completed = await store.findMany<OnboardingRow>(
	'personnel_onboardings',
	org.id,
	{ status: 'completed' },
	{
		select: 'id, status, completed_at, cancelled_at',
		rangeFilters: [{ column: 'completed_at', op: 'lt', value: cutoff }],
		isNull: { completed_at: false }
	}
);
```

3. Query cancelled rows by `cancelled_at < cutoff` with the same `select` shape and
   `isNull: { cancelled_at: false }`.
4. Combine the two arrays and map to IDs.

Use the date/string convention already used in `archiveRetention.ts`; if that helper is exported
and appropriate, reuse it. Otherwise keep a local helper in `onboardingRetention.ts` so this plan
does not broaden the archive-retention module's public surface.

**Verify**: `npm run check` -> exit 0.

### Step 2: Replace per-record deletes with bulk deletes

For each org with expired onboarding IDs:

1. Delete step progress in one call so the in-memory store and tests still observe child cleanup:

```ts
await store.deleteWhereAny(
	'onboarding_step_progress',
	org.id,
	expiredIds.map((id) => ({ onboarding_id: id }))
);
```

2. Delete parent onboardings in one call:

```ts
const deletedCount = await store.deleteManyByIds('personnel_onboardings', org.id, expiredIds);
```

3. Add to `totalDeleted` using the returned `deletedCount`, not the candidate count.
4. Keep `affectedOrgs.add(org.id)` and admin notifications only when `deletedCount > 0`.
5. Keep the existing result shape.

The database FK cascade remains a safety net. The explicit bulk child delete is retained because
the test adapter does not model FK cascades and because it is still one operation per org, not one
operation per step.

**Verify**: `npx vitest run src/lib/server/core/useCases/onboardingRetention.test.ts` -> all pass.

### Step 3: Add operation-count regression coverage

Update `src/lib/server/core/useCases/onboardingRetention.test.ts` with a test that seeds multiple
expired onboardings with multiple step rows and wraps these store methods:

- `deleteWhereAny`
- `deleteManyByIds`
- `delete`
- `findMany`

Assert:

- `deleteWhereAny` is called once for the org's expired onboarding IDs.
- `deleteManyByIds` is called once with all expired parent IDs.
- `store.delete` is not called for each step/onboarding.
- Existing behavior tests still pass: active/recent rows remain, expired rows are gone, step rows
  for expired onboardings are gone, notifications are created.

**Verify**: `npx vitest run src/lib/server/core/useCases/onboardingRetention.test.ts` -> all pass.

### Step 4: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test` ->
all commands exit 0.

## Test plan

- Existing tests in `src/lib/server/core/useCases/onboardingRetention.test.ts` should continue to
  pass.
- New regression test proves cleanup uses bulk delete methods rather than per-record `delete`.
- Verification: focused vitest command plus the full repo gate.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `rg "deleteManyByIds\\('personnel_onboardings'" src/lib/server/core/useCases/onboardingRetention.ts`
      returns one match.
- [ ] `rg "deleteWhereAny\\('onboarding_step_progress'" src/lib/server/core/useCases/onboardingRetention.ts`
      returns one match.
- [ ] `rg "store\\.delete\\(" src/lib/server/core/useCases/onboardingRetention.ts` returns no matches.
- [ ] `npx vitest run src/lib/server/core/useCases/onboardingRetention.test.ts` exits 0.
- [ ] `npm run format`, `npm run lint`, `npm run governance:check`, `npm run check`, and
      `npm run test` all exit 0.
- [ ] `git status` shows no modified files outside the in-scope list.
- [ ] `plans/README.md` status row for 022 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- `DataStore.findMany` no longer supports `rangeFilters` or `isNull`.
- `DataStore.deleteWhereAny` cannot safely express multiple `onboarding_id` equality groups.
- Existing tests rely on per-step deletion side effects that are not equivalent to bulk child
  deletion plus parent deletion.
- The FK cascade from `onboarding_step_progress.onboarding_id` to `personnel_onboardings.id` is
  missing from the schema.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- Reviewer should check that notifications are based on actual deleted count, not candidate count.
- If retention cleanup becomes a very large table scan later, add indexes on
  `(organization_id, status, completed_at)` and `(organization_id, status, cancelled_at)` in a
  separate migration plan with local EXPLAIN evidence.
- Keep the use case adapter-neutral; do not branch on Supabase vs in-memory behavior.
