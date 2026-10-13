-- Saved suspensions deny direct access after upgrade without changing saved rows.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok((SELECT migration_absent AND suspended_owner_was_admitted FROM upgrade_fixture.suspension_admission_baseline),
  'saved rows preceded the migration while a suspended Organization owner was still admitted');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version='20261012000500'),1,
  'suspension admission migration is recorded after populated upgrade');
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.suspension_admission_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.suspension_admission_before_rows ORDER BY table_name,row_id $$,
  'the upgrade keeps saved Organizations, memberships, personnel and suspensions');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c6422000-0000-4000-8000-000000000001',true);
SELECT is(
  ARRAY[
    (SELECT count(*) FROM public.personnel WHERE organization_id='c6422000-0000-4000-8000-000000000101'),
    (SELECT count(*) FROM public.organizations WHERE id='c6422000-0000-4000-8000-000000000101'),
    (SELECT count(*) FROM public.organization_memberships WHERE organization_id='c6422000-0000-4000-8000-000000000101')
  ],
  ARRAY[0,1,1]::bigint[],
  'a saved Organization suspension denies lane reads and keeps the shell reads');
SELECT set_config('request.jwt.claim.sub','c6422000-0000-4000-8000-000000000003',true);
SELECT is(
  ARRAY[
    (SELECT count(*) FROM public.personnel WHERE organization_id='c6422000-0000-4000-8000-000000000102'),
    (SELECT count(*) FROM public.organization_memberships WHERE organization_id='c6422000-0000-4000-8000-000000000102')
  ],
  ARRAY[0,1]::bigint[],
  'a saved account suspension denies lane reads and the member roster');
WITH changed AS (
  UPDATE public.personnel SET first_name='Changed' WHERE id='c6422000-0000-4000-8000-000000000402' RETURNING id
) SELECT is((SELECT count(*)::integer FROM changed),0,'a saved account suspension denies direct updates');
SELECT set_config('request.jwt.claim.sub','c6422000-0000-4000-8000-000000000002',true);
SELECT is(
  ARRAY[
    (SELECT count(*) FROM public.personnel WHERE organization_id='c6422000-0000-4000-8000-000000000102'),
    (SELECT count(*) FROM public.organization_memberships WHERE organization_id='c6422000-0000-4000-8000-000000000102')
  ],
  ARRAY[1,2]::bigint[],
  'an active owner keeps lane reads and the member roster after upgrade');
RESET ROLE;
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.suspension_admission_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.suspension_admission_before_rows ORDER BY table_name,row_id $$,
  'denied upgraded writes leave saved rows unchanged');
SELECT * FROM finish();
ROLLBACK;
