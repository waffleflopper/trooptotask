-- Shared SQL/RLS contract. Wrappers own transaction, fixture and pgTAP plan.
SELECT is((SELECT count(*)::integer FROM upgrade_fixture.organization_storage_cleanup_current_rows),
  37, 'all saved Auth, Organization, membership, artifact, bucket and object witnesses remain');
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.organization_storage_cleanup_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT * FROM upgrade_fixture.organization_storage_cleanup_before_rows ORDER BY table_name, row_id $$,
  'migration preserves every saved row identity and value');
SELECT ok(has_function_privilege('authenticated', 'public.organization_storage_object_is_owner_removable(text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.organization_storage_object_is_owner_removable(text,text)', 'EXECUTE'),
  'authenticated callers can evaluate owner access, anonymous callers cannot invoke the helper');
SELECT ok(has_function_privilege('authenticated', 'public.sensitive_file_object_is_readable(text,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.sensitive_file_object_is_writable(text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.sensitive_file_object_is_readable(text,text)', 'EXECUTE'),
  'existing scoped sensitive-file helper grants are retained');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fa170000-0000-4000-8000-000000000001', true);
SELECT throws_ok($$ DELETE FROM storage.objects WHERE id = 'fa170000-0000-4000-8000-000000000504' $$,
  '42501', 'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'Storage direct-table deletion guard remains intact');
-- Match Storage API's transaction-local delete flag solely to exercise SQL/RLS
-- on synthetic metadata. This does not remove or verify any file bytes.
SELECT set_config('storage.allow_delete_query', 'true', true);
SELECT results_eq(
  $$ SELECT id FROM storage.objects WHERE id::text LIKE 'fa170000-%' ORDER BY id $$,
  $$ SELECT id::uuid FROM (VALUES
    ('fa170000-0000-4000-8000-000000000501'), ('fa170000-0000-4000-8000-000000000502'),
    ('fa170000-0000-4000-8000-000000000503'), ('fa170000-0000-4000-8000-000000000504'),
    ('fa170000-0000-4000-8000-000000000505'), ('fa170000-0000-4000-8000-000000000506'),
    ('fa170000-0000-4000-8000-000000000507'), ('fa170000-0000-4000-8000-000000000508')
  ) AS expected(id) ORDER BY id $$,
  'current owner reads only its two-bucket canonical namespace including other-uploader orphan and case variants');
SELECT ok(NOT public.organization_storage_object_is_owner_removable(NULL, 'fa170000-0000-4000-8000-000000000101/file.pdf')
  AND NOT public.organization_storage_object_is_owner_removable('counseling-files', NULL)
  AND NOT public.organization_storage_object_is_owner_removable('counseling-files', '')
  AND NOT public.organization_storage_object_is_owner_removable('counseling-files', 'fa170000-0000-4000-8000-000000000199/file.pdf'),
  'null, empty and missing-Organization inputs fail closed without unsafe UUID casts');
WITH removed AS (DELETE FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000509' AND 'fa170000-0000-4000-8000-000000000518' RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 0,
  'owner cannot remove malformed, lookalike, bare UUID, foreign or unrelated-bucket objects');
SELECT throws_ok($$ INSERT INTO storage.objects (bucket_id, name) VALUES
  ('counseling-files', 'fa170000-0000-4000-8000-000000000101/counseling-records/fa170000-0000-4000-8000-000000000999/new.pdf') $$,
  '42501', NULL, 'new owner SELECT/DELETE access does not permit orphan counseling uploads');
SELECT throws_ok($$ INSERT INTO storage.objects (bucket_id, name) VALUES
  ('personnel-documents', 'fa170000-0000-4000-8000-000000000101/personnel/fa170000-0000-4000-8000-000000000999/documents/new.pdf') $$,
  '42501', NULL, 'new owner access does not permit orphan document uploads');
WITH changed AS (UPDATE storage.objects SET metadata = '{"size":999}'
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508' RETURNING id)
SELECT is((SELECT count(*)::integer FROM changed), 0,
  'newly readable orphan objects remain uneditable through existing UPDATE policies');

SELECT set_config('request.jwt.claim.sub', 'fa170000-0000-4000-8000-000000000002', true);
SELECT results_eq(
  $$ SELECT id FROM storage.objects WHERE id::text LIKE 'fa170000-%' ORDER BY id $$,
  $$ VALUES ('fa170000-0000-4000-8000-000000000501'::uuid), ('fa170000-0000-4000-8000-000000000502'::uuid), ('fa170000-0000-4000-8000-000000000503'::uuid) $$,
  'admin retains live-parent access but gains no orphan, foreign or other-bucket reads');
WITH removed AS (DELETE FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508' RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'admin cannot remove newly covered orphan objects');
SELECT set_config('request.jwt.claim.sub', 'fa170000-0000-4000-8000-000000000003', true);
SELECT results_eq(
  $$ SELECT id FROM storage.objects WHERE id::text LIKE 'fa170000-%' ORDER BY id $$,
  $$ VALUES ('fa170000-0000-4000-8000-000000000501'::uuid), ('fa170000-0000-4000-8000-000000000502'::uuid), ('fa170000-0000-4000-8000-000000000503'::uuid) $$,
  'Personnel configurator and Training viewer retain their scoped live-parent reads');
WITH removed AS (DELETE FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508' RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'feature configurator cannot remove newly covered orphan objects');
SELECT set_config('request.jwt.claim.sub', 'fa170000-0000-4000-8000-000000000004', true);
SELECT results_eq(
  $$ SELECT id FROM storage.objects WHERE id::text LIKE 'fa170000-%' ORDER BY id $$,
  $$ VALUES ('fa170000-0000-4000-8000-000000000514'::uuid), ('fa170000-0000-4000-8000-000000000515'::uuid) $$,
  'foreign owner sees only its own two-bucket orphan namespace');
WITH removed AS (DELETE FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508' RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'foreign owner cannot remove A orphan objects');
SELECT set_config('request.jwt.claim.sub', 'fa170000-0000-4000-8000-000000000005', true);
SELECT is((SELECT count(*)::integer FROM storage.objects WHERE id::text LIKE 'fa170000-%'),
  0, 'uploader and non-owner platform support authority confer no file namespace access');
WITH removed AS (DELETE FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508' RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'uploader and platform support cannot remove A orphan objects');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is((SELECT count(*)::integer FROM storage.objects WHERE id::text LIKE 'fa170000-%'),
  0, 'authenticated role without a subject has no namespace access');
WITH removed AS (DELETE FROM storage.objects WHERE id::text LIKE 'fa170000-%' RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'null identity cannot remove any fixture object');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM storage.objects WHERE id::text LIKE 'fa170000-%'),
  0, 'anonymous role cannot read fixture objects');
WITH removed AS (DELETE FROM storage.objects WHERE id::text LIKE 'fa170000-%' RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'anonymous role cannot remove fixture objects');
RESET ROLE;
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.organization_storage_cleanup_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT * FROM upgrade_fixture.organization_storage_cleanup_before_rows ORDER BY table_name, row_id $$,
  'every denied mutation preserves every target and foreign saved value');

-- Scoped reads and metadata edits remain; new bytes use registered server upload.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fa170000-0000-4000-8000-000000000003', true);
SELECT throws_ok($$ INSERT INTO storage.objects (id, bucket_id, name) VALUES
  ('fa170000-0000-4000-8000-000000000701', 'counseling-files', 'fa170000-0000-4000-8000-000000000101/counseling-records/fa170000-0000-4000-8000-000000000301/allowed.pdf'),
  ('fa170000-0000-4000-8000-000000000702', 'personnel-documents', 'fa170000-0000-4000-8000-000000000101/personnel/fa170000-0000-4000-8000-000000000301/documents/allowed.pdf') $$, '42501', NULL,
  'configurator cannot bypass the registered server uploader');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO storage.objects (id, bucket_id, name) VALUES
  ('fa170000-0000-4000-8000-000000000701', 'counseling-files', 'fa170000-0000-4000-8000-000000000101/counseling-records/fa170000-0000-4000-8000-000000000301/allowed.pdf'),
  ('fa170000-0000-4000-8000-000000000702', 'personnel-documents', 'fa170000-0000-4000-8000-000000000101/personnel/fa170000-0000-4000-8000-000000000301/documents/allowed.pdf');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fa170000-0000-4000-8000-000000000003', true);
WITH changed AS (UPDATE storage.objects SET metadata = '{"size":128}'
  WHERE id IN ('fa170000-0000-4000-8000-000000000701', 'fa170000-0000-4000-8000-000000000702') RETURNING id)
SELECT is((SELECT count(*)::integer FROM changed), 2, 'existing configurator can edit both newly uploaded live-parent files');
WITH removed AS (DELETE FROM storage.objects
  WHERE id IN ('fa170000-0000-4000-8000-000000000701', 'fa170000-0000-4000-8000-000000000702') RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 2, 'existing configurator can remove both live-parent files');
RESET ROLE;

-- Direct Storage does not run application admission. Test the added scope's
-- fresh suspension and ownership checks separately from unchanged parent rules.
INSERT INTO public.user_suspensions (user_id, suspended_by, reason) VALUES
  ('fa170000-0000-4000-8000-000000000001', 'fa170000-0000-4000-8000-000000000005', 'synthetic D17 guard');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fa170000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508'),
  0, 'suspended owner loses newly covered orphan reads');
WITH removed AS (DELETE FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508' RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'suspended owner cannot remove newly covered orphan objects');
RESET ROLE;
DELETE FROM public.user_suspensions WHERE user_id = 'fa170000-0000-4000-8000-000000000001';
UPDATE public.organizations SET suspended_at = now() WHERE id = 'fa170000-0000-4000-8000-000000000101';
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508'),
  0, 'suspended Organization loses newly covered orphan reads');
WITH removed AS (DELETE FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508' RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'suspended Organization cannot have new-scope objects removed');
RESET ROLE;
UPDATE public.organizations SET suspended_at = NULL WHERE id = 'fa170000-0000-4000-8000-000000000101';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"aal":"aal2"}', true);
SELECT public.transfer_org_ownership('fa170000-0000-4000-8000-000000000101', 'fa170000-0000-4000-8000-000000000002');
SELECT is((SELECT count(*)::integer FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508'),
  0, 'former owner immediately loses orphan reads after real ownership transfer');
WITH removed AS (DELETE FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508' RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'former owner immediately loses orphan removals');
SELECT set_config('request.jwt.claim.sub', 'fa170000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508'),
  5, 'replacement owner gains all case-variant orphan reads');
RESET ROLE;
DELETE FROM public.organization_memberships
  WHERE organization_id = 'fa170000-0000-4000-8000-000000000101' AND user_id = 'fa170000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
WITH removed AS (DELETE FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508' RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'removed membership immediately loses orphan removals');
RESET ROLE;
INSERT INTO public.organization_memberships (organization_id, user_id, role, member_preset, access_scope_kind)
  VALUES ('fa170000-0000-4000-8000-000000000101', 'fa170000-0000-4000-8000-000000000002', 'owner', 'viewer', 'organization');
SELECT results_eq(
  $$ SELECT id, to_jsonb(object_row) FROM storage.objects AS object_row WHERE id::text LIKE 'fa170000-%' ORDER BY id $$,
  $$ SELECT row_id::uuid, row_data FROM upgrade_fixture.organization_storage_cleanup_before_rows WHERE table_name = 'storage.objects' ORDER BY row_id $$,
  'suspension, former-owner and removed-membership refusals preserve all file rows exactly');
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ WITH removed AS (DELETE FROM storage.objects WHERE id::text LIKE 'fa170000-%' RETURNING id) SELECT id FROM removed ORDER BY id $$,
  $$ SELECT id::uuid FROM (VALUES
    ('fa170000-0000-4000-8000-000000000501'), ('fa170000-0000-4000-8000-000000000502'),
    ('fa170000-0000-4000-8000-000000000503'), ('fa170000-0000-4000-8000-000000000504'),
    ('fa170000-0000-4000-8000-000000000505'), ('fa170000-0000-4000-8000-000000000506'),
    ('fa170000-0000-4000-8000-000000000507'), ('fa170000-0000-4000-8000-000000000508')
  ) AS expected(id) ORDER BY id $$,
  'replacement owner removes exactly its eight admitted objects across both buckets');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO storage.objects (id, bucket_id, name) VALUES
  ('fa170000-0000-4000-8000-000000000519', 'counseling-files', 'fa170000-0000-4000-8000-000000000101/leftover.pdf');
SELECT throws_ok($$ DELETE FROM public.organizations WHERE id = 'fa170000-0000-4000-8000-000000000101' $$,
  'P0001', 'Organization files must be removed before deletion', 'leftover file metadata refuses parent deletion');
SELECT is((SELECT count(*)::integer FROM public.organizations WHERE id = 'fa170000-0000-4000-8000-000000000101'),
  1, 'refused parent remains');
DELETE FROM storage.objects WHERE id = 'fa170000-0000-4000-8000-000000000519';
DELETE FROM public.organizations WHERE id = 'fa170000-0000-4000-8000-000000000101';
-- Metadata-only historical orphan, deliberately created after the parent is gone.
INSERT INTO storage.objects (id, bucket_id, name) VALUES
  ('fa170000-0000-4000-8000-000000000519', 'counseling-files', 'fa170000-0000-4000-8000-000000000101/leftover.pdf');
SET LOCAL ROLE authenticated;
SELECT ok(NOT public.organization_storage_object_is_owner_removable('counseling-files', 'fa170000-0000-4000-8000-000000000101/leftover.pdf'),
  'deleted Organization grants no prefix access');
WITH removed AS (DELETE FROM storage.objects WHERE id = 'fa170000-0000-4000-8000-000000000519' RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'former owner cannot remove a leftover after Organization deletion');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM storage.objects WHERE id = 'fa170000-0000-4000-8000-000000000519'),
  1, 'metadata leftover survives denied removal; application must clean Storage first');
