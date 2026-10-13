BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(85);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT ('c6420000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated',
	'governance-' || n || '@example.test', now()
FROM unnest(ARRAY['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17']) AS n;

INSERT INTO public.organizations (id, name, created_by, suspended_at)
VALUES
	('c6420000-0000-4000-8000-0000000001aa', 'Governance Alpha', 'c6420000-0000-4000-8000-000000000006', NULL),
	('c6420000-0000-4000-8000-0000000001bb', 'Governance Bravo', 'c6420000-0000-4000-8000-000000000001', NULL),
	('c6420000-0000-4000-8000-0000000001cc', 'Governance Suspended', 'c6420000-0000-4000-8000-000000000001',
		'2030-01-02T03:04:05Z'),
	('c6420000-0000-4000-8000-0000000001dd', 'Governance Transfer', 'c6420000-0000-4000-8000-000000000001', NULL);

INSERT INTO public.groups (id, organization_id, name)
VALUES
	('c6420000-0000-4000-8000-0000000002aa', 'c6420000-0000-4000-8000-0000000001aa', 'Alpha Group'),
	('c6420000-0000-4000-8000-0000000002ab', 'c6420000-0000-4000-8000-0000000001aa', 'Alpha Second Group'),
	('c6420000-0000-4000-8000-0000000002ac', 'c6420000-0000-4000-8000-0000000001aa', 'Alpha Retired Group'),
	('c6420000-0000-4000-8000-0000000002bb', 'c6420000-0000-4000-8000-0000000001bb', 'Bravo Group');

INSERT INTO public.organization_memberships (
	id, organization_id, user_id, role, member_preset, capability_overrides,
	access_scope_kind, access_scope_group_ids, email
)
SELECT
	('c6420000-0000-4000-8000-000000000' || m.suffix)::uuid,
	('c6420000-0000-4000-8000-0000000001' || m.org)::uuid,
	('c6420000-0000-4000-8000-0000000000' || m.user_n)::uuid,
	m.role::public.organization_role,
	m.preset,
	'{}'::jsonb,
	'organization',
	ARRAY[]::uuid[],
	'governance-' || m.user_n || '@example.test'
FROM (VALUES
	('301', 'aa', '01', 'owner', 'editor'),
	('302', 'aa', '02', 'admin', 'editor'),
	('303', 'aa', '03', 'admin', 'editor'),
	('304', 'aa', '04', 'member', 'viewer'),
	('310', 'aa', '10', 'member', 'viewer'),
	('311', 'aa', '11', 'member', 'viewer'),
	('312', 'aa', '12', 'admin', 'editor'),
	('321', 'bb', '01', 'owner', 'editor'),
	('322', 'bb', '02', 'admin', 'editor'),
	('331', 'cc', '01', 'owner', 'editor'),
	('332', 'cc', '02', 'admin', 'editor'),
	('341', 'dd', '01', 'owner', 'editor'),
	('343', 'dd', '13', 'member', 'viewer')
) AS m(suffix, org, user_n, role, preset);

INSERT INTO public.organization_invitations (
	id, organization_id, email, invited_by, status, expires_at, role, member_preset,
	capability_overrides, access_scope_kind, access_scope_group_ids
)
VALUES
	('c6420000-0000-4000-8000-000000000405', 'c6420000-0000-4000-8000-0000000001aa', 'governance-05@example.test',
		'c6420000-0000-4000-8000-000000000001', 'pending', now() + interval '7 days', 'member', 'viewer', '{}'::jsonb,
		'organization', ARRAY[]::uuid[]),
	('c6420000-0000-4000-8000-000000000408', 'c6420000-0000-4000-8000-0000000001aa', 'governance-08@example.test',
		'c6420000-0000-4000-8000-000000000001', 'pending', now() + interval '7 days', 'admin', 'viewer',
		'{"calendar":"none"}'::jsonb, 'groups', ARRAY['c6420000-0000-4000-8000-0000000002aa']::uuid[]),
	('c6420000-0000-4000-8000-000000000409', 'c6420000-0000-4000-8000-0000000001aa', 'governance-09@example.test',
		'c6420000-0000-4000-8000-000000000002', 'pending', now() + interval '7 days', 'member', 'viewer',
		'{"calendar":"none"}'::jsonb, 'organization', ARRAY[]::uuid[]),
	('c6420000-0000-4000-8000-000000000414', 'c6420000-0000-4000-8000-0000000001aa', 'governance-14@example.test',
		'c6420000-0000-4000-8000-000000000001', 'pending', now() + interval '7 days', 'member', 'viewer',
		'{"calendar":"none"}'::jsonb, 'groups', ARRAY['c6420000-0000-4000-8000-0000000002aa']::uuid[]),
	('c6420000-0000-4000-8000-000000000415', 'c6420000-0000-4000-8000-0000000001aa', 'governance-15@example.test',
		'c6420000-0000-4000-8000-000000000001', 'pending', now() + interval '7 days', 'member', 'viewer',
		'{"calendar":"none"}'::jsonb, 'groups', ARRAY['c6420000-0000-4000-8000-0000000002aa']::uuid[]),
	('c6420000-0000-4000-8000-000000000416', 'c6420000-0000-4000-8000-0000000001aa', 'governance-16@example.test',
		'c6420000-0000-4000-8000-000000000001', 'pending', now() + interval '7 days', 'member', 'viewer',
		'{}'::jsonb, 'organization', ARRAY[]::uuid[]),
	('c6420000-0000-4000-8000-000000000417', 'c6420000-0000-4000-8000-0000000001aa', 'governance-17@example.test',
		'c6420000-0000-4000-8000-000000000001', 'pending', now() + interval '7 days', 'member', 'operator',
		'{}'::jsonb, 'groups', ARRAY['c6420000-0000-4000-8000-0000000002ac']::uuid[]);

CREATE TEMP TABLE governance_before AS
SELECT 'membership'::text AS kind, id, to_jsonb(m) AS row_data FROM public.organization_memberships m
WHERE id::text LIKE 'c6420000-%'
UNION ALL
SELECT 'organization', id, to_jsonb(o) FROM public.organizations o WHERE id::text LIKE 'c6420000-%'
UNION ALL
SELECT 'invitation', id, to_jsonb(i) FROM public.organization_invitations i WHERE id::text LIKE 'c6420000-%';

CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
	SELECT set_config('request.jwt.claim.sub', 'c6420000-0000-4000-8000-0000000000' || p_user, true);
	SELECT set_config('request.jwt.claim.email', 'governance-' || p_user || '@example.test', true);
	SELECT set_config('request.jwt.claims', jsonb_build_object(
		'sub', 'c6420000-0000-4000-8000-0000000000' || p_user,
		'email', 'governance-' || p_user || '@example.test',
		'role', 'authenticated',
		'aal', 'aal1',
		'amr', jsonb_build_array(jsonb_build_object(
			'method', 'password', 'timestamp', floor(extract(epoch FROM now()))::bigint - 60)))::text, true);
$$;

CREATE FUNCTION pg_temp.unchanged(p_ids text[]) RETURNS boolean LANGUAGE sql AS $$
	SELECT (
		SELECT jsonb_agg(row_data ORDER BY id) FROM governance_before
		WHERE id::text = ANY (SELECT 'c6420000-0000-4000-8000-000000000' || s FROM unnest(p_ids) s)
	) = (
		SELECT jsonb_agg(row_data ORDER BY id) FROM (
			SELECT id, to_jsonb(m) AS row_data FROM public.organization_memberships m
			UNION ALL SELECT id, to_jsonb(o) FROM public.organizations o
			UNION ALL SELECT id, to_jsonb(i) FROM public.organization_invitations i
		) current_rows
		WHERE id::text = ANY (SELECT 'c6420000-0000-4000-8000-000000000' || s FROM unnest(p_ids) s)
	)
$$;

-- Membership admission is only through SECURITY DEFINER commands.

SELECT pg_temp.act_as('05');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ INSERT INTO public.organization_memberships (organization_id, user_id, role, member_preset, email)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'c6420000-0000-4000-8000-000000000005', 'owner', 'editor',
			'governance-05@example.test') $$,
	'42501',
	'new row violates row-level security policy for table "organization_memberships"',
	'an invitee cannot insert their own membership with an arbitrary role'
);
RESET ROLE;
SELECT is(
	(SELECT count(*)::integer FROM public.organization_memberships
		WHERE user_id = 'c6420000-0000-4000-8000-000000000005'),
	0,
	'the invitee self-admission denial persists no membership'
);

