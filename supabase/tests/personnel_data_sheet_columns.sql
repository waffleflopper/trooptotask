-- The Data sheet stores when a marital status began and which member last saved the sheet.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT col_type_is('public', 'personnel_extended_info', 'marital_status_date', 'date', 'marital status date is a date');
SELECT col_is_null('public', 'personnel_extended_info', 'marital_status_date', 'marital status date is optional');
SELECT col_type_is('public', 'personnel_extended_info', 'updated_by', 'text', 'saving member is stored as text');
SELECT col_is_null('public', 'personnel_extended_info', 'updated_by', 'saving member is optional for sheets saved before the column existed');

INSERT INTO auth.users (id, email) VALUES ('f8000000-0000-4000-8000-000000000001', 'data-sheet-columns@example.test');
INSERT INTO public.organizations (id, name, created_by)
VALUES ('f8000000-0000-4000-8000-000000000101', 'Data Sheet Columns', 'f8000000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug)
VALUES ('f8000000-0000-4000-8000-000000000301', 'f8000000-0000-4000-8000-000000000101', 'SGT', 'Data', 'Sheet', 'data-sheet-columns');
INSERT INTO public.personnel_extended_info (id, organization_id, personnel_id, updated_at)
VALUES ('f8000000-0000-4000-8000-000000000401', 'f8000000-0000-4000-8000-000000000101', 'f8000000-0000-4000-8000-000000000301', '2000-01-01T00:00:00Z');

SELECT is(
  (SELECT marital_status_date IS NULL AND updated_by IS NULL FROM public.personnel_extended_info
   WHERE id = 'f8000000-0000-4000-8000-000000000401'),
  true, 'an existing sheet keeps both columns empty');

UPDATE public.personnel_extended_info
SET marital_status_date = '2019-07-04', updated_by = 'f8000000-0000-4000-8000-000000000001'
WHERE id = 'f8000000-0000-4000-8000-000000000401';

SELECT is(
  (SELECT to_jsonb(i) - ARRAY['id', 'organization_id', 'personnel_id', 'created_at', 'updated_at']
     FROM (SELECT marital_status_date, updated_by FROM public.personnel_extended_info
           WHERE id = 'f8000000-0000-4000-8000-000000000401') i),
  '{"marital_status_date": "2019-07-04", "updated_by": "f8000000-0000-4000-8000-000000000001"}'::jsonb,
  'both columns round-trip');
SELECT cmp_ok(
  (SELECT updated_at FROM public.personnel_extended_info WHERE id = 'f8000000-0000-4000-8000-000000000401'),
  '>', '2000-01-01T00:00:00Z'::timestamptz, 'a save moves updated_at past its earlier value');

INSERT INTO auth.users (id, email) VALUES ('f8000000-0000-4000-8000-000000000002', 'data-sheet-forger@example.test');
SELECT set_config('request.jwt.claim.sub', 'f8000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub": "f8000000-0000-4000-8000-000000000002"}', true);

UPDATE public.personnel_extended_info
SET blood_type = 'O+', updated_by = 'f8000000-0000-4000-8000-000000000001'
WHERE id = 'f8000000-0000-4000-8000-000000000401';
SELECT is(
  (SELECT updated_by FROM public.personnel_extended_info WHERE id = 'f8000000-0000-4000-8000-000000000401'),
  'f8000000-0000-4000-8000-000000000002', 'a signed-in save records its own user, not the one it sends');

INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug)
VALUES ('f8000000-0000-4000-8000-000000000302', 'f8000000-0000-4000-8000-000000000101', 'SPC', 'New', 'Sheet', 'data-sheet-new');
INSERT INTO public.personnel_extended_info (id, organization_id, personnel_id, updated_by)
VALUES ('f8000000-0000-4000-8000-000000000402', 'f8000000-0000-4000-8000-000000000101', 'f8000000-0000-4000-8000-000000000302', NULL);
SELECT is(
  (SELECT updated_by FROM public.personnel_extended_info WHERE id = 'f8000000-0000-4000-8000-000000000402'),
  'f8000000-0000-4000-8000-000000000002', 'a signed-in first save records its own user');

SELECT * FROM finish();
ROLLBACK;
