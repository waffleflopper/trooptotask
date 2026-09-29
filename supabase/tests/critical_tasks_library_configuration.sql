-- #1358: a Critical Tasks configurator can manage only its Organization's
-- library, while weaker or Group-scoped grants cannot change definitions.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('e8000000-0000-4000-8000-000000000001', 'ict-config@example.test'),
  ('e8000000-0000-4000-8000-000000000002', 'ict-group-config@example.test'),
  ('e8000000-0000-4000-8000-000000000003', 'ict-operator@example.test'),
  ('e8000000-0000-4000-8000-000000000004', 'ict-training-only@example.test'),
  ('e8000000-0000-4000-8000-000000000005', 'ict-foreign-config@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e8000000-0000-4000-8000-000000000101', 'ICT Config Alpha', 'e8000000-0000-4000-8000-000000000001'),
  ('e8000000-0000-4000-8000-000000000102', 'ICT Config Bravo', 'e8000000-0000-4000-8000-000000000005');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('e8000000-0000-4000-8000-000000000201', 'e8000000-0000-4000-8000-000000000101', 'Alpha');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000001',
   'member', 'viewer', '{"criticalTasks":"configure"}', 'organization', ARRAY[]::uuid[]),
  ('e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000002',
   'member', 'viewer', '{"criticalTasks":"configure"}', 'groups', ARRAY['e8000000-0000-4000-8000-000000000201']::uuid[]),
  ('e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000003',
   'member', 'viewer', '{"criticalTasks":"operate"}', 'organization', ARRAY[]::uuid[]),
  ('e8000000-0000-4000-8000-000000000101', 'e8000000-0000-4000-8000-000000000004',
   'member', 'viewer', '{"criticalTasks":"none","training":"configure"}', 'organization', ARRAY[]::uuid[]),
  ('e8000000-0000-4000-8000-000000000102', 'e8000000-0000-4000-8000-000000000005',
   'member', 'viewer', '{"criticalTasks":"configure"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.ict_tasks (id, organization_id, task_code, title) VALUES
  ('e8000000-0000-4000-8000-000000000301', 'e8000000-0000-4000-8000-000000000101', 'ALPHA-EXISTING', 'Alpha existing'),
  ('e8000000-0000-4000-8000-000000000302', 'e8000000-0000-4000-8000-000000000102', 'BRAVO-EXISTING', 'Bravo existing');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000001', true);
SELECT lives_ok($$ INSERT INTO public.ict_tasks (id, organization_id, task_code, title)
  VALUES ('e8000000-0000-4000-8000-000000000311', 'e8000000-0000-4000-8000-000000000101',
          'ALPHA-NEW', 'Alpha new') $$,
  'Organization-scoped Critical Tasks configure member can create a task');
WITH changed AS (UPDATE public.ict_tasks SET title = 'Alpha edited', archived_at = now()
  WHERE id = 'e8000000-0000-4000-8000-000000000311' RETURNING id)
SELECT is(count(*)::integer, 1, 'configure member can edit and archive its task') FROM changed;
SELECT is((SELECT title FROM public.ict_tasks WHERE id = 'e8000000-0000-4000-8000-000000000311'),
  'Alpha edited', 'saved task edit reads back');
SELECT lives_ok($$ SELECT public.set_critical_tasks_defaults(
  'e8000000-0000-4000-8000-000000000101', 18, 45) $$,
  'Organization-scoped configurator can save Critical Tasks defaults');
SELECT is((SELECT critical_tasks_default_expiration_months FROM public.organizations
  WHERE id = 'e8000000-0000-4000-8000-000000000101'), 18,
  'new Critical Tasks expiration persists');
SELECT is((SELECT critical_tasks_expiring_soon_warning_days FROM public.organizations
  WHERE id = 'e8000000-0000-4000-8000-000000000101'), 45,
  'new warning window persists');
SELECT throws_ok($$ SELECT public.set_critical_tasks_defaults(
  'e8000000-0000-4000-8000-000000000101', 121, 45) $$,
  '22023', NULL, 'RPC enforces expiration range');
SELECT throws_ok($$ SELECT public.set_critical_tasks_defaults(
  'e8000000-0000-4000-8000-000000000101', 18, 366) $$,
  '22023', NULL, 'RPC enforces warning range');
SELECT lives_ok($$ SELECT public.set_critical_tasks_defaults(
  'e8000000-0000-4000-8000-000000000101', NULL, NULL) $$,
  'null restores both documented defaults');
WITH changed AS (UPDATE public.organizations SET archive_retention_months = 1
  WHERE id = 'e8000000-0000-4000-8000-000000000101' RETURNING id)
SELECT is(count(*)::integer, 0, 'Critical Tasks configure cannot update unrelated Organization settings') FROM changed;
SELECT is((SELECT count(*)::integer FROM public.ict_tasks
  WHERE id = 'e8000000-0000-4000-8000-000000000302'), 0,
  'Alpha configurator cannot read a foreign task');
SELECT throws_ok($$ INSERT INTO public.ict_tasks (organization_id, task_code, title)
  VALUES ('e8000000-0000-4000-8000-000000000102', 'CROSS-ORG', 'Cross org') $$,
  '42501', NULL, 'Alpha configurator cannot create in Bravo');
WITH changed AS (UPDATE public.ict_tasks SET title = 'Cross org edit'
  WHERE id = 'e8000000-0000-4000-8000-000000000302' RETURNING id)
SELECT is(count(*)::integer, 0, 'Alpha configurator cannot edit Bravo task') FROM changed;
WITH removed AS (DELETE FROM public.ict_tasks
  WHERE id = 'e8000000-0000-4000-8000-000000000311' RETURNING id)
SELECT is(count(*)::integer, 0, 'configure does not gain task deletion') FROM removed;

SELECT set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000002', true);
SELECT throws_ok($$ INSERT INTO public.ict_tasks (organization_id, task_code, title)
  VALUES ('e8000000-0000-4000-8000-000000000101', 'GROUP-DENIED', 'Group denied') $$,
  '42501', NULL, 'Group-scoped configure cannot create an Organization task');
SELECT throws_ok($$ SELECT public.set_critical_tasks_defaults(
  'e8000000-0000-4000-8000-000000000101', 18, 45) $$,
  '42501', NULL, 'Group-scoped configure cannot change Organization defaults');
WITH changed AS (UPDATE public.ict_tasks SET title = 'Group edit'
  WHERE id = 'e8000000-0000-4000-8000-000000000301' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group-scoped configure cannot edit a task') FROM changed;

SELECT set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000003', true);
SELECT throws_ok($$ INSERT INTO public.ict_tasks (organization_id, task_code, title)
  VALUES ('e8000000-0000-4000-8000-000000000101', 'OPERATE-DENIED', 'Operate denied') $$,
  '42501', NULL, 'Critical Tasks operate cannot configure the library');
SELECT throws_ok($$ SELECT public.set_critical_tasks_defaults(
  'e8000000-0000-4000-8000-000000000101', 18, 45) $$,
  '42501', NULL, 'Critical Tasks operate cannot change defaults');

SELECT set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000004', true);
SELECT throws_ok($$ INSERT INTO public.ict_tasks (organization_id, task_code, title)
  VALUES ('e8000000-0000-4000-8000-000000000101', 'TRAINING-DENIED', 'Training denied') $$,
  '42501', NULL, 'Training configure does not grant Critical Tasks configuration');
SELECT throws_ok($$ SELECT public.set_critical_tasks_defaults(
  'e8000000-0000-4000-8000-000000000101', 18, 45) $$,
  '42501', NULL, 'Training configure cannot change Critical Tasks defaults');

SELECT set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000005', true);
SELECT lives_ok($$ INSERT INTO public.ict_tasks (id, organization_id, task_code, title)
  VALUES ('e8000000-0000-4000-8000-000000000312', 'e8000000-0000-4000-8000-000000000102',
          'BRAVO-NEW', 'Bravo new') $$,
  'Bravo configurator can create only in Bravo');
SELECT is((SELECT count(*)::integer FROM public.ict_tasks
  WHERE id = 'e8000000-0000-4000-8000-000000000311'), 0,
  'Bravo configurator cannot read Alpha task');
SELECT throws_ok($$ INSERT INTO public.ict_tasks (organization_id, task_code, title)
  VALUES ('e8000000-0000-4000-8000-000000000101', 'BRAVO-CROSS', 'Bravo cross') $$,
  '42501', NULL, 'Bravo configurator cannot create in Alpha');
SELECT throws_ok($$ SELECT public.set_critical_tasks_defaults(
  'e8000000-0000-4000-8000-000000000101', 18, 45) $$,
  '42501', NULL, 'Bravo configurator cannot change Alpha defaults');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
