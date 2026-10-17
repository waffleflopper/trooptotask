-- Saved assignment types before Calendar lanes replace the single date header.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261015000100') THEN
    RAISE EXCEPTION 'Calendar lanes fixture requires the preceding schema';
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('e1683000-0000-4000-8000-000000000001', 'calendar-lanes-config@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e1683000-0000-4000-8000-000000000101', 'Lanes Header', 'e1683000-0000-4000-8000-000000000001'),
  ('e1683000-0000-4000-8000-000000000102', 'Lanes No Header', 'e1683000-0000-4000-8000-000000000001'),
  ('e1683000-0000-4000-8000-000000000103', 'Lanes Archived Header', 'e1683000-0000-4000-8000-000000000001'),
  ('e1683000-0000-4000-8000-000000000104', 'Lanes No Types', 'e1683000-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('e1683000-0000-4000-8000-000000000101', 'e1683000-0000-4000-8000-000000000001',
   'member', 'viewer', '{"calendar":"configure","personnel":"none"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  ('e1683000-0000-4000-8000-000000000301', 'e1683000-0000-4000-8000-000000000101',
   'SPC', 'Lane', 'Person', 'calendar-lanes-upgrade');
INSERT INTO public.assignment_types (
  id, organization_id, name, short_name, assign_to, sort_order, show_in_date_header, archived_at, exempt_personnel_ids
) VALUES
  ('e1683000-0000-4000-8000-000000000501', 'e1683000-0000-4000-8000-000000000101', 'Header', 'HDR', 'personnel', 5, true, NULL, '{}'),
  ('e1683000-0000-4000-8000-000000000502', 'e1683000-0000-4000-8000-000000000101', 'First', 'FST', 'personnel', 1, false, NULL,
   ARRAY['e1683000-0000-4000-8000-000000000301']),
  ('e1683000-0000-4000-8000-000000000503', 'e1683000-0000-4000-8000-000000000101', 'Tied Low Id', 'TLO', 'group', 3, false, NULL, '{}'),
  ('e1683000-0000-4000-8000-000000000504', 'e1683000-0000-4000-8000-000000000101', 'Tied High Id', 'THI', 'personnel', 3, false, NULL, '{}'),
  ('e1683000-0000-4000-8000-000000000511', 'e1683000-0000-4000-8000-000000000102', 'Bravo One', 'B1', 'personnel', 2, false, NULL, '{}'),
  ('e1683000-0000-4000-8000-000000000512', 'e1683000-0000-4000-8000-000000000102', 'Bravo Two', 'B2', 'personnel', 2, false, NULL, '{}'),
  ('e1683000-0000-4000-8000-000000000521', 'e1683000-0000-4000-8000-000000000103', 'Archived Header', 'AH', 'personnel', 0, true,
   '2026-01-01T00:00:00Z', '{}'),
  ('e1683000-0000-4000-8000-000000000522', 'e1683000-0000-4000-8000-000000000103', 'Charlie Active', 'CA', 'personnel', 4, false, NULL, '{}');
INSERT INTO public.daily_assignments (id, organization_id, assignment_type_id, date, assignee_id) VALUES
  ('e1683000-0000-4000-8000-000000000601', 'e1683000-0000-4000-8000-000000000101',
   'e1683000-0000-4000-8000-000000000501', '2030-02-01', 'e1683000-0000-4000-8000-000000000301'),
  ('e1683000-0000-4000-8000-000000000602', 'e1683000-0000-4000-8000-000000000101',
   'e1683000-0000-4000-8000-000000000502', '2030-02-01', 'e1683000-0000-4000-8000-000000000301');

CREATE TABLE upgrade_fixture.calendar_lanes_before_rows (
  table_name text NOT NULL, row_id uuid NOT NULL, row_data jsonb NOT NULL,
  PRIMARY KEY (table_name, row_id)
);
INSERT INTO upgrade_fixture.calendar_lanes_before_rows
SELECT 'assignment_types', id, to_jsonb(row_value) FROM public.assignment_types AS row_value
  WHERE organization_id::text LIKE 'e1683000-%'
UNION ALL
SELECT 'daily_assignments', id, to_jsonb(row_value) FROM public.daily_assignments AS row_value
  WHERE organization_id::text LIKE 'e1683000-%';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.calendar_lanes_before_rows) <> 10 THEN
    RAISE EXCEPTION 'Calendar lanes upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
