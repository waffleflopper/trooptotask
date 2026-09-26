-- Direct Storage access must follow the Person's Personnel scope, including
-- unassigned People, while Sign-In Roster files retain Training-lane access.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('e8000000-0000-4000-8000-000000000001', 'file-scope-group@example.test'),
  ('e8000000-0000-4000-8000-000000000002', 'file-scope-empty@example.test'),
  ('e8000000-0000-4000-8000-000000000003', 'file-scope-org@example.test'),
  ('e8000000-0000-4000-8000-000000000004', 'file-scope-viewer@example.test'),
  ('e8000000-0000-4000-8000-000000000005', 'file-scope-training@example.test'),
  ('e8000000-0000-4000-8000-000000000006', 'file-scope-training-operator@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e8000000-0000-4000-8000-000000000101', 'Counseling File Scope A', 'e8000000-0000-4000-8000-000000000001'),
  ('e8000000-0000-4000-8000-000000000102', 'Counseling File Scope B', 'e8000000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('e8000000-0000-4000-8000-000000000201', 'e8000000-0000-4000-8000-000000000101', 'Alpha');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000001', 'member', 'viewer', '{"personnel":"configure","training":"none"}', 'groups', ARRAY['e8000000-0000-4000-8000-000000000201']::uuid[]),
  ('e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000002', 'member', 'viewer', '{"personnel":"configure","training":"none"}', 'groups', ARRAY[]::uuid[]),
  ('e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000003', 'member', 'viewer', '{"personnel":"configure","training":"none"}', 'organization', ARRAY[]::uuid[]),
  ('e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000004', 'member', 'viewer', '{"personnel":"view","training":"none"}', 'groups', ARRAY['e8000000-0000-4000-8000-000000000201']::uuid[]),
  ('e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000005', 'member', 'viewer', '{"personnel":"none","training":"view"}', 'groups', ARRAY['e8000000-0000-4000-8000-000000000201']::uuid[]),
  ('e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000006', 'member', 'viewer', '{"personnel":"none","training":"operate"}', 'groups', ARRAY['e8000000-0000-4000-8000-000000000201']::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  ('e8000000-0000-4000-8000-000000000301', 'e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000201', 'SPC', 'Alpha', 'Person', 'file-scope-alpha'),
  ('e8000000-0000-4000-8000-000000000302', 'e8000000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Person', 'file-scope-unassigned'),
  ('e8000000-0000-4000-8000-000000000303', 'e8000000-0000-4000-8000-000000000102', NULL, 'SPC', 'Foreign', 'Person', 'file-scope-foreign');
INSERT INTO public.sign_in_rosters (
  id, organization_id, title, roster_date, blank_date, separate_by_group, sort_by,
  personnel_snapshot, personnel_ids, scope_group_ids, created_by
) VALUES (
  'e8000000-0000-4000-8000-000000000401', 'e8000000-0000-4000-8000-000000000101',
  'Alpha roster', '2030-01-01', false, false, 'alphabetical',
  '[{"id":"e8000000-0000-4000-8000-000000000301"}]',
  ARRAY['e8000000-0000-4000-8000-000000000301']::uuid[],
  ARRAY['e8000000-0000-4000-8000-000000000201']::uuid[],
  'e8000000-0000-4000-8000-000000000001'
);
INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, notes, due_date, status, created_by) VALUES
  ('e8000000-0000-4000-8000-000000000501', 'e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000302', 'Unassigned follow-up', 'Private note', '2030-02-01', 'open', 'fixture');
INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by) VALUES
  ('e8000000-0000-4000-8000-000000000502', 'e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000302', 'Unassigned document', 'e8000000-0000-4000-8000-000000000101/personnel/e8000000-0000-4000-8000-000000000302/documents/unassigned.pdf', 128, 'application/pdf', 'fixture');
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by) VALUES
  ('e8000000-0000-4000-8000-000000000503', 'e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000302', '2030-01-01', 'Unassigned counseling', 'Unassigned counseling', 'fixture');
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text) VALUES
  ('e8000000-0000-4000-8000-000000000504', 'e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000302', 'fixture', 'Unassigned leader note');
INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES
  ('e8000000-0000-4000-8000-000000000601', 'counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000301/alpha.pdf', 'e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', '{}'::jsonb),
  ('e8000000-0000-4000-8000-000000000602', 'counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000302/unassigned.pdf', 'e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', '{}'::jsonb),
  ('e8000000-0000-4000-8000-000000000603', 'counseling-files', 'e8000000-0000-4000-8000-000000000102/counseling-records/e8000000-0000-4000-8000-000000000303/foreign.pdf', 'e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', '{}'::jsonb),
  ('e8000000-0000-4000-8000-000000000604', 'counseling-files', 'e8000000-0000-4000-8000-000000000101/sign-in-rosters/e8000000-0000-4000-8000-000000000401/alpha.pdf', 'e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', '{}'::jsonb),
  ('e8000000-0000-4000-8000-000000000605', 'personnel-documents', 'e8000000-0000-4000-8000-000000000101/personnel/e8000000-0000-4000-8000-000000000302/documents/unassigned.pdf', 'e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', '{}'::jsonb);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000001', true);
SELECT ok(public.sensitive_file_object_is_readable('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000301/alpha.pdf'), 'Group configurator can read in-Group counseling file');
SELECT ok(public.sensitive_file_object_is_writable('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000301/alpha.pdf'), 'Group configurator can write in-Group counseling file');
SELECT ok(NOT public.sensitive_file_object_is_readable('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000302/unassigned.pdf'), 'Group configurator cannot call read helper for unassigned Person');
SELECT ok(NOT public.sensitive_file_object_is_writable('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000302/unassigned.pdf'), 'Group configurator cannot call write helper for unassigned Person');
SELECT ok(NOT public.sensitive_file_object_is_readable('counseling-files', 'e8000000-0000-4000-8000-000000000102/counseling-records/e8000000-0000-4000-8000-000000000303/foreign.pdf'), 'Group configurator cannot call read helper for foreign Organization');
SELECT is((SELECT string_agg(id::text, ',' ORDER BY id) FROM storage.objects),
  'e8000000-0000-4000-8000-000000000601', 'Group configurator sees only in-Group counseling object');
