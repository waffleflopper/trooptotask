# Plan 070: Scope and validate sign-in roster snapshots

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat b3acfabb..HEAD -- src/routes/org/[orgId]/api/sign-in-rosters src/features/sign-in-rosters src/lib/server/adapters src/lib/server/core src/lib/access supabase/migrations supabase/tests plans/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 069
- **Category**: security
- **Planned at**: commit `b3acfabb`, 2026-06-14

## Why this matters

Sign-in rosters are durable personnel artifacts: they store snapshots of names,
ranks, groups, and signed scan links. The current API authorizes list, create,
download, upload, unlink, and delete as unscoped Training actions, and creation
persists client-supplied snapshot JSON. A group-scoped Training operator should
not be able to store or retrieve rosters containing personnel outside their
scope.

## Current state

- `src/routes/org/[orgId]/api/sign-in-rosters/+server.ts` returns
  `personnelSnapshot`, `filterConfig`, and `signedFilePath` to the client.
- The list and create route configs use `policyResource: { kind: 'unscoped' }`.
- Creation only checks title and snapshot length, then persists
  `input.personnelSnapshot` and `input.filterConfig` directly.
- Upload/download/unlink/delete routes also use unscoped Training actions.
- `defaultScopeRules` has no `sign_in_rosters` rule, and `ScopedDataStore`
  returns unfiltered data when a table has no rule.
- The base schema stores `personnel_snapshot jsonb` and `filter_config jsonb`
  but no queryable personnel IDs or group IDs for RLS/app-scope enforcement.
- Plan 056 already added scan-upload compensation; do not redo that work here.

Current excerpts:

```ts
// src/routes/org/[orgId]/api/sign-in-rosters/+server.ts:25
export const _getConfig: RouteConfig<Record<string, unknown>, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
```

```ts
// src/routes/org/[orgId]/api/sign-in-rosters/+server.ts:69
export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.manageSignInRosters,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		if (!input.title || !(input.title as string).trim()) fail(400, 'Title is required');
		if (!(input.personnelSnapshot as unknown[])?.length) fail(400, 'Personnel snapshot is required');
```

```ts
// src/routes/org/[orgId]/api/sign-in-rosters/+server.ts:77
const row = await ctx.store.insert<Record<string, unknown>>('sign_in_rosters', ctx.auth.orgId, {
	title: (input.title as string).trim(),
	roster_date: input.rosterDate || null,
	blank_date: input.blankDate ?? false,
	separate_by_group: input.separateByGroup ?? false,
	sort_by: input.sortBy || 'alphabetical',
	personnel_snapshot: input.personnelSnapshot,
	filter_config: input.filterConfig || null,
```

```ts
// src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/+server.ts:13
export const _getConfig: RouteConfig<{ rosterId: string }, { url: string }> = {
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
```

```ts
// src/lib/server/adapters/scopeRules.ts:10
export const defaultScopeRules = new Map<string, GroupScopeRule>([
	['personnel', { type: 'group', groupColumn: 'group_id' }],
```

```ts
// src/lib/server/adapters/scopedDataStore.ts:55
const rule = scopeRules.get(table);
if (!rule) return { filters, options };
```

