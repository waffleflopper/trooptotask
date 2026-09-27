-- The Calendar scope repair changes authorization, not saved Calendar facts.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20260926000600'),
  1, 'Calendar scope migration was recorded by the local runner');
CREATE TEMP TABLE calendar_unassigned_current_rows AS
SELECT 'auth.users'::text AS table_name, id AS row_id, to_jsonb(row_value) AS row_data FROM auth.users AS row_value WHERE id IN ('d5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002')
UNION ALL
SELECT 'public.organizations', id, to_jsonb(row_value) FROM public.organizations AS row_value WHERE id = 'd5000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.groups', id, to_jsonb(row_value) FROM public.groups AS row_value WHERE id = 'd5000000-0000-4000-8000-000000000201'
UNION ALL
SELECT 'public.organization_memberships', id, to_jsonb(row_value) FROM public.organization_memberships AS row_value WHERE organization_id = 'd5000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel', id, to_jsonb(row_value) FROM public.personnel AS row_value WHERE id IN ('d5000000-0000-4000-8000-000000000301','d5000000-0000-4000-8000-000000000302')
UNION ALL
SELECT 'public.status_types', id, to_jsonb(row_value) FROM public.status_types AS row_value WHERE id = 'd5000000-0000-4000-8000-000000000401'
UNION ALL
SELECT 'public.assignment_types', id, to_jsonb(row_value) FROM public.assignment_types AS row_value WHERE id = 'd5000000-0000-4000-8000-000000000402'
UNION ALL
SELECT 'public.availability_entries', id, to_jsonb(row_value) FROM public.availability_entries AS row_value WHERE id IN ('d5000000-0000-4000-8000-000000000501','d5000000-0000-4000-8000-000000000502')
UNION ALL
SELECT 'public.daily_assignments', id, to_jsonb(row_value) FROM public.daily_assignments AS row_value WHERE id IN ('d5000000-0000-4000-8000-000000000601','d5000000-0000-4000-8000-000000000602');
SELECT is((SELECT count(*)::integer FROM calendar_unassigned_current_rows), 14, 'all historical Calendar rows remain');
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM calendar_unassigned_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.calendar_unassigned_before_rows ORDER BY table_name, row_id $$,
  'migration preserves exact Auth, membership, Personnel, availability and assignment values');
SELECT ok(to_regprocedure('public.can_view_daily_assignment_record(uuid,text)') IS NULL
    AND to_regprocedure('public.can_edit_daily_assignment_record(uuid,text)') IS NULL,
  'obsolete two-argument assignment helpers were removed');
SELECT ok(NOT has_function_privilege('authenticated', 'public.calendar_personnel_group_scope_matches(uuid,uuid)', 'EXECUTE'),
  'new Calendar scope helper has no authenticated RPC grant');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'Calendar-only member still cannot SELECT Personnel');
SELECT is((SELECT id FROM public.availability_entries), 'd5000000-0000-4000-8000-000000000501'::uuid,
  'Group member sees only Alpha availability after upgrade');
SELECT is((SELECT id FROM public.daily_assignments), 'd5000000-0000-4000-8000-000000000601'::uuid,
  'Group member sees only Alpha person assignment after upgrade');
WITH changed AS (UPDATE public.availability_entries SET end_date = '2030-01-04' WHERE id = 'd5000000-0000-4000-8000-000000000502' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group member cannot edit retained unassigned availability') FROM changed;
WITH changed AS (UPDATE public.daily_assignments SET date = '2030-01-04' WHERE id = 'd5000000-0000-4000-8000-000000000602' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group member cannot edit retained unassigned assignment') FROM changed;
SELECT set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.availability_entries), 2, 'Organization-scoped member retains unassigned availability');
SELECT is((SELECT count(*)::integer FROM public.daily_assignments), 2, 'Organization-scoped member retains unassigned person assignment');
SELECT * FROM finish();
ROLLBACK;
