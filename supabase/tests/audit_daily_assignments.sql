-- Daily assignments write their own audit entries, one per day and assignment type. A member's slot replacement names
-- that member, and a roster fill the server writes names the member it was told to act for. Marking a pick as made by
-- the roster, or leaving a slot as it was, writes nothing.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1997000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.slot(p_type text, p_date text, p_assignee text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('date', p_date, 'assignment_type_id', pg_temp.id(p_type),
    'assignee_id', CASE WHEN p_assignee = '' THEN '' ELSE pg_temp.id(p_assignee)::text END);
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'assignments-' || n || '@example.test', now()
FROM generate_series(1, 2) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Assignments Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Assignments Bravo', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'operator', '{"calendar": "operate"}', 'organization', ARRAY[]::uuid[],
    'operator@example.test'),
  (pg_temp.id('102'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL);
INSERT INTO public.groups (id, organization_id, name) VALUES (pg_temp.id('201'), pg_temp.id('101'), 'First Platoon');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'assignments-doe'),
  (pg_temp.id('302'), pg_temp.id('101'), 'PFC', 'Rich', 'Roe', 'assignments-roe'),
  (pg_temp.id('391'), pg_temp.id('102'), 'SGT', 'Other', 'Unit', 'assignments-other');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), 'Staff Duty', 'SD', 'personnel'),
  (pg_temp.id('402'), pg_temp.id('101'), 'Area Cleanup', 'AC', 'group');

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.replace_daily_assignment_slots(pg_temp.id('101'), '{}'::date[],
  jsonb_build_array(pg_temp.slot('401', '2030-04-01', '301'), pg_temp.slot('402', '2030-04-01', '201')));
SELECT count(*) FROM public.replace_daily_assignment_slots(pg_temp.id('101'), '{}'::date[],
  jsonb_build_array(pg_temp.slot('401', '2030-04-01', '302'), pg_temp.slot('402', '2030-04-01', '201')));
SELECT count(*) FROM public.replace_daily_assignment_slots(pg_temp.id('101'), '{}'::date[],
  jsonb_build_array(pg_temp.slot('402', '2030-04-01', '')));
SELECT throws_ok(
  format($$ SELECT * FROM public.replace_daily_assignment_slots(%L, '{}'::date[], %L) $$,
    pg_temp.id('101'), jsonb_build_array(pg_temp.slot('401', '2030-04-02', '391'))),
  '42501', NULL, 'an assignee outside the unit is refused');
SELECT throws_ok(
  $$ INSERT INTO public.audit_logs (user_id, actor_label, org_id, action, resource_type, record_label, subject_label)
     VALUES (pg_temp.id('1'), 'GEN Forged, Actor', pg_temp.id('101'), 'daily_assignment.created', 'daily_assignment',
       'Staff Duty', 'SPC Doe, Jane') $$,
  '42501', NULL, 'a member cannot write an assignment entry directly');
SELECT throws_ok(
  format($$ SELECT * FROM public.write_roster_assignment_slots(%L, %L, %L) $$, pg_temp.id('1'), pg_temp.id('101'),
    jsonb_build_array(pg_temp.slot('401', '2030-04-03', '301') || '{"was": null, "source": "roster"}')),
  '42501', NULL, 'a member cannot run the roster fill, so cannot name another member');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role": "service_role"}', true);
SET LOCAL ROLE service_role;
SELECT count(*) FROM public.write_roster_assignment_slots(pg_temp.id('1'), pg_temp.id('101'), jsonb_build_array(
  pg_temp.slot('401', '2030-04-05', '301') || '{"was": null, "source": "roster"}',
  pg_temp.slot('401', '2030-04-06', '302') || '{"was": null, "source": "roster"}'));
RESET ROLE;

INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id)
VALUES (pg_temp.id('101'), pg_temp.id('401'), '2030-04-07', pg_temp.id('391'));
SELECT is(
  (SELECT jsonb_build_array(record_label, subject_personnel_id, subject_label, details) FROM public.audit_logs
    WHERE org_id = pg_temp.id('101') AND details ->> 'date' = '2030-04-07'),
  '["Staff Duty", null, null, {"date": "2030-04-07", "group": null}]'::jsonb,
  'an assignee who is not in the unit is saved without a name, so no other unit''s label is kept');
DELETE FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND details ->> 'date' = '2030-04-07';

SELECT bag_eq(
  $$ SELECT action, user_id, actor_label, record_label, subject_personnel_id, subject_label, details FROM public.audit_logs
     WHERE org_id = pg_temp.id('101') AND resource_type = 'daily_assignment' $$,
  $$ VALUES
    ('daily_assignment.created', pg_temp.id('2'), 'operator@example.test', 'Staff Duty', pg_temp.id('301'), 'SPC Doe, Jane',
      '{"date": "2030-04-01", "group": null}'::jsonb),
    ('daily_assignment.created', pg_temp.id('2'), 'operator@example.test', 'Area Cleanup', NULL::uuid, NULL::text,
      '{"date": "2030-04-01", "group": "First Platoon"}'::jsonb),
    ('daily_assignment.updated', pg_temp.id('2'), 'operator@example.test', 'Staff Duty', pg_temp.id('302'), 'PFC Roe, Rich',
      '{"date": "2030-04-01", "group": null}'::jsonb),
    ('daily_assignment.cleared', pg_temp.id('2'), 'operator@example.test', 'Area Cleanup', NULL, NULL,
      '{"date": "2030-04-01"}'::jsonb),
    ('daily_assignment.created', pg_temp.id('1'), 'SSG Rivera, Sam', 'Staff Duty', pg_temp.id('301'), 'SPC Doe, Jane',
      '{"date": "2030-04-05", "group": null}'::jsonb),
    ('daily_assignment.created', pg_temp.id('1'), 'SSG Rivera, Sam', 'Staff Duty', pg_temp.id('302'), 'PFC Roe, Rich',
      '{"date": "2030-04-06", "group": null}'::jsonb) $$,
  'each changed slot names its member, its type, the day and who holds it; a slot left as it was and a roster mark write nothing');
SELECT is(
  (SELECT count(DISTINCT batch_id)::integer FROM public.audit_logs
    WHERE org_id = pg_temp.id('101') AND details ->> 'date' IN ('2030-04-05', '2030-04-06')),
  1, 'the days of one roster fill share a batch');
SELECT is(
  (SELECT count(*)::integer FROM public.daily_assignments WHERE organization_id = pg_temp.id('101') AND source = 'roster'),
  2, 'the roster fill marked its picks');

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_test_rejects_assignment CHECK (action <> 'daily_assignment.cleared') NOT VALID;
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$ SELECT * FROM public.replace_daily_assignment_slots(%L, '{}'::date[], %L) $$,
    pg_temp.id('101'), jsonb_build_array(pg_temp.slot('401', '2030-04-05', ''))),
  '23514', NULL, 'an assignment change whose audit write fails raises the failure');
RESET ROLE;
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_test_rejects_assignment;
SELECT is(
  (SELECT count(*)::integer FROM public.daily_assignments WHERE organization_id = pg_temp.id('101') AND date = '2030-04-05'),
  1, 'and the change is rolled back');

SELECT lives_ok($$ DELETE FROM public.assignment_types WHERE id = pg_temp.id('401') $$,
  'an assignment type with assignments can still be removed');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND action = 'daily_assignment.cleared'),
  1, 'assignments removed with their type leave the type deletion as the audited event');

SELECT * FROM finish();
ROLLBACK;