SELECT pg_temp.act_as('01');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ INSERT INTO public.organization_memberships (organization_id, user_id, role, member_preset, email)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'c6420000-0000-4000-8000-000000000007', 'owner', 'editor',
			'governance-07@example.test') $$,
	'42501',
	'new row violates row-level security policy for table "organization_memberships"',
	'an owner cannot directly insert another owner membership'
);
RESET ROLE;
SELECT is(
	(SELECT count(*)::integer FROM public.organization_memberships
		WHERE user_id = 'c6420000-0000-4000-8000-000000000007'),
	0,
	'the owner direct-insert denial persists no membership'
);

SELECT pg_temp.act_as('06');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ INSERT INTO public.organization_memberships (organization_id, user_id, role, member_preset, email)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'c6420000-0000-4000-8000-000000000006', 'owner', 'editor',
			'governance-06@example.test') $$,
	'42501',
	'new row violates row-level security policy for table "organization_memberships"',
	'a removed original creator cannot re-insert their membership'
);
RESET ROLE;
SELECT is(
	(SELECT count(*)::integer FROM public.organization_memberships
		WHERE user_id = 'c6420000-0000-4000-8000-000000000006'),
	0,
	'the removed creator denial persists no membership'
);

SELECT pg_temp.act_as('08');
SET LOCAL ROLE authenticated;
SELECT is(
	(SELECT accept_status FROM public.accept_organization_invitation('c6420000-0000-4000-8000-000000000408')),
	'accepted',
	'an admin invitee accepts through the invitation command'
);
RESET ROLE;
SELECT is(
	(SELECT jsonb_build_array(role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids)
		FROM public.organization_memberships
		WHERE organization_id = 'c6420000-0000-4000-8000-0000000001aa'
			AND user_id = 'c6420000-0000-4000-8000-000000000008'),
	'["admin", "editor", {}, "organization", []]'::jsonb,
	'invitation acceptance admits the invited admin with normalized Organization-wide access'
);

