# Plan 044: Add a platform audit global timestamp index

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 0a6e6000..HEAD -- supabase/migrations src/lib/server/db src/lib/server/adapters/supabasePlatformAudit.ts src/lib/server/adapters/supabasePlatformAdministration.ts src/routes/admin/audit`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `0a6e6000`, 2026-06-13

## Why this matters

Platform audit views page globally by `timestamp desc`, but the current indexes support action,
severity, and organization-scoped timestamp access. Org-scoped audit has a matching access path;
platform-wide audit does not. Adding a global timestamp index lets the database satisfy recent
activity and platform audit pagination without relying on a full-table sort as audit volume grows.

## Current state

- `src/routes/admin/audit/+page.server.ts:17-23` calls `listLogs` with optional filters. The org
  filter is optional, so platform-wide audit is a normal path.
- `src/lib/server/adapters/supabasePlatformAudit.ts:72-80` requests an exact count, orders globally
  by timestamp, and ranges the page:

```ts
let query = supabase.from('audit_logs').select(AUDIT_LOG_LIST_COLUMNS, { count: 'exact' });
if (input.orgId) query = query.eq('org_id', input.orgId);

const response = await query
	.order('timestamp', { ascending: false })
	.range(input.offset, input.offset + input.limit - 1);
```

- `src/lib/server/adapters/supabasePlatformAdministration.ts:114-119` also reads recent activity by
  global timestamp:

```ts
const response = await supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(limit);
```

- `supabase/migrations/20260413001158_remote_schema.sql:2975-2983` has these audit indexes:

```sql
CREATE INDEX "idx_audit_logs_action" ON "public"."audit_logs" USING "btree" ("action");
CREATE INDEX "idx_audit_logs_org_id_timestamp" ON "public"."audit_logs" USING "btree" ("org_id", "timestamp" DESC);
CREATE INDEX "idx_audit_logs_severity" ON "public"."audit_logs" USING "btree" ("severity") WHERE ("severity" <> 'info'::"text");
```

There is no global `timestamp desc` index.

## Commands you will need

| Purpose                                       | Command                                                                         | Expected on success           |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------- |
| Install, if needed                            | `npm ci`                                                                        | exit 0                        |
| Static migration test                         | `npx vitest run src/lib/server/db/platformAuditTimestampIndexMigration.test.ts` | all pass                      |
| DB contract tests                             | `npm run db:test`                                                               | exit 0                        |
| Local migration, if local Supabase is running | `supabase migration up`                                                         | applies locally; never remote |
| Format                                        | `npm run format`                                                                | exit 0                        |
| Lint                                          | `npm run lint`                                                                  | exit 0                        |
| Governance                                    | `npm run governance:check`                                                      | exit 0                        |
| Typecheck                                     | `npm run check`                                                                 | exit 0                        |
| Full tests                                    | `npm run test`                                                                  | exit 0                        |

## Scope

**In scope**:

- A new migration under `supabase/migrations/`
- `src/lib/server/db/platformAuditTimestampIndexMigration.test.ts` (create)
- Optional `supabase/tests/platform_audit_timestamp_index.sql` if the repo prefers pgTAP for index
  existence checks
- `plans/README.md` status row only

**Out of scope**:

- Do not change audit-log RLS.
- Do not change audit-log retention.
- Do not redesign exact-count pagination in this plan.
- Do not add user-id timestamp indexes unless a measured `listRecentByUser` problem is part of a
  separate plan.
- Do not run migrations against the remote production database.
- Do not reset or delete the local database without Robert's explicit permission.

## Git workflow

- Branch: `codex/044-add-platform-audit-global-timestamp-index`
- Commit style: short imperative subject. Suggested: `Add platform audit timestamp index`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a follow-up migration

Create a new migration with the next timestamp, for example:

```text
supabase/migrations/20260613000300_platform_audit_global_timestamp_index.sql
```

Add a global timestamp index:

```sql
CREATE INDEX IF NOT EXISTS "idx_audit_logs_timestamp_desc"
ON "public"."audit_logs" USING "btree" ("timestamp" DESC);
```

Do not use `CREATE INDEX CONCURRENTLY` unless you first confirm the repo's Supabase migration runner
supports non-transactional migration statements. No existing migration currently uses
`CONCURRENTLY`, so the default repo-compatible form is the plain `CREATE INDEX IF NOT EXISTS`.

### Step 2: Add static migration coverage

Create `src/lib/server/db/platformAuditTimestampIndexMigration.test.ts`.

Assert that the new migration:

- creates `idx_audit_logs_timestamp_desc`,
- targets `public.audit_logs`,
- uses `timestamp desc`,
- does not drop or replace existing audit indexes,
- does not alter `audit_logs` RLS or table columns.

Use the read-file string assertion pattern from `personnelArtifactIndexesMigration.test.ts` or
`criticalTasksReadModelsMigration.test.ts`.

**Verify**:
`npx vitest run src/lib/server/db/platformAuditTimestampIndexMigration.test.ts` exits 0.

### Step 3: Optionally add pgTAP index existence coverage

If the repo's DB contract tests already include index checks that match this shape, add a small
pgTAP file, for example:

```text
supabase/tests/platform_audit_timestamp_index.sql
```

Assert the index exists on `audit_logs`. If pgTAP cannot express the exact descending column check
cleanly, keep the exact shape assertion in the static migration test and use pgTAP only for
existence.

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

- Static migration test for the exact index shape.
- Optional pgTAP existence check if it fits local patterns.
- Local migration application if Supabase is running.
- Full repo gate.

## Done criteria

- [ ] A new migration adds a global `audit_logs(timestamp desc)` index.
- [ ] Existing audit indexes are not dropped or renamed.
- [ ] Static migration coverage asserts the index shape.
- [ ] `npm run db:test` passes locally if pgTAP coverage is added, or the final report explains why it was not added.
- [ ] Local migration verification passes or the final report records why it was blocked.
- [ ] The full repo gate passes.
- [ ] `plans/README.md` status row for 044 is updated.

## STOP conditions

Stop and report back if:

- A newer migration already added a global audit timestamp index.
- The migration runner requires a production-safe concurrent index strategy that conflicts with
  local migration conventions.
- Adding the index would require changing audit table structure or RLS.
- Local DB verification would require resetting or deleting local data without Robert's explicit permission.

## Maintenance notes

This plan fixes the missing access path only. Exact counts on large audit tables can still be
expensive; if audit volume makes counts slow, plan a separate UX/query change using page-plus-one,
estimated counts, or a dedicated summary table.
