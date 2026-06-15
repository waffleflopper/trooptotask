# Plan 069: Add pgTAP contracts for newer RLS surfaces

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat b3acfabb..HEAD -- supabase/tests supabase/migrations package.json plans/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `b3acfabb`, 2026-06-14

## Why this matters

The repo has a local Supabase pgTAP gate, but the main RLS contract file only
covers older core tables. Recent policy surfaces for personnel follow-ups,
personnel documents/storage, Critical Tasks completions, and billing snapshots
are sensitive enough that future RLS edits should fail locally before review.
This plan adds additive database tests only; it should not change application
behavior or production data.

## Current state

- `package.json` defines `npm run db:test` as the local-only Supabase contract
  runner for every SQL file under `supabase/tests/`.
- `supabase/tests/core_table_rls_isolation.sql` currently plans 27 assertions
  and documents five target surfaces: personnel, availability entries,
  personnel trainings, duty roster templates, and notifications.
- `supabase/tests/` currently contains six SQL contract files and none for
  personnel artifact/follow-up RLS, Critical Tasks completion RLS, or billing
  snapshot RLS.
- Newer migrations define scoped policies that deserve contracts:
  `personnel_follow_ups`, personnel documents and storage objects,
  `personnel_ict_completions`, and `organization_billing_snapshots`.

Current excerpts:

```sql
-- supabase/tests/core_table_rls_isolation.sql:5
SELECT plan(27);
```

```sql
-- supabase/tests/core_table_rls_isolation.sql:7
-- RLS contract targets verified from migrations:
-- - personnel: organization_id, SELECT uses can_view_personnel_record(organization_id, group_id);
```

```sql
-- supabase/migrations/20260515000400_personnel_follow_ups.sql:41
CREATE POLICY "Members can view personnel follow ups"
    ON "public"."personnel_follow_ups"
    FOR SELECT
    USING (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'view')
        AND EXISTS (
```

```sql
-- supabase/migrations/20260515000900_personnel_artifact_rls_group_scope.sql:77
CREATE POLICY "Members can view personnel documents through scoped personnel access"
    ON "public"."personnel_documents"
    FOR SELECT
```

```sql
-- supabase/migrations/20260421000100_critical_tasks_permission_lane.sql:139
CREATE POLICY "Users can view personnel ICT completions if allowed by scoped critical tasks access"
  ON "public"."personnel_ict_completions"
  FOR SELECT
  USING ("public"."can_view_personnel_ict_completion_record"("organization_id", "personnel_id"));
```

