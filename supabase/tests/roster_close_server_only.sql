BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('d2261022-0009-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.today() RETURNS date LANGUAGE sql AS $$
  SELECT (now() AT TIME ZONE 'UTC')::date;
$$;
CREATE FUNCTION pg_temp.open_form() RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.roster_forms WHERE assignment_type_id = pg_temp.id(401) AND ends_on IS NULL;
$$;
CREATE FUNCTION pg_temp.close_sql(actor integer, form_id uuid, today date, weekend text, record jsonb, carry jsonb)
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.close_roster_form(%L,%L,%L,%L,%L,NULL,%L,%L,%L)',
    pg_temp.id(actor), pg_temp.id(101), pg_temp.id(401), form_id, today, weekend, record, carry);
$$;

INSERT INTO auth.users (id, email)
SELECT pg_temp.id(n), 'roster-close-' || n || '@example.test' FROM generate_series(1, 5) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id(101), 'Close Alpha', pg_temp.id(1)),
  (pg_temp.id(102), 'Close Bravo', pg_temp.id(4));
INSERT INTO public.groups (id, organization_id, name) VALUES (pg_temp.id(501), pg_temp.id(101), 'Close Platoon');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id(101), pg_temp.id(1), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(2), 'member', 'viewer', '{"calendar":"configure","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(3), 'member', 'operator', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(102), pg_temp.id(4), 'member', 'viewer', '{"calendar":"configure","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(5), 'member', 'viewer', '{"calendar":"configure","personnel":"none"}', 'groups', ARRAY[pg_temp.id(501)]);
INSERT INTO public.personnel (id, organization_id, rank, mos, first_name, last_name, slug) VALUES
  (pg_temp.id(301), pg_temp.id(101), 'SGT', '68W', 'Close', 'Able', 'close-able'),
  (pg_temp.id(302), pg_temp.id(101), 'SPC', '68W', 'Close', 'Baker', 'close-baker'),
  (pg_temp.id(311), pg_temp.id(102), 'SPC', '68W', 'Close', 'Bravo', 'close-bravo');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to)
VALUES (pg_temp.id(401), pg_temp.id(101), 'Close duty', 'CD', 'personnel');
CREATE TEMP TABLE original_form AS SELECT pg_temp.open_form() AS id;
GRANT SELECT ON original_form TO authenticated, service_role;

SELECT is(to_regprocedure('public.close_roster_form(uuid,uuid,uuid,date,jsonb,text,jsonb,jsonb)'), NULL::regprocedure,
  'the client-callable close signature is removed');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.close_roster_form(uuid,uuid,uuid,uuid,date,jsonb,text,jsonb,jsonb)', 'EXECUTE'),
  'signed-in callers cannot execute a close');
SELECT ok(NOT has_function_privilege('anon',
  'public.close_roster_form(uuid,uuid,uuid,uuid,date,jsonb,text,jsonb,jsonb)', 'EXECUTE'),
  'anonymous callers cannot execute a close');
SELECT ok(has_function_privilege('service_role',
  'public.close_roster_form(uuid,uuid,uuid,uuid,date,jsonb,text,jsonb,jsonb)', 'EXECUTE'),
  'the server may close on behalf of an actor');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
SELECT throws_ok(pg_temp.close_sql(2, pg_temp.open_form(), pg_temp.today(), 'same', '{"invented":true}', '[]'),
  '42501', NULL, 'even a signed-in configurator cannot forge a close');
SELECT throws_ok(pg_temp.close_sql(1, pg_temp.open_form(), pg_temp.today(), 'same', '{"invented":true}', '[]'),
  '42501', NULL, 'passing the owner as actor does not grant a client execute permission');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(pg_temp.close_sql(3, pg_temp.open_form(), pg_temp.today(), 'same', '{}', '[]'),
  '42501', NULL, 'the server refuses an actor without Calendar configuration');
SELECT throws_ok(pg_temp.close_sql(5, pg_temp.open_form(), pg_temp.today(), 'same', '{}', '[]'),
  '42501', NULL, 'the server refuses a Group-scoped configurator');
SELECT throws_ok(pg_temp.close_sql(4, pg_temp.open_form(), pg_temp.today(), 'same', '{}', '[]'),
  '42501', NULL, 'the server refuses another Organization configurator');
