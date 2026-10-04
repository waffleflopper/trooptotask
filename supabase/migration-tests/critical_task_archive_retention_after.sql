BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT ok((SELECT migration_absent AND rpc_absent AND composite_fk_absent FROM upgrade_fixture.critical_task_archive_retention_baseline),'saved CT witnesses precede both the task-reference guard and retention RPC');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version='20261003000300'),1,'the CT retention migration is recorded by the upgrade');
SELECT results_eq($$ SELECT * FROM upgrade_fixture.critical_task_archive_retention_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.critical_task_archive_retention_before_rows ORDER BY table_name,row_id $$,'the additive upgrade preserves every saved actor, Organization, Personnel, task and completion field');
SELECT is((SELECT convalidated FROM pg_constraint WHERE conname='personnel_ict_completions_org_task_fkey'),false,'the composite task FK still preserves historical mismatches');
SELECT is((SELECT count(*)::integer FROM public.personnel_ict_completions AS completion JOIN public.ict_tasks AS task ON task.id=completion.ict_task_id
  WHERE completion.id='d2550000-0000-4000-8000-000000000502' AND completion.organization_id<>task.organization_id),1,'the saved foreign reference survives without weakening the upgraded guard');
SELECT ok(NOT prosecdef AND provolatile='v' AND prorettype='integer'::regtype AND proconfig @> ARRAY['search_path=""'],'the effective RPC is a volatile invoker with integer count and empty search path')
  FROM pg_proc WHERE oid='public.delete_expired_unreferenced_critical_tasks(uuid,timestamptz)'::regprocedure;
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_proc AS function_value,
    LATERAL aclexplode(COALESCE(function_value.proacl,acldefault('f',function_value.proowner))) AS grant_value
  WHERE function_value.oid='public.delete_expired_unreferenced_critical_tasks(uuid,timestamptz)'::regprocedure
    AND grant_value.grantee=0 AND grant_value.privilege_type='EXECUTE'
),'PUBLIC cannot execute the upgraded RPC');
SELECT ok(NOT has_function_privilege('anon','public.delete_expired_unreferenced_critical_tasks(uuid,timestamptz)','EXECUTE'),'anonymous role has no upgraded retention grant');
SELECT ok(NOT has_function_privilege('authenticated','public.delete_expired_unreferenced_critical_tasks(uuid,timestamptz)','EXECUTE'),'members have no upgraded retention grant');
SELECT ok(has_function_privilege('service_role','public.delete_expired_unreferenced_critical_tasks(uuid,timestamptz)','EXECUTE'),'service role has the upgraded retention grant');

SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.delete_expired_unreferenced_critical_tasks('d2550000-0000-4000-8000-000000000101','2025-05-30T12:00:00Z') $$,'42501',NULL,'anonymous execution rejects after upgrade');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.delete_expired_unreferenced_critical_tasks('d2550000-0000-4000-8000-000000000101','2025-05-30T12:00:00Z') $$,'42501',NULL,'member execution rejects after upgrade');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM upgrade_fixture.critical_task_archive_retention_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.critical_task_archive_retention_before_rows ORDER BY table_name,row_id $$,'denied calls leave the upgraded witnesses exact');

SET LOCAL ROLE service_role;
SELECT is(public.delete_expired_unreferenced_critical_tasks('d2550000-0000-4000-8000-000000000101','2025-05-30T12:00:00Z'),1,'service cleanup deletes only the expired unused Alpha task');
SELECT is(public.delete_expired_unreferenced_critical_tasks('d2550000-0000-4000-8000-000000000101','2025-05-30T12:00:00Z'),0,'upgraded Alpha cleanup replays with zero new deletions');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM upgrade_fixture.critical_task_archive_retention_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.critical_task_archive_retention_before_rows WHERE NOT (table_name='tasks' AND row_id='d2550000-0000-4000-8000-000000000401') ORDER BY table_name,row_id $$,'Alpha cleanup preserves active, cutoff, recent, both historical references and all Bravo rows exactly');

SET LOCAL ROLE service_role;
SELECT is(public.delete_expired_unreferenced_critical_tasks('d2550000-0000-4000-8000-000000000102','2025-05-30T12:00:00Z'),1,'the explicit Bravo operation deletes its unused expired task');
SELECT is(public.delete_expired_unreferenced_critical_tasks('d2550000-0000-4000-8000-000000000102','2025-05-30T12:00:00Z'),0,'upgraded Bravo cleanup replays with zero new deletions');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM upgrade_fixture.critical_task_archive_retention_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.critical_task_archive_retention_before_rows WHERE NOT (table_name='tasks' AND row_id IN ('d2550000-0000-4000-8000-000000000401','d2550000-0000-4000-8000-000000000407')) ORDER BY table_name,row_id $$,'both upgraded cleanups retain every other saved field and all three completions');
SELECT * FROM finish();
ROLLBACK;
