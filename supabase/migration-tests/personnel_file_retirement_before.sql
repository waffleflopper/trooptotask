-- Saved Personnel files before durable retirement. The after test deletes
-- these predecessor rows and proves each stored key follows its references.
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('f6431000-0000-4000-8000-000000000001', 'f643-owner@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('f6431000-0000-4000-8000-000000000101', 'F643 retained', 'f6431000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  ('f6431000-0000-4000-8000-000000000301', 'f6431000-0000-4000-8000-000000000101', 'SPC', 'Retained', 'Person', 'f643-retained-person');
INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by, archived_at) VALUES
  ('f6431000-0000-4000-8000-000000000501', 'f6431000-0000-4000-8000-000000000101', 'f6431000-0000-4000-8000-000000000301', 'Archived', 'f6431000-0000-4000-8000-000000000101/personnel/f6431000-0000-4000-8000-000000000301/documents/archived.pdf', 256, 'application/pdf', 'fixture', '2030-01-01T00:00:00Z'),
  ('f6431000-0000-4000-8000-000000000502', 'f6431000-0000-4000-8000-000000000101', 'f6431000-0000-4000-8000-000000000301', 'Shared archived', 'f6431000-0000-4000-8000-000000000101/personnel/f6431000-0000-4000-8000-000000000301/documents/shared.pdf', 256, 'application/pdf', 'fixture', '2030-01-01T00:00:00Z'),
  ('f6431000-0000-4000-8000-000000000503', 'f6431000-0000-4000-8000-000000000101', 'f6431000-0000-4000-8000-000000000301', 'Shared active', 'f6431000-0000-4000-8000-000000000101/personnel/f6431000-0000-4000-8000-000000000301/documents/shared.pdf', 256, 'application/pdf', 'fixture', NULL),
  ('f6431000-0000-4000-8000-000000000504', 'f6431000-0000-4000-8000-000000000101', 'f6431000-0000-4000-8000-000000000301', 'Legacy path', 'legacy/outside.pdf', 256, 'application/pdf', 'fixture', '2030-01-01T00:00:00Z');
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path, archived_at) VALUES
  ('f6431000-0000-4000-8000-000000000601', 'f6431000-0000-4000-8000-000000000101', 'f6431000-0000-4000-8000-000000000301', '2030-01-01', 'Retained subject', 'Archived counseling', 'fixture', 'f6431000-0000-4000-8000-000000000101/counseling-records/f6431000-0000-4000-8000-000000000301/archived.pdf', '2030-01-01T00:00:00Z');

CREATE VIEW upgrade_fixture.personnel_file_retirement_current_rows AS
SELECT 'public.personnel_documents'::text AS table_name, id::text AS row_id, to_jsonb(row_value) AS row_data
  FROM public.personnel_documents AS row_value WHERE id::text LIKE 'f6431000-%'
UNION ALL SELECT 'public.counseling_records', id::text, to_jsonb(row_value)
  FROM public.counseling_records AS row_value WHERE id::text LIKE 'f6431000-%';
CREATE TABLE upgrade_fixture.personnel_file_retirement_before_rows AS
  SELECT * FROM upgrade_fixture.personnel_file_retirement_current_rows;
CREATE TABLE upgrade_fixture.personnel_file_retirement_baseline AS
SELECT NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261013000100'
) AS migration_absent;
