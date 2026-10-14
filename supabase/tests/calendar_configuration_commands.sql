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

CREATE FUNCTION pg_temp.denied(actor integer, label text) RETURNS SETOF text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.act(actor);
  RETURN NEXT throws_ok(format($q$SELECT public.reset_federal_holidays(%L, '[{"date":"2030-01-01","name":"Denied"}]')$q$,
    pg_temp.id(101)), '42501', 'Calendar configuration is not allowed', label || ' cannot reset holidays');
  RETURN NEXT throws_ok(format($q$SELECT public.set_assignment_type_date_header(%L, %L)$q$, pg_temp.id(101), pg_temp.id(402)),
    '42501', 'Calendar configuration is not allowed', label || ' cannot choose the date header');
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
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to, show_in_date_header, archived_at) VALUES
(pg_temp.id(401), pg_temp.id(101), 'Staff', 'STF', 'personnel', true, NULL),
(pg_temp.id(402), pg_temp.id(101), 'Group', 'GRP', 'group', false, NULL),
(pg_temp.id(403), pg_temp.id(101), 'Retiring', 'RET', 'personnel', false, NULL),
(pg_temp.id(404), pg_temp.id(101), 'Legacy', 'LEG', 'personnel', false, '2026-01-01T00:00:00Z'),
(pg_temp.id(411), pg_temp.id(102), 'Bravo Staff', 'BST', 'personnel', true, NULL);

CREATE FUNCTION pg_temp.federal(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(date, name) ORDER BY date, name), '[]')
  FROM public.special_days WHERE organization_id = pg_temp.id(org) AND type = 'federal-holiday';
$$;
CREATE FUNCTION pg_temp.days(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]') FROM public.special_days d
  WHERE d.organization_id = pg_temp.id(org);
$$;
CREATE FUNCTION pg_temp.headers(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(name ORDER BY name), '[]') FROM public.assignment_types
  WHERE organization_id = pg_temp.id(org) AND show_in_date_header;