```sql
-- supabase/migrations/20260523000300_organization_billing_snapshots.sql:126
CREATE POLICY "Members can view organization billing snapshots"
    ON "public"."organization_billing_snapshots"
    FOR SELECT
    USING ("public"."is_org_member"("organization_id"));
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Targeted artifact RLS test | `supabase test db supabase/tests/personnel_artifact_rls_group_scope.sql` | exits 0 |
| Targeted Critical Tasks RLS test | `supabase test db supabase/tests/critical_tasks_rls_isolation.sql` | exits 0 |
| Targeted billing snapshot RLS test | `supabase test db supabase/tests/organization_billing_snapshots_rls.sql` | exits 0 |
| All DB contracts | `npm run db:test` | exits 0 |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- New SQL test files under `supabase/tests/`, suggested:
  - `supabase/tests/personnel_artifact_rls_group_scope.sql`
  - `supabase/tests/critical_tasks_rls_isolation.sql`
  - `supabase/tests/organization_billing_snapshots_rls.sql`
- `plans/README.md` status row only.

**Out of scope**:

- Do not add or edit migrations in this plan unless a test reveals a real RLS
  defect and Robert explicitly approves expanding scope.
- Do not reset or delete the local development database without Robert's
  explicit permission.
- Never target the remote production database.
- Do not add automatic CI triggers; this repo intentionally keeps CI manual.
- Do not fold sign-in roster scope work into this plan. That is plan 070.

## Git workflow

- Branch: `codex/069-add-rls-contracts-for-new-policy-surfaces`
- Commit style: short imperative subject. Suggested:
  `Add RLS contracts for newer policy surfaces`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add personnel artifact and follow-up RLS contracts

Create `supabase/tests/personnel_artifact_rls_group_scope.sql`. Model its
fixture style after `supabase/tests/core_table_rls_isolation.sql`: wrap in
`BEGIN`, create the `extensions.pgtap` extension, call `SELECT plan(...)`, seed
deterministic UUIDs, call `finish()`, then `ROLLBACK`.

Cover at least:

- organization-scope personnel viewer can select an in-org follow-up and
  personnel document row,
- group-scoped viewer can select rows for personnel in one of their scoped
  groups,
- group-scoped viewer cannot select rows for personnel in another group in the
  same organization,
- other-org members cannot select rows,
- personnel operators can insert/update/delete only for personnel in scope,
- authenticated callers cannot read storage objects for out-of-scope personnel
  document paths.

Keep fixture IDs unique from existing test files to avoid collisions if a
developer runs multiple pgTAP files in one local database.

**Verify**:
`supabase test db supabase/tests/personnel_artifact_rls_group_scope.sql` exits
0.

### Step 2: Add Critical Tasks completion RLS contracts

Create `supabase/tests/critical_tasks_rls_isolation.sql`.

Cover at least:

- a member with Critical Tasks view capability can select ICT tasks and
  in-scope `personnel_ict_completions`,
- a member with only Training capability does not get Critical Tasks completion
  access through the old training lane,
- group-scoped Critical Tasks operators can insert/update/delete completions
  only for personnel in scoped groups,
- other-org members and anon cannot access completion rows.

Use the policy names and helper functions in
`20260421000100_critical_tasks_permission_lane.sql` as the source of truth.

**Verify**:
`supabase test db supabase/tests/critical_tasks_rls_isolation.sql` exits 0.

### Step 3: Add billing snapshot RLS contracts

Create `supabase/tests/organization_billing_snapshots_rls.sql`.

Cover at least:

- authenticated members can select their own organization's billing snapshot,
- authenticated members cannot select another organization's snapshot,
- anon cannot select snapshots,
- authenticated users cannot insert, update, or delete snapshots,
- service role can insert/update snapshots.

Do not assert on Stripe secret values or any real billing identifiers. Use fake
test IDs only.

**Verify**:
`supabase test db supabase/tests/organization_billing_snapshots_rls.sql` exits
0.

### Step 4: Run all database contracts

Run the full local database contract suite:

```bash
npm run db:test
```

**Verify**: all files under `supabase/tests/` pass.

### Step 5: Run the full repo gate

Run:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

**Verify**: every command exits 0.

## Test plan

- Add the three pgTAP files above.
- Run each new file directly with `supabase test db`.
- Run `npm run db:test` to catch fixture collisions with existing SQL tests.
- Run the full repo gate.

## Done criteria

- [ ] `supabase/tests/personnel_artifact_rls_group_scope.sql` exists and covers
      scoped personnel artifacts, follow-ups, and personnel document storage
      objects.
- [ ] `supabase/tests/critical_tasks_rls_isolation.sql` exists and proves
      Critical Tasks policies do not piggyback on Training access.
- [ ] `supabase/tests/organization_billing_snapshots_rls.sql` exists and proves
      member read plus service-role write semantics.
- [ ] `npm run db:test` exits 0 locally.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 069 is updated.

## STOP conditions

Stop and report back if:

- A new pgTAP contract fails because the live policy appears to allow a
  cross-org or out-of-scope read/write.
- You need to change a migration or production policy to make the tests pass.
- Supabase CLI version drift prevents local pgTAP execution. Report the CLI
  version and the error; do not rewrite the test around the tooling failure.
- Any step requires resetting or deleting the local database.

## Maintenance notes

Future RLS migrations should add or update pgTAP contracts in the same slice.
Reviewers should check that new tests prove both positive access and denial
cases; a contract that only proves owners can read data is too weak for these
surfaces.
