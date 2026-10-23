-- Typed starting numbers: only the server's roster path writes them, for an
-- Organization-wide Calendar configurator, until the first detail on the form
-- is served. Re-picks stay roster picks and hand-assigned days stay put.
-- Run only against the isolated synthetic SQL test database.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('d2261022-0007-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.n(person text) RETURNS integer LANGUAGE sql AS $$
  SELECT right(person::text, 12)::integer;
$$;
CREATE FUNCTION pg_temp.today() RETURNS date LANGUAGE sql AS $$
  SELECT (now() AT TIME ZONE 'UTC')::date;
$$;
CREATE FUNCTION pg_temp.open_form(type_id integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.roster_forms WHERE assignment_type_id = pg_temp.id(type_id) AND ends_on IS NULL;
$$;
CREATE FUNCTION pg_temp.save_sql(actor integer, type_id integer, form_id uuid, today date, numbers jsonb, repicks jsonb)
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT * FROM public.set_roster_starting_numbers(%L, %L, %L, %L, %L, %L, %L)',
    pg_temp.id(actor), pg_temp.id(101), pg_temp.id(type_id), form_id, today, numbers, repicks);
$$;
CREATE FUNCTION pg_temp.number(person integer, count integer, track text DEFAULT 'all') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('personnel_id', pg_temp.id(person), 'track', track, 'count', count);
$$;
CREATE FUNCTION pg_temp.repick(day integer, assignee integer, was integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('date', pg_temp.today() + day, 'assignee_id', pg_temp.id(assignee), 'was', pg_temp.id(was)::text);
$$;
CREATE FUNCTION pg_temp.starting_numbers(type_id integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(pg_temp.n(s.personnel_id::text), s.track, s.count, s.origin)
    ORDER BY s.personnel_id, s.track), '[]')
  FROM public.roster_starting_numbers s WHERE s.form_id = pg_temp.open_form(type_id);
$$;
CREATE FUNCTION pg_temp.days(type_id integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(a.date - pg_temp.today(), pg_temp.n(a.assignee_id), a.source)
    ORDER BY a.date), '[]')
  FROM public.daily_assignments a WHERE a.assignment_type_id = pg_temp.id(type_id);
$$;

INSERT INTO auth.users (id, email)
SELECT pg_temp.id(n), 'roster-starting-numbers-' || n || '@example.test' FROM generate_series(1, 5) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id(101), 'Numbers Alpha', pg_temp.id(1)),
  (pg_temp.id(102), 'Numbers Bravo', pg_temp.id(4));
INSERT INTO public.groups (id, organization_id, name) VALUES (pg_temp.id(501), pg_temp.id(101), 'Numbers Platoon');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id(101), pg_temp.id(1), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(2), 'member', 'viewer', '{"calendar":"configure","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(3), 'member', 'operator', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(102), pg_temp.id(4), 'member', 'viewer', '{"calendar":"configure","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(5), 'member', 'viewer', '{"calendar":"configure","personnel":"none"}', 'groups', ARRAY[pg_temp.id(501)]);
INSERT INTO public.personnel (id, organization_id, rank, mos, first_name, last_name, slug) VALUES
  (pg_temp.id(301), pg_temp.id(101), 'SGT', '68W', 'Numbers', 'Able', 'starting-numbers-able'),
  (pg_temp.id(302), pg_temp.id(101), 'SPC', '68W', 'Numbers', 'Baker', 'starting-numbers-baker'),
  (pg_temp.id(303), pg_temp.id(101), 'PFC', '68W', 'Numbers', 'Charlie', 'starting-numbers-charlie'),
  (pg_temp.id(311), pg_temp.id(102), 'SPC', '68W', 'Numbers', 'Bravo', 'starting-numbers-bravo');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to) VALUES
  (pg_temp.id(401), pg_temp.id(101), 'Staff Duty', 'SD', 'personnel'),
  (pg_temp.id(402), pg_temp.id(101), 'Charge of Quarters', 'CQ', 'personnel');

