BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(34);

-- The Storage API deletes under this setting, leaving RLS as the only gate under test.
SELECT set_config('storage.allow_delete_query', 'true', true);

-- Alpha owner, Alpha viewer, Bravo owner and a non-member invitee.
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, '', now(),
	'{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now()
FROM (VALUES
	('f3000000-0000-4000-8000-000000000001', 'suspension-alpha-owner@example.test'),
	('f3000000-0000-4000-8000-000000000002', 'suspension-alpha-viewer@example.test'),
	('f3000000-0000-4000-8000-000000000003', 'suspension-bravo-owner@example.test'),
	('f3000000-0000-4000-8000-000000000004', 'suspension-invitee@example.test'),
	('f3000000-0000-4000-8000-000000000005', 'suspension-platform-admin@example.test')
) AS fixture(id, email);

INSERT INTO public.organizations (id, name, created_by, url_slug) VALUES
	('f3000000-0000-4000-8000-000000000101', 'Suspension Alpha', 'f3000000-0000-4000-8000-000000000001', 'suspension-alpha'),
	('f3000000-0000-4000-8000-000000000102', 'Suspension Bravo', 'f3000000-0000-4000-8000-000000000003', 'suspension-bravo');

INSERT INTO public.organization_memberships (id, organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email) VALUES
	('f3000000-0000-4000-8000-000000000201', 'f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000001', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'suspension-alpha-owner@example.test'),
	('f3000000-0000-4000-8000-000000000202', 'f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000002', 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], 'suspension-alpha-viewer@example.test'),
	('f3000000-0000-4000-8000-000000000203', 'f3000000-0000-4000-8000-000000000102', 'f3000000-0000-4000-8000-000000000003', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'suspension-bravo-owner@example.test');

INSERT INTO public.groups (id, organization_id, name) VALUES
	('f3000000-0000-4000-8000-000000000301', 'f3000000-0000-4000-8000-000000000101', 'Alpha Group'),
	('f3000000-0000-4000-8000-000000000302', 'f3000000-0000-4000-8000-000000000102', 'Bravo Group');

INSERT INTO public.personnel (id, organization_id, group_id, rank, last_name, first_name, clinic_role, mos, slug) VALUES
	('f3000000-0000-4000-8000-000000000401', 'f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000301', 'SGT', 'Alpha', 'Avery', 'Medic', '68W', 'suspension-alpha-avery'),
	('f3000000-0000-4000-8000-000000000402', 'f3000000-0000-4000-8000-000000000102', 'f3000000-0000-4000-8000-000000000302', 'SSG', 'Bravo', 'Blake', 'Medic', '68W', 'suspension-bravo-blake');

INSERT INTO public.status_types (id, organization_id, name) VALUES
	('f3000000-0000-4000-8000-000000000501', 'f3000000-0000-4000-8000-000000000101', 'Alpha Leave'),
	('f3000000-0000-4000-8000-000000000502', 'f3000000-0000-4000-8000-000000000102', 'Bravo Leave');

INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date) VALUES
	('f3000000-0000-4000-8000-000000000601', 'f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000401', 'f3000000-0000-4000-8000-000000000501', '2030-04-01', '2030-04-02'),
	('f3000000-0000-4000-8000-000000000602', 'f3000000-0000-4000-8000-000000000102', 'f3000000-0000-4000-8000-000000000402', 'f3000000-0000-4000-8000-000000000502', '2030-04-01', '2030-04-02');

INSERT INTO public.training_types (id, organization_id, name) VALUES
	('f3000000-0000-4000-8000-000000000701', 'f3000000-0000-4000-8000-000000000101', 'Alpha CLS'),
	('f3000000-0000-4000-8000-000000000702', 'f3000000-0000-4000-8000-000000000102', 'Bravo CLS');

INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date) VALUES
	('f3000000-0000-4000-8000-000000000801', 'f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000401', 'f3000000-0000-4000-8000-000000000701', '2026-06-01'),
	('f3000000-0000-4000-8000-000000000802', 'f3000000-0000-4000-8000-000000000102', 'f3000000-0000-4000-8000-000000000402', 'f3000000-0000-4000-8000-000000000702', '2026-06-01');

