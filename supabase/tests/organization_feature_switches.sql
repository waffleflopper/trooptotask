BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(93);

SELECT ok(NOT EXISTS (
	SELECT 1
	FROM pg_proc AS p
	JOIN pg_namespace AS n ON n.oid = p.pronamespace
	CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
	WHERE n.nspname = 'organization_private'
		AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
), 'private helpers never inherit public execution');

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
	SELECT ('c6430000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;

-- 1 Alpha owner, 2 Alpha admin, 3 Organization-wide member of Alpha and Bravo,
-- 4 Group-scoped member of Alpha Group One, 5 Bravo owner, 6 Alpha member with no feature lanes.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'switches-' || n || '@example.test', now()
FROM generate_series(1, 6) AS n;

INSERT INTO public.organizations (id, name, created_by) VALUES
	(pg_temp.id('101'), 'Switches Alpha', pg_temp.id('1')),
	(pg_temp.id('102'), 'Switches Bravo', pg_temp.id('5'));

INSERT INTO public.groups (id, organization_id, name) VALUES
	(pg_temp.id('201'), pg_temp.id('101'), 'Alpha One'),
	(pg_temp.id('202'), pg_temp.id('101'), 'Alpha Two'),
	(pg_temp.id('203'), pg_temp.id('102'), 'Bravo One');

INSERT INTO public.organization_memberships (
	organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
	(pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{"training":"view"}', 'organization', ARRAY[]::uuid[], 'switches-1@example.test'),
	(pg_temp.id('101'), pg_temp.id('2'), 'admin', 'editor', '{"training":"view"}', 'organization', ARRAY[]::uuid[], 'switches-2@example.test'),
	(pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer',
		'{"calendar":"view","personnel":"configure","training":"configure","criticalTasks":"configure","onboarding":"configure","ratingScheme":"configure"}',
		'organization', ARRAY[]::uuid[], 'switches-3@example.test'),
	(pg_temp.id('101'), pg_temp.id('4'), 'member', 'viewer',
		'{"calendar":"view","personnel":"configure","training":"configure","criticalTasks":"configure","onboarding":"configure","ratingScheme":"configure"}',
		'groups', ARRAY[pg_temp.id('201')], 'switches-4@example.test'),
	(pg_temp.id('101'), pg_temp.id('6'), 'member', 'viewer',
		'{"calendar":"view","personnel":"configure","training":"none","criticalTasks":"none","onboarding":"none","ratingScheme":"none"}',
		'organization', ARRAY[]::uuid[], 'switches-6@example.test'),
	(pg_temp.id('102'), pg_temp.id('5'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'switches-5@example.test'),
	(pg_temp.id('102'), pg_temp.id('3'), 'member', 'viewer',
		'{"calendar":"view","personnel":"configure","training":"configure","criticalTasks":"configure","onboarding":"configure","ratingScheme":"configure"}',
		'organization', ARRAY[]::uuid[], 'switches-3@example.test');

-- Person 301 is the shared subject. 302 sits outside Group One. 303 and 304 start Onboarding packets.
INSERT INTO public.personnel (id, organization_id, group_id, rank, last_name, first_name, clinic_role, mos, slug, ets) VALUES
	(pg_temp.id('301'), pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Alpha', 'Avery', 'Medic', '68W', 'switches-301', '2030-01-01'),
	(pg_temp.id('302'), pg_temp.id('101'), pg_temp.id('202'), 'SPC', 'Alpha', 'Blake', 'Medic', '68W', 'switches-302', NULL),
	(pg_temp.id('303'), pg_temp.id('101'), pg_temp.id('201'), 'PFC', 'Alpha', 'Casey', 'Medic', '68W', 'switches-303', NULL),
	(pg_temp.id('304'), pg_temp.id('101'), pg_temp.id('201'), 'PFC', 'Alpha', 'Drew', 'Medic', '68W', 'switches-304', NULL),
	(pg_temp.id('305'), pg_temp.id('102'), pg_temp.id('203'), 'SSG', 'Bravo', 'Emery', 'Medic', '68W', 'switches-305', '2030-01-01');

INSERT INTO public.status_types (id, organization_id, name) VALUES
	(pg_temp.id('401'), pg_temp.id('101'), 'Alpha Leave'),
	(pg_temp.id('402'), pg_temp.id('102'), 'Bravo Leave');
INSERT INTO public.availability_entries (organization_id, personnel_id, status_type_id, start_date, end_date) VALUES
	(pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('401'), '2030-04-01', '2030-04-02'),
	(pg_temp.id('102'), pg_temp.id('305'), pg_temp.id('402'), '2030-04-01', '2030-04-02');

INSERT INTO public.personnel_extended_info (organization_id, personnel_id, blood_type, award_tracking_acknowledged_at) VALUES
	(pg_temp.id('101'), pg_temp.id('301'), 'O+', '2026-01-01'),
	(pg_temp.id('102'), pg_temp.id('305'), 'O+', '2026-01-01');

INSERT INTO public.training_types (id, organization_id, name) VALUES
	(pg_temp.id('501'), pg_temp.id('101'), 'Alpha CLS'),
	(pg_temp.id('502'), pg_temp.id('101'), 'Alpha Retired'),
	(pg_temp.id('503'), pg_temp.id('102'), 'Bravo CLS');
INSERT INTO public.training_views (organization_id, name, column_ids, created_by) VALUES
	(pg_temp.id('101'), 'Alpha View', ARRAY[pg_temp.id('501')], pg_temp.id('1')),
	(pg_temp.id('102'), 'Bravo View', ARRAY[pg_temp.id('503')], pg_temp.id('5'));
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date, certificate_url) VALUES
	(pg_temp.id('511'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('501'), '2026-06-01',
		pg_temp.id('101') || '/personnel/' || pg_temp.id('301') || '/training-certificates/alpha.pdf'),
	(pg_temp.id('512'), pg_temp.id('101'), pg_temp.id('303'), pg_temp.id('501'), '2026-06-01', NULL),
	(pg_temp.id('513'), pg_temp.id('101'), pg_temp.id('304'), pg_temp.id('501'), '2026-06-01', NULL),
	(pg_temp.id('514'), pg_temp.id('102'), pg_temp.id('305'), pg_temp.id('503'), '2026-06-01',
		pg_temp.id('102') || '/personnel/' || pg_temp.id('305') || '/training-certificates/bravo.pdf');
INSERT INTO public.personnel_training_history (organization_id, personnel_id, training_type_id, completion_date) VALUES
	(pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('501'), '2025-06-01'),
	(pg_temp.id('102'), pg_temp.id('305'), pg_temp.id('503'), '2025-06-01');
INSERT INTO public.sign_in_rosters (id, organization_id, title, roster_date, personnel_snapshot, personnel_ids, scope_group_ids, signed_file_path, created_by) VALUES
	(pg_temp.id('521'), pg_temp.id('101'), 'Alpha Roster', '2030-03-01', jsonb_build_array(jsonb_build_object('id', pg_temp.id('301'))), ARRAY[pg_temp.id('301')], ARRAY[pg_temp.id('201')],
		pg_temp.id('101') || '/sign-in-rosters/' || pg_temp.id('521') || '/alpha.pdf', pg_temp.id('1')),
	(pg_temp.id('522'), pg_temp.id('102'), 'Bravo Roster', '2030-03-01', jsonb_build_array(jsonb_build_object('id', pg_temp.id('305'))), ARRAY[pg_temp.id('305')], ARRAY[pg_temp.id('203')],
		pg_temp.id('102') || '/sign-in-rosters/' || pg_temp.id('522') || '/bravo.pdf', pg_temp.id('5'));

INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
SELECT bucket, pg_temp.id(org) || path, pg_temp.id('1'), pg_temp.id('1')::text, '{}'::jsonb
FROM (VALUES
	('training-certificates', '101', '/personnel/' || pg_temp.id('301') || '/training-certificates/alpha.pdf'),
	('counseling-files', '101', '/sign-in-rosters/' || pg_temp.id('521') || '/alpha.pdf'),
	('counseling-files', '101', '/counseling-records/' || pg_temp.id('301') || '/counseling.pdf'),
	('training-certificates', '102', '/personnel/' || pg_temp.id('305') || '/training-certificates/bravo.pdf'),
	('counseling-files', '102', '/sign-in-rosters/' || pg_temp.id('522') || '/bravo.pdf'),
	('counseling-files', '102', '/counseling-records/' || pg_temp.id('305') || '/counseling.pdf')
) AS file(bucket, org, path);

INSERT INTO public.ict_tasks (id, organization_id, task_code, title) VALUES
	(pg_temp.id('601'), pg_temp.id('101'), 'ALPHA-1', 'Alpha task'),
	(pg_temp.id('602'), pg_temp.id('102'), 'BRAVO-1', 'Bravo task');
INSERT INTO public.personnel_ict_completions (organization_id, personnel_id, ict_task_id, completed_at, validation_method) VALUES
	(pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('601'), '2026-08-01', 'Practical Exercise'),
	(pg_temp.id('102'), pg_temp.id('305'), pg_temp.id('602'), '2026-08-01', 'Practical Exercise');

INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES
	(pg_temp.id('701'), pg_temp.id('101'), 'Alpha Inprocessing'),
	(pg_temp.id('702'), pg_temp.id('102'), 'Bravo Inprocessing');
INSERT INTO public.onboarding_template_steps (organization_id, template_id, name, step_type, training_type_id, sort_order) VALUES
	(pg_temp.id('101'), pg_temp.id('701'), 'CLS', 'training', pg_temp.id('501'), 1),
	(pg_temp.id('101'), pg_temp.id('701'), 'Badge', 'checkbox', NULL, 2),
	(pg_temp.id('102'), pg_temp.id('702'), 'Badge', 'checkbox', NULL, 1);
INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, template_id, status) VALUES
	(pg_temp.id('711'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('701'), 'in_progress'),
	(pg_temp.id('712'), pg_temp.id('102'), pg_temp.id('305'), pg_temp.id('702'), 'in_progress');
INSERT INTO public.onboarding_step_progress (id, organization_id, onboarding_id, step_name, step_type, sort_order) VALUES
	(pg_temp.id('721'), pg_temp.id('101'), pg_temp.id('711'), 'Badge', 'checkbox', 2),
	(pg_temp.id('722'), pg_temp.id('102'), pg_temp.id('712'), 'Badge', 'checkbox', 1);

INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rater_person_id, rating_period_start, rating_period_end, status) VALUES
	(pg_temp.id('801'), pg_temp.id('101'), pg_temp.id('301'), 'NCOER', pg_temp.id('301'), '2026-01-01', '2026-12-31', 'active'),
	(pg_temp.id('802'), pg_temp.id('101'), pg_temp.id('302'), 'NCOER', pg_temp.id('302'), '2026-01-01', '2026-12-31', 'active'),
	(pg_temp.id('803'), pg_temp.id('102'), pg_temp.id('305'), 'NCOER', pg_temp.id('305'), '2026-01-01', '2026-12-31', 'active');

INSERT INTO public.deletion_requests (id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description) VALUES
	(pg_temp.id('901'), pg_temp.id('101'), pg_temp.id('3'), 'switches-3@example.test', 'training_type', pg_temp.id('502'), 'Alpha Retired'),
	(pg_temp.id('902'), pg_temp.id('101'), pg_temp.id('3'), 'switches-3@example.test', 'personnel_training', pg_temp.id('512'), 'Casey CLS'),
	(pg_temp.id('903'), pg_temp.id('101'), pg_temp.id('3'), 'switches-3@example.test', 'rating_scheme_entry', pg_temp.id('802'), 'Blake NCOER');

CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
	SELECT set_config('role', 'authenticated', true),
		set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
		set_config('request.jwt.claim.email', 'switches-' || p_user || '@example.test', true),
		set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated',
			'email', 'switches-' || p_user || '@example.test')::text, true);
$$;
CREATE FUNCTION pg_temp.act_as_service() RETURNS void LANGUAGE sql AS $$
	SELECT set_config('role', 'service_role', true),
		set_config('request.jwt.claim.sub', '', true),
		set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
CREATE FUNCTION pg_temp.act_as_fixture() RETURNS void LANGUAGE sql AS $$
	SELECT set_config('role', 'none', true),
		set_config('request.jwt.claim.sub', '', true),
		set_config('request.jwt.claims', '', true);
$$;
CREATE FUNCTION pg_temp.switch_off(p_org text, p_features text[]) RETURNS void LANGUAGE sql AS $$
	UPDATE public.organizations SET disabled_features = p_features WHERE id = pg_temp.id(p_org);
$$;

-- Everything a member can read directly in one Organization. Feature data first,
-- then the Personnel, Calendar and Group data that shares tables and buckets with it.
CREATE FUNCTION pg_temp.readable(p_org uuid) RETURNS text[] LANGUAGE sql AS $$
	SELECT ARRAY(SELECT name FROM (
		SELECT 1, 'training_types' FROM public.training_types WHERE organization_id = p_org
		UNION ALL SELECT 2, 'training_views' FROM public.training_views WHERE organization_id = p_org
		UNION ALL SELECT 3, 'personnel_trainings' FROM public.personnel_trainings WHERE organization_id = p_org
		UNION ALL SELECT 4, 'personnel_training_history' FROM public.personnel_training_history WHERE organization_id = p_org
		UNION ALL SELECT 5, 'sign_in_rosters' FROM public.sign_in_rosters WHERE organization_id = p_org
		UNION ALL SELECT 6, 'training certificate file' FROM storage.objects
			WHERE bucket_id = 'training-certificates' AND name LIKE p_org::text || '/%'
		UNION ALL SELECT 7, 'roster scan file' FROM storage.objects
			WHERE bucket_id = 'counseling-files' AND name LIKE p_org::text || '/sign-in-rosters/%'
		UNION ALL SELECT 8, 'ict_tasks' FROM public.ict_tasks WHERE organization_id = p_org
		UNION ALL SELECT 9, 'personnel_ict_completions' FROM public.personnel_ict_completions WHERE organization_id = p_org
		UNION ALL SELECT 10, 'latest_active_personnel_ict_completions()' FROM public.latest_active_personnel_ict_completions(
			p_org, ARRAY(SELECT id FROM public.personnel WHERE organization_id = p_org), NULL)
		UNION ALL SELECT 11, 'onboarding_templates' FROM public.onboarding_templates WHERE organization_id = p_org
		UNION ALL SELECT 12, 'onboarding_template_steps' FROM public.onboarding_template_steps WHERE organization_id = p_org
		UNION ALL SELECT 13, 'personnel_onboardings' FROM public.personnel_onboardings WHERE organization_id = p_org
		UNION ALL SELECT 14, 'onboarding_step_progress' FROM public.onboarding_step_progress WHERE organization_id = p_org
		UNION ALL SELECT 15, 'active_onboarding_calendar_personnel_ids()' FROM public.active_onboarding_calendar_personnel_ids(p_org)
		UNION ALL SELECT 16, 'rating_scheme_entries' FROM public.rating_scheme_entries WHERE organization_id = p_org
		UNION ALL SELECT 17, 'list_rating_scheme_personnel_lookup()' FROM public.list_rating_scheme_personnel_lookup(p_org)
		UNION ALL SELECT 18, 'list_personnel_award_tracking_acknowledged()' FROM public.list_personnel_award_tracking_acknowledged(p_org)
		UNION ALL SELECT 19, 'personnel' FROM public.personnel WHERE organization_id = p_org
		UNION ALL SELECT 20, 'personnel_extended_info' FROM public.personnel_extended_info WHERE organization_id = p_org
		UNION ALL SELECT 21, 'counseling file' FROM storage.objects
			WHERE bucket_id = 'counseling-files' AND name LIKE p_org::text || '/counseling-records/%'
		UNION ALL SELECT 22, 'availability_entries' FROM public.availability_entries WHERE organization_id = p_org
		UNION ALL SELECT 23, 'groups' FROM public.groups WHERE organization_id = p_org
	) AS visible(position, name) GROUP BY position, name ORDER BY position);
$$;

-- Each write runs and is rolled back; the result names the writes the database accepted.
CREATE FUNCTION pg_temp.writable(p_org uuid) RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE
	accepted text[] := ARRAY[]::text[];
	attempt record;
	changed integer;
BEGIN
	FOR attempt IN SELECT * FROM (VALUES
		(1, 'training_types', format('UPDATE public.training_types SET name = name || %L WHERE organization_id = %L', '.', p_org)),
		(2, 'personnel_trainings', format('UPDATE public.personnel_trainings SET notes = %L WHERE organization_id = %L', 'changed', p_org)),
		(3, 'sign_in_rosters', format('UPDATE public.sign_in_rosters SET title = %L WHERE organization_id = %L', 'Changed', p_org)),
		(4, 'ict_tasks', format('UPDATE public.ict_tasks SET title = %L WHERE organization_id = %L', 'Changed', p_org)),
		(5, 'personnel_ict_completions', format('UPDATE public.personnel_ict_completions SET notes = %L WHERE organization_id = %L', 'changed', p_org)),
		(6, 'onboarding_templates', format('UPDATE public.onboarding_templates SET name = %L WHERE organization_id = %L', 'Changed', p_org)),
		(7, 'append_onboarding_step_note()', format('SELECT public.append_onboarding_step_note(%L, id, %L) FROM public.onboarding_step_progress WHERE organization_id = %L', p_org, 'note', p_org)),
		(8, 'rating_scheme_entries', format('UPDATE public.rating_scheme_entries SET notes = %L WHERE organization_id = %L', 'changed', p_org)),
		(9, 'award acknowledgement', format('UPDATE public.personnel_extended_info SET award_tracking_acknowledged_at = %L WHERE organization_id = %L', '2026-02-01', p_org)),
		(10, 'personnel', format('UPDATE public.personnel SET first_name = first_name || %L WHERE organization_id = %L', '.', p_org)),
		(11, 'data sheet field', format('UPDATE public.personnel_extended_info SET blood_type = %L WHERE organization_id = %L', 'A+', p_org)),
		(12, 'availability_entries', format('UPDATE public.availability_entries SET end_date = %L WHERE organization_id = %L', '2030-04-03', p_org))
	) AS w(position, name, statement) ORDER BY position LOOP
		BEGIN
			EXECUTE attempt.statement;
			GET DIAGNOSTICS changed = ROW_COUNT;
			IF changed > 0 THEN accepted := accepted || attempt.name; END IF;
			RAISE EXCEPTION USING ERRCODE = 'T0001';
		EXCEPTION
			WHEN SQLSTATE 'T0001' OR insufficient_privilege THEN NULL;
		END;
	END LOOP;
	RETURN accepted;
END;
$$;

CREATE FUNCTION pg_temp.readable_as(p_user text, p_org text) RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE result text[];
BEGIN
	PERFORM pg_temp.act_as(p_user);
	result := pg_temp.readable(pg_temp.id(p_org));
	PERFORM pg_temp.act_as_fixture();
	RETURN result;
END;
$$;
CREATE FUNCTION pg_temp.writable_as(p_user text, p_org text) RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE result text[];
BEGIN
	PERFORM pg_temp.act_as(p_user);
	result := pg_temp.writable(pg_temp.id(p_org));
	PERFORM pg_temp.act_as_fixture();
	RETURN result;
END;
$$;

CREATE TEMP TABLE feature_owned (feature text, item text);
INSERT INTO feature_owned VALUES
	('training', 'training_types'), ('training', 'training_views'), ('training', 'personnel_trainings'),
	('training', 'personnel_training_history'), ('training', 'sign_in_rosters'),
	('training', 'training certificate file'), ('training', 'roster scan file'),
	('criticalTasks', 'ict_tasks'), ('criticalTasks', 'personnel_ict_completions'),
	('criticalTasks', 'latest_active_personnel_ict_completions()'),
	('onboarding', 'onboarding_templates'), ('onboarding', 'onboarding_template_steps'),
	('onboarding', 'personnel_onboardings'), ('onboarding', 'onboarding_step_progress'),
	('onboarding', 'active_onboarding_calendar_personnel_ids()'), ('onboarding', 'append_onboarding_step_note()'),
	('evaluations', 'rating_scheme_entries'), ('evaluations', 'list_rating_scheme_personnel_lookup()'),
	('lossesAndAwards', 'list_personnel_award_tracking_acknowledged()'), ('lossesAndAwards', 'award acknowledgement');

CREATE TEMP TABLE actor_baseline (actor text, label text, reads text[], writes text[]);
INSERT INTO actor_baseline VALUES
	('1', 'an owner',
		ARRAY['training_types', 'training_views', 'personnel_trainings', 'personnel_training_history', 'sign_in_rosters',
			'training certificate file', 'roster scan file', 'ict_tasks', 'personnel_ict_completions',
			'latest_active_personnel_ict_completions()', 'onboarding_templates', 'onboarding_template_steps',
			'personnel_onboardings', 'onboarding_step_progress', 'active_onboarding_calendar_personnel_ids()',
			'rating_scheme_entries', 'list_rating_scheme_personnel_lookup()', 'list_personnel_award_tracking_acknowledged()',
			'personnel', 'personnel_extended_info', 'counseling file', 'availability_entries', 'groups'],
		ARRAY['training_types', 'personnel_trainings', 'sign_in_rosters', 'ict_tasks', 'personnel_ict_completions',
			'onboarding_templates', 'append_onboarding_step_note()', 'rating_scheme_entries', 'award acknowledgement',
			'personnel', 'data sheet field', 'availability_entries']),
	('2', 'an admin',
		ARRAY['training_types', 'training_views', 'personnel_trainings', 'personnel_training_history', 'sign_in_rosters',
			'training certificate file', 'roster scan file', 'ict_tasks', 'personnel_ict_completions',
			'latest_active_personnel_ict_completions()', 'onboarding_templates', 'onboarding_template_steps',
			'personnel_onboardings', 'onboarding_step_progress', 'active_onboarding_calendar_personnel_ids()',
			'rating_scheme_entries', 'list_rating_scheme_personnel_lookup()', 'list_personnel_award_tracking_acknowledged()',
			'personnel', 'personnel_extended_info', 'counseling file', 'availability_entries', 'groups'],
		ARRAY['training_types', 'personnel_trainings', 'sign_in_rosters', 'ict_tasks', 'personnel_ict_completions',
			'onboarding_templates', 'append_onboarding_step_note()', 'rating_scheme_entries', 'award acknowledgement',
			'personnel', 'data sheet field', 'availability_entries']),
	('3', 'an Organization-wide member',
		ARRAY['training_types', 'training_views', 'personnel_trainings', 'personnel_training_history', 'sign_in_rosters',
			'training certificate file', 'roster scan file', 'ict_tasks', 'personnel_ict_completions',
			'latest_active_personnel_ict_completions()', 'onboarding_templates', 'onboarding_template_steps',
			'personnel_onboardings', 'onboarding_step_progress', 'active_onboarding_calendar_personnel_ids()',
			'rating_scheme_entries', 'list_rating_scheme_personnel_lookup()', 'list_personnel_award_tracking_acknowledged()',
			'personnel', 'personnel_extended_info', 'counseling file', 'availability_entries', 'groups'],
		ARRAY['training_types', 'personnel_trainings', 'sign_in_rosters', 'ict_tasks', 'personnel_ict_completions',
			'onboarding_templates', 'append_onboarding_step_note()', 'rating_scheme_entries', 'award acknowledgement',
			'personnel', 'data sheet field']),
	('4', 'a Group-scoped member',
		ARRAY['training_types', 'training_views', 'personnel_trainings', 'personnel_training_history', 'sign_in_rosters',
			'training certificate file', 'roster scan file', 'ict_tasks', 'personnel_ict_completions',
			'latest_active_personnel_ict_completions()', 'onboarding_templates', 'onboarding_template_steps',
			'personnel_onboardings', 'onboarding_step_progress', 'active_onboarding_calendar_personnel_ids()',
			'rating_scheme_entries', 'list_rating_scheme_personnel_lookup()', 'list_personnel_award_tracking_acknowledged()',
			'personnel', 'personnel_extended_info', 'counseling file', 'availability_entries', 'groups'],
		ARRAY['personnel_trainings', 'sign_in_rosters', 'personnel_ict_completions', 'append_onboarding_step_note()',
			'rating_scheme_entries', 'award acknowledgement', 'personnel', 'data sheet field']);

CREATE FUNCTION pg_temp.without(p_items text[], p_feature text) RETURNS text[] LANGUAGE sql AS $$
	SELECT ARRAY(SELECT item FROM unnest(p_items) WITH ORDINALITY AS i(item, n)
		WHERE item NOT IN (SELECT item FROM feature_owned WHERE feature = p_feature) ORDER BY n);
$$;

SELECT is(
	(SELECT jsonb_build_array(disabled_features, strength_floor_percent) FROM public.organizations WHERE id = pg_temp.id('101')),
	'[[], 80]'::jsonb,
	'a new Organization has every feature on and an 80 percent strength floor'
);
SELECT ok(
	has_column_privilege('authenticated', 'public.organizations', 'disabled_features', 'UPDATE')
		AND has_column_privilege('authenticated', 'public.organizations', 'strength_floor_percent', 'UPDATE'),
	'signed-in members hold the column UPDATE grants that RLS then narrows'
);
SELECT ok(
	NOT has_column_privilege('anon', 'public.organizations', 'disabled_features', 'UPDATE')
		AND NOT has_column_privilege('anon', 'public.organizations', 'strength_floor_percent', 'UPDATE'),
	'anonymous callers cannot update either column'
);
SELECT is(
	ARRAY(SELECT p.proname || ':' || p.prosecdef || ':' || p.provolatile::text || ':' || array_to_string(p.proconfig, ',')
		|| ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
		FROM pg_proc AS p WHERE p.pronamespace = 'public'::regnamespace
			AND p.proname IN ('member_access_has_capability', 'organization_feature_enabled') ORDER BY p.proname),
	ARRAY['member_access_has_capability:true:s:search_path="":true', 'organization_feature_enabled:true:s:search_path="":true'],
	'both switch-aware helpers are stable definer functions with a pinned search path that policies can call'
);

SELECT is(pg_temp.readable_as(actor, '101'), reads, label || ' reads every feature while all are on')
FROM actor_baseline ORDER BY actor;
SELECT is(pg_temp.writable_as(actor, '101'), writes, label || ' writes within stored access while all are on')
FROM actor_baseline ORDER BY actor;
SELECT is(pg_temp.readable_as('6', '101'),
	ARRAY['personnel_onboardings', 'onboarding_step_progress', 'active_onboarding_calendar_personnel_ids()',
		'list_personnel_award_tracking_acknowledged()', 'personnel', 'personnel_extended_info', 'counseling file',
		'availability_entries', 'groups'],
	'a member with no feature lanes reads Onboarding and award badges only through Personnel and Calendar while all are on');

SELECT pg_temp.switch_off('101', ARRAY['training']);
SELECT is(pg_temp.readable_as(actor, '101'), pg_temp.without(reads, 'training'),
	label || ' reads no Training data while Training is off')
FROM actor_baseline WHERE actor <> '1' ORDER BY actor;
SELECT is(pg_temp.readable_as('1', '101'),
	ARRAY['training certificate file', 'roster scan file', 'ict_tasks', 'personnel_ict_completions',
		'latest_active_personnel_ict_completions()', 'onboarding_templates', 'onboarding_template_steps',
		'personnel_onboardings', 'onboarding_step_progress', 'active_onboarding_calendar_personnel_ids()',
		'rating_scheme_entries', 'list_rating_scheme_personnel_lookup()', 'list_personnel_award_tracking_acknowledged()',
		'personnel', 'personnel_extended_info', 'counseling file', 'availability_entries', 'groups'],
	'an owner reads no Training rows while Training is off; Organization deletion still lists its retained files');
SELECT is(pg_temp.writable_as(actor, '101'), pg_temp.without(writes, 'training'),
	label || ' changes no Training data while Training is off')
FROM actor_baseline ORDER BY actor;

SELECT pg_temp.switch_off('101', ARRAY['criticalTasks']);
SELECT is(pg_temp.readable_as(actor, '101'), pg_temp.without(reads, 'criticalTasks'),
	label || ' reads no Critical tasks data while Critical tasks is off')
FROM actor_baseline ORDER BY actor;
SELECT is(pg_temp.writable_as(actor, '101'), pg_temp.without(writes, 'criticalTasks'),
	label || ' changes no Critical tasks data while Critical tasks is off')
FROM actor_baseline ORDER BY actor;

SELECT pg_temp.switch_off('101', ARRAY['onboarding']);
SELECT is(pg_temp.readable_as(actor, '101'), pg_temp.without(reads, 'onboarding'),
	label || ' reads no Onboarding data, through Personnel view or Calendar, while Onboarding is off')
FROM actor_baseline ORDER BY actor;
SELECT is(pg_temp.writable_as(actor, '101'), pg_temp.without(writes, 'onboarding'),
	label || ' changes no Onboarding data while Onboarding is off')
FROM actor_baseline ORDER BY actor;

SELECT pg_temp.switch_off('101', ARRAY['evaluations']);
SELECT is(pg_temp.readable_as(actor, '101'), pg_temp.without(reads, 'evaluations'),
	label || ' reads no Evaluations data while Evaluations is off')
FROM actor_baseline ORDER BY actor;
SELECT is(pg_temp.writable_as(actor, '101'), pg_temp.without(writes, 'evaluations'),
	label || ' changes no Evaluations data while Evaluations is off')
FROM actor_baseline ORDER BY actor;

SELECT pg_temp.switch_off('101', ARRAY['lossesAndAwards']);
SELECT is(pg_temp.readable_as(actor, '101'), pg_temp.without(reads, 'lossesAndAwards'),
	label || ' reads no award acknowledgements while Losses and awards is off')
FROM actor_baseline ORDER BY actor;
SELECT is(pg_temp.writable_as(actor, '101'), pg_temp.without(writes, 'lossesAndAwards'),
	label || ' cannot acknowledge awards but keeps the Data Sheet while Losses and awards is off')
FROM actor_baseline ORDER BY actor;

SELECT ok(
  NOT has_column_privilege('authenticated', 'public.personnel_extended_info', 'award_tracking_acknowledged_at', 'SELECT')
    AND NOT has_any_column_privilege('anon', 'public.personnel_extended_info', 'SELECT'),
  'acknowledgements have no direct authenticated read grant and anonymous callers have no Data Sheet read grants'
);
SELECT is(
  ARRAY(SELECT attname::text FROM pg_attribute
    WHERE attrelid = 'public.personnel_extended_info'::regclass AND attnum > 0 AND NOT attisdropped
      AND attname <> 'award_tracking_acknowledged_at'
      AND NOT has_column_privilege('authenticated', attrelid, attnum, 'SELECT') ORDER BY attname),
  ARRAY[]::text[],
  'every non-acknowledgement Data Sheet column has an explicit read grant, including future columns'
);
SELECT pg_temp.act_as('2');
SELECT throws_ok(
  $$ SELECT award_tracking_acknowledged_at FROM public.personnel_extended_info WHERE organization_id = pg_temp.id('101') $$,
  '42501', NULL, 'an admin cannot read the award acknowledgement column directly'
);
SELECT is(
  (SELECT blood_type FROM public.personnel_extended_info WHERE personnel_id = pg_temp.id('301')),
  'O+', 'other Data Sheet fields stay readable while Losses and awards is off'
);
SELECT throws_ok(
  $$ INSERT INTO public.personnel_extended_info (organization_id, personnel_id, award_tracking_acknowledged_at)
    VALUES (pg_temp.id('101'), pg_temp.id('302'), now()) $$,
  '42501', NULL, 'inserting an acknowledgement is denied while Losses and awards is off'
);
SELECT lives_ok(
  $$ INSERT INTO public.personnel_extended_info (organization_id, personnel_id, blood_type)
    VALUES (pg_temp.id('101'), pg_temp.id('302'), 'A+') RETURNING id, personnel_id, blood_type $$,
  'a Data Sheet insert returning ordinary fields succeeds while Losses and awards is off'
);
SELECT lives_ok(
  $$ INSERT INTO public.personnel_extended_info (organization_id, personnel_id, blood_type)
    VALUES (pg_temp.id('101'), pg_temp.id('302'), 'B+')
    ON CONFLICT (personnel_id) DO UPDATE SET blood_type = EXCLUDED.blood_type
    RETURNING id, personnel_id, blood_type $$,
  'a Data Sheet upsert can return ordinary fields without reading the acknowledgement'
);
SELECT pg_temp.act_as_fixture();

SELECT pg_temp.switch_off('101', ARRAY['training', 'criticalTasks', 'evaluations', 'onboarding', 'lossesAndAwards']);
SELECT is(
	jsonb_build_array(pg_temp.readable_as('3', '102'), pg_temp.writable_as('3', '102')),
	(SELECT jsonb_build_array(reads, writes) FROM actor_baseline WHERE actor = '3'),
	'the same member keeps every feature in another Organization whose switches are on'
);
SELECT is(pg_temp.readable_as('5', '102'), (SELECT reads FROM actor_baseline WHERE actor = '1'),
	'another Organization''s owner keeps every feature');

SELECT pg_temp.act_as('3');
WITH updated AS (
	UPDATE public.organizations SET disabled_features = '{}', strength_floor_percent = 50
	WHERE id = pg_temp.id('101') RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'a member who lost every feature cannot turn them back on');
SELECT pg_temp.act_as('2');
SELECT is(
	(SELECT disabled_features FROM public.organizations WHERE id = pg_temp.id('101')),
	ARRAY['training', 'criticalTasks', 'evaluations', 'onboarding', 'lossesAndAwards'],
	'an admin still reads the switches while every feature is off'
);
WITH updated AS (
	UPDATE public.organizations SET disabled_features = ARRAY['training', 'lossesAndAwards'], strength_floor_percent = 65
	WHERE id = pg_temp.id('101') RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'an admin can change feature switches and the strength floor');
SELECT throws_ok(
	$$ UPDATE public.organizations SET disabled_features = ARRAY['training', 'dutyRoster'] WHERE id = pg_temp.id('101') $$,
	'23514', NULL, 'an unknown feature key is rejected'
);
SELECT throws_ok(
	$$ UPDATE public.organizations SET disabled_features = ARRAY[NULL]::text[] WHERE id = pg_temp.id('101') $$,
	'23514', NULL, 'a null feature key is rejected'
);
SELECT throws_ok(
	$$ UPDATE public.organizations SET strength_floor_percent = 0 WHERE id = pg_temp.id('101') $$,
	'23514', NULL, 'a strength floor below 1 is rejected'
);
SELECT throws_ok(
	$$ UPDATE public.organizations SET strength_floor_percent = 101 WHERE id = pg_temp.id('101') $$,
	'23514', NULL, 'a strength floor above 100 is rejected'
);
SELECT pg_temp.act_as_fixture();
SELECT is(
	(SELECT jsonb_build_array(disabled_features, strength_floor_percent) FROM public.organizations WHERE id = pg_temp.id('101')),
	'[["training", "lossesAndAwards"], 65]'::jsonb,
	'the admin update persists exactly and the rejected writes change nothing'
);

SELECT pg_temp.act_as('1');
WITH updated AS (
	UPDATE public.organizations SET disabled_features = '{}', strength_floor_percent = 100
	WHERE id = pg_temp.id('101') RETURNING disabled_features, strength_floor_percent
)
SELECT is(
	(SELECT jsonb_build_array(disabled_features, strength_floor_percent) FROM updated),
	'[[], 100]'::jsonb,
	'an owner can turn every feature back on and set the floor to 100'
);
SELECT pg_temp.act_as_fixture();

SELECT is(pg_temp.readable_as(actor, '101'), reads, label || ' reads again by stored access after re-enabling')
FROM actor_baseline ORDER BY actor;
SELECT is(pg_temp.writable_as(actor, '101'), writes, label || ' writes again by stored access after re-enabling')
FROM actor_baseline ORDER BY actor;
SELECT pg_temp.act_as('4');
SELECT is(
	ARRAY(SELECT personnel_id::text FROM public.personnel_trainings WHERE organization_id = pg_temp.id('101') ORDER BY personnel_id),
	ARRAY[pg_temp.id('301')::text, pg_temp.id('303')::text, pg_temp.id('304')::text],
	're-enabling keeps a Group-scoped member inside their Group'
);
SELECT pg_temp.act_as_fixture();
SELECT is(pg_temp.readable_as('6', '101'),
	ARRAY['personnel_onboardings', 'onboarding_step_progress', 'active_onboarding_calendar_personnel_ids()',
		'list_personnel_award_tracking_acknowledged()', 'personnel', 'personnel_extended_info', 'counseling file',
		'availability_entries', 'groups'],
	're-enabling gives a member with no feature lanes only the Personnel and Calendar reads they had');
SELECT is(
	(SELECT jsonb_object_agg(user_id, capability_overrides) FROM public.organization_memberships
		WHERE organization_id = pg_temp.id('101') AND role = 'member'),
	jsonb_build_object(
		pg_temp.id('3'), '{"calendar":"view","personnel":"configure","training":"configure","criticalTasks":"configure","onboarding":"configure","ratingScheme":"configure"}'::jsonb,
		pg_temp.id('4'), '{"calendar":"view","personnel":"configure","training":"configure","criticalTasks":"configure","onboarding":"configure","ratingScheme":"configure"}'::jsonb,
		pg_temp.id('6'), '{"calendar":"view","personnel":"configure","training":"none","criticalTasks":"none","onboarding":"none","ratingScheme":"none"}'::jsonb),
	'switching features leaves every stored member capability as it was'
);

SELECT pg_temp.switch_off('101', ARRAY['training']);
SELECT pg_temp.act_as('2');
SELECT is(
	(SELECT jsonb_agg(jsonb_build_array(step->>'step_name', step->>'completed') ORDER BY step->>'sort_order')
		FROM jsonb_array_elements(public.start_onboarding_packet(pg_temp.id('101'), pg_temp.id('303'), pg_temp.id('701'), '2026-10-01', '[]')->'steps') AS step),
	'[["CLS", "false"], ["Badge", "false"]]'::jsonb,
	'a packet started while Training is off reads no Training completion, so its Training step starts open'
);
SELECT lives_ok(
	$$ UPDATE public.onboarding_step_progress AS step SET completed = NOT step.completed
		FROM public.personnel_onboardings AS packet
		WHERE packet.id = step.onboarding_id AND packet.personnel_id = pg_temp.id('303') AND step.step_name = 'CLS' $$,
	'while Training is off, a Training step is completed by hand'
);
SELECT is(
	(SELECT step.completed FROM public.onboarding_step_progress AS step
		JOIN public.personnel_onboardings AS packet ON packet.id = step.onboarding_id
		WHERE packet.personnel_id = pg_temp.id('303') AND step.step_name = 'CLS'),
	true,
	'the hand-completed Training step is saved'
);
SELECT pg_temp.act_as_fixture();
SELECT pg_temp.switch_off('101', ARRAY[]::text[]);
SELECT pg_temp.act_as('2');
SELECT is(
	(SELECT jsonb_agg(jsonb_build_array(step->>'step_name', step->>'completed') ORDER BY step->>'sort_order')
		FROM jsonb_array_elements(public.start_onboarding_packet(pg_temp.id('101'), pg_temp.id('304'), pg_temp.id('701'), '2026-10-01', '[]')->'steps') AS step),
	'[["CLS", "true"], ["Badge", "false"]]'::jsonb,
	'with Training on, a saved completion starts the Training step complete'
);
SELECT throws_ok(
	$$ UPDATE public.onboarding_step_progress AS step SET completed = false
		FROM public.personnel_onboardings AS packet
		WHERE packet.id = step.onboarding_id AND packet.personnel_id = pg_temp.id('304') AND step.step_name = 'CLS' $$,
	'42501', NULL, 'with Training on, Training records alone complete a Training step'
);
SELECT pg_temp.act_as_fixture();

SELECT pg_temp.switch_off('101', ARRAY['training', 'evaluations']);
SELECT pg_temp.act_as_service();
SELECT throws_ok(
	format($$ SELECT public.approve_record_deletion_request(%L, %L, 'training_type', %L, %L, now()) $$,
		pg_temp.id('101'), pg_temp.id('901'), pg_temp.id('502'), pg_temp.id('2')),
	'42501', NULL, 'a Training type deletion cannot be approved while Training is off'
);
SELECT throws_ok(
	format($$ SELECT public.approve_record_deletion_request(%L, %L, 'personnel_training', %L, %L, now()) $$,
		pg_temp.id('101'), pg_temp.id('902'), pg_temp.id('512'), pg_temp.id('2')),
	'42501', NULL, 'a Training record deletion cannot be approved while Training is off'
);
SELECT throws_ok(
	format($$ SELECT public.approve_record_deletion_request(%L, %L, 'rating_scheme_entry', %L, %L, now()) $$,
		pg_temp.id('101'), pg_temp.id('903'), pg_temp.id('802'), pg_temp.id('2')),
	'42501', NULL, 'an Evaluations deletion cannot be approved while Evaluations is off'
);
SELECT pg_temp.act_as_fixture();
SELECT is(
	ARRAY[
		(SELECT string_agg(status, ',' ORDER BY id) FROM public.deletion_requests WHERE organization_id = pg_temp.id('101')),
		(SELECT count(*)::text FROM public.training_types WHERE id = pg_temp.id('502')),
		(SELECT count(*)::text FROM public.personnel_trainings WHERE id = pg_temp.id('512')),
		(SELECT count(*)::text FROM public.rating_scheme_entries WHERE id = pg_temp.id('802'))
	],
	ARRAY['pending,pending,pending', '1', '1', '1'],
	'denied approvals keep the requests pending and their records stored'
);
SELECT pg_temp.switch_off('101', ARRAY['evaluations']);
SELECT pg_temp.act_as_service();
SELECT lives_ok(
	format($$ SELECT public.approve_record_deletion_request(%L, %L, 'personnel_training', %L, %L, now()) $$,
		pg_temp.id('101'), pg_temp.id('902'), pg_temp.id('512'), pg_temp.id('2')),
	'turning Training back on lets its pending deletion be approved'
);
SELECT pg_temp.act_as_fixture();

SELECT * FROM finish();
ROLLBACK;
