BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('c1643055-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act(actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', CASE WHEN actor IS NULL THEN '' ELSE pg_temp.id(actor)::text END, true);
END; $$;

CREATE FUNCTION pg_temp.lanes_sql(lane_ids integer[], expected_ids integer[], org integer DEFAULT 101) RETURNS text
LANGUAGE sql AS $$
  SELECT format('SELECT public.set_calendar_lanes(%L, %L::uuid[], %L::uuid[])', pg_temp.id(org),
    (SELECT coalesce(array_agg(pg_temp.id(n) ORDER BY i), '{}') FROM unnest(lane_ids) WITH ORDINALITY AS l(n, i)),
    (SELECT coalesce(array_agg(pg_temp.id(n) ORDER BY i), '{}') FROM unnest(expected_ids) WITH ORDINALITY AS e(n, i)));
$$;
CREATE FUNCTION pg_temp.denied(actor integer, label text) RETURNS SETOF text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.act(actor);
  RETURN NEXT throws_ok(format($q$SELECT public.reset_federal_holidays(%L, '[{"date":"2030-01-01","name":"Denied"}]')$q$,
    pg_temp.id(101)), '42501', 'Calendar configuration is not allowed', label || ' cannot reset holidays');
  RETURN NEXT throws_ok(pg_temp.lanes_sql(ARRAY[402, 401], ARRAY[401]),
    '42501', 'Calendar configuration is not allowed', label || ' cannot set the calendar lanes');
END; $$;

INSERT INTO auth.users (id, email)
SELECT pg_temp.id(n), 'calendar-commands-' || n || '@example.test' FROM generate_series(1, 7) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
(pg_temp.id(101), 'Calendar Alpha', pg_temp.id(1)),
(pg_temp.id(102), 'Calendar Bravo', pg_temp.id(6));
INSERT INTO public.groups (id, organization_id, name) VALUES (pg_temp.id(201), pg_temp.id(101), 'Scoped Group');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT org, pg_temp.id(actor), 'member'::public.organization_role, 'viewer',
  jsonb_build_object('calendar', capability, 'personnel', 'none', 'training', 'none', 'onboarding', 'none'),
  scope_kind, CASE WHEN scope_kind = 'groups' THEN ARRAY[pg_temp.id(201)] ELSE ARRAY[]::uuid[] END
FROM (VALUES
  (pg_temp.id(101), 1, 'configure', 'organization'),
  (pg_temp.id(101), 2, 'view', 'organization'),
  (pg_temp.id(101), 3, 'operate', 'organization'),
  (pg_temp.id(101), 4, 'configure', 'groups'),
  (pg_temp.id(102), 6, 'configure', 'organization'),
  (pg_temp.id(101), 7, 'configure', 'organization')
) AS actors(org, actor, capability, scope_kind);
INSERT INTO public.user_suspensions (user_id, suspended_by, reason) VALUES (pg_temp.id(7), pg_temp.id(1), 'synthetic');

INSERT INTO public.special_days (id, organization_id, date, name, type) VALUES
(pg_temp.id(301), pg_temp.id(101), '2019-07-04', 'Old Independence Day', 'federal-holiday'),
(pg_temp.id(302), pg_temp.id(101), '2026-07-03', 'Custom Independence Day', 'federal-holiday'),
(pg_temp.id(303), pg_temp.id(101), '2026-08-14', 'Alpha Stand-down', 'org-closure'),
(pg_temp.id(311), pg_temp.id(102), '2026-07-03', 'Bravo Independence Day', 'federal-holiday'),
(pg_temp.id(312), pg_temp.id(102), '2026-09-01', 'Bravo Closure', 'org-closure');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to, show_on_calendar, sort_order, archived_at) VALUES
(pg_temp.id(401), pg_temp.id(101), 'Staff', 'STF', 'personnel', true, 0, NULL),
(pg_temp.id(402), pg_temp.id(101), 'Group', 'GRP', 'group', false, 4, NULL),
(pg_temp.id(403), pg_temp.id(101), 'Retiring', 'RET', 'personnel', false, 2, NULL),
(pg_temp.id(404), pg_temp.id(101), 'Legacy', 'LEG', 'personnel', false, 1, '2026-01-01T00:00:00Z'),
(pg_temp.id(406), pg_temp.id(101), 'Planner', 'PLN', 'personnel', false, 7, NULL),
(pg_temp.id(411), pg_temp.id(102), 'Bravo Staff', 'BST', 'personnel', true, 0, NULL);

