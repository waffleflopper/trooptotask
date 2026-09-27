-- Validate retained Training rows and the changed policy after staged migration.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20260926000300'),
          1, 'strict Training scope migration was recorded by the local runner');
CREATE TEMP TABLE training_current_rows AS
SELECT 'auth.users'::text AS table_name, id AS row_id, to_jsonb(row_value) AS row_data
  FROM auth.users AS row_value WHERE id = 'b7000000-0000-4000-8000-000000000001'
UNION ALL
SELECT 'public.organizations', id, to_jsonb(row_value) FROM public.organizations AS row_value WHERE id = 'b7000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.groups', id, to_jsonb(row_value) FROM public.groups AS row_value WHERE id = 'b7000000-0000-4000-8000-000000000201'
UNION ALL
SELECT 'public.organization_memberships', id, to_jsonb(row_value) FROM public.organization_memberships AS row_value WHERE organization_id = 'b7000000-0000-4000-8000-000000000101' AND user_id = 'b7000000-0000-4000-8000-000000000001'
UNION ALL
SELECT 'public.personnel', id, to_jsonb(row_value) FROM public.personnel AS row_value WHERE id IN ('b7000000-0000-4000-8000-000000000301','b7000000-0000-4000-8000-000000000302','b7000000-0000-4000-8000-000000000303')
UNION ALL
SELECT 'public.training_types', id, to_jsonb(row_value) FROM public.training_types AS row_value WHERE id = 'b7000000-0000-4000-8000-000000000401'
UNION ALL
SELECT 'public.personnel_trainings', id, to_jsonb(row_value) FROM public.personnel_trainings AS row_value WHERE id IN ('b7000000-0000-4000-8000-000000000501','b7000000-0000-4000-8000-000000000502','b7000000-0000-4000-8000-000000000503');
SELECT is((SELECT count(*)::integer FROM training_current_rows), 11, 'all synthetic historical rows still exist');
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM training_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.training_before_rows ORDER BY table_name, row_id $$,
  'migration preserves exact Training, Personnel and membership identities and values');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b7000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'Training-only actor still cannot SELECT Personnel');
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings), 2, 'scoped actor reads active and archived records but not historical unassigned record');
SELECT lives_ok($$ UPDATE public.personnel_trainings SET notes = 'allowed after upgrade' WHERE id = 'b7000000-0000-4000-8000-000000000502' $$,
                'scoped actor can update archived same-Group record after upgrade');
SELECT lives_ok($$ UPDATE public.personnel_trainings SET notes = 'forbidden after upgrade' WHERE id = 'b7000000-0000-4000-8000-000000000503' $$,
                'unassigned historical row cannot be updated after upgrade');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings WHERE notes = 'forbidden after upgrade'), 0,
          'unassigned historical row remains unchanged');
SELECT * FROM finish();
ROLLBACK;
