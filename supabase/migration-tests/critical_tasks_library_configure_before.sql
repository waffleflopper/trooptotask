-- A retained member and task exist before the configure-scope repair.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260929000100') THEN
    RAISE EXCEPTION 'Critical Tasks library fixture requires the preceding schema';
  END IF;
END;
$$;
INSERT INTO auth.users (id, email) VALUES
  ('e8100000-0000-4000-8000-000000000001', 'critical-library-upgrade@example.test');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES (
  'b9000000-0000-4000-8000-000000000101', 'e8100000-0000-4000-8000-000000000001',
  'member', 'viewer', '{"criticalTasks":"configure","personnel":"none"}',
  'organization', ARRAY[]::uuid[]
);
CREATE TABLE upgrade_fixture.critical_tasks_library_before AS
SELECT id, task_code, title, archived_at
FROM public.ict_tasks WHERE id = 'b9000000-0000-4000-8000-000000000401';
CREATE TABLE upgrade_fixture.critical_tasks_defaults_before AS
SELECT id, archive_retention_months, loss_warning_window_days,
       critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days
FROM public.organizations WHERE id = 'b9000000-0000-4000-8000-000000000101';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e8100000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF public.can_manage_ict_task_library('b9000000-0000-4000-8000-000000000101') THEN
    RAISE EXCEPTION 'Pre-upgrade library write policy unexpectedly admits configure member';
  END IF;
END;
$$;
RESET ROLE;
COMMIT;
