-- Status types, Special Days and assignment types write their own audit entries with labels saved at the time of the
-- change. Every write below runs as an ordinary signed-in member; setup and readback are the only privileged steps.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1992000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.entry(p_record text, p_kind text) RETURNS public.audit_logs LANGUAGE sql AS $$
  SELECT * FROM public.audit_logs WHERE resource_id = pg_temp.id(p_record) AND action = p_kind;
$$;

-- 1 owner with a profile, 2 admin without one.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'catalog-' || n || '@example.test', now()
FROM generate_series(1, 2) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('101'), 'Catalog Alpha', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'admin@example.test');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
INSERT INTO public.status_types (id, organization_id, name, short_label)
VALUES (pg_temp.id('401'), pg_temp.id('101'), 'Leave', 'LV');
UPDATE public.status_types SET name = 'Pass', color = '#112233' WHERE id = pg_temp.id('401');
UPDATE public.status_types SET sort_order = 7 WHERE id = pg_temp.id('401');
UPDATE public.status_types SET name = name WHERE id = pg_temp.id('401');
INSERT INTO public.special_days (id, organization_id, date, name, type)
VALUES (pg_temp.id('411'), pg_temp.id('101'), '2030-12-24', 'Winter closure', 'org-closure');
UPDATE public.special_days SET date = '2030-12-26' WHERE id = pg_temp.id('411');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to)
VALUES (pg_temp.id('421'), pg_temp.id('101'), 'Charge of Quarters', 'CQ', 'personnel');
UPDATE public.assignment_types SET name = 'Staff Duty', show_on_calendar = true, sort_order = 3
WHERE id = pg_temp.id('421');
RESET ROLE;

SELECT results_eq(
  $$ SELECT user_id, actor_label, org_id, resource_type, record_label, subject_personnel_id, subject_label, details
     FROM pg_temp.entry('401', 'status_type.created') $$,
  $$ VALUES (pg_temp.id('1'), 'SSG Rivera, Sam', pg_temp.id('101'), 'status_type', 'Leave', NULL::uuid, NULL::text,
       '{}'::jsonb) $$,
  'an added status type saves its actor and name');
SELECT results_eq(
  $$ SELECT record_label, details FROM pg_temp.entry('401', 'status_type.updated') $$,
  $$ VALUES ('Pass', '{"change": {"name": {"from": "Leave", "to": "Pass"}, "color": {"from": "#6b7280", "to": "#112233"}}}'::jsonb) $$,
  'a changed status type saves the fields that changed, before and after, and a reorder or an untouched save writes nothing');
SELECT results_eq(
  $$ SELECT record_label, details FROM public.audit_logs
     WHERE resource_id = pg_temp.id('411') ORDER BY action $$,
  $$ VALUES
    ('Winter closure', '{"date": "2030-12-24"}'::jsonb),
    ('Winter closure', '{"date": "2030-12-26", "change": {"date": {"from": "2030-12-24", "to": "2030-12-26"}}}'::jsonb) $$,
  'a Special Day saves its date, and a change saves the date before and after');
SELECT results_eq(
  $$ SELECT record_label, details FROM public.audit_logs
     WHERE resource_id = pg_temp.id('421') ORDER BY action, timestamp $$,
  $$ VALUES
    ('Charge of Quarters', '{"assignTo": "personnel"}'::jsonb),
    ('Staff Duty', '{"assignTo": "personnel", "change": {"name": {"from": "Charge of Quarters", "to": "Staff Duty"},
       "showOnCalendar": {"from": false, "to": true}}}'::jsonb) $$,
  'an assignment type saves its kind of assignee and the changed name and calendar lane');

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
DELETE FROM public.status_types WHERE id = pg_temp.id('401');
DELETE FROM public.special_days WHERE id = pg_temp.id('411');
DELETE FROM public.assignment_types WHERE id = pg_temp.id('421');
RESET ROLE;
SELECT results_eq(
  $$ SELECT action, user_id, actor_label, record_label FROM public.audit_logs
     WHERE action LIKE '%.deleted' AND org_id = pg_temp.id('101') ORDER BY action $$,
  $$ VALUES
    ('assignment_type.deleted', pg_temp.id('2'), 'admin@example.test', 'Staff Duty'),
    ('special_day.deleted', pg_temp.id('2'), 'admin@example.test', 'Winter closure'),
    ('status_type.deleted', pg_temp.id('2'), 'admin@example.test', 'Pass') $$,
  'a deletion saves the actor and the last name; an admin without a profile is named by email');

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_test_rejects_status CHECK (action <> 'status_type.created') NOT VALID;
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.status_types (id, organization_id, name) VALUES (pg_temp.id('402'), pg_temp.id('101'), 'TDY') $$,
  '23514', NULL, 'a catalog change whose audit write fails raises the failure');
