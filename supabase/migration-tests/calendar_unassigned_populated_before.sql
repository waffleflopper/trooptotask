-- Saved Calendar rows from the preceding schema, including unassigned People.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260926000600') THEN
    RAISE EXCEPTION 'Calendar scope fixture requires the preceding schema';
  END IF;
END;
$$;
INSERT INTO auth.users (id, email) VALUES
  ('d5000000-0000-4000-8000-000000000001', 'calendar-upgrade-group@example.test'),
  ('d5000000-0000-4000-8000-000000000002', 'calendar-upgrade-org@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('d5000000-0000-4000-8000-000000000101', 'Calendar Upgrade', 'd5000000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('d5000000-0000-4000-8000-000000000201', 'd5000000-0000-4000-8000-000000000101', 'Alpha');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('d5000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000001', 'member', 'viewer', '{"calendar":"operate","personnel":"none"}', 'groups', ARRAY['d5000000-0000-4000-8000-000000000201']::uuid[]),
  ('d5000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000002', 'member', 'viewer', '{"calendar":"operate","personnel":"none"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  ('d5000000-0000-4000-8000-000000000301', 'd5000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000201', 'SPC', 'Alpha', 'Person', 'calendar-upgrade-alpha'),
  ('d5000000-0000-4000-8000-000000000302', 'd5000000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Person', 'calendar-upgrade-unassigned');
INSERT INTO public.status_types (id, organization_id, name, color, text_color) VALUES
  ('d5000000-0000-4000-8000-000000000401', 'd5000000-0000-4000-8000-000000000101', 'Available', '#ffffff', '#000000');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to) VALUES
  ('d5000000-0000-4000-8000-000000000402', 'd5000000-0000-4000-8000-000000000101', 'Duty', 'D', 'personnel');
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date) VALUES
  ('d5000000-0000-4000-8000-000000000501', 'd5000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000301', 'd5000000-0000-4000-8000-000000000401', '2030-01-01', '2030-01-02'),
  ('d5000000-0000-4000-8000-000000000502', 'd5000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000302', 'd5000000-0000-4000-8000-000000000401', '2030-01-01', '2030-01-02');
INSERT INTO public.daily_assignments (id, organization_id, assignment_type_id, date, assignee_id) VALUES
  ('d5000000-0000-4000-8000-000000000601', 'd5000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000402', '2030-01-01', 'd5000000-0000-4000-8000-000000000301'),
  ('d5000000-0000-4000-8000-000000000602', 'd5000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000402', '2030-01-02', 'd5000000-0000-4000-8000-000000000302');

CREATE TABLE upgrade_fixture.calendar_unassigned_before_rows (
  table_name text NOT NULL, row_id uuid NOT NULL, row_data jsonb NOT NULL,
  PRIMARY KEY (table_name, row_id)
);
INSERT INTO upgrade_fixture.calendar_unassigned_before_rows
SELECT 'auth.users', id, to_jsonb(row_value) FROM auth.users AS row_value WHERE id IN ('d5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002')
UNION ALL
SELECT 'public.organizations', id, to_jsonb(row_value) FROM public.organizations AS row_value WHERE id = 'd5000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.groups', id, to_jsonb(row_value) FROM public.groups AS row_value WHERE id = 'd5000000-0000-4000-8000-000000000201'
UNION ALL
SELECT 'public.organization_memberships', id, to_jsonb(row_value) FROM public.organization_memberships AS row_value WHERE organization_id = 'd5000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel', id, to_jsonb(row_value) FROM public.personnel AS row_value WHERE id IN ('d5000000-0000-4000-8000-000000000301','d5000000-0000-4000-8000-000000000302')
UNION ALL
SELECT 'public.status_types', id, to_jsonb(row_value) FROM public.status_types AS row_value WHERE id = 'd5000000-0000-4000-8000-000000000401'
UNION ALL
SELECT 'public.assignment_types', id, to_jsonb(row_value) FROM public.assignment_types AS row_value WHERE id = 'd5000000-0000-4000-8000-000000000402'
UNION ALL
SELECT 'public.availability_entries', id, to_jsonb(row_value) FROM public.availability_entries AS row_value WHERE id IN ('d5000000-0000-4000-8000-000000000501','d5000000-0000-4000-8000-000000000502')
UNION ALL
SELECT 'public.daily_assignments', id, to_jsonb(row_value) FROM public.daily_assignments AS row_value WHERE id IN ('d5000000-0000-4000-8000-000000000601','d5000000-0000-4000-8000-000000000602');
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.calendar_unassigned_before_rows) <> 14 THEN
    RAISE EXCEPTION 'Calendar upgrade fixture is incomplete';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.personnel) <> 0
     OR (SELECT count(*) FROM public.availability_entries) <> 2
     OR (SELECT count(*) FROM public.daily_assignments) <> 2 THEN
    RAISE EXCEPTION 'Pre-upgrade Calendar scope behavior changed';
  END IF;
END;
$$;
RESET ROLE;
COMMIT;
