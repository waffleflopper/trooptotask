-- Duty roster settings: excusals are configured by Organization-wide Calendar
-- configurators, rules, forms and starting numbers change only by closing a
-- form, and Person attribute history is written only by its trigger.
-- Run only against the isolated synthetic SQL test database.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('d2261022-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
-- The configurator holds no Personnel capability, so results name people by number.
CREATE FUNCTION pg_temp.n(person uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT right(person::text, 12)::integer;
$$;
CREATE FUNCTION pg_temp.today() RETURNS date LANGUAGE sql AS $$
  SELECT (now() AT TIME ZONE 'UTC')::date;
$$;
CREATE FUNCTION pg_temp.act(actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', pg_temp.id(actor)::text, true);
END; $$;
CREATE FUNCTION pg_temp.open_form(type_id integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.roster_forms WHERE assignment_type_id = pg_temp.id(type_id) AND ends_on IS NULL;
$$;
CREATE FUNCTION pg_temp.excusals_sql(today date, excusals jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.set_roster_excusals(%L, %L, %L, %L)', pg_temp.id(101), pg_temp.id(401), today, excusals);
$$;
CREATE FUNCTION pg_temp.close_as_service_role(
  org_id uuid, type_id uuid, form_id uuid, today date, pool jsonb, weekend text, record jsonb, carry jsonb
) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.close_roster_form(auth.uid(), org_id, type_id, form_id, today, pool, weekend, record, carry);
$$;
ALTER FUNCTION pg_temp.close_as_service_role(uuid,uuid,uuid,date,jsonb,text,jsonb,jsonb) OWNER TO service_role;
CREATE FUNCTION pg_temp.close_sql(form_id uuid, today date, pool jsonb, weekend text, record jsonb, carry jsonb)
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT pg_temp.close_as_service_role(%L, %L, %L, %L, %L, %L, %L, %L)',
    pg_temp.id(101), pg_temp.id(401), form_id, today, pool, weekend, record, carry);
$$;
CREATE FUNCTION pg_temp.excusals(type_id integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(pg_temp.n(x.personnel_id), x.reason, x.starts_on - pg_temp.today(),
    x.ends_on - pg_temp.today()) ORDER BY x.personnel_id, x.starts_on), '[]')
  FROM public.roster_excusals x WHERE x.assignment_type_id = pg_temp.id(type_id);
$$;
CREATE FUNCTION pg_temp.starting_numbers(p_form uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(pg_temp.n(s.personnel_id), s.track, s.count, s.origin)
    ORDER BY s.personnel_id, s.track), '[]')
  FROM public.roster_starting_numbers s WHERE s.form_id = p_form;
$$;
CREATE FUNCTION pg_temp.as_close_rpc(on_off boolean) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('trooptotask.roster_close', CASE WHEN on_off THEN 'on' ELSE '' END, true);
$$;
CREATE FUNCTION pg_temp.history(person integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(effective_on - pg_temp.today(), rank, archived) ORDER BY effective_on), '[]')
  FROM public.personnel_attribute_history WHERE personnel_id = pg_temp.id(person);
$$;
CREATE TEMP TABLE saved(label text PRIMARY KEY, value uuid);
GRANT ALL ON saved TO authenticated;

INSERT INTO auth.users (id, email)
SELECT pg_temp.id(n), 'duty-roster-settings-' || n || '@example.test' FROM generate_series(1, 6) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id(101), 'Roster Alpha', pg_temp.id(1)),
  (pg_temp.id(102), 'Roster Bravo', pg_temp.id(4));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id(101), pg_temp.id(1), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(2), 'member', 'viewer', '{"calendar":"configure","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(3), 'member', 'viewer', '{"calendar":"view","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(102), pg_temp.id(4), 'member', 'viewer', '{"calendar":"configure","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(5), 'member', 'viewer', '{"calendar":"view","personnel":"configure"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(6), 'member', 'viewer', '{"calendar":"view","personnel":"none"}', 'groups', ARRAY[pg_temp.id(501)]);
INSERT INTO public.groups (id, organization_id, name) VALUES (pg_temp.id(501), pg_temp.id(101), 'Roster Platoon');
INSERT INTO public.personnel (id, organization_id, rank, mos, clinic_role, first_name, last_name, slug, created_at) VALUES
  (pg_temp.id(301), pg_temp.id(101), 'SPC', '68W', 'Medic', 'Roster', 'Able', 'roster-settings-able', '2026-01-05T12:00:00Z'),
  (pg_temp.id(305), pg_temp.id(101), 'PV2', '68W', '', 'Roster', 'Echo', 'roster-settings-echo', '2026-01-05T12:00:00Z'),
  (pg_temp.id(302), pg_temp.id(101), 'SGT', '68W', 'NCOIC', 'Roster', 'Baker', 'roster-settings-baker', '2026-01-05T12:00:00Z'),
  (pg_temp.id(303), pg_temp.id(101), 'PFC', '68C', '', 'Roster', 'Charlie', 'roster-settings-charlie', '2026-01-05T12:00:00Z'),
  (pg_temp.id(311), pg_temp.id(102), 'SPC', '68W', '', 'Roster', 'Bravo', 'roster-settings-bravo', '2026-01-05T12:00:00Z');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to) VALUES
  (pg_temp.id(401), pg_temp.id(101), 'Staff Duty', 'SD', 'personnel'),
  (pg_temp.id(402), pg_temp.id(101), 'Motor Pool', 'MP', 'group'),
  (pg_temp.id(403), pg_temp.id(101), 'Charge of Quarters', 'CQ', 'personnel');
