-- Direct artifact and file reads require configure; the Person-bound service
-- write path retains operate. Saved rows and separate Training files are covered
-- by the populated upgrade and counseling file scope contracts.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT ok(has_function_privilege('authenticated', 'public.personnel_sensitive_artifact_is_readable(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.personnel_sensitive_artifact_is_readable(uuid,uuid)', 'EXECUTE'),
  'sensitive artifact predicate is authenticated only');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname = 'public'
  AND tablename IN ('counseling_records','leader_notes','personnel_follow_ups','personnel_documents')
  AND cmd = 'SELECT'), 4, 'only four scoped artifact SELECT policies remain');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname = 'storage'
  AND tablename = 'objects' AND policyname = 'Members can view personnel document files through scoped personnel access'),
  0, 'the old document file viewer policy is removed');

INSERT INTO auth.users (id, email)
SELECT ('d8000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'sensitive-read-' || n || '@example.test'
FROM generate_series(1, 6) n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('d8000000-0000-4000-8000-000000000101', 'Sensitive Read A', 'd8000000-0000-4000-8000-000000000005'),
  ('d8000000-0000-4000-8000-000000000102', 'Sensitive Read B', 'd8000000-0000-4000-8000-000000000006');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('d8000000-0000-4000-8000-000000000201', 'd8000000-0000-4000-8000-000000000101', 'Alpha'),
  ('d8000000-0000-4000-8000-000000000202', 'd8000000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('d8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000001', 'member', 'viewer', '{"personnel":"view"}', 'groups', ARRAY['d8000000-0000-4000-8000-000000000201']::uuid[]),
  ('d8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000002', 'member', 'viewer', '{"personnel":"operate"}', 'groups', ARRAY['d8000000-0000-4000-8000-000000000201']::uuid[]),
  ('d8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000003', 'member', 'viewer', '{"personnel":"configure"}', 'groups', ARRAY['d8000000-0000-4000-8000-000000000201']::uuid[]),
  ('d8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000004', 'member', 'viewer', '{"personnel":"configure"}', 'groups', ARRAY[]::uuid[]),
  ('d8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000005', 'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]),
  ('d8000000-0000-4000-8000-000000000102', 'd8000000-0000-4000-8000-000000000006', 'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  ('d8000000-0000-4000-8000-000000000301', 'd8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000201', 'SPC', 'One', 'Alpha', 'sensitive-read-alpha'),
  ('d8000000-0000-4000-8000-000000000302', 'd8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000202', 'SGT', 'Two', 'Bravo', 'sensitive-read-bravo'),
  ('d8000000-0000-4000-8000-000000000303', 'd8000000-0000-4000-8000-000000000101', NULL, 'PFC', 'Three', 'Unassigned', 'sensitive-read-unassigned'),
  ('d8000000-0000-4000-8000-000000000304', 'd8000000-0000-4000-8000-000000000102', NULL, 'CPL', 'Four', 'Foreign', 'sensitive-read-foreign');
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by) VALUES
  ('d8000000-0000-4000-8000-000000000401', 'd8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000301', '2030-01-01', 'Alpha', 'Alpha', 'fixture');
INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, notes, due_date, status, created_by) VALUES
  ('d8000000-0000-4000-8000-000000000402', 'd8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000301', 'Alpha follow-up', 'Private', '2030-02-01', 'open', 'fixture');
INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by) VALUES
  ('d8000000-0000-4000-8000-000000000403', 'd8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000301', 'Alpha document', 'd8000000-0000-4000-8000-000000000101/personnel/d8000000-0000-4000-8000-000000000301/documents/alpha.pdf', 128, 'application/pdf', 'fixture');
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text) VALUES
  ('d8000000-0000-4000-8000-000000000404', 'd8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000301', 'fixture', 'Alpha note'),
  ('d8000000-0000-4000-8000-000000000405', 'd8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000302', 'fixture', 'Bravo note'),
  ('d8000000-0000-4000-8000-000000000406', 'd8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000303', 'fixture', 'Unassigned note'),
  ('d8000000-0000-4000-8000-000000000407', 'd8000000-0000-4000-8000-000000000102', 'd8000000-0000-4000-8000-000000000304', 'fixture', 'Foreign note');
INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES
  ('d8000000-0000-4000-8000-000000000501', 'counseling-files', 'd8000000-0000-4000-8000-000000000101/counseling-records/d8000000-0000-4000-8000-000000000301/alpha.pdf', 'd8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', '{}'::jsonb),
  ('d8000000-0000-4000-8000-000000000502', 'personnel-documents', 'd8000000-0000-4000-8000-000000000101/personnel/d8000000-0000-4000-8000-000000000301/documents/alpha.pdf', 'd8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', '{}'::jsonb),
  ('d8000000-0000-4000-8000-000000000503', 'personnel-documents', 'd8000000-0000-4000-8000-000000000101/personnel/d8000000-0000-4000-8000-000000000302/documents/bravo.pdf', 'd8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', '{}'::jsonb),
  ('d8000000-0000-4000-8000-000000000504', 'counseling-files', 'd8000000-0000-4000-8000-000000000101/counseling-records/d8000000-0000-4000-8000-000000000303/unassigned.pdf', 'd8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', '{}'::jsonb),
  ('d8000000-0000-4000-8000-000000000505', 'personnel-documents', 'd8000000-0000-4000-8000-000000000102/personnel/d8000000-0000-4000-8000-000000000304/documents/foreign.pdf', 'd8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', '{}'::jsonb);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd8000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 1, 'viewer still sees the ordinary in-Group Person');
SELECT is((SELECT count(*)::integer FROM public.counseling_records), 0, 'viewer cannot directly read counseling');
SELECT is((SELECT count(*)::integer FROM public.leader_notes), 0, 'viewer cannot directly read notes');
SELECT is((SELECT count(*)::integer FROM public.personnel_follow_ups), 0, 'viewer cannot directly read follow-ups');
SELECT is((SELECT count(*)::integer FROM public.personnel_documents), 0, 'viewer cannot directly read document metadata');
SELECT is((SELECT count(*)::integer FROM storage.objects), 0, 'viewer cannot directly read sensitive files');

