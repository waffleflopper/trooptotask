BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('c1686055-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act(actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', CASE WHEN actor IS NULL THEN '' ELSE pg_temp.id(actor)::text END, true);
END; $$;
CREATE FUNCTION pg_temp.add_sql(name text, dates text, org integer DEFAULT 101) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT * FROM public.add_closure_days(%L, %L, %L::date[])', pg_temp.id(org), name, dates);
$$;
CREATE FUNCTION pg_temp.days(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]') FROM public.special_days d
  WHERE d.organization_id = pg_temp.id(org);
$$;
CREATE FUNCTION pg_temp.dated(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(date, name, type) ORDER BY date, type, name), '[]')
  FROM public.special_days WHERE organization_id = pg_temp.id(org);
$$;

INSERT INTO auth.users (id, email)
SELECT pg_temp.id(n), 'closure-days-' || n || '@example.test' FROM generate_series(1, 7) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
(pg_temp.id(101), 'Closure Alpha', pg_temp.id(1)),
(pg_temp.id(102), 'Closure Bravo', pg_temp.id(6));
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
(pg_temp.id(301), pg_temp.id(101), '2026-12-25', 'Christmas Day', 'federal-holiday'),
(pg_temp.id(302), pg_temp.id(101), '2026-12-28', 'Alpha Stand-down', 'org-closure'),
(pg_temp.id(311), pg_temp.id(102), '2026-12-23', 'Bravo Closure', 'org-closure');

CREATE TEMP TABLE snapshots(label text PRIMARY KEY, value jsonb);
CREATE TEMP TABLE returned(label text, id uuid, organization_id uuid, date date, name text, type text);
GRANT ALL ON snapshots, returned TO authenticated;

SELECT ok(NOT has_function_privilege('anon', 'public.add_closure_days(uuid, text, date[])', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.add_closure_days(uuid, text, date[])', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.add_closure_days(uuid, text, date[])', 'EXECUTE'),
  'only authenticated can execute the closure command');
SELECT is((SELECT prosecdef FROM pg_proc WHERE proname = 'add_closure_days' AND pronamespace = 'public'::regnamespace),
  false, 'the closure command runs as the invoker');