SELECT results_eq(
  $$ SELECT id, to_jsonb(object_row) FROM storage.objects AS object_row WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000509' AND 'fa170000-0000-4000-8000-000000000518' ORDER BY id $$,
  $$ SELECT row_id::uuid, row_data FROM upgrade_fixture.organization_storage_cleanup_before_rows WHERE table_name = 'storage.objects' AND row_id BETWEEN 'fa170000-0000-4000-8000-000000000509' AND 'fa170000-0000-4000-8000-000000000518' ORDER BY row_id $$,
  'all malformed, foreign and unrelated-bucket objects retain their exact original values');
SELECT results_eq(
  $$ SELECT 'organization'::text, to_jsonb(org_row) - 'training_readiness_goal_percent' FROM public.organizations AS org_row WHERE id = 'fa170000-0000-4000-8000-000000000102'
     UNION ALL SELECT 'membership', to_jsonb(member_row) FROM public.organization_memberships AS member_row WHERE organization_id = 'fa170000-0000-4000-8000-000000000102' ORDER BY 1 $$,
  $$ SELECT CASE table_name WHEN 'public.organizations' THEN 'organization' ELSE 'membership' END, row_data FROM upgrade_fixture.organization_storage_cleanup_before_rows
     WHERE (table_name = 'public.organizations' AND row_id = 'fa170000-0000-4000-8000-000000000102') OR (table_name = 'public.organization_memberships' AND row_data->>'organization_id' = 'fa170000-0000-4000-8000-000000000102') ORDER BY 1 $$,
  'foreign Organization and membership values remain exact after authorized A removals');
