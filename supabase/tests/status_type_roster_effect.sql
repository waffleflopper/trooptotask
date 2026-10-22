-- A status type's roster effect: the default, the allowed values, the same row
-- security as the rest of status_types, new Organizations, and closed DA 6 forms
-- that an effect change never touches.
-- Run only against the isolated synthetic SQL test database.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('d2271022-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act(actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', pg_temp.id(actor)::text, true);
END; $$;
CREATE FUNCTION pg_temp.effect(status integer) RETURNS text LANGUAGE sql AS $$
  SELECT roster_effect FROM public.status_types WHERE id = pg_temp.id(status);
$$;

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT pg_temp.id(n), 'status-effect-' || n || '@example.test', now() FROM generate_series(1, 4) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id(101), 'Effect Alpha', pg_temp.id(1)),
  (pg_temp.id(102), 'Effect Bravo', pg_temp.id(3));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id(101), pg_temp.id(1), 'member', 'viewer', '{"calendar":"configure","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(2), 'member', 'viewer', '{"calendar":"view","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(102), pg_temp.id(3), 'member', 'viewer', '{"calendar":"configure","personnel":"none"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, rank, mos, clinic_role, first_name, last_name, slug, created_at) VALUES
  (pg_temp.id(301), pg_temp.id(101), 'SGT', '68W', '', 'Effect', 'Kim', 'status-effect-kim', '2026-01-05T12:00:00Z');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to) VALUES
  (pg_temp.id(401), pg_temp.id(101), 'Charge of Quarters', 'CQ', 'personnel');
INSERT INTO public.status_types (id, organization_id, name, color, text_color) VALUES
  (pg_temp.id(501), pg_temp.id(101), 'Leave', '#2563eb', '#ffffff'),
  (pg_temp.id(511), pg_temp.id(102), 'Bravo Leave', '#2563eb', '#ffffff');

-- Column default and CHECK.
SELECT is(pg_temp.effect(501), 'A', 'a status type inserted without an effect reads A');
SELECT throws_ok(format($$INSERT INTO public.status_types (organization_id, name, roster_effect) VALUES (%L, 'Bad', 'X')$$,
  pg_temp.id(101)), '23514', NULL, 'an unknown effect is rejected');
SELECT throws_ok(format($$INSERT INTO public.status_types (organization_id, name, roster_effect) VALUES (%L, 'Bad', 'a')$$,
  pg_temp.id(101)), '23514', NULL, 'the effect codes are case sensitive');
SELECT throws_ok(format($$INSERT INTO public.status_types (organization_id, name, roster_effect) VALUES (%L, 'Bad', NULL)$$,
  pg_temp.id(101)), '23502', NULL, 'a status type must have an effect');

-- A closed form with a saved record, set up before the effect changes.
SELECT set_config('trooptotask.roster_close', 'on', true);
UPDATE public.roster_forms SET starts_on = '2026-01-05' WHERE assignment_type_id = pg_temp.id(401) AND ends_on IS NULL;
SELECT set_config('trooptotask.roster_close', '', true);
SELECT pg_temp.act(1);
SELECT lives_ok(format($$SELECT public.close_roster_form(%L, %L, (SELECT id FROM public.roster_forms
  WHERE assignment_type_id = %L AND ends_on IS NULL), (now() AT TIME ZONE 'UTC')::date, NULL, 'none',
  '{"rows": [{"name": "Kim", "count": 11}]}', '[]')$$, pg_temp.id(101), pg_temp.id(401), pg_temp.id(401)),
  'a configurator closes the open form');
RESET ROLE;
CREATE TEMP TABLE closed_form_before AS
  SELECT id, record::text AS record_text, to_jsonb(f)::text AS row_text
  FROM public.roster_forms f WHERE assignment_type_id = pg_temp.id(401) AND ends_on IS NOT NULL;
SELECT is((SELECT count(*)::integer FROM closed_form_before), 1, 'the type has one closed form');

-- Row security matches the rest of status_types.
SELECT pg_temp.act(2);
SELECT is(pg_temp.effect(501), 'A', 'a Calendar viewer reads the effect');
WITH changed AS (UPDATE public.status_types SET roster_effect = 'D' WHERE id = pg_temp.id(501) RETURNING id)
SELECT is(count(*)::integer, 0, 'a Calendar viewer cannot change an effect') FROM changed;
SELECT throws_ok(format($$INSERT INTO public.status_types (organization_id, name, roster_effect) VALUES (%L, 'Viewer', 'D')$$,
  pg_temp.id(101)), '42501', NULL, 'a Calendar viewer cannot add a status type with an effect');
SELECT pg_temp.act(3);
SELECT is(pg_temp.effect(501), NULL, 'another Organization''s configurator cannot read the effect');
WITH changed AS (UPDATE public.status_types SET roster_effect = 'D' WHERE id = pg_temp.id(501) RETURNING id)
SELECT is(count(*)::integer, 0, 'another Organization''s configurator cannot change an effect') FROM changed;

SELECT pg_temp.act(1);
SELECT lives_ok(format($$INSERT INTO public.status_types (id, organization_id, name, roster_effect) VALUES (%L, %L, 'Appointment', 'available')$$,
  pg_temp.id(502), pg_temp.id(101)), 'a configurator adds a status type with an effect');
SELECT is(pg_temp.effect(502), 'available', 'the new status type keeps Still available');
SELECT lives_ok(format($$UPDATE public.status_types SET roster_effect = 'D' WHERE id = %L$$, pg_temp.id(501)),
  'a configurator changes an effect');
SELECT is(pg_temp.effect(501), 'D', 'the effect is saved');
SELECT lives_ok(format($$UPDATE public.status_types SET roster_effect = 'U' WHERE id = %L$$, pg_temp.id(501)),
  'a configurator changes an effect again');
SELECT is(pg_temp.effect(501), 'U', 'the second change is saved');

-- An effect change leaves closed forms exactly as they were.
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.roster_forms f JOIN closed_form_before b USING (id)
  WHERE f.record::text = b.record_text AND to_jsonb(f)::text = b.row_text), 1,
  'the closed form''s record and row are byte-identical after effect changes');

-- New Organizations read A through the creation command.
SELECT pg_temp.act(4);
SELECT lives_ok($$SELECT public.create_organization('Effect Charlie', 'd2271022-0000-4000-8000-000000000901',
  '{"groups":[],
    "status_types":[{"name":"Leave","color":"#111111","text_color":"#ffffff","sort_order":0},
                    {"name":"Pass","color":"#222222","text_color":"#ffffff","sort_order":1}],
    "assignment_types":[], "special_days":[], "rank_catalog":[]}'::jsonb)$$, 'a user creates an Organization with status types');
RESET ROLE;
SELECT is((SELECT jsonb_agg(roster_effect ORDER BY sort_order) FROM public.status_types s JOIN public.organizations o
  ON o.id = s.organization_id WHERE o.name = 'Effect Charlie'), '["A", "A"]',
  'status types created with a new Organization read A');
SELECT * FROM finish();
ROLLBACK;
