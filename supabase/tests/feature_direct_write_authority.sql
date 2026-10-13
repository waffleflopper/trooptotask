-- Direct feature-record writes follow the same operation rules as the app:
-- Personnel lifecycle needs configure and archive-before-delete, approval-gated
-- deletes keep their stronger authority, stored artifact files are removed by
-- the server, Onboarding packets, steps, configuration and note authorship stay
-- with their commands, and deletion requests start pending.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();
SELECT set_config('storage.allow_delete_query', 'true', true);

INSERT INTO auth.users (id, email) VALUES
	('f4000000-0000-4000-8000-000000000001', 'feature-writes-owner@example.test'),
	('f4000000-0000-4000-8000-000000000002', 'feature-writes-operator@example.test'),
	('f4000000-0000-4000-8000-000000000003', 'feature-writes-configurator@example.test'),
	('f4000000-0000-4000-8000-000000000004', 'feature-writes-admin@example.test'),
	('f4000000-0000-4000-8000-000000000005', 'feature-writes-unrelated@example.test'),
	('f4000000-0000-4000-8000-000000000006', 'feature-writes-viewer@example.test'),
	('f4000000-0000-4000-8000-000000000007', 'feature-writes-no-lanes@example.test');

INSERT INTO public.organizations (id, name, created_by) VALUES
	('f4000000-0000-4000-8000-000000000101', 'Feature Writes Alpha', 'f4000000-0000-4000-8000-000000000001'),
	('f4000000-0000-4000-8000-000000000102', 'Feature Writes Bravo', 'f4000000-0000-4000-8000-000000000005');

INSERT INTO public.groups (id, organization_id, name) VALUES
	('f4000000-0000-4000-8000-000000000201', 'f4000000-0000-4000-8000-000000000101', 'Alpha'),
	('f4000000-0000-4000-8000-000000000202', 'f4000000-0000-4000-8000-000000000101', 'Bravo'),
	('f4000000-0000-4000-8000-000000000203', 'f4000000-0000-4000-8000-000000000102', 'Foreign');

