BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok((SELECT migration_absent FROM upgrade_fixture.directory_baseline),'directory migration was absent from the populated predecessor');
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.directory_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.directory_before_rows ORDER BY table_name,row_id $$,
  'the upgrade keeps saved Organizations, memberships and personnel');
SELECT results_eq(
  $$ SELECT name,status,member_count,personnel_count,owner_email FROM public.platform_list_organizations('Directory','all',1,25) ORDER BY name $$,
  $$ VALUES ('Directory Active'::text,'active'::text,2::bigint,1::bigint,'directory-upgrade-2@example.test'::text),
    ('Directory Suspended','suspended',1,0,'directory-upgrade-1@example.test') $$,
  'the list reads saved Organizations, including the suspended one');
SELECT is(public.platform_organization_detail('c6425000-0000-4000-8000-000000000101')->'suspension','null'::jsonb,
  'an Organization suspended before the upgrade has no recorded reason');
SELECT * FROM finish();
ROLLBACK;