INSERT INTO public.ict_tasks (id, organization_id, task_code, title) VALUES
	('f3000000-0000-4000-8000-000000000901', 'f3000000-0000-4000-8000-000000000101', 'ALPHA-1', 'Alpha task'),
	('f3000000-0000-4000-8000-000000000902', 'f3000000-0000-4000-8000-000000000102', 'BRAVO-1', 'Bravo task');

INSERT INTO public.personnel_ict_completions (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method) VALUES
	('f3000000-0000-4000-8000-000000001001', 'f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000401', 'f3000000-0000-4000-8000-000000000901', '2026-08-01', 'Practical Exercise'),
	('f3000000-0000-4000-8000-000000001002', 'f3000000-0000-4000-8000-000000000102', 'f3000000-0000-4000-8000-000000000402', 'f3000000-0000-4000-8000-000000000902', '2026-08-01', 'Practical Exercise');

INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, status) VALUES
	('f3000000-0000-4000-8000-000000001101', 'f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000401', 'in_progress'),
	('f3000000-0000-4000-8000-000000001102', 'f3000000-0000-4000-8000-000000000102', 'f3000000-0000-4000-8000-000000000402', 'in_progress');

INSERT INTO public.sign_in_rosters (id, organization_id, title, roster_date, personnel_snapshot, personnel_ids, scope_group_ids, created_by) VALUES
	('f3000000-0000-4000-8000-000000001201', 'f3000000-0000-4000-8000-000000000101', 'Alpha Roster', '2030-03-01', '[]', ARRAY[]::uuid[], ARRAY[]::uuid[], 'f3000000-0000-4000-8000-000000000001'),
	('f3000000-0000-4000-8000-000000001202', 'f3000000-0000-4000-8000-000000000102', 'Bravo Roster', '2030-03-01', '[]', ARRAY[]::uuid[], ARRAY[]::uuid[], 'f3000000-0000-4000-8000-000000000003');

INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rater_person_id, rating_period_start, rating_period_end, status) VALUES
	('f3000000-0000-4000-8000-000000001301', 'f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000401', 'NCOER', 'f3000000-0000-4000-8000-000000000401', '2026-01-01', '2026-12-31', 'active'),
	('f3000000-0000-4000-8000-000000001302', 'f3000000-0000-4000-8000-000000000102', 'f3000000-0000-4000-8000-000000000402', 'NCOER', 'f3000000-0000-4000-8000-000000000402', '2026-01-01', '2026-12-31', 'active');

INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES
	('f3000000-0000-4000-8000-000000001401', 'personnel-documents', 'f3000000-0000-4000-8000-000000000101/personnel/f3000000-0000-4000-8000-000000000401/documents/alpha.pdf', 'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', '{}'::jsonb),
	('f3000000-0000-4000-8000-000000001402', 'personnel-documents', 'f3000000-0000-4000-8000-000000000102/personnel/f3000000-0000-4000-8000-000000000402/documents/bravo.pdf', 'f3000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000003', '{}'::jsonb);

INSERT INTO public.organization_invitations (id, organization_id, email, invited_by, status, expires_at, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids) VALUES
	('f3000000-0000-4000-8000-000000001501', 'f3000000-0000-4000-8000-000000000101', 'suspension-invitee@example.test', 'f3000000-0000-4000-8000-000000000001', 'pending', now() + interval '7 days', 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[]),
	('f3000000-0000-4000-8000-000000001502', 'f3000000-0000-4000-8000-000000000102', 'suspension-invitee@example.test', 'f3000000-0000-4000-8000-000000000003', 'pending', now() + interval '7 days', 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[]);

CREATE TEMP TABLE suspension_actor_results (label text PRIMARY KEY, value text[]) ON COMMIT DROP;
GRANT ALL ON suspension_actor_results TO authenticated;

