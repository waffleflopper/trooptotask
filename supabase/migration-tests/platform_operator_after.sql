BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok((SELECT migration_absent FROM upgrade_fixture.platform_operator_baseline),'operator migration was absent from the populated predecessor');
SELECT results_eq($$SELECT user_id,created_at FROM public.platform_operators ORDER BY user_id$$,
 $$SELECT user_id,created_at FROM upgrade_fixture.platform_operator_before ORDER BY user_id$$,
 'operator migration preserves every saved user identity and creation time');
SELECT is(to_regprocedure('public.is_platform_admin()'),NULL::regprocedure,'retired platform authority function is gone');
SELECT is(to_regprocedure('public.is_super_admin()'),NULL::regprocedure,'retired role authority function is gone');
SELECT is(to_regprocedure('public.platform_promote_org_member(uuid,uuid,uuid)'),NULL::regprocedure,'member-promotion command is gone');
SELECT * FROM finish();
ROLLBACK;
