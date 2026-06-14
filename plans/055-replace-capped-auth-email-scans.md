# Plan 055: Replace capped Auth email scans with an app-owned lookup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/lib/server/accountSetupCompletionSupabase.ts src/lib/server/accountSetupCompletionSupabase.test.ts src/lib/server/adapters/supabaseOrgSettingsMemberManagement.ts src/lib/server/adapters/supabaseOrgSettingsMemberManagement.test.ts supabase/migrations src/lib/server/db docs/architecture/adrs/0009-beta-access-request-account-setup-links.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

Two auth-adjacent flows look up existing Supabase Auth users by scanning paginated
`auth.admin.listUsers` results. Both scans stop after 20 pages. That keeps runtime bounded, but it
means an existing user account beyond the first 20,000 Auth records can be treated as missing in
account setup or organization-invitation bridging. The fix should move exact email identity lookup
into an app-owned, indexed server-side table that is backfilled from Auth and maintained by the
auth/invitation edges.

## Current state

- ADR 0009 says existing Supabase **User Accounts** must be activated during Account Setup Link
  completion instead of creating duplicate identities.
- `accountSetupCompletionSupabase.ts` scans Auth users after `createUser` reports an existing user.
- `supabaseOrgSettingsMemberManagement.ts` duplicates the same bounded scan before invitation
  bridging.
- `user_profiles` exists, but it does not store normalized email and is user-profile data rather
  than an identity lookup.

Current excerpts:

```ts
// src/lib/server/accountSetupCompletionSupabase.ts:5
const FIND_USER_BY_EMAIL_MAX_PAGES = 20;

// src/lib/server/accountSetupCompletionSupabase.ts:35
while (page <= FIND_USER_BY_EMAIL_MAX_PAGES) {
	const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
```

```ts
// src/lib/server/accountSetupCompletionSupabase.ts:113
const existingUser = await findUserByEmail(adminClient, email);
if (!existingUser) {
	throw created.error ?? new Error('Could not find existing User Account');
}
```

```ts
// src/lib/server/adapters/supabaseOrgSettingsMemberManagement.ts:54
const FIND_USER_BY_EMAIL_MAX_PAGES = 20;

// src/lib/server/adapters/supabaseOrgSettingsMemberManagement.ts:81
while (page <= FIND_USER_BY_EMAIL_MAX_PAGES) {
	const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
```

