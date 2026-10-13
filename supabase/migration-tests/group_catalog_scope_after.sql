-- Saved scoped memberships read and write Groups by scope after upgrade.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok((SELECT migration_absent AND scoped_member_could_view_every_group AND scoped_configurer_could_manage_groups
  FROM upgrade_fixture.group_catalog_baseline),
  'saved rows preceded the migration while a Group-scoped configurer could read and manage every Group');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version='20261012000700'),1,
  'Group catalog scope migration is recorded after populated upgrade');
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.group_catalog_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.group_catalog_before_rows ORDER BY table_name,row_id $$,
  'the upgrade keeps saved Groups and memberships');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c1383000-0000-4000-8000-000000000002',true);
SELECT is(ARRAY(SELECT name FROM public.groups WHERE organization_id='c1383000-0000-4000-8000-000000000101' ORDER BY name),
  ARRAY['Upgrade One'],
  'a saved Group-scoped configurer reads only its allowed Group');
SELECT throws_ok($$ INSERT INTO public.groups(organization_id,name)
  VALUES ('c1383000-0000-4000-8000-000000000101','Upgrade Denied') $$,
  '42501', NULL, 'a saved Group-scoped configurer cannot create a Group');
WITH changed AS (
  UPDATE public.groups SET name='Upgrade Renamed' WHERE id='c1383000-0000-4000-8000-000000000201' RETURNING id
) SELECT is((SELECT count(*)::integer FROM changed),0,'a saved Group-scoped configurer cannot rename a Group');
SELECT set_config('request.jwt.claim.sub','c1383000-0000-4000-8000-000000000004',true);
SELECT is((SELECT count(*)::integer FROM public.groups WHERE organization_id='c1383000-0000-4000-8000-000000000101'),0,
  'a saved empty Group scope reads no Groups');
SELECT set_config('request.jwt.claim.sub','c1383000-0000-4000-8000-000000000003',true);
SELECT is(ARRAY(SELECT name FROM public.groups WHERE organization_id='c1383000-0000-4000-8000-000000000101' ORDER BY name),
  ARRAY['Upgrade One','Upgrade Two'],
  'a saved Organization-wide configurer keeps the full catalog');
RESET ROLE;
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.group_catalog_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.group_catalog_before_rows ORDER BY table_name,row_id $$,
  'denied upgraded writes leave saved Groups unchanged');
SELECT * FROM finish();
ROLLBACK;
