-- The Log and Archived tabs record who completed a follow-up and who archived an item,
-- and a leader note carries the time it last changed.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT col_type_is('public', 'personnel_follow_ups', 'completed_by', 'text', 'completing member is stored as text');
SELECT col_is_null('public', 'personnel_follow_ups', 'completed_by', 'completing member is optional for follow-ups completed before the column existed');
SELECT col_type_is('public', 'personnel_follow_ups', 'archived_by', 'text', 'follow-up archiving member is stored as text');
SELECT col_is_null('public', 'personnel_follow_ups', 'archived_by', 'follow-up archiving member is optional');
SELECT col_type_is('public', 'counseling_records', 'archived_by', 'text', 'counseling archiving member is stored as text');
SELECT col_is_null('public', 'counseling_records', 'archived_by', 'counseling archiving member is optional');
SELECT col_type_is('public', 'personnel_documents', 'archived_by', 'text', 'document archiving member is stored as text');
SELECT col_is_null('public', 'personnel_documents', 'archived_by', 'document archiving member is optional');
SELECT col_type_is('public', 'leader_notes', 'archived_by', 'text', 'note archiving member is stored as text');
SELECT col_is_null('public', 'leader_notes', 'archived_by', 'note archiving member is optional');
SELECT col_not_null('public', 'leader_notes', 'updated_at', 'every note has a last-changed time');

INSERT INTO auth.users (id, email) VALUES ('f9000000-0000-4000-8000-000000000001', 'log-attribution@example.test');
INSERT INTO public.organizations (id, name, created_by)
VALUES ('f9000000-0000-4000-8000-000000000101', 'Log Attribution', 'f9000000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug)
VALUES ('f9000000-0000-4000-8000-000000000301', 'f9000000-0000-4000-8000-000000000101', 'SGT', 'Log', 'Attribution', 'log-attribution');
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text, created_at, updated_at)
VALUES ('f9000000-0000-4000-8000-000000000501', 'f9000000-0000-4000-8000-000000000101',
  'f9000000-0000-4000-8000-000000000301', 'f9000000-0000-4000-8000-000000000001', 'First draft',
  '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z');
INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, created_by)
VALUES ('f9000000-0000-4000-8000-000000000601', 'f9000000-0000-4000-8000-000000000101',
  'f9000000-0000-4000-8000-000000000301', 'Confirm leave address', 'f9000000-0000-4000-8000-000000000001');

SELECT is(
  (SELECT completed_by IS NULL AND archived_by IS NULL FROM public.personnel_follow_ups
   WHERE id = 'f9000000-0000-4000-8000-000000000601'),
  true, 'a new follow-up has neither completer nor archiver');

UPDATE public.personnel_follow_ups
SET status = 'completed', completed_at = now(), completed_by = 'f9000000-0000-4000-8000-000000000001'
WHERE id = 'f9000000-0000-4000-8000-000000000601';
SELECT is(
  (SELECT completed_by FROM public.personnel_follow_ups WHERE id = 'f9000000-0000-4000-8000-000000000601'),
  'f9000000-0000-4000-8000-000000000001', 'the completing member round-trips');

UPDATE public.leader_notes SET text = 'Edited text' WHERE id = 'f9000000-0000-4000-8000-000000000501';
SELECT cmp_ok(
  (SELECT updated_at FROM public.leader_notes WHERE id = 'f9000000-0000-4000-8000-000000000501'),
  '>', '2000-01-01T00:00:00Z'::timestamptz, 'editing a note moves updated_at past its earlier value');
SELECT is(
  (SELECT created_at FROM public.leader_notes WHERE id = 'f9000000-0000-4000-8000-000000000501'),
  '2000-01-01T00:00:00Z'::timestamptz, 'editing a note keeps the time it was written');

UPDATE public.leader_notes
SET archived_at = now(), archived_by = 'f9000000-0000-4000-8000-000000000001'
WHERE id = 'f9000000-0000-4000-8000-000000000501';
SELECT is(
  (SELECT archived_by FROM public.leader_notes WHERE id = 'f9000000-0000-4000-8000-000000000501'),
  'f9000000-0000-4000-8000-000000000001', 'the archiving member round-trips');

SELECT * FROM finish();
ROLLBACK;
