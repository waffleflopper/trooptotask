# Plan 019: Add composite date-window indexes for Calendar hot paths

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report -- do not improvise. When done, update the status row for this plan
> in `plans/README.md` -- unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 22e6e184..HEAD -- src/lib/server/core/useCases/calendarQuery.ts src/lib/server/core/useCases/dashboardQuery.ts 'src/routes/org/[orgId]/api/calendar-reports/status-days/+server.ts' supabase/migrations supabase/tests`
> If any listed path changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf, migration
- **Planned at**: commit `22e6e184`, 2026-06-11

## Why this matters

Calendar, dashboard, and report reads repeatedly load organization-scoped date windows from
`availability_entries`, `daily_assignments`, and `special_days`. The current schema has separate
`organization_id` and `date` indexes for some of these tables, but not the composite indexes that
match the actual predicates. On larger organizations, the planner can scan many rows for the org
and then discard by date, or scan by date and then discard by org. This plan adds targeted local
Supabase migrations so the common "org plus date window" reads can use one index.

## Current state

- `src/lib/server/core/useCases/calendarQuery.ts` has three hot date-window paths:

```ts
// fetchCalendarData, src/lib/server/core/useCases/calendarQuery.ts:100-127
ctx.store.findMany('availability_entries', orgId, undefined, {
	rangeFilters: [
		{ column: 'end_date', op: 'gte', value: rangeStart },
		{ column: 'start_date', op: 'lte', value: rangeEnd }
	]
});
ctx.store.findMany('special_days', orgId, undefined, {
	rangeFilters: [
		{ column: 'date', op: 'gte', value: rangeStart },
		{ column: 'date', op: 'lte', value: rangeEnd }
	]
});
ctx.store.findMany('daily_assignments', orgId, undefined, {
	rangeFilters: [
		{ column: 'date', op: 'gte', value: rangeStart },
		{ column: 'date', op: 'lte', value: rangeEnd }
	]
});
```

```ts
// fetchCalendarRangeData, src/lib/server/core/useCases/calendarQuery.ts:160-183
// Same availability_entries, special_days, and daily_assignments date-window shape.
```

```ts
// fetchCalendarBootstrap, src/lib/server/core/useCases/calendarQuery.ts:209-235
// Same availability_entries, special_days, and daily_assignments date-window shape.
```

- `src/lib/server/core/useCases/dashboardQuery.ts` also reads date windows for dashboard data:

```ts
// src/lib/server/core/useCases/dashboardQuery.ts:74-90
ctx.store.findMany('availability_entries', orgId, undefined, {
	rangeFilters: [
		{ column: 'end_date', op: 'gte', value: yesterday },
		{ column: 'start_date', op: 'lte', value: twoWeeksOut }
	]
});
ctx.store.findMany('daily_assignments', orgId, undefined, {
	rangeFilters: [
		{ column: 'date', op: 'gte', value: yesterday },
		{ column: 'date', op: 'lte', value: twoWeeksOut }
	]
});
```

- `src/routes/org/[orgId]/api/calendar-reports/status-days/+server.ts` uses the same read family
  for report generation.

- Current schema indexes are not shaped for these predicates:

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:2991-2995
CREATE INDEX "idx_availability_org" ON "public"."availability_entries" USING "btree" ("organization_id");
CREATE INDEX "idx_availability_personnel" ON "public"."availability_entries" USING "btree" ("personnel_id");

-- supabase/migrations/20260413001158_remote_schema.sql:3031-3035
CREATE INDEX "idx_daily_assignments_date" ON "public"."daily_assignments" USING "btree" ("date");
CREATE INDEX "idx_daily_assignments_org" ON "public"."daily_assignments" USING "btree" ("organization_id");

-- supabase/migrations/20260413001158_remote_schema.sql:3151
CREATE INDEX "idx_special_days_org" ON "public"."special_days" USING "btree" ("organization_id");
```

- There is a daily-assignment uniqueness constraint on `(organization_id, assignment_type_id,
date)`, but it is not a substitute for `(organization_id, date)` range reads because
  `assignment_type_id` sits between the org and date columns.

## Commands you will need

| Purpose            | Command                                                            | Expected on success           |
| ------------------ | ------------------------------------------------------------------ | ----------------------------- |
| Supabase status    | `supabase status`                                                  | local project shown           |
| Apply migration    | `supabase migration up`                                            | new migration applied locally |
| DB test (if added) | `supabase test db supabase/tests/calendar_date_window_indexes.sql` | pgTAP exits 0                 |
| Governance         | `npm run governance:check`                                         | exit 0                        |
| Typecheck          | `npm run check`                                                    | exit 0, 0 errors              |
| Full tests         | `npm run test`                                                     | exit 0                        |