UPDATE public.personnel SET group_id = pg_temp.id(501) WHERE id = pg_temp.id(301);
SELECT pg_temp.as_close_rpc(true);
INSERT INTO public.roster_starting_numbers (organization_id, form_id, personnel_id, track, count, origin) VALUES
  (pg_temp.id(101), pg_temp.open_form(403), pg_temp.id(301), 'all', 3, 'typed');
SELECT pg_temp.as_close_rpc(false);
INSERT INTO public.roster_excusals (id, organization_id, assignment_type_id, personnel_id, reason, starts_on) VALUES
  (pg_temp.id(701), pg_temp.id(101), pg_temp.id(403), pg_temp.id(302), 'Profile', pg_temp.today()),
  (pg_temp.id(702), pg_temp.id(101), pg_temp.id(401), pg_temp.id(303), 'Profile', pg_temp.today() - 5);

SAVEPOINT read_scope;
INSERT INTO public.groups (id, organization_id, name) VALUES (pg_temp.id(502), pg_temp.id(101), 'Other Platoon');
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id(304), pg_temp.id(101), pg_temp.id(502), 'SGT', 'Other', 'Platoon', 'roster-settings-other-platoon');
SELECT pg_temp.as_close_rpc(true);
INSERT INTO public.roster_forms (organization_id, assignment_type_id, starts_on, ends_on, rules, record) VALUES
  (pg_temp.id(101), pg_temp.id(403), pg_temp.today() - 10, pg_temp.today() - 1, '{"pool": null, "weekendMode": "same"}',
    '{"rows": [{"name": "Roster Able"}, {"name": "Roster Baker"}, {"name": "Other Platoon"}]}');
INSERT INTO saved VALUES ('scope form', pg_temp.open_form(403));
INSERT INTO public.roster_starting_numbers (organization_id, form_id, personnel_id, track, count, origin) VALUES
  (pg_temp.id(101), pg_temp.open_form(403), pg_temp.id(302), 'all', 4, 'typed'),
  (pg_temp.id(101), pg_temp.open_form(403), pg_temp.id(304), 'all', 5, 'typed');
SELECT pg_temp.as_close_rpc(false);
INSERT INTO public.roster_excusals (organization_id, assignment_type_id, personnel_id, reason, starts_on) VALUES
  (pg_temp.id(101), pg_temp.id(403), pg_temp.id(301), 'Leave', pg_temp.today()),
  (pg_temp.id(101), pg_temp.id(403), pg_temp.id(304), 'School', pg_temp.today());
INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id) VALUES
  (pg_temp.id(101), pg_temp.id(403), pg_temp.today() - 3, pg_temp.id(301)::text),
  (pg_temp.id(101), pg_temp.id(403), pg_temp.today() - 2, pg_temp.id(302)::text),
  (pg_temp.id(101), pg_temp.id(403), pg_temp.today() - 1, pg_temp.id(304)::text),
  (pg_temp.id(101), pg_temp.id(402), pg_temp.today() - 2, pg_temp.id(501)::text),
  (pg_temp.id(101), pg_temp.id(402), pg_temp.today() - 1, pg_temp.id(502)::text);

SELECT pg_temp.act(6);
SELECT is((SELECT count(*)::integer FROM public.roster_forms), 0,
  'a Group-scoped Calendar viewer reads no open or closed DA 6 forms');
SELECT is(pg_temp.starting_numbers((SELECT value FROM saved WHERE label = 'scope form')), '[[301, "all", 3, "typed"]]',
  'a Group-scoped Calendar viewer reads starting numbers only for people in their Group');
SELECT is(pg_temp.excusals(403), '[[301, "Leave", 0, null]]',
  'a Group-scoped Calendar viewer reads excusal reasons only for people in their Group');
SELECT is((SELECT jsonb_agg(DISTINCT pg_temp.n(personnel_id) ORDER BY pg_temp.n(personnel_id))
  FROM public.personnel_attribute_history), '[301]',
  'a Group-scoped Calendar viewer reads attribute history only for people in their Group');
SELECT is((SELECT jsonb_agg(pg_temp.n(d.assignee_id::uuid) ORDER BY d.date)
  FROM public.list_roster_detail_days(pg_temp.id(101), pg_temp.id(403), pg_temp.today() - 10, pg_temp.today()) d), '[301]',
  'roster detail days hide living people in other Groups and unassigned people from a Group-scoped viewer');
SELECT is((SELECT count(*)::integer
  FROM public.list_roster_detail_days(pg_temp.id(101), pg_temp.id(402), pg_temp.today() - 10, pg_temp.today())), 0,
  'roster detail days do not expose Group assignments through the deleted-person fallback');

SELECT pg_temp.act(3);
SELECT is((SELECT count(*)::integer FROM public.roster_forms), 3,
  'an Organization-scoped Calendar viewer reads open and closed DA 6 forms');
SELECT is(pg_temp.starting_numbers((SELECT value FROM saved WHERE label = 'scope form')),
  '[[301, "all", 3, "typed"], [302, "all", 4, "typed"], [304, "all", 5, "typed"]]',
  'an Organization-scoped Calendar viewer reads starting numbers across Groups and for unassigned people');
SELECT is(pg_temp.excusals(403), '[[301, "Leave", 0, null], [302, "Profile", 0, null], [304, "School", 0, null]]',
  'an Organization-scoped Calendar viewer reads excusal reasons across Groups and for unassigned people');
