BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
	('f6430000-0000-4000-8000-000000000001', 'file-retirement-owner@example.test'),
	('f6430000-0000-4000-8000-000000000002', 'file-retirement-configurator@example.test');

INSERT INTO public.organizations (id, name, created_by) VALUES
	('f6430000-0000-4000-8000-000000000101', 'File Retirement Alpha', 'f6430000-0000-4000-8000-000000000001'),
	('f6430000-0000-4000-8000-000000000102', 'File Retirement Bravo', 'f6430000-0000-4000-8000-000000000001');

INSERT INTO public.groups (id, organization_id, name) VALUES
	('f6430000-0000-4000-8000-000000000201', 'f6430000-0000-4000-8000-000000000101', 'Alpha');

INSERT INTO public.organization_memberships (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids) VALUES
	('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000001', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
	('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000002', 'member', 'viewer',
		'{"personnel":"configure"}', 'groups', ARRAY['f6430000-0000-4000-8000-000000000201']::uuid[]),
	('f6430000-0000-4000-8000-000000000102', 'f6430000-0000-4000-8000-000000000001', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);

INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
	('f6430000-0000-4000-8000-000000000301', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000201', 'SGT', 'Avery', 'Kept', 'file-retirement-kept', NULL),
	('f6430000-0000-4000-8000-000000000302', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000201', 'SPC', 'Blake', 'Removed', 'file-retirement-removed', NULL),
	('f6430000-0000-4000-8000-000000000303', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000201', 'PFC', 'Casey', 'Expired', 'file-retirement-expired', '2020-01-01T00:00:00Z'),
	('f6430000-0000-4000-8000-000000000304', 'f6430000-0000-4000-8000-000000000102', NULL, 'SSG', 'Drew', 'Bravo', 'file-retirement-bravo', NULL),
	('f6430000-0000-4000-8000-000000000305', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000201', 'CPL', 'Emery', 'Legacy', 'file-retirement-legacy', NULL);

CREATE FUNCTION pg_temp.doc(p_person text, p_name text) RETURNS text LANGUAGE sql AS $$
	SELECT 'f6430000-0000-4000-8000-000000000101/personnel/f6430000-0000-4000-8000-000000000' || p_person || '/documents/' || p_name
$$;
CREATE FUNCTION pg_temp.counsel(p_person text, p_name text) RETURNS text LANGUAGE sql AS $$
	SELECT 'f6430000-0000-4000-8000-000000000101/counseling-records/f6430000-0000-4000-8000-000000000' || p_person || '/' || p_name
$$;
CREATE FUNCTION pg_temp.retirement(p_bucket text, p_name text) RETURNS text LANGUAGE sql AS $$
	SELECT CASE WHEN object_name IS NULL THEN 'removed' ELSE 'pending' END
	FROM organization_private.file_retirements
	WHERE key_digest = sha256(convert_to(p_bucket || '/' || p_name, 'UTF8'))
$$;
CREATE FUNCTION pg_temp.held(p_bucket text, p_name text) RETURNS boolean LANGUAGE sql AS $$
	SELECT EXISTS (SELECT 1 FROM organization_private.file_retirement_holds
		WHERE key_digest = sha256(convert_to(p_bucket || '/' || p_name, 'UTF8')))
$$;
CREATE FUNCTION pg_temp.listed(p_name text) RETURNS boolean LANGUAGE sql AS $$
	SELECT EXISTS (SELECT 1 FROM public.list_pending_organization_file_retirements(1000) WHERE object_name = p_name)
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

INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by, archived_at) VALUES
	('f6430000-0000-4000-8000-000000000511', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Direct', pg_temp.doc('301', 'direct.pdf'), 1, 'application/pdf', 'fixture', '2030-01-01T00:00:00Z'),
	('f6430000-0000-4000-8000-000000000512', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Shared one', pg_temp.doc('301', 'shared.pdf'), 1, 'application/pdf', 'fixture', '2030-01-01T00:00:00Z'),
	('f6430000-0000-4000-8000-000000000513', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Shared two', pg_temp.doc('301', 'shared.pdf'), 1, 'application/pdf', 'fixture', '2030-01-01T00:00:00Z'),
	('f6430000-0000-4000-8000-000000000514', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Invalid', 'synthetic/invalid.pdf', 1, 'application/pdf', 'fixture', '2030-01-01T00:00:00Z'),
	('f6430000-0000-4000-8000-000000000515', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Foreign', pg_temp.doc('302', 'foreign.pdf'), 1, 'application/pdf', 'fixture', '2030-01-01T00:00:00Z'),
	('f6430000-0000-4000-8000-000000000516', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Moved', pg_temp.doc('301', 'before-move.pdf'), 1, 'application/pdf', 'fixture', NULL),
	('f6430000-0000-4000-8000-000000000517', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Conditional', pg_temp.doc('301', 'conditional.pdf'), 1, 'application/pdf', 'fixture', '2030-01-01T00:00:00.123456Z'),
	('f6430000-0000-4000-8000-000000000518', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Retention', pg_temp.doc('301', 'retention.pdf'), 1, 'application/pdf', 'fixture', '2020-01-01T00:00:00Z'),
	('f6430000-0000-4000-8000-000000000519', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Recent', pg_temp.doc('301', 'recent.pdf'), 1, 'application/pdf', 'fixture', '2030-01-01T00:00:00Z'),
	('f6430000-0000-4000-8000-000000000521', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000302', 'Cascade', pg_temp.doc('302', 'cascade.pdf'), 1, 'application/pdf', 'fixture', NULL),
	('f6430000-0000-4000-8000-000000000522', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000303', 'Expired parent', pg_temp.doc('303', 'expired.pdf'), 1, 'application/pdf', 'fixture', NULL),
	('f6430000-0000-4000-8000-000000000523', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Attached', pg_temp.doc('301', 'attached.pdf'), 1, 'application/pdf', 'fixture', NULL),
	('f6430000-0000-4000-8000-000000000524', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000305', 'Legacy cross-Person', pg_temp.doc('301', 'legacy.pdf'), 1, 'application/pdf', 'fixture', NULL),
	('f6430000-0000-4000-8000-000000000525', 'f6430000-0000-4000-8000-000000000102', 'f6430000-0000-4000-8000-000000000304', 'Legacy foreign Organization', pg_temp.doc('301', 'legacy-foreign.pdf'), 1, 'application/pdf', 'fixture', NULL),
	('f6430000-0000-4000-8000-000000000527', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Cross-Person owner', pg_temp.doc('301', 'cross-person.pdf'), 1, 'application/pdf', 'fixture', '2030-01-01T00:00:00Z'),
	('f6430000-0000-4000-8000-000000000528', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000305', 'Cross-Person reference', pg_temp.doc('301', 'cross-person.pdf'), 1, 'application/pdf', 'fixture', '2030-01-01T00:00:00Z');
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path, archived_at) VALUES
	('f6430000-0000-4000-8000-000000000531', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', '2030-01-01', 'Direct', 'Direct', 'fixture', pg_temp.counsel('301', 'direct.pdf'), '2030-01-01T00:00:00Z'),
	('f6430000-0000-4000-8000-000000000532', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', '2030-01-01', 'Approved', 'Approved', 'fixture', pg_temp.counsel('301', 'approved.pdf'), NULL),
	('f6430000-0000-4000-8000-000000000533', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', '2030-01-01', 'No file', 'No file', 'fixture', NULL, '2030-01-01T00:00:00Z'),
	('f6430000-0000-4000-8000-000000000534', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000305', '2030-01-01', 'Legacy', 'Legacy', 'fixture', pg_temp.counsel('301', 'legacy.pdf'), NULL);
INSERT INTO public.deletion_requests (id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description) VALUES
	('f6430000-0000-4000-8000-000000000801', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000002', 'file-retirement-configurator@example.test', 'counseling_record', 'f6430000-0000-4000-8000-000000000532', 'Approved');

SELECT is(
	ARRAY(SELECT has_function_privilege(role_name, signature, 'EXECUTE')
		FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role_name,
		unnest(ARRAY[
			'public.delete_archived_personnel_artifact(uuid, uuid, text, uuid, timestamptz)',
			'public.personnel_file_artifact_deletion(uuid, uuid, text, uuid)',
			'public.reconcile_personnel_file_attachment(uuid, uuid, text, text)',
			'public.list_pending_organization_file_retirements(integer)',
			'public.complete_organization_file_retirements(text, text[])'
		]) AS signature ORDER BY role_name, signature),
	ARRAY[false, false, false, false, false, false, false, false, false, false, true, true, true, true, true],
	'only the server service role runs file retirement commands');
SELECT is(
	ARRAY[
		has_table_privilege('authenticated', 'organization_private.file_retirements', 'SELECT'),
		has_table_privilege('service_role', 'organization_private.file_retirements', 'SELECT'),
		has_table_privilege('authenticated', 'organization_private.file_artifact_deletions', 'SELECT'),
		has_table_privilege('service_role', 'organization_private.file_artifact_deletions', 'SELECT')
	],
	ARRAY[false, false, false, false],
	'no API role reads retired keys or deletion receipts directly');

SELECT pg_temp.act_as('f6430000-0000-4000-8000-000000000002');
WITH removed AS (
	DELETE FROM public.personnel_documents WHERE id = 'f6430000-0000-4000-8000-000000000511' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 1, 'a Personnel configurator deletes an archived document directly');
WITH removed AS (
	DELETE FROM public.counseling_records WHERE id IN ('f6430000-0000-4000-8000-000000000531', 'f6430000-0000-4000-8000-000000000533') RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 2, 'a Personnel configurator deletes archived counseling records directly');
UPDATE public.personnel_documents SET file_path = pg_temp.doc('301', 'after-move.pdf') WHERE id = 'f6430000-0000-4000-8000-000000000516';
SELECT throws_ok($$ INSERT INTO public.personnel_documents (organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by)
	VALUES ('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Reattach', pg_temp.doc('301', 'direct.pdf'), 1, 'application/pdf', 'fixture') $$,
	'23514', 'This stored file was deleted and cannot be attached', 'a direct insert cannot reattach a deleted file');
SELECT throws_ok($$ UPDATE public.personnel_documents SET file_path = pg_temp.doc('301', 'before-move.pdf') WHERE id = 'f6430000-0000-4000-8000-000000000516' $$,
	'23514', 'This stored file was deleted and cannot be attached', 'a direct update cannot point back at a detached file');
SELECT throws_ok($$ UPDATE public.personnel_documents SET id = 'f6430000-0000-4000-8000-000000000526', file_path = pg_temp.doc('301', 'direct.pdf')
	WHERE id = 'f6430000-0000-4000-8000-000000000516' $$,
	'23514', 'Personnel file record identity cannot change', 'a direct update cannot swap a document id to claim a deleted file');
SELECT throws_ok($$ UPDATE public.counseling_records SET id = 'f6430000-0000-4000-8000-000000000536', file_path = pg_temp.counsel('301', 'direct.pdf')
	WHERE id = 'f6430000-0000-4000-8000-000000000532' $$,
	'23514', 'Personnel file record identity cannot change', 'a direct update cannot swap a counseling id to claim a deleted file');
SELECT pg_temp.act_as_fixture();
SELECT is(
	ARRAY[
		pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'direct.pdf')),
		pg_temp.retirement('counseling-files', pg_temp.counsel('301', 'direct.pdf')),
		pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'before-move.pdf')),
		pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'after-move.pdf'))
	],
	ARRAY['pending', 'pending', 'pending', NULL],
	'deleted and detached keys are pending removal while the new path stays live');
SELECT results_eq(
	$$ SELECT artifact_kind, artifact_id::text, retired_key_digest IS NOT NULL FROM organization_private.file_artifact_deletions
		WHERE organization_id = 'f6430000-0000-4000-8000-000000000101' ORDER BY artifact_id $$,
	$$ VALUES ('document', 'f6430000-0000-4000-8000-000000000511', true), ('counseling', 'f6430000-0000-4000-8000-000000000531', true),
		('counseling', 'f6430000-0000-4000-8000-000000000533', false) $$,
	'each deleted record leaves a receipt naming the key it retired');
SELECT throws_ok($$ INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by)
	VALUES ('f6430000-0000-4000-8000-000000000511', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Reused', pg_temp.doc('301', 'reused.pdf'), 1, 'application/pdf', 'fixture') $$,
	'23505', 'A deleted Personnel file record id cannot be reused', 'a deleted document id cannot return for its Person');
SELECT throws_ok($$ INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by)
	VALUES ('f6430000-0000-4000-8000-000000000511', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000302', 'Reused', pg_temp.doc('302', 'reused.pdf'), 1, 'application/pdf', 'fixture') $$,
	'23505', 'A deleted Personnel file record id cannot be reused', 'a deleted document id cannot return for another Person');
SELECT throws_ok($$ INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path)
	VALUES ('f6430000-0000-4000-8000-000000000531', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', '2030-01-01', 'Reused', 'Reused', 'fixture', pg_temp.counsel('301', 'reused.pdf')) $$,
	'23505', 'A deleted Personnel file record id cannot be reused', 'a deleted counseling id cannot return for its Person');
SELECT throws_ok($$ INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path)
	VALUES ('f6430000-0000-4000-8000-000000000533', 'f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000302', '2030-01-01', 'Reused', 'Reused', 'fixture', pg_temp.counsel('302', 'reused.pdf')) $$,
	'23505', 'A deleted Personnel file record id cannot be reused', 'a deleted fileless counseling id cannot return for another Person');

DELETE FROM public.personnel_documents WHERE id IN ('f6430000-0000-4000-8000-000000000512', 'f6430000-0000-4000-8000-000000000514', 'f6430000-0000-4000-8000-000000000515');
SELECT is(
	ARRAY[
		pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'shared.pdf')),
		pg_temp.retirement('personnel-documents', 'synthetic/invalid.pdf'),
		pg_temp.retirement('personnel-documents', pg_temp.doc('302', 'foreign.pdf'))
	],
	ARRAY[NULL, NULL, NULL]::text[],
	'shared, invalid and foreign paths are not retired');
DELETE FROM public.personnel_documents WHERE id = 'f6430000-0000-4000-8000-000000000513';
SELECT is(pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'shared.pdf')), 'pending',
	'the last historical reference retires a shared key');
SELECT is(pg_temp.held('personnel-documents', pg_temp.doc('301', 'shared.pdf')), false, 'retiring a held key clears its hold');
DELETE FROM public.personnel_documents WHERE id = 'f6430000-0000-4000-8000-000000000527';
SELECT is(ARRAY[pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'cross-person.pdf')), pg_temp.held('personnel-documents', pg_temp.doc('301', 'cross-person.pdf'))::text],
	ARRAY[NULL, 'true'], 'an owner release is held while another Person''s document references the key');
SELECT ok(NOT pg_temp.listed(pg_temp.doc('301', 'cross-person.pdf')), 'the drain does not list a held document key');
DELETE FROM public.personnel_documents WHERE id = 'f6430000-0000-4000-8000-000000000528';
SELECT is(pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'cross-person.pdf')), NULL, 'the nonowning document deletion retires nothing by itself');
SELECT ok(pg_temp.listed(pg_temp.doc('301', 'cross-person.pdf')), 'the next drain lists the document key once no record references it');
SELECT is(ARRAY[pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'cross-person.pdf')), pg_temp.held('personnel-documents', pg_temp.doc('301', 'cross-person.pdf'))::text],
	ARRAY['pending', 'false'], 'promotion retires the document key and clears its hold');

DELETE FROM public.personnel WHERE id = 'f6430000-0000-4000-8000-000000000302';
SELECT pg_temp.act_as_service();
SELECT is(public.delete_expired_personnel('f6430000-0000-4000-8000-000000000101', ARRAY['f6430000-0000-4000-8000-000000000303']::uuid[], '2021-01-01T00:00:00Z'), 1,
	'Personnel retention deletes the expired parent');
WITH removed AS (
	DELETE FROM public.personnel_documents
	WHERE organization_id = 'f6430000-0000-4000-8000-000000000101' AND archived_at IS NOT NULL AND archived_at < '2021-01-01T00:00:00Z'
	RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 1, 'artifact retention deletes only the expired document');
SELECT pg_temp.act_as_fixture();
SELECT is(
	ARRAY[
		pg_temp.retirement('personnel-documents', pg_temp.doc('302', 'cascade.pdf')),
		pg_temp.retirement('personnel-documents', pg_temp.doc('303', 'expired.pdf')),
		pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'retention.pdf')),
		pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'recent.pdf'))
	],
	ARRAY['pending', 'pending', 'pending', NULL],
	'Person deletion, Personnel retention and artifact retention retire their keys');
SELECT is((SELECT count(*)::integer FROM organization_private.file_artifact_deletions
	WHERE personnel_id IN ('f6430000-0000-4000-8000-000000000302', 'f6430000-0000-4000-8000-000000000303')), 0,
	'records removed with their Person leave no receipt');

SELECT pg_temp.act_as_service();
SELECT lives_ok($$ SELECT public.approve_counseling_deletion_request('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000801',
	'f6430000-0000-4000-8000-000000000532', 'f6430000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z', pg_temp.counsel('301', 'approved.pdf')) $$,
	'counseling approval deletes the record');
SELECT results_eq(
	$$ SELECT bucket_id, object_name, file_removed FROM public.personnel_file_artifact_deletion('f6430000-0000-4000-8000-000000000101',
		'f6430000-0000-4000-8000-000000000301', 'counseling', 'f6430000-0000-4000-8000-000000000532') $$,
	$$ VALUES ('counseling-files'::text, pg_temp.counsel('301', 'approved.pdf'), false) $$,
	'the approval receipt names the pending key');
SELECT is_empty(
	$$ SELECT * FROM public.personnel_file_artifact_deletion('f6430000-0000-4000-8000-000000000102',
		'f6430000-0000-4000-8000-000000000301', 'counseling', 'f6430000-0000-4000-8000-000000000532') $$,
	'a receipt is not readable through another Organization');

SELECT is_empty(
	$$ SELECT * FROM public.delete_archived_personnel_artifact('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301',
		'document', 'f6430000-0000-4000-8000-000000000517', '2030-01-01T00:00:00Z') $$,
	'a different archive time deletes nothing and finds no receipt');
SELECT is_empty(
	$$ SELECT * FROM public.delete_archived_personnel_artifact('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000304',
		'document', 'f6430000-0000-4000-8000-000000000517', '2030-01-01T00:00:00.123456Z') $$,
	'another Person cannot delete the record');
SELECT results_eq(
	$$ SELECT deleted, bucket_id, object_name, file_removed FROM public.delete_archived_personnel_artifact('f6430000-0000-4000-8000-000000000101',
		'f6430000-0000-4000-8000-000000000301', 'document', 'f6430000-0000-4000-8000-000000000517', '2030-01-01T00:00:00.123456Z') $$,
	$$ VALUES (true, 'personnel-documents'::text, pg_temp.doc('301', 'conditional.pdf'), false) $$,
	'the observed archived record is deleted with its pending key');
SELECT results_eq(
	$$ SELECT deleted, bucket_id, object_name, file_removed FROM public.delete_archived_personnel_artifact('f6430000-0000-4000-8000-000000000101',
		'f6430000-0000-4000-8000-000000000301', 'document', 'f6430000-0000-4000-8000-000000000517', '2030-01-01T00:00:00.123456Z') $$,
	$$ VALUES (false, 'personnel-documents'::text, pg_temp.doc('301', 'conditional.pdf'), false) $$,
	'a replay answers from the receipt');
SELECT is_empty(
	$$ SELECT * FROM public.delete_archived_personnel_artifact('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301',
		'document', 'f6430000-0000-4000-8000-000000000523', NULL) $$,
	'an active record is not deleted');

SELECT is(public.reconcile_personnel_file_attachment('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301',
	'document', pg_temp.doc('301', 'attached.pdf')), 'f6430000-0000-4000-8000-000000000523'::uuid, 'reconciliation returns the attached record');
SELECT is(public.reconcile_personnel_file_attachment('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301',
	'document', pg_temp.doc('301', 'unattached.pdf')), NULL, 'reconciliation finds no record for an unattached key');
SELECT throws_ok($$ SELECT public.reconcile_personnel_file_attachment('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301',
	'document', pg_temp.doc('304', 'other.pdf')) $$, '22023', 'Invalid Personnel file key', 'reconciliation rejects a key outside the Person');
SELECT is(public.reconcile_personnel_file_attachment('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301',
	'document', pg_temp.doc('301', 'unattached.pdf')), NULL, 'reconciliation replays for a key it already retired');
SELECT throws_ok($$ SELECT public.reconcile_personnel_file_attachment('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301',
	'document', pg_temp.doc('301', 'legacy.pdf')) $$, '23505', 'This stored file is attached to another record',
	'reconciliation refuses a document key another Person still references');
SELECT throws_ok($$ SELECT public.reconcile_personnel_file_attachment('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301',
	'counseling', pg_temp.counsel('301', 'legacy.pdf')) $$, '23505', 'This stored file is attached to another record',
	'reconciliation refuses a counseling key another Person still references');
SELECT throws_ok($$ SELECT public.reconcile_personnel_file_attachment('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301',
	'document', pg_temp.doc('301', 'legacy-foreign.pdf')) $$, '23505', 'This stored file is attached to another record',
	'reconciliation refuses a document key a record in another Organization still references');
SELECT throws_ok($$ INSERT INTO public.personnel_documents (organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by)
	VALUES ('f6430000-0000-4000-8000-000000000101', 'f6430000-0000-4000-8000-000000000301', 'Late', pg_temp.doc('301', 'unattached.pdf'), 1, 'application/pdf', 'fixture') $$,
	'23514', 'This stored file was deleted and cannot be attached', 'a late attachment cannot claim a reconciled key');
SELECT pg_temp.act_as_fixture();
SELECT is(
	ARRAY[pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'attached.pdf')), pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'unattached.pdf')),
		pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'legacy.pdf')), pg_temp.retirement('counseling-files', pg_temp.counsel('301', 'legacy.pdf')),
		pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'legacy-foreign.pdf'))],
	ARRAY[NULL, 'pending', NULL, NULL, NULL],
	'only the unattached key is retired');
