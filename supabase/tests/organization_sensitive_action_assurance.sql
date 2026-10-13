BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(40);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT ('c6430000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated',
	'assurance-' || n || '@example.test', now()
FROM unnest(ARRAY['01','02','03','04','05','06','07','08']) AS n;

INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
VALUES
	('c6430000-0000-4000-8000-000000000905', 'c6430000-0000-4000-8000-000000000005', 'verified totp', 'totp',
		'verified', now(), now()),
	('c6430000-0000-4000-8000-000000000906', 'c6430000-0000-4000-8000-000000000006', 'pending totp', 'totp',
		'unverified', now(), now());

INSERT INTO public.user_suspensions (user_id, suspended_by, reason)
VALUES ('c6430000-0000-4000-8000-000000000007', 'c6430000-0000-4000-8000-000000000001', 'assurance fixture');

INSERT INTO public.organizations (id, name, created_by)
VALUES
	('c6430000-0000-4000-8000-0000000001aa', 'Assurance Alpha', 'c6430000-0000-4000-8000-000000000001'),
	('c6430000-0000-4000-8000-0000000001bb', 'Assurance Verified Factor', 'c6430000-0000-4000-8000-000000000005'),
	('c6430000-0000-4000-8000-0000000001cc', 'Assurance Unverified Factor', 'c6430000-0000-4000-8000-000000000006'),
	('c6430000-0000-4000-8000-0000000001dd', 'Assurance Suspended Owner', 'c6430000-0000-4000-8000-000000000007'),
	('c6430000-0000-4000-8000-0000000001ee', 'Assurance Deletion', 'c6430000-0000-4000-8000-000000000001'),
	('c6430000-0000-4000-8000-0000000001ff', 'Assurance Transfer', 'c6430000-0000-4000-8000-000000000001');

INSERT INTO public.organization_memberships (
	id, organization_id, user_id, role, member_preset, capability_overrides,
	access_scope_kind, access_scope_group_ids, email
)
SELECT
	('c6430000-0000-4000-8000-000000000' || m.suffix)::uuid,
	('c6430000-0000-4000-8000-0000000001' || m.org)::uuid,
	('c6430000-0000-4000-8000-0000000000' || m.user_n)::uuid,
	m.role::public.organization_role,
	m.preset,
	'{}'::jsonb,
	'organization',
	ARRAY[]::uuid[],
	'assurance-' || m.user_n || '@example.test'
FROM (VALUES
	('301', 'aa', '01', 'owner', 'editor'),
	('302', 'aa', '02', 'admin', 'editor'),
	('303', 'aa', '03', 'member', 'viewer'),
	('304', 'aa', '04', 'member', 'viewer'),
	('321', 'bb', '05', 'owner', 'editor'),
	('328', 'bb', '08', 'member', 'viewer'),
	('331', 'cc', '06', 'owner', 'editor'),
	('341', 'dd', '07', 'owner', 'editor'),
	('351', 'ee', '01', 'owner', 'editor'),
	('361', 'ff', '01', 'owner', 'editor'),
	('368', 'ff', '08', 'member', 'viewer')
) AS m(suffix, org, user_n, role, preset);

CREATE TEMP TABLE assurance_before AS
SELECT id, to_jsonb(m) AS row_data FROM public.organization_memberships m WHERE id::text LIKE 'c6430000-%';

-- Claims mirror a Supabase access token: aal plus amr entries with Unix-second timestamps.
CREATE FUNCTION pg_temp.act_with_claims(p_user text, p_claims jsonb) RETURNS void LANGUAGE sql AS $$
	SELECT set_config('request.jwt.claim.sub', 'c6430000-0000-4000-8000-0000000000' || p_user, true);
	SELECT set_config('request.jwt.claim.email', 'assurance-' || p_user || '@example.test', true);
	SELECT set_config('request.jwt.claims', (jsonb_build_object(
		'sub', 'c6430000-0000-4000-8000-0000000000' || p_user,
		'email', 'assurance-' || p_user || '@example.test',
		'role', 'authenticated') || p_claims)::text, true);
$$;

CREATE FUNCTION pg_temp.signed_in(p_seconds_ago integer) RETURNS jsonb LANGUAGE sql AS $$
	SELECT jsonb_build_array(jsonb_build_object(
		'method', 'password', 'timestamp', floor(extract(epoch FROM now()))::bigint - p_seconds_ago));
$$;

CREATE FUNCTION pg_temp.act_as(p_user text, p_aal text, p_seconds_ago integer) RETURNS void LANGUAGE sql AS $$
	SELECT pg_temp.act_with_claims(p_user, jsonb_build_object('aal', p_aal, 'amr', pg_temp.signed_in(p_seconds_ago)));
$$;

CREATE FUNCTION pg_temp.invite_admin(p_organization text, p_inviter text, p_email text) RETURNS void
LANGUAGE sql AS $$
	INSERT INTO public.organization_invitations (organization_id, email, invited_by, expires_at, role, member_preset)
	VALUES (('c6430000-0000-4000-8000-0000000001' || p_organization)::uuid, p_email,
		('c6430000-0000-4000-8000-0000000000' || p_inviter)::uuid, now() + interval '7 days', 'admin', 'editor');
$$;

CREATE FUNCTION pg_temp.unchanged(p_ids text[]) RETURNS boolean LANGUAGE sql AS $$
	SELECT (
		SELECT jsonb_agg(row_data ORDER BY id) FROM assurance_before
		WHERE id::text = ANY (SELECT 'c6430000-0000-4000-8000-000000000' || s FROM unnest(p_ids) s)
	) = (
		SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.organization_memberships m
		WHERE id::text = ANY (SELECT 'c6430000-0000-4000-8000-000000000' || s FROM unnest(p_ids) s)
	)
$$;

-- Admin invitations follow the sensitive-action session rule.

SELECT pg_temp.act_with_claims('01', jsonb_build_object('aal', 'aal2'));
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT pg_temp.invite_admin('aa', '01', 'aal2@example.test') $$,
	'an MFA-assured owner can invite an admin');
