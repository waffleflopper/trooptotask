-- The upgrade grants only Organization-scoped Critical Tasks configuration.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20260929000100'),
  1, 'Critical Tasks configure migration was applied');
SELECT results_eq(
  $$ SELECT id, task_code, title, archived_at FROM public.ict_tasks
     WHERE id = 'b9000000-0000-4000-8000-000000000401' $$,
  $$ SELECT id, task_code, title, archived_at FROM upgrade_fixture.critical_tasks_library_before $$,
  'retained task identity and values survive migration');
SELECT results_eq(
  $$ SELECT id, archive_retention_months, loss_warning_window_days,
            critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days
     FROM public.organizations WHERE id = 'b9000000-0000-4000-8000-000000000101' $$,
  $$ SELECT * FROM upgrade_fixture.critical_tasks_defaults_before $$,
  'retained Organization policy and Critical Tasks defaults survive migration');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
  WHERE p.oid IN (
    'public.can_manage_ict_task_library(uuid)'::regprocedure,
    'public.set_critical_tasks_defaults(uuid,integer,integer)'::regprocedure
  ) AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
), 'neither security definer helper permits PUBLIC execution');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e8100000-0000-4000-8000-000000000001', true);
SELECT ok(public.can_manage_ict_task_library('b9000000-0000-4000-8000-000000000101'),
  'existing member gains only its approved configure lane');
SELECT lives_ok($$ INSERT INTO public.ict_tasks (organization_id, task_code, title)
  VALUES ('b9000000-0000-4000-8000-000000000101', 'UPGRADE-NEW', 'Upgrade new') $$,
  'member can create a library task after upgrade');
SELECT lives_ok($$ SELECT public.set_critical_tasks_defaults(
  'b9000000-0000-4000-8000-000000000101', 18, 45) $$,
  'member can save Critical Tasks defaults after upgrade');
RESET ROLE;
SELECT is((SELECT archive_retention_months FROM public.organizations
  WHERE id = 'b9000000-0000-4000-8000-000000000101'),
  (SELECT archive_retention_months FROM upgrade_fixture.critical_tasks_defaults_before),
  'unrelated retention policy remains unchanged');
SELECT is((SELECT loss_warning_window_days FROM public.organizations
  WHERE id = 'b9000000-0000-4000-8000-000000000101'),
  (SELECT loss_warning_window_days FROM upgrade_fixture.critical_tasks_defaults_before),
  'unrelated loss warning remains unchanged');
SELECT * FROM finish();
ROLLBACK;
