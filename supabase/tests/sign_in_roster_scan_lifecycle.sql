BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
	('b1643000-0000-4000-8000-000000000001', 'roster-scan-owner@example.test'),
	('b1643000-0000-4000-8000-000000000002', 'roster-scan-operator@example.test'),
	('b1643000-0000-4000-8000-000000000003', 'roster-scan-group-operator@example.test'),
	('b1643000-0000-4000-8000-000000000004', 'roster-scan-viewer@example.test'),
	('b1643000-0000-4000-8000-000000000005', 'roster-scan-foreign@example.test'),
	('b1643000-0000-4000-8000-000000000006', 'roster-scan-suspended@example.test'),
	('b1643000-0000-4000-8000-000000000007', 'roster-scan-personnel@example.test');

INSERT INTO public.organizations (id, name, created_by) VALUES
	('b1643000-0000-4000-8000-000000000101', 'Roster Scan Alpha', 'b1643000-0000-4000-8000-000000000001'),
	('b1643000-0000-4000-8000-000000000102', 'Roster Scan Bravo', 'b1643000-0000-4000-8000-000000000005');

INSERT INTO public.groups (id, organization_id, name) VALUES
	('b1643000-0000-4000-8000-000000000201', 'b1643000-0000-4000-8000-000000000101', 'First'),
	('b1643000-0000-4000-8000-000000000202', 'b1643000-0000-4000-8000-000000000101', 'Second');