SELECT is((SELECT jsonb_agg(DISTINCT pg_temp.n(personnel_id) ORDER BY pg_temp.n(personnel_id))
  FROM public.personnel_attribute_history), '[301, 302, 303, 304, 305]',
  'an Organization-scoped Calendar viewer reads all of their Organization''s attribute history');
SELECT is((SELECT jsonb_agg(pg_temp.n(d.assignee_id::uuid) ORDER BY d.date)
  FROM public.list_roster_detail_days(pg_temp.id(101), pg_temp.id(403), pg_temp.today() - 10, pg_temp.today()) d), '[301, 302, 304]',
  'an Organization-scoped Calendar viewer reads roster detail days across Groups and for unassigned people');

SELECT pg_temp.act(2);
SELECT is((SELECT count(*)::integer FROM public.roster_forms), 3,
  'a Calendar configurator still reads every open and closed DA 6 form');
SELECT is(pg_temp.starting_numbers((SELECT value FROM saved WHERE label = 'scope form')),
  '[[301, "all", 3, "typed"], [302, "all", 4, "typed"], [304, "all", 5, "typed"]]',
  'a Calendar configurator still reads all starting numbers');
SELECT is(pg_temp.excusals(403), '[[301, "Leave", 0, null], [302, "Profile", 0, null], [304, "School", 0, null]]',
  'a Calendar configurator still reads all excusals');
SELECT is((SELECT jsonb_agg(DISTINCT pg_temp.n(personnel_id) ORDER BY pg_temp.n(personnel_id))
  FROM public.personnel_attribute_history), '[301, 302, 303, 304, 305]',
  'a Calendar configurator still reads all attribute history without Personnel access');
WITH changed AS (UPDATE public.roster_excusals SET reason = 'School extended'
  WHERE personnel_id = pg_temp.id(304) RETURNING reason)
SELECT is((SELECT reason FROM changed), 'School extended',
  'a Calendar configurator still manages an excusal for a person in another Group');
RESET ROLE;
ROLLBACK TO SAVEPOINT read_scope;
RELEASE SAVEPOINT read_scope;

-- Row security.
SELECT pg_temp.act(3);
SELECT is((SELECT count(*)::integer FROM public.roster_forms WHERE organization_id = pg_temp.id(101)), 2,
  'a Calendar viewer reads the Organization''s DA 6 forms');
SELECT is((SELECT count(*)::integer FROM public.roster_starting_numbers WHERE organization_id = pg_temp.id(101)), 1,
  'a Calendar viewer reads the Organization''s starting numbers');
SELECT is((SELECT count(*)::integer FROM public.roster_excusals WHERE organization_id = pg_temp.id(101)), 2,
  'a Calendar viewer reads the Organization''s excusals');
SELECT throws_ok(format($$INSERT INTO public.roster_forms (organization_id, assignment_type_id, starts_on, ends_on, rules, record)
  VALUES (%L, %L, '2026-01-01', '2026-01-31', '{"pool": null, "weekendMode": "same"}', '{}')$$, pg_temp.id(101), pg_temp.id(403)),
  '42501', NULL, 'a Calendar viewer cannot add a DA 6 form');
SELECT throws_ok(format($$INSERT INTO public.roster_starting_numbers (organization_id, form_id, personnel_id, track, count, origin)
  VALUES (%L, %L, %L, 'all', 1, 'typed')$$, pg_temp.id(101), pg_temp.open_form(403), pg_temp.id(302)),
  '42501', NULL, 'a Calendar viewer cannot add a starting number');
SELECT throws_ok(format($$INSERT INTO public.roster_excusals (organization_id, assignment_type_id, personnel_id, reason, starts_on)
  VALUES (%L, %L, %L, 'Leave', %L)$$, pg_temp.id(101), pg_temp.id(403), pg_temp.id(303), pg_temp.today()),
  '42501', NULL, 'a Calendar viewer cannot add an excusal');
WITH changed AS (UPDATE public.roster_forms SET rules = '{"pool": null, "weekendMode": "same"}' WHERE organization_id = pg_temp.id(101) RETURNING id)
SELECT is(count(*)::integer, 0, 'a Calendar viewer cannot edit a DA 6 form') FROM changed;
WITH changed AS (UPDATE public.roster_starting_numbers SET count = 9 WHERE organization_id = pg_temp.id(101) RETURNING form_id)
SELECT is(count(*)::integer, 0, 'a Calendar viewer cannot edit a starting number') FROM changed;
WITH removed AS (DELETE FROM public.roster_excusals WHERE organization_id = pg_temp.id(101) RETURNING id)
SELECT is(count(*)::integer, 0, 'a Calendar viewer cannot remove an excusal') FROM removed;
WITH removed AS (DELETE FROM public.roster_forms WHERE organization_id = pg_temp.id(101) RETURNING id)
SELECT is(count(*)::integer, 0, 'a Calendar viewer cannot remove a DA 6 form') FROM removed;

SELECT pg_temp.act(4);
SELECT is((SELECT count(*)::integer FROM public.roster_forms WHERE organization_id = pg_temp.id(101))
  + (SELECT count(*)::integer FROM public.roster_starting_numbers WHERE organization_id = pg_temp.id(101))
  + (SELECT count(*)::integer FROM public.roster_excusals WHERE organization_id = pg_temp.id(101)), 0,
  'another Organization''s configurator reads no forms, starting numbers or excusals');
