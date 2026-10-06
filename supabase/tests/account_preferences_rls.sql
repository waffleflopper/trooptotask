BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(41);

INSERT INTO auth.users (
	instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
	raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
	'00000000-0000-0000-0000-000000000000'::uuid, fixture.id::uuid,
	'authenticated', 'authenticated', fixture.email, '', now(),
	'{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
FROM (VALUES
	('10000000-0000-4000-8000-000000137401', 'preferences-alpha@example.test'),
	('10000000-0000-4000-8000-000000137402', 'preferences-alpha-peer@example.test'),
	('10000000-0000-4000-8000-000000137403', 'preferences-bravo@example.test'),
	('10000000-0000-4000-8000-000000137404', 'preferences-multiple-orgs@example.test'),
	('10000000-0000-4000-8000-000000137405', 'preferences-no-membership@example.test')
) AS fixture(id, email);

INSERT INTO public.organizations (id, name, created_by, url_slug)
VALUES
	('20000000-0000-4000-8000-000000137401', 'Preferences Alpha', '10000000-0000-4000-8000-000000137401', 'preferences-alpha-1374'),
	('20000000-0000-4000-8000-000000137402', 'Preferences Bravo', '10000000-0000-4000-8000-000000137403', 'preferences-bravo-1374');

INSERT INTO public.organization_memberships (
	id, organization_id, user_id, role, member_preset, capability_overrides,
	access_scope_kind, access_scope_group_ids, email
)
SELECT
	fixture.id::uuid, fixture.org_id::uuid, fixture.user_id::uuid,
	fixture.role::public.organization_role, 'viewer', '{}'::jsonb,
	'organization', ARRAY[]::uuid[], fixture.email
FROM (VALUES
	('30000000-0000-4000-8000-000000137401', '20000000-0000-4000-8000-000000137401', '10000000-0000-4000-8000-000000137401', 'member', 'preferences-alpha@example.test'),
	('30000000-0000-4000-8000-000000137402', '20000000-0000-4000-8000-000000137401', '10000000-0000-4000-8000-000000137402', 'admin', 'preferences-alpha-peer@example.test'),
	('30000000-0000-4000-8000-000000137403', '20000000-0000-4000-8000-000000137402', '10000000-0000-4000-8000-000000137403', 'owner', 'preferences-bravo@example.test'),
	('30000000-0000-4000-8000-000000137404', '20000000-0000-4000-8000-000000137401', '10000000-0000-4000-8000-000000137404', 'member', 'preferences-multiple-orgs@example.test'),
	('30000000-0000-4000-8000-000000137405', '20000000-0000-4000-8000-000000137402', '10000000-0000-4000-8000-000000137404', 'member', 'preferences-multiple-orgs@example.test')
) AS fixture(id, org_id, user_id, role, email);

-- A self action remains available to an ordinary member with no feature lanes.
UPDATE public.organization_memberships
SET capability_overrides = '{"personnel":"none","training":"none","calendar":"none","criticalTasks":"none","onboarding":"none","ratingScheme":"none"}'
WHERE id = '30000000-0000-4000-8000-000000137401';

-- Historical self rows outside current membership remain stored, but inaccessible.
INSERT INTO public.getting_started_progress (id, organization_id, user_id, dismissed_at)
VALUES
	('40000000-0000-4000-8000-000000137401', '20000000-0000-4000-8000-000000137401', '10000000-0000-4000-8000-000000137401', '2026-09-01T00:00:00Z'),
	('40000000-0000-4000-8000-000000137402', '20000000-0000-4000-8000-000000137401', '10000000-0000-4000-8000-000000137402', NULL),
	('40000000-0000-4000-8000-000000137403', '20000000-0000-4000-8000-000000137402', '10000000-0000-4000-8000-000000137401', '2026-09-02T00:00:00Z'),
	('40000000-0000-4000-8000-000000137404', '20000000-0000-4000-8000-000000137402', '10000000-0000-4000-8000-000000137403', NULL);

INSERT INTO public.user_org_preferences (id, organization_id, user_id, preferences)
VALUES
	('50000000-0000-4000-8000-000000137401', '20000000-0000-4000-8000-000000137401', '10000000-0000-4000-8000-000000137401', '{"calendar":{"showStatusText":true}}'),
	('50000000-0000-4000-8000-000000137402', '20000000-0000-4000-8000-000000137401', '10000000-0000-4000-8000-000000137402', '{"calendar":{"showPersonnelRoles":true}}'),
	('50000000-0000-4000-8000-000000137403', '20000000-0000-4000-8000-000000137402', '10000000-0000-4000-8000-000000137401', '{"training":{"matrixViewMode":"alphabetical"}}'),
	('50000000-0000-4000-8000-000000137404', '20000000-0000-4000-8000-000000137402', '10000000-0000-4000-8000-000000137403', '{}');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000137401', true);

SELECT results_eq(
	$$ SELECT id FROM public.getting_started_progress ORDER BY id $$,
	$$ VALUES ('40000000-0000-4000-8000-000000137401'::uuid) $$,
	'progress exposes only the actor own row in a current Organization'
);
SELECT results_eq(
	$$ SELECT id FROM public.user_org_preferences ORDER BY id $$,
	$$ VALUES ('50000000-0000-4000-8000-000000137401'::uuid) $$,
	'preferences expose only the actor own row in a current Organization'
);

WITH updated AS (
	UPDATE public.getting_started_progress SET dismissed_at = '2026-09-03T00:00:00Z'
	WHERE id = '40000000-0000-4000-8000-000000137401' RETURNING dismissed_at
)
SELECT is((SELECT dismissed_at FROM updated), '2026-09-03T00:00:00Z'::timestamptz, 'member without feature grants can dismiss own progress');

WITH updated AS (
	UPDATE public.getting_started_progress SET dismissed_at = NULL
	WHERE id = '40000000-0000-4000-8000-000000137401' RETURNING dismissed_at
)
SELECT ok((SELECT dismissed_at IS NULL FROM updated), 'member without feature grants can reset own progress');
WITH updated AS (
	UPDATE public.user_org_preferences SET preferences = '{"training":{"matrixViewMode":"by-group"}}'
	WHERE id = '50000000-0000-4000-8000-000000137401' RETURNING preferences
)
SELECT is((SELECT preferences FROM updated), '{"training":{"matrixViewMode":"by-group"}}'::jsonb, 'member without feature grants can update own preferences');

WITH changed AS (
	UPDATE public.getting_started_progress SET dismissed_at = now()
	WHERE id = '40000000-0000-4000-8000-000000137402' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM changed), 0, 'member cannot update peer progress in the same Organization');
