# Plan 040: Lock down privileged state read RPCs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 0a6e6000..HEAD -- supabase/migrations supabase/tests/sensitive_rpc_privileges.sql src/hooks.server.ts src/routes/suspended/+page.server.ts src/lib/server/sensitiveActionAuthorizer.ts src/lib/server/adapters/supabasePlatformAdministration.ts src/lib/server/db`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/039-revoke-service-rpc-client-execute.md
- **Category**: security
- **Planned at**: commit `0a6e6000`, 2026-06-13

## Why this matters

Several security-definer read RPCs expose platform-wide or privileged state through direct Supabase
function calls. Platform user growth, daily signup counts, organization personnel counts, and user
suspension status should not be generally callable with the public anon key. This plan locks down
the aggregate RPCs to server/service-role paths and changes the suspension RPC from "any caller can
ask about any user" to "authenticated users can check themselves; service/platform-admin paths can
support privileged workflows."

## Current state

- `count_platform_users()` reads `auth.users` totals in
  `supabase/migrations/20260413001158_remote_schema.sql:789-804`.
- `daily_signups_last_30_days()` reads `auth.users` daily signup counts in
  `supabase/migrations/20260413001158_remote_schema.sql:1130-1143`.
- `count_org_personnel(uuid)` counts active personnel for any org id in
  `supabase/migrations/20260413001158_remote_schema.sql:776-783`.
- `is_user_suspended(uuid)` checks `user_suspensions` for any supplied user id in
  `supabase/migrations/20260413001158_remote_schema.sql:1321-1327`.
- The remote schema grants these functions to public client roles:

```sql
GRANT ALL ON FUNCTION "public"."count_platform_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_platform_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."daily_signups_last_30_days"() TO "anon";
GRANT ALL ON FUNCTION "public"."daily_signups_last_30_days"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_suspended"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_suspended"("check_user_id" "uuid") TO "authenticated";
```

- Platform dashboard code calls the platform aggregate RPCs through the server-side platform
  administration adapter in `src/lib/server/adapters/supabasePlatformAdministration.ts:70-79`.
- Suspension checks currently use the session-scoped Supabase client:

```ts
const { data: isSuspended, error: suspensionError } = await event.locals.supabase.rpc('is_user_suspended', {
	check_user_id: event.locals.user.id
});
```

- `src/routes/suspended/+page.server.ts:8-10` also checks the current logged-in user.
- `src/lib/server/sensitiveActionAuthorizer.ts:223-225` checks the actor user id during sensitive
  action authorization.
- Plan 012 intentionally left the SQL function out of scope, so this is a new database privilege
  plan, not a duplicate of the hook error-handling fix.

## Commands you will need

| Purpose                                       | Command                                                                                    | Expected on success           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------- |
| Install, if needed                            | `npm ci`                                                                                   | exit 0                        |
| Static DB tests                               | `npx vitest run src/lib/server/db`                                                         | all pass                      |
| Suspension caller tests                       | `npx vitest run src/hooks.server.test.ts src/lib/server/sensitiveActionAuthorizer.test.ts` | all pass                      |
| DB contract tests                             | `npm run db:test`                                                                          | exit 0                        |
| Local migration, if local Supabase is running | `supabase migration up`                                                                    | applies locally; never remote |
| Format                                        | `npm run format`                                                                           | exit 0                        |
| Lint                                          | `npm run lint`                                                                             | exit 0                        |
| Governance                                    | `npm run governance:check`                                                                 | exit 0                        |
| Typecheck                                     | `npm run check`                                                                            | exit 0                        |
| Full tests                                    | `npm run test`                                                                             | exit 0                        |

## Scope

**In scope**:

- A new migration under `supabase/migrations/`
- `supabase/tests/sensitive_rpc_privileges.sql`
- A new or existing static migration test under `src/lib/server/db/`
- `src/hooks.server.ts` and `src/hooks.server.test.ts` only if the DB self-check approach cannot preserve current behavior
- `src/routes/suspended/+page.server.ts` and a focused test only if needed
- `src/lib/server/sensitiveActionAuthorizer.ts` and its test only if needed
- `plans/README.md` status row only

**Out of scope**:

- Do not change platform suspension product behavior.
- Do not expose platform signup/user counts to browser clients.
- Do not broaden organization personnel count access.
- Do not edit old applied migration files.
- Do not run migrations against the remote production database.
- Do not reset or delete the local database without Robert's explicit permission.

## Git workflow

- Branch: `codex/040-lock-down-privileged-state-rpcs`
- Commit style: short imperative subject. Suggested: `Lock down privileged state RPC grants`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm callers before changing grants

Run:

```bash
rg -n "count_org_personnel|count_platform_users|daily_signups_last_30_days|is_user_suspended" src supabase/tests
```

Expected current shape:

- `count_platform_users` and `daily_signups_last_30_days` are server platform-admin adapter calls.
- `count_org_personnel` has no current app caller.
- `is_user_suspended` is used only for the current actor/user in server code.

If a new browser/client-side caller exists, stop and report. Do not silently break it.

### Step 2: Add a follow-up migration