```sql
-- supabase/migrations/20260413001158_remote_schema.sql:2465
CREATE TABLE IF NOT EXISTS "public"."sign_in_rosters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "personnel_snapshot" "jsonb" NOT NULL,
    "filter_config" "jsonb",
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Sign-in roster route tests | `npx vitest run 'src/routes/org/[orgId]/api/sign-in-rosters/server.test.ts' 'src/routes/org/[orgId]/api/sign-in-rosters/[id]/server.test.ts' 'src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/server.test.ts'` | exits 0 |
| Scoped store tests | `npx vitest run src/lib/server/adapters/scopedDataStore.test.ts src/lib/server/adapters/inMemory.test.ts` | exits 0 if touched |
| Svelte tests | `npx vitest run src/features/sign-in-rosters` | exits 0 if Svelte/client code changes |
| DB contract | `supabase test db supabase/tests/sign_in_rosters_rls_scope.sql` | exits 0 if this plan adds the test file |
| All DB contracts | `npm run db:test` | exits 0 if this plan adds a migration/test |
| Svelte autofixer | `svelte-autofixer <edited Svelte file>` | no issues or suggestions if Svelte files are edited |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Suggested executor toolkit

- If editing `.svelte` or `.svelte.ts` files, follow the repo's Svelte MCP
  documentation flow from `AGENTS.md` and run `svelte-autofixer` until clean.

## Scope

**In scope**:

- `src/routes/org/[orgId]/api/sign-in-rosters/+server.ts`
- `src/routes/org/[orgId]/api/sign-in-rosters/server.test.ts`
- `src/routes/org/[orgId]/api/sign-in-rosters/[id]/+server.ts`
- `src/routes/org/[orgId]/api/sign-in-rosters/[id]/server.test.ts`
- `src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/+server.ts`
- `src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/server.test.ts`
- A small sign-in roster use-case/helper module under
  `src/lib/server/core/useCases/` if route logic becomes too large.
- `src/lib/server/core/ports.ts`, `src/lib/server/adapters/scopedDataStore.ts`,
  `src/lib/server/adapters/supabaseDataStore.ts`,
  `src/lib/server/adapters/inMemory.ts`, and tests only if you add a generic
  array-overlap scope/filter primitive.
- `src/lib/server/adapters/scopeRules.ts` only if the final design lets
  `ScopedDataStore` enforce sign-in roster scope.
- `src/features/sign-in-rosters/*` only if the client payload must change from
  client snapshots to selected IDs/filter inputs.
- One new migration under `supabase/migrations/` if queryable roster scope
  columns are needed.
- One new pgTAP file under `supabase/tests/`, suggested
  `supabase/tests/sign_in_rosters_rls_scope.sql`.
- `plans/README.md` status row only.

**Out of scope**:

- Do not change scan upload compensation or PDF validation; plans 011 and 056
  already cover those areas.
- Do not change storage bucket names or signed URL expiration.
- Do not rewrite the PDF layout or roster UI beyond payload shape needed for
  server-side validation.
- Do not use overlap semantics that allow a group-scoped user to read a roster
  containing both in-scope and out-of-scope groups. Mixed-scope rosters must be
  visible only to organization-scope users or users scoped to every group in
  the roster.
- Do not reset or delete the local database without Robert's explicit
  permission. Never target production.

## Git workflow

- Branch: `codex/070-scope-sign-in-roster-snapshots`
- Commit style: short imperative subject. Suggested:
  `Scope sign-in roster snapshots`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add queryable roster scope metadata

Add a migration that gives `sign_in_rosters` queryable scope metadata. A
recommended shape is:

- `personnel_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]`
- `scope_group_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]`

Backfill existing rosters by extracting `id` values from `personnel_snapshot`
JSON, joining to current `personnel` rows in the same organization, and storing
the matched personnel IDs and non-null group IDs. If a historical snapshot has
no matching personnel rows, preserve the roster but leave arrays empty and make
the app treat it as organization-scope-only.

Add indexes that support the chosen access predicates. If you use array
containment or overlap, use GIN indexes.

**Verify**: add a migration text test under `src/lib/server/db/` or a pgTAP
contract proving the new columns, backfill intent, and indexes exist, then run
the targeted test.

### Step 2: Define the roster scope contract

Implement a small, reusable helper for sign-in roster scope decisions. It must
make these rules explicit:

- organization-scope users can read/manage all rosters in their organization,
- group-scoped users can read/manage a roster only when every roster group is
  inside their `scopeSet.groupIds`,
- rosters with an empty `scope_group_ids` array are organization-scope-only,
  unless the executor can prove empty means "contains no group-scoped
  personnel" without leaking unassigned personnel,
- out-of-scope personnel IDs in a create request produce a 403 or 400 before
  insert,
- the persisted `personnel_snapshot` is built from server-read personnel rows,
  not trusted from client-provided rank/name/group fields.

Use existing ports where possible:

- `ctx.auth.scopeSet` tells you whether the caller is organization-scoped or
  group-scoped.
- `ctx.scope.requireGroupAccessBatch(personnelIds)` already enforces personnel
  group access.
- `ctx.store` is scoped; `ctx.rawStore` is available only when you need to
  compare requested IDs against raw rows after separately enforcing scope.

**Verify**:
`npx vitest run 'src/routes/org/[orgId]/api/sign-in-rosters/server.test.ts'`
should include failing tests before implementation and pass after implementation.

### Step 3: Stop trusting client snapshot JSON

Change roster creation so the client may send selected personnel IDs and filter
metadata, but the server derives the saved snapshot from canonical personnel
rows. A minimal compatible path is acceptable:

- accept the current `personnelSnapshot` payload only to extract requested
  personnel IDs,
- reject malformed snapshots, duplicate IDs, missing IDs, and snapshots above a
  bounded maximum,
- fetch the canonical personnel rows for those IDs in the organization,
- enforce group scope for all selected personnel,
- build the saved snapshot from canonical fields (`id`, rank, first name, last
  name, group name/group id),
- persist `personnel_ids`, `scope_group_ids`, and sanitized `filter_config`.

If changing the client to send `personnelIds` is cleaner, keep backward
compatibility tests or update the UI and tests in the same slice.

**Verify**:
route tests cover canonical snapshot persistence, malformed snapshot rejection,
out-of-scope personnel rejection, and duplicate ID handling.

### Step 4: Scope list, delete, upload, unlink, and signed URL access

Update all sign-in roster endpoints so group-scoped callers cannot reach mixed
or out-of-scope rosters:

- list/search should omit out-of-scope and mixed-scope rosters and return a
  count consistent with the filtered result,
- `DELETE /api/sign-in-rosters/[id]` must deny out-of-scope roster deletion,
- `GET /api/sign-in-rosters/[id]/upload` must deny signed URL creation for
  out-of-scope rosters,
- `POST /api/sign-in-rosters/[id]/upload` must deny scan replacement for
  out-of-scope rosters,
- `DELETE /api/sign-in-rosters/[id]/upload` must deny scan unlink for
  out-of-scope rosters.

If this requires a generic scoped-store array filter, add the smallest
primitive that both Supabase and in-memory stores can support. Do not add
ad-hoc unbounded filtering after pagination unless you also fix count and page
semantics.

**Verify**:
run the three route test files listed in the command table.

### Step 5: Add RLS contracts for sign-in rosters

Add `supabase/tests/sign_in_rosters_rls_scope.sql` covering:

- organization-scope Training viewer can select all in-org rosters,
- group-scoped Training viewer can select a roster whose `scope_group_ids` are
  all within their scope,
- group-scoped Training viewer cannot select a roster containing any
  out-of-scope group,
- group-scoped Training operator cannot update/delete an out-of-scope or mixed
  roster,
- other-org members and anon cannot access rosters.

Update sign-in roster RLS policies in the migration from Step 1 or a second
same-plan migration so the pgTAP contract passes.

**Verify**:
`supabase test db supabase/tests/sign_in_rosters_rls_scope.sql` exits 0.

### Step 6: Update client payload/tests if needed

If Step 3 changed the client request shape, update
`src/features/sign-in-rosters/components/SignInRosterModal.svelte` and nearby
tests so the UI sends the new canonical inputs. Preserve current user-facing
behavior: operators can still filter by rank/group, create a PDF, save a roster,
reprint saved rosters, upload scans, download scans, unlink scans, and delete
rosters.

**Verify**:

```bash
npx vitest run src/features/sign-in-rosters
```

If a Svelte file changed, run `svelte-autofixer` on that file and apply fixes
until it reports no issues or suggestions.

### Step 7: Run local DB contracts and the full gate

Run:

```bash
npm run db:test
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

**Verify**: every command exits 0.

## Test plan

- Route tests for create, list, delete, signed URL, scan upload, and scan unlink
  with organization-scope and group-scoped contexts.
- Route tests for malformed, duplicate, missing/unknown, out-of-scope, and
  oversized personnel selections before insert.
- Server snapshot tests proving persisted snapshots are canonical server data,
  not arbitrary client JSON.
- pgTAP tests for sign-in roster RLS scope.
- Svelte tests only if the client payload changes.
- Full repo gate plus local `npm run db:test`.

## Done criteria

- [ ] Sign-in rosters persist queryable personnel and group scope metadata.
- [ ] Server-side creation derives or validates snapshots from canonical
      personnel rows.
- [ ] Route tests cover malformed, duplicate, missing/unknown, out-of-scope,
      and oversized personnel selection validation.
- [ ] Group-scoped users cannot read/manage/download/upload/unlink/delete
      rosters containing out-of-scope personnel.
- [ ] Mixed-scope rosters are not exposed via partial group overlap.
- [ ] New route and pgTAP tests cover the access contract.
- [ ] Full repo gate and `npm run db:test` pass.
- [ ] `plans/README.md` status row for 070 is updated.

## STOP conditions

Stop and report back if:

- The desired group-scope semantics cannot be represented without a broader
  data-model decision, such as historical rosters that must remain visible to
  partially scoped users.
- Existing product behavior requires arbitrary, user-edited roster snapshots
  that are not tied to personnel IDs.
- Implementing correct list pagination requires a broad DataStore redesign
  beyond a small array filter/scope primitive.
- A database migration must inspect or modify production data.

## Maintenance notes

Future sign-in roster features should treat rosters as personnel-scoped
artifacts, not org-wide Training artifacts. Reviewers should scrutinize any use
of `policyResource: { kind: 'unscoped' }` in these routes and require a
separate personnel/group-scope check when the route cannot resolve a dynamic
resource before authorization.
