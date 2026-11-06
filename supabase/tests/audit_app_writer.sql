-- The writer for entries the server writes. Only the service role can call it. It reads the actor's label and a
-- person's label itself, so a caller cannot send a label that disagrees with the records.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1996000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
VALUES (pg_temp.id('1'), 'authenticated', 'authenticated', 'writer-1@example.test', now());
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('101'), 'Writer Alpha', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug)
VALUES (pg_temp.id('301'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'writer-doe');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('1'), 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$ SELECT public.record_app_audit_entry('status_type.reordered', 'organization', 'info', '{"count": 2}'::jsonb,
       p_actor_user_id => pg_temp.id('1'), p_organization_id => pg_temp.id('101')) $$,
  '42501', NULL, 'a signed-in member cannot write an entry');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.record_app_audit_entry('status_type.reordered', 'organization', 'info', '{"count": 2}'::jsonb) $$,
  '42501', NULL, 'a signed-out caller cannot write an entry');
RESET ROLE;

UPDATE public.personnel SET first_name = 'Janet' WHERE id = pg_temp.id('301');
SET LOCAL ROLE service_role;
SELECT public.record_app_audit_entry('status_type.reordered', 'organization', 'info', '{"count": 2}'::jsonb,
  p_actor_user_id => pg_temp.id('1'), p_organization_id => pg_temp.id('101'), p_record_id => pg_temp.id('101'),
  p_batch_id => pg_temp.id('901'));
SELECT public.record_app_audit_entry('member.removed', 'organization', 'warning', '{}'::jsonb,
  p_actor_user_id => pg_temp.id('1'), p_organization_id => pg_temp.id('101'),
  p_subject_personnel_id => pg_temp.id('301'), p_record_label => 'a person');
RESET ROLE;

SELECT bag_eq(
  $$ SELECT action, user_id, actor_label, record_label, subject_personnel_id, subject_label, batch_id, severity
     FROM public.audit_logs
     WHERE org_id = pg_temp.id('101') AND action IN ('status_type.reordered', 'member.removed') $$,
  $$ VALUES
    ('status_type.reordered', pg_temp.id('1'), 'SSG Rivera, Sam', NULL, NULL, NULL, pg_temp.id('901'), 'info'),
    ('member.removed', pg_temp.id('1'), 'SSG Rivera, Sam', 'a person', pg_temp.id('301'), 'SPC Doe, Janet', NULL, 'warning') $$,
  'the actor and the person are labeled from their records as they stand when the entry is written');

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ SELECT public.record_app_audit_entry('member.removed', 'organization', 'info', '{}'::jsonb,
       p_organization_id => pg_temp.id('101'), p_subject_personnel_id => pg_temp.id('999')) $$,
  '22023', 'Audit subject not found', 'an entry about a person who does not exist is refused');
RESET ROLE;

-- One call writes the entries of one action together.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('1'), 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$ SELECT public.record_app_audit_entries('[]'::jsonb, pg_temp.id('1'), pg_temp.id('101')) $$,
  '42501', NULL, 'a signed-in member cannot write a batch of entries');
RESET ROLE;

INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('302'), pg_temp.id('101'), 'PFC', 'Rich', 'Roe', 'writer-roe');
SET LOCAL ROLE service_role;
SELECT public.record_app_audit_entries(
  jsonb_build_array(
    jsonb_build_object('kind', 'member.removed', 'recordType', 'organization', 'severity', 'warning',
      'details', '{}'::jsonb, 'subjectPersonnelId', pg_temp.id('301')),
    jsonb_build_object('kind', 'member.removed', 'recordType', 'organization', 'severity', 'warning',
      'details', '{}'::jsonb, 'subjectPersonnelId', pg_temp.id('302'))),
  p_actor_user_id => pg_temp.id('1'), p_organization_id => pg_temp.id('101'), p_batch_id => pg_temp.id('902'));
RESET ROLE;
SELECT bag_eq(
  $$ SELECT user_id, actor_label, subject_label, batch_id, severity FROM public.audit_logs
     WHERE org_id = pg_temp.id('101') AND batch_id = pg_temp.id('902') $$,
  $$ VALUES
    (pg_temp.id('1'), 'SSG Rivera, Sam', 'SPC Doe, Janet', pg_temp.id('902'), 'warning'),
    (pg_temp.id('1'), 'SSG Rivera, Sam', 'PFC Roe, Rich', pg_temp.id('902'), 'warning') $$,
  'a batch writes one labeled entry per row under one batch id');

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ SELECT public.record_app_audit_entries(
       jsonb_build_array(
         jsonb_build_object('kind', 'member.removed', 'recordType', 'organization', 'details', '{}'::jsonb,
           'subjectPersonnelId', pg_temp.id('301')),
         jsonb_build_object('kind', 'member.removed', 'recordType', 'organization', 'details', '{}'::jsonb,
           'subjectPersonnelId', pg_temp.id('999'))),
       p_organization_id => pg_temp.id('101'), p_batch_id => pg_temp.id('903')) $$,
  '22023', 'Audit subject not found', 'a batch with an entry about a missing person is refused');
SELECT throws_ok(
  $$ SELECT public.record_app_audit_entries('{"kind": "member.removed"}'::jsonb, p_organization_id => pg_temp.id('101')) $$,
  '22023', 'Audit entries must be a list', 'entries that are not a list are refused');
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE batch_id = pg_temp.id('903')),
  0, 'a failed batch keeps every one of its entries out');

SELECT * FROM finish();
ROLLBACK;
