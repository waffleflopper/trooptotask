BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(12);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT ('c6430000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated',
	'switches-' || n || '@example.test', now()
FROM unnest(ARRAY['01', '02', '03']) AS n;

INSERT INTO public.organizations (id, name, created_by)
VALUES ('c6430000-0000-4000-8000-0000000001aa', 'Switches Alpha', 'c6430000-0000-4000-8000-000000000001');

INSERT INTO public.organization_memberships (
	id, organization_id, user_id, role, member_preset, capability_overrides,
	access_scope_kind, access_scope_group_ids, email
)
SELECT
	('c6430000-0000-4000-8000-000000000' || m.suffix)::uuid,
	'c6430000-0000-4000-8000-0000000001aa',
	('c6430000-0000-4000-8000-0000000000' || m.user_n)::uuid,
	m.role::public.organization_role,
	m.preset,
	'{"training":"view"}'::jsonb,
	'organization',
	ARRAY[]::uuid[],
	'switches-' || m.user_n || '@example.test'
FROM (VALUES
	('301', '01', 'owner', 'editor'),
	('302', '02', 'admin', 'editor'),
	('303', '03', 'member', 'operator')
) AS m(suffix, user_n, role, preset);

CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
	SELECT set_config('request.jwt.claim.sub', 'c6430000-0000-4000-8000-0000000000' || p_user, true);
	SELECT set_config('request.jwt.claim.email', 'switches-' || p_user || '@example.test', true);
	SELECT set_config('request.jwt.claims', jsonb_build_object(
		'sub', 'c6430000-0000-4000-8000-0000000000' || p_user,
		'email', 'switches-' || p_user || '@example.test',
		'role', 'authenticated',
		'aal', 'aal1',
		'amr', jsonb_build_array(jsonb_build_object(
			'method', 'password', 'timestamp', floor(extract(epoch FROM now()))::bigint - 60)))::text, true);
$$;

SELECT is(
	(SELECT jsonb_build_array(disabled_features, strength_floor_percent)
		FROM public.organizations WHERE id = 'c6430000-0000-4000-8000-0000000001aa'),
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

SELECT pg_temp.act_as('03');
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organizations SET disabled_features = ARRAY['training'], strength_floor_percent = 50
	WHERE id = 'c6430000-0000-4000-8000-0000000001aa' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'a member cannot change feature switches or the strength floor');
RESET ROLE;

SELECT pg_temp.act_as('02');
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organizations SET disabled_features = ARRAY['training', 'lossesAndAwards'], strength_floor_percent = 65
	WHERE id = 'c6430000-0000-4000-8000-0000000001aa' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 1, 'an admin can change feature switches and the strength floor');
SELECT throws_ok(
	$$ UPDATE public.organizations SET disabled_features = ARRAY['training', 'dutyRoster']
		WHERE id = 'c6430000-0000-4000-8000-0000000001aa' $$,
	'23514',
	NULL,
	'an unknown feature key is rejected'
);
SELECT throws_ok(
	$$ UPDATE public.organizations SET disabled_features = ARRAY[NULL]::text[]
		WHERE id = 'c6430000-0000-4000-8000-0000000001aa' $$,
	'23514',
	NULL,
	'a null feature key is rejected'
);
SELECT throws_ok(
	$$ UPDATE public.organizations SET strength_floor_percent = 0 WHERE id = 'c6430000-0000-4000-8000-0000000001aa' $$,
	'23514',
	NULL,
	'a strength floor below 1 is rejected'
);
SELECT throws_ok(
	$$ UPDATE public.organizations SET strength_floor_percent = 101 WHERE id = 'c6430000-0000-4000-8000-0000000001aa' $$,
	'23514',
	NULL,
	'a strength floor above 100 is rejected'
);
RESET ROLE;

SELECT is(
	(SELECT jsonb_build_array(disabled_features, strength_floor_percent)
		FROM public.organizations WHERE id = 'c6430000-0000-4000-8000-0000000001aa'),
	'[["training", "lossesAndAwards"], 65]'::jsonb,
	'the admin update persists exactly and the rejected writes change nothing'
);

SELECT pg_temp.act_as('01');
SET LOCAL ROLE authenticated;
WITH updated AS (
	UPDATE public.organizations SET disabled_features = '{}', strength_floor_percent = 100
	WHERE id = 'c6430000-0000-4000-8000-0000000001aa' RETURNING disabled_features, strength_floor_percent
)
SELECT is(
	(SELECT jsonb_build_array(disabled_features, strength_floor_percent) FROM updated),
	'[[], 100]'::jsonb,
	'an owner can turn every feature back on and set the floor to 100'
);
RESET ROLE;

SELECT is(
	(SELECT jsonb_agg(capability_overrides ORDER BY id) FROM public.organization_memberships
		WHERE organization_id = 'c6430000-0000-4000-8000-0000000001aa'),
	'[{"training": "view"}, {"training": "view"}, {"training": "view"}]'::jsonb,
	'switching features leaves every stored member capability as it was'
);

SELECT * FROM finish();
ROLLBACK;
