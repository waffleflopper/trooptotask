# Plan 018: Filter dashboard active onboardings at query time

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report -- do not improvise. When done, update the status row for this plan
> in `plans/README.md` -- unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 22e6e184..HEAD -- src/lib/server/core/useCases/dashboardQuery.ts src/lib/server/core/useCases/dashboardQuery.test.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `22e6e184`, 2026-06-11

## Why this matters

The dashboard currently asks Supabase for every onboarding row in the organization, including the
nested `onboarding_step_progress(*)` rows for completed and cancelled onboardings, then filters to
`status === 'in_progress'` in Node. That means an organization with years of onboarding history
pays to transfer and hydrate stale history on every dashboard/bootstrap request. The database
already has a partial active-onboarding index for this exact shape, so the dashboard should filter
active onboardings in the query and only hydrate rows the UI can display.

## Current state

- `src/lib/server/core/useCases/dashboardQuery.ts` -- dashboard bootstrap and dashboard data query.
  Both functions fetch all `personnel_onboardings` rows and then filter in memory:

```ts
// src/lib/server/core/useCases/dashboardQuery.ts:120-122 (as of 22e6e184)
ctx.store.findMany<Record<string, unknown>>('personnel_onboardings', orgId, undefined, {
	select: PersonnelOnboardingEntity.select
}),

// src/lib/server/core/useCases/dashboardQuery.ts:139-140
const allOnboardings = PersonnelOnboardingEntity.fromDbArray(onboardingRows);
const activeOnboardings = allOnboardings.filter((o) => o.status === 'in_progress');
```

```ts
// src/lib/server/core/useCases/dashboardQuery.ts:206-213 (as of 22e6e184)
ctx.store.findMany<Record<string, unknown>>('personnel_onboardings', orgId, undefined, {
	select: PersonnelOnboardingEntity.select
}),
...
const allOnboardings = PersonnelOnboardingEntity.fromDbArray(onboardingRows);
const activeOnboardings = allOnboardings.filter((o) => o.status === 'in_progress');
```

- `src/lib/server/entities/personnelOnboarding.ts` documents why this is costly: the entity select
  is eager and nested.

```ts
// src/lib/server/entities/personnelOnboarding.ts:1-4
 * Personnel onboarding entity -- maps `personnel_onboardings` with eager-loaded step progress.
 * `select: '*, onboarding_step_progress(*)'` fetches all step rows in one query.
```

```ts
// src/lib/server/entities/personnelOnboarding.ts:16-19
export const PersonnelOnboardingEntity = defineEntity<PersonnelOnboarding>({
	table: 'personnel_onboardings',
	groupScope: 'none',
	select: '*, onboarding_step_progress(*)',
```

- The database already has an index that makes active-onboarding lookup cheap:

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:3179-3183
CREATE UNIQUE INDEX "personnel_onboardings_active_idx"
ON "public"."personnel_onboardings" USING "btree" ("organization_id", "personnel_id")
WHERE ("status" = 'in_progress'::"text");

