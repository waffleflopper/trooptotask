-- #1352: Calendar catalog configuration needs Organization scope, and saved
-- availability may reference only a status from its own Organization.
-- Run only against the isolated synthetic SQL test database.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('d5000000-0000-4000-8000-000000000001', 'calendar-group-config@example.test'),
  ('d5000000-0000-4000-8000-000000000002', 'calendar-org-operate@example.test'),
  ('d5000000-0000-4000-8000-000000000003', 'calendar-org-config@example.test'),
  ('d5000000-0000-4000-8000-000000000004', 'calendar-dual-org@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('d5000000-0000-4000-8000-000000000101', 'Calendar Catalog Alpha', 'd5000000-0000-4000-8000-000000000003'),
  ('d5000000-0000-4000-8000-000000000102', 'Calendar Catalog Bravo', 'd5000000-0000-4000-8000-000000000004');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('d5000000-0000-4000-8000-000000000201', 'd5000000-0000-4000-8000-000000000101', 'Alpha');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('d5000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000001',
   'member', 'viewer', '{"calendar":"configure","personnel":"none"}',
   'groups', ARRAY['d5000000-0000-4000-8000-000000000201']::uuid[]),
  ('d5000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000002',
   'member', 'viewer', '{"calendar":"operate","personnel":"none"}',
   'organization', ARRAY[]::uuid[]),
  ('d5000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000003',
   'member', 'viewer', '{"calendar":"configure","personnel":"none"}',
   'organization', ARRAY[]::uuid[]),
  ('d5000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000004',
   'member', 'viewer', '{"calendar":"configure","personnel":"none"}',
   'organization', ARRAY[]::uuid[]),
  ('d5000000-0000-4000-8000-000000000102', 'd5000000-0000-4000-8000-000000000004',
   'member', 'viewer', '{"calendar":"configure","personnel":"none"}',
   'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  ('d5000000-0000-4000-8000-000000000301', 'd5000000-0000-4000-8000-000000000101',
   'd5000000-0000-4000-8000-000000000201', 'SPC', 'Synthetic', 'Able', 'catalog-scope-able');
INSERT INTO public.status_types (id, organization_id, name, color, text_color) VALUES
  ('d5000000-0000-4000-8000-000000000401', 'd5000000-0000-4000-8000-000000000101', 'Alpha Status', '#2563eb', '#ffffff'),
  ('d5000000-0000-4000-8000-000000000402', 'd5000000-0000-4000-8000-000000000102', 'Bravo Status', '#dc2626', '#ffffff'),
  ('d5000000-0000-4000-8000-000000000403', 'd5000000-0000-4000-8000-000000000101', 'Alpha Editable', '#16a34a', '#ffffff');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to) VALUES
  ('d5000000-0000-4000-8000-000000000501', 'd5000000-0000-4000-8000-000000000101', 'Alpha Assignment', 'AA', 'personnel');
INSERT INTO public.special_days (id, organization_id, date, name, type) VALUES
  ('d5000000-0000-4000-8000-000000000601', 'd5000000-0000-4000-8000-000000000101',
   '2030-04-01', 'Alpha Closure', 'org-closure');
INSERT INTO public.availability_entries (
  id, organization_id, personnel_id, status_type_id, start_date, end_date
) VALUES (
  'd5000000-0000-4000-8000-000000000701', 'd5000000-0000-4000-8000-000000000101',
  'd5000000-0000-4000-8000-000000000301', 'd5000000-0000-4000-8000-000000000401',
  '2030-04-01', '2030-04-02'
);

-- Accept an integrity or authorization rejection, while surfacing unrelated
-- errors such as malformed SQL. An accepted command returns false.
CREATE FUNCTION pg_temp.reference_write_rejected(command text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE state text;
BEGIN
  EXECUTE command;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS state = RETURNED_SQLSTATE;
  IF state IN ('23503', '23514', '42501') THEN RETURN true; END IF;
  RAISE;
END;
$fn$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.status_types), 2,
  'Group-scoped Calendar configurator may read its Organization statuses');
SELECT is((SELECT count(*)::integer FROM public.assignment_types), 1,
  'Group-scoped Calendar configurator may read its Organization assignment types');
SELECT is((SELECT count(*)::integer FROM public.special_days), 1,
  'Group-scoped Calendar configurator may read its Organization special days');
SAVEPOINT group_configuration_denials;
SELECT throws_ok($$ INSERT INTO public.status_types (organization_id, name)
  VALUES ('d5000000-0000-4000-8000-000000000101', 'Denied Status') $$,
  '42501', NULL, 'Group-scoped configure cannot create a status');
