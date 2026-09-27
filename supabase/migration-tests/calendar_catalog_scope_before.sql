-- Seed saved Calendar facts, including a historical foreign-Organization
-- status reference, before the #1352 catalog/integrity migration.
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260926001300'
  ) THEN
    RAISE EXCEPTION 'Calendar catalog fixture requires the preceding schema';
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('e5000000-0000-4000-8000-000000000001', 'calendar-catalog-operator@example.test'),
  ('e5000000-0000-4000-8000-000000000002', 'calendar-catalog-group-config@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e5000000-0000-4000-8000-000000000101', 'Catalog Upgrade Alpha', 'e5000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000102', 'Catalog Upgrade Bravo', 'e5000000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('e5000000-0000-4000-8000-000000000201', 'e5000000-0000-4000-8000-000000000101', 'Alpha');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('e5000000-0000-4000-8000-000000000101', 'e5000000-0000-4000-8000-000000000001',
   'member', 'viewer', '{"calendar":"operate","personnel":"none"}',
   'organization', ARRAY[]::uuid[]),
  ('e5000000-0000-4000-8000-000000000101', 'e5000000-0000-4000-8000-000000000002',
   'member', 'viewer', '{"calendar":"configure","personnel":"none"}',
   'groups', ARRAY['e5000000-0000-4000-8000-000000000201']::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug)
VALUES ('e5000000-0000-4000-8000-000000000301', 'e5000000-0000-4000-8000-000000000101',
        'e5000000-0000-4000-8000-000000000201', 'SPC', 'Catalog', 'Person', 'calendar-catalog-upgrade');
INSERT INTO public.status_types (id, organization_id, name, color, text_color) VALUES
  ('e5000000-0000-4000-8000-000000000401', 'e5000000-0000-4000-8000-000000000101', 'Alpha Status', '#2563eb', '#ffffff'),
  ('e5000000-0000-4000-8000-000000000402', 'e5000000-0000-4000-8000-000000000102', 'Bravo Status', '#dc2626', '#ffffff');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to)
VALUES ('e5000000-0000-4000-8000-000000000501', 'e5000000-0000-4000-8000-000000000101',
        'Alpha Assignment', 'AA', 'personnel');
INSERT INTO public.special_days (id, organization_id, date, name, type)
VALUES ('e5000000-0000-4000-8000-000000000601', 'e5000000-0000-4000-8000-000000000101',
        '2030-05-01', 'Alpha Closure', 'org-closure');
INSERT INTO public.availability_entries (
  id, organization_id, personnel_id, status_type_id, start_date, end_date
) VALUES
  ('e5000000-0000-4000-8000-000000000701', 'e5000000-0000-4000-8000-000000000101',
   'e5000000-0000-4000-8000-000000000301', 'e5000000-0000-4000-8000-000000000401',
   '2030-05-01', '2030-05-02'),
  ('e5000000-0000-4000-8000-000000000702', 'e5000000-0000-4000-8000-000000000101',
   'e5000000-0000-4000-8000-000000000301', 'e5000000-0000-4000-8000-000000000402',
   '2030-05-03', '2030-05-04');

CREATE TABLE upgrade_fixture.calendar_catalog_before_rows (
  table_name text NOT NULL, row_id uuid NOT NULL, row_data jsonb NOT NULL,
  PRIMARY KEY (table_name, row_id)
);
INSERT INTO upgrade_fixture.calendar_catalog_before_rows
SELECT 'status_types', id, to_jsonb(row_value) FROM public.status_types AS row_value
  WHERE id IN ('e5000000-0000-4000-8000-000000000401', 'e5000000-0000-4000-8000-000000000402')
UNION ALL
SELECT 'assignment_types', id, to_jsonb(row_value) FROM public.assignment_types AS row_value
  WHERE id = 'e5000000-0000-4000-8000-000000000501'
UNION ALL
SELECT 'special_days', id, to_jsonb(row_value) FROM public.special_days AS row_value
  WHERE id = 'e5000000-0000-4000-8000-000000000601'
UNION ALL
SELECT 'availability_entries', id, to_jsonb(row_value) FROM public.availability_entries AS row_value
  WHERE id IN ('e5000000-0000-4000-8000-000000000701', 'e5000000-0000-4000-8000-000000000702');
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.calendar_catalog_before_rows) <> 6
     OR (SELECT count(*) FROM public.availability_entries
         WHERE id = 'e5000000-0000-4000-8000-000000000702'
           AND status_type_id = 'e5000000-0000-4000-8000-000000000402') <> 1 THEN
    RAISE EXCEPTION 'Calendar catalog upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
