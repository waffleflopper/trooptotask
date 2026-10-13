-- #1383 / #1642: owners, admins and Organization-scoped lane viewers read the
-- full same-Organization Group catalog; a Group-scoped member reads only the
-- Groups in its scope, and an empty scope reads none. Only Organization-wide
-- Personnel configurers write Groups.
-- Run only against the isolated synthetic SQL test database.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email)
SELECT ('e1383000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'group-catalog-' || n || '@example.test' FROM generate_series(1, 11) n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e1383000-0000-4000-8000-000000000101', 'Group Catalog Alpha', 'e1383000-0000-4000-8000-000000000001'),
  ('e1383000-0000-4000-8000-000000000102', 'Group Catalog Bravo', 'e1383000-0000-4000-8000-000000000011');
INSERT INTO public.groups (id, organization_id, name, sort_order) VALUES
  ('e1383000-0000-4000-8000-000000000201', 'e1383000-0000-4000-8000-000000000101', 'Alpha One', 1),
  ('e1383000-0000-4000-8000-000000000202', 'e1383000-0000-4000-8000-000000000101', 'Alpha Two', 2),
  ('e1383000-0000-4000-8000-000000000203', 'e1383000-0000-4000-8000-000000000102', 'Bravo One', 1);
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('e1383000-0000-4000-8000-000000000101', 'e1383000-0000-4000-8000-000000000001',
   'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  ('e1383000-0000-4000-8000-000000000101', 'e1383000-0000-4000-8000-000000000002',
   'admin', 'editor', '{}', 'groups', ARRAY['e1383000-0000-4000-8000-000000000201']::uuid[]),
  ('e1383000-0000-4000-8000-000000000101', 'e1383000-0000-4000-8000-000000000003',
   'member', 'viewer',
   '{"calendar":"none","personnel":"none","training":"view","criticalTasks":"none","onboarding":"none","ratingScheme":"none"}',
   'organization', ARRAY[]::uuid[]),
  ('e1383000-0000-4000-8000-000000000101', 'e1383000-0000-4000-8000-000000000004',
   'member', 'viewer', '{}', 'groups', ARRAY['e1383000-0000-4000-8000-000000000201']::uuid[]),
  ('e1383000-0000-4000-8000-000000000101', 'e1383000-0000-4000-8000-000000000005',
   'member', 'viewer', '{}', 'groups', ARRAY[]::uuid[]),
  ('e1383000-0000-4000-8000-000000000101', 'e1383000-0000-4000-8000-000000000006',
   'member', 'viewer', '{"personnel":"configure"}', 'groups',
   ARRAY['e1383000-0000-4000-8000-000000000201']::uuid[]),
  ('e1383000-0000-4000-8000-000000000101', 'e1383000-0000-4000-8000-000000000007',
   'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]),
  ('e1383000-0000-4000-8000-000000000101', 'e1383000-0000-4000-8000-000000000008',
   'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[]),
  ('e1383000-0000-4000-8000-000000000101', 'e1383000-0000-4000-8000-000000000009',
   'member', 'viewer',
   '{"calendar":"none","personnel":"none","training":"none","criticalTasks":"none","onboarding":"none","ratingScheme":"none"}',
   'organization', ARRAY[]::uuid[]),
  ('e1383000-0000-4000-8000-000000000101', 'e1383000-0000-4000-8000-000000000010',
   'member', 'viewer', '{"personnel":"operate"}', 'organization', ARRAY[]::uuid[]),
  ('e1383000-0000-4000-8000-000000000102', 'e1383000-0000-4000-8000-000000000011',
   'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.user_suspensions (user_id, suspended_by, reason) VALUES
  ('e1383000-0000-4000-8000-000000000008', 'e1383000-0000-4000-8000-000000000001', 'Synthetic suspension');

CREATE TEMP TABLE group_rows_before ON COMMIT DROP AS
  SELECT to_jsonb(g) AS row_data FROM public.groups g WHERE id::text LIKE 'e1383000-%';

CREATE FUNCTION pg_temp.visible_group_names() RETURNS text[]
LANGUAGE sql SECURITY INVOKER AS $fn$
  SELECT coalesce(array_agg(name ORDER BY name), ARRAY[]::text[])
  FROM public.groups WHERE id::text LIKE 'e1383000-%';
$fn$;

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', 'e1383000-0000-4000-8000-000000000001', true);
SELECT is(pg_temp.visible_group_names(), ARRAY['Alpha One', 'Alpha Two'],
  'an owner reads the full same-Organization Group catalog and no foreign Group');

SELECT set_config('request.jwt.claim.sub', 'e1383000-0000-4000-8000-000000000002', true);
SELECT is(pg_temp.visible_group_names(), ARRAY['Alpha One', 'Alpha Two'],
  'an admin reads the full catalog even with a stored Group scope');

SELECT set_config('request.jwt.claim.sub', 'e1383000-0000-4000-8000-000000000003', true);
SELECT is(pg_temp.visible_group_names(), ARRAY['Alpha One', 'Alpha Two'],
  'an Organization-scoped Training-only viewer reads the full catalog without Personnel access');

SELECT set_config('request.jwt.claim.sub', 'e1383000-0000-4000-8000-000000000004', true);
SELECT is(pg_temp.visible_group_names(), ARRAY['Alpha One'],
  'a Group-scoped viewer reads only its allowed Group');
SELECT is((SELECT count(*)::integer FROM public.groups WHERE id = 'e1383000-0000-4000-8000-000000000202'), 0,
  'a Group-scoped viewer cannot read an out-of-scope Group by ID');

SELECT set_config('request.jwt.claim.sub', 'e1383000-0000-4000-8000-000000000005', true);
SELECT is(pg_temp.visible_group_names(), ARRAY[]::text[],
  'an empty Group scope reads no Groups');

SELECT set_config('request.jwt.claim.sub', 'e1383000-0000-4000-8000-000000000008', true);
SELECT is(pg_temp.visible_group_names(), ARRAY[]::text[],
  'a suspended account reads no Groups');

SELECT set_config('request.jwt.claim.sub', 'e1383000-0000-4000-8000-000000000009', true);
SELECT is(pg_temp.visible_group_names(), ARRAY[]::text[],
  'a member without view in any lane reads no Groups');

SELECT set_config('request.jwt.claim.sub', 'e1383000-0000-4000-8000-000000000006', true);
SELECT is(pg_temp.visible_group_names(), ARRAY['Alpha One'],
  'a Group-scoped Personnel configurer reads only its allowed Group');
SELECT throws_ok($$ INSERT INTO public.groups (organization_id, name)
  VALUES ('e1383000-0000-4000-8000-000000000101', 'Scoped Created') $$,
  '42501', NULL, 'a Group-scoped Personnel configurer cannot create a Group');
WITH changed AS (UPDATE public.groups SET name = 'Scoped Renamed'
  WHERE id = 'e1383000-0000-4000-8000-000000000201' RETURNING id)
SELECT is(count(*)::integer, 0, 'a Group-scoped Personnel configurer cannot rename its allowed Group') FROM changed;
WITH changed AS (UPDATE public.groups SET name = 'Scoped Hidden Renamed'
  WHERE id = 'e1383000-0000-4000-8000-000000000202' RETURNING id)
SELECT is(count(*)::integer, 0, 'a Group-scoped Personnel configurer cannot rename an out-of-scope Group') FROM changed;
WITH removed AS (DELETE FROM public.groups
  WHERE id IN ('e1383000-0000-4000-8000-000000000201', 'e1383000-0000-4000-8000-000000000202') RETURNING id)
SELECT is(count(*)::integer, 0, 'a Group-scoped Personnel configurer cannot delete any Group') FROM removed;

SELECT set_config('request.jwt.claim.sub', 'e1383000-0000-4000-8000-000000000010', true);
SELECT throws_ok($$ INSERT INTO public.groups (organization_id, name)
  VALUES ('e1383000-0000-4000-8000-000000000101', 'Operator Created') $$,
  '42501', NULL, 'an Organization-scoped Personnel operator cannot create a Group');
WITH changed AS (UPDATE public.groups SET name = 'Operator Renamed'
  WHERE id = 'e1383000-0000-4000-8000-000000000201' RETURNING id)
SELECT is(count(*)::integer, 0, 'an Organization-scoped Personnel operator cannot rename a Group') FROM changed;

SELECT set_config('request.jwt.claim.sub', 'e1383000-0000-4000-8000-000000000007', true);
SELECT throws_ok($$ INSERT INTO public.groups (organization_id, name)
  VALUES ('e1383000-0000-4000-8000-000000000102', 'Foreign Created') $$,
  '42501', NULL, 'an Organization-wide Personnel configurer cannot create a foreign Group');
WITH changed AS (UPDATE public.groups SET name = 'Foreign Renamed'
  WHERE id = 'e1383000-0000-4000-8000-000000000203' RETURNING id)
SELECT is(count(*)::integer, 0, 'an Organization-wide Personnel configurer cannot rename a foreign Group') FROM changed;

RESET ROLE;
SELECT results_eq(
  $$ SELECT to_jsonb(g) FROM public.groups g WHERE id::text LIKE 'e1383000-%' ORDER BY id $$,
  $$ SELECT row_data FROM group_rows_before ORDER BY row_data->>'id' $$,
  'denied Group writes leave every saved Group unchanged');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e1383000-0000-4000-8000-000000000007', true);

SELECT is(pg_temp.visible_group_names(), ARRAY['Alpha One', 'Alpha Two'],
  'an Organization-wide Personnel configurer reads the full catalog');
SELECT lives_ok($$ INSERT INTO public.groups (id, organization_id, name)
  VALUES ('e1383000-0000-4000-8000-000000000204', 'e1383000-0000-4000-8000-000000000101', 'Alpha Three') $$,
  'an Organization-wide Personnel configurer can create a Group');
WITH changed AS (UPDATE public.groups SET name = 'Alpha Renamed'
  WHERE id = 'e1383000-0000-4000-8000-000000000204' RETURNING id)
SELECT is(count(*)::integer, 1, 'an Organization-wide Personnel configurer can rename a Group') FROM changed;
WITH removed AS (DELETE FROM public.groups
  WHERE id = 'e1383000-0000-4000-8000-000000000204' RETURNING id)
SELECT is(count(*)::integer, 1, 'an Organization-wide Personnel configurer can delete a Group') FROM removed;

SELECT * FROM finish();
ROLLBACK;
