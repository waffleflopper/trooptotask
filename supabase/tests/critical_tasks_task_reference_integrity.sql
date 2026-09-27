-- New completion writes cannot point at another Organization's ICT task.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT ok(EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname = 'ict_tasks_organization_id_id_key' AND contype = 'u'
), 'ICT tasks expose the Organization and task key for composite references');
SELECT is((SELECT convalidated FROM pg_constraint WHERE conname = 'personnel_ict_completions_org_task_fkey'),
          false, 'new Organization/task FK preserves unknown historical rows');

INSERT INTO auth.users (id, email) VALUES
  ('c9000000-0000-4000-8000-000000000001', 'critical-task-write@example.test'),
  ('c9000000-0000-4000-8000-000000000002', 'critical-task-view@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('c9000000-0000-4000-8000-000000000101', 'Task Write Alpha', 'c9000000-0000-4000-8000-000000000001'),
  ('c9000000-0000-4000-8000-000000000102', 'Task Write Bravo', 'c9000000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('c9000000-0000-4000-8000-000000000201', 'c9000000-0000-4000-8000-000000000101', 'Alpha One'),
  ('c9000000-0000-4000-8000-000000000202', 'c9000000-0000-4000-8000-000000000101', 'Alpha Two');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000001',
   'member', 'viewer', '{"criticalTasks":"operate","personnel":"none"}',
   'groups', ARRAY['c9000000-0000-4000-8000-000000000201']::uuid[]),
  ('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000002',
   'member', 'viewer', '{"criticalTasks":"view","personnel":"none"}',
   'groups', ARRAY['c9000000-0000-4000-8000-000000000201']::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  ('c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000201', 'SGT', 'Own', 'Group', 'task-write-own'),
  ('c9000000-0000-4000-8000-000000000302', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000202', 'SGT', 'Other', 'Group', 'task-write-other');
INSERT INTO public.ict_tasks (id, organization_id, task_code, title, archived_at) VALUES
  ('c9000000-0000-4000-8000-000000000401', 'c9000000-0000-4000-8000-000000000101', 'A-001', 'Own active task', NULL),
  ('c9000000-0000-4000-8000-000000000402', 'c9000000-0000-4000-8000-000000000101', 'A-002', 'Own archived task', '2026-01-01'),
  ('c9000000-0000-4000-8000-000000000403', 'c9000000-0000-4000-8000-000000000102', 'B-001', 'Foreign task', NULL);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c9000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'Critical Tasks-only operator cannot SELECT Personnel');
SELECT lives_ok($$ INSERT INTO public.personnel_ict_completions
  (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method)
  VALUES ('c9000000-0000-4000-8000-000000000501', 'c9000000-0000-4000-8000-000000000101',
          'c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000401',
          '2026-06-01', 'Practical Exercise') $$,
  'Group operator can write an active task in the same Organization');
SELECT lives_ok($$ INSERT INTO public.personnel_ict_completions
  (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method)
  VALUES ('c9000000-0000-4000-8000-000000000502', 'c9000000-0000-4000-8000-000000000101',
          'c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000402',
          '2026-06-02', 'Practical Exercise') $$,
  'historical completion can still reference an archived same-Organization task');
SELECT throws_ok($$ INSERT INTO public.personnel_ict_completions
  (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method)
  VALUES ('c9000000-0000-4000-8000-000000000503', 'c9000000-0000-4000-8000-000000000101',
          'c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000403',
          '2026-06-03', 'Practical Exercise') $$,
  '23503', NULL, 'known task from another Organization is rejected');
SELECT throws_ok($$ UPDATE public.personnel_ict_completions
  SET ict_task_id = 'c9000000-0000-4000-8000-000000000403'
  WHERE id = 'c9000000-0000-4000-8000-000000000501' $$,
  '23503', NULL, 'task reference cannot move to another Organization');
SELECT is((SELECT ict_task_id FROM public.personnel_ict_completions
           WHERE id = 'c9000000-0000-4000-8000-000000000501'),
          'c9000000-0000-4000-8000-000000000401'::uuid,
          'denied move leaves the original task reference');
SELECT lives_ok($$ UPDATE public.personnel_ict_completions SET notes = 'retained history'
  WHERE id = 'c9000000-0000-4000-8000-000000000502' $$,
  'the FK does not prohibit updates to archived-task history');
SELECT throws_ok($$ INSERT INTO public.personnel_ict_completions
  (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method)
  VALUES ('c9000000-0000-4000-8000-000000000504', 'c9000000-0000-4000-8000-000000000101',
          'c9000000-0000-4000-8000-000000000302', 'c9000000-0000-4000-8000-000000000401',
          '2026-06-04', 'Practical Exercise') $$,
  '42501', NULL, 'out-of-Group Personnel still cannot receive a completion');

SELECT set_config('request.jwt.claim.sub', 'c9000000-0000-4000-8000-000000000002', true);
SELECT throws_ok($$ INSERT INTO public.personnel_ict_completions
  (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method)
  VALUES ('c9000000-0000-4000-8000-000000000505', 'c9000000-0000-4000-8000-000000000101',
          'c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000401',
          '2026-06-05', 'Practical Exercise') $$,
  '42501', NULL, 'Critical Tasks view-only member still cannot write');

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$ INSERT INTO public.personnel_ict_completions
  (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method)
  VALUES ('c9000000-0000-4000-8000-000000000506', 'c9000000-0000-4000-8000-000000000101',
          'c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000403',
          '2026-06-06', 'Practical Exercise') $$,
  '23503', NULL, 'service role cannot bypass task tenancy integrity');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