RESET ROLE;

SELECT pg_temp.act_as('01', 'aal1', 60);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT pg_temp.invite_admin('aa', '01', 'recent@example.test') $$,
	'an owner without MFA who signed in recently can invite an admin');
RESET ROLE;

SELECT pg_temp.act_with_claims('01', jsonb_build_object('aal', 'aal1', 'amr',
	pg_temp.signed_in(3600) || pg_temp.signed_in(60)));
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT pg_temp.invite_admin('aa', '01', 'latest-method@example.test') $$,
	'the latest authentication method decides session recency');
RESET ROLE;

SELECT pg_temp.act_as('01', 'aal1', 960);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT pg_temp.invite_admin('aa', '01', 'stale@example.test') $$,
	'42501', 'new row violates row-level security policy for table "organization_invitations"',
	'an owner whose sign-in is older than 15 minutes cannot invite an admin');
SELECT lives_ok(
	$$ INSERT INTO public.organization_invitations (organization_id, email, invited_by, expires_at, role, member_preset)
		VALUES ('c6430000-0000-4000-8000-0000000001aa', 'stale-member@example.test',
			'c6430000-0000-4000-8000-000000000001', now() + interval '7 days', 'member', 'viewer') $$,
	'a stale owner session can still invite an ordinary member'
);
RESET ROLE;

SELECT pg_temp.act_with_claims('01', jsonb_build_object('aal', 'aal1'));
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT pg_temp.invite_admin('aa', '01', 'no-amr@example.test') $$,
	'42501', 'new row violates row-level security policy for table "organization_invitations"',
	'a session without authentication methods cannot invite an admin');
RESET ROLE;

SELECT pg_temp.act_with_claims('01', jsonb_build_object('amr', pg_temp.signed_in(60)));
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT pg_temp.invite_admin('aa', '01', 'no-aal@example.test') $$,
	'42501', 'new row violates row-level security policy for table "organization_invitations"',
	'a session without an assurance level cannot invite an admin');
RESET ROLE;

SELECT pg_temp.act_as('01', 'aal1', -60);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT pg_temp.invite_admin('aa', '01', 'future@example.test') $$,
	'42501', 'new row violates row-level security policy for table "organization_invitations"',
	'an authentication method dated in the future cannot satisfy recency');
RESET ROLE;

SELECT pg_temp.act_as('05', 'aal1', 60);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT pg_temp.invite_admin('bb', '05', 'factor-aal1@example.test') $$,
	'42501', 'new row violates row-level security policy for table "organization_invitations"',
	'an owner with a verified MFA factor must complete MFA even after a recent sign-in');
RESET ROLE;

SELECT pg_temp.act_with_claims('05', jsonb_build_object('aal', 'aal2', 'amr', pg_temp.signed_in(3600)));
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT pg_temp.invite_admin('bb', '05', 'factor-aal2@example.test') $$,
	'an owner with a verified MFA factor can invite an admin after MFA');