SELECT throws_ok(format($$INSERT INTO public.roster_starting_numbers (organization_id, form_id, personnel_id, track, count, origin)
  VALUES (%L, %L, %L, 'all', 1, 'typed')$$, pg_temp.id(101), pg_temp.open_form(403), pg_temp.id(302)),
  '42501', NULL, 'another Organization''s configurator cannot add a starting number');
SELECT throws_ok(format($$INSERT INTO public.roster_excusals (organization_id, assignment_type_id, personnel_id, reason, starts_on)
  VALUES (%L, %L, %L, 'Leave', %L)$$, pg_temp.id(101), pg_temp.id(403), pg_temp.id(303), pg_temp.today()),
  '42501', NULL, 'another Organization''s configurator cannot add an excusal');
WITH changed AS (UPDATE public.roster_excusals SET reason = 'Changed' WHERE organization_id = pg_temp.id(101) RETURNING id)
SELECT is(count(*)::integer, 0, 'another Organization''s configurator cannot edit an excusal') FROM changed;

SELECT pg_temp.act(2);
SAVEPOINT configurator_writes;
SELECT lives_ok(format($$INSERT INTO public.roster_excusals (organization_id, assignment_type_id, personnel_id, reason, starts_on)
  VALUES (%L, %L, %L, 'Leave', %L)$$, pg_temp.id(101), pg_temp.id(403), pg_temp.id(303), pg_temp.today()),
  'a configurator can add an excusal');
WITH removed AS (DELETE FROM public.roster_excusals WHERE id = pg_temp.id(701) RETURNING id)
SELECT is(count(*)::integer, 1, 'a configurator can remove an excusal') FROM removed;
ROLLBACK TO SAVEPOINT configurator_writes;
RELEASE SAVEPOINT configurator_writes;
SELECT throws_ok(format($$INSERT INTO public.roster_forms (organization_id, assignment_type_id, starts_on, ends_on, rules, record)
  VALUES (%L, %L, '2026-01-01', '2026-01-31', '{"pool": null, "weekendMode": "same"}', '{}')$$, pg_temp.id(101), pg_temp.id(403)),
  '42501', NULL, 'a configurator cannot add a DA 6 form directly');
SELECT throws_ok(format($$UPDATE public.roster_forms SET rules = '{"pool": null, "weekendMode": "none"}' WHERE id = %L$$,
  pg_temp.open_form(403)), '42501', NULL, 'a configurator cannot change the open form''s rules directly');
SELECT throws_ok(format($$DELETE FROM public.roster_forms WHERE id = %L$$, pg_temp.open_form(403)),
  '42501', NULL, 'a configurator cannot remove the open form');
SELECT throws_ok(format($$INSERT INTO public.roster_starting_numbers (organization_id, form_id, personnel_id, track, count, origin)
  VALUES (%L, %L, %L, 'all', 1, 'typed')$$, pg_temp.id(101), pg_temp.open_form(403), pg_temp.id(302)),
  '42501', NULL, 'a configurator cannot add a starting number directly');
SELECT throws_ok(format($$UPDATE public.roster_starting_numbers SET count = 4 WHERE form_id = %L$$, pg_temp.open_form(403)),
  '42501', NULL, 'a configurator cannot edit a starting number directly');
SELECT throws_ok(format($$DELETE FROM public.roster_starting_numbers WHERE form_id = %L$$, pg_temp.open_form(403)),
  '42501', NULL, 'a configurator cannot remove a starting number directly');

-- Excusal reasons.
SELECT throws_ok(format($$INSERT INTO public.roster_excusals (organization_id, assignment_type_id, personnel_id, reason, starts_on)
  VALUES (%L, %L, %L, '', %L)$$, pg_temp.id(101), pg_temp.id(403), pg_temp.id(303), pg_temp.today()),
  '23514', NULL, 'an excusal needs a reason');
SELECT throws_ok(format($$INSERT INTO public.roster_excusals (organization_id, assignment_type_id, personnel_id, reason, starts_on)
  VALUES (%L, %L, %L, '   ', %L)$$, pg_temp.id(101), pg_temp.id(403), pg_temp.id(303), pg_temp.today()),
  '23514', NULL, 'a whitespace reason is no reason');
SELECT throws_ok(pg_temp.excusals_sql(pg_temp.today(), jsonb_build_array(
  jsonb_build_object('personnel_id', pg_temp.id(301), 'reason', '  '))),
  '22023', NULL, 'set_roster_excusals rejects a whitespace reason');

-- set_roster_excusals.
SELECT pg_temp.act(3);
SELECT throws_ok(pg_temp.excusals_sql(pg_temp.today(), '[]'), '42501', NULL, 'a Calendar viewer cannot set excusals');
SELECT pg_temp.act(2);
SELECT throws_ok(pg_temp.excusals_sql(pg_temp.today() + 2, '[]'), 'RSD01', NULL,
  'set_roster_excusals rejects a day two days after the server day');
SELECT throws_ok(pg_temp.excusals_sql(pg_temp.today() - 2, '[]'), 'RSD01', NULL,
  'set_roster_excusals rejects a day two days before the server day');
SELECT lives_ok(pg_temp.excusals_sql(pg_temp.today(), jsonb_build_array(
  jsonb_build_object('personnel_id', pg_temp.id(301), 'reason', ' Leave '),
  jsonb_build_object('personnel_id', pg_temp.id(303), 'reason', 'Profile'))),
  'a configurator excuses a new person and keeps an existing excusal');
SELECT is(pg_temp.excusals(401), '[[301, "Leave", 0, null], [303, "Profile", -5, null]]',
  'the new excusal starts today with its trimmed reason and the older one is unchanged');