RESET ROLE;
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_test_rejects_status;
SELECT is((SELECT count(*)::integer FROM public.status_types WHERE id = pg_temp.id('402')), 0, 'and the change is rolled back');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.audit_logs (user_id, actor_label, org_id, action, resource_type, record_label)
     VALUES (pg_temp.id('2'), 'GEN Forged, Actor', pg_temp.id('101'), 'status_type.created', 'status_type', 'Leave') $$,
  '42501', NULL, 'an owner cannot write a catalog entry with a forged actor or label');
RESET ROLE;

INSERT INTO public.status_types (id, organization_id, name) VALUES (pg_temp.id('403'), pg_temp.id('101'), 'Pass');
INSERT INTO public.special_days (id, organization_id, date, name, type)
VALUES (pg_temp.id('412'), pg_temp.id('101'), '2030-07-04', 'Independence Day', 'federal-holiday');
SELECT lives_ok($$ DELETE FROM public.organizations WHERE id = pg_temp.id('101') $$,
  'a unit with catalog entries can still be deleted');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
    WHERE action IN ('status_type.deleted', 'special_day.deleted') AND resource_id IN (pg_temp.id('403'), pg_temp.id('412'))),
  0, 'catalog entries removed with their unit leave the unit deletion as the audited event');

-- Resetting the federal holidays writes one entry for each holiday it removes and adds, in one batch.
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('102'), 'Catalog Bravo', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES (pg_temp.id('102'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.special_days (id, organization_id, date, name, type)
VALUES (pg_temp.id('413'), pg_temp.id('102'), '2030-12-25', 'Christmas Day', 'federal-holiday');
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT public.reset_federal_holidays(pg_temp.id('102'),
  '[{"date": "2030-01-01", "name": "New Year''s Day"}, {"date": "2030-07-04", "name": "Independence Day"}]'::jsonb);
RESET ROLE;
SELECT results_eq(
  $$ SELECT action, record_label, batch_id IS NOT NULL FROM public.audit_logs
     WHERE org_id = pg_temp.id('102') AND resource_type = 'special_day' ORDER BY record_label, action $$,
  $$ VALUES ('special_day.created', 'Christmas Day', true), ('special_day.deleted', 'Christmas Day', true),
     ('special_day.created', 'Independence Day', true), ('special_day.created', 'New Year''s Day', true) $$,
  'a reset writes an entry for each holiday it removes and adds, and no summary');
SELECT is(
  (SELECT count(DISTINCT batch_id)::integer FROM public.audit_logs
    WHERE org_id = pg_temp.id('102') AND resource_type = 'special_day'),
  1, 'and the entries share one batch');

-- Reordering the calendar lanes is recorded by the database in the same transaction, once, as the signed-in member.
-- Showing or hiding a lane moves positions but not the order of the lanes that stay.
CREATE FUNCTION pg_temp.reorders() RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(user_id, resource_type, resource_id, details) ORDER BY id), '[]')
  FROM public.audit_logs
  WHERE org_id = pg_temp.id('102') AND action = 'assignment_type.calendar_lanes_reordered';