SELECT is(
	ARRAY(SELECT path FROM (SELECT file_path FROM public.personnel_documents WHERE id IN ('f6430000-0000-4000-8000-000000000524', 'f6430000-0000-4000-8000-000000000525')
		UNION ALL SELECT file_path FROM public.counseling_records WHERE id = 'f6430000-0000-4000-8000-000000000534') AS kept(path) ORDER BY path COLLATE "C"),
	ARRAY[pg_temp.counsel('301', 'legacy.pdf'), pg_temp.doc('301', 'legacy-foreign.pdf'), pg_temp.doc('301', 'legacy.pdf')],
	'refused reconciliation keeps every other record''s reference');

SELECT pg_temp.act_as_service();
SELECT throws_ok($$ SELECT public.register_organization_file_upload('f6430000-0000-4000-8000-000000000601', 'f6430000-0000-4000-8000-000000000101',
	'f6430000-0000-4000-8000-000000000001', 'personnel-documents', pg_temp.doc('301', 'direct.pdf')) $$,
	'23514', 'This stored file was deleted and cannot be reused', 'registration rejects a retired key');
SELECT throws_ok($$ INSERT INTO storage.objects (id, bucket_id, name) VALUES ('f6430000-0000-4000-8000-000000000701', 'personnel-documents', pg_temp.doc('301', 'direct.pdf')) $$,
	'23514', 'This stored file was deleted and cannot be reused', 'the server cannot write bytes under a retired key');
