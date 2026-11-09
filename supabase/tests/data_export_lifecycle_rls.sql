BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(20);

INSERT INTO auth.users (
	instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
	raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
	'00000000-0000-0000-0000-000000000000'::uuid,
	fixture.id::uuid,
	'authenticated', 'authenticated', fixture.email, '', now(),
	'{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
FROM (VALUES
	('10000000-0000-4000-8000-000000129501', 'export-former-owner-1295@example.test'),
	('10000000-0000-4000-8000-000000129502', 'export-current-owner-1295@example.test'),
	('10000000-0000-4000-8000-000000129503', 'export-admin-1295@example.test'),
	('10000000-0000-4000-8000-000000129504', 'export-delegate-1295@example.test'),
	('10000000-0000-4000-8000-000000129505', 'export-member-1295@example.test'),
	('10000000-0000-4000-8000-000000129506', 'export-foreign-owner-1295@example.test')
) AS fixture(id, email);

-- Ownership transfer preserves created_by; membership is the current authority.
INSERT INTO public.organizations (id, name, created_by, url_slug)
VALUES
	('20000000-0000-4000-8000-000000129501', 'Export Alpha', '10000000-0000-4000-8000-000000129501', 'export-alpha-1295'),
	('20000000-0000-4000-8000-000000129502', 'Export Bravo', '10000000-0000-4000-8000-000000129506', 'export-bravo-1295');

INSERT INTO public.organization_memberships (
	id, organization_id, user_id, role, member_preset, capability_overrides,
	access_scope_kind, access_scope_group_ids, email
)
SELECT
	fixture.id::uuid, fixture.org_id::uuid, fixture.user_id::uuid,
	fixture.role::public.organization_role, 'viewer', fixture.overrides::jsonb,
	'organization', ARRAY[]::uuid[], fixture.email
FROM (VALUES
	('30000000-0000-4000-8000-000000129501', '20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129501', 'member', '{}', 'export-former-owner-1295@example.test'),
	('30000000-0000-4000-8000-000000129502', '20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129502', 'owner', '{}', 'export-current-owner-1295@example.test'),
	('30000000-0000-4000-8000-000000129503', '20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129503', 'admin', '{"canManageMembers":false}', 'export-admin-1295@example.test'),
	('30000000-0000-4000-8000-000000129504', '20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129504', 'member', '{"canManageMembers":true}', 'export-delegate-1295@example.test'),
	('30000000-0000-4000-8000-000000129505', '20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129505', 'member', '{}', 'export-member-1295@example.test'),
	('30000000-0000-4000-8000-000000129506', '20000000-0000-4000-8000-000000129502', '10000000-0000-4000-8000-000000129506', 'owner', '{}', 'export-foreign-owner-1295@example.test')
) AS fixture(id, org_id, user_id, role, overrides, email);

CREATE TEMP TABLE export_ids (fixture_id uuid, actual_id uuid);
GRANT SELECT, INSERT ON export_ids TO authenticated;
CREATE FUNCTION pg_temp.export_id(p_id uuid) RETURNS uuid LANGUAGE sql AS $$
  SELECT actual_id FROM export_ids WHERE fixture_id = p_id
$$;
CREATE FUNCTION pg_temp.start_export(p_id uuid, p_org uuid, p_actor uuid) RETURNS void LANGUAGE sql AS $$
  WITH saved AS (INSERT INTO public.data_exports (org_id, requested_by) VALUES (p_org, p_actor) RETURNING id)
  INSERT INTO export_ids SELECT p_id, id FROM saved
$$;
GRANT EXECUTE ON FUNCTION pg_temp.export_id(uuid), pg_temp.start_export(uuid, uuid, uuid) TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000129502', true);

SELECT lives_ok(
	$$ SELECT pg_temp.start_export('40000000-0000-4000-8000-000000129501', '20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129502') $$,
	'current owner can start an export without being the Organization creator'
);

WITH updated AS (
	SELECT * FROM public.finish_data_export('20000000-0000-4000-8000-000000129501', pg_temp.export_id('40000000-0000-4000-8000-000000129501'), 'completed', now(), 1024)
)
SELECT ok(
	(SELECT status = 'completed' AND file_size_bytes = 1024 AND completed_at IS NOT NULL FROM updated),
	'current owner records completion, size and completion time'
);

SELECT throws_ok(
	$$ INSERT INTO public.data_exports (org_id, requested_by)
	VALUES ('20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129503') $$,
	'42501', 'new row violates row-level security policy for table "data_exports"',
	'export authority does not permit attributing an export to another user'
);

SELECT throws_ok(
	$$ INSERT INTO public.data_exports (org_id, requested_by)
	VALUES ('20000000-0000-4000-8000-000000129502', '10000000-0000-4000-8000-000000129502') $$,
	'42501', 'new row violates row-level security policy for table "data_exports"',
	'owner authority does not extend to a foreign Organization'
);

SELECT throws_ok(
	$$ UPDATE public.data_exports SET org_id = '20000000-0000-4000-8000-000000129502'
	WHERE id = pg_temp.export_id('40000000-0000-4000-8000-000000129501') $$,
	'42501', 'permission denied for table data_exports',
	'lifecycle update cannot move an export into a foreign Organization'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000129503', true);

SELECT lives_ok(
	$$ SELECT pg_temp.start_export('40000000-0000-4000-8000-000000129502', '20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129503') $$,
	'noncreator admin retains export authority even with a false member override'
);

WITH updated AS (
	SELECT * FROM public.finish_data_export('20000000-0000-4000-8000-000000129501', pg_temp.export_id('40000000-0000-4000-8000-000000129502'), 'completed', now(), 2048)
)
SELECT ok(
	(SELECT status = 'completed' AND file_size_bytes = 2048 AND completed_at IS NOT NULL FROM updated),
	'noncreator admin can complete an export'
);

SELECT lives_ok(
	$$ SELECT pg_temp.start_export('40000000-0000-4000-8000-000000129503', '20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129503') $$,
	'admin can start an export that subsequently fails'
);

WITH updated AS (
	SELECT * FROM public.finish_data_export('20000000-0000-4000-8000-000000129501', pg_temp.export_id('40000000-0000-4000-8000-000000129503'), 'failed', now())
)
SELECT ok(
	(SELECT status = 'failed' AND completed_at IS NOT NULL FROM updated),
	'admin records failure instead of leaving processing state'
);

SELECT pg_temp.start_export('40000000-0000-4000-8000-000000129504', '20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129503');

-- Feature overrides cannot confer Organization governance (ADR 0001).
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000129504', true);

SELECT throws_ok(
	$$ INSERT INTO public.data_exports (org_id, requested_by)
	VALUES ('20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129504') $$,
	'42501', 'new row violates row-level security policy for table "data_exports"',
	'noncanonical canManageMembers JSON does not grant member export authority'
);

WITH updated AS (
	SELECT * FROM public.finish_data_export('20000000-0000-4000-8000-000000129501', pg_temp.export_id('40000000-0000-4000-8000-000000129504'), 'failed', now())
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'noncanonical canManageMembers JSON cannot grant lifecycle updates');

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000129501', true);

SELECT throws_ok(
	$$ INSERT INTO public.data_exports (org_id, requested_by)
	VALUES ('20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129501') $$,
	'42501', 'new row violates row-level security policy for table "data_exports"',
	'original creator demoted to ordinary member cannot start an export'
);

SELECT is(
	(SELECT status FROM public.data_exports WHERE id = pg_temp.export_id('40000000-0000-4000-8000-000000129501')),
	'completed',
	'demoted creator retains ordinary member read access to export history'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000129505', true);

SELECT throws_ok(
	$$ INSERT INTO public.data_exports (org_id, requested_by)
	VALUES ('20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129505') $$,
	'42501', 'new row violates row-level security policy for table "data_exports"',
	'ordinary member without delegated authority cannot start an export'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000129506', true);

SELECT throws_ok(
	$$ INSERT INTO public.data_exports (org_id, requested_by)
	VALUES ('20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129506') $$,
	'42501', 'new row violates row-level security policy for table "data_exports"',
	'nonmember cannot create exports in another Organization'
);

SELECT is(
	(SELECT count(*)::integer FROM public.data_exports WHERE org_id = '20000000-0000-4000-8000-000000129501'),
	0,
	'foreign Organization export records are hidden from nonmembers'
);

WITH updated AS (
	SELECT * FROM public.finish_data_export('20000000-0000-4000-8000-000000129501', pg_temp.export_id('40000000-0000-4000-8000-000000129504'), 'failed', now())
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'nonmember cannot update a known foreign export ID');

RESET ROLE;
UPDATE public.organization_memberships
SET role = 'member'
WHERE id = '30000000-0000-4000-8000-000000129503';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000129503', true);

WITH updated AS (
	SELECT * FROM public.finish_data_export('20000000-0000-4000-8000-000000129501', pg_temp.export_id('40000000-0000-4000-8000-000000129504'), 'failed', now())
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'admin demotion prevents subsequent lifecycle updates');

SELECT throws_ok(
	$$ INSERT INTO public.data_exports (org_id, requested_by)
	VALUES ('20000000-0000-4000-8000-000000129501', '10000000-0000-4000-8000-000000129503') $$,
	'42501', 'new row violates row-level security policy for table "data_exports"',
	'admin demotion prevents new exports'
);

SELECT is(
	(SELECT status FROM public.data_exports WHERE id = pg_temp.export_id('40000000-0000-4000-8000-000000129502')),
	'completed',
	'demoted admin retains member read access and cannot alter recorded completion'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