SELECT pg_temp.act_as('09');
SET LOCAL ROLE authenticated;
SELECT is(
	(SELECT accept_status FROM public.accept_organization_invitation('c6420000-0000-4000-8000-000000000409')),
	'accepted',
	'a member invitee accepts through the invitation command'
);
RESET ROLE;
SELECT is(
	(SELECT jsonb_build_array(role, member_preset, capability_overrides, access_scope_kind)
		FROM public.organization_memberships
		WHERE organization_id = 'c6420000-0000-4000-8000-0000000001aa'
			AND user_id = 'c6420000-0000-4000-8000-000000000009'),
	'["member", "viewer", {"calendar": "none"}, "organization"]'::jsonb,
	'invitation acceptance admits the invited member with the invited access'
);

SELECT pg_temp.act_as('07');
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE created_organization ON COMMIT DROP AS
SELECT public.create_organization(
	'Governance Created',
	'c6420000-0000-4000-8000-0000000005aa',
	'{"groups":[],"status_types":[],"assignment_types":[],"special_days":[],"rank_catalog":[]}'::jsonb
) AS id;
RESET ROLE;
SELECT is(
	(SELECT jsonb_agg(jsonb_build_array(m.user_id, m.role))
		FROM public.organization_memberships m JOIN created_organization c ON c.id = m.organization_id),
	'[["c6420000-0000-4000-8000-000000000007", "owner"]]'::jsonb,
	'Organization creation still admits its creator as the only owner'
);

-- Direct membership UPDATE follows the member-access governance rules.

SELECT pg_temp.act_as('02');
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organization_memberships SET role = 'owner'
	WHERE id = 'c6420000-0000-4000-8000-000000000302' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'an admin cannot promote their own membership to owner');
SELECT throws_ok(
	$$ UPDATE public.organization_memberships SET role = 'owner'
		WHERE id = 'c6420000-0000-4000-8000-000000000304' $$,
	'42501',
	'new row violates row-level security policy for table "organization_memberships"',
	'an admin cannot promote a member to owner'
);
SELECT throws_ok(
	$$ UPDATE public.organization_memberships SET role = 'admin'
		WHERE id = 'c6420000-0000-4000-8000-000000000304' $$,
	'42501',
	'new row violates row-level security policy for table "organization_memberships"',
	'an admin cannot grant admin'
);
WITH updated AS (
	UPDATE public.organization_memberships SET member_preset = 'viewer'
	WHERE id = 'c6420000-0000-4000-8000-000000000301' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'an admin cannot edit the owner membership');
WITH updated AS (
	UPDATE public.organization_memberships SET member_preset = 'viewer'
	WHERE id = 'c6420000-0000-4000-8000-000000000312' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'an admin cannot edit another admin membership');
SELECT throws_ok(
	$$ UPDATE public.organization_memberships SET organization_id = 'c6420000-0000-4000-8000-0000000001bb'
		WHERE id = 'c6420000-0000-4000-8000-000000000304' $$,
	'42501',
	'permission denied for table organization_memberships',
	'an admin cannot move a membership to another Organization'
);
SELECT throws_ok(
	$$ UPDATE public.organization_memberships SET user_id = 'c6420000-0000-4000-8000-000000000007'
		WHERE id = 'c6420000-0000-4000-8000-000000000304' $$,
	'42501',
	'permission denied for table organization_memberships',
	'an admin cannot move a membership to another account'
);
SELECT throws_ok(
	$$ UPDATE public.organization_memberships SET email = 'redirected@example.test'
		WHERE id = 'c6420000-0000-4000-8000-000000000304' $$,
	'42501',
	'permission denied for table organization_memberships',
	'an admin cannot rewrite a membership email'
);
RESET ROLE;
SELECT ok(
	pg_temp.unchanged(ARRAY['301', '302', '304', '312']),
	'admin membership update denials leave the owner, admin and member rows unchanged'
);