CREATE FUNCTION pg_temp.federal(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(date, name) ORDER BY date, name), '[]')
  FROM public.special_days WHERE organization_id = pg_temp.id(org) AND type = 'federal-holiday';
$$;
CREATE FUNCTION pg_temp.days(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]') FROM public.special_days d
  WHERE d.organization_id = pg_temp.id(org);
$$;
CREATE FUNCTION pg_temp.lanes(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(name ORDER BY sort_order, id), '[]') FROM public.assignment_types
  WHERE organization_id = pg_temp.id(org) AND show_on_calendar AND archived_at IS NULL;
$$;
CREATE FUNCTION pg_temp.types(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.assignment_types t
  WHERE t.organization_id = pg_temp.id(org);
$$;
CREATE FUNCTION pg_temp.write_lane_flag(type_id integer, flag boolean) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.assignment_types SET show_on_calendar = flag WHERE id = pg_temp.id(type_id);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END; $$;
CREATE TEMP TABLE snapshots(label text PRIMARY KEY, value jsonb);
CREATE TEMP TABLE returned(label text, id uuid, date date, name text, type text, organization_id uuid);
GRANT ALL ON snapshots, returned TO authenticated;

SELECT ok(NOT has_function_privilege('anon', 'public.reset_federal_holidays(uuid, jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.reset_federal_holidays(uuid, jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.reset_federal_holidays(uuid, jsonb)', 'EXECUTE'),
  'only authenticated can execute the reset');
SELECT ok(NOT has_function_privilege('anon', 'public.set_calendar_lanes(uuid, uuid[], uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.set_calendar_lanes(uuid, uuid[], uuid[])', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.set_calendar_lanes(uuid, uuid[], uuid[])', 'EXECUTE'),
  'only authenticated can execute the lane command');
SELECT hasnt_function('public', 'set_assignment_type_date_header', 'the single date-header command is gone');
SELECT hasnt_index('public', 'assignment_types', 'assignment_types_one_header_per_org', 'the one-header index is gone');
SELECT is((SELECT jsonb_agg(prosecdef ORDER BY proname) FROM pg_proc
  WHERE proname IN ('reset_federal_holidays', 'set_calendar_lanes')
    AND pronamespace = 'public'::regnamespace), '[false, false]', 'both commands run as the invoker');

INSERT INTO snapshots VALUES ('before-denials', jsonb_build_object(
  'a', pg_temp.days(101), 'b', pg_temp.days(102), 'ta', pg_temp.types(101), 'tb', pg_temp.types(102)));
SELECT pg_temp.denied(actor, label)
FROM (VALUES
  (NULL::integer, 'no signed-in user'),
  (2, 'a Calendar viewer'),
  (3, 'a Calendar operator'),
  (4, 'a Group-scoped configurator'),
  (5, 'a non-member'),
  (6, 'a foreign Organization configurator'),
  (7, 'a suspended user')
) AS denied(actor, label);
RESET ROLE;
UPDATE public.organizations SET suspended_at = now() WHERE id = pg_temp.id(101);
SELECT pg_temp.act(1);
SELECT throws_ok(format($$SELECT public.reset_federal_holidays(%L, '[{"date":"2030-01-01","name":"Denied"}]')$$, pg_temp.id(101)),
  '42501', 'Calendar configuration is not allowed', 'a configurator of a suspended Organization cannot reset holidays');
SELECT throws_ok(pg_temp.lanes_sql(ARRAY[402, 401], ARRAY[401]),
  '42501', 'Calendar configuration is not allowed', 'a configurator of a suspended Organization cannot set the calendar lanes');
RESET ROLE;
UPDATE public.organizations SET suspended_at = NULL WHERE id = pg_temp.id(101);
SELECT is(jsonb_build_object('a', pg_temp.days(101), 'b', pg_temp.days(102), 'ta', pg_temp.types(101), 'tb', pg_temp.types(102)),
  (SELECT value FROM snapshots WHERE label = 'before-denials'), 'denied calls change no day or type in either Organization');

SELECT pg_temp.act(1);
INSERT INTO returned SELECT 'reset', id, date, name, type, organization_id FROM public.reset_federal_holidays(pg_temp.id(101),
  '[{"date":"2027-01-01","name":"New Year''s Day"},{"date":"2026-12-25","name":"Christmas Day"}]');
RESET ROLE;
SELECT results_eq($$SELECT date, name, type, organization_id FROM returned WHERE label = 'reset'$$,
  $$VALUES ('2026-12-25'::date, 'Christmas Day'::text, 'federal-holiday'::text, pg_temp.id(101)),
           ('2027-01-01', 'New Year''s Day', 'federal-holiday', pg_temp.id(101))$$,
  'the reset returns exactly the inserted federal rows in date order');
SELECT is(pg_temp.federal(101), '[["2026-12-25","Christmas Day"],["2027-01-01","New Year''s Day"]]',
  'every Alpha federal row in every year is replaced by the payload');
SELECT set_eq($$SELECT id FROM public.special_days WHERE organization_id = pg_temp.id(101) AND type = 'federal-holiday'$$,
  $$SELECT id FROM returned WHERE label = 'reset'$$, 'the returned IDs are the stored IDs');
SELECT is((SELECT count(*)::integer FROM returned WHERE id IN (pg_temp.id(301), pg_temp.id(302))), 0, 'the reset rows are new');
SELECT is((SELECT to_jsonb(d) - 'created_at' FROM public.special_days d WHERE id = pg_temp.id(303)),
  jsonb_build_object('id', pg_temp.id(303), 'organization_id', pg_temp.id(101), 'date', '2026-08-14',
    'name', 'Alpha Stand-down', 'type', 'org-closure'), 'the Alpha closure keeps its ID and content');
SELECT is(pg_temp.days(102), (SELECT value->'b' FROM snapshots WHERE label = 'before-denials'), 'Bravo days are untouched');

SELECT pg_temp.act(1);
SELECT is((SELECT count(*)::integer FROM public.reset_federal_holidays(pg_temp.id(101),
  '[{"date":"2027-01-01","name":"New Year''s Day"},{"date":"2026-12-25","name":"Christmas Day"}]')), 2,
  'repeating the reset succeeds');
RESET ROLE;
SELECT is(pg_temp.federal(101), '[["2026-12-25","Christmas Day"],["2027-01-01","New Year''s Day"]]',
  'a repeated reset converges on one default set');

INSERT INTO snapshots VALUES ('before-invalid-reset', pg_temp.days(101));
SELECT pg_temp.act(1);
SELECT throws_ok(format($$SELECT public.reset_federal_holidays(%L, %L)$$, pg_temp.id(101), payload),
  '22023', 'Invalid federal holiday defaults', label)
FROM (VALUES
  ('[]'::jsonb, 'an empty payload cannot turn reset into a wipe'),
  ('{"date":"2030-01-01","name":"Object"}', 'a non-array payload is rejected'),
  ('["2030-01-01"]', 'a non-object element is rejected'),
  ((SELECT jsonb_agg(jsonb_build_object('date', '2030-01-01', 'name', 'Day ' || n)) FROM generate_series(1, 501) AS n),
    'more than 500 rows are rejected')
) AS invalid(payload, label);
SELECT throws_ok(format($$SELECT public.reset_federal_holidays(%L, NULL)$$, pg_temp.id(101)),
  '22023', 'Invalid federal holiday defaults', 'a missing payload is rejected');
SELECT throws_ok(format($$SELECT public.reset_federal_holidays(%L, '[{"date":"2030-02-30","name":"Bad date"}]')$$, pg_temp.id(101)),
  '22008', NULL, 'an impossible date fails the reset');
SELECT throws_ok(format($$SELECT public.reset_federal_holidays(%L, '[{"date":"2030-03-01"}]')$$, pg_temp.id(101)),
  '23502', NULL, 'a missing name fails the reset');
RESET ROLE;
SELECT is(pg_temp.days(101), (SELECT value FROM snapshots WHERE label = 'before-invalid-reset'),
  'invalid payloads change no Alpha day');

CREATE FUNCTION public.t1643_fail_federal_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name = 'Fault Day' THEN
    RAISE EXCEPTION 'synthetic federal insert failure with % earlier federal rows left', (
      SELECT count(*) FROM public.special_days
      WHERE organization_id = NEW.organization_id AND type = 'federal-holiday' AND date < '2030-01-01'
    ) USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER t1643_fail_federal_insert BEFORE INSERT ON public.special_days
  FOR EACH ROW EXECUTE FUNCTION public.t1643_fail_federal_insert();
INSERT INTO snapshots VALUES ('before-reset-fault', pg_temp.days(101));
SELECT pg_temp.act(1);
SELECT throws_ok(format($$SELECT public.reset_federal_holidays(%L,
  '[{"date":"2030-01-01","name":"Fine Day"},{"date":"2030-01-02","name":"Fault Day"}]')$$, pg_temp.id(101)),
  '23514', 'synthetic federal insert failure with 0 earlier federal rows left',
  'the insert fails inside the command after the DELETE removed every federal row');
RESET ROLE;
DROP TRIGGER t1643_fail_federal_insert ON public.special_days;
DROP FUNCTION public.t1643_fail_federal_insert();
SELECT is(pg_temp.days(101), (SELECT value FROM snapshots WHERE label = 'before-reset-fault'),
  'the failed reset leaves every previous Alpha day, ID and closure in place');

SELECT pg_temp.act(1);
SELECT lives_ok(pg_temp.lanes_sql(ARRAY[403, 401, 402], ARRAY[401]), 'a configurator shows three lanes in a chosen order');
RESET ROLE;
SELECT is(pg_temp.lanes(101), '["Retiring", "Staff", "Group"]', 'the lanes follow the chosen order');
SELECT is((SELECT jsonb_agg(jsonb_build_array(name, show_on_calendar, sort_order) ORDER BY name) FROM public.assignment_types
  WHERE organization_id = pg_temp.id(101)),
  '[["Group", true, 2], ["Legacy", false, 1], ["Planner", false, 7], ["Retiring", true, 0], ["Staff", true, 1]]',
  'lanes are ranked 0..2 and planner-only and archived types keep their order');
SELECT is(pg_temp.lanes(102), '["Bravo Staff"]', 'the Bravo lanes are untouched');

CREATE TEMP TABLE type_writes(id uuid);
GRANT ALL ON type_writes TO authenticated;
CREATE FUNCTION pg_temp.record_type_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO type_writes VALUES (NEW.id);
  RETURN NEW;
END; $$;
CREATE TRIGGER record_type_write AFTER UPDATE ON public.assignment_types
  FOR EACH ROW EXECUTE FUNCTION pg_temp.record_type_write();
SELECT pg_temp.act(1);
SELECT lives_ok(pg_temp.lanes_sql(ARRAY[403, 401, 402], ARRAY[401]),
  'a replay after a lost reply succeeds although its expected lanes are stale');
SELECT is(pg_temp.lanes(101), '["Retiring", "Staff", "Group"]',
  'the recovery read under the actor''s row security returns the saved lanes in order');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM type_writes), 0, 'the replay writes no row');
