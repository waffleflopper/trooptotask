-- Verify preserved rows and the repaired Critical Tasks-only read path.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20260926000400'),
          1, 'Critical Tasks read-scope migration was recorded by the local runner');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
  WHERE p.oid IN (
    'public.latest_active_personnel_ict_completions(uuid,uuid[],uuid[])'::regprocedure,
    'public.active_personnel_ict_completion_trend(uuid,uuid[],uuid[])'::regprocedure
  ) AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
), 'upgrade removes PUBLIC execute from Critical Tasks definer RPCs');
CREATE TEMP TABLE critical_tasks_current_rows AS
SELECT 'auth.users'::text AS table_name, id AS row_id, to_jsonb(row_value) AS row_data
  FROM auth.users AS row_value WHERE id = 'b9000000-0000-4000-8000-000000000001'
UNION ALL
SELECT 'public.organizations', id, to_jsonb(row_value) FROM public.organizations AS row_value WHERE id IN ('b9000000-0000-4000-8000-000000000101','b9000000-0000-4000-8000-000000000102')
UNION ALL
SELECT 'public.groups', id, to_jsonb(row_value) FROM public.groups AS row_value WHERE id = 'b9000000-0000-4000-8000-000000000201'
UNION ALL
SELECT 'public.organization_memberships', id, to_jsonb(row_value) FROM public.organization_memberships AS row_value WHERE organization_id = 'b9000000-0000-4000-8000-000000000101' AND user_id = 'b9000000-0000-4000-8000-000000000001'
UNION ALL
SELECT 'public.personnel', id, to_jsonb(row_value) FROM public.personnel AS row_value WHERE id IN ('b9000000-0000-4000-8000-000000000301','b9000000-0000-4000-8000-000000000302')
UNION ALL
SELECT 'public.ict_tasks', id, to_jsonb(row_value) FROM public.ict_tasks AS row_value WHERE id IN ('b9000000-0000-4000-8000-000000000401','b9000000-0000-4000-8000-000000000402')
UNION ALL
SELECT 'public.personnel_ict_completions', id, to_jsonb(row_value) FROM public.personnel_ict_completions AS row_value WHERE id IN ('b9000000-0000-4000-8000-000000000501','b9000000-0000-4000-8000-000000000502','b9000000-0000-4000-8000-000000000503');
SELECT is((SELECT count(*)::integer FROM critical_tasks_current_rows), 12, 'all historical Critical Tasks rows remain');
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM critical_tasks_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.critical_tasks_before_rows ORDER BY table_name, row_id $$,
  'migration preserves exact Auth, membership, Personnel, task and completion identities and values');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b9000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'Critical Tasks-only actor still cannot SELECT Personnel');
SELECT is((SELECT count(*)::integer FROM public.personnel_ict_completions), 1, 'strict Group scope hides historical unassigned completion');
SELECT is((SELECT id FROM public.latest_active_personnel_ict_completions('b9000000-0000-4000-8000-000000000101')),
          'b9000000-0000-4000-8000-000000000501'::uuid, 'latest RPC returns same-Group completion without Personnel SELECT');
SELECT is((SELECT completions FROM public.active_personnel_ict_completion_trend('b9000000-0000-4000-8000-000000000101') WHERE month = '2026-06'),
          1, 'trend RPC excludes historical unassigned completion');
SELECT * FROM finish();
ROLLBACK;
