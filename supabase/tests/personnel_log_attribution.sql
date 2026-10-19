-- The Log and Archived tabs record who completed a follow-up and who archived an item,
-- and a leader note carries the time it last changed. The database stamps the acting
-- member from the caller's identity; a caller cannot supply or keep that attribution.
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

INSERT INTO auth.users (id, email) VALUES
  ('f9000000-0000-4000-8000-000000000001', 'log-attribution@example.test'),
  ('f9000000-0000-4000-8000-000000000002', 'log-bystander@example.test');
INSERT INTO public.organizations (id, name, created_by, url_slug)
VALUES ('f9000000-0000-4000-8000-000000000101', 'Log Attribution', 'f9000000-0000-4000-8000-000000000001', 'log-attribution');
INSERT INTO public.organization_memberships
  (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email)
VALUES ('f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000001',
  'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[], 'log-attribution@example.test');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug)
VALUES ('f9000000-0000-4000-8000-000000000301', 'f9000000-0000-4000-8000-000000000101', 'SGT', 'Log', 'Attribution', 'log-attribution');
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text, created_at, updated_at)
VALUES ('f9000000-0000-4000-8000-000000000501', 'f9000000-0000-4000-8000-000000000101',
  'f9000000-0000-4000-8000-000000000301', 'f9000000-0000-4000-8000-000000000001', 'First draft',
  '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z');
INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, created_by)
VALUES ('f9000000-0000-4000-8000-000000000601', 'f9000000-0000-4000-8000-000000000101',
  'f9000000-0000-4000-8000-000000000301', 'Confirm leave address', 'f9000000-0000-4000-8000-000000000001');
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, file_path, uploaded_by)
VALUES ('f9000000-0000-4000-8000-000000000701', 'f9000000-0000-4000-8000-000000000101',
  'f9000000-0000-4000-8000-000000000301', '2026-01-01', 'Counseling', 'Counseling', 'synthetic/attribution/counseling.pdf', 'fixture');
INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, uploaded_by, file_size_bytes, content_type)
VALUES ('f9000000-0000-4000-8000-000000000801', 'f9000000-0000-4000-8000-000000000101',
  'f9000000-0000-4000-8000-000000000301', 'Document', 'synthetic/attribution/document.pdf', 'fixture', 1, 'application/pdf');

SELECT is(
  (SELECT completed_by IS NULL AND archived_by IS NULL FROM public.personnel_follow_ups
   WHERE id = 'f9000000-0000-4000-8000-000000000601'),
  true, 'a new follow-up has neither completer nor archiver');

UPDATE public.leader_notes SET text = 'Edited text' WHERE id = 'f9000000-0000-4000-8000-000000000501';
SELECT cmp_ok(
  (SELECT updated_at FROM public.leader_notes WHERE id = 'f9000000-0000-4000-8000-000000000501'),
  '>', '2000-01-01T00:00:00Z'::timestamptz, 'editing a note moves updated_at past its earlier value');
SELECT is(
  (SELECT created_at FROM public.leader_notes WHERE id = 'f9000000-0000-4000-8000-000000000501'),
  '2000-01-01T00:00:00Z'::timestamptz, 'editing a note keeps the time it was written');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"f9000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Completion: an authenticated writer is recorded as the completer and cannot name someone else.
INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, created_by, completed_by)
VALUES ('f9000000-0000-4000-8000-000000000602', 'f9000000-0000-4000-8000-000000000101',
  'f9000000-0000-4000-8000-000000000301', 'Inserted open with a forged completer', 'fixture', 'f9000000-0000-4000-8000-000000000002');
SELECT is((SELECT completed_by FROM public.personnel_follow_ups WHERE id = 'f9000000-0000-4000-8000-000000000602'),
  NULL, 'an open follow-up inserted with a completer keeps none');
INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, status, created_by, completed_at, completed_by)
VALUES ('f9000000-0000-4000-8000-000000000603', 'f9000000-0000-4000-8000-000000000101',
  'f9000000-0000-4000-8000-000000000301', 'Inserted completed', 'completed', 'fixture', now(), 'f9000000-0000-4000-8000-000000000002');
SELECT is((SELECT completed_by FROM public.personnel_follow_ups WHERE id = 'f9000000-0000-4000-8000-000000000603'),
  'f9000000-0000-4000-8000-000000000001', 'a follow-up inserted as completed records the caller, not the supplied member');