DROP TRIGGER record_type_write ON public.assignment_types;

INSERT INTO snapshots VALUES ('before-stale', pg_temp.types(101));
SELECT pg_temp.act(1);
SELECT throws_ok(pg_temp.lanes_sql(ARRAY[401, 403], ARRAY[401]), 'CLN01', 'Calendar lanes changed',
  'a different change from a stale view is a conflict');
SELECT throws_ok(pg_temp.lanes_sql(ARRAY[401, 403, 402], ARRAY[403, 402, 401]), 'CLN01', 'Calendar lanes changed',
  'the same lanes in another expected order are a conflict');
RESET ROLE;
SELECT is(pg_temp.types(101), (SELECT value FROM snapshots WHERE label = 'before-stale'), 'a conflict changes no type');

SELECT pg_temp.act(1);
SELECT lives_ok(pg_temp.lanes_sql(ARRAY[402, 403], ARRAY[403, 401, 402]), 'a configurator reorders and removes a lane');
RESET ROLE;
SELECT is(pg_temp.lanes(101), '["Group", "Retiring"]', 'the removed lane is hidden and the rest are reordered');
SELECT is((SELECT sort_order FROM public.assignment_types WHERE id = pg_temp.id(401)), 1,
  'a removed lane keeps its last rank');

INSERT INTO snapshots VALUES ('before-invalid-lanes', pg_temp.types(101));
SELECT pg_temp.act(1);
SELECT throws_ok(format('SELECT public.set_calendar_lanes(%L, %s, %s)', pg_temp.id(101), lanes, expected),
  '22023', 'Choose the assignment types to show on the calendar', label)
