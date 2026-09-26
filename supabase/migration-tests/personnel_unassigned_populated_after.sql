-- The row-helper repair changes authorization, not saved Personnel facts.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20260926000700'),
  1, 'Personnel scope migration was recorded by the local runner');
CREATE TEMP TABLE personnel_unassigned_current_rows AS
SELECT 'auth.users'::text AS table_name, id AS row_id, to_jsonb(row_value) AS row_data FROM auth.users AS row_value WHERE id IN ('d7000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000002','d7000000-0000-4000-8000-000000000003')
UNION ALL
SELECT 'public.organizations', id, to_jsonb(row_value) FROM public.organizations AS row_value WHERE id = 'd7000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.groups', id, to_jsonb(row_value) FROM public.groups AS row_value WHERE id = 'd7000000-0000-4000-8000-000000000201'
UNION ALL
SELECT 'public.organization_memberships', id, to_jsonb(row_value) FROM public.organization_memberships AS row_value WHERE organization_id = 'd7000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel', id, to_jsonb(row_value) FROM public.personnel AS row_value WHERE organization_id = 'd7000000-0000-4000-8000-000000000101';
SELECT is((SELECT count(*)::integer FROM personnel_unassigned_current_rows), 11, 'all historical Personnel rows remain');
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM personnel_unassigned_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.personnel_unassigned_before_rows ORDER BY table_name, row_id $$,
  'migration preserves exact Auth, Organization, membership and Personnel values');
SELECT ok(has_function_privilege('authenticated', 'public.can_view_personnel_record(uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.can_edit_personnel_record(uuid,uuid)', 'EXECUTE'),
  'Personnel row policy function grants survive');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd7000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT string_agg(id::text, ',' ORDER BY id) FROM public.personnel),
  'd7000000-0000-4000-8000-000000000301,d7000000-0000-4000-8000-000000000302',
  'Group member retains active and archived in-Group rows but loses unassigned row');
WITH changed AS (UPDATE public.personnel SET first_name = 'Denied' WHERE id = 'd7000000-0000-4000-8000-000000000303' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group member cannot edit retained unassigned Person') FROM changed;
SELECT set_config('request.jwt.claim.sub', 'd7000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'empty Group scope reads no retained Personnel');
SELECT set_config('request.jwt.claim.sub', 'd7000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 3, 'Organization-wide member retains all assigned and unassigned rows');
SELECT * FROM finish();
ROLLBACK;
