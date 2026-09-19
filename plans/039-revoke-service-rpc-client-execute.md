# Plan 039: Revoke client execute from service-role mutation RPCs

**Stabilization update (03-02c):** The invitation capacity RPC has no runtime caller after paid-capacity removal. Its applied SQL and privilege protections remain until phase 04 schema retirement. The implementation references below describe the original security repair.

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 0a6e6000..HEAD -- supabase/migrations supabase/tests/sensitive_rpc_privileges.sql src/lib/server/db/rejectAccessRequestBlocksLinkedInvitationsMigration.test.ts src/lib/server/db/memberInvitePlanLimitGuardMigration.test.ts src/lib/server/accessRequestInvitationBlocking.ts src/lib/server/adapters/supabaseOrgSettingsMemberManagement.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `0a6e6000`, 2026-06-13

## Why this matters

Two `SECURITY DEFINER` mutation RPCs are intended to be service-role-only server paths. The
original migrations revoke from `PUBLIC`, but the remote schema has default function privileges
that grant `anon` and `authenticated` roles function access. In PostgreSQL, revoking from `PUBLIC`
does not remove explicit role grants inherited from default privileges at function creation time.
After this plan, direct Supabase clients cannot execute these mutation RPCs, and the privilege
contract is covered by both static migration tests and pgTAP.

## Current state

- `supabase/migrations/20260413001158_remote_schema.sql:5266-5269` grants default function
  privileges to `anon`, `authenticated`, and `service_role`:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