SELECT pg_temp.act_as('02');
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organization_memberships
	SET role = 'member', member_preset = 'operator', capability_overrides = '{"calendar":"none"}'::jsonb,
		access_scope_kind = 'groups', access_scope_group_ids = ARRAY['c6420000-0000-4000-8000-0000000002aa']::uuid[]
	WHERE id = 'c6420000-0000-4000-8000-000000000310' AND role = 'member' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'an admin can edit ordinary member access');
RESET ROLE;
SELECT is(
	(SELECT jsonb_build_array(role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids)
		FROM public.organization_memberships WHERE id = 'c6420000-0000-4000-8000-000000000310'),
	'["member", "operator", {"calendar": "none"}, "groups", ["c6420000-0000-4000-8000-0000000002aa"]]'::jsonb,
	'the admin member-access edit persists exactly'
);

SELECT pg_temp.act_as('01');
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organization_memberships SET role = 'admin'
	WHERE id = 'c6420000-0000-4000-8000-000000000301' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'an owner cannot directly demote the owner membership');
SELECT throws_ok(
	$$ UPDATE public.organization_memberships SET role = 'owner'
		WHERE id = 'c6420000-0000-4000-8000-000000000303' $$,
	'42501',
	'new row violates row-level security policy for table "organization_memberships"',
	'an owner cannot create a second owner by direct update'
);
RESET ROLE;
SELECT ok(pg_temp.unchanged(ARRAY['301', '303']), 'owner role denials leave the owner and admin rows unchanged');

SELECT pg_temp.act_as('01');
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organization_memberships SET role = 'member', member_preset = 'viewer'
	WHERE id = 'c6420000-0000-4000-8000-000000000303' AND role = 'admin' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'an owner can change an admin to a member');
WITH updated AS (
	UPDATE public.organization_memberships SET role = 'admin', member_preset = 'editor'
	WHERE id = 'c6420000-0000-4000-8000-000000000311' AND role = 'member' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'an owner can grant admin');
RESET ROLE;
SELECT is(
	(SELECT jsonb_object_agg(id, jsonb_build_array(role, member_preset)) FROM public.organization_memberships
		WHERE id IN ('c6420000-0000-4000-8000-000000000303', 'c6420000-0000-4000-8000-000000000311')),
	'{"c6420000-0000-4000-8000-000000000303": ["member", "viewer"],
		"c6420000-0000-4000-8000-000000000311": ["admin", "editor"]}'::jsonb,
	'owner admin-access changes persist exactly'
);

SELECT pg_temp.act_as('04');
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organization_memberships SET capability_overrides = '{"personnel":"configure"}'::jsonb
	WHERE id = 'c6420000-0000-4000-8000-000000000304' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'a member cannot raise their own access');
RESET ROLE;
SELECT ok(pg_temp.unchanged(ARRAY['304']), 'the member self-edit denial leaves the row unchanged');

-- Removal and leaving use the service-role command path; direct DELETE is not authority.

SELECT pg_temp.act_as('02');
SET LOCAL ROLE authenticated;
WITH deleted AS (
	DELETE FROM public.organization_memberships WHERE id = 'c6420000-0000-4000-8000-000000000301' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 0, 'an admin cannot delete the owner membership');
WITH deleted AS (
	DELETE FROM public.organization_memberships WHERE id = 'c6420000-0000-4000-8000-000000000312' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 0, 'an admin cannot directly delete another admin');
WITH deleted AS (
	DELETE FROM public.organization_memberships WHERE id = 'c6420000-0000-4000-8000-000000000304' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 0, 'an admin cannot directly delete a member');
RESET ROLE;
SELECT pg_temp.act_as('01');
SET LOCAL ROLE authenticated;
WITH deleted AS (
	DELETE FROM public.organization_memberships WHERE id = 'c6420000-0000-4000-8000-000000000312' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 0, 'an owner cannot directly delete an admin');
RESET ROLE;
SELECT ok(pg_temp.unchanged(ARRAY['301', '304', '312']), 'direct delete denials leave every row in place');

SET LOCAL ROLE service_role;
WITH deleted AS (
	DELETE FROM public.organization_memberships
	WHERE id = 'c6420000-0000-4000-8000-000000000310' AND role = 'member' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 1, 'the service-role removal path deletes a member');
RESET ROLE;

-- Organization settings writers cannot reach platform or identity columns.