WITH changed AS (UPDATE public.status_types SET name = 'Denied Edit'
  WHERE id = 'd5000000-0000-4000-8000-000000000403' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group-scoped configure cannot edit a status') FROM changed;
WITH removed AS (DELETE FROM public.status_types
  WHERE id = 'd5000000-0000-4000-8000-000000000403' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group-scoped configure cannot delete a status') FROM removed;
SELECT throws_ok($$ INSERT INTO public.assignment_types (organization_id, name, short_name, assign_to)
  VALUES ('d5000000-0000-4000-8000-000000000101', 'Denied Assignment', 'DA', 'personnel') $$,
  '42501', NULL, 'Group-scoped configure cannot create an assignment type');
WITH changed AS (UPDATE public.assignment_types SET name = 'Denied Edit'
  WHERE id = 'd5000000-0000-4000-8000-000000000501' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group-scoped configure cannot edit an assignment type') FROM changed;
WITH removed AS (DELETE FROM public.assignment_types
  WHERE id = 'd5000000-0000-4000-8000-000000000501' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group-scoped configure cannot delete an assignment type') FROM removed;
SELECT throws_ok($$ INSERT INTO public.special_days (organization_id, date, name, type)
  VALUES ('d5000000-0000-4000-8000-000000000101', '2030-04-03', 'Denied Closure', 'org-closure') $$,
  '42501', NULL, 'Group-scoped configure cannot create a special day');
WITH changed AS (UPDATE public.special_days SET name = 'Denied Edit'
  WHERE id = 'd5000000-0000-4000-8000-000000000601' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group-scoped configure cannot edit a special day') FROM changed;
WITH removed AS (DELETE FROM public.special_days
  WHERE id = 'd5000000-0000-4000-8000-000000000601' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group-scoped configure cannot delete a special day') FROM removed;
ROLLBACK TO SAVEPOINT group_configuration_denials;
RELEASE SAVEPOINT group_configuration_denials;

SELECT set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000002', true);
SAVEPOINT operate_configuration_denials;
SELECT throws_ok($$ INSERT INTO public.status_types (organization_id, name)
  VALUES ('d5000000-0000-4000-8000-000000000101', 'Operator Status') $$,
  '42501', NULL, 'Organization-scoped operate cannot create a status');
SELECT throws_ok($$ INSERT INTO public.assignment_types (organization_id, name, short_name, assign_to)
  VALUES ('d5000000-0000-4000-8000-000000000101', 'Operator Assignment', 'OA', 'personnel') $$,
  '42501', NULL, 'Organization-scoped operate cannot create an assignment type');
SELECT throws_ok($$ INSERT INTO public.special_days (organization_id, date, name, type)
  VALUES ('d5000000-0000-4000-8000-000000000101', '2030-04-04', 'Operator Closure', 'org-closure') $$,
  '42501', NULL, 'Organization-scoped operate cannot create a special day');
WITH changed AS (UPDATE public.special_days SET name = 'Operator Edit'
  WHERE id = 'd5000000-0000-4000-8000-000000000601' RETURNING id)
SELECT is(count(*)::integer, 0, 'Organization-scoped operate cannot edit a special day') FROM changed;
WITH removed AS (DELETE FROM public.special_days
  WHERE id = 'd5000000-0000-4000-8000-000000000601' RETURNING id)
SELECT is(count(*)::integer, 0, 'Organization-scoped operate cannot delete a special day') FROM removed;
ROLLBACK TO SAVEPOINT operate_configuration_denials;
RELEASE SAVEPOINT operate_configuration_denials;

SELECT set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.status_types
  WHERE organization_id = 'd5000000-0000-4000-8000-000000000102'), 0,
  'Organization configurator cannot read foreign statuses');
SELECT lives_ok($$ INSERT INTO public.status_types (id, organization_id, name)
  VALUES ('d5000000-0000-4000-8000-000000000411', 'd5000000-0000-4000-8000-000000000101', 'New Status') $$,
  'Organization configurator can create a status');
SELECT lives_ok($$ INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to)
  VALUES ('d5000000-0000-4000-8000-000000000511', 'd5000000-0000-4000-8000-000000000101', 'New Assignment', 'NA', 'personnel') $$,
  'Organization configurator can create an assignment type');
SELECT lives_ok($$ INSERT INTO public.special_days (id, organization_id, date, name, type)
  VALUES ('d5000000-0000-4000-8000-000000000611', 'd5000000-0000-4000-8000-000000000101',
          '2030-04-05', 'New Closure', 'org-closure') $$,
  'Organization configurator can create a special day');
WITH changed AS (UPDATE public.status_types SET name = 'Edited Status'
  WHERE id = 'd5000000-0000-4000-8000-000000000411' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization configurator can edit a status') FROM changed;
WITH changed AS (UPDATE public.assignment_types SET name = 'Edited Assignment'
  WHERE id = 'd5000000-0000-4000-8000-000000000511' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization configurator can edit an assignment type') FROM changed;
WITH changed AS (UPDATE public.special_days SET name = 'Edited Closure'
  WHERE id = 'd5000000-0000-4000-8000-000000000611' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization configurator can edit a special day') FROM changed;
SELECT is((SELECT name FROM public.status_types WHERE id = 'd5000000-0000-4000-8000-000000000411'),
  'Edited Status', 'status edit persists before explicit deletion');
SELECT is((SELECT name FROM public.assignment_types WHERE id = 'd5000000-0000-4000-8000-000000000511'),
  'Edited Assignment', 'assignment type edit persists before explicit deletion');
SELECT is((SELECT name FROM public.special_days WHERE id = 'd5000000-0000-4000-8000-000000000611'),
  'Edited Closure', 'special day edit persists before explicit deletion');
WITH removed AS (DELETE FROM public.status_types
  WHERE id = 'd5000000-0000-4000-8000-000000000411' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization configurator can delete a status') FROM removed;
WITH removed AS (DELETE FROM public.assignment_types
  WHERE id = 'd5000000-0000-4000-8000-000000000511' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization configurator can delete an assignment type') FROM removed;
WITH removed AS (DELETE FROM public.special_days
  WHERE id = 'd5000000-0000-4000-8000-000000000611' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization configurator can delete a special day') FROM removed;

-- A dual-Organization actor can see both statuses; access to the foreign
-- catalog must not make it a valid reference for Alpha availability.
SELECT set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000004', true);
SELECT is((SELECT count(*)::integer FROM public.status_types
  WHERE id IN ('d5000000-0000-4000-8000-000000000401', 'd5000000-0000-4000-8000-000000000402')),
  2, 'dual-Organization actor can read both statuses');
SAVEPOINT foreign_status_denials;
SELECT ok(pg_temp.reference_write_rejected($$ INSERT INTO public.availability_entries
  (id, organization_id, personnel_id, status_type_id, start_date, end_date)
  VALUES ('d5000000-0000-4000-8000-000000000703', 'd5000000-0000-4000-8000-000000000101',
          'd5000000-0000-4000-8000-000000000301', 'd5000000-0000-4000-8000-000000000402',
          '2030-04-03', '2030-04-03') $$),
  'availability cannot be created with a foreign Organization status');
SELECT is((SELECT count(*)::integer FROM public.availability_entries
  WHERE id = 'd5000000-0000-4000-8000-000000000703'), 0,
  'rejected foreign status insert saves no availability row');
SELECT lives_ok($$ INSERT INTO public.availability_entries
  (id, organization_id, personnel_id, status_type_id, start_date, end_date)
  VALUES ('d5000000-0000-4000-8000-000000000704', 'd5000000-0000-4000-8000-000000000101',
          'd5000000-0000-4000-8000-000000000301', 'd5000000-0000-4000-8000-000000000401',
          '2030-04-04', '2030-04-04') $$,
  'same-Organization status remains usable');
SELECT is((SELECT status_type_id FROM public.availability_entries
  WHERE id = 'd5000000-0000-4000-8000-000000000704'),
  'd5000000-0000-4000-8000-000000000401'::uuid,
  'allowed availability retains its same-Organization status');
SELECT ok(pg_temp.reference_write_rejected($$ UPDATE public.availability_entries
  SET status_type_id = 'd5000000-0000-4000-8000-000000000402'
  WHERE id = 'd5000000-0000-4000-8000-000000000704' $$),
  'availability status cannot be changed to a foreign Organization');
SELECT is((SELECT status_type_id FROM public.availability_entries
  WHERE id = 'd5000000-0000-4000-8000-000000000704'),
  'd5000000-0000-4000-8000-000000000401'::uuid,
  'rejected foreign status update retains the saved status');
ROLLBACK TO SAVEPOINT foreign_status_denials;
RELEASE SAVEPOINT foreign_status_denials;

RESET ROLE;
SELECT is((SELECT status_type_id FROM public.availability_entries
  WHERE id = 'd5000000-0000-4000-8000-000000000701'),
  'd5000000-0000-4000-8000-000000000401'::uuid,
  'catalog denial attempts leave the original saved availability intact');
SELECT is((SELECT name FROM public.special_days
  WHERE id = 'd5000000-0000-4000-8000-000000000601'),
  'Alpha Closure', 'catalog denial attempts leave the original closure intact');
SELECT * FROM finish();
ROLLBACK;