Create a new migration with the next timestamp, for example:

```text
supabase/migrations/20260613000200_lock_down_privileged_state_rpcs.sql
```

The migration should:

1. Revoke `count_platform_users()`, `daily_signups_last_30_days()`, and
   `count_org_personnel(uuid)` from `PUBLIC`, `anon`, and `authenticated`, then grant
   `service_role`.
2. Replace `is_user_suspended(uuid)` with a guarded definition that returns real suspension state
   only when one of these is true:
   - `current_setting('role', true) = 'service_role'`,
   - `public.is_platform_admin()` is true,
   - `auth.uid()` equals `check_user_id`.
3. Revoke `is_user_suspended(uuid)` from `PUBLIC` and `anon`.
4. Keep `authenticated` execute access for `is_user_suspended(uuid)` so the existing server
   session-client self checks continue to work.
5. Keep `service_role` execute access for platform/server paths.

Use the local `get_effective_tier` guard in
`supabase/migrations/20260523000600_billing_snapshot_effective_tier_policy.sql:18-20` as the
existing example of a service-role/platform/member SQL guard shape.

Suggested guarded shape:

```sql
CREATE OR REPLACE FUNCTION public.is_user_suspended(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT CASE
		WHEN current_setting('role', true) = 'service_role'
			OR public.is_platform_admin()
			OR (SELECT auth.uid()) = check_user_id
		THEN EXISTS (
			SELECT 1 FROM public.user_suspensions WHERE user_id = check_user_id
		)
		ELSE false
	END;
$$;
```

If local SQL style requires quoted identifiers, match the surrounding migration style.

### Step 3: Add static migration coverage

Add a focused static migration test, for example:

```text
src/lib/server/db/privilegedStateRpcPrivilegesMigration.test.ts
```

Assert that the new migration:

- revokes aggregate RPCs from `anon` and `authenticated`,
- grants aggregate RPCs to `service_role`,
- revokes `is_user_suspended(uuid)` from `anon`,
- keeps `is_user_suspended(uuid)` executable by `authenticated` and `service_role`,
- contains a self-check using `auth.uid()` and `check_user_id`,
- contains a service-role/platform-admin path,
- does not alter `user_suspensions` table structure or delete rows.

**Verify**: `npx vitest run src/lib/server/db/privilegedStateRpcPrivilegesMigration.test.ts`
exits 0.

### Step 4: Extend pgTAP privilege coverage

Update `supabase/tests/sensitive_rpc_privileges.sql`.

Add effective privilege assertions:

- `anon` cannot execute all four privileged-state RPCs.
- `authenticated` cannot execute `count_platform_users`, `daily_signups_last_30_days`, or
  `count_org_personnel`.
- `authenticated` can execute `is_user_suspended` because the function body now enforces self-only
  access.
- `service_role` can execute all four.

If plan 039 already updated this file, preserve its assertions and update `SELECT plan(...)` once.

**Verify**: `npm run db:test` exits 0.

### Step 5: Validate suspension callers still behave

Run the focused tests for the existing server callers:

```bash
npx vitest run src/hooks.server.test.ts src/lib/server/sensitiveActionAuthorizer.test.ts
```

If tests fail because a caller now needs a service-role client instead of the self-scoped
authenticated RPC path, stop and report. Do not introduce a broad service-role client into every
request without reviewer approval.

### Step 6: Apply the migration locally

If local Supabase is running, apply the migration locally:

```bash
supabase migration up
```

Do not point this command at production. If local Supabase is unavailable, record the exact blocker
in the final handoff instead of using the remote database.

### Step 7: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`
all exit 0.

## Test plan

- Static migration test for the SQL guard and grants.
- pgTAP privilege assertions in `supabase/tests/sensitive_rpc_privileges.sql`.
- Existing suspension caller tests for `hooks.server` and `sensitiveActionAuthorizer`.
- Full repo gate.

## Done criteria

- [ ] Platform aggregate RPCs are no longer executable by `anon` or `authenticated`.
- [ ] `count_org_personnel(uuid)` is no longer executable by `anon` or `authenticated`.
- [ ] `is_user_suspended(uuid)` is not executable by `anon`.
- [ ] `is_user_suspended(uuid)` is self-scoped for authenticated callers and still supports service-role/platform-admin use.
- [ ] pgTAP covers effective privileges for all four RPCs.
- [ ] Existing server suspension checks still pass tests.
- [ ] Local DB verification passes or the final report records why it was blocked.
- [ ] The full repo gate passes.
- [ ] `plans/README.md` status row for 040 is updated.

## STOP conditions

Stop and report back if:

- A current browser/client caller depends on direct access to the aggregate RPCs.
- The self-scoped suspension function cannot preserve current server behavior.
- The fix appears to require a broad suspension architecture rewrite.
- Local DB verification would require resetting or deleting local data without Robert's explicit permission.

## Maintenance notes

Security-definer read RPCs should declare their intended caller in SQL, not only in route code. For
future platform-admin metrics, prefer service-role-only RPCs or functions with explicit membership,
platform-admin, or self checks in the function body.
