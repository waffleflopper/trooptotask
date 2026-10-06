BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations
  WHERE version='20261006000100'),1,'the availability removal migration is recorded');
SELECT is((SELECT count(*)::integer FROM upgrade_fixture.availability_removal_current_rows),8,
  'the populated upgrade retains every saved fixture row');
SELECT results_eq(
  $$ SELECT table_name,row_id,row_data FROM upgrade_fixture.availability_removal_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT table_name,row_id,row_data FROM upgrade_fixture.availability_removal_before_rows ORDER BY table_name,row_id $$,
  'upgrade preserves complete saved identities, dates, nulls, notes and reference values');
SELECT ok(has_function_privilege('authenticated',
  'public.delete_availability_entries(uuid,uuid[])','EXECUTE'),
  'authenticated execution is available after populated upgrade');
SELECT ok(NOT has_function_privilege('anon',
  'public.delete_availability_entries(uuid,uuid[])','EXECUTE'),
  'populated upgrade does not grant anonymous execution');
SELECT ok(NOT has_function_privilege('service_role',
  'public.delete_availability_entries(uuid,uuid[])','EXECUTE'),
  'populated upgrade does not grant service execution');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e6110000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6110000-0000-4000-8000-000000000102',ARRAY['e6110000-0000-4000-8000-000000000502']::uuid[]
) $$,'42501','Calendar availability removal is not allowed',
  'an existing Calendar operator cannot delete in the foreign Organization after upgrade');
SELECT is(public.delete_availability_entries(
  'e6110000-0000-4000-8000-000000000101',ARRAY[
    'e6110000-0000-4000-8000-000000000501','e6110000-0000-4000-8000-000000000501',
    'e6110000-0000-4000-8000-000000000502','e6110000-0000-4000-8000-000000000999'
  ]::uuid[]
),1,'the upgraded RPC deletes the admitted historical row and counts it once');
SELECT is(public.delete_availability_entries(
  'e6110000-0000-4000-8000-000000000101',ARRAY['e6110000-0000-4000-8000-000000000501']::uuid[]
),0,'the upgraded operation is safe to replay');
RESET ROLE;
SELECT results_eq(
  $$ SELECT table_name,row_id,row_data FROM upgrade_fixture.availability_removal_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT table_name,row_id,row_data FROM upgrade_fixture.availability_removal_before_rows
     WHERE NOT (table_name='availability_entries' AND row_id='e6110000-0000-4000-8000-000000000501')
     ORDER BY table_name,row_id $$,
  'the upgraded deletion preserves every other saved row and field');
SELECT * FROM finish();
ROLLBACK;