SELECT pg_temp.act_as('02');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ UPDATE public.organizations SET suspended_at = NULL WHERE id = 'c6420000-0000-4000-8000-0000000001cc' $$,
	'42501',
	'permission denied for table organizations',
	'an admin cannot lift platform suspension'
);
SELECT throws_ok(
	$$ UPDATE public.organizations SET suspended_at = now() WHERE id = 'c6420000-0000-4000-8000-0000000001aa' $$,
	'42501',
	'permission denied for table organizations',
	'an admin cannot set platform suspension'
);
SELECT throws_ok(
	$$ UPDATE public.organizations SET created_by = 'c6420000-0000-4000-8000-000000000002'
		WHERE id = 'c6420000-0000-4000-8000-0000000001aa' $$,
	'42501',
	'permission denied for table organizations',
	'an admin cannot rewrite the Organization creator'
);
SELECT throws_ok(
	$$ UPDATE public.organizations SET id = 'c6420000-0000-4000-8000-0000000001ee'
		WHERE id = 'c6420000-0000-4000-8000-0000000001aa' $$,
	'42501',
	'permission denied for table organizations',
	'an admin cannot change the Organization ID'
);
RESET ROLE;
SELECT ok(pg_temp.unchanged(ARRAY['1aa', '1cc']), 'protected Organization column denials leave both rows unchanged');

SELECT pg_temp.act_as('04');
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organizations SET name = 'Member Rename' WHERE id = 'c6420000-0000-4000-8000-0000000001aa' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'a member cannot update Organization settings');
RESET ROLE;

SELECT pg_temp.act_as('02');
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organizations
	SET name = 'Governance Alpha Renamed', url_slug = 'governance-alpha', archive_retention_months = 24,
		loss_warning_window_days = 45, training_readiness_goal_percent = 80,
		personnel_document_storage_cap_bytes = 20971520
	WHERE id = 'c6420000-0000-4000-8000-0000000001aa' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'an admin can update Organization settings columns');
RESET ROLE;
SELECT is(
	(SELECT jsonb_build_array(name, url_slug, archive_retention_months, loss_warning_window_days,
		training_readiness_goal_percent, personnel_document_storage_cap_bytes, suspended_at, created_by)
		FROM public.organizations WHERE id = 'c6420000-0000-4000-8000-0000000001aa'),
	'["Governance Alpha Renamed", "governance-alpha", 24, 45, 80, 20971520, null,
		"c6420000-0000-4000-8000-000000000006"]'::jsonb,
	'the settings update persists exactly and leaves protected columns alone'
);

SET LOCAL ROLE service_role;
WITH updated AS (
	UPDATE public.organizations SET suspended_at = NULL WHERE id = 'c6420000-0000-4000-8000-0000000001cc' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'the platform service path can lift suspension');
WITH updated AS (
	UPDATE public.organizations SET suspended_at = '2030-02-03T04:05:06Z'
	WHERE id = 'c6420000-0000-4000-8000-0000000001bb' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'the platform service path can suspend an Organization');
RESET ROLE;

SELECT pg_temp.act_as('07');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ INSERT INTO public.organizations (id, name, created_by)
		VALUES ('c6420000-0000-4000-8000-0000000001ff', 'Orphan Unit', 'c6420000-0000-4000-8000-000000000007') $$,
	'42501',
	'new row violates row-level security policy for table "organizations"',
	'an account cannot create an Organization outside the creation command'
);
RESET ROLE;
SELECT is(
	(SELECT count(*)::integer FROM public.organizations WHERE id = 'c6420000-0000-4000-8000-0000000001ff'),
	0,
	'the direct Organization insert denial persists nothing'
);

-- Invitations cannot grant ownership, and only owners invite admins.