INSERT INTO public.organization_memberships (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids) VALUES
	('b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000001', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
	('b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000002', 'member', 'viewer', '{"training":"operate"}', 'organization', ARRAY[]::uuid[]),
	('b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000003', 'member', 'viewer', '{"training":"operate"}', 'groups', ARRAY['b1643000-0000-4000-8000-000000000201']::uuid[]),
	('b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000004', 'member', 'viewer', '{"training":"view"}', 'organization', ARRAY[]::uuid[]),
	('b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000006', 'member', 'viewer', '{"training":"operate"}', 'organization', ARRAY[]::uuid[]),
	('b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000007', 'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]),
	('b1643000-0000-4000-8000-000000000102', 'b1643000-0000-4000-8000-000000000005', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.user_suspensions (user_id, suspended_by, reason) VALUES ('b1643000-0000-4000-8000-000000000006', 'b1643000-0000-4000-8000-000000000001', 'Roster scan suspension fixture');

INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
	('b1643000-0000-4000-8000-000000000301', 'b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000201', 'SGT', 'Avery', 'First', 'roster-scan-first'),
	('b1643000-0000-4000-8000-000000000302', 'b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000202', 'SPC', 'Blake', 'Second', 'roster-scan-second');

CREATE FUNCTION pg_temp.roster(p_roster text, p_name text, p_org text DEFAULT '101') RETURNS text LANGUAGE sql AS $$
	SELECT 'b1643000-0000-4000-8000-000000000' || p_org || '/sign-in-rosters/b1643000-0000-4000-8000-000000000' || p_roster || '/' || p_name
$$;
CREATE FUNCTION pg_temp.counsel(p_name text) RETURNS text LANGUAGE sql AS $$
	SELECT 'b1643000-0000-4000-8000-000000000101/counseling-records/b1643000-0000-4000-8000-000000000301/' || p_name
$$;
CREATE FUNCTION pg_temp.doc(p_name text) RETURNS text LANGUAGE sql AS $$
	SELECT 'b1643000-0000-4000-8000-000000000101/personnel/b1643000-0000-4000-8000-000000000301/documents/' || p_name
$$;
CREATE FUNCTION pg_temp.retirement(p_bucket text, p_name text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
	SELECT CASE WHEN object_name IS NULL THEN 'removed' ELSE 'pending' END
	FROM organization_private.file_retirements
	WHERE key_digest = sha256(convert_to(p_bucket || '/' || p_name, 'UTF8'))
$$;
CREATE FUNCTION pg_temp.scan_retirement(p_name text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
	SELECT pg_temp.retirement('counseling-files', p_name)
$$;
CREATE FUNCTION pg_temp.held(p_name text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
	SELECT EXISTS (SELECT 1 FROM organization_private.file_retirement_holds
		WHERE key_digest = sha256(convert_to('counseling-files/' || p_name, 'UTF8')))
$$;
CREATE FUNCTION pg_temp.listed(p_name text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
	SELECT EXISTS (SELECT 1 FROM public.list_pending_organization_file_retirements(1000) WHERE object_name = p_name)
$$;
CREATE FUNCTION pg_temp.pointer(p_roster text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
	SELECT signed_file_path FROM public.sign_in_rosters WHERE id = ('b1643000-0000-4000-8000-000000000' || p_roster)::uuid
$$;
CREATE FUNCTION pg_temp.act_as(p_user_id uuid) RETURNS void LANGUAGE sql AS $$
	SELECT set_config('role', 'authenticated', true),
		set_config('request.jwt.claim.sub', p_user_id::text, true),
		set_config('request.jwt.claim.role', 'authenticated', true),
		set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
CREATE FUNCTION pg_temp.act_as_service() RETURNS void LANGUAGE sql AS $$
	SELECT set_config('role', 'service_role', true),
		set_config('request.jwt.claim.sub', '', true),
		set_config('request.jwt.claim.role', 'service_role', true),
		set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
CREATE FUNCTION pg_temp.act_as_fixture() RETURNS void LANGUAGE sql AS $$
	SELECT set_config('role', 'none', true),
		set_config('request.jwt.claim.sub', '', true),
		set_config('request.jwt.claim.role', '', true),
		set_config('request.jwt.claims', '', true);
$$;
CREATE FUNCTION pg_temp.stage_upload(p_actor text, p_key text, p_org text DEFAULT '101') RETURNS void LANGUAGE sql AS $$
	INSERT INTO organization_private.file_uploads (id, organization_id, actor_id, bucket_id, object_name)
		VALUES (gen_random_uuid(), ('b1643000-0000-4000-8000-000000000' || p_org)::uuid, ('b1643000-0000-4000-8000-000000000' || p_actor)::uuid, 'counseling-files', p_key);
	INSERT INTO storage.objects (bucket_id, name) VALUES ('counseling-files', p_key);
$$;
CREATE FUNCTION pg_temp.attach(p_roster text, p_key text) RETURNS text LANGUAGE sql AS $$
	SELECT public.attach_sign_in_roster_scan('b1643000-0000-4000-8000-000000000101', ('b1643000-0000-4000-8000-000000000' || p_roster)::uuid, p_key)
$$;
CREATE FUNCTION pg_temp.remove(p_roster text, p_key text) RETURNS text[] LANGUAGE sql AS $$
	SELECT ARRAY[outcome, retired_object_name] FROM public.remove_sign_in_roster_scan(
		'b1643000-0000-4000-8000-000000000101', ('b1643000-0000-4000-8000-000000000' || p_roster)::uuid, p_key)
$$;
CREATE FUNCTION pg_temp.delete(p_roster text) RETURNS text[] LANGUAGE sql AS $$
	SELECT ARRAY[title, retired_object_name] FROM public.delete_sign_in_roster(
		'b1643000-0000-4000-8000-000000000101', ('b1643000-0000-4000-8000-000000000' || p_roster)::uuid)
$$;
CREATE FUNCTION pg_temp.insert_roster(p_roster text, p_title text) RETURNS uuid LANGUAGE sql AS $$
	INSERT INTO public.sign_in_rosters (id, organization_id, title, roster_date, personnel_snapshot, personnel_ids, scope_group_ids, created_by)
	VALUES (('b1643000-0000-4000-8000-000000000' || p_roster)::uuid, 'b1643000-0000-4000-8000-000000000101', p_title, '2030-03-01',
		'[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}',
		'b1643000-0000-4000-8000-000000000001')
	RETURNING id
$$;
CREATE FUNCTION pg_temp.definer_insert_roster(p_roster text, p_title text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
	SELECT pg_temp.insert_roster(p_roster, p_title)
$$;
CREATE FUNCTION pg_temp.upsert_roster(p_roster text, p_title text) RETURNS uuid LANGUAGE sql AS $$
	INSERT INTO public.sign_in_rosters (id, organization_id, title, roster_date, personnel_snapshot, personnel_ids, scope_group_ids, created_by)
	VALUES (('b1643000-0000-4000-8000-000000000' || p_roster)::uuid, 'b1643000-0000-4000-8000-000000000101', p_title, '2030-03-01',
		'[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}',
		'b1643000-0000-4000-8000-000000000001')
	ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
	RETURNING id
$$;
CREATE FUNCTION pg_temp.settle(p_roster text, p_key text) RETURNS text[] LANGUAGE sql AS $$
	SELECT ARRAY[attached::text, retired_object_name] FROM public.settle_sign_in_roster_scan_upload(
		'b1643000-0000-4000-8000-000000000101', ('b1643000-0000-4000-8000-000000000' || p_roster)::uuid, p_key)
$$;

INSERT INTO public.sign_in_rosters (id, organization_id, title, roster_date, personnel_snapshot, personnel_ids, scope_group_ids, signed_file_path, created_by)
SELECT ('b1643000-0000-4000-8000-000000000' || roster)::uuid, ('b1643000-0000-4000-8000-000000000' || org)::uuid, title, '2030-03-01',
	snapshot::jsonb, people::uuid[], scope::uuid[], pointer, 'b1643000-0000-4000-8000-000000000001'
FROM (VALUES
	('401', '101', 'Alpha', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', pg_temp.roster('401', 'alpha.pdf')),
	('402', '101', 'Mixed', '[{"id":"b1643000-0000-4000-8000-000000000301"},{"id":"b1643000-0000-4000-8000-000000000302"}]', '{b1643000-0000-4000-8000-000000000301,b1643000-0000-4000-8000-000000000302}', '{b1643000-0000-4000-8000-000000000201,b1643000-0000-4000-8000-000000000202}', pg_temp.roster('402', 'mixed.pdf')),
	('403', '101', 'Legacy', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', 'b1643000-0000-4000-8000-000000000101/b1643000-0000-4000-8000-000000000403/signed.pdf'),
	('404', '101', 'Empty', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', NULL),
	('405', '101', 'Delete me', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', pg_temp.roster('405', 'delete.pdf')),
	('406', '101', 'Direct delete', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', pg_temp.roster('406', 'direct.pdf')),
	('407', '101', 'Shared key', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', pg_temp.roster('407', 'shared.pdf')),
	('408', '101', 'Settle', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', NULL),
	('409', '101', 'Cross pointer', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', pg_temp.roster('408', 'cross.pdf')),
	('410', '101', 'Owner cleanup', '[]', '{}', '{}', pg_temp.roster('410', 'owner.pdf')),
	('411', '102', 'Foreign', '[]', '{}', '{}', pg_temp.roster('411', 'foreign.pdf', '102')),
	('412', '101', 'Recreate attach', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', NULL),
	('413', '101', 'Unsigned identity', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', NULL),
	('415', '101', 'Shared delete', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', pg_temp.roster('415', 'shared-delete.pdf')),
	('416', '101', 'Cross owner', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', pg_temp.roster('416', 'cross-owner.pdf')),
	('417', '101', 'Cross holder', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', pg_temp.roster('416', 'cross-owner.pdf')),
	('418', '101', 'Reverse legacy', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', pg_temp.counsel('reverse.pdf')),
	('419', '102', 'Foreign reference', '[]', '{}', '{}', pg_temp.roster('401', 'foreign-ref.pdf')),
	('420', '101', 'Open registration', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', pg_temp.roster('401', 'open.pdf')),
	('421', '101', 'Clear first', '[{"id":"b1643000-0000-4000-8000-000000000301"}]', '{b1643000-0000-4000-8000-000000000301}', '{b1643000-0000-4000-8000-000000000201}', pg_temp.roster('421', 'clear-first.pdf'))
) AS fixture(roster, org, title, snapshot, people, scope, pointer);

INSERT INTO storage.objects (bucket_id, name)
SELECT DISTINCT 'counseling-files', signed_file_path FROM public.sign_in_rosters WHERE id::text LIKE 'b1643000-%' AND signed_file_path IS NOT NULL
UNION ALL SELECT 'counseling-files', pg_temp.roster('401', 'stray.pdf')
UNION ALL SELECT 'counseling-files', pg_temp.counsel('sentinel.pdf');
INSERT INTO storage.objects (bucket_id, name) VALUES ('personnel-documents', pg_temp.doc('sentinel.pdf'));
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path) VALUES
	('b1643000-0000-4000-8000-000000000501', 'b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000301', '2030-01-01', 'Sentinel', 'Sentinel', 'fixture', pg_temp.counsel('sentinel.pdf')),
	('b1643000-0000-4000-8000-000000000502', 'b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000301', '2030-01-01', 'Shared', 'Shared', 'fixture', pg_temp.roster('407', 'shared.pdf')),
	('b1643000-0000-4000-8000-000000000506', 'b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000301', '2030-01-01', 'Clear first', 'Clear first', 'fixture', pg_temp.roster('421', 'clear-first.pdf'));
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path, archived_at) VALUES
	('b1643000-0000-4000-8000-000000000504', 'b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000301', '2030-01-01', 'Shared delete', 'Shared delete', 'fixture', pg_temp.roster('415', 'shared-delete.pdf'), '2030-01-01'),
	('b1643000-0000-4000-8000-000000000505', 'b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000301', '2030-01-01', 'Reverse', 'Reverse', 'fixture', pg_temp.counsel('reverse.pdf'), '2030-01-01');
INSERT INTO organization_private.file_uploads (id, organization_id, actor_id, bucket_id, object_name)
	VALUES ('b1643000-0000-4000-8000-000000000602', 'b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000003', 'counseling-files', pg_temp.roster('401', 'open.pdf'));
INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by) VALUES
	('b1643000-0000-4000-8000-000000000503', 'b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000301', 'Sentinel', pg_temp.doc('sentinel.pdf'), 1, 'application/pdf', 'fixture');

SELECT is(pg_temp.pointer('403'), 'b1643000-0000-4000-8000-000000000101/b1643000-0000-4000-8000-000000000403/signed.pdf',
	'a trusted fixture still saves a legacy pointer unchanged');

SELECT ok(
	has_function_privilege('authenticated', 'public.attach_sign_in_roster_scan(uuid,uuid,text)', 'EXECUTE')
	AND has_function_privilege('authenticated', 'public.remove_sign_in_roster_scan(uuid,uuid,text)', 'EXECUTE')
	AND has_function_privilege('authenticated', 'public.delete_sign_in_roster(uuid,uuid)', 'EXECUTE'),
	'members call the three roster scan commands');
SELECT ok(
	NOT has_function_privilege('anon', 'public.attach_sign_in_roster_scan(uuid,uuid,text)', 'EXECUTE')
	AND NOT has_function_privilege('anon', 'public.remove_sign_in_roster_scan(uuid,uuid,text)', 'EXECUTE')
	AND NOT has_function_privilege('anon', 'public.delete_sign_in_roster(uuid,uuid)', 'EXECUTE')
	AND NOT has_function_privilege('service_role', 'public.attach_sign_in_roster_scan(uuid,uuid,text)', 'EXECUTE')
	AND NOT has_function_privilege('service_role', 'public.remove_sign_in_roster_scan(uuid,uuid,text)', 'EXECUTE')
	AND NOT has_function_privilege('service_role', 'public.delete_sign_in_roster(uuid,uuid)', 'EXECUTE'),
	'neither anon nor the service role holds the member commands');
SELECT ok(
	has_function_privilege('service_role', 'public.settle_sign_in_roster_scan_upload(uuid,uuid,text)', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'public.settle_sign_in_roster_scan_upload(uuid,uuid,text)', 'EXECUTE')
	AND NOT has_function_privilege('anon', 'public.settle_sign_in_roster_scan_upload(uuid,uuid,text)', 'EXECUTE'),
	'only the service role settles an upload');
SELECT ok(
	NOT has_function_privilege('authenticated', 'organization_private.lock_managed_sign_in_roster(uuid,uuid)', 'EXECUTE')
	AND NOT has_function_privilege('service_role', 'organization_private.lock_managed_sign_in_roster(uuid,uuid)', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'organization_private.pending_roster_file_retirement(text)', 'EXECUTE')
	AND NOT has_function_privilege('service_role', 'organization_private.guard_sign_in_roster()', 'EXECUTE'),
	'helpers stay private');
SELECT is(
	(SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies
		WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'DELETE'
			AND policyname IN ('Sensitive files are deletable by authorized editors', 'Organization owners can remove retained private files')),
	ARRAY['Organization owners can remove retained private files'],
	'the editor Storage delete policy is gone and the owner policy remains');

SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000002');
SELECT throws_ok($$ UPDATE public.sign_in_rosters SET signed_file_path = NULL WHERE id = 'b1643000-0000-4000-8000-000000000401' $$,
	'42501', 'Signed scans change only through roster scan commands', 'a member cannot clear a pointer directly');
SELECT throws_ok(format('UPDATE public.sign_in_rosters SET signed_file_path = %L WHERE id = %L', pg_temp.roster('404', 'patched.pdf'), 'b1643000-0000-4000-8000-000000000404'),
	'42501', 'Signed scans change only through roster scan commands', 'a member cannot set a pointer directly');
SELECT throws_ok(format($q$INSERT INTO public.sign_in_rosters (organization_id, title, roster_date, personnel_snapshot, personnel_ids, scope_group_ids, signed_file_path, created_by)
	VALUES ('b1643000-0000-4000-8000-000000000101', 'Inserted', '2030-03-01', '[]', '{}', '{}', %L, 'b1643000-0000-4000-8000-000000000002')$q$, pg_temp.roster('404', 'inserted.pdf')),
	'42501', 'Signed scans change only through roster scan commands', 'a member cannot insert a roster with a pointer');
SELECT lives_ok($$ UPDATE public.sign_in_rosters SET title = 'Alpha renamed' WHERE id = 'b1643000-0000-4000-8000-000000000401' $$,
	'a member still edits other roster fields');
SELECT is(pg_temp.pointer('401'), pg_temp.roster('401', 'alpha.pdf'), 'a title edit keeps the pointer');
SELECT isnt(pg_temp.upsert_roster('401', 'Upserted'), 'b1643000-0000-4000-8000-000000000401'::uuid,
	'a member upsert naming an existing roster id inserts a roster with a new id');
SELECT is((SELECT title FROM public.sign_in_rosters WHERE id = 'b1643000-0000-4000-8000-000000000401'), 'Alpha renamed',
	'the upsert leaves the existing roster unchanged');
SELECT isnt(pg_temp.definer_insert_roster('422', 'Definer'), 'b1643000-0000-4000-8000-000000000422'::uuid,
	'a member-invoked definer insert cannot choose the roster id');
SELECT throws_ok($$ UPDATE public.sign_in_rosters SET id = 'b1643000-0000-4000-8000-000000000499' WHERE id = 'b1643000-0000-4000-8000-000000000413' $$,
	'23514', 'A roster cannot change identity', 'a member cannot move an unsigned roster to another id');
SELECT throws_ok($$ UPDATE public.sign_in_rosters SET organization_id = 'b1643000-0000-4000-8000-000000000102' WHERE id = 'b1643000-0000-4000-8000-000000000413' $$,
	'23514', 'A roster cannot change identity', 'a member cannot move an unsigned roster to another Organization');

SELECT pg_temp.act_as_fixture();
SELECT throws_ok($$ UPDATE public.sign_in_rosters SET id = 'b1643000-0000-4000-8000-000000000499' WHERE id = 'b1643000-0000-4000-8000-000000000401' $$,
	'23514', 'A roster cannot change identity', 'a roster with a scan keeps its id for every writer');
SELECT throws_ok($$ UPDATE public.sign_in_rosters SET organization_id = 'b1643000-0000-4000-8000-000000000102' WHERE id = 'b1643000-0000-4000-8000-000000000401' $$,
	'23514', 'A roster cannot change identity', 'a roster with a scan keeps its Organization');
SELECT throws_ok($$ UPDATE public.sign_in_rosters SET id = 'b1643000-0000-4000-8000-000000000499' WHERE id = 'b1643000-0000-4000-8000-000000000413' $$,
	'23514', 'A roster cannot change identity', 'an unsigned roster keeps its id for every writer');
SELECT throws_ok($$ UPDATE public.sign_in_rosters SET organization_id = 'b1643000-0000-4000-8000-000000000102' WHERE id = 'b1643000-0000-4000-8000-000000000413' $$,
	'23514', 'A roster cannot change identity', 'an unsigned roster keeps its Organization for every writer');
SELECT is(pg_temp.insert_roster('423', 'Trusted'), 'b1643000-0000-4000-8000-000000000423'::uuid, 'a trusted writer keeps an explicit roster id');
SELECT pg_temp.act_as_service();
SELECT is(pg_temp.insert_roster('424', 'Service'), 'b1643000-0000-4000-8000-000000000424'::uuid, 'the service role keeps an explicit roster id');
SELECT pg_temp.act_as_fixture();
SELECT throws_ok($$ SELECT organization_private.artifact_file_referenced('unknown', 'x') $$,
	'22023', 'Unknown stored file kind', 'an unknown stored file kind no longer falls through to documents');

SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000004');
SELECT is((SELECT array_agg(name ORDER BY name) FROM storage.objects WHERE name LIKE 'b1643000-0000-4000-8000-000000000101/sign-in-rosters/b1643000-0000-4000-8000-000000000401/%'),
	ARRAY[pg_temp.roster('401', 'alpha.pdf')], 'a viewer reads the current scan and not a stray key under the roster');
SELECT ok(NOT public.sensitive_file_object_is_readable('counseling-files', pg_temp.roster('401', 'stray.pdf')), 'a key that is not the pointer is unreadable');
SELECT throws_ok($$ SELECT pg_temp.attach('404', pg_temp.roster('404', 'viewer.pdf')) $$,
	'42501', 'Sign-in roster management is not allowed', 'a viewer cannot attach');

SELECT pg_temp.act_as_fixture();
SELECT pg_temp.stage_upload('003', pg_temp.roster('401', 'next.pdf'));
SELECT pg_temp.stage_upload('002', pg_temp.roster('401', 'other-actor.pdf'));
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000003');
SELECT throws_ok($$ SELECT pg_temp.attach('401', pg_temp.roster('401', 'unregistered.pdf')) $$,
	'55000', 'This scan upload is no longer in progress', 'an unregistered key cannot attach');
SELECT throws_ok($$ SELECT pg_temp.attach('401', pg_temp.roster('401', 'other-actor.pdf')) $$,
	'55000', 'This scan upload is no longer in progress', 'another member''s upload cannot attach');
SELECT throws_ok($$ SELECT pg_temp.attach('401', pg_temp.counsel('sentinel.pdf')) $$,
	'22023', 'Invalid signed scan key', 'a counseling key cannot attach to a roster');
SELECT throws_ok($$ SELECT pg_temp.attach('401', pg_temp.roster('404', 'next.pdf')) $$,
	'22023', 'Invalid signed scan key', 'another roster''s key cannot attach');
SELECT throws_ok($$ SELECT pg_temp.attach('402', pg_temp.roster('402', 'next.pdf')) $$,
	'P0002', 'This roster is no longer available', 'a roster outside the member''s view is not available');
SELECT throws_ok($$ SELECT pg_temp.attach('498', pg_temp.roster('498', 'next.pdf')) $$,
	'P0002', 'This roster is no longer available', 'an absent roster is not available');
SELECT is(pg_temp.attach('401', pg_temp.roster('401', 'next.pdf')), pg_temp.roster('401', 'alpha.pdf'), 'attach returns the displaced key');
SELECT is(pg_temp.pointer('401'), pg_temp.roster('401', 'next.pdf'), 'the latest attachment is the scan');
SELECT is(ARRAY[pg_temp.scan_retirement(pg_temp.roster('401', 'alpha.pdf')), pg_temp.scan_retirement(pg_temp.roster('401', 'next.pdf'))],
	ARRAY['pending', NULL], 'the displaced key retires in the attach transaction');
SELECT is(pg_temp.attach('401', pg_temp.roster('401', 'next.pdf')), NULL, 'a repeated attach of the current key changes nothing');

SELECT pg_temp.act_as_fixture();
INSERT INTO organization_private.file_uploads (id, organization_id, actor_id, bucket_id, object_name)
	VALUES ('b1643000-0000-4000-8000-000000000601', 'b1643000-0000-4000-8000-000000000101', 'b1643000-0000-4000-8000-000000000003', 'counseling-files', pg_temp.roster('401', 'alpha.pdf'));
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000003');
SELECT throws_ok($$ SELECT pg_temp.attach('401', pg_temp.roster('401', 'alpha.pdf')) $$,
	'23514', 'This stored file was deleted and cannot be attached', 'a retired key never attaches again');
SELECT is(pg_temp.pointer('401'), pg_temp.roster('401', 'next.pdf'), 'the refused attach leaves the scan');

SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000005');
SELECT throws_ok($$ SELECT pg_temp.attach('404', pg_temp.roster('404', 'foreign.pdf')) $$,
	'42501', 'Sign-in roster management is not allowed', 'another Organization''s member cannot attach');
SELECT throws_ok($$ SELECT public.attach_sign_in_roster_scan('b1643000-0000-4000-8000-000000000102', 'b1643000-0000-4000-8000-000000000404', pg_temp.roster('404', 'foreign.pdf', '102')) $$,
	'P0002', 'This roster is no longer available', 'a roster from another Organization is not available');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000006');
SELECT throws_ok($$ SELECT pg_temp.attach('404', pg_temp.roster('404', 'suspended.pdf')) $$,
	'42501', 'Sign-in roster management is not allowed', 'a suspended member cannot attach');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000002');
SELECT throws_ok($$ SELECT pg_temp.attach('403', pg_temp.roster('403', 'legacy.pdf')) $$,
	'22023', 'This roster''s signed scan uses an unsupported storage location', 'a legacy pointer is not replaced');

SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000003');
SAVEPOINT rolled_back_attach;
SELECT pg_temp.act_as_fixture();
SELECT pg_temp.stage_upload('003', pg_temp.roster('401', 'rolled-back.pdf'));
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000003');
SELECT is(pg_temp.attach('401', pg_temp.roster('401', 'rolled-back.pdf')), pg_temp.roster('401', 'next.pdf'), 'an attach inside a rolled back transaction displaces the scan');
ROLLBACK TO SAVEPOINT rolled_back_attach;
SELECT is(ARRAY[pg_temp.pointer('401'), pg_temp.scan_retirement(pg_temp.roster('401', 'next.pdf'))], ARRAY[pg_temp.roster('401', 'next.pdf'), NULL],
	'rollback restores the scan and its retirement together');

SELECT is(pg_temp.remove('401', pg_temp.roster('401', 'alpha.pdf')), ARRAY['changed', NULL], 'removing a scan that changed writes nothing');
SELECT is(pg_temp.pointer('401'), pg_temp.roster('401', 'next.pdf'), 'the newer scan stays');
SELECT throws_ok($$ SELECT pg_temp.remove('401', pg_temp.counsel('sentinel.pdf')) $$,
	'22023', 'Invalid signed scan key', 'removal names only a key under the roster');
SELECT is(pg_temp.remove('401', pg_temp.roster('401', 'next.pdf')), ARRAY['removed', pg_temp.roster('401', 'next.pdf')], 'removal clears the observed scan');
SELECT is(ARRAY[pg_temp.pointer('401'), pg_temp.scan_retirement(pg_temp.roster('401', 'next.pdf'))], ARRAY[NULL, 'pending'],
	'removal retires the key in the same transaction');
SELECT is(pg_temp.remove('401', pg_temp.roster('401', 'next.pdf')), ARRAY['removed', pg_temp.roster('401', 'next.pdf')], 'a repeated removal returns the pending key');
SELECT pg_temp.act_as_service();
SELECT is(public.complete_organization_file_retirements('counseling-files', ARRAY[pg_temp.roster('401', 'next.pdf')]), 1, 'the drain completes the removed key');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000003');
SELECT is(pg_temp.remove('401', pg_temp.roster('401', 'next.pdf')), ARRAY['removed', NULL], 'a removal after cleanup reports nothing pending');
SELECT is(pg_temp.remove('407', pg_temp.roster('407', 'shared.pdf')), ARRAY['removed', NULL], 'a key a counseling record still references is removed from the roster');
SELECT is(pg_temp.scan_retirement(pg_temp.roster('407', 'shared.pdf')), NULL, 'the shared bucket key is not retired');
SELECT ok(pg_temp.held(pg_temp.roster('407', 'shared.pdf')), 'the owner release is held while a counseling record references the key');
SELECT ok(NOT pg_temp.listed(pg_temp.roster('407', 'shared.pdf')), 'the drain does not list a held key');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000007');
SELECT lives_ok($$ UPDATE public.counseling_records SET file_path = NULL WHERE id = 'b1643000-0000-4000-8000-000000000502' $$,
	'a Personnel configurator clears the last reference');
SELECT pg_temp.act_as_fixture();
SELECT ok(pg_temp.listed(pg_temp.roster('407', 'shared.pdf')), 'the next drain lists the released key once no record references it');
SELECT is(ARRAY[pg_temp.scan_retirement(pg_temp.roster('407', 'shared.pdf')), pg_temp.held(pg_temp.roster('407', 'shared.pdf'))::text], ARRAY['pending', 'false'],
	'promotion retires the key and clears its hold');
SELECT pg_temp.act_as_service();
SELECT is(public.complete_organization_file_retirements('counseling-files', ARRAY[pg_temp.roster('407', 'shared.pdf')]), 1, 'the drain completes the promoted key');
SELECT throws_ok(format('SELECT public.register_organization_file_upload(%L, %L, %L, %L, %L)', gen_random_uuid(), 'b1643000-0000-4000-8000-000000000101',
		'b1643000-0000-4000-8000-000000000003', 'counseling-files', pg_temp.roster('407', 'shared.pdf')),
	'23514', 'This stored file was deleted and cannot be reused', 'a completed promoted key stays fenced');
SELECT is(pg_temp.scan_retirement(pg_temp.roster('407', 'shared.pdf')), 'removed', 'completion keeps the promoted key''s digest');

SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000007');
SELECT lives_ok($$ UPDATE public.counseling_records SET file_path = NULL WHERE id = 'b1643000-0000-4000-8000-000000000506' $$,
	'a nonowning counseling reference clears first');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000003');
SELECT is(pg_temp.remove('421', pg_temp.roster('421', 'clear-first.pdf')), ARRAY['removed', pg_temp.roster('421', 'clear-first.pdf')],
	'the owner release after the last other reference retires the key at once');
SELECT is(ARRAY[pg_temp.scan_retirement(pg_temp.roster('421', 'clear-first.pdf')), pg_temp.held(pg_temp.roster('421', 'clear-first.pdf'))::text], ARRAY['pending', 'false'],
	'an unreferenced owner release is not held');

SELECT is(pg_temp.remove('415', pg_temp.roster('415', 'shared-delete.pdf')), ARRAY['removed', NULL], 'a shared owner release reports nothing to remove');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000007');
SELECT lives_ok($$ DELETE FROM public.counseling_records WHERE id = 'b1643000-0000-4000-8000-000000000504' $$,
	'a Personnel configurator deletes the last counseling reference');
SELECT pg_temp.act_as_service();
SELECT results_eq($$ SELECT bucket_id, object_name, file_removed FROM public.personnel_file_artifact_deletion('b1643000-0000-4000-8000-000000000101',
		'b1643000-0000-4000-8000-000000000301', 'counseling', 'b1643000-0000-4000-8000-000000000504') $$,
	$$ VALUES (NULL::text, NULL::text, true) $$, 'the counseling receipt does not claim the roster key');
SELECT ok(pg_temp.listed(pg_temp.roster('415', 'shared-delete.pdf')), 'a final counseling deletion makes the held key drainable');
SELECT is(pg_temp.scan_retirement(pg_temp.roster('415', 'shared-delete.pdf')), 'pending', 'the held key retires after the counseling deletion');

SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000003');
SELECT is(pg_temp.remove('416', pg_temp.roster('416', 'cross-owner.pdf')), ARRAY['removed', NULL], 'an owner release shared with another roster reports nothing to remove');
SELECT ok(pg_temp.held(pg_temp.roster('416', 'cross-owner.pdf')), 'the owner release is held while another roster references the key');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000002');
SELECT lives_ok($$ DELETE FROM public.sign_in_rosters WHERE id = 'b1643000-0000-4000-8000-000000000417' $$, 'a member deletes the nonowning roster directly');
SELECT pg_temp.act_as_fixture();
SELECT is(pg_temp.scan_retirement(pg_temp.roster('416', 'cross-owner.pdf')), NULL, 'the nonowning deletion retires nothing by itself');
SELECT ok(pg_temp.listed(pg_temp.roster('416', 'cross-owner.pdf')), 'the next drain lists the key the nonowning roster released last');
SELECT is(ARRAY[pg_temp.scan_retirement(pg_temp.roster('416', 'cross-owner.pdf')), pg_temp.held(pg_temp.roster('416', 'cross-owner.pdf'))::text], ARRAY['pending', 'false'],
	'promotion after a nonowning release retires the key and clears its hold');

SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000007');
SELECT lives_ok($$ DELETE FROM public.counseling_records WHERE id = 'b1643000-0000-4000-8000-000000000505' $$,
	'a Personnel configurator deletes a counseling record a legacy roster still references');
SELECT pg_temp.act_as_fixture();
SELECT is(ARRAY[pg_temp.retirement('counseling-files', pg_temp.counsel('reverse.pdf')), pg_temp.held(pg_temp.counsel('reverse.pdf'))::text], ARRAY[NULL, 'true'],
	'a counseling deletion holds a key a roster still references');
SELECT pg_temp.act_as_service();
SELECT results_eq($$ SELECT bucket_id, object_name, file_removed FROM public.personnel_file_artifact_deletion('b1643000-0000-4000-8000-000000000101',
		'b1643000-0000-4000-8000-000000000301', 'counseling', 'b1643000-0000-4000-8000-000000000505') $$,
	$$ VALUES (NULL::text, NULL::text, true) $$, 'the Personnel receipt reports no cleanup for the held key');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000002');
SELECT lives_ok($$ DELETE FROM public.sign_in_rosters WHERE id = 'b1643000-0000-4000-8000-000000000418' $$, 'a member deletes the legacy roster directly');
SELECT pg_temp.act_as_fixture();
SELECT is(pg_temp.retirement('counseling-files', pg_temp.counsel('reverse.pdf')), NULL, 'the legacy roster deletion retires nothing by itself');
SELECT ok(pg_temp.listed(pg_temp.counsel('reverse.pdf')), 'the next drain lists the counseling key');
SELECT is(ARRAY[pg_temp.retirement('counseling-files', pg_temp.counsel('reverse.pdf')), pg_temp.held(pg_temp.counsel('reverse.pdf'))::text], ARRAY['pending', 'false'],
	'promotion retires the counseling key and clears its hold');

SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000005');
SELECT lives_ok($$ DELETE FROM public.sign_in_rosters WHERE id = 'b1643000-0000-4000-8000-000000000419' $$, 'another Organization deletes its roster directly');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000002');
SELECT lives_ok($$ DELETE FROM public.sign_in_rosters WHERE id = 'b1643000-0000-4000-8000-000000000420' $$, 'a member deletes a roster naming an open upload directly');
SELECT pg_temp.act_as_fixture();
SELECT is(
	ARRAY[pg_temp.scan_retirement(pg_temp.roster('401', 'foreign-ref.pdf')), pg_temp.held(pg_temp.roster('401', 'foreign-ref.pdf'))::text,
		pg_temp.listed(pg_temp.roster('401', 'foreign-ref.pdf'))::text, pg_temp.scan_retirement(pg_temp.roster('401', 'open.pdf')),
		pg_temp.held(pg_temp.roster('401', 'open.pdf'))::text, pg_temp.listed(pg_temp.roster('401', 'open.pdf'))::text],
	ARRAY[NULL, 'false', 'false', NULL, 'false', 'false'],
	'releasing a key its owner never released retires nothing, across Organizations or for an open upload');
SELECT is((SELECT count(*)::integer FROM organization_private.file_uploads WHERE id = 'b1643000-0000-4000-8000-000000000602'), 1,
	'the open upload registration stays');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000003');
SELECT throws_ok($$ SELECT pg_temp.remove('403', pg_temp.roster('403', 'signed.pdf')) $$,
	'22023', 'This roster''s signed scan uses an unsupported storage location', 'a legacy pointer is not cleared');

SELECT is(pg_temp.delete('405'), ARRAY['Delete me', pg_temp.roster('405', 'delete.pdf')], 'deletion returns the title and the retired key');
SELECT is(ARRAY[(SELECT count(*)::text FROM public.sign_in_rosters WHERE id = 'b1643000-0000-4000-8000-000000000405'), pg_temp.scan_retirement(pg_temp.roster('405', 'delete.pdf'))],
	ARRAY['0', 'pending'], 'the roster and its key leave together');
SELECT throws_ok($$ SELECT pg_temp.delete('405') $$,
	'P0002', 'This roster is no longer available', 'a repeated deletion is not available');
SELECT is(pg_temp.delete('404'), ARRAY['Empty', NULL], 'a roster without a scan deletes');
SELECT isnt(pg_temp.insert_roster('404', 'Recreated 404'), 'b1643000-0000-4000-8000-000000000404'::uuid,
	'a member re-inserting a deleted roster id gets a database id');
SELECT is((SELECT count(*)::integer FROM public.sign_in_rosters WHERE id = 'b1643000-0000-4000-8000-000000000404'), 0, 'no roster takes the deleted id');
SELECT throws_ok($$ SELECT pg_temp.delete('404') $$,
	'P0002', 'This roster is no longer available', 'a deletion retry after a lost reply finds no roster');
SELECT is((SELECT count(*)::integer FROM public.sign_in_rosters WHERE title = 'Recreated 404'), 1, 'the retry leaves the new roster');
SELECT pg_temp.act_as_fixture();
SELECT pg_temp.stage_upload('003', pg_temp.roster('412', 'stale.pdf'));
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000003');
SELECT is(pg_temp.delete('412'), ARRAY['Recreate attach', NULL], 'a roster with an upload in flight deletes');
SELECT isnt(pg_temp.insert_roster('412', 'Recreated 412'), 'b1643000-0000-4000-8000-000000000412'::uuid, 'a member re-inserting it gets a database id');
SELECT throws_ok($$ SELECT pg_temp.attach('412', pg_temp.roster('412', 'stale.pdf')) $$,
	'P0002', 'This roster is no longer available', 'an upload admitted before deletion cannot attach to a recreated roster');
SELECT pg_temp.act_as_service();
SELECT is(pg_temp.settle('412', pg_temp.roster('412', 'stale.pdf')), ARRAY['false', pg_temp.roster('412', 'stale.pdf')], 'settle retires the stale upload');
SELECT pg_temp.act_as_fixture();
SELECT is((SELECT signed_file_path FROM public.sign_in_rosters WHERE title = 'Recreated 412'), NULL, 'the recreated roster has no scan');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000003');
SELECT throws_ok($$ SELECT pg_temp.delete('402') $$,
	'P0002', 'This roster is no longer available', 'a member cannot delete a roster outside their view');
SELECT throws_ok($$ SELECT pg_temp.delete('403') $$,
	'22023', 'This roster''s signed scan uses an unsupported storage location', 'a roster with a legacy pointer is not deleted');
SELECT is(ARRAY[pg_temp.pointer('402'), pg_temp.pointer('403')],
	ARRAY[pg_temp.roster('402', 'mixed.pdf'), 'b1643000-0000-4000-8000-000000000101/b1643000-0000-4000-8000-000000000403/signed.pdf'],
	'refused deletions keep their rosters and scans');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000004');
SELECT throws_ok($$ SELECT pg_temp.delete('406') $$,
	'42501', 'Sign-in roster management is not allowed', 'a viewer cannot delete');

SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000002');
SELECT lives_ok($$ DELETE FROM public.sign_in_rosters WHERE id = 'b1643000-0000-4000-8000-000000000406' $$, 'a member still deletes a roster directly');
SELECT is(pg_temp.scan_retirement(pg_temp.roster('406', 'direct.pdf')), 'pending', 'a direct deletion retires its scan');
SELECT set_config('storage.allow_delete_query', 'true', true);
WITH removed AS (DELETE FROM storage.objects WHERE name = pg_temp.roster('402', 'mixed.pdf') RETURNING 1)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'a member cannot delete roster bytes directly');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000001');
WITH removed AS (DELETE FROM storage.objects WHERE name = pg_temp.roster('410', 'owner.pdf') RETURNING 1)
SELECT is((SELECT count(*)::integer FROM removed), 1, 'the bounded owner cleanup policy still removes a live scan');

SELECT pg_temp.act_as_fixture();
SELECT pg_temp.stage_upload('003', pg_temp.roster('408', 'orphan.pdf'));
SELECT pg_temp.stage_upload('003', pg_temp.roster('408', 'kept.pdf'));
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000003');
SELECT is(pg_temp.attach('408', pg_temp.roster('408', 'kept.pdf')), NULL, 'an attach to a roster without a scan displaces nothing');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000003');
SELECT throws_ok($$ SELECT pg_temp.settle('408', pg_temp.roster('408', 'orphan.pdf')) $$,
	'42501', NULL, 'a member cannot settle an upload');
SELECT pg_temp.act_as_service();
SELECT is(pg_temp.settle('408', pg_temp.roster('408', 'kept.pdf')), ARRAY['true', NULL], 'settle reports a committed attachment');
SELECT is(pg_temp.scan_retirement(pg_temp.roster('408', 'kept.pdf')), NULL, 'the attached key is not retired');
SELECT is(pg_temp.settle('408', pg_temp.roster('408', 'orphan.pdf')), ARRAY['false', pg_temp.roster('408', 'orphan.pdf')], 'settle retires an unattached key');
SELECT is(pg_temp.settle('408', pg_temp.roster('408', 'orphan.pdf')), ARRAY['false', pg_temp.roster('408', 'orphan.pdf')], 'a repeated settle returns the same pending key');
SELECT throws_ok($$ SELECT pg_temp.settle('408', pg_temp.roster('408', 'cross.pdf')) $$,
	'23505', 'This stored file is attached to another record', 'settle never retires a key another roster references');
SELECT throws_ok($$ SELECT pg_temp.settle('408', pg_temp.counsel('sentinel.pdf')) $$,
	'22023', 'Invalid signed scan key', 'settle names only a key under the roster');
SELECT pg_temp.act_as('b1643000-0000-4000-8000-000000000003');
SELECT throws_ok($$ SELECT pg_temp.attach('408', pg_temp.roster('408', 'orphan.pdf')) $$,
	'23514', 'This stored file was deleted and cannot be attached', 'a late attach cannot claim a settled key');

SELECT pg_temp.act_as_fixture();
DELETE FROM storage.objects WHERE name LIKE 'b1643000-0000-4000-8000-000000000102/%';
DELETE FROM public.organizations WHERE id = 'b1643000-0000-4000-8000-000000000102';
SELECT is(pg_temp.scan_retirement(pg_temp.roster('411', 'foreign.pdf', '102')), 'pending', 'Organization deletion retires its roster scans');
SELECT is(ARRAY[pg_temp.retirement('counseling-files', pg_temp.counsel('sentinel.pdf')), pg_temp.retirement('personnel-documents', pg_temp.doc('sentinel.pdf')),
		pg_temp.scan_retirement('b1643000-0000-4000-8000-000000000101/b1643000-0000-4000-8000-000000000403/signed.pdf'), pg_temp.scan_retirement(pg_temp.roster('401', 'stray.pdf'))],
	ARRAY[NULL, NULL, NULL, NULL]::text[], 'roster commands never retire counseling, document, legacy or stray keys');
SELECT is((SELECT count(*)::integer FROM public.counseling_records WHERE id IN ('b1643000-0000-4000-8000-000000000501', 'b1643000-0000-4000-8000-000000000502')), 2,
	'the unrelated counseling records remain');
SELECT is(
	ARRAY[has_table_privilege('authenticated', 'organization_private.file_retirement_holds', 'SELECT'),
		has_table_privilege('service_role', 'organization_private.file_retirement_holds', 'SELECT'),
		has_function_privilege('authenticated', 'organization_private.promote_file_retirement_holds(integer)', 'EXECUTE'),
		has_function_privilege('service_role', 'organization_private.promote_file_retirement_holds(integer)', 'EXECUTE'),
		has_function_privilege('service_role', 'organization_private.guard_sign_in_roster()', 'EXECUTE')],
	ARRAY[false, false, false, false, false], 'held releases and their promotion stay private');

SELECT * FROM finish();
ROLLBACK;
