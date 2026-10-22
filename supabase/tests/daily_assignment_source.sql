-- Only the server's Fill from roster path marks an assignment as a roster pick.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT col_default_is('public', 'daily_assignments', 'source', 'manual', 'a new assignment is a hand assignment');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.fill_roster_assignment_slots(uuid,uuid,jsonb)', 'EXECUTE'), 'signed-in callers cannot run the roster fill');
SELECT ok(NOT has_function_privilege('anon',
  'public.fill_roster_assignment_slots(uuid,uuid,jsonb)', 'EXECUTE'), 'anonymous callers cannot run the roster fill');
SELECT ok(has_function_privilege('service_role',
  'public.fill_roster_assignment_slots(uuid,uuid,jsonb)', 'EXECUTE'), 'the server runs the roster fill');

INSERT INTO auth.users(id,email) VALUES
  ('b1727000-0000-4000-8000-000000000001','source-owner@example.test'),
  ('b1727000-0000-4000-8000-000000000002','source-operator@example.test'),
  ('b1727000-0000-4000-8000-000000000003','source-group-operator@example.test'),
  ('b1727000-0000-4000-8000-000000000004','source-viewer@example.test'),
  ('b1727000-0000-4000-8000-000000000005','source-foreign@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES
  ('b1727000-0000-4000-8000-000000000101','Source A','b1727000-0000-4000-8000-000000000001'),
  ('b1727000-0000-4000-8000-000000000102','Source B','b1727000-0000-4000-8000-000000000005');
INSERT INTO public.groups(id,organization_id,name) VALUES
  ('b1727000-0000-4000-8000-000000000201','b1727000-0000-4000-8000-000000000101','Alpha'),
  ('b1727000-0000-4000-8000-000000000202','b1727000-0000-4000-8000-000000000101','Bravo');
INSERT INTO public.organization_memberships(
  organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
) VALUES
  ('b1727000-0000-4000-8000-000000000101','b1727000-0000-4000-8000-000000000001','owner','editor','{}','organization',ARRAY[]::uuid[]),
  ('b1727000-0000-4000-8000-000000000101','b1727000-0000-4000-8000-000000000002','member','operator','{"calendar":"operate"}','organization',ARRAY[]::uuid[]),
  ('b1727000-0000-4000-8000-000000000101','b1727000-0000-4000-8000-000000000003','member','operator','{"calendar":"operate"}','groups',ARRAY['b1727000-0000-4000-8000-000000000201']::uuid[]),
  ('b1727000-0000-4000-8000-000000000101','b1727000-0000-4000-8000-000000000004','member','viewer','{"calendar":"view"}','organization',ARRAY[]::uuid[]),
  ('b1727000-0000-4000-8000-000000000102','b1727000-0000-4000-8000-000000000005','owner','editor','{}','organization',ARRAY[]::uuid[]);
INSERT INTO public.personnel(id,organization_id,group_id,rank,first_name,last_name,mos,slug) VALUES
  ('b1727000-0000-4000-8000-000000000301','b1727000-0000-4000-8000-000000000101','b1727000-0000-4000-8000-000000000201','SGT','Able','Source','68W','source-able'),
  ('b1727000-0000-4000-8000-000000000302','b1727000-0000-4000-8000-000000000101','b1727000-0000-4000-8000-000000000202','SGT','Baker','Source','68W','source-baker');
INSERT INTO public.assignment_types(id,organization_id,name,short_name,assign_to) VALUES
  ('b1727000-0000-4000-8000-000000000401','b1727000-0000-4000-8000-000000000101','Staff Duty','SD','personnel');
INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id) VALUES
  ('b1727000-0000-4000-8000-000000000501','b1727000-0000-4000-8000-000000000101','b1727000-0000-4000-8000-000000000401','2030-04-01','b1727000-0000-4000-8000-000000000301');

SELECT is((SELECT source FROM public.daily_assignments WHERE id = 'b1727000-0000-4000-8000-000000000501'),
  'manual', 'an assignment written without a source reads manual');
SELECT set_config('calendar.roster_write','on',true);
SELECT throws_ok($$ UPDATE public.daily_assignments SET source = 'auto' WHERE id = 'b1727000-0000-4000-8000-000000000501' $$,
  '23514', NULL, 'a source other than manual or roster is rejected');