SELECT pg_temp.act_as('02');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ INSERT INTO public.organization_invitations (organization_id, email, invited_by, expires_at, role, member_preset)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'admin-invites-owner@example.test',
			'c6420000-0000-4000-8000-000000000002', now() + interval '7 days', 'owner', 'editor') $$,
	'42501',
	'new row violates row-level security policy for table "organization_invitations"',
	'an admin cannot invite an owner'
);
SELECT throws_ok(
	$$ INSERT INTO public.organization_invitations (organization_id, email, invited_by, expires_at, role, member_preset)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'admin-invites-admin@example.test',
			'c6420000-0000-4000-8000-000000000002', now() + interval '7 days', 'admin', 'editor') $$,
	'42501',
	'new row violates row-level security policy for table "organization_invitations"',
	'an admin cannot invite an admin'
);
SELECT lives_ok(
	$$ INSERT INTO public.organization_invitations (organization_id, email, invited_by, expires_at, role, member_preset)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'admin-invites-member@example.test',
			'c6420000-0000-4000-8000-000000000002', now() + interval '7 days', 'member', 'viewer') $$,
	'an admin can invite a member'
);
SELECT throws_ok(
	$$ INSERT INTO public.organization_invitations (organization_id, email, invited_by, expires_at, role, member_preset)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'admin-attributes-owner@example.test',
			'c6420000-0000-4000-8000-000000000001', now() + interval '7 days', 'member', 'viewer') $$,
	'42501',
	'new row violates row-level security policy for table "organization_invitations"',
	'an admin cannot attribute an invitation to another inviter'
);
RESET ROLE;
SELECT pg_temp.act_as('01');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ INSERT INTO public.organization_invitations (organization_id, email, invited_by, expires_at, role, member_preset)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'owner-invites-owner@example.test',
			'c6420000-0000-4000-8000-000000000001', now() + interval '7 days', 'owner', 'editor') $$,
	'42501',
	'new row violates row-level security policy for table "organization_invitations"',
	'an owner cannot invite another owner'
);
SELECT lives_ok(
	$$ INSERT INTO public.organization_invitations (organization_id, email, invited_by, expires_at, role, member_preset)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'owner-invites-admin@example.test',
			'c6420000-0000-4000-8000-000000000001', now() + interval '7 days', 'admin', 'editor') $$,
	'an owner can invite an admin'
);
RESET ROLE;
SELECT is(
	(SELECT jsonb_object_agg(email, role) FROM public.organization_invitations
		WHERE email IN ('admin-invites-owner@example.test', 'admin-invites-admin@example.test',
			'admin-invites-member@example.test', 'admin-attributes-owner@example.test', 'owner-invites-owner@example.test',
			'owner-invites-admin@example.test')),
	'{"admin-invites-member@example.test": "member", "owner-invites-admin@example.test": "admin"}'::jsonb,
	'only the permitted invitations persist'
);
SELECT throws_ok(
	$$ INSERT INTO public.organization_invitations (organization_id, email, invited_by, expires_at, role, member_preset)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'stored-owner-invite@example.test',
			'c6420000-0000-4000-8000-000000000001', now() + interval '7 days', 'owner', 'editor') $$,
	'23514',
	NULL,
	'no writer can store an acceptable owner invitation'
);

-- Ownership changes remain available through the transfer command.

SELECT pg_temp.act_as('01');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
	$$ SELECT public.transfer_org_ownership('c6420000-0000-4000-8000-0000000001dd', 'c6420000-0000-4000-8000-000000000013') $$,
	'the owner can transfer ownership through the command'
);
RESET ROLE;
SELECT is(
	(SELECT jsonb_object_agg(user_id, role) FROM public.organization_memberships
		WHERE organization_id = 'c6420000-0000-4000-8000-0000000001dd'),
	'{"c6420000-0000-4000-8000-000000000001": "admin", "c6420000-0000-4000-8000-000000000013": "owner"}'::jsonb,
	'ownership transfer swaps exactly the owner and the target'
);

-- Invitation lifecycle writers cannot rewrite the invitation they transition.

SELECT pg_temp.act_as('14');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ UPDATE public.organization_invitations
		SET status = 'declined', declined_at = now(), declined_by = auth.uid(),
			organization_id = 'c6420000-0000-4000-8000-0000000001bb'
		WHERE id = 'c6420000-0000-4000-8000-000000000414' $$,
	'42501', 'permission denied for table organization_invitations',
	'an invitee cannot move the invitation to another Organization while declining'
);
SELECT throws_ok(
	$$ UPDATE public.organization_invitations
		SET status = 'declined', declined_at = now(), declined_by = auth.uid(), role = 'admin'
		WHERE id = 'c6420000-0000-4000-8000-000000000414' $$,
	'42501', 'permission denied for table organization_invitations',
	'an invitee cannot rewrite the invited role while declining'
);
SELECT throws_ok(
	$$ UPDATE public.organization_invitations
		SET status = 'declined', declined_at = now(), declined_by = auth.uid(), member_preset = 'editor',
			capability_overrides = '{"personnel":"configure"}'::jsonb
		WHERE id = 'c6420000-0000-4000-8000-000000000414' $$,
	'42501', 'permission denied for table organization_invitations',
	'an invitee cannot rewrite the invited access while declining'
);
SELECT throws_ok(
	$$ UPDATE public.organization_invitations
		SET status = 'declined', declined_at = now(), declined_by = auth.uid(), access_scope_kind = 'organization',
			access_scope_group_ids = ARRAY[]::uuid[]
		WHERE id = 'c6420000-0000-4000-8000-000000000414' $$,
	'42501', 'permission denied for table organization_invitations',
	'an invitee cannot rewrite the invited scope while declining'
);
SELECT throws_ok(
	$$ UPDATE public.organization_invitations
		SET status = 'declined', declined_at = now(), declined_by = auth.uid(),
			invited_by = 'c6420000-0000-4000-8000-000000000014'
		WHERE id = 'c6420000-0000-4000-8000-000000000414' $$,
	'42501', 'permission denied for table organization_invitations',
	'an invitee cannot rewrite the inviter while declining'
);
RESET ROLE;
SELECT pg_temp.act_as('02');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ UPDATE public.organization_invitations
		SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), email = 'redirected@example.test'
		WHERE id = 'c6420000-0000-4000-8000-000000000415' $$,
	'42501', 'permission denied for table organization_invitations',
	'a governor cannot redirect the invitation email while revoking'
);
SELECT throws_ok(
	$$ UPDATE public.organization_invitations
		SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), role = 'admin',
			capability_overrides = '{"personnel":"configure"}'::jsonb
		WHERE id = 'c6420000-0000-4000-8000-000000000415' $$,
	'42501', 'permission denied for table organization_invitations',
	'a governor cannot rewrite the access snapshot while revoking'
);
RESET ROLE;
SELECT ok(pg_temp.unchanged(ARRAY['414', '415']), 'rewriting lifecycle denials leave both invitations unchanged');