FROM (VALUES
  ('NULL', format('ARRAY[%L]::uuid[]', pg_temp.id(402)), 'missing lanes are rejected'),
  (format('ARRAY[%L]::uuid[]', pg_temp.id(402)), 'NULL', 'a missing expected list is rejected'),
  (format('ARRAY[[%L],[%L]]::uuid[]', pg_temp.id(402), pg_temp.id(403)), 'ARRAY[]::uuid[]', 'a two-dimensional list is rejected'),
  (format('ARRAY[%L]::uuid[]', pg_temp.id(402)), format('ARRAY[[%L],[%L]]::uuid[]', pg_temp.id(402), pg_temp.id(403)),
    'a two-dimensional expected list is rejected'),
  (format('ARRAY[%L, NULL]::uuid[]', pg_temp.id(402)), 'ARRAY[]::uuid[]', 'a null lane is rejected'),
  (format('ARRAY[%L]::uuid[]', pg_temp.id(402)), format('ARRAY[NULL, %L]::uuid[]', pg_temp.id(402)), 'a null expected lane is rejected'),
  (format('ARRAY[%L, %L]::uuid[]', pg_temp.id(402), pg_temp.id(402)), 'ARRAY[]::uuid[]', 'a type cannot be two lanes')
) AS invalid(lanes, expected, label);
SELECT throws_ok(pg_temp.lanes_sql(ARRAY[402, 403, target], ARRAY[402, 403]), 'P0002', 'Assignment type not found', label)
FROM (VALUES
  (499, 'an unknown type is not found'),
  (411, 'a Bravo type is not found from Alpha'),
  (404, 'an archived type is not found')
) AS missing(target, label);
SELECT pg_temp.act(2);
SELECT throws_ok(pg_temp.lanes_sql(ARRAY[499], ARRAY[402, 403]), '42501', 'Calendar configuration is not allowed',
  'a viewer naming a missing type is denied before it learns the type is missing');