SELECT set_config('calendar.roster_write','',true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1727000-0000-4000-8000-000000000002',true);
SELECT is((SELECT source FROM public.replace_daily_assignment_slots(
  'b1727000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-04-02","assignment_type_id":"b1727000-0000-4000-8000-000000000401","assignee_id":"b1727000-0000-4000-8000-000000000302","source":"roster"}]'::jsonb
)), 'manual', 'a batch that asks for roster still writes manual');
INSERT INTO public.daily_assignments(organization_id,assignment_type_id,date,assignee_id,source) VALUES
  ('b1727000-0000-4000-8000-000000000101','b1727000-0000-4000-8000-000000000401','2030-04-03','b1727000-0000-4000-8000-000000000301','roster');
SELECT is((SELECT source FROM public.daily_assignments
  WHERE organization_id = 'b1727000-0000-4000-8000-000000000101' AND date = '2030-04-03'),
  'manual', 'an operator''s insert that names roster still writes manual');
UPDATE public.daily_assignments SET source = 'roster' WHERE id = 'b1727000-0000-4000-8000-000000000501';
SELECT is((SELECT source FROM public.daily_assignments WHERE id = 'b1727000-0000-4000-8000-000000000501'),
  'manual', 'an operator cannot relabel a hand assignment as a roster pick');
SELECT set_config('calendar.roster_write','on',true);
UPDATE public.daily_assignments SET source = 'roster' WHERE id = 'b1727000-0000-4000-8000-000000000501';
SELECT set_config('calendar.roster_write','',true);
SELECT is((SELECT source FROM public.daily_assignments WHERE id = 'b1727000-0000-4000-8000-000000000501'),
  'manual', 'an operator who sets the roster write flag still writes manual');
SELECT lives_ok($$ INSERT INTO public.daily_assignments(organization_id,assignment_type_id,date,assignee_id) VALUES
  ('b1727000-0000-4000-8000-000000000101','b1727000-0000-4000-8000-000000000401','2030-04-04','b1727000-0000-4000-8000-000000000301') $$,
  'an operator still inserts a hand assignment directly');
SELECT throws_ok($$ SELECT * FROM public.fill_roster_assignment_slots(
  'b1727000-0000-4000-8000-000000000002','b1727000-0000-4000-8000-000000000101',
  '[{"date":"2030-04-05","assignment_type_id":"b1727000-0000-4000-8000-000000000401","assignee_id":"b1727000-0000-4000-8000-000000000301"}]'::jsonb
) $$, '42501', NULL, 'an operator cannot call the roster fill directly');

SELECT set_config('request.jwt.claim.sub','b1727000-0000-4000-8000-000000000004',true);
SELECT throws_ok($$ INSERT INTO public.daily_assignments(organization_id,assignment_type_id,date,assignee_id) VALUES
  ('b1727000-0000-4000-8000-000000000101','b1727000-0000-4000-8000-000000000401','2030-04-06','b1727000-0000-4000-8000-000000000301') $$,
  '42501', NULL, 'row security still stops a viewer from writing');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT results_eq($$ SELECT date, assignee_id, source FROM public.fill_roster_assignment_slots(
  'b1727000-0000-4000-8000-000000000002','b1727000-0000-4000-8000-000000000101',
  '[{"date":"2030-04-07","assignment_type_id":"b1727000-0000-4000-8000-000000000401","assignee_id":"b1727000-0000-4000-8000-000000000301"},
    {"date":"2030-04-08","assignment_type_id":"b1727000-0000-4000-8000-000000000401","assignee_id":"b1727000-0000-4000-8000-000000000302"}]'::jsonb
) ORDER BY date $$,
  $$ VALUES ('2030-04-07'::date, 'b1727000-0000-4000-8000-000000000301'::text, 'roster'::text),
            ('2030-04-08'::date, 'b1727000-0000-4000-8000-000000000302'::text, 'roster'::text) $$,
  'the roster fill writes open days as roster picks');
SELECT throws_ok($$ SELECT * FROM public.fill_roster_assignment_slots(
  'b1727000-0000-4000-8000-000000000002','b1727000-0000-4000-8000-000000000101',
  '[{"date":"2030-04-09","assignment_type_id":"b1727000-0000-4000-8000-000000000401","assignee_id":"b1727000-0000-4000-8000-000000000301"},
    {"date":"2030-04-01","assignment_type_id":"b1727000-0000-4000-8000-000000000401","assignee_id":"b1727000-0000-4000-8000-000000000302"}]'::jsonb
) $$, 'P0001', 'Assignment slot unavailable', 'a day that filled since the preview fails the whole fill');
SELECT throws_ok($$ SELECT * FROM public.fill_roster_assignment_slots(
  'b1727000-0000-4000-8000-000000000003','b1727000-0000-4000-8000-000000000101',
  '[{"date":"2030-04-10","assignment_type_id":"b1727000-0000-4000-8000-000000000401","assignee_id":"b1727000-0000-4000-8000-000000000302"}]'::jsonb
) $$, '42501', NULL, 'the fill keeps the actor''s Group scope');
SELECT throws_ok($$ SELECT * FROM public.fill_roster_assignment_slots(
  'b1727000-0000-4000-8000-000000000004','b1727000-0000-4000-8000-000000000101',
  '[{"date":"2030-04-10","assignment_type_id":"b1727000-0000-4000-8000-000000000401","assignee_id":"b1727000-0000-4000-8000-000000000301"}]'::jsonb
) $$, '42501', NULL, 'the fill keeps the actor''s Calendar capability');
SELECT throws_ok($$ SELECT * FROM public.fill_roster_assignment_slots(
  'b1727000-0000-4000-8000-000000000005','b1727000-0000-4000-8000-000000000101',
  '[{"date":"2030-04-10","assignment_type_id":"b1727000-0000-4000-8000-000000000401","assignee_id":"b1727000-0000-4000-8000-000000000301"}]'::jsonb
) $$, '42501', NULL, 'the fill refuses an actor from another Organization');
RESET ROLE;

