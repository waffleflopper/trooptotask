# Plan 006: Add a manual Supabase DB contract gate

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise.
>
> **Drift check (run first)**: `git diff --stat 679b6113..HEAD -- package.json .github/workflows/ci.yml docs/local-auth-testing.md supabase/tests`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-harden-sensitive-rpc-execute-privileges.md, plans/003-refresh-org-ownership-rpcs.md
- **Category**: tests
- **Planned at**: commit `679b6113`, 2026-06-10

## Why This Matters

The repo has pgTAP database authorization coverage, but it is only documented as a manual command. App tests can pass while a migration breaks an RPC grant, RLS boundary, or privilege contract. This plan adds a manual DB contract gate to the repo tooling and existing `workflow_dispatch` CI without enabling automatic GitHub Actions triggers.

## Current State

- Existing documented DB contract:

```md
<!-- docs/local-auth-testing.md:82 -->

## Run the auth workflow database authorization contract

The auth workflow storage authorization checks live in `supabase/tests/auth_workflow_authorization.sql`.
```

```bash
# docs/local-auth-testing.md:90
supabase start
supabase test db supabase/tests/auth_workflow_authorization.sql
```

- Existing pgTAP file:

```sql
-- supabase/tests/auth_workflow_authorization.sql:1
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(17);
```

- Current CI workflow is manual only:

```yaml
# .github/workflows/ci.yml:3
on:
  workflow_dispatch:
```

Do not change this trigger block in this plan. Robert intentionally excluded automatic CI trigger work due GitHub limit pressure.

## Commands You Will Need

| Purpose      | Command                    | Expected on success                                   |
| ------------ | -------------------------- | ----------------------------------------------------- |
| Local DB     | `supabase start`           | Local Supabase is running; do not point at production |
| DB contracts | `npm run db:test`          | all pgTAP files in `supabase/tests` pass              |
| Format       | `npm run format`           | exits 0                                               |
| Lint         | `npm run lint`             | exits 0                                               |
| Governance   | `npm run governance:check` | exits 0                                               |
| Typecheck    | `npm run check`            | exits 0                                               |
| Unit tests   | `npm run test`             | exits 0                                               |

## Scope

**In scope**:

- `package.json`
- `.github/workflows/ci.yml`
- `docs/local-auth-testing.md`
- `supabase/tests/*.sql` only if needed to make the runner handle all current contracts consistently

**Out of scope**:

- Adding `pull_request`, `push`, schedule, or any other automatic workflow triggers.
- Any production or remote database operation.
- Resetting or deleting local database tables.
- Expanding pgTAP business coverage beyond wiring the selected contract files into the gate.
- Fixing DB contract failures from plans 001 or 003 unless those plans are also in your assigned scope.

## Git Workflow

- Branch: `codex/006-add-manual-supabase-db-contract-gate`
- Commit message style: short imperative, for example `Add manual Supabase DB contract gate`
- Do not push or open a PR unless the operator asks.

## Steps

### Step 1: Add a local DB test script

In `package.json`, add scripts that run the Supabase pgTAP contracts.

Preferred shape:

```json
"db:test": "sh -c 'for file in supabase/tests/*.sql; do supabase test db \"$file\" || exit 1; done'"
```

If shell quoting causes cross-platform issues, add a tiny Node script under `scripts/` only after confirming that a package.json script cannot be made reliable. If you add a script file, keep it in scope by updating this plan's status notes in `plans/README.md`.

Do not add a Supabase CLI dependency to `package.json` unless the repo already standardizes on that package. The documented local path assumes the operator has Supabase CLI installed.

**Verify**:

```bash
supabase start
npm run db:test
```

Expected: every SQL file under `supabase/tests` passes.

### Step 2: Document the aggregate DB contract command

Update `docs/local-auth-testing.md`.

Keep the existing direct-file command, but add the new aggregate command:

```bash
supabase start
npm run db:test
```

State clearly:

- Use only local or disposable Supabase.
- Do not run against production.
- The tests wrap fixture rows in transactions and should not require a table reset.

**Verify**: `rg -n "npm run db:test|Do not run.*production|local or disposable" docs/local-auth-testing.md` shows the new guidance.

### Step 3: Add a manual CI DB contract job without changing triggers

Update `.github/workflows/ci.yml`.

Requirements:

- Preserve the existing trigger shape:

```yaml
on:
  workflow_dispatch:
```

- Add a separate job, for example `db-contracts`, that:
  - checks out the repo
  - installs or sets up the Supabase CLI using the repo-approved CI approach
  - starts local Supabase
  - runs `npm run db:test`

If using a GitHub Action to install the Supabase CLI, use the official Supabase CLI setup action and pin to a stable major version. If that action is unavailable or fails in CI, stop and report rather than replacing it with an unreviewed curl installer.

Do not add automatic workflow triggers. This workflow remains manually dispatched.

**Verify**:

```bash
rg -n "workflow_dispatch|pull_request|push:|db:test|supabase start" .github/workflows/ci.yml
```

Expected:

- `workflow_dispatch` exists.
- `db:test` exists.
- `supabase start` exists.
- No new `pull_request` or `push` trigger was added.

### Step 4: Run local verification

Run the local DB contract and the full repo gate.

**Verify**:

```bash
supabase start
npm run db:test
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

All commands exit 0.

## Test Plan

- `npm run db:test` runs every `supabase/tests/*.sql` file.
- Existing pgTAP file `supabase/tests/auth_workflow_authorization.sql` is the baseline proof.
- If plans 001 and 003 have landed first, their new pgTAP files must also run through this aggregate command.

## Done Criteria

- [ ] `package.json` has a `db:test` command.
- [ ] `npm run db:test` passes against local Supabase.
- [ ] `docs/local-auth-testing.md` documents the aggregate command and production safety warning.
- [ ] `.github/workflows/ci.yml` has a manual DB contract job.
- [ ] `.github/workflows/ci.yml` still does not include `pull_request` or `push` triggers.
- [ ] Full npm gate passes: `format`, `lint`, `governance:check`, `check`, `test`.
- [ ] No files outside the in-scope list are modified unless a tiny runner script was explicitly necessary and recorded.
- [ ] `plans/README.md` status row updated.

## STOP Conditions

Stop and report if:

- Adding the CI job requires automatic triggers.
- Supabase CLI setup in CI is unclear or requires an unreviewed third-party installer.
- `npm run db:test` would target a remote database.
- Any pgTAP file requires resetting or deleting local tables.
- Local Supabase cannot start after two reasonable attempts.

## Maintenance Notes

This plan intentionally keeps CI manual. If GitHub usage limits change later, automatic workflow triggers can be planned separately. Reviewers should confirm that any new `supabase/tests/*.sql` contract automatically runs through `npm run db:test`.