RESET ROLE;
SELECT is(pg_temp.types(101), (SELECT value FROM snapshots WHERE label = 'before-invalid-lanes'),
  'rejected lane lists change no type');

UPDATE public.assignment_types SET show_on_calendar = true WHERE id = pg_temp.id(404);
SELECT pg_temp.act(1);
SELECT lives_ok(pg_temp.lanes_sql(ARRAY[]::integer[], ARRAY[402, 403]), 'an empty list hides every lane');
RESET ROLE;
SELECT is((SELECT jsonb_agg(name ORDER BY name) FROM public.assignment_types
  WHERE organization_id = pg_temp.id(101) AND show_on_calendar), NULL, 'no type is shown, including a legacy archived one');
SELECT pg_temp.act(1);
SELECT lives_ok(pg_temp.lanes_sql(ARRAY[401], ARRAY[]::integer[]), 'an Organization with no lanes gets one');
RESET ROLE;
SELECT is(pg_temp.lanes(101), '["Staff"]', 'Staff becomes the only lane');

-- Authority is revoked while the final write runs. The trigger demotes the actor
-- as the first lane row changes.
CREATE FUNCTION public.t1683_revoke_during_lane_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.organization_id = 'c1643055-0000-4000-8000-000000000101' AND NEW.show_on_calendar THEN
    UPDATE public.organization_memberships
    SET capability_overrides = capability_overrides || '{"calendar":"view"}'
    WHERE organization_id = NEW.organization_id AND user_id = 'c1643055-0000-4000-8000-000000000001';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER t1683_revoke_during_lane_write BEFORE UPDATE ON public.assignment_types
  FOR EACH ROW EXECUTE FUNCTION public.t1683_revoke_during_lane_write();