SELECT is(public.register_organization_file_upload('f6430000-0000-4000-8000-000000000602', 'f6430000-0000-4000-8000-000000000101',
	'f6430000-0000-4000-8000-000000000001', 'personnel-documents', pg_temp.doc('301', 'fresh.pdf')), 'f6430000-0000-4000-8000-000000000602'::uuid,
	'a fresh key still registers');
SELECT pg_temp.act_as_fixture();
SELECT throws_ok($$ INSERT INTO storage.objects (id, bucket_id, name) VALUES ('f6430000-0000-4000-8000-000000000702', 'counseling-files', pg_temp.counsel('301', 'direct.pdf')) $$,
	'23514', 'This stored file was deleted and cannot be reused', 'a fixture cannot write bytes under a retired key');
SELECT lives_ok($$ INSERT INTO storage.objects (id, bucket_id, name) VALUES ('f6430000-0000-4000-8000-000000000703', 'counseling-files',
	'f6430000-0000-4000-8000-000000000101/sign-in-rosters/roster.pdf') $$,
	'Sign-in Roster files in the shared bucket are unaffected');
DELETE FROM organization_private.file_uploads WHERE id = 'f6430000-0000-4000-8000-000000000602';
SELECT set_config('storage.allow_delete_query', 'true', true);
DELETE FROM storage.objects WHERE id = 'f6430000-0000-4000-8000-000000000703';

