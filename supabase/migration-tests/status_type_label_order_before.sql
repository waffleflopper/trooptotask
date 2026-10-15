-- Saved status types before the one-day label and the order command.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261016000100') THEN
    RAISE EXCEPTION 'Status type label and order fixture requires the preceding schema';
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('e1684000-0000-4000-8000-000000000001', 'status-order-config@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e1684000-0000-4000-8000-000000000101', 'Status Order Alpha', 'e1684000-0000-4000-8000-000000000001'),
  ('e1684000-0000-4000-8000-000000000102', 'Status Order Bravo', 'e1684000-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('e1684000-0000-4000-8000-000000000101', 'e1684000-0000-4000-8000-000000000001',
   'member', 'viewer', '{"calendar":"configure","personnel":"none"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  ('e1684000-0000-4000-8000-000000000301', 'e1684000-0000-4000-8000-000000000101',
   'SPC', 'Status', 'Person', 'status-order-upgrade');
-- Types created before append-on-create all stored sort_order 0.
INSERT INTO public.status_types (id, organization_id, name, color, text_color, sort_order) VALUES
  ('e1684000-0000-4000-8000-000000000501', 'e1684000-0000-4000-8000-000000000101', 'Leave', '#2563eb', '#ffffff', 0),
  ('e1684000-0000-4000-8000-000000000502', 'e1684000-0000-4000-8000-000000000101', 'Sick', '#dc2626', '#ffffff', 0),
  ('e1684000-0000-4000-8000-000000000503', 'e1684000-0000-4000-8000-000000000101', 'Appointment', '#f59e0b', '#1c1b19', 0),
  ('e1684000-0000-4000-8000-000000000511', 'e1684000-0000-4000-8000-000000000102', 'Bravo School', '#16a34a', '#ffffff', 2),
  ('e1684000-0000-4000-8000-000000000512', 'e1684000-0000-4000-8000-000000000102', 'Bravo Leave', '#2563eb', '#ffffff', 1);
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date, note) VALUES
  ('e1684000-0000-4000-8000-000000000601', 'e1684000-0000-4000-8000-000000000101',
   'e1684000-0000-4000-8000-000000000301', 'e1684000-0000-4000-8000-000000000502', '2030-02-01', '2030-02-03', 'Flu');

CREATE TABLE upgrade_fixture.status_type_label_order_before_rows (
  table_name text NOT NULL, row_id uuid NOT NULL, row_data jsonb NOT NULL,
  PRIMARY KEY (table_name, row_id)
);
INSERT INTO upgrade_fixture.status_type_label_order_before_rows
SELECT 'status_types', id, to_jsonb(row_value) FROM public.status_types AS row_value
  WHERE organization_id::text LIKE 'e1684000-%'
UNION ALL
SELECT 'availability_entries', id, to_jsonb(row_value) FROM public.availability_entries AS row_value
  WHERE organization_id::text LIKE 'e1684000-%';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.status_type_label_order_before_rows) <> 6 THEN
    RAISE EXCEPTION 'Status type label and order upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
