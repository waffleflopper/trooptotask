-- Run only after `supabase migration up --local` applies the three migrations to the
-- populated disposable project. No migration SQL is included or reapplied here.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations
           WHERE version IN ('20260923000100', '20260923000200', '20260926000100')),
          3, 'all three Account Setup migrations were recorded by the local migration runner');
CREATE TEMP TABLE current_rows AS
SELECT 'auth.users'::text AS table_name, id AS row_id, to_jsonb(row_value) AS row_data
  FROM auth.users AS row_value WHERE id = 'b4000000-0000-4000-8000-000000000001'
UNION ALL
SELECT 'public.platform_admins', id, to_jsonb(row_value)
  FROM public.platform_admins AS row_value WHERE id = 'b4000000-0000-4000-8000-000000000011'
UNION ALL
SELECT 'public.access_requests', id, to_jsonb(row_value)
  FROM public.access_requests AS row_value
  WHERE id IN ('b4000000-0000-4000-8000-000000000101', 'b4000000-0000-4000-8000-000000000102',
               'b4000000-0000-4000-8000-000000000103')
UNION ALL
SELECT 'public.account_setup_links', id, to_jsonb(row_value)
  FROM public.account_setup_links AS row_value
  WHERE id IN ('b4000000-0000-4000-8000-000000000201', 'b4000000-0000-4000-8000-000000000202',
               'b4000000-0000-4000-8000-000000000203');
SELECT is((SELECT count(*)::integer FROM current_rows), 8, 'all eight historical rows still exist');
SELECT is((SELECT count(*)::integer FROM public.account_setup_attempts
           WHERE setup_link_id IN ('b4000000-0000-4000-8000-000000000201',
                                   'b4000000-0000-4000-8000-000000000202')),
          0, 'historical unresolved Auth calls receive no invented witness');
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.before_rows ORDER BY table_name, row_id $$,
  'migration preserves exact Auth, staff, Access Request and setup-link identities and values');

SELECT ok(NOT has_table_privilege('authenticated', 'public.account_setup_links', 'UPDATE')
       AND NOT has_table_privilege('anon', 'public.account_setup_links', 'UPDATE'),
       'upgrade removes direct browser setup-link writes');
SELECT ok(has_table_privilege('authenticated', 'public.account_setup_links', 'SELECT')
       AND has_table_privilege('service_role', 'public.account_setup_links', 'UPDATE'),
       'upgrade keeps governed reads and service writes');
SELECT ok(has_function_privilege('service_role',
       'public.release_account_setup_claim_for_staff(uuid,uuid,uuid,text,text)', 'EXECUTE')
       AND NOT has_function_privilege('authenticated',
       'public.release_account_setup_claim_for_staff(uuid,uuid,uuid,text,text)', 'EXECUTE'),
       'staff release is callable only through the service role');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ UPDATE public.account_setup_links SET claimed_at = now()
  WHERE id = 'b4000000-0000-4000-8000-000000000203' $$,
  '42501', NULL, 'authenticated cannot mutate an upgraded setup link');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session(
  'b4000000-0000-4000-8000-000000000203',
  'b4000000-0000-4000-8000-000000000103',
  '2030-01-01T00:00:00Z')),
  'claim-in-progress', 'historical revoked held claim blocks the fresh same-email request');
SELECT is(public.reconcile_account_setup_claim(
  'b4000000-0000-4000-8000-000000000203',
  'b4000000-0000-4000-8000-000000000103')->>'state',
  'support-required', 'historical duplicate held claims cannot be self-reconciled');
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff(
  'b4000000-0000-4000-8000-000000000201',
  'b4000000-0000-4000-8000-000000000101',
  'b4000000-0000-4000-8000-000000000001', 'timeout', 'INC-12345') $$,
  '22023', NULL, 'elapsed time cannot release a historical held claim');
RESET ROLE;
SELECT results_eq(
  $$ SELECT id, to_jsonb(row_value) FROM public.account_setup_links AS row_value
     WHERE id IN ('b4000000-0000-4000-8000-000000000201',
                  'b4000000-0000-4000-8000-000000000202',
                  'b4000000-0000-4000-8000-000000000203') ORDER BY id $$,
  $$ SELECT row_id, row_data FROM upgrade_fixture.before_rows
     WHERE table_name = 'public.account_setup_links' ORDER BY row_id $$,
  'denied claim and release leave historical setup links unchanged');

SET LOCAL ROLE service_role;
SELECT ok(public.release_account_setup_claim_for_staff(
  'b4000000-0000-4000-8000-000000000201',
  'b4000000-0000-4000-8000-000000000101',
  'b4000000-0000-4000-8000-000000000001', 'provider-terminal', 'INC-12345'),
  'attested support operator can release the first historical claim');
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session(
  'b4000000-0000-4000-8000-000000000203',
  'b4000000-0000-4000-8000-000000000103',
  '2030-01-01T00:00:00Z')),
  'claim-in-progress', 'second historical held claim still blocks setup');
SELECT ok(public.release_account_setup_claim_for_staff(
  'b4000000-0000-4000-8000-000000000202',
  'b4000000-0000-4000-8000-000000000102',
  'b4000000-0000-4000-8000-000000000001', 'provider-quiescent', 'INC-12346'),
  'attested support operator can release the second historical claim');
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session(
  'b4000000-0000-4000-8000-000000000203',
  'b4000000-0000-4000-8000-000000000103',
  '2030-01-01T00:00:00Z')),
  'claim-started', 'fresh setup can claim only after both historical holds are released');
RESET ROLE;
SELECT is((SELECT state FROM public.account_setup_attempts
           WHERE setup_link_id = 'b4000000-0000-4000-8000-000000000203'),
          'started', 'new claims receive a durable Auth witness after upgrade');
SELECT ok((SELECT claimed_at IS NOT NULL AND failed_at IS NOT NULL
           AND failure_reason = 'operator-released' AND used_at IS NULL
           FROM public.account_setup_links
           WHERE id = 'b4000000-0000-4000-8000-000000000201'),
          'release preserves the first historical claim lineage');
SELECT is((SELECT count(*)::integer FROM public.audit_logs
           WHERE action = 'account_setup.claim_released_by_staff'
             AND resource_id IN ('b4000000-0000-4000-8000-000000000201',
                                 'b4000000-0000-4000-8000-000000000202')),
          2, 'each staff release writes one audit record');
SELECT * FROM finish();
ROLLBACK;