INSERT INTO snapshots VALUES ('before-revoked-write', pg_temp.types(101));
SELECT pg_temp.act(1);
SELECT throws_ok(pg_temp.lanes_sql(ARRAY[402, 401], ARRAY[401]), '42501', 'Calendar configuration is not allowed',
  'authority revoked during the final write denies the change');
RESET ROLE;
DROP TRIGGER t1683_revoke_during_lane_write ON public.assignment_types;
DROP FUNCTION public.t1683_revoke_during_lane_write();
SELECT is(pg_temp.types(101), (SELECT value FROM snapshots WHERE label = 'before-revoked-write'),
  'the denied write leaves every type unchanged');
SELECT is((SELECT capability_overrides->>'calendar' FROM public.organization_memberships
  WHERE organization_id = pg_temp.id(101) AND user_id = pg_temp.id(1)), 'configure',
  'the revocation rolled back with the denied command');

SELECT pg_temp.act(1);
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to)
VALUES (pg_temp.id(405), pg_temp.id(101), 'Added', 'ADD', 'personnel');
RESET ROLE;
SELECT is((SELECT show_on_calendar FROM public.assignment_types WHERE id = pg_temp.id(405)), false,
  'a directly created type starts off the calendar');
SELECT pg_temp.act(1);
SELECT is(pg_temp.write_lane_flag(405, true), 1, 'a configurator keeps direct lane-flag authority on the table');
SELECT pg_temp.act(3);
SELECT is(pg_temp.write_lane_flag(405, false), 0, 'a Calendar operator still cannot write the table directly');
RESET ROLE;
SELECT is(pg_temp.lanes(101), '["Staff", "Added"]', 'only the configurator direct write took effect');

SELECT pg_temp.act(1);
SELECT lives_ok(pg_temp.lanes_sql(ARRAY[403, 401, 405], ARRAY[401, 405]), 'a configurator shows three lanes again');
DELETE FROM public.assignment_types WHERE id = pg_temp.id(401);
RESET ROLE;
SELECT is((SELECT jsonb_agg(jsonb_build_array(id, name) ORDER BY sort_order, id) FROM public.assignment_types
  WHERE organization_id = pg_temp.id(101) AND show_on_calendar AND archived_at IS NULL),
  jsonb_build_array(jsonb_build_array(pg_temp.id(403), 'Retiring'), jsonb_build_array(pg_temp.id(405), 'Added')),
  'deleting a shown lane keeps the other lanes and their order');
SELECT pg_temp.act(1);
SELECT lives_ok(pg_temp.lanes_sql(ARRAY[405, 403], ARRAY[403, 405]),
  'a configurator who read the lanes after the deletion can reorder them');
RESET ROLE;
SELECT is(pg_temp.lanes(101), '["Added", "Retiring"]', 'the reorder after the deletion is saved');

SELECT * FROM finish();
ROLLBACK;
