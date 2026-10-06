-- Installation preserves every saved field before the new operation is used.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok((SELECT migration_absent AND rpc_absent FROM upgrade_fixture.deletion_request_cancellation_baseline),
  'populated requests and source sentinels preceded this migration and RPC');
SELECT is((SELECT direct_update_count FROM upgrade_fixture.deletion_request_cancellation_baseline),0,
  'pre-upgrade ordinary requester could not UPDATE its own pending request');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version='20261003000100'),1,
  'cancellation migration is recorded after populated upgrade');
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.deletion_request_cancellation_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.deletion_request_cancellation_before_rows ORDER BY table_name,row_id $$,
  'migration preserves the exact A/B history, all source values and file metadata');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1803000-0000-4000-8000-000000000001',true);
SELECT is(public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000801'),true,
  'upgraded ordinary requester cancels its saved pending request');
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000811') $$,
  'P0002','Pending deletion request not found','dual membership does not make a B request an A target');
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000802') $$,
  'P0002','Pending deletion request not found','upgraded cancellation cannot overwrite approved history');
RESET ROLE;
SELECT results_eq(
  $$ SELECT table_name,row_id,row_data-'status' FROM upgrade_fixture.deletion_request_cancellation_current_rows
    WHERE table_name='deletion_requests' ORDER BY row_id $$,
  $$ SELECT table_name,row_id,row_data-'status' FROM upgrade_fixture.deletion_request_cancellation_before_rows
    WHERE table_name='deletion_requests' ORDER BY row_id $$,
  'successful upgraded cancellation retains every request field except status');
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.deletion_request_cancellation_current_rows
    WHERE table_name<>'deletion_requests' OR row_id<>'d1803000-0000-4000-8000-000000000801' ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.deletion_request_cancellation_before_rows
    WHERE table_name<>'deletion_requests' OR row_id<>'d1803000-0000-4000-8000-000000000801' ORDER BY table_name,row_id $$,
  'upgraded cancellation changes no neighboring history, source or file metadata');
SELECT is((SELECT status FROM public.deletion_requests WHERE id='d1803000-0000-4000-8000-000000000801'),'cancelled',
  'the retained upgraded row has cancelled status');
SELECT * FROM finish();
ROLLBACK;
