-- A counseling record may name who conducted it. Readers treat a missing name as unrecorded.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT col_type_is('public', 'counseling_records', 'conducted_by', 'text', 'conducted by is free text');
SELECT col_is_null('public', 'counseling_records', 'conducted_by', 'conducted by is optional for records saved before the column existed');

INSERT INTO auth.users (id, email) VALUES ('f9000000-0000-4000-8000-000000000001', 'conducted-by@example.test');
INSERT INTO public.organizations (id, name, created_by)
VALUES ('f9000000-0000-4000-8000-000000000101', 'Conducted By', 'f9000000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug)
VALUES ('f9000000-0000-4000-8000-000000000301', 'f9000000-0000-4000-8000-000000000101', 'SGT', 'Conducted', 'By', 'conducted-by');
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, title, uploaded_by, file_path)
VALUES ('f9000000-0000-4000-8000-000000000401', 'f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000301',
  '2026-09-12', 'Monthly counseling', 'f9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000101/counseling-records/f9000000-0000-4000-8000-000000000301/a.pdf');

SELECT is((SELECT conducted_by FROM public.counseling_records WHERE id = 'f9000000-0000-4000-8000-000000000401'),
  NULL, 'an existing record keeps conducted by empty');

UPDATE public.counseling_records SET conducted_by = 'SSG Alvarez' WHERE id = 'f9000000-0000-4000-8000-000000000401';
SELECT is((SELECT conducted_by FROM public.counseling_records WHERE id = 'f9000000-0000-4000-8000-000000000401'),
  'SSG Alvarez', 'a name round-trips');

SELECT throws_ok(
  $$ UPDATE public.counseling_records SET conducted_by = '' WHERE id = 'f9000000-0000-4000-8000-000000000401' $$,
  '23514', NULL, 'an empty name is rejected; the app stores no name as null');
SELECT throws_ok(
  $$ UPDATE public.counseling_records SET conducted_by = ' SSG Alvarez' WHERE id = 'f9000000-0000-4000-8000-000000000401' $$,
  '23514', NULL, 'a name with surrounding spaces is rejected');
SELECT lives_ok(
  $$ UPDATE public.counseling_records SET conducted_by = repeat('a', 120) WHERE id = 'f9000000-0000-4000-8000-000000000401' $$,
  'a 120 character name fits');
SELECT throws_ok(
  $$ UPDATE public.counseling_records SET conducted_by = repeat('a', 121) WHERE id = 'f9000000-0000-4000-8000-000000000401' $$,
  '23514', NULL, 'a 121 character name is rejected');

SELECT * FROM finish();
ROLLBACK;
