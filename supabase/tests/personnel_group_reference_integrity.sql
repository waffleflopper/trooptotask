-- New Personnel links are Organization-local for authenticated and privileged writes.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('d1210000-0000-4000-8000-000000000001', 'personnel-group-configure@example.test'),
  ('d1210000-0000-4000-8000-000000000002', 'personnel-group-scoped@example.test'),
  ('d1210000-0000-4000-8000-000000000003', 'personnel-group-view@example.test'),
  ('d1210000-0000-4000-8000-000000000004', 'personnel-group-empty@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('d1210000-0000-4000-8000-000000000101', 'Personnel Group Alpha', 'd1210000-0000-4000-8000-000000000001'),
  ('d1210000-0000-4000-8000-000000000102', 'Personnel Group Bravo', 'd1210000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('d1210000-0000-4000-8000-000000000201', 'd1210000-0000-4000-8000-000000000101', 'Alpha One'),
  ('d1210000-0000-4000-8000-000000000202', 'd1210000-0000-4000-8000-000000000101', 'Alpha Two'),
  ('d1210000-0000-4000-8000-000000000203', 'd1210000-0000-4000-8000-000000000102', 'Foreign Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('d1210000-0000-4000-8000-000000000101', 'd1210000-0000-4000-8000-000000000001',
   'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]),
  ('d1210000-0000-4000-8000-000000000101', 'd1210000-0000-4000-8000-000000000002',
   'member', 'viewer', '{"personnel":"operate"}',
   'groups', ARRAY['d1210000-0000-4000-8000-000000000201']::uuid[]),
  ('d1210000-0000-4000-8000-000000000101', 'd1210000-0000-4000-8000-000000000003',
   'member', 'viewer', '{"personnel":"view"}', 'organization', ARRAY[]::uuid[]),
  ('d1210000-0000-4000-8000-000000000101', 'd1210000-0000-4000-8000-000000000004',
   'member', 'viewer', '{"personnel":"configure"}', 'groups', ARRAY[]::uuid[]);
INSERT INTO public.personnel (
  id, organization_id, group_id, rank, first_name, last_name, slug, mos, clinic_role
) VALUES (
  'd1210000-0000-4000-8000-000000000301', 'd1210000-0000-4000-8000-000000000101',
  'd1210000-0000-4000-8000-000000000201', 'SGT', 'Retained', 'Person', 'personnel-group-retained', '68V', 'NCOIC'
);
CREATE TEMP TABLE personnel_group_write_before AS
  SELECT 'personnel'::text AS table_name, id AS row_id, to_jsonb(p) AS row_data
    FROM public.personnel p WHERE id = 'd1210000-0000-4000-8000-000000000301'
  UNION ALL
  SELECT 'group', id, to_jsonb(g) FROM public.groups g WHERE id IN (
    'd1210000-0000-4000-8000-000000000201', 'd1210000-0000-4000-8000-000000000202',
    'd1210000-0000-4000-8000-000000000203');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1210000-0000-4000-8000-000000000001', true);
SELECT lives_ok($$ INSERT INTO public.personnel
  (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at)
  VALUES ('d1210000-0000-4000-8000-000000000401', 'd1210000-0000-4000-8000-000000000101',
          'd1210000-0000-4000-8000-000000000201', 'SPC', 'Archived', 'Local',
          'personnel-group-local', '2026-08-01T12:00:00Z') $$,
  'same-Organization Group links remain valid for archived Personnel');
SELECT lives_ok($$ INSERT INTO public.personnel
  (id, organization_id, group_id, rank, first_name, last_name, slug)
  VALUES ('d1210000-0000-4000-8000-000000000402', 'd1210000-0000-4000-8000-000000000101',
          NULL, 'PFC', 'Unassigned', 'Local', 'personnel-group-unassigned') $$,
  'Organization-scoped members retain unassigned Personnel creation');
SELECT throws_ok($$ INSERT INTO public.personnel
  (organization_id, group_id, rank, first_name, last_name, slug)
  VALUES ('d1210000-0000-4000-8000-000000000101', 'd1210000-0000-4000-8000-000000000203',
          'SPC', 'Foreign', 'Denied', 'personnel-group-foreign-denied') $$,
  '23503', NULL, 'authenticated creation cannot use an existing foreign Group');
SELECT throws_ok($$ INSERT INTO public.personnel
  (organization_id, group_id, rank, first_name, last_name, slug)
  VALUES ('d1210000-0000-4000-8000-000000000101', 'd1210000-0000-4000-8000-000000000299',
          'SPC', 'Missing', 'Denied', 'personnel-group-missing-denied') $$,
  '23503', NULL, 'authenticated creation cannot use a nonexistent Group');
SELECT throws_ok($$ UPDATE public.personnel
  SET group_id = 'd1210000-0000-4000-8000-000000000203', last_name = 'Denied Edit'
  WHERE id = 'd1210000-0000-4000-8000-000000000301' $$,
  '23503', NULL, 'an authenticated edit cannot introduce a foreign Group link');
SELECT throws_ok($$ INSERT INTO public.personnel
  (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  ('d1210000-0000-4000-8000-000000000405', 'd1210000-0000-4000-8000-000000000101',
   'd1210000-0000-4000-8000-000000000201', 'SPC', 'Valid', 'Batch', 'personnel-group-valid-batch'),
  ('d1210000-0000-4000-8000-000000000406', 'd1210000-0000-4000-8000-000000000101',
   'd1210000-0000-4000-8000-000000000203', 'SPC', 'Foreign', 'Batch', 'personnel-group-foreign-batch') $$,
  '23503', NULL, 'a mixed multirow statement rejects its foreign Group link');
SELECT is((SELECT count(*)::integer FROM public.personnel WHERE id IN (
  'd1210000-0000-4000-8000-000000000405', 'd1210000-0000-4000-8000-000000000406')), 0,
  'a rejected multirow statement does not persist its valid prefix');

-- A same-Organization Group remains subject to the existing member scope.
SELECT set_config('request.jwt.claim.sub', 'd1210000-0000-4000-8000-000000000002', true);
SELECT throws_ok($$ UPDATE public.personnel SET group_id = 'd1210000-0000-4000-8000-000000000202'
  WHERE id = 'd1210000-0000-4000-8000-000000000301' $$,
  '42501', NULL, 'Group-scoped operators cannot move Personnel outside their assigned Group');
SELECT set_config('request.jwt.claim.sub', 'd1210000-0000-4000-8000-000000000003', true);
WITH changed AS (UPDATE public.personnel SET last_name = 'View Denied'
  WHERE id = 'd1210000-0000-4000-8000-000000000301' RETURNING id)
SELECT is(count(*)::integer, 0, 'view-only members cannot edit Personnel') FROM changed;
SELECT set_config('request.jwt.claim.sub', 'd1210000-0000-4000-8000-000000000004', true);
SELECT throws_ok($$ INSERT INTO public.personnel
  (organization_id, group_id, rank, first_name, last_name, slug)
  VALUES ('d1210000-0000-4000-8000-000000000101', 'd1210000-0000-4000-8000-000000000201',
          'SPC', 'Empty', 'Denied', 'personnel-group-empty-denied') $$,
  '42501', NULL, 'an empty Group scope cannot create Personnel even with configure');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok($$ INSERT INTO public.personnel
  (organization_id, group_id, rank, first_name, last_name, slug)
  VALUES ('d1210000-0000-4000-8000-000000000101', 'd1210000-0000-4000-8000-000000000203',
          'SPC', 'Service', 'Denied', 'personnel-group-service-denied') $$,
  '23503', NULL, 'privileged creation cannot bypass Group tenancy integrity');
SELECT throws_ok($$ UPDATE public.personnel
  SET group_id = 'd1210000-0000-4000-8000-000000000203', rank = 'SSG'
  WHERE id = 'd1210000-0000-4000-8000-000000000301' $$,
  '23503', NULL, 'privileged edits cannot introduce a foreign Group link');
SELECT throws_ok($$ UPDATE public.personnel
  SET organization_id = 'd1210000-0000-4000-8000-000000000102'
  WHERE id = 'd1210000-0000-4000-8000-000000000301' $$,
  '23503', NULL, 'privileged Personnel ownership changes cannot retain a foreign Group');
SELECT throws_ok($$ UPDATE public.groups SET organization_id = 'd1210000-0000-4000-8000-000000000102'
  WHERE id = 'd1210000-0000-4000-8000-000000000201' $$,
  '23503', NULL, 'a referenced Group cannot move to another Organization');
SELECT throws_ok($$ UPDATE public.groups SET id = 'd1210000-0000-4000-8000-000000000204'
  WHERE id = 'd1210000-0000-4000-8000-000000000201' $$,
  '23503', NULL, 'a referenced Group cannot change identity');
RESET ROLE;
SELECT results_eq(
  $$ SELECT 'personnel'::text, id, to_jsonb(p) FROM public.personnel p
       WHERE id = 'd1210000-0000-4000-8000-000000000301'
     UNION ALL SELECT 'group', id, to_jsonb(g) FROM public.groups g WHERE id IN (
       'd1210000-0000-4000-8000-000000000201', 'd1210000-0000-4000-8000-000000000202',
       'd1210000-0000-4000-8000-000000000203') ORDER BY 1, 2 $$,
  $$ SELECT table_name, row_id, row_data FROM personnel_group_write_before ORDER BY table_name, row_id $$,
  'denied Personnel edits and Group parent changes preserve every stored field');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1210000-0000-4000-8000-000000000001', true);
SELECT lives_ok($$ UPDATE public.personnel SET group_id = 'd1210000-0000-4000-8000-000000000202'
  WHERE id = 'd1210000-0000-4000-8000-000000000301' $$,
  'Organization-scoped reassignment to another local Group remains possible');
SELECT is((SELECT group_id FROM public.personnel WHERE id = 'd1210000-0000-4000-8000-000000000301'),
  'd1210000-0000-4000-8000-000000000202'::uuid, 'valid Group reassignment persists');
SELECT lives_ok($$ UPDATE public.personnel SET group_id = NULL
  WHERE id = 'd1210000-0000-4000-8000-000000000301' $$,
  'Organization-scoped explicit unassignment remains possible');
SELECT is((SELECT group_id FROM public.personnel WHERE id = 'd1210000-0000-4000-8000-000000000301'),
  NULL::uuid, 'explicit unassignment clears the Group');
SELECT lives_ok($$ SET CONSTRAINTS personnel_group_id_fkey IMMEDIATE $$,
  'all successful writes satisfy the retained global ID reference');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
