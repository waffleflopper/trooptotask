# Calendar Group assignment cutover

The Calendar daily picker and monthly planner now persist a Group UUID and resolve its current name for display. Calendar headers, three-month view, dashboard and the retained Today Breakdown component use the same identity. Renaming a Group does not change its saved assignment references.

Migration `20260918000300_canonicalize_calendar_group_assignees.sql` converts exact legacy names to UUIDs within the assignment's Organization. It retains assignment IDs, dates, types, timestamps, source lineage and all other fields. Existing UUID references and person assignments are unchanged. It does not delete rows, drop tables or change privileges/RLS. It locks Group, assignment-type and assignment writes during its preflight/conversion; ordinary reads remain possible.

Missing Groups, foreign references, or a UUID/name collision that identifies multiple Groups block the entire conversion. The migration raises an error before modifying any row. It never guesses a replacement for a renamed/deleted Group. Resolving those cases requires reviewed knowledge of the intended historical assignee; do not delete historical assignments to make migration pass.

## Deployment ordering

**This is a coordinated application/data cutover, not a migration that can safely precede deployment while current main remains active.** Old main's Group pickers submit names; the Group-scope policy requires UUIDs. Old main also displays stored UUIDs as labels. No permanent name fallback or authorization bypass was introduced.

1. Before applying this branch's Calendar policy or conversion migration, an authorized database operator runs the read-only preflight below and resolves every returned row. Capture an operator-managed backup/export and the migration history through the normal release process. This agent has not accessed production or run that preflight remotely.
2. Stage the application build containing the ID-valued consumers. Pause application traffic/writes, including old browser clients, for the cutover. Applying only the earlier `20260918000100` policy can hide legacy name rows even if the later conversion then fails.
3. Apply the branch's pending migrations in order, including `20260918000300`. If preflight/conversion fails, keep traffic paused and resolve the reported references; do not resume old main against a partially applied chain.
4. Deploy this application build, require old clients to reload, and verify saved Group assignments, a daily edit, a monthly quick fill, rename display, and scoped-member denial before reopening traffic.
5. Do not roll back only the application to old main after conversion. Keep the compatible build, or use a separately reviewed recovery plan that restores application and data consistently.

This procedure does not authorize the agent to migrate or inspect the remote database.

## Read-only preflight

A clean result is zero rows. This detects exact-name mappings only; it does not infer aliases or normalize case/whitespace. Both UUID and name matches are considered when detecting ambiguity.

```sql
SELECT assignment.id AS assignment_id,
       assignment.organization_id,
       assignment.assignment_type_id,
       assignment.assignee_id,
       assignment_type.organization_id AS type_organization_id,
       matches.candidate_ids
FROM public.daily_assignments AS assignment
JOIN public.assignment_types AS assignment_type
  ON assignment_type.id = assignment.assignment_type_id
CROSS JOIN LATERAL (
  SELECT array_agg(candidate.id ORDER BY candidate.id) AS candidate_ids,
         count(*) AS candidate_count
  FROM public.groups AS candidate
  WHERE candidate.organization_id = assignment.organization_id
    AND (candidate.id::text = assignment.assignee_id
         OR candidate.name = assignment.assignee_id)
) AS matches
WHERE assignment_type.assign_to = 'group'
  AND (assignment_type.organization_id <> assignment.organization_id
       OR matches.candidate_count <> 1);
```

## Local migration verification

Follow the [isolated database contract](../architecture/DEFINITION_OF_DONE.md#isolated-database-checks). The regular `npm run db:test` suite must run from a disposable project's working directory, not this checkout. It covers scoped UUID access, rejected name writes and rename persistence.

The separate [migration test](../../supabase/migration-tests/calendar_group_assignees.sql) includes the actual forward migration rather than copying its implementation. It uses synthetic fixtures inside a rolled-back transaction and checks same-name Groups in different Organizations, unchanged person/UUID references, all retained row fields, idempotence, and atomic rejection of missing/foreign/ambiguous references. Copy `supabase/migration-tests/` and the referenced migration into matching sibling directories inside the disposable database container, then run:

```bash
docker exec "$disposable_db_container" psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -Atf /tmp/calendar-group-migration/migration-tests/calendar_group_assignees.sql
```

Require all nine TAP assertions to be `ok`, the `1..9` plan, no `not ok` lines and successful process completion. The three expected preflight exceptions are captured with savepoints and asserted as `P0001`; they do not skip failures. The Supabase CLI uploads individual test files without their relative migration include, so this test runs with both directories explicitly copied into the disposable container. Separately exercise upgrade from the audited main migration chain with persisted legacy fixtures before running the ordinary SQL suites. See [evidence](../stabilization/EVIDENCE.md) for the verified candidate and results.