SELECT lives_ok(pg_temp.excusals_sql(pg_temp.today(), jsonb_build_array(
  jsonb_build_object('personnel_id', pg_temp.id(301), 'reason', 'Leave'),
  jsonb_build_object('personnel_id', pg_temp.id(303), 'reason', 'Temporary profile'))),
  'a configurator changes a reason');
SELECT is((SELECT jsonb_build_array(reason, starts_on - pg_temp.today()) FROM public.roster_excusals WHERE id = pg_temp.id(702)),
  '["Temporary profile", -5]', 'a changed reason updates the excusal in place');
SELECT lives_ok(pg_temp.excusals_sql(pg_temp.today(), '[]'), 'a configurator reinstates everyone');
SELECT is(pg_temp.excusals(401), '[[303, "Temporary profile", -5, -1]]',
  'an older excusal ends yesterday and one that started today is gone');

-- close_roster_form on a form that started before today.
RESET ROLE;
SELECT pg_temp.as_close_rpc(true);
UPDATE public.roster_forms SET starts_on = pg_temp.today() - 10 WHERE id = pg_temp.open_form(401);
SELECT pg_temp.as_close_rpc(false);
INSERT INTO saved VALUES ('first form', pg_temp.open_form(401));
SELECT pg_temp.act(3);
SELECT throws_ok(pg_temp.close_sql(pg_temp.open_form(401), pg_temp.today(), NULL, 'same', '{"rows": []}', '[]'),
  '42501', NULL, 'a Calendar viewer cannot close a DA 6 form');
SELECT pg_temp.act(2);
SELECT throws_ok(pg_temp.close_sql(pg_temp.open_form(401), pg_temp.today() + 2, NULL, 'same', '{"rows": []}', '[]'),
  'RSD01', NULL, 'close_roster_form rejects a day two days after the server day');
SELECT throws_ok(pg_temp.close_sql(pg_temp.open_form(401), pg_temp.today(), NULL, 'same', NULL, '[]'),
  '22023', NULL, 'a form with days to record cannot close without its record');
-- Rules the application could not read are refused before anything is written.
CREATE FUNCTION pg_temp.roster_state() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_array(
    (SELECT jsonb_agg(jsonb_build_array(id, ends_on, rules) ORDER BY starts_on) FROM public.roster_forms
      WHERE assignment_type_id = pg_temp.id(401)),
    (SELECT jsonb_build_array(roster_pool_rules, roster_weekend_mode) FROM public.assignment_types WHERE id = pg_temp.id(401)));
$$;
RESET ROLE;
CREATE TEMP TABLE state_before AS SELECT pg_temp.roster_state() AS state;
GRANT ALL ON state_before TO authenticated;
SELECT pg_temp.act(2);
SELECT throws_ok(pg_temp.close_sql(pg_temp.open_form(401), pg_temp.today(), '{}', 'same', '{"rows": []}', '[]'),
  '22023', NULL, 'an empty object is not a rule set');
SELECT throws_ok(pg_temp.close_sql(pg_temp.open_form(401), pg_temp.today(), '[]', 'same', '{"rows": []}', '[]'),
  '22023', NULL, 'an array is not a rule set');
SELECT throws_ok(pg_temp.close_sql(pg_temp.open_form(401), pg_temp.today(),
  '{"rank": null, "mos": "68W", "role": [], "groupIds": []}', 'same', '{"rows": []}', '[]'),
  '22023', NULL, 'a list of MOS must be an array');
SELECT throws_ok(pg_temp.close_sql(pg_temp.open_form(401), pg_temp.today(),
  '{"rank": null, "mos": [1], "role": [], "groupIds": []}', 'same', '{"rows": []}', '[]'),
  '22023', NULL, 'a list holds only strings');
SELECT throws_ok(pg_temp.close_sql(pg_temp.open_form(401), pg_temp.today(),
  '{"rank": {"from": "SPC"}, "mos": [], "role": [], "groupIds": []}', 'same', '{"rows": []}', '[]'),
  '22023', NULL, 'a rank range needs both ends');
SELECT throws_ok(pg_temp.close_sql(pg_temp.open_form(401), pg_temp.today(),
  '{"rank": {"from": "SPC", "to": 5}, "mos": [], "role": [], "groupIds": []}', 'same', '{"rows": []}', '[]'),
  '22023', NULL, 'a rank range holds strings');
SELECT throws_ok(pg_temp.close_sql(pg_temp.open_form(401), pg_temp.today(),
  '{"mos": [], "role": [], "groupIds": []}', 'same', '{"rows": []}', '[]'),
  '22023', NULL, 'a rule set without a rank key is refused');
SELECT throws_ok(pg_temp.close_sql(pg_temp.open_form(401), pg_temp.today(),
  '{"rank": null, "mos": [], "role": [], "groupIds": [], "ranks": ["SPC"]}', 'same', '{"rows": []}', '[]'),
  '22023', NULL, 'a rule set with an extra key is refused');
SELECT is(pg_temp.roster_state(), (SELECT state FROM state_before), 'refused rules change nothing');
SELECT throws_ok(format($$INSERT INTO public.assignment_types (organization_id, name, short_name, assign_to, roster_pool_rules)
  VALUES (%L, 'Bad Rules', 'BR', 'personnel', '{}')$$, pg_temp.id(101)),
  '23514', NULL, 'a type cannot be inserted with malformed rules');

