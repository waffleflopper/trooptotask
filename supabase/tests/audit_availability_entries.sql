-- Calendar availability writes its own audit entries with labels saved at the time of the change. Every write and
-- read below runs as an ordinary signed-in member unless it is unit setup or readback.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1990000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;

-- 1 owner with a profile, 2 admin, 3 Calendar operator without a profile, 4 Calendar viewer, 5 another unit's owner.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'audit-' || n || '@example.test', now()
FROM generate_series(1, 5) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Audit Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Audit Other', pg_temp.id('5'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[],
    'operator@example.test'),
  (pg_temp.id('101'), pg_temp.id('4'), 'member', 'viewer', '{"calendar":"view"}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('102'), pg_temp.id('5'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'audit-doe'),
  (pg_temp.id('302'), pg_temp.id('101'), 'PFC', 'Rich', 'Roe', 'audit-roe');
INSERT INTO public.status_types (id, organization_id, name) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), 'Leave'),
  (pg_temp.id('402'), pg_temp.id('101'), 'TDY');

SELECT is(audit_private.person_label('SPC', 'Doe', 'Jane'), 'SPC Doe, Jane',
  'people labels use the roster form formatRosterPersonDisplayName renders');

CREATE FUNCTION pg_temp.entry(p_record text, p_kind text) RETURNS public.audit_logs LANGUAGE sql AS $$
  SELECT * FROM public.audit_logs WHERE resource_id = pg_temp.id(p_record) AND action = p_kind;
$$;

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date, note)
VALUES (pg_temp.id('501'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('401'), '2030-11-10', '2030-11-20',
  'Private family matter');
UPDATE public.availability_entries SET start_date = '2030-11-12' WHERE id = pg_temp.id('501');
UPDATE public.availability_entries SET note = 'Another private matter' WHERE id = pg_temp.id('501');
UPDATE public.availability_entries SET end_date = end_date WHERE id = pg_temp.id('501');
UPDATE public.availability_entries SET status_type_id = pg_temp.id('402'), personnel_id = pg_temp.id('302')
WHERE id = pg_temp.id('501');
RESET ROLE;

SELECT results_eq(
  $$ SELECT user_id, actor_label, org_id, resource_type, record_label, subject_personnel_id, subject_label, details
     FROM pg_temp.entry('501', 'availability.created') $$,
  $$ VALUES (pg_temp.id('1'), 'SSG Rivera, Sam', pg_temp.id('101'), 'availability', 'Leave', pg_temp.id('301'),
       'SPC Doe, Jane', '{"startDate": "2030-11-10", "endDate": "2030-11-20"}'::jsonb) $$,
  'an added entry saves its actor, status name, person and dates');
SELECT results_eq(
  $$ SELECT details FROM public.audit_logs WHERE resource_id = pg_temp.id('501') AND action = 'availability.updated'
     ORDER BY details->'change' ? 'note', details->'change' ? 'status' $$,
  $$ VALUES
    ('{"startDate": "2030-11-12", "endDate": "2030-11-20",
       "change": {"startDate": {"from": "2030-11-10", "to": "2030-11-12"}}}'::jsonb),
    ('{"startDate": "2030-11-12", "endDate": "2030-11-20",
       "change": {"status": {"from": "Leave", "to": "TDY"}, "person": {"from": "SPC Doe, Jane", "to": "PFC Roe, Rich"}}}'::jsonb),
    ('{"startDate": "2030-11-12", "endDate": "2030-11-20", "change": {"note": {"withheld": true}}}'::jsonb) $$,
  'an update saves before and after labels, says a note changed without keeping it, and an update with no change writes nothing');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE details::text LIKE '%private%'),
  0, 'no entry stores the free-text note');

SELECT pg_temp.act_as('3');
SET LOCAL ROLE authenticated;
DELETE FROM public.availability_entries WHERE id = pg_temp.id('501');
RESET ROLE;
UPDATE public.personnel SET rank = 'SGT', last_name = 'Doe-Smith' WHERE id = pg_temp.id('302');
UPDATE public.status_types SET name = 'Temporary duty' WHERE id = pg_temp.id('402');
SELECT results_eq(
  $$ SELECT user_id, actor_label, record_label, subject_label, details FROM pg_temp.entry('501', 'availability.deleted') $$,
  $$ VALUES (pg_temp.id('3'), 'operator@example.test', 'TDY', 'PFC Roe, Rich',
       '{"startDate": "2030-11-12", "endDate": "2030-11-20"}'::jsonb) $$,
  'a deleted entry keeps the labels it had, after the person and status type are renamed; a member without a profile is named by email');