SELECT pg_temp.act_as('14');
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organization_invitations SET status = 'declined', declined_at = now(), declined_by = auth.uid()
	WHERE id = 'c6420000-0000-4000-8000-000000000414' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'an invitee can decline their invitation');
RESET ROLE;
SELECT pg_temp.act_as('02');
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organization_invitations SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
	WHERE id = 'c6420000-0000-4000-8000-000000000415' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'a governor can revoke a pending invitation');
WITH updated AS (
	UPDATE public.organization_invitations SET status = 'expired', expired_at = now()
	WHERE id = 'c6420000-0000-4000-8000-000000000416' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'a governor can expire a pending invitation');
RESET ROLE;
SELECT is(
	(SELECT jsonb_object_agg(id, jsonb_build_array(status, organization_id, role, member_preset, access_scope_group_ids,
		declined_by, revoked_by))
		FROM public.organization_invitations
		WHERE id IN ('c6420000-0000-4000-8000-000000000414', 'c6420000-0000-4000-8000-000000000415',
			'c6420000-0000-4000-8000-000000000416')),
	'{"c6420000-0000-4000-8000-000000000414": ["declined", "c6420000-0000-4000-8000-0000000001aa", "member", "viewer",
			["c6420000-0000-4000-8000-0000000002aa"], "c6420000-0000-4000-8000-000000000014", null],
		"c6420000-0000-4000-8000-000000000415": ["revoked", "c6420000-0000-4000-8000-0000000001aa", "member", "viewer",
			["c6420000-0000-4000-8000-0000000002aa"], null, "c6420000-0000-4000-8000-000000000002"],
		"c6420000-0000-4000-8000-000000000416": ["expired", "c6420000-0000-4000-8000-0000000001aa", "member", "viewer",
			[], null, null]}'::jsonb,
	'lifecycle transitions persist only their lifecycle fields'
);

-- Member access scopes name Groups only from the same Organization.

SELECT pg_temp.act_as('02');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ UPDATE public.organization_memberships
		SET access_scope_kind = 'groups', access_scope_group_ids = ARRAY['c6420000-0000-4000-8000-0000000002bb']::uuid[]
		WHERE id = 'c6420000-0000-4000-8000-000000000304' $$,
	'23503', 'Access scope Groups must belong to the Organization',
	'a member scope cannot name another Organization''s Group'
);
SELECT throws_ok(
	$$ UPDATE public.organization_memberships
		SET access_scope_kind = 'groups', access_scope_group_ids =
			ARRAY['c6420000-0000-4000-8000-0000000002aa', 'c6420000-0000-4000-8000-0000000002bb']::uuid[]
		WHERE id = 'c6420000-0000-4000-8000-000000000304' $$,
	'23503', 'Access scope Groups must belong to the Organization',
	'a member scope cannot mix an own Group with another Organization''s Group'
);
RESET ROLE;
SELECT ok(pg_temp.unchanged(ARRAY['304']), 'foreign scope denials leave the membership unchanged');

SELECT pg_temp.act_as('02');
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organization_memberships
	SET access_scope_kind = 'groups', access_scope_group_ids =
		ARRAY['c6420000-0000-4000-8000-0000000002aa', 'c6420000-0000-4000-8000-0000000002ab']::uuid[]
	WHERE id = 'c6420000-0000-4000-8000-000000000304' RETURNING access_scope_group_ids
)
SELECT is((SELECT access_scope_group_ids FROM updated),
	ARRAY['c6420000-0000-4000-8000-0000000002aa', 'c6420000-0000-4000-8000-0000000002ab']::uuid[],
	'a member scope can name the Organization''s own Groups');
