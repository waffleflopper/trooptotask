BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('d2261022-0008-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
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
INSERT INTO auth.users (id, email)
SELECT pg_temp.id(n), 'roster-history-' || n || '@example.test' FROM generate_series(1, 5) AS n;
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
  (pg_temp.id(301), pg_temp.id(101), 'SGT', '68W', 'Numbers', 'Able', 'roster-history-able'),
  (pg_temp.id(302), pg_temp.id(101), 'SPC', '68W', 'Numbers', 'Baker', 'roster-history-baker'),
  (pg_temp.id(303), pg_temp.id(101), 'PFC', '68W', 'Numbers', 'Charlie', 'roster-history-charlie'),
  (pg_temp.id(311), pg_temp.id(102), 'SPC', '68W', 'Numbers', 'Bravo', 'roster-history-bravo');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to) VALUES
  (pg_temp.id(401), pg_temp.id(101), 'Staff Duty', 'SD', 'personnel'),
  (pg_temp.id(402), pg_temp.id(101), 'Charge of Quarters', 'CQ', 'personnel');


INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id)
VALUES (pg_temp.id(101), pg_temp.id(401), pg_temp.today() - 1, pg_temp.id(301)::text);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
SELECT is(public.roster_form_effective_start(f), pg_temp.today() - 1,
  'an ordinary configurator sees yesterday as the inaugural start')
FROM public.roster_forms f WHERE f.id = pg_temp.open_form(401);
SELECT is((SELECT starts_on FROM public.roster_forms WHERE id = pg_temp.open_form(401)), pg_temp.today(),
  'resolving a backdated detail leaves the stored open form unchanged');
SELECT throws_ok(pg_temp.save_sql(2, 401, pg_temp.open_form(401), pg_temp.today(), '[]', '[]'),
  '42501', NULL, 'the configurator cannot bypass the server writer');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.calendar_roster_attribute_timelines(uuid,date,date,uuid[])', 'EXECUTE'),
  'the bounded cross-person read stays server-only');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(pg_temp.save_sql(2, 401, pg_temp.open_form(401), pg_temp.today(),
  jsonb_build_array(pg_temp.number(302, 9)), '[]'), 'RSL01',
  'The starting numbers are part of the record', 'yesterday''s served detail locks numbers for the signed-in configurator');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok(format('SELECT public.close_roster_form(%L,%L,%L,%L,%L,NULL,%L,%L,%L)',
  pg_temp.id(2), pg_temp.id(101), pg_temp.id(401), pg_temp.open_form(401), pg_temp.today(), 'separate', '{"segments":[]}', '[]'),
  'the configurator closes the inaugural form after the backdated detail');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT is((SELECT starts_on FROM public.roster_forms WHERE assignment_type_id = pg_temp.id(401) AND ends_on IS NOT NULL),
  pg_temp.today() - 1, 'the closed record retains its effective first day');
SELECT is(public.roster_form_effective_start(f), pg_temp.today() + 1,
  'a successor with no carried people keeps the rule-change boundary')
FROM public.roster_forms f WHERE f.id = pg_temp.open_form(401);
SELECT set_config('test.other_form', pg_temp.open_form(402)::text, true);
SELECT set_config('request.jwt.claim.sub', pg_temp.id(4)::text, true);
SELECT is(public.roster_form_effective_start(ROW(current_setting('test.other_form')::uuid, pg_temp.id(102), pg_temp.id(402),
  pg_temp.today(), NULL, '{}', NULL, now())::public.roster_forms), NULL::date,
  'forging the composite Organization cannot reveal another roster start');
RESET ROLE;

INSERT INTO public.personnel (id, organization_id, rank, mos, first_name, last_name, slug)
VALUES (pg_temp.id(306), pg_temp.id(101), 'SPC', '68W', 'History', 'Deleted', 'history-deleted');
INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id)
VALUES (pg_temp.id(101), pg_temp.id(402), pg_temp.today() - 1, pg_temp.id(306)::text);
DELETE FROM public.personnel WHERE id = pg_temp.id(306);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
SELECT is(public.roster_form_effective_start(f), pg_temp.today() - 1,
  'a configurator still includes a backdated detail after its Person was deleted')
FROM public.roster_forms f WHERE f.id = pg_temp.open_form(402);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok(pg_temp.save_sql(2, 402, pg_temp.open_form(402), pg_temp.today(), '[]', '[]'),
  'RSL01', 'The starting numbers are part of the record', 'a deleted assignee''s served duty still locks the form');
RESET ROLE;

INSERT INTO public.personnel (id, organization_id, rank, mos, first_name, last_name, slug, archived_at) VALUES
  (pg_temp.id(304), pg_temp.id(101), 'SPC', '68W', 'History', 'Archived', 'history-archived', now() - interval '1 year'),
  (pg_temp.id(305), pg_temp.id(101), 'SPC', '68W', 'History', 'Assigned', 'history-assigned', now() - interval '1 year');
DELETE FROM public.personnel_attribute_history WHERE organization_id = pg_temp.id(101);
INSERT INTO public.personnel_attribute_history
  (organization_id, personnel_id, effective_on, rank, mos, clinic_role, group_id, archived)
