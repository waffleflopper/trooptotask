-- Rating Scheme lane alone can read its references, with strict Group scope.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT ok(NOT has_function_privilege('authenticated', 'public.rating_scheme_personnel_group_scope_matches(uuid,uuid)', 'EXECUTE'),
  'strict scope helper is not a callable authenticated RPC');
SELECT ok(has_function_privilege('authenticated', 'public.list_rating_scheme_personnel_lookup(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.can_view_rating_scheme_record(uuid,uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.can_edit_rating_scheme_record(uuid,uuid)', 'EXECUTE'),
  'existing Rating Scheme RPC grants remain available');
SELECT ok(NOT has_function_privilege('anon', 'public.list_rating_scheme_personnel_lookup(uuid)', 'EXECUTE'),
  'anonymous lookup remains unavailable');

INSERT INTO auth.users (id, email)
SELECT ('a9000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'rating-scope-' || n || '@example.test'
FROM generate_series(1, 8) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('a9000000-0000-4000-8000-000000000101', 'Rating Alpha', 'a9000000-0000-4000-8000-000000000006'),
  ('a9000000-0000-4000-8000-000000000102', 'Rating Foreign', 'a9000000-0000-4000-8000-000000000008');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('a9000000-0000-4000-8000-000000000201', 'a9000000-0000-4000-8000-000000000101', 'Alpha'),
  ('a9000000-0000-4000-8000-000000000202', 'a9000000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000001', 'member', 'viewer', '{"ratingScheme":"view","personnel":"none"}', 'groups', ARRAY['a9000000-0000-4000-8000-000000000201']::uuid[]),
  ('a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000002', 'member', 'viewer', '{"ratingScheme":"operate","personnel":"none"}', 'groups', ARRAY['a9000000-0000-4000-8000-000000000201']::uuid[]),
  ('a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000003', 'member', 'viewer', '{"ratingScheme":"operate","personnel":"none"}', 'groups', ARRAY[]::uuid[]),
  ('a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000004', 'member', 'viewer', '{"ratingScheme":"operate","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  ('a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000005', 'member', 'viewer', '{"ratingScheme":"none","personnel":"view"}', 'groups', ARRAY['a9000000-0000-4000-8000-000000000201']::uuid[]),
  ('a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000006', 'owner', 'viewer', '{}', 'groups', ARRAY[]::uuid[]),
  ('a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000007', 'admin', 'viewer', '{}', 'groups', ARRAY[]::uuid[]),
  ('a9000000-0000-4000-8000-000000000102', 'a9000000-0000-4000-8000-000000000008', 'owner', 'viewer', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('a9000000-0000-4000-8000-000000000301', 'a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000201', 'SPC', 'One', 'Able', 'rating-alpha-active', NULL),
  ('a9000000-0000-4000-8000-000000000302', 'a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000201', 'SGT', 'Two', 'Abel', 'rating-alpha-archived', '2029-01-01'),
  ('a9000000-0000-4000-8000-000000000303', 'a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000202', 'SSG', 'Three', 'Baker', 'rating-bravo-active', NULL),
  ('a9000000-0000-4000-8000-000000000304', 'a9000000-0000-4000-8000-000000000101', NULL, 'PFC', 'Four', 'Unassigned', 'rating-unassigned-active', NULL),
  ('a9000000-0000-4000-8000-000000000305', 'a9000000-0000-4000-8000-000000000101', NULL, 'CPL', 'Five', 'Zed', 'rating-unassigned-archived', '2029-01-01'),
  ('a9000000-0000-4000-8000-000000000306', 'a9000000-0000-4000-8000-000000000102', NULL, 'SPC', 'Six', 'Foreign', 'rating-foreign-active', NULL);
INSERT INTO public.rating_scheme_entries
  (id, organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end, notes) VALUES
  ('a9000000-0000-4000-8000-000000000401', 'a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000301', 'NCOER', '2029-01-01', '2029-12-31', 'assigned'),
  ('a9000000-0000-4000-8000-000000000402', 'a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000302', 'NCOER', '2029-01-01', '2029-12-31', 'archived'),
  ('a9000000-0000-4000-8000-000000000403', 'a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000303', 'NCOER', '2029-01-01', '2029-12-31', 'other group'),
  ('a9000000-0000-4000-8000-000000000404', 'a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000304', 'NCOER', '2029-01-01', '2029-12-31', 'unassigned'),
  ('a9000000-0000-4000-8000-000000000405', 'a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000305', 'NCOER', '2029-01-01', '2029-12-31', 'unassigned archived'),
  ('a9000000-0000-4000-8000-000000000406', 'a9000000-0000-4000-8000-000000000102', 'a9000000-0000-4000-8000-000000000306', 'NCOER', '2029-01-01', '2029-12-31', 'foreign');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'Rating-only viewer cannot SELECT Personnel');
SELECT is((SELECT string_agg(id::text, ',' ORDER BY last_name, first_name)
           FROM public.list_rating_scheme_personnel_lookup('a9000000-0000-4000-8000-000000000101')),
  'a9000000-0000-4000-8000-000000000301', 'Group lookup returns only active in-Group Person');
SELECT is((SELECT count(*)::integer FROM public.list_rating_scheme_personnel_lookup('a9000000-0000-4000-8000-000000000102')),
  0, 'Group lookup excludes foreign Organization');
SELECT is((SELECT string_agg(id::text, ',' ORDER BY id) FROM public.rating_scheme_entries),
  'a9000000-0000-4000-8000-000000000401,a9000000-0000-4000-8000-000000000402',
  'Group viewer reads only assigned active and archived Rating Scheme records');
SELECT ok(NOT public.can_view_rating_scheme_record('a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000304'),
  'Group viewer cannot call record helper on unassigned Person');
SELECT ok(NOT public.can_edit_rating_scheme_record('a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000301'),
  'view capability cannot edit an in-Group record');

SELECT set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000002', true);
WITH changed AS (UPDATE public.rating_scheme_entries SET notes = 'edited archived'
  WHERE id = 'a9000000-0000-4000-8000-000000000402' RETURNING id)
SELECT is(count(*)::integer, 1, 'Group operator can update archived in-Group record') FROM changed;
WITH changed AS (UPDATE public.rating_scheme_entries SET notes = 'denied'
  WHERE id IN ('a9000000-0000-4000-8000-000000000403', 'a9000000-0000-4000-8000-000000000404', 'a9000000-0000-4000-8000-000000000405') RETURNING id)
SELECT is(count(*)::integer, 0, 'Group operator cannot update other Group or unassigned records') FROM changed;
SELECT throws_ok($$ INSERT INTO public.rating_scheme_entries
  (organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end)
  VALUES ('a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000304', 'NCOER', '2030-01-01', '2030-12-31') $$,
  '42501', NULL, 'Group operator cannot create unassigned Rating Scheme record');
SELECT ok(NOT public.can_edit_rating_scheme_record('a9000000-0000-4000-8000-000000000102', 'a9000000-0000-4000-8000-000000000306'),
  'record helper rejects foreign Organization');

SELECT set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.list_rating_scheme_personnel_lookup('a9000000-0000-4000-8000-000000000101')),
  0, 'empty Group scope cannot look up unassigned Person');