WITH updated AS (
	UPDATE public.organization_memberships
	SET access_scope_kind = 'organization', access_scope_group_ids = ARRAY[]::uuid[]
	WHERE id = 'c6420000-0000-4000-8000-000000000304' RETURNING access_scope_kind, access_scope_group_ids
)
SELECT is((SELECT jsonb_build_array(access_scope_kind, access_scope_group_ids) FROM updated),
	'["organization", []]'::jsonb, 'a member scope can return to the whole Organization');
SELECT throws_ok(
	$$ INSERT INTO public.organization_invitations (organization_id, email, invited_by, expires_at, role, member_preset,
			access_scope_kind, access_scope_group_ids)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'foreign-scope@example.test', 'c6420000-0000-4000-8000-000000000002',
			now() + interval '7 days', 'member', 'viewer', 'groups', ARRAY['c6420000-0000-4000-8000-0000000002bb']::uuid[]) $$,
	'23503', 'Access scope Groups must belong to the Organization',
	'an invitation scope cannot name another Organization''s Group'
);
SELECT throws_ok(
	$$ INSERT INTO public.organization_invitations (organization_id, email, invited_by, expires_at, role, member_preset,
			access_scope_kind, access_scope_group_ids)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'mixed-scope@example.test', 'c6420000-0000-4000-8000-000000000002',
			now() + interval '7 days', 'member', 'viewer', 'groups',
			ARRAY['c6420000-0000-4000-8000-0000000002aa', 'c6420000-0000-4000-8000-0000000002bb']::uuid[]) $$,
	'23503', 'Access scope Groups must belong to the Organization',
	'an invitation scope cannot mix an own Group with another Organization''s Group'
);
SELECT lives_ok(
	$$ INSERT INTO public.organization_invitations (organization_id, email, invited_by, expires_at, role, member_preset,
			access_scope_kind, access_scope_group_ids)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'own-scope@example.test', 'c6420000-0000-4000-8000-000000000002',
			now() + interval '7 days', 'member', 'viewer', 'groups', ARRAY['c6420000-0000-4000-8000-0000000002ab']::uuid[]) $$,
	'an invitation scope can name the Organization''s own Group'
);
RESET ROLE;
SELECT is(
	(SELECT jsonb_object_agg(email, access_scope_group_ids) FROM public.organization_invitations
		WHERE email IN ('foreign-scope@example.test', 'mixed-scope@example.test', 'own-scope@example.test')),
	'{"own-scope@example.test": ["c6420000-0000-4000-8000-0000000002ab"]}'::jsonb,
	'only the own-Group invitation persists'
);

SET LOCAL ROLE service_role;
SELECT throws_ok(
	$$ INSERT INTO public.organization_memberships (organization_id, user_id, role, member_preset, email,
			access_scope_kind, access_scope_group_ids)
		VALUES ('c6420000-0000-4000-8000-0000000001aa', 'c6420000-0000-4000-8000-000000000016', 'member', 'viewer',
			'governance-16@example.test', 'groups', ARRAY['c6420000-0000-4000-8000-0000000002bb']::uuid[]) $$,
	'23503', 'Access scope Groups must belong to the Organization',
	'service writers cannot store a membership scope with another Organization''s Group'
);
SELECT throws_ok(
	$$ UPDATE public.organization_invitations SET organization_id = 'c6420000-0000-4000-8000-0000000001bb'
		WHERE id = 'c6420000-0000-4000-8000-000000000417' $$,
	'23503', 'Access scope Groups must belong to the Organization',
	'moving an invitation cannot carry its Groups into another Organization'
);
RESET ROLE;
SELECT is(
	(SELECT count(*)::integer FROM public.organization_memberships
		WHERE user_id = 'c6420000-0000-4000-8000-000000000016'),
	0,
	'the service-role foreign scope denial persists no membership'
);
SELECT ok(pg_temp.unchanged(ARRAY['417']), 'the invitation move denial leaves the invitation unchanged');

DELETE FROM public.groups WHERE id = 'c6420000-0000-4000-8000-0000000002ac';
SELECT pg_temp.act_as('17');
SET LOCAL ROLE authenticated;
SELECT is(
	(SELECT accept_status FROM public.accept_organization_invitation('c6420000-0000-4000-8000-000000000417')),
	'accepted',
	'an invitation whose Group was later deleted can still be accepted'
);
RESET ROLE;
SELECT is(
	(SELECT jsonb_build_array(role, member_preset, access_scope_kind, access_scope_group_ids)
		FROM public.organization_memberships
		WHERE organization_id = 'c6420000-0000-4000-8000-0000000001aa'
			AND user_id = 'c6420000-0000-4000-8000-000000000017'),
	'["member", "operator", "groups", ["c6420000-0000-4000-8000-0000000002ac"]]'::jsonb,
	'acceptance copies the saved scope snapshot'
);

SELECT * FROM finish();
ROLLBACK;