Do not run `supabase db reset` unless Robert explicitly gives permission in the current thread.
Never point these commands at the remote production database.

## Scope

**In scope** (the only files you should modify):

- `supabase/migrations/<new timestamp>_calendar_date_window_indexes.sql`
- `supabase/tests/calendar_date_window_indexes.sql` (create if the repo's current pgTAP setup can
  run an index-existence test cleanly)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- Calendar query TypeScript code -- this plan changes physical indexes only.
- Calendar report range limits or UI validation.
- Production database commands.
- Broad index cleanup or dropping existing indexes. This plan only adds targeted indexes.

## Git workflow

- Branch: `advisor/019-add-calendar-date-window-indexes`
- Commit style: short imperative subject. Suggested: `Add Calendar date-window indexes`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the migration

Create a new timestamped migration under `supabase/migrations/`, for example:

`supabase/migrations/YYYYMMDDHHMMSS_calendar_date_window_indexes.sql`

Add these indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_availability_entries_org_end_start
ON public.availability_entries USING btree (organization_id, end_date, start_date);

CREATE INDEX IF NOT EXISTS idx_availability_entries_org_start_end
ON public.availability_entries USING btree (organization_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_daily_assignments_org_date
ON public.daily_assignments USING btree (organization_id, date);

CREATE INDEX IF NOT EXISTS idx_special_days_org_date
ON public.special_days USING btree (organization_id, date);
```

Why two availability indexes: overlap predicates use both `end_date >= rangeStart` and
`start_date <= rangeEnd`. A B-tree can only use one range column deeply after the
`organization_id` equality. The paired indexes let the planner choose the selective side and can
also participate in bitmap plans. Availability writes are low-volume compared with reads in the
Calendar hot path.

**Verify**: `supabase migration up` -> the new migration applies locally without errors.

### Step 2: Add a narrow DB contract test if pgTAP is available

If the repo's current Supabase test setup supports pgTAP files under `supabase/tests/`, create
`supabase/tests/calendar_date_window_indexes.sql` with simple `to_regclass` assertions:

```sql
begin;
select plan(4);

select isnt(to_regclass('public.idx_availability_entries_org_end_start'), null, 'availability org/end/start index exists');
select isnt(to_regclass('public.idx_availability_entries_org_start_end'), null, 'availability org/start/end index exists');
select isnt(to_regclass('public.idx_daily_assignments_org_date'), null, 'daily assignments org/date index exists');
select isnt(to_regclass('public.idx_special_days_org_date'), null, 'special days org/date index exists');

select * from finish();
rollback;
```

If the repo does not have a working pgTAP harness for index-existence checks, do not invent a new
test framework. Instead, verify with a local SQL query against `pg_indexes` and record that result
in your final report.

**Verify**:

- Preferred: `supabase test db supabase/tests/calendar_date_window_indexes.sql` -> exits 0.
- Fallback: local query against `pg_indexes` returns all four new index names.

### Step 3: Run the repo gate

**Verify**:
`npm run governance:check && npm run check && npm run test` -> all commands exit 0.

## Test plan

- Migration verification: `supabase migration up` applies the migration locally.
- DB contract verification: pgTAP index-existence test passes, or a local `pg_indexes` query
  returns the four new index names if pgTAP is unavailable.
- Repo verification: `npm run governance:check`, `npm run check`, and `npm run test` pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] A new migration exists under `supabase/migrations/` with the four expected index names.
- [ ] `supabase migration up` exits 0 against the local Supabase database.
- [ ] Either `supabase/tests/calendar_date_window_indexes.sql` passes or your final report includes
      the exact local `pg_indexes` query result proving the indexes exist.
- [ ] `npm run governance:check`, `npm run check`, and `npm run test` exit 0.
- [ ] `git status` shows no modified files outside the in-scope list.
- [ ] `plans/README.md` status row for 019 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- `supabase status` shows you are not connected to a local development project.
- Any command tries to reset, wipe, or target the remote production database.
- A live schema check shows one or more of these exact composite indexes already exist under a
  different name; report the names instead of adding duplicates.
- The calendar query code no longer uses the date-window shapes shown above.
- Adding the indexes triggers a governance failure that indicates a naming or migration-order
  convention you cannot resolve confidently.

## Maintenance notes

- Reviewer should scrutinize write-amplification risk. These tables are read heavily by Calendar;
  the extra indexes are justified only because they match repeated hot-path reads.
- If future work adds report range caps, that is complementary; it should not replace these
  indexes.
- If production data later shows one of the two availability indexes is unused, drop only after
  checking `pg_stat_user_indexes` over a meaningful period.
