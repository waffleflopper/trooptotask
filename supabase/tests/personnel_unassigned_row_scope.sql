-- Personnel Group scope covers assigned active and archived rows, never the
-- Organization-wide unassigned rows, even when the member has no Groups.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('d6000000-0000-4000-8000-000000000001', 'personnel-scope-group@example.test'),
  ('d6000000-0000-4000-8000-000000000002', 'personnel-scope-empty@example.test'),
  ('d6000000-0000-4000-8000-000000000003', 'personnel-scope-org@example.test'),
  ('d6000000-0000-4000-8000-000000000004', 'personnel-scope-none@example.test'),
  ('d6000000-0000-4000-8000-000000000005', 'personnel-scope-viewer@example.test'),
  ('d6000000-0000-4000-8000-000000000006', 'personnel-scope-owner@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('d6000000-0000-4000-8000-000000000101', 'Personnel Scope A', 'd6000000-0000-4000-8000-000000000001'),
  ('d6000000-0000-4000-8000-000000000102', 'Personnel Scope B', 'd6000000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('d6000000-0000-4000-8000-000000000201', 'd6000000-0000-4000-8000-000000000101', 'Alpha'),
  ('d6000000-0000-4000-8000-000000000202', 'd6000000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('d6000000-0000-4000-8000-000000000101', 'd6000000-0000-4000-8000-000000000001', 'member', 'viewer', '{"personnel":"operate"}', 'groups', ARRAY['d6000000-0000-4000-8000-000000000201']::uuid[]),
  ('d6000000-0000-4000-8000-000000000101', 'd6000000-0000-4000-8000-000000000002', 'member', 'viewer', '{"personnel":"operate"}', 'groups', ARRAY[]::uuid[]),
  ('d6000000-0000-4000-8000-000000000101', 'd6000000-0000-4000-8000-000000000003', 'member', 'viewer', '{"personnel":"operate"}', 'organization', ARRAY[]::uuid[]),
  ('d6000000-0000-4000-8000-000000000101', 'd6000000-0000-4000-8000-000000000004', 'member', 'viewer', '{"personnel":"none"}', 'groups', ARRAY['d6000000-0000-4000-8000-000000000201']::uuid[]),
  ('d6000000-0000-4000-8000-000000000101', 'd6000000-0000-4000-8000-000000000005', 'member', 'viewer', '{"personnel":"view"}', 'groups', ARRAY['d6000000-0000-4000-8000-000000000201']::uuid[]),
  ('d6000000-0000-4000-8000-000000000101', 'd6000000-0000-4000-8000-000000000006', 'owner', 'viewer', '{}', 'groups', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('d6000000-0000-4000-8000-000000000301', 'd6000000-0000-4000-8000-000000000101', 'd6000000-0000-4000-8000-000000000201', 'SPC', 'Alpha', 'Active', 'personnel-scope-alpha-active', NULL),
  ('d6000000-0000-4000-8000-000000000302', 'd6000000-0000-4000-8000-000000000101', 'd6000000-0000-4000-8000-000000000201', 'SPC', 'Alpha', 'Archived', 'personnel-scope-alpha-archived', '2029-01-01'),
  ('d6000000-0000-4000-8000-000000000303', 'd6000000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Active', 'personnel-scope-unassigned-active', NULL),
  ('d6000000-0000-4000-8000-000000000304', 'd6000000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Archived', 'personnel-scope-unassigned-archived', '2029-01-01'),
  ('d6000000-0000-4000-8000-000000000305', 'd6000000-0000-4000-8000-000000000101', 'd6000000-0000-4000-8000-000000000202', 'SPC', 'Bravo', 'Active', 'personnel-scope-bravo-active', NULL),
  ('d6000000-0000-4000-8000-000000000306', 'd6000000-0000-4000-8000-000000000102', NULL, 'SPC', 'Foreign', 'Active', 'personnel-scope-foreign-active', NULL);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd6000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT string_agg(id::text, ',' ORDER BY id) FROM public.personnel),
  'd6000000-0000-4000-8000-000000000301,d6000000-0000-4000-8000-000000000302',
  'Group member reads only in-Group active and archived Personnel');
SAVEPOINT denied_group_writes;
WITH changed AS (UPDATE public.personnel SET first_name = 'Changed' WHERE id = 'd6000000-0000-4000-8000-000000000303' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group member cannot update unassigned Person') FROM changed;
WITH removed AS (DELETE FROM public.personnel WHERE id = 'd6000000-0000-4000-8000-000000000304' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group member cannot delete archived unassigned Person') FROM removed;
SELECT throws_ok($$ INSERT INTO public.personnel (organization_id, rank, first_name, last_name, slug)
  VALUES ('d6000000-0000-4000-8000-000000000101', 'SPC', 'New', 'Unassigned', 'personnel-scope-new-unassigned') $$,
  '42501', NULL, 'Group member cannot create unassigned Person');
SELECT throws_ok($$ UPDATE public.personnel SET group_id = NULL
  WHERE id = 'd6000000-0000-4000-8000-000000000301' $$,
  '42501', NULL, 'Group member cannot move assigned Person into unassigned scope');
ROLLBACK TO SAVEPOINT denied_group_writes;
WITH changed AS (UPDATE public.personnel SET first_name = 'Edited' WHERE id = 'd6000000-0000-4000-8000-000000000302' RETURNING id)
SELECT is(count(*)::integer, 1, 'Group member can edit archived in-Group Person') FROM changed;
SELECT lives_ok($$ INSERT INTO public.personnel (organization_id, group_id, rank, first_name, last_name, slug)
  VALUES ('d6000000-0000-4000-8000-000000000101', 'd6000000-0000-4000-8000-000000000201', 'SPC', 'New', 'Alpha', 'personnel-scope-new-alpha') $$,
  'Group member can create assigned in-Group Person');
WITH removed AS (DELETE FROM public.personnel WHERE slug = 'personnel-scope-new-alpha' RETURNING id)
SELECT is(count(*)::integer, 1, 'Group member can delete in-Group Person') FROM removed;

SELECT set_config('request.jwt.claim.sub', 'd6000000-0000-4000-8000-000000000005', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 2, 'Group viewer reads in-Group active and archived Personnel');
WITH changed AS (UPDATE public.personnel SET first_name = 'Denied' WHERE id = 'd6000000-0000-4000-8000-000000000301' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group viewer cannot edit in-Group Person') FROM changed;

SELECT set_config('request.jwt.claim.sub', 'd6000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'empty Group scope reads no Personnel');
SAVEPOINT denied_empty_group_write;
SELECT throws_ok($$ INSERT INTO public.personnel (organization_id, rank, first_name, last_name, slug)
  VALUES ('d6000000-0000-4000-8000-000000000101', 'SPC', 'Empty', 'Scope', 'personnel-scope-empty-new') $$,
  '42501', NULL, 'empty Group scope cannot create unassigned Person');
ROLLBACK TO SAVEPOINT denied_empty_group_write;

SELECT set_config('request.jwt.claim.sub', 'd6000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.personnel WHERE organization_id = 'd6000000-0000-4000-8000-000000000101'),
  5, 'Organization-scoped member reads all local assigned and unassigned Personnel');
SELECT is((SELECT count(*)::integer FROM public.personnel WHERE organization_id = 'd6000000-0000-4000-8000-000000000102'),
  0, 'Organization-scoped member cannot read foreign Organization');
WITH changed AS (UPDATE public.personnel SET first_name = 'Edited' WHERE id = 'd6000000-0000-4000-8000-000000000304' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization-scoped member can edit archived unassigned Person') FROM changed;
SELECT lives_ok($$ INSERT INTO public.personnel (organization_id, rank, first_name, last_name, slug)
  VALUES ('d6000000-0000-4000-8000-000000000101', 'SPC', 'New', 'Organization', 'personnel-scope-org-new') $$,
  'Organization-scoped member can create unassigned Person');
SELECT throws_ok($$ INSERT INTO public.personnel (organization_id, rank, first_name, last_name, slug)
  VALUES ('d6000000-0000-4000-8000-000000000102', 'SPC', 'New', 'Foreign', 'personnel-scope-foreign-new') $$,
  '42501', NULL, 'Organization-scoped member cannot create foreign Person');

SELECT set_config('request.jwt.claim.sub', 'd6000000-0000-4000-8000-000000000006', true);
SELECT is((SELECT count(*)::integer FROM public.personnel WHERE group_id IS NULL), 3,
  'owner retains Organization-wide unassigned reads with an empty Group list');

SELECT set_config('request.jwt.claim.sub', 'd6000000-0000-4000-8000-000000000004', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'member without Personnel capability reads no Personnel');
SELECT * FROM finish();
ROLLBACK;
