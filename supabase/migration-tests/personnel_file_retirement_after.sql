-- Populated predecessor upgrade: saved rows are unchanged and unretired, and
-- deleting them afterward retires only owned keys with no other reference.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE FUNCTION pg_temp.doc(p_name text) RETURNS text LANGUAGE sql AS $$
  SELECT 'f6431000-0000-4000-8000-000000000101/personnel/f6431000-0000-4000-8000-000000000301/documents/' || p_name
$$;
CREATE FUNCTION pg_temp.retirement(p_bucket text, p_name text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN object_name IS NULL THEN 'removed' ELSE 'pending' END
  FROM organization_private.file_retirements
  WHERE key_digest = sha256(convert_to(p_bucket || '/' || p_name, 'UTF8'))
$$;

SELECT ok((SELECT migration_absent FROM upgrade_fixture.personnel_file_retirement_baseline),
  'saved Personnel files precede the new migration');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20261013000100'),
  1, 'new migration is recorded after populated upgrade');
SELECT is_empty($$
  (SELECT * FROM upgrade_fixture.personnel_file_retirement_before_rows
   EXCEPT SELECT * FROM upgrade_fixture.personnel_file_retirement_current_rows)
  UNION ALL
  (SELECT * FROM upgrade_fixture.personnel_file_retirement_current_rows
   EXCEPT SELECT * FROM upgrade_fixture.personnel_file_retirement_before_rows)
$$, 'saved documents and counseling records are unchanged');
SELECT is((SELECT count(*)::integer FROM organization_private.file_retirements
  WHERE object_name LIKE 'f6431000-%' OR object_name LIKE 'legacy/%'), 0, 'the migration retires no saved key');

DELETE FROM public.personnel_documents WHERE id IN (
  'f6431000-0000-4000-8000-000000000501', 'f6431000-0000-4000-8000-000000000502', 'f6431000-0000-4000-8000-000000000504');
DELETE FROM public.counseling_records WHERE id = 'f6431000-0000-4000-8000-000000000601';
SELECT is(
  ARRAY[
    pg_temp.retirement('personnel-documents', pg_temp.doc('archived.pdf')),
    pg_temp.retirement('counseling-files', 'f6431000-0000-4000-8000-000000000101/counseling-records/f6431000-0000-4000-8000-000000000301/archived.pdf'),
    pg_temp.retirement('personnel-documents', pg_temp.doc('shared.pdf')),
    pg_temp.retirement('personnel-documents', 'legacy/outside.pdf')
  ],
  ARRAY['pending', 'pending', NULL, NULL],
  'deleting saved rows retires their owned keys but keeps a shared key and never claims a legacy outside path');
DELETE FROM public.personnel_documents WHERE id = 'f6431000-0000-4000-8000-000000000503';
SELECT is(pg_temp.retirement('personnel-documents', pg_temp.doc('shared.pdf')), 'pending',
  'the last reference retires the shared key');
SELECT throws_ok($$ INSERT INTO public.personnel_documents (organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by)
  VALUES ('f6431000-0000-4000-8000-000000000101', 'f6431000-0000-4000-8000-000000000301', 'Reattach', pg_temp.doc('archived.pdf'), 1, 'application/pdf', 'fixture') $$,
  '23514', 'This stored file was deleted and cannot be attached', 'a saved key deleted after upgrade cannot be reattached');
SELECT throws_ok($$ INSERT INTO storage.objects (id, bucket_id, name) VALUES ('f6431000-0000-4000-8000-000000000701', 'personnel-documents', pg_temp.doc('archived.pdf')) $$,
  '23514', 'This stored file was deleted and cannot be reused', 'no bytes can be written under a saved key deleted after upgrade');
SELECT * FROM finish();
ROLLBACK;