CREATE INDEX "personnel_onboardings_org_idx"
ON "public"."personnel_onboardings" USING "btree" ("organization_id");
```

- `src/lib/server/core/useCases/dashboardQuery.test.ts` already has a behavior test named
  "filters onboardings to only in_progress status" at lines 99-132. It proves the response is
  filtered, but not that the database query is filtered.

## Commands you will need

| Purpose            | Command                                                         | Expected on success |
|--------------------|-----------------------------------------------------------------|---------------------|
| Focused tests      | `npx vitest run src/lib/server/core/useCases/dashboardQuery.test.ts` | all pass            |
| Typecheck          | `npm run check`                                                 | exit 0, 0 errors    |
| Lint               | `npm run lint`                                                  | exit 0              |
| Format             | `npm run format`                                                | exit 0              |
| Governance         | `npm run governance:check`                                      | exit 0              |
| Full tests         | `npm run test`                                                  | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `src/lib/server/core/useCases/dashboardQuery.ts`
- `src/lib/server/core/useCases/dashboardQuery.test.ts`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `src/lib/server/entities/personnelOnboarding.ts` -- the nested select is still correct for active rows.
- `supabase/migrations/` -- the active-onboarding index already exists.
- Onboarding list/detail pages -- this plan only changes the dashboard/bootstrap hot path.
- Any response-shape changes to dashboard data.

## Git workflow

- Branch: `advisor/018-filter-dashboard-active-onboardings`
- Commit style: short imperative subject, matching repo history. Suggested:
  `Filter dashboard active onboardings in query`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add one active-onboarding loader and use it in both dashboard paths

In `src/lib/server/core/useCases/dashboardQuery.ts`, add a small helper near the other local
helpers/import-adjacent functions:

```ts
async function loadActiveOnboardings(ctx: QueryPorts, orgId: string) {
	const rows = await ctx.store.findMany<Record<string, unknown>>(
		'personnel_onboardings',
		orgId,
		{ status: 'in_progress' },
		{ select: PersonnelOnboardingEntity.select }
	);
	return PersonnelOnboardingEntity.fromDbArray(rows);
}
```

Then replace the two unfiltered `ctx.store.findMany('personnel_onboardings', ...)` calls in
`fetchDashboardBootstrap` and `fetchDashboardData` with this helper. The promise tuple variable
should become `activeOnboardings` instead of `onboardingRows`, and the later
`allOnboardings.filter(...)` block should be removed. Keep the returned property name
`activeOnboardings`.

**Verify**: `npm run check` -> exit 0.

### Step 2: Strengthen the dashboard regression test to prove query-time filtering

Update `src/lib/server/core/useCases/dashboardQuery.test.ts`.

Keep the existing behavior assertion in "filters onboardings to only in_progress status", but add
an assertion that the onboarding query itself included `{ status: 'in_progress' }`.

Preferred pattern:

1. Wrap or spy on `ctx.store.findMany` inside the test.
2. Capture calls where `table === 'personnel_onboardings'`.
3. Assert the call used `filters` exactly containing `status: 'in_progress'`.
4. Keep the seeded completed onboarding row in the fixture so the response-shape assertion still
   proves only active rows are returned.

If the in-memory store does not expose call history, wrap the method locally:

```ts
const calls: Array<{ table: string; filters: Record<string, unknown> | undefined }> = [];
const originalFindMany = ctx.store.findMany.bind(ctx.store);
ctx.store.findMany = ((table, orgId, filters, options) => {
	calls.push({ table, filters });
	return originalFindMany(table, orgId, filters, options);
}) as typeof ctx.store.findMany;
```

Also add the same assertion for `fetchDashboardBootstrap` if its existing tests do not already
exercise active onboarding rows. This plan touches both exported functions, so both should have
test coverage for the query-time filter.

**Verify**: `npx vitest run src/lib/server/core/useCases/dashboardQuery.test.ts` -> all tests pass.

### Step 3: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test` ->
all commands exit 0.

## Test plan

- Existing test to strengthen: `src/lib/server/core/useCases/dashboardQuery.test.ts`, test
  "filters onboardings to only in_progress status".
- New/updated coverage:
  - `fetchDashboardData` calls `findMany('personnel_onboardings', orgId, { status: 'in_progress' }, ...)`.
  - `fetchDashboardBootstrap` calls the same filtered query.
  - Completed/cancelled onboarding rows are not returned in `activeOnboardings`.
- Verification: `npx vitest run src/lib/server/core/useCases/dashboardQuery.test.ts` -> all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `rg "personnel_onboardings', orgId, undefined" src/lib/server/core/useCases/dashboardQuery.ts`
      returns no dashboard onboarding query matches.
- [ ] `rg "status: 'in_progress'" src/lib/server/core/useCases/dashboardQuery.ts` returns at least one
      match in the dashboard active-onboarding loader.
- [ ] `npx vitest run src/lib/server/core/useCases/dashboardQuery.test.ts` exits 0.
- [ ] `npm run format`, `npm run lint`, `npm run governance:check`, `npm run check`, and
      `npm run test` all exit 0.
- [ ] `git status` shows no modified files outside the in-scope list.
- [ ] `plans/README.md` status row for 018 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The dashboard onboarding queries no longer match the excerpts above.
- `PersonnelOnboardingEntity.select` no longer includes `onboarding_step_progress(*)`; this would
  change the performance diagnosis and may need a different plan.
- The existing active onboarding partial index is missing from the schema/migrations.
- Proving query-time filtering requires changing the `DataStore` port or in-memory adapter.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- Reviewer should scrutinize that both dashboard exports changed, not just one.
- The active-onboarding index is partial on `status = 'in_progress'`; keep the filter literal
  aligned with that value.
- If future dashboard needs completed onboarding history, add a separate paginated/history query
  instead of widening this hot-path fetch.