RESET ROLE;

SELECT pg_temp.act_as('06', 'aal1', 60);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT pg_temp.invite_admin('cc', '06', 'unverified-factor@example.test') $$,
	'an unverified MFA factor does not require MFA');
RESET ROLE;

SELECT pg_temp.act_with_claims('07', jsonb_build_object('aal', 'aal2', 'amr', pg_temp.signed_in(60)));
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT pg_temp.invite_admin('dd', '07', 'suspended@example.test') $$,
	'42501', 'new row violates row-level security policy for table "organization_invitations"',
	'a suspended owner cannot invite an admin');
RESET ROLE;

SELECT is(
	(SELECT jsonb_object_agg(email, role ORDER BY email) FROM public.organization_invitations
		WHERE organization_id::text LIKE 'c6430000-%'),
	'{"aal2@example.test": "admin", "factor-aal2@example.test": "admin", "latest-method@example.test": "admin",
		"recent@example.test": "admin", "stale-member@example.test": "member",
		"unverified-factor@example.test": "admin"}'::jsonb,
	'only assured admin invitations and the ordinary member invitation persist'
);

-- Owner changes to admin access follow the same rule; ordinary member edits do not.

SELECT pg_temp.act_as('01', 'aal1', 960);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ UPDATE public.organization_memberships SET role = 'admin', member_preset = 'editor'
		WHERE id = 'c6430000-0000-4000-8000-000000000303' $$,
	'42501',
	'new row violates row-level security policy for table "organization_memberships"',
	'a stale owner session cannot grant admin'
);
WITH updated AS (
	UPDATE public.organization_memberships SET member_preset = 'viewer'
	WHERE id = 'c6430000-0000-4000-8000-000000000302' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'a stale owner session cannot edit admin access');
WITH updated AS (
	UPDATE public.organization_memberships SET role = 'member', member_preset = 'viewer'
	WHERE id = 'c6430000-0000-4000-8000-000000000302' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'a stale owner session cannot remove admin access');
RESET ROLE;
SELECT ok(pg_temp.unchanged(ARRAY['302', '303']), 'stale admin-access denials leave both rows unchanged');

SELECT pg_temp.act_as('01', 'aal1', 960);
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organization_memberships SET member_preset = 'operator'
	WHERE id = 'c6430000-0000-4000-8000-000000000304' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'a stale owner session can still edit ordinary member access');
RESET ROLE;
SELECT pg_temp.act_as('02', 'aal1', 960);
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organization_memberships SET capability_overrides = '{"calendar":"none"}'::jsonb
	WHERE id = 'c6430000-0000-4000-8000-000000000304' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'a stale admin session can still edit ordinary member access');
RESET ROLE;
SELECT is(
	(SELECT jsonb_build_array(role, member_preset, capability_overrides)
		FROM public.organization_memberships WHERE id = 'c6430000-0000-4000-8000-000000000304'),
	'["member", "operator", {"calendar": "none"}]'::jsonb,
	'ordinary member edits from stale sessions persist exactly'
);

SELECT pg_temp.act_as('01', 'aal1', 60);
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organization_memberships SET role = 'admin', member_preset = 'editor'
	WHERE id = 'c6430000-0000-4000-8000-000000000303' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'a recently signed-in owner can grant admin');
RESET ROLE;
SELECT pg_temp.act_with_claims('01', jsonb_build_object('aal', 'aal2', 'amr', pg_temp.signed_in(3600)));
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organization_memberships SET role = 'member', member_preset = 'viewer'
	WHERE id = 'c6430000-0000-4000-8000-000000000302' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'an MFA-assured owner can remove admin access');
RESET ROLE;
SELECT is(
	(SELECT jsonb_object_agg(id, jsonb_build_array(role, member_preset)) FROM public.organization_memberships
		WHERE id IN ('c6430000-0000-4000-8000-000000000302', 'c6430000-0000-4000-8000-000000000303')),
	'{"c6430000-0000-4000-8000-000000000302": ["member", "viewer"],
		"c6430000-0000-4000-8000-000000000303": ["admin", "editor"]}'::jsonb,
	'assured admin-access changes persist exactly'
);

-- Ownership transfer requires an assured session inside the command.

SELECT pg_temp.act_as('01', 'aal1', 960);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ SELECT public.transfer_org_ownership('c6430000-0000-4000-8000-0000000001ff', 'c6430000-0000-4000-8000-000000000008') $$,
	'P0001',
	'Recent sign-in or MFA verification is required to transfer ownership',
	'a stale owner session cannot transfer ownership'
);
RESET ROLE;
SELECT ok(pg_temp.unchanged(ARRAY['361', '368']), 'the denied transfer leaves owner and target unchanged');