SELECT is((SELECT count(*)::integer FROM public.rating_scheme_entries),
  0, 'empty Group scope cannot read saved unassigned records');
SELECT ok(NOT public.can_edit_rating_scheme_record('a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000305'),
  'empty Group scope cannot edit archived unassigned record');

SELECT set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000004', true);
SELECT is((SELECT string_agg(id::text, ',' ORDER BY last_name, first_name)
           FROM public.list_rating_scheme_personnel_lookup('a9000000-0000-4000-8000-000000000101')),
  'a9000000-0000-4000-8000-000000000301,a9000000-0000-4000-8000-000000000303,a9000000-0000-4000-8000-000000000304',
  'Organization-wide lookup keeps active assigned and unassigned order');
SELECT is((SELECT count(*)::integer FROM public.rating_scheme_entries), 5,
  'Organization-wide operator sees saved active and archived records');
WITH changed AS (UPDATE public.rating_scheme_entries SET notes = 'org edited'
  WHERE id = 'a9000000-0000-4000-8000-000000000405' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization-wide operator can update archived unassigned record') FROM changed;

SELECT set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000005', true);
SELECT is((SELECT count(*)::integer FROM public.list_rating_scheme_personnel_lookup('a9000000-0000-4000-8000-000000000101')),
  0, 'Personnel lane does not grant Rating Scheme lookup');
SELECT is((SELECT count(*)::integer FROM public.rating_scheme_entries), 0,
  'Personnel lane does not grant Rating Scheme record access');

SELECT set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000006', true);
SELECT ok(public.can_edit_rating_scheme_record('a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000305'),
  'owner with empty Group list retains archived unassigned record access');
SELECT is((SELECT count(*)::integer FROM public.list_rating_scheme_personnel_lookup('a9000000-0000-4000-8000-000000000101')),
  3, 'owner with empty Group list retains all active references');
SELECT set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000007', true);
SELECT ok(public.can_edit_rating_scheme_record('a9000000-0000-4000-8000-000000000101', 'a9000000-0000-4000-8000-000000000304'),
  'admin with empty Group list retains unassigned record access');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.rating_scheme_entries), 0, 'anonymous reads no records');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