-- Charge of Quarters carried its numbers from the last form.
SELECT set_config('trooptotask.roster_close', 'on', true);
INSERT INTO public.roster_starting_numbers (organization_id, form_id, personnel_id, track, count, origin) VALUES
  (pg_temp.id(101), pg_temp.open_form(402), pg_temp.id(301), 'all', 6, 'carried');
SELECT set_config('trooptotask.roster_close', '', true);
-- Staff Duty planned tomorrow and the day after from the roster; the third day is a hand assignment.
SELECT set_config('calendar.roster_write', 'on', true);
INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id, source) VALUES
  (pg_temp.id(101), pg_temp.id(401), pg_temp.today() + 1, pg_temp.id(301), 'roster'),
  (pg_temp.id(101), pg_temp.id(401), pg_temp.today() + 2, pg_temp.id(302), 'roster'),
  (pg_temp.id(101), pg_temp.id(401), pg_temp.today() + 3, pg_temp.id(303), 'manual');
SELECT set_config('calendar.roster_write', '', true);

SELECT ok(NOT has_function_privilege('authenticated',
  'public.set_roster_starting_numbers(uuid,uuid,uuid,uuid,date,jsonb,jsonb)', 'EXECUTE'),
  'signed-in callers cannot save starting numbers directly');
SELECT ok(NOT has_function_privilege('anon',
  'public.set_roster_starting_numbers(uuid,uuid,uuid,uuid,date,jsonb,jsonb)', 'EXECUTE'),
  'anonymous callers cannot save starting numbers');
SELECT ok(has_function_privilege('service_role',
  'public.set_roster_starting_numbers(uuid,uuid,uuid,uuid,date,jsonb,jsonb)', 'EXECUTE'),
  'the server saves starting numbers');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
SELECT throws_ok(pg_temp.save_sql(2, 401, pg_temp.open_form(401), pg_temp.today(), '[]', '[]'),
  '42501', NULL, 'a configurator cannot call the save from the browser');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(pg_temp.save_sql(3, 401, pg_temp.open_form(401), pg_temp.today(), jsonb_build_array(pg_temp.number(302, 5)), '[]'),
  '42501', NULL, 'a Calendar operator cannot set starting numbers');
SELECT throws_ok(pg_temp.save_sql(5, 401, pg_temp.open_form(401), pg_temp.today(), jsonb_build_array(pg_temp.number(302, 5)), '[]'),
  '42501', NULL, 'a Group-scoped configurator cannot set starting numbers for the whole pool');
SELECT throws_ok(pg_temp.save_sql(4, 401, pg_temp.open_form(401), pg_temp.today(), jsonb_build_array(pg_temp.number(302, 5)), '[]'),
  '42501', NULL, 'another Organization''s configurator cannot set starting numbers');
SELECT throws_ok(pg_temp.save_sql(2, 401, pg_temp.open_form(401), pg_temp.today() - 3, jsonb_build_array(pg_temp.number(302, 5)), '[]'),
  'RSD01', NULL, 'a device day far from today is refused');
SELECT throws_ok(pg_temp.save_sql(2, 401, pg_temp.id(999), pg_temp.today(), jsonb_build_array(pg_temp.number(302, 5)), '[]'),
  'RSF01', NULL, 'a save against a form that is no longer open is refused');
SELECT throws_ok(pg_temp.save_sql(2, 401, pg_temp.open_form(401), pg_temp.today(), jsonb_build_array(pg_temp.number(302, 5, 'weekend')), '[]'),
  '22023', NULL, 'a track the weekend rule does not keep is refused');
SELECT throws_ok(pg_temp.save_sql(2, 401, pg_temp.open_form(401), pg_temp.today(), jsonb_build_array(pg_temp.number(311, 5)), '[]'),
  'P0002', NULL, 'a person from another Organization is refused');