INSERT INTO snapshots VALUES ('before-denials', jsonb_build_object('a', pg_temp.days(101), 'b', pg_temp.days(102)));
CREATE FUNCTION pg_temp.denied(actor integer, label text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_result text;
BEGIN
  PERFORM pg_temp.act(actor);
  SELECT throws_ok(pg_temp.add_sql('Denied closure', '{2030-01-02}'), '42501', 'Calendar configuration is not allowed',
    label || ' cannot add closure days') INTO v_result;
  RETURN v_result;
END; $$;
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
SELECT throws_ok(pg_temp.add_sql('Denied closure', '{2030-01-02}'), '42501', 'Calendar configuration is not allowed',
  'a configurator of a suspended Organization cannot add closure days');
RESET ROLE;
UPDATE public.organizations SET suspended_at = NULL WHERE id = pg_temp.id(101);
SELECT is(jsonb_build_object('a', pg_temp.days(101), 'b', pg_temp.days(102)),
  (SELECT value FROM snapshots WHERE label = 'before-denials'), 'denied calls change no day in either Organization');

SELECT pg_temp.act(1);
SELECT throws_ok(pg_temp.add_sql(name, dates), '22023', 'Invalid closure days', label)
FROM (VALUES
  ('', '{2030-01-02}', 'an empty name is rejected'),
  ('   ', '{2030-01-02}', 'a blank name is rejected'),
  (repeat('x', 121), '{2030-01-02}', 'a name over 120 characters is rejected'),
  ('Closure', '{}', 'an empty date list is rejected'),
  ('Closure', '{2030-01-02,2030-01-02}', 'a repeated date is rejected'),
  ('Closure', '{2030-01-02,NULL}', 'a missing date is rejected'),
  ('Closure', '{{2030-01-02},{2030-01-03}}', 'a nested date list is rejected')
) AS invalid(name, dates, label);
SELECT throws_ok(format('SELECT * FROM public.add_closure_days(%L, NULL, %L::date[])', pg_temp.id(101), '{2030-01-02}'),
  '22023', 'Invalid closure days', 'a missing name is rejected');
SELECT throws_ok(format('SELECT * FROM public.add_closure_days(%L, %L, NULL)', pg_temp.id(101), 'Closure'),
  '22023', 'Invalid closure days', 'a missing date list is rejected');
SELECT throws_ok(pg_temp.add_sql('Closure',
    (SELECT array_agg(d::date)::text FROM generate_series('2030-01-01'::date, '2031-01-02'::date, interval '1 day') AS d)),
  '22023', 'Invalid closure days', 'more than 366 dates are rejected');
RESET ROLE;
SELECT is(pg_temp.days(101), (SELECT value->'a' FROM snapshots WHERE label = 'before-denials'), 'invalid calls add no day');

SELECT pg_temp.act(1);
INSERT INTO returned SELECT 'first', id, organization_id, date, name, type
FROM public.add_closure_days(pg_temp.id(101), '  Holiday block leave ',
  '{2026-12-24,2026-12-23,2026-12-25,2026-12-28,2026-12-29}');
RESET ROLE;
SELECT results_eq($$SELECT organization_id, date, name, type FROM returned WHERE label = 'first'$$,
  $$VALUES (pg_temp.id(101), '2026-12-23'::date, 'Holiday block leave'::text, 'org-closure'::text),
           (pg_temp.id(101), '2026-12-24', 'Holiday block leave', 'org-closure'),
           (pg_temp.id(101), '2026-12-29', 'Holiday block leave', 'org-closure')$$,
  'the command returns only the inserted closure days, in date order, with the trimmed name');
SELECT set_eq($$SELECT id FROM public.special_days WHERE organization_id = pg_temp.id(101) AND name = 'Holiday block leave'$$,
  $$SELECT id FROM returned WHERE label = 'first'$$, 'the returned IDs are the stored IDs');
SELECT is(pg_temp.dated(101),
  '[["2026-12-23","Holiday block leave","org-closure"],["2026-12-24","Holiday block leave","org-closure"],["2026-12-25","Christmas Day","federal-holiday"],["2026-12-28","Alpha Stand-down","org-closure"],["2026-12-29","Holiday block leave","org-closure"]]',
  'a date that already held a holiday or closure keeps its one day');
SELECT is((SELECT jsonb_agg(to_jsonb(d) - 'created_at' ORDER BY d.id) FROM public.special_days d
    WHERE d.id IN (pg_temp.id(301), pg_temp.id(302))),
  jsonb_build_array(
    jsonb_build_object('id', pg_temp.id(301), 'organization_id', pg_temp.id(101), 'date', '2026-12-25',
      'name', 'Christmas Day', 'type', 'federal-holiday'),
    jsonb_build_object('id', pg_temp.id(302), 'organization_id', pg_temp.id(101), 'date', '2026-12-28',
      'name', 'Alpha Stand-down', 'type', 'org-closure')),
  'the skipped days keep their IDs and content');
SELECT is(pg_temp.days(102), (SELECT value->'b' FROM snapshots WHERE label = 'before-denials'),
  'another Organization''s closure on a requested date neither blocks nor changes');

INSERT INTO snapshots VALUES ('after-first', pg_temp.days(101));
SELECT pg_temp.act(1);
SELECT is((SELECT count(*)::integer FROM public.add_closure_days(pg_temp.id(101), 'Holiday block leave',
  '{2026-12-24,2026-12-23,2026-12-25,2026-12-28,2026-12-29}')), 0,
  'repeating the request after a lost reply inserts and returns nothing');
RESET ROLE;
SELECT is(pg_temp.days(101), (SELECT value FROM snapshots WHERE label = 'after-first'), 'the retry duplicates no date');

SELECT pg_temp.act(1);
SELECT is((SELECT count(*)::integer FROM public.add_closure_days(pg_temp.id(101), 'Leap year leave',
  (SELECT array_agg(d::date) FROM generate_series('2032-01-01'::date, '2032-12-31'::date, interval '1 day') AS d))),
  366, 'a full leap year of 366 dates is accepted');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