$$;
CREATE FUNCTION pg_temp.types(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.assignment_types t
  WHERE t.organization_id = pg_temp.id(org);
$$;
CREATE FUNCTION pg_temp.write_header_flag(type_id integer, flag boolean) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.assignment_types SET show_in_date_header = flag WHERE id = pg_temp.id(type_id);
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
SELECT ok(NOT has_function_privilege('anon', 'public.set_assignment_type_date_header(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.set_assignment_type_date_header(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.set_assignment_type_date_header(uuid, uuid)', 'EXECUTE'),
  'only authenticated can execute the header choice');
SELECT is((SELECT jsonb_agg(prosecdef ORDER BY proname) FROM pg_proc
  WHERE proname IN ('reset_federal_holidays', 'set_assignment_type_date_header')
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
SELECT throws_ok(format($$SELECT public.set_assignment_type_date_header(%L, %L)$$, pg_temp.id(101), pg_temp.id(402)),
  '42501', 'Calendar configuration is not allowed', 'a configurator of a suspended Organization cannot choose the date header');
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
SELECT lives_ok(format($$SELECT public.set_assignment_type_date_header(%L, %L)$$, pg_temp.id(101), pg_temp.id(402)),
  'a configurator switches the header from Staff to Group');
RESET ROLE;
SELECT is(pg_temp.headers(101), '["Group"]', 'Group is the only Alpha header');
SELECT is(pg_temp.headers(102), '["Bravo Staff"]', 'the Bravo header is untouched');
SELECT pg_temp.act(1);
SELECT lives_ok(format($$SELECT public.set_assignment_type_date_header(%L, %L)$$, pg_temp.id(101), pg_temp.id(402)),
  'choosing the current header again succeeds');
RESET ROLE;
SELECT is(pg_temp.headers(101), '["Group"]', 'choosing the current header changes nothing');

INSERT INTO snapshots VALUES ('before-missing-target', pg_temp.types(101) || pg_temp.types(102));
SELECT pg_temp.act(1);
SELECT throws_ok(format($$SELECT public.set_assignment_type_date_header(%L, %L)$$, pg_temp.id(101), target),
  'P0002', 'Assignment type not found', label)
FROM (VALUES
  (pg_temp.id(499), 'an unknown type is not found'),
  (pg_temp.id(411), 'a Bravo type is not found from Alpha'),
  (pg_temp.id(404), 'an archived type is not found')
) AS missing(target, label);
SELECT throws_ok(format($$SELECT public.set_assignment_type_date_header(%L, NULL)$$, pg_temp.id(101)),
  '22023', 'Choose an assignment type', 'a missing type is rejected rather than clearing the header');
RESET ROLE;
SELECT is(pg_temp.types(101) || pg_temp.types(102), (SELECT value FROM snapshots WHERE label = 'before-missing-target'),
  'rejected choices clear nothing');

UPDATE public.assignment_types SET show_in_date_header = false WHERE id = pg_temp.id(402);
UPDATE public.assignment_types SET show_in_date_header = true WHERE id = pg_temp.id(404);
SELECT pg_temp.act(1);
SELECT lives_ok(format($$SELECT public.set_assignment_type_date_header(%L, %L)$$, pg_temp.id(101), pg_temp.id(403)),
  'choosing an active type succeeds over a legacy archived header');
RESET ROLE;
SELECT is(pg_temp.headers(101), '["Retiring"]', 'the legacy archived header is cleared');

UPDATE public.assignment_types SET show_in_date_header = false WHERE organization_id = pg_temp.id(101);
SELECT pg_temp.act(1);
SELECT lives_ok(format($$SELECT public.set_assignment_type_date_header(%L, %L)$$, pg_temp.id(101), pg_temp.id(401)),
  'an Organization with no header gets one');
RESET ROLE;
SELECT is(pg_temp.headers(101), '["Staff"]', 'Staff becomes the header from none');

CREATE FUNCTION public.t1643_fail_header_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = 'c1643055-0000-4000-8000-000000000402' AND NEW.show_in_date_header THEN
    RAISE EXCEPTION 'synthetic header failure with % headers left', (
      SELECT count(*) FROM public.assignment_types
      WHERE organization_id = NEW.organization_id AND show_in_date_header
    ) USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER t1643_fail_header_set BEFORE UPDATE ON public.assignment_types
  FOR EACH ROW EXECUTE FUNCTION public.t1643_fail_header_set();
INSERT INTO snapshots VALUES ('before-header-fault', pg_temp.types(101));
SELECT pg_temp.act(1);
SELECT throws_ok(format($$SELECT public.set_assignment_type_date_header(%L, %L)$$, pg_temp.id(101), pg_temp.id(402)),
  '23514', 'synthetic header failure with 0 headers left',
  'the set fails inside the command after the clear removed the previous header');
RESET ROLE;
DROP TRIGGER t1643_fail_header_set ON public.assignment_types;
DROP FUNCTION public.t1643_fail_header_set();
SELECT is(pg_temp.types(101), (SELECT value FROM snapshots WHERE label = 'before-header-fault'),
  'the failed choice keeps Staff as the header and every type unchanged');

SELECT pg_temp.act(1);
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to)
VALUES (pg_temp.id(405), pg_temp.id(101), 'Added', 'ADD', 'personnel');
DELETE FROM public.assignment_types WHERE id = pg_temp.id(401);
RESET ROLE;
SELECT is((SELECT show_in_date_header FROM public.assignment_types WHERE id = pg_temp.id(405)), false,
  'a directly created type starts without the header');
SELECT is(pg_temp.headers(101), '[]', 'deleting the header type leaves no header');
SELECT pg_temp.act(1);
SELECT is(pg_temp.write_header_flag(405, true), 1,
  'a configurator keeps direct header-flag authority on the table');
SELECT pg_temp.act(3);
SELECT is(pg_temp.write_header_flag(405, false), 0,
  'a Calendar operator still cannot write the table directly');
RESET ROLE;
SELECT is(pg_temp.headers(101), '["Added"]', 'only the configurator direct write took effect');

SELECT * FROM finish();
ROLLBACK;