SELECT lives_ok(pg_temp.close_sql(pg_temp.open_form(401), pg_temp.today(), '{"rank": {"from": "SPC", "to": "SGT"}, "mos": ["68W"], "role": [], "groupIds": []}', 'separate',
  '{"rows": [{"name": "Able", "count": 4}]}', jsonb_build_array(
    jsonb_build_object('personnel_id', pg_temp.id(301), 'track', 'weekday', 'count', 4, 'origin', 'carried'),
    jsonb_build_object('personnel_id', pg_temp.id(302), 'track', 'weekend', 'count', 1, 'origin', 'carried'),
    jsonb_build_object('personnel_id', pg_temp.id(399), 'track', 'weekday', 'count', 7, 'origin', 'carried'))),
  'a configurator closes the open form');
SELECT is((SELECT jsonb_build_array(starts_on - pg_temp.today(), ends_on - pg_temp.today(), record) FROM public.roster_forms
  WHERE id = (SELECT value FROM saved WHERE label = 'first form')),
  '[-10, 0, {"rows": [{"name": "Able", "count": 4}]}]', 'the closed form ends today with the record exactly as sent');
SELECT is((SELECT jsonb_build_array(starts_on - pg_temp.today(), rules) FROM public.roster_forms WHERE id = pg_temp.open_form(401)),
  '[1, {"pool": {"rank": {"from": "SPC", "to": "SGT"}, "mos": ["68W"], "role": [], "groupIds": []}, "weekendMode": "separate"}]', 'the next form opens tomorrow with the new rules');
SELECT is(pg_temp.starting_numbers(pg_temp.open_form(401)), '[[301, "weekday", 4, "carried"], [302, "weekend", 1, "carried"]]',
  'the next form starts from the carried counts of people who still exist');
SELECT is((SELECT jsonb_build_array(roster_pool_rules, roster_weekend_mode) FROM public.assignment_types WHERE id = pg_temp.id(401)),
  '[{"rank": {"from": "SPC", "to": "SGT"}, "mos": ["68W"], "role": [], "groupIds": []}, "separate"]', 'the type takes the new rules');
SELECT throws_ok(pg_temp.close_sql((SELECT value FROM saved WHERE label = 'first form'), pg_temp.today(), NULL, 'same',
  '{"rows": []}', '[]'), 'RSF01', NULL, 'a second close with the old form id fails');

-- A second change the same day edits the form that has not started.
INSERT INTO saved VALUES ('next form', pg_temp.open_form(401));
SELECT throws_ok(pg_temp.close_sql(pg_temp.open_form(401), pg_temp.today(), NULL, 'none', '{"rows": []}', '[]'),
  '22023', NULL, 'a form that has not started has no record to keep');
SELECT is((SELECT pg_temp.close_as_service_role(pg_temp.id(101), pg_temp.id(401), pg_temp.open_form(401), pg_temp.today(),
  NULL, 'none', NULL, jsonb_build_array(
    jsonb_build_object('personnel_id', pg_temp.id(301), 'track', 'all', 'count', 2, 'origin', 'typed')))),
  (SELECT value FROM saved WHERE label = 'next form'), 'a second change the same day keeps the form that has not started');
SELECT is((SELECT jsonb_agg(jsonb_build_array(starts_on - pg_temp.today(), ends_on IS NULL, rules) ORDER BY starts_on)
  FROM public.roster_forms WHERE assignment_type_id = pg_temp.id(401)),
  '[[-10, false, {"pool": null, "weekendMode": "same"}], [1, true, {"pool": null, "weekendMode": "none"}]]',
  'the closed form keeps its rules, the form that has not started takes the newest, and no form is added');
SELECT is(pg_temp.starting_numbers(pg_temp.open_form(401)), '[[301, "all", 2, "carried"]]',
  'the newest starting numbers replace the earlier ones');
SELECT is((SELECT jsonb_build_array(roster_pool_rules, roster_weekend_mode) FROM public.assignment_types WHERE id = pg_temp.id(401)),
  '[null, "none"]', 'the type takes the newest rules');

-- Rules and closed forms change only through close_roster_form.
SELECT throws_ok(format($$UPDATE public.assignment_types SET roster_pool_rules = '{"rank": null, "mos": [], "role": [], "groupIds": []}' WHERE id = %L$$, pg_temp.id(401)),
  '42501', NULL, 'a configurator cannot write pool rules directly');
SELECT throws_ok(format($$UPDATE public.assignment_types SET roster_weekend_mode = 'separate' WHERE id = %L$$, pg_temp.id(401)),
  '42501', NULL, 'a configurator cannot write the weekend mode directly');
SELECT throws_ok(format($$UPDATE public.roster_forms SET record = '{"rows": []}' WHERE id = %L$$,
  (SELECT value FROM saved WHERE label = 'first form')), '42501', NULL, 'a configurator cannot change a closed form');
SELECT throws_ok(format($$DELETE FROM public.roster_forms WHERE id = %L$$, (SELECT value FROM saved WHERE label = 'first form')),
  '42501', NULL, 'a configurator cannot remove a closed form');
SELECT throws_ok(format($$UPDATE public.roster_starting_numbers SET count = 9 WHERE form_id = %L$$, pg_temp.open_form(401)),
  '42501', NULL, 'a configurator cannot edit a carried starting number');
SELECT throws_ok(format($$DELETE FROM public.roster_starting_numbers WHERE form_id = %L$$, pg_temp.open_form(401)),
  '42501', NULL, 'a configurator cannot remove a carried starting number');