SELECT throws_ok(pg_temp.close_sql(NULL, pg_temp.open_form(), pg_temp.today(), 'same', '{}', '[]'),
  '42501', NULL, 'a prior authorized subject cannot supply a missing actor');
SELECT throws_ok(pg_temp.close_sql(999, pg_temp.open_form(), pg_temp.today(), 'same', '{}', '[]'),
  '42501', NULL, 'the server refuses an unknown actor');
SELECT throws_ok(pg_temp.close_sql(2, pg_temp.open_form(), pg_temp.today() + 2, 'same', '{}', '[]'),
  'RSD01', NULL, 'the service close still refuses a device day two days off');
SELECT throws_ok(pg_temp.close_sql(2, pg_temp.id(999), pg_temp.today(), 'same', '{}', '[]'),
  'RSF01', NULL, 'the service close still refuses a stale form');
SELECT lives_ok(pg_temp.close_sql(2, pg_temp.open_form(), pg_temp.today(), 'separate', '{"segments":[]}',
  jsonb_build_array(
    jsonb_build_object('personnel_id', pg_temp.id(301), 'track', 'weekday', 'count', 7, 'origin', 'typed'),
    jsonb_build_object('personnel_id', pg_temp.id(302), 'track', 'weekend', 'count', 4),
    jsonb_build_object('personnel_id', pg_temp.id(311), 'track', 'weekday', 'count', 9, 'origin', 'typed'))),
  'the server closes a rule change for a Calendar-only configurator');
SELECT throws_ok(format('SELECT public.set_roster_starting_numbers(%L,%L,%L,%L,%L,%L,%L)',
  pg_temp.id(2), pg_temp.id(101), pg_temp.id(401), pg_temp.open_form(), pg_temp.today(), '[]', '[]'),
  'RSL01', NULL, 'a typed input origin cannot bypass the successor starting-number lock');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
SELECT is((SELECT jsonb_build_array(f.ends_on, f.record) FROM public.roster_forms f WHERE f.id = (SELECT id FROM original_form)),
  jsonb_build_array(pg_temp.today(), '{"segments":[]}'::jsonb), 'the original form closes today with the server record');
SELECT is((SELECT jsonb_build_array(starts_on, rules) FROM public.roster_forms WHERE id = pg_temp.open_form()),
  jsonb_build_array(pg_temp.today() + 1, '{"pool":null,"weekendMode":"separate"}'::jsonb),
  'the rule change opens tomorrow with the new rules');
SELECT is((SELECT jsonb_agg(jsonb_build_array(right(personnel_id::text, 3), track, count, origin) ORDER BY personnel_id)
  FROM public.roster_starting_numbers WHERE form_id = pg_temp.open_form()),
  '[["301","weekday",7,"carried"],["302","weekend",4,"carried"]]'::jsonb,
  'all successor numbers are carried, with or without an input origin, and foreign people are excluded');
SELECT throws_ok(format('UPDATE public.roster_forms SET record = %L WHERE id = %L', '{}', (SELECT id FROM original_form)),
  '42501', NULL, 'the form guard still denies direct record changes');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT lives_ok(pg_temp.close_sql(2, pg_temp.open_form(), pg_temp.today(), 'none', NULL,
  jsonb_build_array(jsonb_build_object('personnel_id', pg_temp.id(301), 'track', 'weekday', 'count', 8, 'origin', 'typed'))),
  'a second rule change still rewrites the future form in place');
SELECT lives_ok(pg_temp.close_sql(2, pg_temp.open_form(), pg_temp.today(), NULL, NULL, '[]'),
  'a Group switch removes the future open form');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
SELECT is((SELECT assign_to FROM public.assignment_types WHERE id = pg_temp.id(401)), 'group', 'the type becomes Group-assigned');
SELECT is(pg_temp.open_form(), NULL::uuid, 'a Group assignment has no open form');
UPDATE public.assignment_types SET assign_to = 'personnel' WHERE id = pg_temp.id(401);
SELECT is((SELECT starts_on FROM public.roster_forms WHERE id = pg_temp.open_form()), pg_temp.today() + 1,
  'the signed-in switch back to personnel opens a fresh form after the closed record');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
