# Plan 003: Refresh org ownership RPC definitions

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise.
>
> **Drift check (run first)**: `git diff --stat 679b6113..HEAD -- supabase/migrations supabase/tests src/lib/server/adapters/supabaseOrgProvisioning.ts src/lib/server/adapters/supabaseOrgSettingsAdministration.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `679b6113`, 2026-06-10

## Why This Matters

The app still calls `create_org_with_owner` and `transfer_org_ownership`, but their original definitions write legacy membership columns that were later dropped. Once the full migration history is applied, those functions can fail with undefined-column database errors. The fix is to redefine both functions against the replacement membership access model: `member_preset`, `capability_overrides`, `access_scope_kind`, and `access_scope_group_ids`.

## Current State

- App adapter call for org creation:

```ts
// src/lib/server/adapters/supabaseOrgProvisioning.ts:30
async createOrganizationWithOwner(name): Promise<OrgProvisioningCreateResult> {
	const { data, error } = await supabase.rpc('create_org_with_owner', { p_name: name });
```

- App adapter call for ownership transfer:

```ts
// src/lib/server/adapters/supabaseOrgSettingsAdministration.ts:64
async transferOwnership(orgId, newOwnerId) {
	const { error } = await supabase.rpc('transfer_org_ownership', {
```

- Original function still writes dropped columns:

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:1098
INSERT INTO public.organization_memberships (
  organization_id,
  user_id,
  role,
  can_view_calendar,
  can_edit_calendar,
  can_view_personnel,
```

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:1430
UPDATE public.organization_memberships
SET role = 'admin',
    scoped_group_id = NULL,
    can_view_calendar = true,
```

- Later migration drops those columns:

```sql
-- supabase/migrations/20260526000300_drop_legacy_member_access_columns.sql:1
ALTER TABLE "public"."organization_memberships"
	DROP COLUMN IF EXISTS "can_view_calendar",
```

- Replacement access columns and defaults were introduced earlier:

```sql
-- supabase/migrations/20260501000100_member_access_storage.sql:139
ALTER TABLE "public"."organization_memberships"
  ALTER COLUMN "member_preset" SET DEFAULT 'viewer',
  ALTER COLUMN "member_preset" SET NOT NULL,
  ALTER COLUMN "capability_overrides" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "access_scope_kind" SET DEFAULT 'organization',
  ALTER COLUMN "access_scope_group_ids" SET DEFAULT ARRAY[]::uuid[],
```

## Commands You Will Need

| Purpose                 | Command                                                                                                                                     | Expected on success                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------- | ------------------------------------- | ----------------------------------------------- |
| Check final definitions | `rg -n "create_org_with_owner                                                                                                               | transfer_org_ownership                                | can_view_calendar | scoped_group_id" supabase/migrations` | Confirms current drift and no later replacement |
| Local DB                | `supabase start`                                                                                                                            | Local Supabase is running; do not point at production |
| DB contract             | `supabase test db supabase/tests/org_ownership_rpc_contract.sql`                                                                            | pgTAP passes                                          |
| Adapter tests           | `npm run test -- src/lib/server/adapters/supabaseOrgProvisioning.test.ts src/lib/server/adapters/supabaseOrgSettingsAdministration.test.ts` | pass                                                  |
| Format                  | `npm run format`                                                                                                                            | exits 0                                               |
| Lint                    | `npm run lint`                                                                                                                              | exits 0                                               |
| Governance              | `npm run governance:check`                                                                                                                  | exits 0                                               |
| Typecheck               | `npm run check`                                                                                                                             | exits 0                                               |
| Unit tests              | `npm run test`                                                                                                                              | exits 0                                               |

## Scope

**In scope**:

- `supabase/migrations/20260610000200_refresh_org_ownership_rpcs.sql` (create)
- `supabase/tests/org_ownership_rpc_contract.sql` (create)
- Existing adapter tests only if they need expectation updates, though no adapter API change should be necessary

**Out of scope**:

- Reintroducing dropped legacy membership columns.
- Changing organization creation UI or settings UI.
- Changing plan/billing checks for whether a user may create an organization.
- Changing ownership-transfer sensitive-action behavior in the TypeScript use case.
- Production or remote database operations.

## Git Workflow

- Branch: `codex/003-refresh-org-ownership-rpcs`
- Commit message style: short imperative, for example `Refresh org ownership RPCs`
- Do not push or open a PR unless the operator asks.

## Steps

### Step 1: Confirm no later migration already replaced these functions

Run:

```bash
rg -n "CREATE OR REPLACE FUNCTION \"public\"\\.\"(create_org_with_owner|transfer_org_ownership)|can_view_calendar|scoped_group_id" supabase/migrations
```

Expect to see the original definitions and the later column-drop migration. If a later migration already redefines both functions against replacement columns, stop and report.

**Verify**: command exits 0 and current state still matches the excerpts.

### Step 2: Add replacement function definitions

Create `supabase/migrations/20260610000200_refresh_org_ownership_rpcs.sql`.

Redefine `public.create_org_with_owner(p_name text)` so it:

- Remains `SECURITY DEFINER`.
- Sets `search_path = public, pg_temp`.
- Raises an exception if `auth.uid()` is null.
- Inserts `public.organizations (name, created_by)`.
- Inserts the owner membership using only current columns:
  - `organization_id`
  - `user_id`
  - `role` = `'owner'`
  - `member_preset` = `'editor'`
  - `capability_overrides` = `'{}'::jsonb`
  - `access_scope_kind` = `'organization'`
  - `access_scope_group_ids` = `ARRAY[]::uuid[]`
- Returns the new org id.

Redefine `public.transfer_org_ownership(p_organization_id uuid, p_new_owner_id uuid)` so it:

- Remains `SECURITY DEFINER`.
- Sets `search_path = public, pg_temp`.
- Preserves the current `public.is_org_owner(p_organization_id)` guard.
- Preserves the "new owner must be an existing member" guard.
- Demotes the current owner to `role = 'admin'` with:
  - `member_preset = 'editor'`
  - `capability_overrides = '{}'::jsonb`
  - `access_scope_kind = 'organization'`
  - `access_scope_group_ids = ARRAY[]::uuid[]`
- Promotes the target to `role = 'owner'` with the same full-organization replacement access fields.
- Does not reference `can_view_*`, `can_edit_*`, `can_manage_members`, or `scoped_group_id`.

Keep existing grants unchanged unless the migration must restate them after `CREATE OR REPLACE FUNCTION`.

**Verify**:

```bash
rg -n "can_view_|can_edit_|can_manage_members|scoped_group_id" supabase/migrations/20260610000200_refresh_org_ownership_rpcs.sql
```

Expected: no matches.

### Step 3: Add a pgTAP contract for current-column behavior

Create `supabase/tests/org_ownership_rpc_contract.sql` using the existing pgTAP pattern.

Cover:

- `pg_get_functiondef('public.create_org_with_owner(text)'::regprocedure)` does not contain any dropped column names.
- `pg_get_functiondef('public.transfer_org_ownership(uuid, uuid)'::regprocedure)` does not contain any dropped column names.
- As an authenticated user, calling `create_org_with_owner('RPC Contract Unit')` creates:
  - one organization row with `created_by = auth.uid()`
  - one owner membership for that user
  - owner membership has `member_preset = 'editor'`, empty `capability_overrides`, `access_scope_kind = 'organization'`, and empty `access_scope_group_ids`
- As the current owner, calling `transfer_org_ownership(org_id, target_user_id)` promotes the target to owner and demotes the caller to admin with replacement access fields intact.

Follow `supabase/tests/auth_workflow_authorization.sql` for `SET LOCAL ROLE authenticated` and `set_config('request.jwt.claim.sub', ..., true)`.

**Verify**: `supabase test db supabase/tests/org_ownership_rpc_contract.sql` passes.

### Step 4: Run adapter tests and repo gate

Adapter tests should still pass because TypeScript callers still call the same RPC names with the same arguments.

**Verify**:

```bash
npm run test -- src/lib/server/adapters/supabaseOrgProvisioning.test.ts src/lib/server/adapters/supabaseOrgSettingsAdministration.test.ts
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

All commands exit 0.

## Test Plan

- New pgTAP test: `supabase/tests/org_ownership_rpc_contract.sql`
- Existing unit tests:
  - `src/lib/server/adapters/supabaseOrgProvisioning.test.ts`
  - `src/lib/server/adapters/supabaseOrgSettingsAdministration.test.ts`

## Done Criteria

- [ ] New migration redefines both RPCs against current membership columns.
- [ ] New definitions do not reference dropped legacy columns.
- [ ] Org creation still returns the new org id.
- [ ] Ownership transfer still preserves current owner guard and existing member guard.
- [ ] pgTAP contract passes locally.
- [ ] Full npm gate passes: `format`, `lint`, `governance:check`, `check`, `test`.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` status row updated.

## STOP Conditions

Stop and report if:

- The final database schema has different replacement membership columns than this plan describes.
- A later migration already fixed these functions.
- The function update requires changing TypeScript app APIs or route behavior.
- You cannot test against local or disposable Supabase.
- Any step would touch production or reset a database.

## Maintenance Notes

Future membership permission migrations must review security-definer functions that write `organization_memberships`, not only TypeScript adapters. Reviewers should search function definitions for legacy column names when approving permission-storage changes.