SELECT pg_temp.act_as('05', 'aal1', 60);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ SELECT public.transfer_org_ownership('c6430000-0000-4000-8000-0000000001bb', 'c6430000-0000-4000-8000-000000000008') $$,
	'P0001',
	'Recent sign-in or MFA verification is required to transfer ownership',
	'an owner with a verified MFA factor cannot transfer ownership without MFA'
);
RESET ROLE;
SELECT ok(pg_temp.unchanged(ARRAY['321', '328']), 'the MFA-required transfer denial leaves owner and target unchanged');

SELECT pg_temp.act_as('01', 'aal1', 60);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
	$$ SELECT public.transfer_org_ownership('c6430000-0000-4000-8000-0000000001ff', 'c6430000-0000-4000-8000-000000000008') $$,
	'a recently signed-in owner can transfer ownership'
);
RESET ROLE;
SELECT is(
	(SELECT jsonb_object_agg(user_id, role) FROM public.organization_memberships
		WHERE organization_id = 'c6430000-0000-4000-8000-0000000001ff'),
	'{"c6430000-0000-4000-8000-000000000001": "admin", "c6430000-0000-4000-8000-000000000008": "owner"}'::jsonb,
	'the assured transfer swaps exactly the owner and the target'
);

-- Organization deletion requires an assured owner session.

SELECT pg_temp.act_as('01', 'aal1', 960);
SET LOCAL ROLE authenticated;
WITH deleted AS (
	DELETE FROM public.organizations WHERE id = 'c6430000-0000-4000-8000-0000000001ee' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 0, 'a stale owner session cannot delete the Organization');
RESET ROLE;
SELECT ok(pg_temp.unchanged(ARRAY['351']), 'the stale deletion denial keeps the owner membership');
SELECT is(
	(SELECT name FROM public.organizations WHERE id = 'c6430000-0000-4000-8000-0000000001ee'),
	'Assurance Deletion',
	'the stale deletion denial keeps the Organization'
);

SELECT pg_temp.act_as('05', 'aal1', 60);
SET LOCAL ROLE authenticated;
WITH deleted AS (
	DELETE FROM public.organizations WHERE id = 'c6430000-0000-4000-8000-0000000001bb' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 0,
	'an owner with a verified MFA factor cannot delete the Organization without MFA');
RESET ROLE;
SELECT is(
	(SELECT count(*)::integer FROM public.organizations WHERE id = 'c6430000-0000-4000-8000-0000000001bb'),
	1,
	'the MFA-required deletion denial keeps the Organization'
);

SELECT pg_temp.act_as('02', 'aal1', 60);
SET LOCAL ROLE authenticated;
WITH deleted AS (
	DELETE FROM public.organizations WHERE id = 'c6430000-0000-4000-8000-0000000001aa' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 0, 'an assured non-owner cannot delete the Organization');
RESET ROLE;

SELECT pg_temp.act_as('01', 'aal1', 60);
SET LOCAL ROLE authenticated;
WITH deleted AS (
	DELETE FROM public.organizations WHERE id = 'c6430000-0000-4000-8000-0000000001ee' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 1, 'a recently signed-in owner can delete the Organization');
RESET ROLE;
SELECT is(
	(SELECT count(*)::integer FROM public.organization_memberships
		WHERE organization_id = 'c6430000-0000-4000-8000-0000000001ee'),
	0,
	'the assured deletion removes the Organization and its memberships'
);

SELECT pg_temp.act_with_claims('05', jsonb_build_object('aal', 'aal2', 'amr', pg_temp.signed_in(3600)));
SET LOCAL ROLE authenticated;
WITH deleted AS (
	DELETE FROM public.organizations WHERE id = 'c6430000-0000-4000-8000-0000000001bb' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 1, 'an MFA-assured owner can delete the Organization');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
WITH deleted AS (
	DELETE FROM public.organizations WHERE id = 'c6430000-0000-4000-8000-0000000001aa' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 0, 'an anonymous caller cannot delete an Organization');
RESET ROLE;
SELECT is(
	(SELECT count(*)::integer FROM public.organizations WHERE id = 'c6430000-0000-4000-8000-0000000001aa'),
	1,
	'the anonymous deletion denial keeps the Organization'
);

SELECT * FROM finish();
ROLLBACK;
