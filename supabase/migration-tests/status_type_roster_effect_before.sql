-- Saved status types before each one gets a duty roster effect.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261022000300') THEN
    RAISE EXCEPTION 'Status type roster effect fixture requires the preceding schema';
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('e1726000-0000-4000-8000-000000000001', 'status-effect-config@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e1726000-0000-4000-8000-000000000101', 'Status Effect Alpha', 'e1726000-0000-4000-8000-000000000001'),
  ('e1726000-0000-4000-8000-000000000102', 'Status Effect Bravo', 'e1726000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  ('e1726000-0000-4000-8000-000000000301', 'e1726000-0000-4000-8000-000000000101',
   'SPC', 'Status', 'Person', 'status-effect-upgrade');
INSERT INTO public.status_types (id, organization_id, name, color, text_color, sort_order) VALUES
  ('e1726000-0000-4000-8000-000000000501', 'e1726000-0000-4000-8000-000000000101', 'Leave', '#2563eb', '#ffffff', 0),
  ('e1726000-0000-4000-8000-000000000502', 'e1726000-0000-4000-8000-000000000101', 'Appointment', '#f59e0b', '#1c1b19', 1),
  ('e1726000-0000-4000-8000-000000000511', 'e1726000-0000-4000-8000-000000000102', 'Bravo School', '#16a34a', '#ffffff', 0);
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date, note) VALUES
  ('e1726000-0000-4000-8000-000000000601', 'e1726000-0000-4000-8000-000000000101',
   'e1726000-0000-4000-8000-000000000301', 'e1726000-0000-4000-8000-000000000501', '2030-02-01', '2030-02-03', 'Block leave');

CREATE TABLE upgrade_fixture.status_type_roster_effect_before_rows (
  table_name text NOT NULL, row_id uuid NOT NULL, row_data jsonb NOT NULL,
  PRIMARY KEY (table_name, row_id)
);
INSERT INTO upgrade_fixture.status_type_roster_effect_before_rows
SELECT 'status_types', id, to_jsonb(row_value) FROM public.status_types AS row_value
  WHERE organization_id::text LIKE 'e1726000-%'
UNION ALL
SELECT 'availability_entries', id, to_jsonb(row_value) FROM public.availability_entries AS row_value
  WHERE organization_id::text LIKE 'e1726000-%';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.status_type_roster_effect_before_rows) <> 4 THEN
    RAISE EXCEPTION 'Status type roster effect upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