SELECT set_config('request.jwt.claim.sub', 'd8000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.counseling_records), 0, 'operator cannot directly read counseling');
SELECT is((SELECT count(*)::integer FROM public.leader_notes), 0, 'operator cannot directly read notes');
SELECT is((SELECT count(*)::integer FROM public.personnel_follow_ups), 0, 'operator cannot directly read follow-ups');
SELECT is((SELECT count(*)::integer FROM public.personnel_documents), 0, 'operator cannot directly read document metadata');
SELECT is((SELECT count(*)::integer FROM storage.objects), 0, 'operator cannot directly read sensitive files');
SELECT ok(NOT public.sensitive_file_object_is_readable('counseling-files', 'd8000000-0000-4000-8000-000000000101/counseling-records/d8000000-0000-4000-8000-000000000301/alpha.pdf'),
  'operator cannot call counseling read helper');
SELECT ok(public.sensitive_file_object_is_writable('counseling-files', 'd8000000-0000-4000-8000-000000000101/counseling-records/d8000000-0000-4000-8000-000000000301/alpha.pdf'),
  'operator retains counseling file write admission');
SELECT lives_ok($$ INSERT INTO public.personnel_follow_ups
  (id, organization_id, personnel_id, title, notes, due_date, status, created_by) VALUES
  ('d8000000-0000-4000-8000-000000000408', 'd8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000301', 'Operate insert', 'Retained', '2030-02-02', 'open', 'fixture') $$,
  'operator retains scoped write admission without direct read');
SELECT lives_ok($$ INSERT INTO public.counseling_records
  (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by) VALUES
  ('d8000000-0000-4000-8000-000000000409', 'd8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000301', '2030-01-02', 'Operate insert', 'Operate insert', 'fixture') $$,
  'operator retains scoped counseling insert without direct read');
SELECT lives_ok($$ INSERT INTO public.leader_notes
  (id, organization_id, personnel_id, author, text) VALUES
  ('d8000000-0000-4000-8000-000000000410', 'd8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000301', 'fixture', 'Operate insert') $$,
  'operator retains scoped note insert without direct read');
SELECT lives_ok($$ INSERT INTO public.personnel_documents
  (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by) VALUES
  ('d8000000-0000-4000-8000-000000000411', 'd8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000301', 'Operate insert', 'd8000000-0000-4000-8000-000000000101/personnel/d8000000-0000-4000-8000-000000000301/documents/operate.pdf', 128, 'application/pdf', 'fixture') $$,
  'operator retains scoped document insert without direct read');
SELECT lives_ok($$ INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES
  ('d8000000-0000-4000-8000-000000000506', 'counseling-files', 'd8000000-0000-4000-8000-000000000101/counseling-records/d8000000-0000-4000-8000-000000000301/operate.pdf', 'd8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000002', '{}'::jsonb) $$,
  'operator retains scoped counseling file insert without direct read');
SELECT lives_ok($$ INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES
  ('d8000000-0000-4000-8000-000000000507', 'personnel-documents', 'd8000000-0000-4000-8000-000000000101/personnel/d8000000-0000-4000-8000-000000000301/documents/operate.pdf', 'd8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000002', '{}'::jsonb) $$,
  'operator retains scoped document file insert without direct read');
SELECT throws_ok($$ INSERT INTO public.personnel_follow_ups
  (organization_id, personnel_id, title, notes, due_date, status, created_by) VALUES
  ('d8000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000302', 'Denied', 'Denied', '2030-02-02', 'open', 'fixture') $$,
  '42501', NULL, 'operator cannot write another Group');
SELECT is((SELECT count(*)::integer FROM public.personnel_follow_ups WHERE id = 'd8000000-0000-4000-8000-000000000408'), 0,
  'operator insert does not expose the saved row through direct SELECT');

SELECT set_config('request.jwt.claim.sub', 'd8000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.counseling_records), 2, 'Group configurator reads saved and operator-inserted counseling');
SELECT is((SELECT count(*)::integer FROM public.leader_notes), 2, 'Group configurator reads only Alpha notes');
SELECT is((SELECT count(*)::integer FROM public.personnel_follow_ups), 2, 'Group configurator sees saved and operator-inserted follow-ups');
SELECT is((SELECT count(*)::integer FROM public.personnel_documents), 2, 'Group configurator reads saved and operator-inserted documents');
SELECT is((SELECT count(*)::integer FROM storage.objects), 4, 'Group configurator reads assigned counseling and document files');
SELECT ok(public.sensitive_file_object_is_readable('counseling-files', 'd8000000-0000-4000-8000-000000000101/counseling-records/d8000000-0000-4000-8000-000000000301/alpha.pdf'),
  'Group configurator can call counseling read helper');
SELECT ok(NOT public.sensitive_file_object_is_readable('counseling-files', 'd8000000-0000-4000-8000-000000000101/counseling-records/d8000000-0000-4000-8000-000000000303/unassigned.pdf'),
  'Group configurator cannot call counseling helper for unassigned Person');

SELECT set_config('request.jwt.claim.sub', 'd8000000-0000-4000-8000-000000000004', true);
SELECT is((SELECT count(*)::integer FROM public.leader_notes), 0, 'empty Group configurator reads no notes');
SELECT is((SELECT count(*)::integer FROM storage.objects), 0, 'empty Group configurator reads no files');

SELECT set_config('request.jwt.claim.sub', 'd8000000-0000-4000-8000-000000000005', true);
SELECT is((SELECT count(*)::integer FROM public.leader_notes), 4, 'Organization configurator reads local assigned and unassigned notes');
SELECT is((SELECT count(*)::integer FROM storage.objects), 6, 'Organization configurator reads local assigned and unassigned files');
SELECT ok(public.sensitive_file_object_is_readable('counseling-files', 'd8000000-0000-4000-8000-000000000101/counseling-records/d8000000-0000-4000-8000-000000000303/unassigned.pdf'),
  'Organization configurator can read unassigned counseling file');
SELECT ok(NOT public.sensitive_file_object_is_readable('counseling-files', 'd8000000-0000-4000-8000-000000000102/counseling-records/d8000000-0000-4000-8000-000000000304/foreign.pdf'),
  'Organization configurator cannot read foreign file');

SELECT set_config('request.jwt.claim.sub', 'd8000000-0000-4000-8000-000000000006', true);
SELECT is((SELECT id FROM public.leader_notes), 'd8000000-0000-4000-8000-000000000407'::uuid,
  'foreign configurator reads only own-Organization note');
SELECT is((SELECT id FROM storage.objects), 'd8000000-0000-4000-8000-000000000505'::uuid,
  'foreign configurator reads only own-Organization document');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.personnel_follow_ups WHERE id = 'd8000000-0000-4000-8000-000000000408'), 1,
  'operator-inserted follow-up is present for privileged writer reads');
SELECT is((SELECT count(*)::integer FROM public.counseling_records WHERE id = 'd8000000-0000-4000-8000-000000000409'), 1,
  'operator-inserted counseling row is present for privileged writer reads');
SELECT is((SELECT count(*)::integer FROM public.leader_notes WHERE id = 'd8000000-0000-4000-8000-000000000410'), 1,
  'operator-inserted note is present for privileged writer reads');
SELECT is((SELECT count(*)::integer FROM public.personnel_documents WHERE id = 'd8000000-0000-4000-8000-000000000411'), 1,
  'operator-inserted document is present for privileged writer reads');
SELECT * FROM finish();
ROLLBACK;