```sql
-- supabase/migrations/20260515001300_user_profiles.sql:1
CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "user_id" uuid NOT NULL,
    "first_name" text,
    "last_name" text,
    "rank" text,
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Targeted auth adapter tests | `npx vitest run src/lib/server/accountSetupCompletionSupabase.test.ts src/lib/server/adapters/supabaseOrgSettingsMemberManagement.test.ts` | exits 0 |
| Static migration tests | `npx vitest run src/lib/server/db/userEmailIdentityLookupMigration.test.ts` | exits 0 |
| DB contracts | `npm run db:test` | exits 0 against local Supabase |
| Local migration | `supabase migration up` | applies locally; never remote |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- A new migration under `supabase/migrations/` that creates a service-owned email identity lookup
  table and backfills it from `auth.users`.
- New helper module, for example `src/lib/server/userEmailIdentities.ts`.
- `src/lib/server/accountSetupCompletionSupabase.ts` and its test.
- `src/lib/server/adapters/supabaseOrgSettingsMemberManagement.ts` and its test.
- The organization invitation acceptance SQL function only if needed to keep identities current
  when an already-authenticated user accepts an invitation.
- Focused static migration test under `src/lib/server/db/`.
- `plans/README.md` status row only.

**Out of scope**:

- Do not change Supabase Auth as the auth provider.
- Do not create duplicate Supabase Auth users.
- Do not scan all Auth users at runtime as the replacement.
- Do not change Account Setup Link token semantics, expiry, or email delivery.
- Do not change organization invitation acceptance rules except for maintaining the identity lookup.
- Do not run migrations against the remote production database.
- Do not reset or delete the local database without Robert's explicit permission.

## Git workflow

- Branch: `codex/055-replace-capped-auth-email-scans`
- Commit style: short imperative subject. Suggested: `Replace capped Auth email scans`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add an app-owned identity lookup table

Create a migration with the next timestamp, for example:

```text
supabase/migrations/20260614000200_user_email_identities.sql
```

Create a table shaped for exact server lookup:

```sql
CREATE TABLE public.user_email_identities (
	user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
	normalized_email text NOT NULL UNIQUE,
	created_at timestamp with time zone DEFAULT now() NOT NULL,
	updated_at timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT user_email_identities_normalized_email_check CHECK (normalized_email = lower(btrim(normalized_email)) AND normalized_email <> '')
);
```

Add the existing `update_updated_at_column` trigger, enable RLS, revoke client access from
`PUBLIC`, `anon`, and `authenticated`, and grant `service_role` access. Backfill from existing Auth
users:

```sql
INSERT INTO public.user_email_identities (user_id, normalized_email)
SELECT auth.users.id, lower(btrim(auth.users.email))
FROM auth.users
WHERE auth.users.email IS NOT NULL AND btrim(auth.users.email) <> ''
ON CONFLICT (user_id) DO UPDATE
SET normalized_email = EXCLUDED.normalized_email;
```

If duplicate normalized emails somehow exist in `auth.users`, stop and report instead of weakening
the unique constraint.

**Verify**:

```bash
rg -n -e "user_email_identities" -e "auth\\.users" -e "ENABLE ROW LEVEL SECURITY" -e "REVOKE .*PUBLIC" -e "REVOKE .*authenticated" -e "CREATE OR REPLACE TRIGGER .*user_email_identities" -e "GRANT .*service_role" supabase/migrations/20260614000200_user_email_identities.sql
```

shows the table, backfill, RLS, revokes, and service-role grant.

### Step 2: Add static migration coverage

Create `src/lib/server/db/userEmailIdentityLookupMigration.test.ts`.

Assert the migration:

- creates `public.user_email_identities`,
- uses `normalized_email text NOT NULL UNIQUE`,
- references `auth.users(id)` with `ON DELETE CASCADE`,
- backfills from `auth.users`,
- enables RLS,
- revokes table access from `anon` and `authenticated`,
- grants service-role access,
- does not alter or delete `auth.users`.

**Verify**:

```bash
npx vitest run src/lib/server/db/userEmailIdentityLookupMigration.test.ts
```

exits 0.

### Step 3: Add a shared server helper

Create `src/lib/server/userEmailIdentities.ts`.

Include:

- `normalizeUserEmailIdentity(email: string): string`
- `findUserEmailIdentityByEmail(client, email): Promise<{ userId: string; normalizedEmail: string } | null>`
- `upsertUserEmailIdentity(client, { userId, email }): Promise<void>`

Use the service-role/admin Supabase client to query `user_email_identities` by `normalized_email`
with `.maybeSingle()`. Keep this helper provider-adjacent; do not import it into UI code.

**Verify**:

```bash
rg -n "listUsers\\(|FIND_USER_BY_EMAIL_MAX_PAGES" src/lib/server/userEmailIdentities.ts
```

returns no matches.

### Step 4: Replace account setup lookup

Update `src/lib/server/accountSetupCompletionSupabase.ts`:

- On successful `createUser`, upsert the email identity for the created user.
- When `createUser` reports an existing user, use `findUserEmailIdentityByEmail` instead of
  `auth.admin.listUsers`.
- After `updateUserById` succeeds, upsert the identity again so the table remains current.
- Remove `FIND_USER_BY_EMAIL_MAX_PAGES` and the local `findUserByEmail` scan.

Update `src/lib/server/accountSetupCompletionSupabase.test.ts` so existing-user activation stubs
the identity table lookup instead of `listUsers`. Keep coverage for:

- normal email normalization,
- created user records identity,
- existing user is activated by indexed lookup,
- missing identity after existing-user error produces a clear failure,
- password update failures still surface.

**Verify**:

```bash
npx vitest run src/lib/server/accountSetupCompletionSupabase.test.ts
```

exits 0.

### Step 5: Replace invitation bridge lookup

Update `src/lib/server/adapters/supabaseOrgSettingsMemberManagement.ts` so
`findUserAccountByEmail` queries the shared identity helper instead of scanning Auth users.

Update `src/lib/server/adapters/supabaseOrgSettingsMemberManagement.test.ts` so the existing test
named "looks up existing User Accounts through the admin auth boundary before bridging access
requests" expects a lookup against `user_email_identities`, not
`adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 })`.

**Verify**:

```bash
npx vitest run src/lib/server/adapters/supabaseOrgSettingsMemberManagement.test.ts
```

exits 0.

### Step 6: Keep identities current for accepted invitations

Search the org invitation acceptance path:

```bash
rg -n "accept_organization_invitation|organization_memberships|current_email" supabase/migrations src/lib/server src/routes
```

If the current accepted-invitation RPC is still the place where authenticated users become
organization members, add a follow-up migration that upserts
`public.user_email_identities(current_user_id, current_email)` inside the successful acceptance
transaction before or after inserting `organization_memberships`.

If the code has moved to a server adapter by execution time, maintain the identity in that server
path instead.

**Verify**: add or update static migration coverage for the acceptance identity upsert, then run
the targeted DB test file.

### Step 7: Remove runtime Auth scans from these flows

Run:

```bash
rg -n "FIND_USER_BY_EMAIL_MAX_PAGES|auth\\.admin\\.listUsers\\(" src/lib/server/accountSetupCompletionSupabase.ts src/lib/server/adapters/supabaseOrgSettingsMemberManagement.ts
```

**Verify**: no matches.

### Step 8: Apply locally and run the full gate

Apply the migration locally if local Supabase is running:

```bash
supabase migration up
```

Then run:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

**Verify**: every command exits 0.

## Test plan

- Static migration test for the identity table and grants.
- Updated account setup adapter tests for created and existing identities.
- Updated organization member-management adapter tests for invitation bridging.
- Local `npm run db:test` after applying migrations.

## Done criteria

- [ ] Runtime account setup no longer scans Auth users by email.
- [ ] Runtime organization-invitation bridging no longer scans Auth users by email.
- [ ] A service-owned, unique normalized email identity lookup exists and is backfilled from Auth.
- [ ] New and activated users are upserted into the identity lookup.
- [ ] Accepted invitation users keep the identity lookup current.
- [ ] Targeted tests and full repo gate pass.
- [ ] `plans/README.md` status row for 055 is updated.

## STOP conditions

Stop and report back if:

- The migration detects duplicate normalized emails in `auth.users`.
- The installed Supabase SDK has gained a safe targeted admin email lookup and the app-owned table
  is no longer the best fix.
- Maintaining identities would require changing Account Setup Link or Organization Invitation
  domain semantics.
- Local migration verification would require resetting or deleting local data without Robert's
  explicit permission.

## Maintenance notes

Any future auth edge that creates, activates, or accepts a user with an email should keep
`user_email_identities` in sync. Do not reintroduce `auth.admin.listUsers` as an exact email lookup
in request paths; reserve Auth pagination for explicit admin-directory listing work.