SELECT is((SELECT count(*)::integer FROM public.personnel_follow_ups), 0, 'Group configurator cannot read unassigned follow-up');
SELECT is((SELECT count(*)::integer FROM public.personnel_documents), 0, 'Group configurator cannot read unassigned document metadata');
SELECT is((SELECT count(*)::integer FROM public.counseling_records), 0, 'Group configurator cannot read unassigned counseling record');
SELECT is((SELECT count(*)::integer FROM public.leader_notes), 0, 'Group configurator cannot read unassigned leader note');
SAVEPOINT denied_group_storage_writes;
WITH changed AS (UPDATE public.personnel_follow_ups SET title = 'Denied' WHERE id = 'e8000000-0000-4000-8000-000000000501' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group configurator cannot edit unassigned follow-up') FROM changed;
SELECT throws_ok($$ INSERT INTO public.personnel_documents (organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by)
  VALUES ('e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000302', 'Denied', 'e8000000-0000-4000-8000-000000000101/personnel/e8000000-0000-4000-8000-000000000302/documents/denied.pdf', 128, 'application/pdf', 'fixture') $$,
  '42501', NULL, 'Group configurator cannot create unassigned document');
SELECT throws_ok($$ INSERT INTO public.counseling_records (organization_id, personnel_id, date_conducted, subject, title, uploaded_by)
  VALUES ('e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000302', '2030-01-02', 'Denied', 'Denied', 'fixture') $$,
  '42501', NULL, 'Group configurator cannot create unassigned counseling record');
SELECT throws_ok($$ INSERT INTO public.leader_notes (organization_id, personnel_id, author, text)
  VALUES ('e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000302', 'fixture', 'Denied') $$,
  '42501', NULL, 'Group configurator cannot create unassigned leader note');
SELECT throws_ok($$ INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
  VALUES ('personnel-documents', 'e8000000-0000-4000-8000-000000000101/personnel/e8000000-0000-4000-8000-000000000302/documents/denied.pdf', 'e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', '{}'::jsonb) $$,
  '42501', NULL, 'Group configurator cannot create unassigned document file');
WITH changed AS (UPDATE storage.objects SET metadata = '{"denied":true}' WHERE id = 'e8000000-0000-4000-8000-000000000602' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group configurator cannot update unassigned counseling object') FROM changed;
SELECT throws_ok($$ INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
  VALUES ('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000302/new.pdf', 'e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', '{}'::jsonb) $$,
  '42501', NULL, 'Group configurator cannot insert unassigned counseling object');
ROLLBACK TO SAVEPOINT denied_group_storage_writes;
SAVEPOINT allowed_group_storage_writes;
SELECT lives_ok($$ INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
  VALUES ('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000301/new.pdf', 'e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', '{}'::jsonb) $$,
  'Group configurator can create in-Group counseling object');
WITH changed AS (UPDATE storage.objects SET metadata = '{"allowed":true}' WHERE id = 'e8000000-0000-4000-8000-000000000601' RETURNING id)
SELECT is(count(*)::integer, 1, 'Group configurator can update in-Group counseling object') FROM changed;
ROLLBACK TO SAVEPOINT allowed_group_storage_writes;

SELECT set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000002', true);
SELECT ok(NOT public.sensitive_file_object_is_readable('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000302/unassigned.pdf'), 'empty Group scope cannot call read helper for unassigned Person');
SELECT is((SELECT count(*)::integer FROM storage.objects), 0, 'empty Group scope reads no files');
SELECT is((SELECT count(*)::integer FROM public.counseling_records), 0, 'empty Group scope reads no counseling records');

SELECT set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000003', true);
SELECT ok(public.sensitive_file_object_is_readable('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000302/unassigned.pdf'), 'Organization configurator can call read helper for unassigned Person');
SELECT ok(public.sensitive_file_object_is_writable('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000302/unassigned.pdf'), 'Organization configurator can call write helper for unassigned Person');
SELECT is((SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'counseling-files'), 2, 'Organization configurator reads assigned and unassigned counseling objects');
SELECT is((SELECT count(*)::integer FROM public.counseling_records), 1, 'Organization configurator reads unassigned counseling record');
SELECT is((SELECT count(*)::integer FROM public.personnel_documents), 1, 'Organization configurator reads unassigned document metadata');
SELECT is((SELECT count(*)::integer FROM public.leader_notes), 1, 'Organization configurator reads unassigned leader note');
SAVEPOINT allowed_org_storage_writes;
SELECT lives_ok($$ INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
  VALUES ('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000302/new.pdf', 'e8000000-0000-4000-8000-000000000003', 'e8000000-0000-4000-8000-000000000003', '{}'::jsonb) $$,
  'Organization configurator can create unassigned counseling object');
WITH changed AS (UPDATE storage.objects SET metadata = '{"allowed":true}' WHERE id = 'e8000000-0000-4000-8000-000000000602' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization configurator can update unassigned counseling object') FROM changed;
ROLLBACK TO SAVEPOINT allowed_org_storage_writes;

SELECT set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000004', true);
SELECT ok(NOT public.sensitive_file_object_is_readable('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000301/alpha.pdf'), 'Group viewer cannot read in-Group counseling file');
SELECT ok(NOT public.sensitive_file_object_is_writable('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000301/alpha.pdf'), 'Group viewer cannot write in-Group counseling file');

SELECT set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000005', true);
SELECT ok(public.sensitive_file_object_is_readable('counseling-files', 'e8000000-0000-4000-8000-000000000101/sign-in-rosters/e8000000-0000-4000-8000-000000000401/alpha.pdf'), 'Training viewer retains Sign-In Roster file read');
SELECT ok(NOT public.sensitive_file_object_is_writable('counseling-files', 'e8000000-0000-4000-8000-000000000101/sign-in-rosters/e8000000-0000-4000-8000-000000000401/alpha.pdf'), 'Training viewer cannot write Sign-In Roster file');
SELECT ok(NOT public.sensitive_file_object_is_readable('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000301/alpha.pdf'), 'Training-only viewer cannot read counseling file');
SELECT is((SELECT id FROM storage.objects), 'e8000000-0000-4000-8000-000000000604'::uuid, 'Training viewer sees only Sign-In Roster file');
SELECT set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000006', true);
SELECT ok(public.sensitive_file_object_is_writable('counseling-files', 'e8000000-0000-4000-8000-000000000101/sign-in-rosters/e8000000-0000-4000-8000-000000000401/new.pdf'),
  'Training operator retains Sign-In Roster file write');
SELECT lives_ok($$ INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
  VALUES ('counseling-files', 'e8000000-0000-4000-8000-000000000101/sign-in-rosters/e8000000-0000-4000-8000-000000000401/new.pdf', 'e8000000-0000-4000-8000-000000000006', 'e8000000-0000-4000-8000-000000000006', '{}'::jsonb) $$,
  'Training operator can create Sign-In Roster file');
SELECT ok(NOT public.sensitive_file_object_is_readable('counseling-files', 'e8000000-0000-4000-8000-000000000101/counseling-records/e8000000-0000-4000-8000-000000000301/alpha.pdf'),
  'Training-only operator cannot read counseling file');
SELECT ok(NOT public.sensitive_file_object_is_readable('counseling-files', 'not-a-valid-path.pdf'), 'invalid sensitive path is denied');
SELECT * FROM finish();
ROLLBACK;
