# Plan 053: Drop the legacy clinic owner RPC

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- supabase/migrations supabase/tests/sensitive_rpc_privileges.sql src/lib/server/db`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

The original remote schema still contains `public.create_clinic_with_owner(text)`, a clinic-era
`SECURITY DEFINER` RPC. It grants execute privileges to `anon` and `authenticated`, and its body
writes to retired `public.clinics` and `public.clinic_memberships` tables that are no longer part
of the active organization model. Today the function appears stale and probably fails, but leaving
an obsolete privilege-bearing RPC callable from client roles creates an avoidable future footgun.

## Current state

- `supabase/migrations/20260413001158_remote_schema.sql` defines the stale function and grants it
  to public client roles.
- Plans 039 and 040 already hardened other sensitive RPC grants and extended
  `supabase/tests/sensitive_rpc_privileges.sql`; this plan adds the missing clinic-era cleanup.
- There are no current app callers:

```bash
rg -n "create_clinic_with_owner" supabase/migrations supabase/tests src
```

Current excerpts:

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:810
CREATE OR REPLACE FUNCTION "public"."create_clinic_with_owner"("p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
```

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:826
INSERT INTO public.clinics (name, created_by)
VALUES (p_name, v_user_id)
RETURNING id INTO v_clinic_id;

-- supabase/migrations/20260413001158_remote_schema.sql:831
INSERT INTO public.clinic_memberships (clinic_id, user_id, role)
VALUES (v_clinic_id, v_user_id, 'owner');
```

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:4821
GRANT ALL ON FUNCTION "public"."create_clinic_with_owner"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_clinic_with_owner"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_clinic_with_owner"("p_name" "text") TO "service_role";
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Search callers | `rg -n "create_clinic_with_owner" supabase/migrations supabase/tests src` | only the original schema plus this plan's new files |
| Static migration test | `npx vitest run src/lib/server/db/legacyClinicRpcRemovalMigration.test.ts` | exits 0 |
| DB contracts | `npm run db:test` | exits 0 against local Supabase |
| Local migration | `supabase migration up` | applies locally; never remote |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `supabase/migrations/20260614000100_drop_legacy_clinic_owner_rpc.sql` (create, or use the next
  available timestamp if that name already exists)
- `supabase/tests/sensitive_rpc_privileges.sql`
- `src/lib/server/db/legacyClinicRpcRemovalMigration.test.ts` (create)
- `plans/README.md` status row only

**Out of scope**:

- Do not edit old applied migration files.
- Do not recreate `clinics` or `clinic_memberships`.
- Do not change organization creation or membership behavior.
- Do not run migrations against the remote production database.
- Do not reset or delete the local database without Robert's explicit permission.

## Git workflow

- Branch: `codex/053-drop-legacy-clinic-owner-rpc`
- Commit style: short imperative subject. Suggested: `Drop legacy clinic owner RPC`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the RPC is still stale and unused

Run:

```bash
rg -n "create_clinic_with_owner" supabase/migrations supabase/tests src
```

Expected current shape: the only runtime definition/grants are in
`20260413001158_remote_schema.sql`; there are no `src/` callers.

**Verify**: command exits 0 and no app source caller exists.

### Step 2: Add the drop migration

Create the new migration with:

```sql
DROP FUNCTION IF EXISTS public.create_clinic_with_owner(text);
```

Do not add a replacement function or compatibility wrapper. This RPC is tied to retired clinic
tables and should not remain as a client-callable organization creation path.

**Verify**:

```bash
rg -n "DROP FUNCTION IF EXISTS public\\.create_clinic_with_owner\\(text\\)" supabase/migrations/20260614000100_drop_legacy_clinic_owner_rpc.sql
```

shows one match.

### Step 3: Add static migration coverage

Create `src/lib/server/db/legacyClinicRpcRemovalMigration.test.ts`.

Follow the style of the existing migration string tests under `src/lib/server/db/`. Assert that
the new migration:

- drops `public.create_clinic_with_owner(text)`,
- does not create or replace the function,
- does not grant execute to `anon` or `authenticated`,
- does not create `clinics` or `clinic_memberships`.

**Verify**:

```bash
npx vitest run src/lib/server/db/legacyClinicRpcRemovalMigration.test.ts
```

exits 0.

### Step 4: Extend the DB privilege contract

Update `supabase/tests/sensitive_rpc_privileges.sql` to assert the legacy RPC is absent.

Use `to_regprocedure` so the assertion does not error when the function is gone:

```sql
SELECT is(
	to_regprocedure('public.create_clinic_with_owner(text)'),
	NULL::regprocedure,
	'legacy clinic owner RPC is absent'
);
```

Increase `SELECT plan(27)` to `SELECT plan(28)` unless another already-landed plan has changed the
count; if so, add exactly one to the live assertion count.

**Verify**: `npm run db:test` exits 0.

### Step 5: Apply locally and run the full gate

If local Supabase is running, apply the migration locally:

```bash
supabase migration up
```

Do not point the command at production. Then run:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

**Verify**: every command exits 0.

## Test plan

- New static migration test for the drop migration.
- Extended `supabase/tests/sensitive_rpc_privileges.sql` assertion that the function is absent.
- Full local `npm run db:test` after applying the migration.

## Done criteria

- [ ] A follow-up migration drops `public.create_clinic_with_owner(text)`.
- [ ] No app source caller references `create_clinic_with_owner`.
- [ ] Static migration coverage exists and passes.
- [ ] `supabase/tests/sensitive_rpc_privileges.sql` asserts the function is absent.
- [ ] `npm run db:test` passes locally, or the final handoff states why local DB verification was blocked.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 053 is updated.

## STOP conditions

Stop and report back if:

- A current app source caller uses `create_clinic_with_owner`.
- A later migration has already replaced this function with active organization semantics.
- Dropping the function would require recreating retired clinic tables.
- Local DB verification would require resetting or deleting local data without Robert's explicit permission.

## Maintenance notes

Review future security-definer RPC migrations for old domain names and default client grants. A stale
function that "probably fails" is still a privilege surface if it remains callable by client roles.