-- Rollback: a constraint the audit row cannot meet makes the audit write fail.
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_test_rejects_created CHECK (action <> 'availability.created') NOT VALID;
SELECT pg_temp.act_as('3');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date)
     VALUES (pg_temp.id('502'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('401'), '2030-12-01', '2030-12-02') $$,
  '23514', NULL, 'a change whose audit write fails raises the failure');
RESET ROLE;
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_test_rejects_created;
SELECT is((SELECT count(*)::integer FROM public.availability_entries WHERE id = pg_temp.id('502')), 0,
  'and the change is rolled back');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.audit_logs (user_id, actor_label, org_id, action, resource_type, record_label, subject_label)
     VALUES (pg_temp.id('2'), 'GEN Forged, Actor', pg_temp.id('101'), 'availability.created', 'availability', 'Leave',
       'SPC Doe, Jane') $$,
  '42501', NULL, 'an owner cannot write an entry with a forged actor or labels');
SELECT throws_ok(
  $$ UPDATE public.audit_logs SET actor_label = 'GEN Forged, Actor', subject_label = 'Someone else'
     WHERE org_id = pg_temp.id('101') $$,
  '42501', NULL, 'an owner cannot rewrite a saved actor or label');
SELECT throws_ok($$ DELETE FROM public.audit_logs WHERE org_id = pg_temp.id('101') $$,
  '42501', NULL, 'an owner cannot delete entries');
SELECT throws_ok(
  $$ SELECT audit_private.record_entry(pg_temp.id('101'), 'availability.created', 'availability', NULL, 'Leave', NULL,
       'SPC Doe, Jane', '{}') $$,
  '42501', NULL, 'an owner cannot call the database entry writer');
SELECT is((SELECT count(*)::integer FROM public.audit_logs
  WHERE org_id = pg_temp.id('101') AND action LIKE 'availability.%'), 5, 'an owner reads the unit log');
SELECT pg_temp.act_as('2');
SELECT is((SELECT count(*)::integer FROM public.audit_logs
  WHERE org_id = pg_temp.id('101') AND action LIKE 'availability.%'), 5, 'an admin reads the unit log');
SELECT pg_temp.act_as('3');
SELECT is((SELECT count(*)::integer FROM public.audit_logs), 0, 'a Calendar operator without admin reads no entries');
SELECT pg_temp.act_as('4');
SELECT is((SELECT count(*)::integer FROM public.audit_logs), 0, 'a Calendar viewer reads no entries');
SELECT pg_temp.act_as('5');
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101')), 0,
  'another unit''s owner reads none of this unit''s entries');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT count(*) FROM public.audit_logs $$, '42501', NULL, 'a signed-out client cannot read the log');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
SET LOCAL ROLE service_role;
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date)
VALUES (pg_temp.id('503'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('401'), '2030-12-05', '2030-12-06');
RESET ROLE;
SELECT results_eq($$ SELECT user_id, actor_label, subject_label FROM pg_temp.entry('503', 'availability.created') $$,
  $$ VALUES (NULL::uuid, NULL::text, 'SPC Doe, Jane') $$, 'a write with no signed-in member records the system as actor');

INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date)
VALUES (pg_temp.id('504'), pg_temp.id('101'), pg_temp.id('302'), pg_temp.id('401'), '2030-12-07', '2030-12-08');
DELETE FROM public.personnel WHERE id = pg_temp.id('301');
SELECT throws_ok($$ DELETE FROM public.status_types WHERE id = pg_temp.id('401') $$, '23503', NULL,
  'a status type that still has schedule entries is not deleted');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE resource_id IN (pg_temp.id('503'), pg_temp.id('504'))
    AND action = 'availability.deleted'),
  0, 'entries removed with their Person leave that deletion as the audited event');
INSERT INTO public.status_types (id, organization_id, name) VALUES (pg_temp.id('403'), pg_temp.id('101'), 'Pass');
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date)
VALUES (pg_temp.id('505'), pg_temp.id('101'), pg_temp.id('302'), pg_temp.id('403'), '2030-12-09', '2030-12-10');
SELECT lives_ok($$ DELETE FROM public.organizations WHERE id = pg_temp.id('101') $$,
  'a unit with availability can still be deleted');

SELECT * FROM finish();
ROLLBACK;
