-- The upgrade reads every saved assignment as a hand assignment and keeps every
-- other saved value and every signed-in write.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT col_not_null('public', 'daily_assignments', 'source', 'every assignment has a source');
SELECT results_eq($$
  SELECT id, to_jsonb(a) - 'source' FROM public.daily_assignments a
    WHERE organization_id = 'e1727000-0000-4000-8000-000000000101' AND source = 'manual' ORDER BY id $$,
  $$ SELECT row_id, row_data FROM upgrade_fixture.daily_assignment_source_before_rows ORDER BY row_id $$,
  'every saved assignment reads manual and keeps its details');
SELECT ok(has_column_privilege('authenticated', 'public.daily_assignments', 'assignee_id', 'INSERT')
  AND has_column_privilege('authenticated', 'public.daily_assignments', 'assignee_id', 'UPDATE')
  AND has_table_privilege('authenticated', 'public.daily_assignments', 'DELETE'),
  'signed-in callers keep every other write');
SELECT * FROM finish();
ROLLBACK;