SELECT results_eq($$ SELECT date, source FROM public.daily_assignments
  WHERE organization_id = 'b1727000-0000-4000-8000-000000000101' ORDER BY date $$,
  $$ VALUES ('2030-04-01'::date, 'manual'::text), ('2030-04-02'::date, 'manual'::text), ('2030-04-03'::date, 'manual'::text),
            ('2030-04-04'::date, 'manual'::text), ('2030-04-07'::date, 'roster'::text), ('2030-04-08'::date, 'roster'::text) $$,
  'refused fills and client writes left no roster pick behind');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1727000-0000-4000-8000-000000000004',true);
SELECT results_eq($$ SELECT date, source FROM public.list_roster_detail_days(
  'b1727000-0000-4000-8000-000000000101','b1727000-0000-4000-8000-000000000401','2030-04-06','2030-04-08') $$,
  $$ VALUES ('2030-04-07'::date, 'roster'::text), ('2030-04-08'::date, 'roster'::text) $$,
  'the roster read carries each day''s source');

-- A roster pick an operator edits by hand is a hand assignment, so a later re-pick leaves it alone.
SELECT set_config('request.jwt.claim.sub','b1727000-0000-4000-8000-000000000002',true);
UPDATE public.daily_assignments SET assignee_id = 'b1727000-0000-4000-8000-000000000302'
  WHERE organization_id = 'b1727000-0000-4000-8000-000000000101' AND date = '2030-04-07';
SELECT is((SELECT source FROM public.daily_assignments
  WHERE organization_id = 'b1727000-0000-4000-8000-000000000101' AND date = '2030-04-07'),
  'manual', 'an operator who changes a roster pick''s assignee in the table makes it manual');
SELECT is((SELECT source FROM public.replace_daily_assignment_slots(
  'b1727000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-04-08","assignment_type_id":"b1727000-0000-4000-8000-000000000401","assignee_id":"b1727000-0000-4000-8000-000000000301"}]'::jsonb
)), 'manual', 'an operator who changes a roster pick''s assignee through the batch makes it manual');
UPDATE public.daily_assignments SET date = '2030-04-09'
  WHERE organization_id = 'b1727000-0000-4000-8000-000000000101' AND date = '2030-04-08';
SELECT is((SELECT source FROM public.daily_assignments
  WHERE organization_id = 'b1727000-0000-4000-8000-000000000101' AND date = '2030-04-09'),
  'manual', 'an operator who moves an assignment keeps it manual');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT is((SELECT source FROM public.fill_roster_assignment_slots(
  'b1727000-0000-4000-8000-000000000002','b1727000-0000-4000-8000-000000000101',
  '[{"date":"2030-04-11","assignment_type_id":"b1727000-0000-4000-8000-000000000401","assignee_id":"b1727000-0000-4000-8000-000000000301"}]'::jsonb
)), 'roster', 'the roster path still writes roster after hand edits');
RESET ROLE;
SELECT is((SELECT source FROM public.daily_assignments
  WHERE organization_id = 'b1727000-0000-4000-8000-000000000101' AND date = '2030-04-11'),
  'roster', 'the roster flag ends with the fill');
UPDATE public.daily_assignments SET assignee_id = 'b1727000-0000-4000-8000-000000000302'
  WHERE organization_id = 'b1727000-0000-4000-8000-000000000101' AND date = '2030-04-11';
SELECT is((SELECT source FROM public.daily_assignments
  WHERE organization_id = 'b1727000-0000-4000-8000-000000000101' AND date = '2030-04-11'),
  'manual', 'a later write in the same transaction is a hand edit');

SELECT * FROM finish();
ROLLBACK;
