-- Historical Critical Tasks rows before the independent read-scope migration.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260926000400') THEN
    RAISE EXCEPTION 'Critical Tasks upgrade fixture requires the preceding schema';
  END IF;
END;
$$;
INSERT INTO auth.users (id, email) VALUES
  ('b9000000-0000-4000-8000-000000000001', 'critical-upgrade@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('b9000000-0000-4000-8000-000000000101', 'Critical Upgrade', 'b9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000102', 'Foreign Task Organization', 'b9000000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('b9000000-0000-4000-8000-000000000201', 'b9000000-0000-4000-8000-000000000101', 'Alpha');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES (
  'b9000000-0000-4000-8000-000000000101', 'b9000000-0000-4000-8000-000000000001',
  'member', 'viewer', '{"criticalTasks":"operate","personnel":"none"}',
  'groups', ARRAY['b9000000-0000-4000-8000-000000000201']::uuid[]
);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, mos) VALUES
  ('b9000000-0000-4000-8000-000000000301', 'b9000000-0000-4000-8000-000000000101', 'b9000000-0000-4000-8000-000000000201', 'SPC', 'Active', 'Alpha', 'critical-upgrade-active', '68W'),
  ('b9000000-0000-4000-8000-000000000302', 'b9000000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Alpha', 'critical-upgrade-unassigned', '68W');
INSERT INTO public.ict_tasks (id, organization_id, task_code, title, mos) VALUES
  ('b9000000-0000-4000-8000-000000000401', 'b9000000-0000-4000-8000-000000000101', 'U-001', 'Existing task', ARRAY['68W']),
  ('b9000000-0000-4000-8000-000000000402', 'b9000000-0000-4000-8000-000000000102', 'U-002', 'Foreign task', ARRAY['68W']);
INSERT INTO public.personnel_ict_completions
  (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method) VALUES
  ('b9000000-0000-4000-8000-000000000501', 'b9000000-0000-4000-8000-000000000101', 'b9000000-0000-4000-8000-000000000301', 'b9000000-0000-4000-8000-000000000401', '2026-06-01', 'Practical Exercise'),
  ('b9000000-0000-4000-8000-000000000502', 'b9000000-0000-4000-8000-000000000101', 'b9000000-0000-4000-8000-000000000302', 'b9000000-0000-4000-8000-000000000401', '2026-06-02', 'Practical Exercise'),
  ('b9000000-0000-4000-8000-000000000503', 'b9000000-0000-4000-8000-000000000101', 'b9000000-0000-4000-8000-000000000302', 'b9000000-0000-4000-8000-000000000402', '2026-06-03', 'Practical Exercise');

CREATE TABLE upgrade_fixture.critical_tasks_before_rows (
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  row_data jsonb NOT NULL,
  PRIMARY KEY (table_name, row_id)
);
INSERT INTO upgrade_fixture.critical_tasks_before_rows
SELECT 'auth.users', id, to_jsonb(row_value) FROM auth.users AS row_value WHERE id = 'b9000000-0000-4000-8000-000000000001'
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
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.critical_tasks_before_rows) <> 12 THEN
    RAISE EXCEPTION 'Critical Tasks upgrade fixture is incomplete';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b9000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.personnel_ict_completions) <> 3 OR
     (SELECT count(*) FROM public.latest_active_personnel_ict_completions('b9000000-0000-4000-8000-000000000101')) <> 0 THEN
    RAISE EXCEPTION 'Pre-upgrade Critical Tasks policy/RPC behavior changed';
  END IF;
END;
$$;
RESET ROLE;
COMMIT;