INSERT INTO public.organization_memberships (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids) VALUES
	('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000001', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
	('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000002', 'member', 'viewer',
		'{"personnel":"operate","training":"operate","ratingScheme":"operate","onboarding":"operate"}', 'groups', ARRAY['f4000000-0000-4000-8000-000000000201']::uuid[]),
	('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000003', 'member', 'viewer',
		'{"personnel":"configure","training":"configure","ratingScheme":"configure","onboarding":"configure"}', 'groups', ARRAY['f4000000-0000-4000-8000-000000000201']::uuid[]),
	('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000004', 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
	('f4000000-0000-4000-8000-000000000102', 'f4000000-0000-4000-8000-000000000005', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
	('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000006', 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[]),
	('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000007', 'member', 'viewer',
		'{"personnel":"none","training":"none","ratingScheme":"none","onboarding":"none","calendar":"none"}', 'organization', ARRAY[]::uuid[]);

INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
	('f4000000-0000-4000-8000-000000000301', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000201', 'SGT', 'Avery', 'Active', 'feature-writes-active', NULL),
	('f4000000-0000-4000-8000-000000000302', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000201', 'SPC', 'Blake', 'Archived', 'feature-writes-archived', '2029-01-01T00:00:00Z'),
	('f4000000-0000-4000-8000-000000000303', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000201', 'PFC', 'Casey', 'Retired', 'feature-writes-retired', '2029-01-01T00:00:00Z'),
	('f4000000-0000-4000-8000-000000000304', 'f4000000-0000-4000-8000-000000000102', 'f4000000-0000-4000-8000-000000000203', 'SSG', 'Drew', 'Foreign', 'feature-writes-foreign', NULL),
	('f4000000-0000-4000-8000-000000000305', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000202', 'CPL', 'Emery', 'Bravo', 'feature-writes-bravo', NULL),
	('f4000000-0000-4000-8000-000000000306', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000201', 'PV2', 'Finley', 'Arrival', 'feature-writes-arrival', NULL);

INSERT INTO public.training_types (id, organization_id, name) VALUES
	('f4000000-0000-4000-8000-000000000401', 'f4000000-0000-4000-8000-000000000101', 'Alpha CLS'),
	('f4000000-0000-4000-8000-000000000402', 'f4000000-0000-4000-8000-000000000101', 'Alpha Range');

INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date) VALUES
	('f4000000-0000-4000-8000-000000000411', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', 'f4000000-0000-4000-8000-000000000401', '2030-01-01'),
	('f4000000-0000-4000-8000-000000000412', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', 'f4000000-0000-4000-8000-000000000402', '2030-02-01');

INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rater_person_id, rating_period_start, rating_period_end, status) VALUES
	('f4000000-0000-4000-8000-000000000421', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', 'NCOER', 'f4000000-0000-4000-8000-000000000301', '2030-01-01', '2030-12-31', 'active'),
	('f4000000-0000-4000-8000-000000000422', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', 'NCOER', 'f4000000-0000-4000-8000-000000000301', '2031-01-01', '2031-12-31', 'active');

INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path, archived_at) VALUES
	('f4000000-0000-4000-8000-000000000501', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', '2030-01-01', 'Active counseling', 'Active counseling', 'fixture',
		'f4000000-0000-4000-8000-000000000101/counseling-records/f4000000-0000-4000-8000-000000000301/active.pdf', NULL),
	('f4000000-0000-4000-8000-000000000502', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', '2030-01-02', 'Archived counseling', 'Archived counseling', 'fixture',
		'f4000000-0000-4000-8000-000000000101/counseling-records/f4000000-0000-4000-8000-000000000301/archived.pdf', '2030-03-01T00:00:00Z');
INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by, archived_at) VALUES
	('f4000000-0000-4000-8000-000000000511', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', 'Active document',
		'f4000000-0000-4000-8000-000000000101/personnel/f4000000-0000-4000-8000-000000000301/documents/active.pdf', 128, 'application/pdf', 'fixture', NULL),
	('f4000000-0000-4000-8000-000000000512', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', 'Archived document',
		'f4000000-0000-4000-8000-000000000101/personnel/f4000000-0000-4000-8000-000000000301/documents/archived.pdf', 128, 'application/pdf', 'fixture', '2030-03-01T00:00:00Z');
INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata)
SELECT id::uuid, bucket_id, name, 'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', '{}'::jsonb
FROM (VALUES
	('f4000000-0000-4000-8000-000000000541', 'personnel-documents', 'f4000000-0000-4000-8000-000000000101/personnel/f4000000-0000-4000-8000-000000000301/documents/active.pdf'),
	('f4000000-0000-4000-8000-000000000542', 'personnel-documents', 'f4000000-0000-4000-8000-000000000101/personnel/f4000000-0000-4000-8000-000000000301/documents/archived.pdf'),
	('f4000000-0000-4000-8000-000000000543', 'counseling-files', 'f4000000-0000-4000-8000-000000000101/counseling-records/f4000000-0000-4000-8000-000000000301/active.pdf'),
	('f4000000-0000-4000-8000-000000000544', 'counseling-files', 'f4000000-0000-4000-8000-000000000101/counseling-records/f4000000-0000-4000-8000-000000000301/archived.pdf')
) AS fixture(id, bucket_id, name);
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text, archived_at) VALUES
	('f4000000-0000-4000-8000-000000000521', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', 'fixture', 'Active note', NULL),
	('f4000000-0000-4000-8000-000000000522', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', 'fixture', 'Archived note', '2030-03-01T00:00:00Z');
INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, notes, due_date, status, created_by, archived_at) VALUES
	('f4000000-0000-4000-8000-000000000531', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', 'Open follow-up', 'Private', '2030-02-01', 'open', 'fixture', NULL),
	('f4000000-0000-4000-8000-000000000532', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', 'Archived follow-up', 'Private', '2030-02-01', 'archived', 'fixture', '2030-03-01T00:00:00Z');

INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES
	('f4000000-0000-4000-8000-000000000601', 'f4000000-0000-4000-8000-000000000101', 'Alpha Packet'),
	('f4000000-0000-4000-8000-000000000602', 'f4000000-0000-4000-8000-000000000101', 'Alpha Replacement'),
	('f4000000-0000-4000-8000-000000000603', 'f4000000-0000-4000-8000-000000000102', 'Foreign Packet');
INSERT INTO public.onboarding_template_steps (id, organization_id, template_id, name, step_type, training_type_id, stages, sort_order) VALUES
	('f4000000-0000-4000-8000-000000000611', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000601', 'Alpha Step', 'checkbox', NULL, NULL, 0),
	('f4000000-0000-4000-8000-000000000612', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000601', 'Alpha CLS', 'training', 'f4000000-0000-4000-8000-000000000401', NULL, 10),
	('f4000000-0000-4000-8000-000000000621', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000602', 'Replacement Paperwork', 'paperwork', NULL, '["Submitted","Filed"]', 10),
	('f4000000-0000-4000-8000-000000000622', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000602', 'Replacement Check', 'checkbox', NULL, NULL, 20);
INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, template_id, status) VALUES
	('f4000000-0000-4000-8000-000000000701', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', 'f4000000-0000-4000-8000-000000000601', 'in_progress'),
	('f4000000-0000-4000-8000-000000000702', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000305', 'f4000000-0000-4000-8000-000000000601', 'in_progress');
INSERT INTO public.onboarding_step_progress (id, organization_id, onboarding_id, template_step_id, step_name, step_type, active, notes) VALUES
	('f4000000-0000-4000-8000-000000000711', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000701', 'f4000000-0000-4000-8000-000000000611', 'Alpha Step', 'checkbox', true, '[]'),
	('f4000000-0000-4000-8000-000000000712', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000701', NULL, 'Removed Step', 'checkbox', false, '[]'),
	('f4000000-0000-4000-8000-000000000713', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000701', NULL, 'Noted Step', 'checkbox', true,
		'[{"text":"Original","timestamp":"2030-01-01T00:00:00.000Z","userId":"f4000000-0000-4000-8000-000000000001"}]'),
	('f4000000-0000-4000-8000-000000000714', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000702', 'f4000000-0000-4000-8000-000000000611', 'Bravo Step', 'checkbox', true, '[]');

INSERT INTO public.deletion_requests (id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description, status) VALUES
	('f4000000-0000-4000-8000-000000000801', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000006', 'feature-writes-viewer@example.test',
		'personnel', 'f4000000-0000-4000-8000-000000000301', 'Archive SGT Active, Avery', 'pending');

CREATE FUNCTION pg_temp.act_as(p_user_id uuid) RETURNS void
LANGUAGE sql AS $$
	SELECT set_config('request.jwt.claim.sub', p_user_id::text, true),
		set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
$$;

-- What an API caller observes from one call: its value or its error.
CREATE FUNCTION pg_temp.rpc_answer(p_call text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
	answer text;
BEGIN
	EXECUTE 'SELECT (' || p_call || ')::text' INTO answer;
	RETURN coalesce(answer, 'null');
EXCEPTION WHEN OTHERS THEN
	RETURN SQLSTATE || ' ' || SQLERRM;
END;
$$;

CREATE FUNCTION pg_temp.onboarding_rpc_answers(p_person uuid, p_packet uuid, p_template uuid, p_step uuid, p_template_step uuid)
RETURNS text[]
LANGUAGE sql AS $$
	SELECT ARRAY[
		pg_temp.rpc_answer(format('public.onboarding_personnel_scope_matches(%L, %L)', 'f4000000-0000-4000-8000-000000000101', p_person)),
		pg_temp.rpc_answer(format('public.onboarding_parent_scope_matches(%L, %L)', 'f4000000-0000-4000-8000-000000000101', p_packet)),
		pg_temp.rpc_answer(format('public.onboarding_template_reference_matches(%L, %L)', 'f4000000-0000-4000-8000-000000000101', p_template)),
		pg_temp.rpc_answer(format('public.onboarding_step_references_match(%L, %L, NULL)', 'f4000000-0000-4000-8000-000000000101', p_template_step)),
		pg_temp.rpc_answer(format('public.start_onboarding_packet(%L, %L, %L, %L, %L)', 'f4000000-0000-4000-8000-000000000101', p_person, p_template, '2030-06-01', '[]')),
		pg_temp.rpc_answer(format('public.reconcile_onboarding_packet(%L, %L, NULL)', 'f4000000-0000-4000-8000-000000000101', p_packet)),
		pg_temp.rpc_answer(format('public.append_onboarding_step_note(%L, %L, %L)', 'f4000000-0000-4000-8000-000000000101', p_step, 'Probe'))
	];
$$;

SET LOCAL ROLE authenticated;

-- Personnel lifecycle: operate edits and imports; configure archives, restores
-- and permanently deletes only archived People.
SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000002');
WITH changed AS (
	UPDATE public.personnel SET first_name = 'Edited' WHERE id = 'f4000000-0000-4000-8000-000000000301' RETURNING id
) SELECT is((SELECT count(*)::integer FROM changed), 1, 'a Group operator still edits an in-Group Person');
SELECT throws_ok($$ UPDATE public.personnel SET archived_at = '2030-06-01T00:00:00Z' WHERE id = 'f4000000-0000-4000-8000-000000000301' $$,
	'42501', NULL, 'a Group operator cannot archive a Person directly');
SELECT throws_ok($$ UPDATE public.personnel SET archived_at = NULL WHERE id = 'f4000000-0000-4000-8000-000000000302' $$,
	'42501', NULL, 'a Group operator cannot restore a Person directly');
SAVEPOINT operator_person_delete;
WITH removed AS (
	DELETE FROM public.personnel WHERE id IN ('f4000000-0000-4000-8000-000000000301', 'f4000000-0000-4000-8000-000000000302') RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 0, 'a Group operator cannot permanently delete active or archived People');
ROLLBACK TO SAVEPOINT operator_person_delete;
SELECT lives_ok($$ INSERT INTO public.personnel (organization_id, group_id, rank, first_name, last_name, slug)
	VALUES ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000201', 'PV2', 'Imported', 'Alpha', 'feature-writes-imported') $$,
	'a Group operator imports a new in-Group Person');
SELECT throws_ok($$ INSERT INTO public.personnel (organization_id, group_id, rank, first_name, last_name, slug, archived_at)
	VALUES ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000201', 'PV2', 'Archived', 'Import', 'feature-writes-archived-import', '2030-01-01T00:00:00Z') $$,
	'42501', NULL, 'a Group operator cannot create an already archived Person');

SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000003');
WITH archived AS (
	UPDATE public.personnel SET archived_at = '2030-06-01T00:00:00Z' WHERE id = 'f4000000-0000-4000-8000-000000000301' RETURNING id
) SELECT is((SELECT count(*)::integer FROM archived), 1, 'a Group configurator archives an in-Group Person');
WITH restored AS (
	UPDATE public.personnel SET archived_at = NULL WHERE id = 'f4000000-0000-4000-8000-000000000301' RETURNING id
) SELECT is((SELECT count(*)::integer FROM restored), 1, 'a Group configurator restores an in-Group Person');
SAVEPOINT configurator_active_delete;
WITH removed AS (
	DELETE FROM public.personnel WHERE id = 'f4000000-0000-4000-8000-000000000301' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 0, 'permanent deletion requires an archived Person');
ROLLBACK TO SAVEPOINT configurator_active_delete;
WITH removed AS (
	DELETE FROM public.personnel WHERE id = 'f4000000-0000-4000-8000-000000000303' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 1, 'a Group configurator permanently deletes an archived in-Group Person');

-- Approval-gated hard deletes keep their app authority.
SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000002');
WITH removed AS (
	DELETE FROM public.personnel_trainings WHERE id = 'f4000000-0000-4000-8000-000000000411' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 0, 'a Training operator cannot hard-delete a training record');
WITH removed AS (
	DELETE FROM public.rating_scheme_entries WHERE id = 'f4000000-0000-4000-8000-000000000421' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 0, 'a Rating Scheme operator cannot delete an entry');

SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000003');
WITH removed AS (
	DELETE FROM public.personnel_trainings WHERE id = 'f4000000-0000-4000-8000-000000000412' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 1, 'a Training configurator hard-deletes an in-Group training record');
WITH removed AS (
	DELETE FROM public.rating_scheme_entries WHERE id = 'f4000000-0000-4000-8000-000000000421' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 0, 'Rating Scheme configure without governance cannot delete an entry');
WITH
	counseling AS (DELETE FROM public.counseling_records WHERE id = 'f4000000-0000-4000-8000-000000000501' RETURNING id),
	documents AS (DELETE FROM public.personnel_documents WHERE id = 'f4000000-0000-4000-8000-000000000511' RETURNING id),
	notes AS (DELETE FROM public.leader_notes WHERE id = 'f4000000-0000-4000-8000-000000000521' RETURNING id),
	follow_ups AS (DELETE FROM public.personnel_follow_ups WHERE id = 'f4000000-0000-4000-8000-000000000531' RETURNING id)
SELECT is(
	ARRAY[(SELECT count(*) FROM counseling), (SELECT count(*) FROM documents), (SELECT count(*) FROM notes), (SELECT count(*) FROM follow_ups)],
	ARRAY[0, 0, 0, 0]::bigint[],
	'active counseling records, documents, leader notes and follow-ups must be archived before deletion');
WITH
	counseling AS (DELETE FROM public.counseling_records WHERE id = 'f4000000-0000-4000-8000-000000000502' RETURNING id),
	documents AS (DELETE FROM public.personnel_documents WHERE id = 'f4000000-0000-4000-8000-000000000512' RETURNING id),
	notes AS (DELETE FROM public.leader_notes WHERE id = 'f4000000-0000-4000-8000-000000000522' RETURNING id),
	follow_ups AS (DELETE FROM public.personnel_follow_ups WHERE id = 'f4000000-0000-4000-8000-000000000532' RETURNING id)
SELECT is(
	ARRAY[(SELECT count(*) FROM counseling), (SELECT count(*) FROM documents), (SELECT count(*) FROM notes), (SELECT count(*) FROM follow_ups)],
	ARRAY[1, 1, 1, 1]::bigint[],
	'archived counseling records, documents, leader notes and follow-ups can be deleted');

SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000004');
WITH removed AS (
	DELETE FROM public.rating_scheme_entries WHERE id = 'f4000000-0000-4000-8000-000000000422' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 1, 'an admin deletes a Rating Scheme entry');

-- Stored artifact files stay under their own Organization and Person.
SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000002');
SELECT throws_ok($$ INSERT INTO public.counseling_records (organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path)
	VALUES ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', '2030-04-01', 'Crafted', 'Crafted', 'fixture',
		'f4000000-0000-4000-8000-000000000102/counseling-records/f4000000-0000-4000-8000-000000000304/foreign.pdf') $$,
	'23514', NULL, 'a counseling file path cannot point at another Organization');
SELECT throws_ok($$ INSERT INTO public.personnel_documents (organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by)
	VALUES ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', 'Crafted',
		'f4000000-0000-4000-8000-000000000101/personnel/f4000000-0000-4000-8000-000000000301/documents/../../f4000000-0000-4000-8000-000000000302/documents/other.pdf', 128, 'application/pdf', 'fixture') $$,
	'23514', NULL, 'a document file path cannot traverse to another Person');
SELECT lives_ok($$ INSERT INTO public.counseling_records (organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path)
	VALUES ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000301', '2030-04-01', 'Bound', 'Bound', 'fixture',
		'f4000000-0000-4000-8000-000000000101/counseling-records/f4000000-0000-4000-8000-000000000301/bound.pdf') $$,
	'a counseling file path under its own Person is accepted');
SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000003');
SELECT throws_ok($$ UPDATE public.personnel_documents SET personnel_id = 'f4000000-0000-4000-8000-000000000302'
	WHERE id = 'f4000000-0000-4000-8000-000000000511' $$,
	'23514', NULL, 'a document cannot move to another Person while its file stays behind');

-- Stored artifact files are removed by the server after archive-before-delete;
-- an Organization owner still removes retained files during cleanup.
SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000002');
WITH removed AS (
	DELETE FROM storage.objects WHERE id IN ('f4000000-0000-4000-8000-000000000541', 'f4000000-0000-4000-8000-000000000543') RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 0, 'a Personnel operator cannot remove an active document or counseling file through Storage');
WITH removed AS (
	DELETE FROM storage.objects WHERE id IN ('f4000000-0000-4000-8000-000000000542', 'f4000000-0000-4000-8000-000000000544') RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 0, 'a Personnel operator cannot remove an archived artifact file outside the server deletion');
SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000001');
WITH removed AS (
	DELETE FROM storage.objects WHERE id = 'f4000000-0000-4000-8000-000000000543' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 1, 'an Organization owner still removes a retained file for Organization cleanup');
RESET ROLE;
SET LOCAL ROLE service_role;
WITH removed AS (
	DELETE FROM storage.objects WHERE id IN ('f4000000-0000-4000-8000-000000000542', 'f4000000-0000-4000-8000-000000000544') RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 2, 'the server deletion removes archived document and counseling files');
RESET ROLE;
SET LOCAL ROLE authenticated;

-- Onboarding: operate starts packets, changes progress and lifecycle status;
-- template choice, step shape and removal of active work need configure
-- commands. Packets and steps are created only by those commands.
SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000002');
SELECT throws_ok($$ UPDATE public.personnel_onboardings SET template_id = 'f4000000-0000-4000-8000-000000000602'
	WHERE id = 'f4000000-0000-4000-8000-000000000701' $$,
	'42501', NULL, 'an Onboarding operator cannot switch a packet template directly');
SAVEPOINT operator_lifecycle;
WITH changed AS (
	UPDATE public.personnel_onboardings SET status = 'cancelled', cancelled_at = '2030-05-01T00:00:00Z'
	WHERE id = 'f4000000-0000-4000-8000-000000000701' RETURNING id
) SELECT is((SELECT count(*)::integer FROM changed), 1, 'an Onboarding operator still cancels a packet');
ROLLBACK TO SAVEPOINT operator_lifecycle;
SAVEPOINT operator_packet_delete;
WITH removed AS (
	DELETE FROM public.personnel_onboardings WHERE id = 'f4000000-0000-4000-8000-000000000701' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 0, 'an Onboarding operator cannot delete a packet and its active steps');
ROLLBACK TO SAVEPOINT operator_packet_delete;
WITH removed AS (
	DELETE FROM public.onboarding_step_progress WHERE id = 'f4000000-0000-4000-8000-000000000711' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 0, 'an Onboarding operator cannot remove an active step');
WITH removed AS (
	DELETE FROM public.onboarding_step_progress WHERE id = 'f4000000-0000-4000-8000-000000000712' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 1, 'an Onboarding operator removes an inactive step');
SELECT throws_ok($$ UPDATE public.onboarding_step_progress SET active = false WHERE id = 'f4000000-0000-4000-8000-000000000711' $$,
	'42501', NULL, 'an Onboarding operator cannot deactivate a step directly');
SELECT throws_ok($$ UPDATE public.onboarding_step_progress SET step_name = 'Renamed' WHERE id = 'f4000000-0000-4000-8000-000000000711' $$,
	'42501', NULL, 'an Onboarding operator cannot rename a step directly');
WITH changed AS (
	UPDATE public.onboarding_step_progress SET completed = true WHERE id = 'f4000000-0000-4000-8000-000000000711' RETURNING id
) SELECT is((SELECT count(*)::integer FROM changed), 1, 'an Onboarding operator still completes a step');
SELECT throws_ok($$ UPDATE public.onboarding_step_progress
	SET notes = '[{"text":"Forged","timestamp":"2030-01-01T00:00:00.000Z","userId":"f4000000-0000-4000-8000-000000000001"}]'
	WHERE id = 'f4000000-0000-4000-8000-000000000713' $$,
	'42501', NULL, 'an Onboarding operator cannot replace saved notes');
SELECT throws_ok($$ UPDATE public.onboarding_step_progress
	SET notes = notes || '[{"text":"Forged","timestamp":"2030-01-02T00:00:00.000Z","userId":"f4000000-0000-4000-8000-000000000001"}]'
	WHERE id = 'f4000000-0000-4000-8000-000000000713' $$,
	'42501', NULL, 'an Onboarding operator cannot append a note under another author');
SELECT throws_ok($$ INSERT INTO public.onboarding_step_progress (organization_id, onboarding_id, step_name, step_type, notes)
	VALUES ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000701', 'Seeded', 'checkbox',
		'[{"text":"Forged","timestamp":"2030-01-01T00:00:00.000Z","userId":"f4000000-0000-4000-8000-000000000001"}]') $$,
	'42501', NULL, 'an Onboarding operator cannot create a step with notes');
SELECT throws_ok($$ INSERT INTO public.onboarding_step_progress (organization_id, onboarding_id, step_name, step_type, stages, sort_order)
	VALUES ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000701', 'Custom', 'paperwork', '["Signed"]', 5) $$,
	'42501', NULL, 'an Onboarding operator cannot add a custom step to a saved packet');
SELECT throws_ok($$ INSERT INTO public.onboarding_step_progress (organization_id, onboarding_id, template_step_id, step_name, step_type, sort_order)
	VALUES ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000701', 'f4000000-0000-4000-8000-000000000611', 'Alpha Step', 'checkbox', 0) $$,
	'42501', NULL, 'an Onboarding operator cannot add a template step to a saved packet');
SELECT throws_ok($$ INSERT INTO public.personnel_onboardings (organization_id, personnel_id, template_id, status)
	VALUES ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000306', 'f4000000-0000-4000-8000-000000000601', 'completed') $$,
	'42501', NULL, 'an Onboarding operator cannot create a packet without its Start steps');
SELECT is(
	(SELECT jsonb_agg(jsonb_build_array(step ->> 'template_step_id', step ->> 'step_name', step ->> 'step_type', step ->> 'training_type_id', step ->> 'sort_order', step ->> 'completed', step ->> 'active') ORDER BY (step ->> 'sort_order')::integer)
		FROM jsonb_array_elements(public.start_onboarding_packet('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000306',
			'f4000000-0000-4000-8000-000000000601', '2030-06-01', '[
				{"template_step_id":"f4000000-0000-4000-8000-000000000611","step_name":"Alpha Step","step_type":"checkbox","training_type_id":null,"stages":null,"sort_order":0,"completed":false},
				{"template_step_id":"f4000000-0000-4000-8000-000000000612","step_name":"Alpha CLS","step_type":"training","training_type_id":"f4000000-0000-4000-8000-000000000401","stages":null,"sort_order":10,"completed":true}
			]') -> 'steps') AS step),
	'[["f4000000-0000-4000-8000-000000000611","Alpha Step","checkbox",null,"0","false","true"],["f4000000-0000-4000-8000-000000000612","Alpha CLS","training","f4000000-0000-4000-8000-000000000401","10","true","true"]]'::jsonb,
	'an Onboarding operator starts a packet with exactly its prepared template steps');
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('f4000000-0000-4000-8000-000000000101',
	(SELECT id FROM public.personnel_onboardings WHERE personnel_id = 'f4000000-0000-4000-8000-000000000306'), 'f4000000-0000-4000-8000-000000000602') $$,
	'42501', NULL, 'an Onboarding operator cannot reconcile a packet to another template');
SELECT is(
	(SELECT public.append_onboarding_step_note('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000713', 'Own note') -> 'notes' -> 1 ->> 'userId'),
	'f4000000-0000-4000-8000-000000000002',
	'an Onboarding operator appends an attributed note through the command');

SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000003');
SELECT is(
	(SELECT jsonb_agg(jsonb_build_array(step ->> 'template_step_id', step ->> 'step_name', step ->> 'step_type', step -> 'stages', step ->> 'sort_order', step ->> 'current_stage', step ->> 'active') ORDER BY (step ->> 'active')::boolean DESC, (step ->> 'sort_order')::integer)
		FROM jsonb_array_elements(public.reconcile_onboarding_packet('f4000000-0000-4000-8000-000000000101',
			(SELECT id FROM public.personnel_onboardings WHERE personnel_id = 'f4000000-0000-4000-8000-000000000306'), 'f4000000-0000-4000-8000-000000000602') -> 'steps') AS step),
	'[["f4000000-0000-4000-8000-000000000621","Replacement Paperwork","paperwork",["Submitted","Filed"],"10","Submitted","true"],["f4000000-0000-4000-8000-000000000622","Replacement Check","checkbox",null,"20",null,"true"],["f4000000-0000-4000-8000-000000000611","Alpha Step","checkbox",null,"0",null,"false"],["f4000000-0000-4000-8000-000000000612","Alpha CLS","training",null,"10",null,"false"]]'::jsonb,
	'an Onboarding configurator reconciles a packet to its new template steps');
SELECT is(
	pg_temp.onboarding_rpc_answers('f4000000-0000-4000-8000-000000000305', 'f4000000-0000-4000-8000-000000000702',
		'f4000000-0000-4000-8000-000000000601', 'f4000000-0000-4000-8000-000000000714', 'f4000000-0000-4000-8000-000000000611'),
	pg_temp.onboarding_rpc_answers('f4000000-0000-4000-8000-000000000399', 'f4000000-0000-4000-8000-000000000799',
		'f4000000-0000-4000-8000-000000000601', 'f4000000-0000-4000-8000-000000000719', 'f4000000-0000-4000-8000-000000000611'),
	'a Group configurator cannot tell an out-of-Group Person or packet from a missing one');

-- Onboarding scope and reference checks are not API calls; no Onboarding call
-- tells a member without Onboarding, Personnel or Calendar access which saved
-- IDs exist, and accounts outside the Organization learn nothing either.
SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000007');
SELECT is(
	pg_temp.onboarding_rpc_answers('f4000000-0000-4000-8000-000000000301', 'f4000000-0000-4000-8000-000000000701',
		'f4000000-0000-4000-8000-000000000601', 'f4000000-0000-4000-8000-000000000711', 'f4000000-0000-4000-8000-000000000611'),
	pg_temp.onboarding_rpc_answers('f4000000-0000-4000-8000-000000000399', 'f4000000-0000-4000-8000-000000000799',
		'f4000000-0000-4000-8000-000000000699', 'f4000000-0000-4000-8000-000000000719', 'f4000000-0000-4000-8000-000000000699'),
	'an Organization member without Onboarding lanes cannot tell saved Onboarding IDs from missing ones');
SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000005');
SELECT is(
	pg_temp.onboarding_rpc_answers('f4000000-0000-4000-8000-000000000301', 'f4000000-0000-4000-8000-000000000701',
		'f4000000-0000-4000-8000-000000000601', 'f4000000-0000-4000-8000-000000000711', 'f4000000-0000-4000-8000-000000000611'),
	pg_temp.onboarding_rpc_answers('f4000000-0000-4000-8000-000000000399', 'f4000000-0000-4000-8000-000000000799',
		'f4000000-0000-4000-8000-000000000699', 'f4000000-0000-4000-8000-000000000719', 'f4000000-0000-4000-8000-000000000699'),
	'an unrelated account cannot tell saved Onboarding IDs from missing ones');

-- Deletion requests are created only by the server submission path, which
-- loads the target with the requester's access and writes its description.
SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000006');
SELECT throws_ok($$ INSERT INTO public.deletion_requests (organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description, resource_url)
	VALUES ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000006', 'feature-writes-viewer@example.test',
		'personnel_training', 'f4000000-0000-4000-8000-000000000411', 'Routine cleanup', 'https://attacker.example/review') $$,
	'42501', NULL, 'a member cannot file a request for a saved record with forged text and link');
SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000002');
SELECT throws_ok($$ INSERT INTO public.deletion_requests (organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description)
	VALUES ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000002', 'feature-writes-operator@example.test',
		'personnel', 'f4000000-0000-4000-8000-000000000305', 'Archive CPL Bravo, Emery') $$,
	'42501', NULL, 'a Group operator cannot file a request for a Person outside their Group');
SELECT throws_ok($$ INSERT INTO public.deletion_requests (organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description)
	VALUES ('f4000000-0000-4000-8000-000000000102', 'f4000000-0000-4000-8000-000000000002', 'feature-writes-operator@example.test',
		'personnel', 'f4000000-0000-4000-8000-000000000304', 'Archive SSG Foreign, Drew') $$,
	'42501', NULL, 'a member cannot file a request in another Organization');
SELECT pg_temp.act_as('f4000000-0000-4000-8000-000000000006');
SAVEPOINT requester_delete;
WITH removed AS (
	DELETE FROM public.deletion_requests WHERE id = 'f4000000-0000-4000-8000-000000000801' RETURNING id
) SELECT is((SELECT count(*)::integer FROM removed), 0, 'a requester cannot delete their pending request');
ROLLBACK TO SAVEPOINT requester_delete;
SELECT ok(public.cancel_own_deletion_request('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000801'),
	'a requester cancels their pending request through the command');

RESET ROLE;

SELECT ok(NOT has_table_privilege('authenticated', 'public.deletion_requests', 'INSERT')
		AND NOT has_table_privilege('anon', 'public.deletion_requests', 'INSERT')
		AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deletion_requests' AND cmd = 'INSERT'),
	'client roles have no direct path to create a deletion request');
SET LOCAL ROLE service_role;
SELECT lives_ok($$ INSERT INTO public.deletion_requests (id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description, resource_url)
	VALUES ('f4000000-0000-4000-8000-000000000802', 'f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000006',
		'feature-writes-viewer@example.test', 'personnel_training', 'f4000000-0000-4000-8000-000000000411',
		'Alpha CLS record for SGT Active', '/org/f4000000-0000-4000-8000-000000000101/training') $$,
	'the server submission path creates a pending request');
RESET ROLE;

SELECT ok(to_regprocedure('public.is_full_editor_for_org(uuid)') IS NULL,
	'the unused legacy full-editor helper no longer exists');

SELECT results_eq(
	$$
	SELECT 'personnel:' || id || ':' || first_name || ':' || COALESCE(archived_at::text, 'active') FROM public.personnel
		WHERE organization_id = 'f4000000-0000-4000-8000-000000000101' AND slug NOT LIKE 'feature-writes-imported%'
	UNION ALL SELECT 'training:' || id FROM public.personnel_trainings WHERE organization_id = 'f4000000-0000-4000-8000-000000000101'
	UNION ALL SELECT 'rating:' || id FROM public.rating_scheme_entries WHERE organization_id = 'f4000000-0000-4000-8000-000000000101'
	UNION ALL SELECT 'counseling:' || id FROM public.counseling_records WHERE organization_id = 'f4000000-0000-4000-8000-000000000101' AND title <> 'Bound'
	UNION ALL SELECT 'document:' || id || ':' || personnel_id FROM public.personnel_documents WHERE organization_id = 'f4000000-0000-4000-8000-000000000101'
	UNION ALL SELECT 'note:' || id FROM public.leader_notes WHERE organization_id = 'f4000000-0000-4000-8000-000000000101'
	UNION ALL SELECT 'follow-up:' || id FROM public.personnel_follow_ups WHERE organization_id = 'f4000000-0000-4000-8000-000000000101'
	UNION ALL SELECT 'packet:' || id || ':' || template_id || ':' || status FROM public.personnel_onboardings
		WHERE organization_id = 'f4000000-0000-4000-8000-000000000101' AND personnel_id <> 'f4000000-0000-4000-8000-000000000306'
	UNION ALL SELECT 'arrival-packets:' || count(*) FROM public.personnel_onboardings WHERE personnel_id = 'f4000000-0000-4000-8000-000000000306'
	UNION ALL SELECT 'step:' || id || ':' || step_name || ':' || active || ':' || completed || ':' || jsonb_array_length(notes)
		FROM public.onboarding_step_progress WHERE onboarding_id IN ('f4000000-0000-4000-8000-000000000701', 'f4000000-0000-4000-8000-000000000702')
	UNION ALL SELECT 'file:' || id FROM storage.objects WHERE id::text LIKE 'f4000000-%'
	UNION ALL SELECT 'request:' || id || ':' || resource_id || ':' || status FROM public.deletion_requests WHERE organization_id IN ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000102')
	ORDER BY 1
	$$,
	$$ VALUES
		('arrival-packets:1'),
		('counseling:f4000000-0000-4000-8000-000000000501'),
		('document:f4000000-0000-4000-8000-000000000511:f4000000-0000-4000-8000-000000000301'),
		('file:f4000000-0000-4000-8000-000000000541'),
		('follow-up:f4000000-0000-4000-8000-000000000531'),
		('note:f4000000-0000-4000-8000-000000000521'),
		('packet:f4000000-0000-4000-8000-000000000701:f4000000-0000-4000-8000-000000000601:in_progress'),
		('packet:f4000000-0000-4000-8000-000000000702:f4000000-0000-4000-8000-000000000601:in_progress'),
		('personnel:f4000000-0000-4000-8000-000000000301:Edited:active'),
		('personnel:f4000000-0000-4000-8000-000000000302:Blake:2029-01-01 00:00:00+00'),
		('personnel:f4000000-0000-4000-8000-000000000305:Emery:active'),
		('personnel:f4000000-0000-4000-8000-000000000306:Finley:active'),
		('rating:f4000000-0000-4000-8000-000000000421'),
		('request:f4000000-0000-4000-8000-000000000801:f4000000-0000-4000-8000-000000000301:cancelled'),
		('request:f4000000-0000-4000-8000-000000000802:f4000000-0000-4000-8000-000000000411:pending'),
		('step:f4000000-0000-4000-8000-000000000711:Alpha Step:true:true:0'),
		('step:f4000000-0000-4000-8000-000000000713:Noted Step:true:false:2'),
		('step:f4000000-0000-4000-8000-000000000714:Bravo Step:true:false:0'),
		('training:f4000000-0000-4000-8000-000000000411')
	$$,
	'denied direct writes leave exact saved rows while permitted writes persist');

SELECT * FROM finish();
ROLLBACK;