-- Every person-assigned type has one open form.
SELECT lives_ok(format($$INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to)
  VALUES (%L, %L, 'Fire Guard', 'FG', 'personnel'), (%L, %L, 'Area Beautification', 'AB', 'group')$$,
  pg_temp.id(404), pg_temp.id(101), pg_temp.id(405), pg_temp.id(101)), 'a configurator adds a person and a Group type');
SELECT is((SELECT jsonb_agg(jsonb_build_array(starts_on - pg_temp.today(), ends_on, rules)) FROM public.roster_forms
  WHERE assignment_type_id = pg_temp.id(404)), '[[0, null, {"pool": null, "weekendMode": "same"}]]',
  'a new person-assigned type has one open form from today');
SELECT is((SELECT count(*)::integer FROM public.roster_forms WHERE assignment_type_id = pg_temp.id(405)), 0,
  'a new Group type has no form');
UPDATE public.assignment_types SET assign_to = 'personnel' WHERE id = pg_temp.id(405);
SELECT is((SELECT count(*)::integer FROM public.roster_forms WHERE assignment_type_id = pg_temp.id(405) AND ends_on IS NULL), 1,
  'a Group type switched to person-assigned has exactly one open form');

-- A switch to Group closes the open form through close_roster_form.
SELECT throws_ok(format($$UPDATE public.assignment_types SET assign_to = 'group' WHERE id = %L$$, pg_temp.id(405)),
  '55000', NULL, 'a type with an open form cannot become a Group assignment directly');
SELECT throws_ok(format('SELECT pg_temp.close_as_service_role(%L, %L, %L, %L, NULL, NULL, %L, %L)', pg_temp.id(101), pg_temp.id(403),
  pg_temp.open_form(403), pg_temp.today(), '{"rows": []}', jsonb_build_array(
    jsonb_build_object('personnel_id', pg_temp.id(301), 'track', 'all', 'count', 1, 'origin', 'carried'))),
  '22023', NULL, 'ending a roster carries nothing');
INSERT INTO saved VALUES ('ended form', pg_temp.open_form(403));
SELECT is((SELECT pg_temp.close_as_service_role(pg_temp.id(101), pg_temp.id(403), pg_temp.open_form(403), pg_temp.today(),
  NULL, NULL, '{"rows": [{"name": "Able", "count": 3}]}', '[]')), NULL::uuid, 'a configurator ends a roster');
SELECT is((SELECT jsonb_build_array(f.ends_on - pg_temp.today(), f.record, t.assign_to)
  FROM public.roster_forms f JOIN public.assignment_types t ON t.id = f.assignment_type_id
  WHERE f.id = (SELECT value FROM saved WHERE label = 'ended form')),
  '[0, {"rows": [{"name": "Able", "count": 3}]}, "group"]',
  'the form closes today with its record and the type becomes a Group assignment');
SELECT is(pg_temp.starting_numbers((SELECT value FROM saved WHERE label = 'ended form')), '[[301, "all", 3, "typed"]]',
  'the closed form keeps its starting numbers');
SELECT is(pg_temp.open_form(403), NULL, 'a Group type holds no open form');
UPDATE public.assignment_types SET assign_to = 'personnel' WHERE id = pg_temp.id(403);
SELECT is((SELECT jsonb_agg(jsonb_build_array(starts_on - pg_temp.today(), ends_on - pg_temp.today()) ORDER BY starts_on)
  FROM public.roster_forms WHERE assignment_type_id = pg_temp.id(403)), '[[0, 0], [1, null]]',
  'a switch back to Person opens a fresh form the day after the closed one');
SELECT is((SELECT pg_temp.close_as_service_role(pg_temp.id(101), pg_temp.id(403), pg_temp.open_form(403), pg_temp.today(),
  NULL, NULL, NULL, '[]')), NULL::uuid, 'a configurator ends a roster whose form has not started');
SELECT is((SELECT jsonb_build_array(count(*), bool_and(ends_on IS NOT NULL)) FROM public.roster_forms
  WHERE assignment_type_id = pg_temp.id(403)), '[1, true]', 'a form that had not started is removed and the closed one stays');

-- Deleting a type or a Person still removes its forms and starting numbers.
SELECT lives_ok(format('DELETE FROM public.assignment_types WHERE id = %L', pg_temp.id(403)),
  'a configurator deletes a type with a closed form');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.roster_forms WHERE assignment_type_id = pg_temp.id(403)), 0,
  'deleting a type removes its forms');

-- Duty days whose assignee was deleted.
INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id) VALUES
  (pg_temp.id(101), pg_temp.id(401), pg_temp.today() - 3, pg_temp.id(301)::text),
  (pg_temp.id(101), pg_temp.id(401), pg_temp.today() - 2, pg_temp.id(305)::text),
  (pg_temp.id(101), pg_temp.id(401), pg_temp.today() - 1, pg_temp.id(302)::text),
  (pg_temp.id(101), pg_temp.id(404), pg_temp.today() - 1, pg_temp.id(305)::text);
DELETE FROM public.personnel WHERE id = pg_temp.id(305);
CREATE FUNCTION pg_temp.detail_days(type_id integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(d.date - pg_temp.today(), right(d.assignee_id, 3)) ORDER BY d.date), '[]')
  FROM public.list_roster_detail_days(pg_temp.id(101), pg_temp.id(type_id), pg_temp.today() - 10, pg_temp.today()) d;