```

- `supabase/migrations/20260522001100_reject_access_request_blocks_linked_invitations.sql:101-102`
  revokes from `PUBLIC`, then grants only `service_role`:

```sql
REVOKE ALL ON FUNCTION "public"."reject_access_request_and_block_linked_invitations"("uuid", "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."reject_access_request_and_block_linked_invitations"("uuid", "uuid") TO "service_role";
```

- `supabase/migrations/20260524000300_member_invite_plan_limit_guard.sql:61-62` has the same
  shape for `block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text)`.
- The app calls `reject_access_request_and_block_linked_invitations` through the server helper in
  `src/lib/server/accessRequestInvitationBlocking.ts:33-43`.
- Historical implementation: the app called `block_invitation_if_member_cap_exceeded` through the service-role member
  management adapter in `src/lib/server/adapters/supabaseOrgSettingsMemberManagement.ts:248-258`.
- Existing static tests only assert there is no explicit authenticated grant in the original
  migration. They do not assert effective privileges:

```ts
expect(migration).not.toContain(
	'grant execute on function "public"."block_invitation_if_member_cap_exceeded"("uuid", "uuid", "uuid", integer, text) to "authenticated"'
);
```

- `supabase/tests/sensitive_rpc_privileges.sql` currently checks only
  `search_users_by_email`, `cleanup_old_audit_logs`, and `cleanup_old_webhook_events`.

## Commands you will need

| Purpose                                       | Command                                                                                                                                                      | Expected on success           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Install, if needed                            | `npm ci`                                                                                                                                                     | exit 0                        |
| Static migration tests                        | `npx vitest run src/lib/server/db/rejectAccessRequestBlocksLinkedInvitationsMigration.test.ts src/lib/server/db/memberInvitePlanLimitGuardMigration.test.ts` | all pass                      |
| DB contract tests                             | `npm run db:test`                                                                                                                                            | exit 0                        |
| Local migration, if local Supabase is running | `supabase migration up`                                                                                                                                      | applies locally; never remote |
| Format                                        | `npm run format`                                                                                                                                             | exit 0                        |
| Lint                                          | `npm run lint`                                                                                                                                               | exit 0                        |
| Governance                                    | `npm run governance:check`                                                                                                                                   | exit 0                        |
| Typecheck                                     | `npm run check`                                                                                                                                              | exit 0                        |
| Full tests                                    | `npm run test`                                                                                                                                               | exit 0                        |

## Scope

**In scope**:

- A new migration under `supabase/migrations/`
- `supabase/tests/sensitive_rpc_privileges.sql`
- `src/lib/server/db/rejectAccessRequestBlocksLinkedInvitationsMigration.test.ts`
- `src/lib/server/db/memberInvitePlanLimitGuardMigration.test.ts`
- `plans/README.md` status row only

**Out of scope**:

- Do not edit old applied migration files.
- Do not change the behavior of either RPC.
- Do not change access-request approval/rejection flows or organization invitation business rules.
- Do not run migrations against the remote production database.
- Do not reset or delete the local database without Robert's explicit permission.

## Git workflow

- Branch: `codex/039-revoke-service-rpc-client-execute`
- Commit style: short imperative subject. Suggested: `Revoke client execute on service mutation RPCs`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a follow-up privilege migration

Create a new migration with the next timestamp, for example:

```text
supabase/migrations/20260613000100_restrict_service_role_mutation_rpc_grants.sql
```

The migration must explicitly revoke both RPC signatures from `PUBLIC`, `anon`, and
`authenticated`, then grant `service_role`:

```sql
REVOKE ALL ON FUNCTION public.reject_access_request_and_block_linked_invitations(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_access_request_and_block_linked_invitations(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reject_access_request_and_block_linked_invitations(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_access_request_and_block_linked_invitations(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text) TO service_role;
```

Do not alter default privileges globally in this plan. That broader policy may affect client-callable
RPCs and should be a separate decision.

**Verify**:
`rg -n "reject_access_request_and_block_linked_invitations|block_invitation_if_member_cap_exceeded|authenticated" supabase/migrations`
shows the new explicit revokes.

### Step 2: Strengthen static migration tests

Update the two migration tests so they read both the original migration and the new follow-up
privilege migration. Assert that the follow-up migration contains:

- `revoke all ... from anon`,
- `revoke all ... from authenticated`,
- `grant execute ... to service_role`,
- no table deletes or behavior changes.

Keep the existing behavioral assertions for the original migrations.

**Verify**:
`npx vitest run src/lib/server/db/rejectAccessRequestBlocksLinkedInvitationsMigration.test.ts src/lib/server/db/memberInvitePlanLimitGuardMigration.test.ts`
exits 0.

### Step 3: Extend pgTAP privilege coverage

Update `supabase/tests/sensitive_rpc_privileges.sql`.

Add `has_function_privilege` assertions for both RPC signatures:

- `anon` cannot execute them,
- `authenticated` cannot execute them,
- `service_role` can execute them.

Update the `SELECT plan(...)` count to match the new assertion total. If plan 040 has already
landed and added more assertions, preserve those assertions and adjust the count once.

**Verify**: `npm run db:test` exits 0.

### Step 4: Apply the migration locally

If local Supabase is running, apply the migration locally:

```bash
supabase migration up
```

Do not point this command at production. If local Supabase is unavailable, record the exact blocker
in the final handoff instead of using the remote database.

### Step 5: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`
all exit 0.

## Test plan

- Extend the two static migration tests named above.
- Extend `supabase/tests/sensitive_rpc_privileges.sql` so effective database privileges are checked
  in pgTAP, not only by string matching.
- Run `npm run db:test` locally after the migration is applied.

## Done criteria

- [ ] A new follow-up migration explicitly revokes both service-role mutation RPCs from `anon` and `authenticated`.
- [ ] `service_role` still has `EXECUTE` on both RPCs.
- [ ] Static migration tests assert the explicit revokes.
- [ ] `supabase/tests/sensitive_rpc_privileges.sql` asserts effective privileges for both RPCs.
- [ ] `npm run db:test` passes locally, or the final report states why local DB verification was blocked.
- [ ] The full repo gate passes.
- [ ] `plans/README.md` status row for 039 is updated.

## STOP conditions

Stop and report back if:

- Either function has been removed or renamed.
- Source search finds a legitimate browser/session-client caller for either mutation RPC.
- The privilege fix requires changing access-request or member-invitation business behavior.
- Local DB verification would require resetting or deleting local data without Robert's explicit permission.

## Maintenance notes

When adding future service-role-only RPCs, do not rely on `REVOKE ... FROM PUBLIC` alone. Explicitly
revoke `anon` and `authenticated`, grant `service_role`, and add the RPC to
`supabase/tests/sensitive_rpc_privileges.sql`.