$$;
CREATE FUNCTION pg_temp.lane_order() RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(name ORDER BY sort_order, id), '[]') FROM public.assignment_types
  WHERE organization_id = pg_temp.id('102') AND show_on_calendar AND archived_at IS NULL;
$$;
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to) VALUES
  (pg_temp.id('431'), pg_temp.id('102'), 'Alpha lane', 'AL', 'personnel'),
  (pg_temp.id('432'), pg_temp.id('102'), 'Bravo lane', 'BL', 'personnel'),
  (pg_temp.id('433'), pg_temp.id('102'), 'Charlie lane', 'CL', 'personnel');
SELECT public.set_calendar_lanes(pg_temp.id('102'), ARRAY[pg_temp.id('431'), pg_temp.id('432'), pg_temp.id('433')], ARRAY[]::uuid[]);
SELECT public.set_calendar_lanes(pg_temp.id('102'), ARRAY[pg_temp.id('431'), pg_temp.id('432')],
  ARRAY[pg_temp.id('431'), pg_temp.id('432'), pg_temp.id('433')]);
SELECT public.set_calendar_lanes(pg_temp.id('102'), ARRAY[pg_temp.id('433'), pg_temp.id('431'), pg_temp.id('432')],
  ARRAY[pg_temp.id('431'), pg_temp.id('432')]);
RESET ROLE;
SELECT is(pg_temp.lane_order(), '["Charlie lane", "Alpha lane", "Bravo lane"]', 'showing and hiding lanes saved the new lanes');
SELECT is(pg_temp.reorders(), '[]', 'showing and hiding lanes writes no reorder entry');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT public.set_calendar_lanes(pg_temp.id('102'), ARRAY[pg_temp.id('432'), pg_temp.id('431'), pg_temp.id('433')],
  ARRAY[pg_temp.id('433'), pg_temp.id('431'), pg_temp.id('432')]);
RESET ROLE;
SELECT is(pg_temp.reorders(),
  jsonb_build_array(jsonb_build_array(pg_temp.id('1'), 'organization', pg_temp.id('102'), '{"count": 3}'::jsonb)),
  'a reorder writes one entry for the organization, with the signed-in member and the lanes that stayed');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT public.set_calendar_lanes(pg_temp.id('102'), ARRAY[pg_temp.id('432'), pg_temp.id('431'), pg_temp.id('433')],
  ARRAY[pg_temp.id('433'), pg_temp.id('431'), pg_temp.id('432')]);
RESET ROLE;
SELECT is(jsonb_array_length(pg_temp.reorders()), 1, 'replaying the same reorder writes nothing');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT public.set_calendar_lanes(pg_temp.id('102'), ARRAY[pg_temp.id('431'), pg_temp.id('432')],
  ARRAY[pg_temp.id('432'), pg_temp.id('431'), pg_temp.id('433')]);
RESET ROLE;
SELECT is(
  (SELECT jsonb_agg(details ORDER BY details ->> 'count' DESC) FROM public.audit_logs
    WHERE org_id = pg_temp.id('102') AND action = 'assignment_type.calendar_lanes_reordered'),
  '[{"count": 3}, {"count": 2}]',
  'hiding a lane while reordering the others writes one entry, even though the change is two statements');

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_test_rejects_lanes
  CHECK (action <> 'assignment_type.calendar_lanes_reordered') NOT VALID;
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$ SELECT public.set_calendar_lanes(%L, %L::uuid[], %L::uuid[]) $$, pg_temp.id('102'),
    ARRAY[pg_temp.id('432'), pg_temp.id('431')], ARRAY[pg_temp.id('431'), pg_temp.id('432')]),
  '23514', NULL, 'a reorder whose audit write fails raises the failure');
RESET ROLE;
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_test_rejects_lanes;
SELECT is(pg_temp.lane_order(), '["Alpha lane", "Bravo lane"]', 'and the reorder is rolled back');

SELECT * FROM finish();
ROLLBACK;
