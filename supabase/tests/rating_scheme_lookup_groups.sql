BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a5d0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

INSERT INTO auth.users (id, email)
SELECT pg_temp.id(n), 'rating-lookup-group-' || n || '@example.test'
FROM generate_series(1, 4) n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id(101), 'Rating lookup Groups', pg_temp.id(1)),
  (pg_temp.id(102), 'Foreign Organization', pg_temp.id(1));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.id(201), pg_temp.id(101), 'Platoon');
INSERT INTO public.groups (id, organization_id, parent_id, name) VALUES
  (pg_temp.id(202), pg_temp.id(101), pg_temp.id(201), 'First Squad'),
  (pg_temp.id(203), pg_temp.id(101), pg_temp.id(201), 'Second Squad');
INSERT INTO public.groups (id, organization_id, parent_id, name) VALUES
  (pg_temp.id(204), pg_temp.id(101), pg_temp.id(202), 'Alpha Team'),
  (pg_temp.id(205), pg_temp.id(101), pg_temp.id(202), 'Bravo Team');
INSERT INTO public.organization_memberships
  (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids)
VALUES
  (pg_temp.id(101), pg_temp.id(1), 'owner', 'viewer', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(2), 'member', 'viewer', '{"ratingScheme":"view","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(3), 'member', 'viewer', '{"ratingScheme":"view","personnel":"none"}', 'groups', ARRAY[pg_temp.id(202)]),
  (pg_temp.id(101), pg_temp.id(4), 'member', 'viewer', '{"ratingScheme":"none","personnel":"view"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug)
VALUES
  (pg_temp.id(301), pg_temp.id(101), pg_temp.id(201), 'SFC', 'Pat', 'Platoon', 'rating-lookup-platoon'),
  (pg_temp.id(302), pg_temp.id(101), pg_temp.id(202), 'SSG', 'Sam', 'Squad', 'rating-lookup-squad'),
  (pg_temp.id(303), pg_temp.id(101), pg_temp.id(204), 'SGT', 'Alex', 'Alpha', 'rating-lookup-alpha'),
  (pg_temp.id(304), pg_temp.id(101), pg_temp.id(205), 'SPC', 'Bea', 'Bravo', 'rating-lookup-bravo'),
  (pg_temp.id(305), pg_temp.id(101), pg_temp.id(203), 'SSG', 'Sid', 'Sibling', 'rating-lookup-sibling'),
  (pg_temp.id(306), pg_temp.id(101), NULL, 'PFC', 'Una', 'Unassigned', 'rating-lookup-unassigned'),
  (pg_temp.id(307), pg_temp.id(101), pg_temp.id(204), 'SGT', 'Art', 'Archived', 'rating-lookup-archived'),
  (pg_temp.id(308), pg_temp.id(102), NULL, 'PFC', 'Fran', 'Foreign', 'rating-lookup-foreign');
UPDATE public.personnel SET archived_at = '2026-01-01' WHERE id = pg_temp.id(307);

SET LOCAL ROLE authenticated;
SELECT is(current_user::text, 'authenticated', 'lookup contracts run as an ordinary signed-in role');
SELECT ok(has_function_privilege('authenticated', 'public.list_rating_scheme_personnel_lookup(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.list_rating_scheme_personnel_lookup(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.list_rating_scheme_personnel_lookup(uuid)', 'EXECUTE'),
  'lookup keeps its original authenticated and service grants and denies anonymous calls');

SELECT set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0,
  'Rating-only Organization reader has no Personnel lane access');
SELECT results_eq(
  $$SELECT id, group_id FROM public.list_rating_scheme_personnel_lookup(pg_temp.id(101)) ORDER BY id$$,
  $$VALUES
    (pg_temp.id(301), pg_temp.id(201)),
    (pg_temp.id(302), pg_temp.id(202)),
    (pg_temp.id(303), pg_temp.id(204)),
    (pg_temp.id(304), pg_temp.id(205)),
    (pg_temp.id(305), pg_temp.id(203)),
    (pg_temp.id(306), NULL::uuid)$$,
  'Organization reader receives each active Person with their own Group id, including Unassigned');
SELECT is((SELECT count(*)::integer FROM public.list_rating_scheme_personnel_lookup(pg_temp.id(102))), 0,
  'Organization reader receives no foreign Organization references');

SELECT set_config('request.jwt.claim.sub', pg_temp.id(3)::text, true);
SELECT results_eq(
  $$SELECT id, group_id FROM public.list_rating_scheme_personnel_lookup(pg_temp.id(101)) ORDER BY id$$,
  $$VALUES
    (pg_temp.id(302), pg_temp.id(202)),
    (pg_temp.id(303), pg_temp.id(204)),
    (pg_temp.id(304), pg_temp.id(205))$$,
  'squad reader receives only squad HQ and both teams with each Person own Group id');

SELECT set_config('request.jwt.claim.sub', pg_temp.id(4)::text, true);
SELECT is((SELECT count(*)::integer FROM public.list_rating_scheme_personnel_lookup(pg_temp.id(101))), 0,
  'Personnel access without Rating Scheme view grants no references');

SELECT * FROM finish();
ROLLBACK;