UPDATE organization_private.file_retirements SET attempted_at = now() WHERE object_name IS NOT NULL AND object_name NOT LIKE 'f6430000-%';
SELECT pg_temp.act_as_service();
CREATE TEMP TABLE first_page ON COMMIT DROP AS SELECT * FROM public.list_pending_organization_file_retirements(3);
CREATE TEMP TABLE second_page ON COMMIT DROP AS SELECT * FROM public.list_pending_organization_file_retirements(3);
SELECT is((SELECT count(*)::integer FROM first_page), 3, 'a bounded page lists pending keys');
SELECT is_empty($$ SELECT object_name FROM first_page INTERSECT SELECT object_name FROM second_page $$,
	'a listed key moves behind keys not yet tried');
SELECT is(public.complete_organization_file_retirements('personnel-documents', ARRAY[pg_temp.doc('301', 'direct.pdf'), pg_temp.counsel('301', 'direct.pdf'), 'never-retired']), 1,
	'completion counts only pending keys in its own bucket');
SELECT is(public.complete_organization_file_retirements('counseling-files', ARRAY[pg_temp.counsel('301', 'direct.pdf')]), 1,
	'a key left pending by another bucket completes through its own bucket');
SELECT is(public.complete_organization_file_retirements('personnel-documents', ARRAY[pg_temp.doc('301', 'direct.pdf')]), 0, 'completion is idempotent');
SELECT throws_ok($$ SELECT public.register_organization_file_upload('f6430000-0000-4000-8000-000000000603', 'f6430000-0000-4000-8000-000000000101',
	'f6430000-0000-4000-8000-000000000001', 'personnel-documents', pg_temp.doc('301', 'direct.pdf')) $$,
	'23514', 'This stored file was deleted and cannot be reused', 'a completed key stays fenced');
SELECT pg_temp.act_as_fixture();
SELECT is(
	(SELECT ARRAY[pg_temp.retirement('personnel-documents', pg_temp.doc('301', 'direct.pdf')), object_name]
		FROM organization_private.file_retirements WHERE key_digest = sha256(convert_to('personnel-documents/' || pg_temp.doc('301', 'direct.pdf'), 'UTF8'))),
	ARRAY['removed', NULL],
	'a completed key keeps only its digest');
SELECT results_eq(
	$$ SELECT deleted, file_removed FROM public.delete_archived_personnel_artifact('f6430000-0000-4000-8000-000000000101',
		'f6430000-0000-4000-8000-000000000301', 'document', 'f6430000-0000-4000-8000-000000000511', NULL) $$,
	$$ VALUES (false, true) $$,
	'the receipt reports completed cleanup');

SELECT set_config('storage.allow_delete_query', 'true', true);
DELETE FROM public.organizations WHERE id = 'f6430000-0000-4000-8000-000000000102';
SELECT is((SELECT count(*)::integer FROM public.organizations WHERE id = 'f6430000-0000-4000-8000-000000000102'), 0,
	'an Organization without files is still deleted');

SELECT * FROM finish();
ROLLBACK;
