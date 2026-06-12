# Plan 015: Add pgTAP cross-tenant isolation contracts for core org-scoped tables

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 22e6e184..HEAD -- supabase/tests supabase/migrations`
> New migrations since `22e6e184` are fine (note them); a renamed/removed table
> from the list below is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `22e6e184`, 2026-06-11

## Why this matters

This is a multi-tenant SaaS where Organizations must never see each other's data, and the
enforcement of that lives in Postgres RLS policies — **67 tables have RLS enabled**
(in `supabase/migrations/`, chiefly `20260413001158_remote_schema.sql`), but `supabase/tests/`
contains only **3 pgTAP files**, none of which test row visibility on the core domain tables.
Today a migration that accidentally loosens a policy on `personnel` or `availability_entries`
would pass every gate (`npm run check`, `npm run test`, governance) and ship. This plan adds a
database-level contract test asserting cross-org isolation for the five highest-value tables, so
RLS regressions fail `npm run db:test` instead of becoming production incidents.

## Current state

- `supabase/tests/` — exactly three pgTAP files today:
  `auth_workflow_authorization.sql`, `org_ownership_rpc_contract.sql`,
  `sensitive_rpc_privileges.sql`.
- **`supabase/tests/auth_workflow_authorization.sql` is your structural exemplar** (401 lines).
  It demonstrates every technique this plan needs:
  - wraps everything in `BEGIN; ... SELECT * FROM finish(); ROLLBACK;` so nothing persists;
  - `CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;` and `SELECT plan(N);`;
  - seeds `auth.users` rows directly with fixed UUIDs (see its INSERT near the top, and the
    same pattern in `org_ownership_rpc_contract.sql:22-60`);
  - simulates an anonymous caller: `SET LOCAL ROLE anon;` (line 203);
  - simulates an authenticated caller:
    `SET LOCAL ROLE authenticated;` then
    `SELECT set_config('request.jwt.claim.sub', '<user uuid>', true);` and
    `SELECT set_config('request.jwt.claim.email', '<email>', true);` (lines 236-238);
  - asserts visibility with `results_eq` / `is` and emptiness checks;
  - `RESET ROLE;` before `finish()`.
- Schema source of truth for table/column names: `supabase/migrations/20260413001158_remote_schema.sql`
  (the squashed remote schema), plus later feature migrations. Do not guess column names — grep
  this file for each `CREATE TABLE` before writing INSERTs.
- Target tables for this plan (all RLS-enabled, all org-scoped):

  | Table | Why it's in the top five |
  |---|---|
  | `personnel` | The roster itself — most sensitive PII surface |
  | `availability_entries` | Calendar/availability statuses per person |
  | `personnel_trainings` | Training records (readiness data) |
  | `duty_roster_templates` | Duty roster configuration |
  | `notifications` | Per-user rows — must be isolated per user, not just per org |

- The runner: `npm run db:test` executes
  `for file in supabase/tests/*.sql; do supabase test db "$file" || exit 1; done`
  (`package.json:18`) against the **local** Supabase stack. It requires `supabase start` to have
  been run. It does NOT reset the database; tests roll back.
- Repo guardrail (from CLAUDE.md): never touch the remote production database; do not reset the
  local database. This plan only adds a rolled-back test file — fully compliant.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Local stack status | `supabase status` | services running (else `supabase start`) |
| Run one pgTAP file | `supabase test db supabase/tests/core_table_rls_isolation.sql` | all tests pass |
| Run all DB tests | `npm run db:test` | exit 0, 4 files pass |
| App test suite (unchanged) | `npm run test` | exit 0 |

## Scope

**In scope** (the only files you should create/modify):
- `supabase/tests/core_table_rls_isolation.sql` (create)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):
- Any file under `supabase/migrations/` — if a test exposes a policy that looks WRONG, that is a
  STOP condition (report the finding), not a license to change policies.
- The three existing pgTAP files.
- App code under `src/` — this plan is database-only.
- Group-scoped (scope-set) visibility rules — org-level isolation only in this plan; per-group
  scoping is a follow-up (see Maintenance notes).

## Git workflow

- Branch: `advisor/015-pgtap-rls-isolation`
- Commit style: short imperative subject. Suggested: `Add pgTAP cross-org isolation contracts`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read the exemplar and the schema for the five tables

Read `supabase/tests/auth_workflow_authorization.sql` end to end. Then, for each target table,
locate its `CREATE TABLE "public"."<name>"` block in
`supabase/migrations/20260413001158_remote_schema.sql` (and any later `ALTER TABLE` in newer
migrations) and note: required columns, the org-scoping column (`org_id` or
`organization_id` — verify per table, do not assume), and FK targets you must seed first
(organizations, organization_memberships, personnel, auth.users).

Also locate each table's RLS policies (`CREATE POLICY ... ON "public"."<name>"`) so your
assertions test what the policies claim.

**Verify**: you can state, for each of the five tables, its org-scoping column and its
SELECT/INSERT policies. (Write them as a comment header in the new test file — that comment is
this step's artifact.)

### Step 2: Build the fixture inside a transaction

Create `supabase/tests/core_table_rls_isolation.sql`:

```
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(<N>);   -- fill in the final count

-- Fixture: two orgs ("alpha", "bravo"), each with one owner user (auth.users +
-- organization_memberships), one personnel row, one availability entry, one
-- training record, one duty roster template, and one notification per owner.
-- Use fixed UUIDs in distinct ranges, following the convention in
-- org_ownership_rpc_contract.sql (e.g. 20000000-0000-4000-8000-0000000150NN).
```

Seed as the default (superuser) role so RLS doesn't block fixture INSERTs. If an INSERT trips a
constraint you can't satisfy from the schema alone, check how the app writes that table
(`grep -rn "'<table_name>'" src/lib/server` for the table constant) before improvising.

**Verify**: `supabase test db supabase/tests/core_table_rls_isolation.sql` with a temporary
`SELECT plan(1); SELECT pass('fixture loads');` → passes (fixture INSERTs are valid).

### Step 3: Assert cross-org isolation for each table

For each of the five tables, as the **org-alpha owner**
(`SET LOCAL ROLE authenticated;` + `set_config('request.jwt.claim.sub', '<alpha owner uuid>', true)`):

1. can SELECT the alpha row (count = 1) — proves the positive path so the negative assertions
   aren't passing vacuously because the policy denies everyone;
2. cannot SELECT the bravo row (count over bravo org's rows = 0);
3. cannot UPDATE the bravo row (row count affected = 0 — RLS filters, it does not error);
4. cannot INSERT a row scoped to bravo's org (expect an error via `throws_ok`, or affected
   count 0 — match what the policy actually does; WITH CHECK violations raise
   `new row violates row-level security policy`, so `throws_ok` is the usual shape).

For `notifications`, additionally assert **user-level** isolation inside the same org if the
schema supports two users per org cheaply; otherwise assert org isolation only and note it.

Then `SET LOCAL ROLE anon;` and assert all five tables return 0 rows.

Finish with `RESET ROLE; SELECT * FROM finish(); ROLLBACK;` and set `plan(N)` to the real count.

**Verify**: `supabase test db supabase/tests/core_table_rls_isolation.sql` → all N pass.

### Step 4: Run the full DB suite

**Verify**: `npm run db:test` → exit 0 (all 4 files, including the 3 pre-existing ones —
proves your fixture UUIDs don't collide with theirs).

## Test plan

This plan IS a test plan; the new assertions are listed in Step 3. The structural pattern is
`supabase/tests/auth_workflow_authorization.sql`; the seeding pattern is
`supabase/tests/org_ownership_rpc_contract.sql:22-60`. Expected shape: ~25–35 assertions
(5 tables × 4–5 assertions + anon sweep).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `supabase/tests/core_table_rls_isolation.sql` exists, starts with `BEGIN;` and ends with `ROLLBACK;`
- [ ] It contains `set_config('request.jwt.claim.sub'` (authenticated simulation) and `SET LOCAL ROLE anon;`
- [ ] `npm run db:test` exits 0
- [ ] `npm run test` exits 0 (untouched, but proves no collateral)
- [ ] `git status` shows only the new test file and `plans/README.md`
- [ ] `plans/README.md` status row for 015 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `supabase status` shows no local stack and `supabase start` fails — do NOT attempt resets or
  migrations repair; report.
- Any isolation assertion in Step 3 FAILS against current policies — that is a live
  cross-tenant security finding. Do not "fix" the policy and do not weaken the assertion;
  report the table and policy immediately.
- A target table's org-scoping column doesn't exist or visibility is mediated through a
  different mechanism (e.g. a view or RPC-only access) — report and propose substituting the
  next-highest-value table rather than forcing it.
- A fixture INSERT requires touching `supabase/migrations/` or app code.

## Maintenance notes

- Follow-ups deliberately deferred: (1) group/scope-set visibility contracts (member sees only
  scoped groups' personnel) — needs a richer fixture; (2) the remaining ~60 RLS tables — extend
  this file's fixture rather than duplicating seeding in new files where practical.
- Every future migration touching policies on these five tables should expect this file to need
  review — that is the point.
- Reviewer should scrutinize: positive-visibility assertions exist for each table (guards
  against vacuously-passing negative tests), and `plan(N)` matches the actual assertion count.
