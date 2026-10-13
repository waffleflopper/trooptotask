-- Saved feature rows survive the upgrade and keep their operate workflows.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok((SELECT migration_absent AND legacy_helper_present FROM upgrade_fixture.feature_writes_baseline),
  'saved rows preceded the migration while the legacy full-editor helper existed');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version='20261012000600'),1,
  'feature direct-write migration is recorded after populated upgrade');
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.feature_writes_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.feature_writes_before_rows ORDER BY table_name,row_id $$,
  'the upgrade keeps saved Personnel, counseling paths, packets, notes and requests');
SELECT ok(to_regprocedure('public.is_full_editor_for_org(uuid)') IS NULL, 'the legacy full-editor helper is removed');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f4600000-0000-4000-8000-000000000002',true);
SELECT throws_ok(
  $$ UPDATE public.personnel SET archived_at=now() WHERE id='f4600000-0000-4000-8000-000000000301' $$,
  '42501', NULL, 'an operate member cannot archive a saved Person directly');
WITH removed AS (
  DELETE FROM public.personnel WHERE id='f4600000-0000-4000-8000-000000000302' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed),0,'an operate member cannot permanently delete a saved archived Person');
WITH changed AS (
  UPDATE public.onboarding_step_progress SET completed=true WHERE id='f4600000-0000-4000-8000-000000000711' RETURNING id
) SELECT is((SELECT count(*)::integer FROM changed),1,'an operate member still records saved step progress');
SELECT is(
  public.append_onboarding_step_note('f4600000-0000-4000-8000-000000000101','f4600000-0000-4000-8000-000000000711','After upgrade')
    -> 'notes' -> 1 ->> 'userId',
  'f4600000-0000-4000-8000-000000000002',
  'the append command adds a caller note after a saved note');
SELECT throws_ok(
  $$ UPDATE public.onboarding_step_progress SET notes='[]' WHERE id='f4600000-0000-4000-8000-000000000711' $$,
  '42501', NULL, 'saved notes cannot be replaced directly');
SELECT set_config('request.jwt.claim.sub','f4600000-0000-4000-8000-000000000001',true);
WITH changed AS (
  UPDATE public.counseling_records SET title='Edited legacy path' WHERE id='f4600000-0000-4000-8000-000000000501' RETURNING id
) SELECT is((SELECT count(*)::integer FROM changed),1,'a saved counseling path outside the bound prefix stays editable');
WITH removed AS (
  DELETE FROM public.personnel WHERE id='f4600000-0000-4000-8000-000000000302' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed),1,'the owner permanently deletes a saved archived Person');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ SELECT public.approve_record_deletion_request('f4600000-0000-4000-8000-000000000101',
    'f4600000-0000-4000-8000-000000000801','personnel_training','f4600000-0000-4000-8000-000000000899',
    'f4600000-0000-4000-8000-000000000001','2030-02-01T00:00:00Z') $$,
  'P0002', 'Deletion target not found', 'a saved request for a missing record cannot be approved');
RESET ROLE;
SELECT is((SELECT status FROM public.deletion_requests WHERE id='f4600000-0000-4000-8000-000000000801'),'pending',
  'the saved request stays pending for review');
SELECT * FROM finish();
ROLLBACK;