WITH changed AS (
	UPDATE public.user_org_preferences SET preferences = '{}'
	WHERE id = '50000000-0000-4000-8000-000000137402' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM changed), 0, 'member cannot update peer preferences in the same Organization');
WITH removed AS (
	DELETE FROM public.getting_started_progress WHERE id = '40000000-0000-4000-8000-000000137402' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'member cannot delete peer progress');
WITH removed AS (
	DELETE FROM public.user_org_preferences WHERE id = '50000000-0000-4000-8000-000000137402' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'member cannot delete peer preferences');

WITH changed AS (
	UPDATE public.getting_started_progress SET dismissed_at = NULL
	WHERE id = '40000000-0000-4000-8000-000000137403' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM changed), 0, 'own historical foreign progress cannot be updated');
WITH changed AS (
	UPDATE public.user_org_preferences SET preferences = '{}'
	WHERE id = '50000000-0000-4000-8000-000000137403' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM changed), 0, 'own historical foreign preferences cannot be updated');
WITH removed AS (
	DELETE FROM public.getting_started_progress WHERE id = '40000000-0000-4000-8000-000000137403' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'own historical foreign progress cannot be deleted');
WITH removed AS (
	DELETE FROM public.user_org_preferences WHERE id = '50000000-0000-4000-8000-000000137403' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'own historical foreign preferences cannot be deleted');

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000137403', true);
SELECT throws_ok(
	$$ UPDATE public.getting_started_progress SET organization_id = '20000000-0000-4000-8000-000000137401'
	WHERE id = '40000000-0000-4000-8000-000000137404' $$,
	'42501', NULL, 'own progress cannot be moved into a foreign Organization'
);
SELECT throws_ok(
	$$ UPDATE public.user_org_preferences SET organization_id = '20000000-0000-4000-8000-000000137401'
	WHERE id = '50000000-0000-4000-8000-000000137404' $$,
	'42501', NULL, 'own preferences cannot be moved into a foreign Organization'
);
SELECT throws_ok(
	$$ UPDATE public.getting_started_progress SET user_id = '10000000-0000-4000-8000-000000137405'
	WHERE id = '40000000-0000-4000-8000-000000137404' $$,
	'42501', NULL, 'own progress cannot be reassigned to another user'
);
SELECT throws_ok(
	$$ UPDATE public.user_org_preferences SET user_id = '10000000-0000-4000-8000-000000137405'
	WHERE id = '50000000-0000-4000-8000-000000137404' $$,
	'42501', NULL, 'own preferences cannot be reassigned to another user'
);
SELECT throws_ok(
	$$ INSERT INTO public.getting_started_progress (organization_id, user_id)
	VALUES ('20000000-0000-4000-8000-000000137402', '10000000-0000-4000-8000-000000137402') $$,
	'42501', NULL, 'member cannot create progress attributed to another user'
);
SELECT throws_ok(
	$$ INSERT INTO public.user_org_preferences (organization_id, user_id, preferences)
	VALUES ('20000000-0000-4000-8000-000000137402', '10000000-0000-4000-8000-000000137402', '{}') $$,
	'42501', NULL, 'member cannot create preferences attributed to another user'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000137402', true);
SELECT results_eq(
	$$ SELECT id FROM public.getting_started_progress ORDER BY id $$,
	$$ VALUES ('40000000-0000-4000-8000-000000137402'::uuid) $$,
	'Organization administrator cannot read another user progress'
);
SELECT results_eq(
	$$ SELECT id FROM public.user_org_preferences ORDER BY id $$,
	$$ VALUES ('50000000-0000-4000-8000-000000137402'::uuid) $$,
	'Organization administrator cannot read another user preferences'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000137405', true);
SELECT throws_ok(
	$$ INSERT INTO public.getting_started_progress (organization_id, user_id)
	VALUES ('20000000-0000-4000-8000-000000137401', '10000000-0000-4000-8000-000000137405') $$,
	'42501', NULL, 'account without membership cannot create Organization progress'
);
SELECT throws_ok(
	$$ INSERT INTO public.user_org_preferences (organization_id, user_id, preferences)
	VALUES ('20000000-0000-4000-8000-000000137401', '10000000-0000-4000-8000-000000137405', '{}') $$,
	'42501', NULL, 'account without membership cannot create Organization preferences'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000137404', true);
SELECT lives_ok(
	$$ INSERT INTO public.getting_started_progress (id, organization_id, user_id) VALUES
	('40000000-0000-4000-8000-000000137405', '20000000-0000-4000-8000-000000137401', '10000000-0000-4000-8000-000000137404'),
	('40000000-0000-4000-8000-000000137406', '20000000-0000-4000-8000-000000137402', '10000000-0000-4000-8000-000000137404') $$,
	'member of two Organizations can create own progress in both'
);
SELECT lives_ok(
	$$ INSERT INTO public.user_org_preferences (id, organization_id, user_id, preferences) VALUES
	('50000000-0000-4000-8000-000000137405', '20000000-0000-4000-8000-000000137401', '10000000-0000-4000-8000-000000137404', '{"calendar":{"showStatusText":true}}'),
	('50000000-0000-4000-8000-000000137406', '20000000-0000-4000-8000-000000137402', '10000000-0000-4000-8000-000000137404', '{"calendar":{"showStatusText":false}}') $$,
	'member of two Organizations can create separate own preferences'
);
SELECT results_eq(
	$$ SELECT id FROM public.getting_started_progress ORDER BY id $$,
	$$ VALUES ('40000000-0000-4000-8000-000000137405'::uuid), ('40000000-0000-4000-8000-000000137406'::uuid) $$,
	'multi-Organization actor sees both own progress rows and no peers'
);
SELECT results_eq(
	$$ SELECT id FROM public.user_org_preferences ORDER BY id $$,
	$$ VALUES ('50000000-0000-4000-8000-000000137405'::uuid), ('50000000-0000-4000-8000-000000137406'::uuid) $$,
	'multi-Organization actor sees both own preference rows and no peers'
);
WITH removed AS (
	DELETE FROM public.getting_started_progress WHERE id = '40000000-0000-4000-8000-000000137405' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 1, 'member can delete own progress in a current Organization');
WITH removed AS (
	DELETE FROM public.user_org_preferences WHERE id = '50000000-0000-4000-8000-000000137405' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 1, 'member can delete own preferences in a current Organization');

RESET ROLE;
DELETE FROM public.organization_memberships WHERE id = '30000000-0000-4000-8000-000000137405';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000137404', true);

SELECT is((SELECT count(*)::integer FROM public.getting_started_progress), 0, 'membership removal hides retained own progress');
SELECT is((SELECT count(*)::integer FROM public.user_org_preferences), 0, 'membership removal hides retained own preferences');
WITH changed AS (
	UPDATE public.getting_started_progress SET dismissed_at = now()
	WHERE id = '40000000-0000-4000-8000-000000137406' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM changed), 0, 'removed member cannot update retained own progress');
WITH changed AS (
	UPDATE public.user_org_preferences SET preferences = '{}'
	WHERE id = '50000000-0000-4000-8000-000000137406' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM changed), 0, 'removed member cannot update retained own preferences');
WITH removed AS (
	DELETE FROM public.getting_started_progress WHERE id = '40000000-0000-4000-8000-000000137406' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'removed member cannot delete retained own progress');
WITH removed AS (
	DELETE FROM public.user_org_preferences WHERE id = '50000000-0000-4000-8000-000000137406' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'removed member cannot delete retained own preferences');
SELECT throws_ok(
	$$ INSERT INTO public.getting_started_progress (organization_id, user_id)
	VALUES ('20000000-0000-4000-8000-000000137402', '10000000-0000-4000-8000-000000137404') $$,
	'42501', NULL, 'removed member cannot create new progress'
);
SELECT throws_ok(
	$$ INSERT INTO public.user_org_preferences (organization_id, user_id, preferences)
	VALUES ('20000000-0000-4000-8000-000000137402', '10000000-0000-4000-8000-000000137404', '{}') $$,
	'42501', NULL, 'removed member cannot create new preferences'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is((SELECT count(*)::integer FROM public.getting_started_progress), 0, 'anonymous caller cannot read progress');
SELECT is((SELECT count(*)::integer FROM public.user_org_preferences), 0, 'anonymous caller cannot read preferences');
SELECT throws_ok(
	$$ INSERT INTO public.getting_started_progress (organization_id, user_id)
	VALUES ('20000000-0000-4000-8000-000000137401', '10000000-0000-4000-8000-000000137401') $$,
	'42501', NULL, 'anonymous caller cannot write progress'
);
SELECT throws_ok(
	$$ INSERT INTO public.user_org_preferences (organization_id, user_id, preferences)
	VALUES ('20000000-0000-4000-8000-000000137401', '10000000-0000-4000-8000-000000137401', '{}') $$,
	'42501', NULL, 'anonymous caller cannot write preferences'
);

SELECT * FROM finish();
ROLLBACK;