$$;
SELECT pg_temp.act(2);
SELECT is((SELECT count(*)::integer FROM public.daily_assignments WHERE assignment_type_id = pg_temp.id(401)), 2,
  'the assignment read hides the day of a deleted assignee');
SELECT is(pg_temp.detail_days(401), '[[-3, "301"], [-2, "305"], [-1, "302"]]',
  'a configurator reads every duty day of the type, the deleted assignee''s included');
SELECT pg_temp.act(6);
SELECT is(pg_temp.detail_days(401), '[[-3, "301"], [-2, "305"]]',
  'a Group-scoped viewer reads the days of people they see and of deleted people, not of people outside their scope');
SELECT pg_temp.act(4);
SELECT throws_ok(format('SELECT * FROM public.list_roster_detail_days(%L, %L, %L, %L)', pg_temp.id(101), pg_temp.id(401),
  pg_temp.today() - 10, pg_temp.today()), '42501', NULL, 'another Organization''s member cannot read the duty days');

-- Person attribute history, written by an ordinary member with Personnel configure.
RESET ROLE;
UPDATE public.personnel_attribute_history SET effective_on = '2026-01-05' WHERE personnel_id IN (pg_temp.id(302), pg_temp.id(303));
SELECT pg_temp.act(5);
SELECT lives_ok(format($$INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug, created_at)
  VALUES (%L, %L, 'PV2', 'Roster', 'Delta', 'roster-settings-delta', '2020-03-05T12:00:00Z')$$, pg_temp.id(304), pg_temp.id(101)),
  'a Personnel configurator adds a Person');
SELECT is(pg_temp.history(304), '[[0, "PV2", false]]', 'adding a Person records their attributes from today, whatever created_at says');
SELECT lives_ok(format($$UPDATE public.personnel SET rank = 'SSG' WHERE id = %L$$, pg_temp.id(302)),
  'a Personnel configurator promotes a Person');
SELECT is(pg_temp.history(302), format('[[%s, "SGT", false], [0, "SSG", false]]', '2026-01-05'::date - pg_temp.today())::jsonb,
  'a rank change records the new rank from today');
SELECT lives_ok(format($$UPDATE public.personnel SET first_name = 'Renamed', rank = 'SSG' WHERE id = %L$$, pg_temp.id(302)),
  'a Personnel configurator renames a Person');
SELECT is(jsonb_array_length(pg_temp.history(302)), 2, 'a change to nothing tracked records nothing');
SELECT lives_ok(format($$UPDATE public.personnel SET archived_at = now() WHERE id = %L$$, pg_temp.id(303)),
  'a Personnel configurator archives a Person');
SELECT is(pg_temp.history(303), format('[[%s, "PFC", false], [0, "PFC", true]]', '2026-01-05'::date - pg_temp.today())::jsonb,
  'archiving records the Person as archived from today');
SELECT lives_ok(format($$UPDATE public.personnel SET archived_at = NULL WHERE id = %L$$, pg_temp.id(303)),
  'a Personnel configurator restores a Person');
SELECT is(pg_temp.history(303), format('[[%s, "PFC", false], [0, "PFC", false]]', '2026-01-05'::date - pg_temp.today())::jsonb,
  'restoring the same day records the Person as active again from today');
SELECT throws_ok(format($$INSERT INTO public.personnel_attribute_history
  (organization_id, personnel_id, effective_on, rank, mos, clinic_role, archived)
  VALUES (%L, %L, '2026-06-01', 'COL', '', '', false)$$, pg_temp.id(101), pg_temp.id(301)),
  '42501', NULL, 'a Personnel configurator cannot write attribute history');
SELECT throws_ok(format($$UPDATE public.personnel_attribute_history SET rank = 'COL' WHERE personnel_id = %L$$, pg_temp.id(301)),
  '42501', NULL, 'a Personnel configurator cannot rewrite attribute history');
SELECT throws_ok(format($$DELETE FROM public.personnel_attribute_history WHERE personnel_id = %L$$, pg_temp.id(301)),
  '42501', NULL, 'a Personnel configurator cannot delete attribute history');

SELECT pg_temp.act(1);
SELECT is(jsonb_array_length(pg_temp.history(302)), 2, 'an owner reads the attribute history of their people');
SELECT throws_ok(format($$INSERT INTO public.personnel_attribute_history
  (organization_id, personnel_id, effective_on, rank, mos, clinic_role, archived)
  VALUES (%L, %L, '2026-06-01', 'COL', '', '', false)$$, pg_temp.id(101), pg_temp.id(301)),
  '42501', NULL, 'an owner cannot write attribute history');
SELECT lives_ok(format($$UPDATE public.personnel SET archived_at = now() WHERE id = %L$$, pg_temp.id(301)),
  'an owner archives a Person with carried starting numbers');
SELECT lives_ok(format('DELETE FROM public.personnel WHERE id = %L', pg_temp.id(301)), 'an owner deletes that Person');
SELECT is(pg_temp.starting_numbers(pg_temp.open_form(401)), '[]', 'deleting a Person removes their starting numbers');
SELECT pg_temp.act(3);
SELECT is((SELECT count(*)::integer FROM public.personnel_attribute_history WHERE organization_id = pg_temp.id(101)), 5,
  'a Calendar viewer reads the attribute history of the people they can see');
SELECT pg_temp.act(4);
SELECT is((SELECT count(*)::integer FROM public.personnel_attribute_history WHERE organization_id = pg_temp.id(101)), 0,
  'a viewer of another Organization reads none of its attribute history');

SELECT * FROM finish();
ROLLBACK;