UPDATE public.personnel_follow_ups
SET status = 'completed', completed_at = now(), completed_by = 'f9000000-0000-4000-8000-000000000002'
WHERE id = 'f9000000-0000-4000-8000-000000000601';
SELECT is((SELECT completed_by FROM public.personnel_follow_ups WHERE id = 'f9000000-0000-4000-8000-000000000601'),
  'f9000000-0000-4000-8000-000000000001', 'completing a follow-up records the caller, not the supplied member');
UPDATE public.personnel_follow_ups SET completed_by = 'not-a-member'
WHERE id = 'f9000000-0000-4000-8000-000000000601';
SELECT is((SELECT completed_by FROM public.personnel_follow_ups WHERE id = 'f9000000-0000-4000-8000-000000000601'),
  'f9000000-0000-4000-8000-000000000001', 'rewriting the completer of a completed follow-up changes nothing');
UPDATE public.personnel_follow_ups SET status = 'open', completed_at = NULL, completed_by = 'f9000000-0000-4000-8000-000000000002'
WHERE id = 'f9000000-0000-4000-8000-000000000601';
SELECT is((SELECT completed_by FROM public.personnel_follow_ups WHERE id = 'f9000000-0000-4000-8000-000000000601'),
  NULL, 'reopening a follow-up clears the completer even when one is supplied');

UPDATE public.personnel_follow_ups SET status = 'archived', archived_at = now()
WHERE id = 'f9000000-0000-4000-8000-000000000603';
UPDATE public.personnel_follow_ups SET status = 'completed', archived_at = NULL
WHERE id = 'f9000000-0000-4000-8000-000000000603';
SELECT is((SELECT completed_by FROM public.personnel_follow_ups WHERE id = 'f9000000-0000-4000-8000-000000000603'),
  'f9000000-0000-4000-8000-000000000001', 'archiving and restoring a completed follow-up keeps its completer');

-- Archiving: each table records the caller on the transition, ignores later rewrites and clears on restore.
CREATE TEMP TABLE archive_targets (tbl text, id uuid) ON COMMIT DROP;
GRANT ALL ON archive_targets TO authenticated;
INSERT INTO archive_targets VALUES
  ('personnel_follow_ups', 'f9000000-0000-4000-8000-000000000601'),
  ('counseling_records', 'f9000000-0000-4000-8000-000000000701'),
  ('personnel_documents', 'f9000000-0000-4000-8000-000000000801'),
  ('leader_notes', 'f9000000-0000-4000-8000-000000000501');
CREATE FUNCTION pg_temp.archived_by_of(p_table text, p_id uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE answer text;
BEGIN
  EXECUTE format('SELECT archived_by FROM public.%I WHERE id = $1', p_table) INTO answer USING p_id;
  RETURN answer;
END;
$$;
CREATE FUNCTION pg_temp.write_archive(p_table text, p_id uuid, p_archived_at timestamptz, p_archived_by text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('UPDATE public.%I SET archived_at = $2, archived_by = $3 WHERE id = $1', p_table)
    USING p_id, p_archived_at, p_archived_by;
END;
$$;

SELECT pg_temp.write_archive(tbl, id, now(), 'f9000000-0000-4000-8000-000000000002') FROM archive_targets;
SELECT is(pg_temp.archived_by_of(tbl, id), 'f9000000-0000-4000-8000-000000000001',
  tbl || ' archive records the caller, not the supplied member') FROM archive_targets;
SELECT pg_temp.write_archive(tbl, id, now(), 'not-a-member') FROM archive_targets;
SELECT is(pg_temp.archived_by_of(tbl, id), 'f9000000-0000-4000-8000-000000000001',
  tbl || ' keeps its archiver when an archived row is rewritten') FROM archive_targets;
SELECT pg_temp.write_archive(tbl, id, NULL, 'f9000000-0000-4000-8000-000000000002') FROM archive_targets;
SELECT is(pg_temp.archived_by_of(tbl, id), NULL,
  tbl || ' restore clears the archiver even when one is supplied') FROM archive_targets;

-- A row inserted already archived records the caller too.
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text, archived_at, archived_by)
VALUES ('f9000000-0000-4000-8000-000000000502', 'f9000000-0000-4000-8000-000000000101',
  'f9000000-0000-4000-8000-000000000301', 'f9000000-0000-4000-8000-000000000001', 'Inserted archived', now(),
  'f9000000-0000-4000-8000-000000000002');
SELECT is((SELECT archived_by FROM public.leader_notes WHERE id = 'f9000000-0000-4000-8000-000000000502'),
  'f9000000-0000-4000-8000-000000000001', 'a note inserted archived records the caller');
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text, archived_by)
VALUES ('f9000000-0000-4000-8000-000000000503', 'f9000000-0000-4000-8000-000000000101',
  'f9000000-0000-4000-8000-000000000301', 'f9000000-0000-4000-8000-000000000001', 'Inserted active', 'f9000000-0000-4000-8000-000000000002');
