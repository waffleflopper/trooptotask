# Plan 001: Harden sensitive RPC execute privileges

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise.
>
> **Drift check (run first)**: `git diff --stat 679b6113..HEAD -- supabase/migrations supabase/tests docs/local-auth-testing.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `679b6113`, 2026-06-10

## Why This Matters

Several `SECURITY DEFINER` functions are privilege boundaries but are executable by `anon` and `authenticated`. `search_users_by_email` reads `auth.users` email and sign-in metadata; cleanup RPCs delete audit-log and Stripe webhook history. The app intends these operations to happen through platform-admin or scheduled service-role paths, so direct public RPC execution should be revoked and covered by database tests.

## Current State

- `supabase/migrations/20260413001158_remote_schema.sql` is the original remote schema dump that defines the affected functions and grants.
- `src/routes/api/cleanup-old-data/+server.ts` is the intended scheduled app path for the cleanup RPCs; it invokes them through `getAdminClient()` after bearer authorization.
- `src/lib/server/adapters/supabasePlatformAdministration.ts` is the app adapter path for `search_users_by_email`.
- `supabase/tests/auth_workflow_authorization.sql` is the existing pgTAP pattern. It uses `BEGIN`, `CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions`, `SELECT plan(...)`, role switches, `has_function_privilege(...)`, `finish()`, and `ROLLBACK`.

Current excerpts:

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:742
CREATE OR REPLACE FUNCTION "public"."cleanup_old_audit_logs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
```

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:1347
CREATE OR REPLACE FUNCTION "public"."search_users_by_email"("search_query" "text", "max_results" integer DEFAULT 5) RETURNS json
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(json_agg(row_to_json(u)), '[]'::json)
  FROM (
    SELECT id, email, created_at, last_sign_in_at
    FROM auth.users
```

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:4797
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"() TO "authenticated";

-- supabase/migrations/20260413001158_remote_schema.sql:4899
GRANT ALL ON FUNCTION "public"."search_users_by_email"("search_query" "text", "max_results" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_users_by_email"("search_query" "text", "max_results" integer) TO "authenticated";
```

## Commands You Will Need

| Purpose                 | Command                                                        | Expected on success                                   |
| ----------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| Check final definitions | `rg -n "search_users_by_email                                  | cleanup_old_audit_logs                                | cleanup_old_webhook_events" supabase/migrations` | Shows no later migration already fixing this |
| Local DB                | `supabase start`                                               | Local Supabase is running; do not point at production |
| DB contract             | `supabase test db supabase/tests/sensitive_rpc_privileges.sql` | pgTAP passes                                          |
| Format                  | `npm run format`                                               | exits 0                                               |
| Lint                    | `npm run lint`                                                 | exits 0                                               |
| Governance              | `npm run governance:check`                                     | exits 0                                               |
| Typecheck               | `npm run check`                                                | exits 0                                               |
| Unit tests              | `npm run test`                                                 | exits 0                                               |

## Scope

**In scope**:

- `supabase/migrations/20260610000100_restrict_sensitive_rpc_grants.sql` (create)
- `supabase/tests/sensitive_rpc_privileges.sql` (create)
- `docs/local-auth-testing.md` only if you add a short note about the new pgTAP contract

**Out of scope**:

- Any production or remote database operation.
- Any local database reset or table deletion.
- RLS helper functions broadly granted for policy evaluation, such as `can_view_calendar` and `can_view_personnel`.
- App-route refactors. Plan 002 handles app endpoint bearer auth separately.

## Git Workflow

- Branch: `codex/001-harden-sensitive-rpc-execute-privileges`
- Commit message style: short imperative, for example `Harden sensitive RPC privileges`
- Do not push or open a PR unless the operator asks.

## Steps

### Step 1: Confirm the affected functions are still final

Run:

```bash
rg -n "CREATE OR REPLACE FUNCTION \"public\"\\.\"(search_users_by_email|cleanup_old_audit_logs|cleanup_old_webhook_events)|GRANT .*ON FUNCTION \"public\"\\.\"(search_users_by_email|cleanup_old_audit_logs|cleanup_old_webhook_events)" supabase/migrations
```

Confirm there is no later migration after `20260413001158_remote_schema.sql` redefining the same three functions or revoking the public grants.

**Verify**: the command exits 0 and only shows the original definitions/grants unless this plan has already been partially implemented.

### Step 2: Add the hardening migration

Create `supabase/migrations/20260610000100_restrict_sensitive_rpc_grants.sql`.

The migration should:

- Revoke execute from `PUBLIC`, `anon`, and `authenticated` for:
  - `public.search_users_by_email(text, integer)`
  - `public.cleanup_old_audit_logs()`
  - `public.cleanup_old_webhook_events()`
- Grant execute to `service_role` for the same functions.
- Set explicit search paths on these security-definer functions:
  - `ALTER FUNCTION public.search_users_by_email(text, integer) SET search_path = public, pg_temp;`
  - `ALTER FUNCTION public.cleanup_old_audit_logs() SET search_path = public, pg_temp;`
  - `ALTER FUNCTION public.cleanup_old_webhook_events() SET search_path = public, pg_temp;`

Do not change the function bodies in this plan unless PostgreSQL rejects the `ALTER FUNCTION` statements.

**Verify**: `rg -n "REVOKE EXECUTE ON FUNCTION public\\.(search_users_by_email|cleanup_old_audit_logs|cleanup_old_webhook_events)|SET search_path" supabase/migrations/20260610000100_restrict_sensitive_rpc_grants.sql` shows all three functions.

### Step 3: Add pgTAP privilege coverage

Create `supabase/tests/sensitive_rpc_privileges.sql` following the structure of `supabase/tests/auth_workflow_authorization.sql`.

Include assertions that:

- `anon` does not have `EXECUTE` on all three functions.
- `authenticated` does not have `EXECUTE` on all three functions.
- `service_role` does have `EXECUTE` on all three functions.

Use `has_function_privilege(role, regprocedure_text, 'EXECUTE')` as the primary check. Keep the test wrapped in a transaction with `ROLLBACK`.

**Verify**: `supabase test db supabase/tests/sensitive_rpc_privileges.sql` passes.

### Step 4: Run the repo gate

Run the full repo completion gate.

**Verify**:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

All commands exit 0.

## Test Plan

- New pgTAP test: `supabase/tests/sensitive_rpc_privileges.sql`
- Existing pattern: `supabase/tests/auth_workflow_authorization.sql`
- Required coverage:
  - `anon` denied for user search and cleanup RPCs
  - `authenticated` denied for user search and cleanup RPCs
  - `service_role` still allowed

## Done Criteria

- [ ] New migration revokes public execute from all three sensitive functions.
- [ ] New migration keeps `service_role` execute access.
- [ ] New migration sets explicit search paths for all three functions.
- [ ] `supabase test db supabase/tests/sensitive_rpc_privileges.sql` passes on local Supabase.
- [ ] Full npm gate passes: `format`, `lint`, `governance:check`, `check`, `test`.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` status row updated.

## STOP Conditions

Stop and report if:

- A later migration already redefined any affected function and the current state no longer matches this plan.
- You cannot run pgTAP against a local or disposable database.
- The fix appears to require touching production or resetting a database.
- Revoking `anon` or `authenticated` execute breaks an app path that does not use `service_role`.

## Maintenance Notes

Reviewers should scrutinize whether any future `SECURITY DEFINER` function is granted to public roles by default. Most RLS helper functions are a different class of function; do not use this plan as a reason to revoke helper grants without a separate review.
