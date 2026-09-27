-- Calendar-only members may read and change only assigned Personnel in their Group.
-- Unassigned Personnel belong to Organization-wide Calendar scope, never an empty Group scope.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok(NOT has_function_privilege('authenticated', 'public.calendar_personnel_group_scope_matches(uuid,uuid)', 'EXECUTE'),
  'Calendar scope helper is private to policy functions');
SELECT ok(to_regprocedure('public.can_view_daily_assignment_record(uuid,text)') IS NULL
    AND to_regprocedure('public.can_edit_daily_assignment_record(uuid,text)') IS NULL,
  'unused two-argument assignment helpers no longer expose the old scope');
SELECT ok(has_function_privilege('authenticated', 'public.can_view_availability_record(uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.can_edit_availability_record(uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.can_view_daily_assignment_record(uuid,uuid,text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.can_edit_daily_assignment_record(uuid,uuid,text)', 'EXECUTE'),
  'four retained Calendar policy function grants survive');

INSERT INTO auth.users (id, email) VALUES
  ('d4000000-0000-4000-8000-000000000001', 'calendar-lane-group@example.test'),
  ('d4000000-0000-4000-8000-000000000002', 'calendar-lane-empty@example.test'),
  ('d4000000-0000-4000-8000-000000000003', 'calendar-lane-org@example.test'),
  ('d4000000-0000-4000-8000-000000000004', 'calendar-lane-none@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('d4000000-0000-4000-8000-000000000101', 'Calendar Lane A', 'd4000000-0000-4000-8000-000000000001'),
  ('d4000000-0000-4000-8000-000000000102', 'Calendar Lane B', 'd4000000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('d4000000-0000-4000-8000-000000000201', 'd4000000-0000-4000-8000-000000000101', 'Alpha'),
  ('d4000000-0000-4000-8000-000000000202', 'd4000000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('d4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000001', 'member', 'viewer', '{"calendar":"operate","personnel":"none"}', 'groups', ARRAY['d4000000-0000-4000-8000-000000000201']::uuid[]),
  ('d4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000002', 'member', 'viewer', '{"calendar":"operate","personnel":"none"}', 'groups', ARRAY[]::uuid[]),
  ('d4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000003', 'member', 'viewer', '{"calendar":"operate","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  ('d4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000004', 'member', 'viewer', '{"calendar":"none","personnel":"none"}', 'groups', ARRAY['d4000000-0000-4000-8000-000000000201']::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  ('d4000000-0000-4000-8000-000000000301', 'd4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000201', 'SPC', 'Alpha', 'Assigned', 'calendar-lane-alpha'),
  ('d4000000-0000-4000-8000-000000000302', 'd4000000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Person', 'calendar-lane-unassigned'),
  ('d4000000-0000-4000-8000-000000000303', 'd4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000202', 'SPC', 'Bravo', 'Assigned', 'calendar-lane-bravo'),
  ('d4000000-0000-4000-8000-000000000304', 'd4000000-0000-4000-8000-000000000102', NULL, 'SPC', 'Foreign', 'Person', 'calendar-lane-foreign');
INSERT INTO public.status_types (id, organization_id, name, color, text_color) VALUES
  ('d4000000-0000-4000-8000-000000000401', 'd4000000-0000-4000-8000-000000000101', 'Available', '#ffffff', '#000000'),
  ('d4000000-0000-4000-8000-000000000402', 'd4000000-0000-4000-8000-000000000102', 'Available', '#ffffff', '#000000');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to) VALUES
  ('d4000000-0000-4000-8000-000000000403', 'd4000000-0000-4000-8000-000000000101', 'Duty', 'D', 'personnel'),
  ('d4000000-0000-4000-8000-000000000404', 'd4000000-0000-4000-8000-000000000102', 'Duty', 'D', 'personnel');
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date) VALUES
  ('d4000000-0000-4000-8000-000000000501', 'd4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000301', 'd4000000-0000-4000-8000-000000000401', '2030-01-01', '2030-01-02'),
  ('d4000000-0000-4000-8000-000000000502', 'd4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000302', 'd4000000-0000-4000-8000-000000000401', '2030-01-01', '2030-01-02'),
  ('d4000000-0000-4000-8000-000000000503', 'd4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000303', 'd4000000-0000-4000-8000-000000000401', '2030-01-01', '2030-01-02'),
  ('d4000000-0000-4000-8000-000000000504', 'd4000000-0000-4000-8000-000000000102', 'd4000000-0000-4000-8000-000000000304', 'd4000000-0000-4000-8000-000000000402', '2030-01-01', '2030-01-02');
INSERT INTO public.daily_assignments (id, organization_id, assignment_type_id, date, assignee_id) VALUES
  ('d4000000-0000-4000-8000-000000000601', 'd4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000403', '2030-01-01', 'd4000000-0000-4000-8000-000000000301'),
  ('d4000000-0000-4000-8000-000000000602', 'd4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000403', '2030-01-02', 'd4000000-0000-4000-8000-000000000302'),
  ('d4000000-0000-4000-8000-000000000603', 'd4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000403', '2030-01-03', 'd4000000-0000-4000-8000-000000000303'),
  ('d4000000-0000-4000-8000-000000000604', 'd4000000-0000-4000-8000-000000000102', 'd4000000-0000-4000-8000-000000000404', '2030-01-01', 'd4000000-0000-4000-8000-000000000304');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd4000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'Calendar-only member cannot SELECT Personnel');
SELECT is((SELECT string_agg(id::text, ',' ORDER BY id) FROM public.availability_entries),
  'd4000000-0000-4000-8000-000000000501', 'Group member reads only Alpha availability');
SELECT is((SELECT string_agg(id::text, ',' ORDER BY id) FROM public.daily_assignments),
  'd4000000-0000-4000-8000-000000000601', 'Group member reads only Alpha person assignment');
SAVEPOINT denied_group_writes;
WITH changed AS (UPDATE public.availability_entries SET end_date = '2030-01-04' WHERE id = 'd4000000-0000-4000-8000-000000000502' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group member cannot edit unassigned availability') FROM changed;
WITH changed AS (UPDATE public.daily_assignments SET date = '2030-01-04' WHERE id = 'd4000000-0000-4000-8000-000000000602' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group member cannot edit unassigned person assignment') FROM changed;
WITH removed AS (DELETE FROM public.availability_entries WHERE id = 'd4000000-0000-4000-8000-000000000502' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group member cannot delete unassigned availability') FROM removed;
WITH removed AS (DELETE FROM public.daily_assignments WHERE id = 'd4000000-0000-4000-8000-000000000602' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group member cannot delete unassigned assignment') FROM removed;
SELECT throws_ok($$ INSERT INTO public.availability_entries (organization_id, personnel_id, status_type_id, start_date, end_date)
  VALUES ('d4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000302', 'd4000000-0000-4000-8000-000000000401', '2030-02-01', '2030-02-02') $$,
  '42501', NULL, 'Group member cannot create unassigned availability');
SELECT throws_ok($$ INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id)
  VALUES ('d4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000403', '2030-02-01', 'd4000000-0000-4000-8000-000000000302') $$,
  '42501', NULL, 'Group member cannot create unassigned assignment');
ROLLBACK TO SAVEPOINT denied_group_writes;

SELECT set_config('request.jwt.claim.sub', 'd4000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.availability_entries), 0, 'empty Group scope reads no availability');
SELECT is((SELECT count(*)::integer FROM public.daily_assignments), 0, 'empty Group scope reads no assignment');
SAVEPOINT denied_empty_group_write;
SELECT throws_ok($$ INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id)
  VALUES ('d4000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000403', '2030-02-03', 'd4000000-0000-4000-8000-000000000302') $$,
  '42501', NULL, 'empty Group scope cannot create unassigned assignment');
ROLLBACK TO SAVEPOINT denied_empty_group_write;

SELECT set_config('request.jwt.claim.sub', 'd4000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.availability_entries), 3, 'Organization-scoped Calendar sees assigned and unassigned availability');
SELECT is((SELECT count(*)::integer FROM public.daily_assignments), 3, 'Organization-scoped Calendar sees assigned and unassigned assignments');
SELECT lives_ok($$ UPDATE public.availability_entries SET end_date = '2030-01-05' WHERE id = 'd4000000-0000-4000-8000-000000000502' $$,
  'Organization-scoped Calendar can edit unassigned availability');
SELECT lives_ok($$ UPDATE public.daily_assignments SET date = '2030-01-05' WHERE id = 'd4000000-0000-4000-8000-000000000602' $$,
  'Organization-scoped Calendar can edit unassigned assignment');

SELECT set_config('request.jwt.claim.sub', 'd4000000-0000-4000-8000-000000000004', true);
SELECT is((SELECT count(*)::integer FROM public.availability_entries), 0, 'member without Calendar cannot read availability');
SELECT is((SELECT count(*)::integer FROM public.daily_assignments), 0, 'member without Calendar cannot read assignments');
RESET ROLE;
SELECT is((SELECT end_date FROM public.availability_entries WHERE id = 'd4000000-0000-4000-8000-000000000502'),
  '2030-01-05'::date, 'allowed Organization-wide availability change persists');
SELECT is((SELECT date FROM public.daily_assignments WHERE id = 'd4000000-0000-4000-8000-000000000602'),
  '2030-01-05'::date, 'allowed Organization-wide assignment change persists');
SELECT * FROM finish();
ROLLBACK;