SELECT is((SELECT archived_by FROM public.leader_notes WHERE id = 'f9000000-0000-4000-8000-000000000503'),
  NULL, 'an active note inserted with an archiver keeps none');

-- Completion follows status alone: a direct writer sending only a status cannot keep or reuse another member's completion.
RESET ROLE;
INSERT INTO public.organization_memberships
  (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email)
VALUES ('f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000002',
  'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[], 'log-bystander@example.test');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"f9000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
UPDATE public.personnel_follow_ups SET status = 'completed' WHERE id = 'f9000000-0000-4000-8000-000000000603';
SELECT is((SELECT completed_by FROM public.personnel_follow_ups WHERE id = 'f9000000-0000-4000-8000-000000000603'),
  'f9000000-0000-4000-8000-000000000001', 'a status-only write on a completed follow-up keeps its completer');
UPDATE public.personnel_follow_ups SET status = 'open' WHERE id = 'f9000000-0000-4000-8000-000000000603';
SELECT is((SELECT completed_by IS NULL AND completed_at IS NULL FROM public.personnel_follow_ups
  WHERE id = 'f9000000-0000-4000-8000-000000000603'),
  true, 'a status-only reopen clears the completion');
UPDATE public.personnel_follow_ups SET status = 'completed' WHERE id = 'f9000000-0000-4000-8000-000000000603';
SELECT is((SELECT completed_by FROM public.personnel_follow_ups WHERE id = 'f9000000-0000-4000-8000-000000000603'),
  'f9000000-0000-4000-8000-000000000002', 'a status-only recompletion records its caller');
SELECT isnt((SELECT completed_at FROM public.personnel_follow_ups WHERE id = 'f9000000-0000-4000-8000-000000000603'),
  NULL, 'a status-only recompletion sets the completion time');
UPDATE public.personnel_follow_ups
SET status = 'archived', completed_at = now(), completed_by = 'f9000000-0000-4000-8000-000000000002'
WHERE id = 'f9000000-0000-4000-8000-000000000602';
SELECT is((SELECT completed_by IS NULL AND completed_at IS NULL FROM public.personnel_follow_ups
  WHERE id = 'f9000000-0000-4000-8000-000000000602'),
  true, 'archiving a follow-up that was never completed cannot attach a completion');

-- The server writes with the service role, where there is no caller to stamp, and supplies the actor itself.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
UPDATE public.personnel_follow_ups
SET status = 'completed', completed_at = now(), completed_by = 'f9000000-0000-4000-8000-000000000002'
WHERE id = 'f9000000-0000-4000-8000-000000000601';
SELECT is((SELECT completed_by FROM public.personnel_follow_ups WHERE id = 'f9000000-0000-4000-8000-000000000601'),
  'f9000000-0000-4000-8000-000000000002', 'the service role supplies the completer');
SELECT pg_temp.write_archive('leader_notes', 'f9000000-0000-4000-8000-000000000501', now(), 'f9000000-0000-4000-8000-000000000002');
SELECT is((SELECT archived_by FROM public.leader_notes WHERE id = 'f9000000-0000-4000-8000-000000000501'),
  'f9000000-0000-4000-8000-000000000002', 'the service role supplies the archiver');
SELECT pg_temp.write_archive('leader_notes', 'f9000000-0000-4000-8000-000000000501', NULL, 'f9000000-0000-4000-8000-000000000002');
SELECT is((SELECT archived_by FROM public.leader_notes WHERE id = 'f9000000-0000-4000-8000-000000000501'),
  NULL, 'a service-role restore clears the archiver');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