VALUES
  (pg_temp.id(101), pg_temp.id(302), '2023-01-01', 'PFC', '68W', '', NULL, false),
  (pg_temp.id(101), pg_temp.id(302), '2026-10-01', 'SPC', '68W', '', NULL, false),
  (pg_temp.id(101), pg_temp.id(302), '2026-10-21', 'SGT', '68W', '', NULL, false),
  (pg_temp.id(101), pg_temp.id(302), '2026-11-01', 'SSG', '68W', '', NULL, false),
  (pg_temp.id(101), pg_temp.id(303), '2023-01-01', 'PFC', '68W', '', NULL, false),
  (pg_temp.id(101), pg_temp.id(304), '2023-01-01', 'SPC', '68W', '', NULL, false),
  (pg_temp.id(101), pg_temp.id(304), '2025-01-01', 'SPC', '68W', '', NULL, true),
  (pg_temp.id(101), pg_temp.id(305), '2023-01-01', 'SPC', '68W', '', NULL, false),
  (pg_temp.id(101), pg_temp.id(305), '2025-01-01', 'SPC', '68W', '', NULL, true);
INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id)
VALUES (pg_temp.id(101), pg_temp.id(402), '2026-10-21', pg_temp.id(305)::text);

SET LOCAL ROLE service_role;
SELECT results_eq($q$
  SELECT history FROM public.calendar_roster_attribute_timelines(pg_temp.id(101), '2026-10-20', '2026-10-22')
  WHERE id = pg_temp.id(302)
$q$, $q$ SELECT '[
  {"effective_on":"2026-10-01","rank":"SPC","mos":"68W","clinic_role":"","group_id":null,"archived":false},
  {"effective_on":"2026-10-21","rank":"SGT","mos":"68W","clinic_role":"","group_id":null,"archived":false}
]'::jsonb $q$, 'the read returns the last prior state and the change inside the period only');
SELECT results_eq($q$
  SELECT id FROM public.calendar_roster_attribute_timelines(pg_temp.id(101), '2026-10-20', '2026-10-22') ORDER BY id
$q$, $q$ VALUES (pg_temp.id(301)), (pg_temp.id(302)), (pg_temp.id(303)), (pg_temp.id(305)) $q$,
  'old archived people are omitted unless they have a duty in the period');
SELECT is((SELECT count(*) FROM public.calendar_roster_attribute_timelines(pg_temp.id(101), '2026-10-20', '2026-10-22', ARRAY[]::uuid[])),
  0::bigint, 'an empty Group scope reads no people');
SELECT is((SELECT count(*) FROM public.calendar_roster_attribute_timelines(pg_temp.id(102), '2026-10-20', '2026-10-22') WHERE id = pg_temp.id(302)),
  0::bigint, 'the provider read stays inside its Organization');
RESET ROLE;
INSERT INTO public.roster_excusals (organization_id, assignment_type_id, personnel_id, reason, starts_on)
VALUES (pg_temp.id(101), pg_temp.id(402), pg_temp.id(304), 'PCS remark', '2025-01-01');
SET LOCAL ROLE service_role;
SELECT is((SELECT last_name FROM public.calendar_roster_attribute_timelines(pg_temp.id(101), '2026-10-20', '2026-10-22')
  WHERE id = pg_temp.id(304)), 'Archived', 'an archived person keeps the name on their overlapping excusal');
RESET ROLE;

INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to)
VALUES (pg_temp.id(403), pg_temp.id(101), 'Former Group duty', 'FG', 'group');
INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id) VALUES
  (pg_temp.id(101), pg_temp.id(403), pg_temp.today() - 365, pg_temp.id(501)::text),
  (pg_temp.id(101), pg_temp.id(403), pg_temp.today(), pg_temp.id(501)::text);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
UPDATE public.assignment_types SET assign_to = 'personnel' WHERE id = pg_temp.id(403);
SELECT is(public.roster_form_effective_start(f), pg_temp.today(),
  'converting a Group type to personnel does not pull its form into the Group era')
FROM public.roster_forms f WHERE f.id = pg_temp.open_form(403);
SELECT is((SELECT count(*) FROM public.list_roster_detail_days(pg_temp.id(101), pg_temp.id(403), pg_temp.today() - 365, pg_temp.today())),
  0::bigint, 'Group-era assignments, including today, are not personnel details');
SELECT set_config('request.jwt.claim.sub', pg_temp.id(5)::text, true);
SELECT is(public.roster_form_effective_start(ROW(current_setting('test.other_form')::uuid, pg_temp.id(101), pg_temp.id(402),
  pg_temp.today(), NULL, '{}', NULL, now())::public.roster_forms), NULL::date,
  'a Group-scoped configurator cannot read the Organization-wide effective start');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok(pg_temp.save_sql(2, 403, pg_temp.open_form(403), pg_temp.today(),
  jsonb_build_array(pg_temp.number(302, 9)), '[]'), 'Group history does not lock starting numbers for the converted personnel roster');
RESET ROLE;
INSERT INTO public.personnel (id, organization_id, rank, mos, first_name, last_name, slug, created_at)
VALUES (pg_temp.id(309), pg_temp.id(101), 'SPC', '68W', 'History', 'Future', 'future-history', '2023-01-01');
DELETE FROM public.personnel_attribute_history WHERE personnel_id = pg_temp.id(309);
INSERT INTO public.personnel_attribute_history (organization_id, personnel_id, effective_on, rank, mos, clinic_role, archived)
VALUES (pg_temp.id(101), pg_temp.id(309), '2026-11-01', 'SPC', '68W', '', false);
SET LOCAL ROLE service_role;
SELECT is((SELECT count(*) FROM public.calendar_roster_attribute_timelines(pg_temp.id(101), '2026-10-20', '2026-10-22')
  WHERE id = pg_temp.id(309)), 0::bigint, 'a later first history row never becomes a fabricated past state from created_at');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