-- Each lane row the caller can read directly in one Organization, named by table.
CREATE FUNCTION pg_temp.visible_lane_tables(p_organization_id uuid) RETURNS text[]
LANGUAGE sql AS $$
	SELECT ARRAY(SELECT name FROM (
		SELECT 'availability_entries' FROM public.availability_entries WHERE organization_id = p_organization_id
		UNION ALL SELECT 'groups' FROM public.groups WHERE organization_id = p_organization_id
		UNION ALL SELECT 'personnel' FROM public.personnel WHERE organization_id = p_organization_id
		UNION ALL SELECT 'personnel_ict_completions' FROM public.personnel_ict_completions WHERE organization_id = p_organization_id
		UNION ALL SELECT 'personnel_onboardings' FROM public.personnel_onboardings WHERE organization_id = p_organization_id
		UNION ALL SELECT 'personnel_trainings' FROM public.personnel_trainings WHERE organization_id = p_organization_id
		UNION ALL SELECT 'rating_scheme_entries' FROM public.rating_scheme_entries WHERE organization_id = p_organization_id
		UNION ALL SELECT 'sign_in_rosters' FROM public.sign_in_rosters WHERE organization_id = p_organization_id
		UNION ALL SELECT 'storage.objects' FROM storage.objects
			WHERE bucket_id = 'personnel-documents' AND name LIKE p_organization_id::text || '/%'
	) AS visible(name) ORDER BY name);
$$;

CREATE FUNCTION pg_temp.act_as(p_user_id uuid, p_email text) RETURNS void
LANGUAGE sql AS $$
	SELECT set_config('request.jwt.claim.sub', p_user_id::text, true),
		set_config('request.jwt.claim.email', p_email, true),
		set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'email', p_email, 'role', 'authenticated')::text, true);
$$;

-- Active Organizations and accounts.
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000001', 'suspension-alpha-owner@example.test');
SELECT is(
	pg_temp.visible_lane_tables('f3000000-0000-4000-8000-000000000101'),
	ARRAY['availability_entries', 'groups', 'personnel', 'personnel_ict_completions', 'personnel_onboardings', 'personnel_trainings', 'rating_scheme_entries', 'sign_in_rosters', 'storage.objects'],
	'an active Organization owner reads every representative lane table and private file directly'
);
SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000003', 'suspension-bravo-owner@example.test');
SELECT is(
	pg_temp.visible_lane_tables('f3000000-0000-4000-8000-000000000102'),
	ARRAY['availability_entries', 'groups', 'personnel', 'personnel_ict_completions', 'personnel_onboardings', 'personnel_trainings', 'rating_scheme_entries', 'sign_in_rosters', 'storage.objects'],
	'an active account owns the same direct reads in its own Organization'
);