SELECT throws_ok(pg_temp.save_sql(2, 401, pg_temp.open_form(401), pg_temp.today(), jsonb_build_array(pg_temp.number(302, 5)),
  jsonb_build_array(pg_temp.repick(3, 302, 303))),
  'P0001', 'Assignment slot unavailable', 'a re-pick of a hand-assigned day fails the whole save');
SELECT throws_ok(pg_temp.save_sql(2, 401, pg_temp.open_form(401), pg_temp.today(), jsonb_build_array(pg_temp.number(302, 5)),
  jsonb_build_array(pg_temp.repick(1, 302, 301), pg_temp.repick(2, 301, 303))),
  'P0001', 'Assignment slot unavailable', 'a stale prior assignee refuses every re-pick and the starting numbers');
SELECT throws_ok(pg_temp.save_sql(2, 401, pg_temp.open_form(401), pg_temp.today(), jsonb_build_array(pg_temp.number(302, 5)),
  jsonb_build_array(pg_temp.repick(1, 302, 301), pg_temp.repick(2, 311, 302))),
  '42501', 'Calendar assignment operation is not allowed', 'a re-pick outside the Organization rolls back the starting numbers and every assignment');
SELECT throws_ok(pg_temp.save_sql(2, 402, pg_temp.open_form(402), pg_temp.today(), jsonb_build_array(pg_temp.number(302, 5)), '[]'),
  'RSL01', NULL, 'carried numbers cannot be edited');
RESET ROLE;

SELECT is(pg_temp.starting_numbers(401), '[]', 'refused saves wrote no starting number');
SELECT is(pg_temp.days(401), '[[1, 301, "roster"], [2, 302, "roster"], [3, 303, "manual"]]',
  'refused saves moved no assignment');
SELECT is(pg_temp.starting_numbers(402), '[[301, "all", 6, "carried"]]', 'the carried numbers stand');

SET LOCAL ROLE service_role;
SELECT results_eq(
  replace(pg_temp.save_sql(2, 401, pg_temp.open_form(401), pg_temp.today(),
    jsonb_build_array(pg_temp.number(302, 5), pg_temp.number(303, 2)), jsonb_build_array(pg_temp.repick(1, 302, 301))),
    'SELECT *', 'SELECT date, assignee_id::text, source'),
  format('VALUES (%L::date, %L::text, %L::text)', pg_temp.today() + 1, pg_temp.id(302), 'roster'),
  'a configurator''s save re-picks a planned day as a roster pick');
RESET ROLE;
SELECT is(pg_temp.starting_numbers(401), '[[302, "all", 5, "typed"], [303, "all", 2, "typed"]]',
  'the typed numbers are saved');
SELECT is(pg_temp.days(401), '[[1, 302, "roster"], [2, 302, "roster"], [3, 303, "manual"]]',
  'the hand-assigned day stays');

SET LOCAL ROLE service_role;
SELECT lives_ok(pg_temp.save_sql(2, 401, pg_temp.open_form(401), pg_temp.today(), jsonb_build_array(pg_temp.number(301, 4)), '[]'),
  'the numbers can change again before the first detail');
RESET ROLE;
SELECT is(pg_temp.starting_numbers(401), '[[301, "all", 4, "typed"]]', 'a later save replaces the typed set');

-- Today's detail is served.
INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id) VALUES
  (pg_temp.id(101), pg_temp.id(401), pg_temp.today(), pg_temp.id(303));
SET LOCAL ROLE service_role;
SELECT throws_ok(pg_temp.save_sql(2, 401, pg_temp.open_form(401), pg_temp.today(), jsonb_build_array(pg_temp.number(302, 9)), '[]'),
  'RSL01', NULL, 'once a detail is served the starting numbers are part of the record');
RESET ROLE;
SELECT is(pg_temp.starting_numbers(401), '[[301, "all", 4, "typed"]]', 'the locked numbers stand');

SELECT * FROM finish();
ROLLBACK;
