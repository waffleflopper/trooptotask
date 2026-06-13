# Plan 038: Pin the Critical Tasks task-library RLS helper search path

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a2b09628..HEAD -- supabase/migrations src/lib/server/db/criticalTasksLibraryMigration.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `a2b09628`, 2026-06-12

## Why this matters

`public.can_manage_ict_task_library(uuid)` is a `SECURITY DEFINER` helper used by RLS policies.
It currently has no explicit `search_path`. Today the SQL fully qualifies its table references, so
exploitability is reduced, but future edits could accidentally add an unqualified lookup under
definer privileges. Later hardened helpers pin their search path; this helper should follow that
contract and have a static migration test so the drift does not come back.

## Current state

- `supabase/migrations/20260414000200_critical_tasks_library_admin_crud.sql:23-34`:

```sql
CREATE OR REPLACE FUNCTION "public"."can_manage_ict_task_library"("p_organization_id" "uuid")
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND "organization_memberships"."role" IN ('owner', 'admin')
  );
$$;
```

- `supabase/migrations/20260414000200_critical_tasks_library_admin_crud.sql:41-47` uses the
  helper in RLS and grants function access.
- `src/lib/server/db/criticalTasksLibraryMigration.test.ts:35-46` checks the policy shape but not
  the function `search_path` contract.

## Commands you will need

| Purpose               | Command                                                                  | Expected on success |
| --------------------- | ------------------------------------------------------------------------ | ------------------- |
| Static migration test | `npx vitest run src/lib/server/db/criticalTasksLibraryMigration.test.ts` | all pass            |
| DB test gate          | `npm run db:test`                                                        | exit 0              |
| Format                | `npm run format`                                                         | exit 0              |
| Lint                  | `npm run lint`                                                           | exit 0              |
| Governance            | `npm run governance:check`                                               | exit 0              |
| Typecheck             | `npm run check`                                                          | exit 0              |
| Full tests            | `npm run test`                                                           | exit 0              |

## Scope

**In scope**:

- A new migration in `supabase/migrations/`
- `src/lib/server/db/criticalTasksLibraryMigration.test.ts`
- `plans/README.md` status row only

**Out of scope**:

- Do not edit old applied migration files.
- Do not run migrations against the remote production database.
- Do not reset or delete the local database.
- Do not change Critical Tasks UI behavior or RLS role semantics.

## Git workflow

- Branch: `advisor/038-pin-critical-tasks-library-rls-helper-search-path`
- Commit style: short imperative subject. Suggested: `Pin Critical Tasks RLS helper search path`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a follow-up migration

Create a new migration with the next appropriate timestamp, for example:

```text
supabase/migrations/20260612000100_pin_ict_task_library_helper_search_path.sql
```

Migration content should pin the helper search path without changing its role semantics:

```sql
ALTER FUNCTION public.can_manage_ict_task_library(uuid)
  SET search_path = public, pg_temp;
```

If the current project standard for hardened helpers uses an empty search path instead, match the
local standard found in nearby migrations. Do not edit the original 20260414 migration.

**Verify**: `rg -n "can_manage_ict_task_library|search_path" supabase/migrations` -> shows the new
follow-up migration.

### Step 2: Add static migration coverage

Update `criticalTasksLibraryMigration.test.ts` to read the new migration file and assert:

- it references `can_manage_ict_task_library`,
- it sets `search_path`,
- it does not change the owner/admin role list,
- it does not add broad table changes.

Keep the existing tests for the original migration.

**Verify**: `npx vitest run src/lib/server/db/criticalTasksLibraryMigration.test.ts` -> exit 0.

### Step 3: Run DB-local verification only

Run the DB contract gate locally:

```bash
npm run db:test
```

Do not run anything against the remote production database. If local Supabase is not available,
report that as blocked evidence instead of using production.

### Step 4: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Done criteria

- [ ] A new migration pins `public.can_manage_ict_task_library(uuid)` search path.
- [ ] Static migration tests assert the pinned search-path contract.
- [ ] `npm run db:test` passes locally or the final report records why local DB verification was blocked.
- [ ] No old migration files are edited.
- [ ] `plans/README.md` status row for 038 is updated.

## STOP conditions

Stop and report back if:

- A newer migration already replaced or removed `can_manage_ict_task_library`.
- Local DB verification would require resetting or deleting local data without Robert's explicit
  permission.
- The search-path fix changes RLS behavior for owners/admins.

## Maintenance notes

Security-definer helpers should keep explicit search paths even when their current SQL fully
qualifies objects. Review future RLS helper migrations for the same contract.