-- The platform service path suspends Alpha.
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.organizations SET suspended_at = now() WHERE id = 'f3000000-0000-4000-8000-000000000101';
RESET ROLE;
SELECT isnt(
	(SELECT suspended_at FROM public.organizations WHERE id = 'f3000000-0000-4000-8000-000000000101'),
	NULL,
	'the service path suspends the Organization'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000001', 'suspension-alpha-owner@example.test');
SELECT is(
	pg_temp.visible_lane_tables('f3000000-0000-4000-8000-000000000101'),
	ARRAY[]::text[],
	'a suspended Organization owner reads no lane rows or private files directly'
);
SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000002', 'suspension-alpha-viewer@example.test');
SELECT is(
	pg_temp.visible_lane_tables('f3000000-0000-4000-8000-000000000101'),
	ARRAY[]::text[],
	'a suspended Organization viewer reads no lane rows directly'
);

SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000001', 'suspension-alpha-owner@example.test');
SELECT throws_ok(
	$$ INSERT INTO public.personnel (organization_id, group_id, rank, last_name, first_name, clinic_role, mos, slug)
	VALUES ('f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000301', 'PVT', 'Inserted', 'Ian', 'Medic', '68W', 'suspension-inserted') $$,
	'42501',
	NULL,
	'a suspended Organization owner cannot insert personnel'
);
SELECT throws_ok(
	$$ INSERT INTO public.groups (organization_id, name) VALUES ('f3000000-0000-4000-8000-000000000101', 'Inserted Group') $$,
	'42501',
	NULL,
	'a suspended Organization owner cannot insert a Group'
);
SELECT throws_ok(
	$$ INSERT INTO public.deletion_requests (organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description)
	VALUES ('f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000001', 'suspension-alpha-owner@example.test', 'personnel', 'f3000000-0000-4000-8000-000000000401', 'Suspended request') $$,
	'42501',
	NULL,
	'a suspended Organization owner cannot file a deletion request'
);
UPDATE public.personnel SET first_name = 'Changed' WHERE id = 'f3000000-0000-4000-8000-000000000401';
UPDATE public.availability_entries SET end_date = '2030-05-01' WHERE id = 'f3000000-0000-4000-8000-000000000601';
UPDATE public.rating_scheme_entries SET status = 'completed' WHERE id = 'f3000000-0000-4000-8000-000000001301';
UPDATE public.organizations SET name = 'Renamed While Suspended' WHERE id = 'f3000000-0000-4000-8000-000000000101';
UPDATE public.organization_memberships SET member_preset = 'editor' WHERE id = 'f3000000-0000-4000-8000-000000000202';
DELETE FROM public.personnel_trainings WHERE id = 'f3000000-0000-4000-8000-000000000801';
DELETE FROM public.personnel_ict_completions WHERE id = 'f3000000-0000-4000-8000-000000001001';
DELETE FROM public.personnel_onboardings WHERE id = 'f3000000-0000-4000-8000-000000001101';
DELETE FROM public.sign_in_rosters WHERE id = 'f3000000-0000-4000-8000-000000001201';
DELETE FROM public.groups WHERE id = 'f3000000-0000-4000-8000-000000000301';
DELETE FROM storage.objects WHERE id = 'f3000000-0000-4000-8000-000000001401';
SELECT is(
	ARRAY[
		(SELECT can_manage_org_members FROM public.can_manage_org_members('f3000000-0000-4000-8000-000000000101')),
		public.can_update_organization_settings('f3000000-0000-4000-8000-000000000101'),
		public.is_org_owner('f3000000-0000-4000-8000-000000000101'),
		public.is_org_privileged('f3000000-0000-4000-8000-000000000101'),
		public.is_org_member('f3000000-0000-4000-8000-000000000101'),
		public.member_access_has_capability('f3000000-0000-4000-8000-000000000101', 'personnel', 'view')
	],
	ARRAY[false, false, false, false, false, false],
	'every governance, legacy and capability helper denies a suspended Organization owner'
);

-- The suspended shell keeps the Organization identity and the caller's own membership.
SELECT is(
	(SELECT name || ':' || (suspended_at IS NOT NULL)::text FROM public.organizations WHERE id = 'f3000000-0000-4000-8000-000000000101'),
	'Suspension Alpha:true',
	'a suspended Organization member still reads its name and suspended status for the shell'
);
SELECT is(
	ARRAY(SELECT user_id::text FROM public.organization_memberships WHERE organization_id = 'f3000000-0000-4000-8000-000000000101' ORDER BY user_id),
	ARRAY['f3000000-0000-4000-8000-000000000001'],
	'a suspended Organization member reads only its own membership, not the member roster'
);

RESET ROLE;
SELECT is(
	ARRAY[
		(SELECT first_name FROM public.personnel WHERE id = 'f3000000-0000-4000-8000-000000000401'),
		(SELECT end_date::text FROM public.availability_entries WHERE id = 'f3000000-0000-4000-8000-000000000601'),
		(SELECT status FROM public.rating_scheme_entries WHERE id = 'f3000000-0000-4000-8000-000000001301'),
		(SELECT name FROM public.organizations WHERE id = 'f3000000-0000-4000-8000-000000000101'),
		(SELECT member_preset FROM public.organization_memberships WHERE id = 'f3000000-0000-4000-8000-000000000202')
	],
	ARRAY['Avery', '2030-04-02', 'active', 'Suspension Alpha', 'viewer'],
	'direct updates in a suspended Organization persist nothing'
);
SELECT is(
	ARRAY[
		(SELECT count(*) FROM public.personnel_trainings WHERE id = 'f3000000-0000-4000-8000-000000000801'),
		(SELECT count(*) FROM public.personnel_ict_completions WHERE id = 'f3000000-0000-4000-8000-000000001001'),
		(SELECT count(*) FROM public.personnel_onboardings WHERE id = 'f3000000-0000-4000-8000-000000001101'),
		(SELECT count(*) FROM public.sign_in_rosters WHERE id = 'f3000000-0000-4000-8000-000000001201'),
		(SELECT count(*) FROM public.groups WHERE id = 'f3000000-0000-4000-8000-000000000301'),
		(SELECT count(*) FROM storage.objects WHERE id = 'f3000000-0000-4000-8000-000000001401'),
		(SELECT count(*) FROM public.organizations WHERE id = 'f3000000-0000-4000-8000-000000000101'),
		(SELECT count(*) FROM public.personnel WHERE organization_id = 'f3000000-0000-4000-8000-000000000101'),
		(SELECT count(*) FROM public.deletion_requests WHERE organization_id = 'f3000000-0000-4000-8000-000000000101')
	],
	ARRAY[1, 1, 1, 1, 1, 1, 1, 1, 0]::bigint[],
	'direct deletes and inserts in a suspended Organization persist nothing'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000003', 'suspension-bravo-owner@example.test');
SELECT is(
	pg_temp.visible_lane_tables('f3000000-0000-4000-8000-000000000102'),
	ARRAY['availability_entries', 'groups', 'personnel', 'personnel_ict_completions', 'personnel_onboardings', 'personnel_trainings', 'rating_scheme_entries', 'sign_in_rosters', 'storage.objects'],
	'another Organization''s suspension leaves an active owner''s reads unchanged'
);

SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000004', 'suspension-invitee@example.test');
INSERT INTO suspension_actor_results
SELECT 'alpha-while-suspended', ARRAY[accept_status, accepted_organization_id::text]
FROM public.accept_organization_invitation('f3000000-0000-4000-8000-000000001501');
RESET ROLE;
SELECT is(
	(SELECT value FROM suspension_actor_results WHERE label = 'alpha-while-suspended'),
	ARRAY['unavailable', NULL],
	'an invitation into a suspended Organization is unavailable'
);
SELECT is(
	ARRAY[
		(SELECT count(*)::text FROM public.organization_memberships WHERE organization_id = 'f3000000-0000-4000-8000-000000000101' AND user_id = 'f3000000-0000-4000-8000-000000000004'),
		(SELECT status::text FROM public.organization_invitations WHERE id = 'f3000000-0000-4000-8000-000000001501')
	],
	ARRAY['0', 'pending'],
	'an unavailable invitation grants no membership and stays pending'
);

-- Unsuspension restores ordinary access without changing saved rows.
SET LOCAL ROLE service_role;
UPDATE public.organizations SET suspended_at = NULL WHERE id = 'f3000000-0000-4000-8000-000000000101';
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000001', 'suspension-alpha-owner@example.test');
SELECT is(
	pg_temp.visible_lane_tables('f3000000-0000-4000-8000-000000000101'),
	ARRAY['availability_entries', 'groups', 'personnel', 'personnel_ict_completions', 'personnel_onboardings', 'personnel_trainings', 'rating_scheme_entries', 'sign_in_rosters', 'storage.objects'],
	'unsuspension restores the owner''s direct reads'
);
SELECT is(
	ARRAY(SELECT user_id::text FROM public.organization_memberships WHERE organization_id = 'f3000000-0000-4000-8000-000000000101' ORDER BY user_id),
	ARRAY['f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002'],
	'unsuspension restores the member roster'
);
UPDATE public.personnel SET first_name = 'Restored' WHERE id = 'f3000000-0000-4000-8000-000000000401';
RESET ROLE;
SELECT is(
	(SELECT first_name FROM public.personnel WHERE id = 'f3000000-0000-4000-8000-000000000401'),
	'Restored',
	'unsuspension restores the owner''s direct writes'
);

-- The platform service path suspends the Bravo owner's account.
SET LOCAL ROLE service_role;
INSERT INTO public.user_suspensions (user_id, suspended_by, reason) VALUES
	('f3000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000005', 'Synthetic account suspension'),
	('f3000000-0000-4000-8000-000000000004', 'f3000000-0000-4000-8000-000000000005', 'Synthetic invitee suspension');
RESET ROLE;
SELECT is(
	(SELECT count(*)::integer FROM public.user_suspensions WHERE user_id IN ('f3000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000004')),
	2,
	'the service path suspends accounts'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000003', 'suspension-bravo-owner@example.test');
SELECT is(
	pg_temp.visible_lane_tables('f3000000-0000-4000-8000-000000000102'),
	ARRAY[]::text[],
	'a suspended account reads no lane rows or private files in its active Organization'
);
SELECT throws_ok(
	$$ INSERT INTO public.groups (organization_id, name) VALUES ('f3000000-0000-4000-8000-000000000102', 'Suspended Account Group') $$,
	'42501',
	NULL,
	'a suspended account cannot insert a Group'
);
UPDATE public.personnel SET first_name = 'Changed' WHERE id = 'f3000000-0000-4000-8000-000000000402';
UPDATE public.organizations SET name = 'Renamed By Suspended Account' WHERE id = 'f3000000-0000-4000-8000-000000000102';
DELETE FROM public.availability_entries WHERE id = 'f3000000-0000-4000-8000-000000000602';
DELETE FROM storage.objects WHERE id = 'f3000000-0000-4000-8000-000000001402';
SELECT is(
	ARRAY[
		public.can_manage_org_members('f3000000-0000-4000-8000-000000000102'),
		public.can_update_organization_settings('f3000000-0000-4000-8000-000000000102'),
		public.is_org_owner('f3000000-0000-4000-8000-000000000102'),
		public.member_access_has_capability('f3000000-0000-4000-8000-000000000102', 'calendar', 'view')
	],
	ARRAY[false, false, false, false],
	'governance and capability helpers deny a suspended account'
);
SELECT throws_ok(
	$$ SELECT public.create_organization('Created While Suspended', 'f3000000-0000-4000-8000-000000001601', '{"groups":[],"status_types":[],"assignment_types":[],"special_days":[],"rank_catalog":[]}'::jsonb) $$,
	'42501',
	'Suspended accounts cannot create organizations',
	'a suspended account cannot create an Organization'
);
RESET ROLE;
SELECT is(
	ARRAY[
		(SELECT first_name FROM public.personnel WHERE id = 'f3000000-0000-4000-8000-000000000402'),
		(SELECT name FROM public.organizations WHERE id = 'f3000000-0000-4000-8000-000000000102'),
		(SELECT count(*)::text FROM public.availability_entries WHERE id = 'f3000000-0000-4000-8000-000000000602'),
		(SELECT count(*)::text FROM storage.objects WHERE id = 'f3000000-0000-4000-8000-000000001402'),
		(SELECT count(*)::text FROM public.organizations WHERE created_by = 'f3000000-0000-4000-8000-000000000003'),
		(SELECT count(*)::text FROM public.groups WHERE organization_id = 'f3000000-0000-4000-8000-000000000102')
	],
	ARRAY['Blake', 'Suspension Bravo', '1', '1', '1', '1'],
	'direct writes and Organization creation by a suspended account persist nothing'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000004', 'suspension-invitee@example.test');
INSERT INTO suspension_actor_results
SELECT 'bravo-while-account-suspended', ARRAY[accept_status, accepted_organization_id::text]
FROM public.accept_organization_invitation('f3000000-0000-4000-8000-000000001502');
RESET ROLE;
SELECT is(
	ARRAY[
		(SELECT value FROM suspension_actor_results WHERE label = 'bravo-while-account-suspended'),
		ARRAY[
			(SELECT count(*)::text FROM public.organization_memberships WHERE user_id = 'f3000000-0000-4000-8000-000000000004'),
			(SELECT status::text FROM public.organization_invitations WHERE id = 'f3000000-0000-4000-8000-000000001502')
		]
	],
	ARRAY[ARRAY['unavailable', NULL], ARRAY['0', 'pending']],
	'a suspended account cannot accept an invitation and the invitation stays pending'
);

-- Unsuspension restores both accounts.
SET LOCAL ROLE service_role;
DELETE FROM public.user_suspensions WHERE user_id IN ('f3000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000004');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000003', 'suspension-bravo-owner@example.test');
SELECT is(
	pg_temp.visible_lane_tables('f3000000-0000-4000-8000-000000000102'),
	ARRAY['availability_entries', 'groups', 'personnel', 'personnel_ict_completions', 'personnel_onboardings', 'personnel_trainings', 'rating_scheme_entries', 'sign_in_rosters', 'storage.objects'],
	'account unsuspension restores direct reads'
);
SELECT lives_ok(
	$$ SELECT public.create_organization('Created After Unsuspension', 'f3000000-0000-4000-8000-000000001602', '{"groups":[],"status_types":[],"assignment_types":[],"special_days":[],"rank_catalog":[]}'::jsonb) $$,
	'an unsuspended account can create an Organization'
);
SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000004', 'suspension-invitee@example.test');
INSERT INTO suspension_actor_results
SELECT 'bravo-after-unsuspension', ARRAY[accept_status, accepted_organization_id::text]
FROM public.accept_organization_invitation('f3000000-0000-4000-8000-000000001502');
RESET ROLE;
SELECT is(
	(SELECT value FROM suspension_actor_results WHERE label = 'bravo-after-unsuspension'),
	ARRAY['accepted', 'f3000000-0000-4000-8000-000000000102'],
	'an unsuspended account accepts an invitation into an active Organization'
);
SELECT is(
	(SELECT count(*)::integer FROM public.organizations WHERE created_by = 'f3000000-0000-4000-8000-000000000003'),
	2,
	'the unsuspended account''s Organization exists'
);

-- Data exports and deletion requests read admitted governance, not raw membership.
INSERT INTO public.data_exports (id, org_id, requested_by, status) VALUES
	('f3000000-0000-4000-8000-000000001701', 'f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000001', 'processing');
INSERT INTO public.deletion_requests (id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description) VALUES
	('f3000000-0000-4000-8000-000000001801', 'f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000002', 'suspension-alpha-viewer@example.test', 'personnel', 'f3000000-0000-4000-8000-000000000401', 'Viewer request');
UPDATE public.organizations SET suspended_at = now() WHERE id = 'f3000000-0000-4000-8000-000000000101';
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000001', 'suspension-alpha-owner@example.test');
UPDATE public.deletion_requests SET status = 'denied' WHERE id = 'f3000000-0000-4000-8000-000000001801';
SELECT is(
	ARRAY[
		(SELECT count(*) FROM public.data_exports WHERE org_id = 'f3000000-0000-4000-8000-000000000101'),
		(SELECT count(*) FROM public.deletion_requests WHERE organization_id = 'f3000000-0000-4000-8000-000000000101')
	],
	ARRAY[0, 0]::bigint[],
	'a suspended Organization owner reads no exports or deletion requests'
);
SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000002', 'suspension-alpha-viewer@example.test');
DELETE FROM public.deletion_requests WHERE id = 'f3000000-0000-4000-8000-000000001801';
RESET ROLE;
SELECT is(
	(SELECT status FROM public.deletion_requests WHERE id = 'f3000000-0000-4000-8000-000000001801'),
	'pending',
	'a suspended Organization''s deletion request cannot be reviewed or withdrawn directly'
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('f3000000-0000-4000-8000-000000000003', 'suspension-bravo-owner@example.test');
SELECT throws_ok(
	$$ INSERT INTO public.deletion_requests (organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description)
	VALUES ('f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000003', 'suspension-bravo-owner@example.test', 'personnel', 'f3000000-0000-4000-8000-000000000401', 'Foreign request') $$,
	'42501',
	NULL,
	'a non-member cannot file a deletion request in another Organization'
);
RESET ROLE;

SELECT is(
	ARRAY(
		SELECT p.proname || ':' || COALESCE(array_to_string(p.proconfig, ','), 'unpinned')
		FROM pg_proc AS p
		WHERE p.pronamespace = 'public'::regnamespace
			AND p.proname IN ('is_org_member', 'is_org_owner', 'is_org_privileged')
		ORDER BY p.proname
	),
	ARRAY['is_org_member:search_path=""', 'is_org_owner:search_path=""', 'is_org_privileged:search_path=""'],
	'legacy membership helpers pin an empty search path'
);

SELECT * FROM finish();
ROLLBACK;
