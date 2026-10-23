-- Saved daily assignments before each one records whether a person or the roster placed it.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261022000400') THEN
    RAISE EXCEPTION 'Daily assignment source fixture requires the preceding schema';
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('e1727000-0000-4000-8000-000000000001', 'assignment-source@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e1727000-0000-4000-8000-000000000101', 'Assignment Source', 'e1727000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  ('e1727000-0000-4000-8000-000000000301', 'e1727000-0000-4000-8000-000000000101',
   'SPC', 'Source', 'Person', 'assignment-source-upgrade');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('e1727000-0000-4000-8000-000000000201', 'e1727000-0000-4000-8000-000000000101', 'Source Group');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to) VALUES
  ('e1727000-0000-4000-8000-000000000401', 'e1727000-0000-4000-8000-000000000101', 'Staff Duty', 'SD', 'personnel'),
  ('e1727000-0000-4000-8000-000000000402', 'e1727000-0000-4000-8000-000000000101', 'Gate Guard', 'GG', 'group');
INSERT INTO public.daily_assignments (id, organization_id, assignment_type_id, date, assignee_id) VALUES
  ('e1727000-0000-4000-8000-000000000501', 'e1727000-0000-4000-8000-000000000101',
   'e1727000-0000-4000-8000-000000000401', '2030-05-01', 'e1727000-0000-4000-8000-000000000301'),
  ('e1727000-0000-4000-8000-000000000502', 'e1727000-0000-4000-8000-000000000101',
   'e1727000-0000-4000-8000-000000000402', '2030-05-01', 'e1727000-0000-4000-8000-000000000201');

CREATE TABLE upgrade_fixture.daily_assignment_source_before_rows (
  row_id uuid PRIMARY KEY, row_data jsonb NOT NULL
);
INSERT INTO upgrade_fixture.daily_assignment_source_before_rows
SELECT id, to_jsonb(row_value) FROM public.daily_assignments AS row_value
  WHERE organization_id = 'e1727000-0000-4000-8000-000000000101';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.daily_assignment_source_before_rows) <> 2 THEN
    RAISE EXCEPTION 'Daily assignment source upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
