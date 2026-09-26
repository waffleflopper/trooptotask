-- Saved Soldier Data Sheet values survive the authorization-only migration.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20260926001000'),
  1, 'extended info scope migration was recorded');
CREATE TEMP TABLE personnel_extended_info_current_rows AS
SELECT 'auth.users'::text AS table_name, id AS row_id, to_jsonb(row_value) AS row_data FROM auth.users AS row_value WHERE id IN ('f6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000002')
UNION ALL
SELECT 'public.organizations', id, to_jsonb(row_value) FROM public.organizations AS row_value WHERE id = 'f6000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.groups', id, to_jsonb(row_value) FROM public.groups AS row_value WHERE id = 'f6000000-0000-4000-8000-000000000201'
UNION ALL
SELECT 'public.organization_memberships', id, to_jsonb(row_value) FROM public.organization_memberships AS row_value WHERE organization_id = 'f6000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel', id, to_jsonb(row_value) FROM public.personnel AS row_value WHERE organization_id = 'f6000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel_extended_info', id, to_jsonb(row_value) FROM public.personnel_extended_info AS row_value WHERE organization_id = 'f6000000-0000-4000-8000-000000000101';
SELECT is((SELECT count(*)::integer FROM personnel_extended_info_current_rows), 12,
  'all historical Soldier Data Sheet fixture rows remain');
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM personnel_extended_info_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.personnel_extended_info_before_rows ORDER BY table_name, row_id $$,
  'migration preserves exact Auth, Organization, Person and Soldier Data Sheet identities and values');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f6000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT string_agg(personnel_id::text, ',' ORDER BY personnel_id) FROM public.personnel_extended_info),
  'f6000000-0000-4000-8000-000000000301,f6000000-0000-4000-8000-000000000302',
  'Group operator retains assigned active and archived extended info, loses unassigned');
SELECT is((SELECT string_agg(personnel_id::text, ',' ORDER BY personnel_id)
  FROM public.list_personnel_award_tracking_acknowledged('f6000000-0000-4000-8000-000000000101')),
  'f6000000-0000-4000-8000-000000000301,f6000000-0000-4000-8000-000000000302',
  'Group badge projection retains assigned active and archived IDs');
SELECT set_config('request.jwt.claim.sub', 'f6000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_extended_info), 3,
  'Organization-wide operator retains all assigned and unassigned extended info');
SELECT is((SELECT count(*)::integer FROM public.list_personnel_award_tracking_acknowledged('f6000000-0000-4000-8000-000000000101')),
  3, 'Organization-wide badge projection retains all acknowledged IDs');
SELECT * FROM finish();
ROLLBACK;
