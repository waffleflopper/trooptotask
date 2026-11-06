-- An audit entry reads every label inside its own Organization. An admin who puts a Person of another unit into their
-- own training type's exemption list, the one reference no foreign key or policy guards, is refused, and nothing of
-- the other unit's names reaches their log. The server's service role skips row level security, so the other
-- records are checked at the trigger as that role. Setup, the stale-list fixture and readback are the only
-- privileged steps.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1999000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'tenancy-' || n || '@example.test', now()
FROM generate_series(1, 2) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Tenancy Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Tenancy Bravo', pg_temp.id('2'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('102'), pg_temp.id('2'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL);

INSERT INTO public.groups (id, organization_id, name, path) VALUES
  (pg_temp.id('201'), pg_temp.id('101'), 'Alpha Company', ARRAY[pg_temp.id('201')]),
  (pg_temp.id('202'), pg_temp.id('102'), 'Bravo Secret Company', ARRAY[pg_temp.id('202')]);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'tenancy-doe'),
  (pg_temp.id('302'), pg_temp.id('102'), 'PVT', 'Zed', 'Zulu', 'tenancy-zulu');
INSERT INTO public.training_types (id, organization_id, name, expiration_months, can_be_exempted) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), 'Alpha Safety', 12, true),
  (pg_temp.id('402'), pg_temp.id('102'), 'Bravo Secret Safety', 12, true);
INSERT INTO public.ict_tasks (id, organization_id, task_code, title) VALUES
  (pg_temp.id('501'), pg_temp.id('101'), '081-831-1101', 'Alpha tourniquet'),
  (pg_temp.id('502'), pg_temp.id('102'), '081-831-1102', 'Bravo Secret splint');
INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES
  (pg_temp.id('601'), pg_temp.id('101'), 'Alpha Arrival'),
  (pg_temp.id('602'), pg_temp.id('102'), 'Bravo Secret Arrival');
INSERT INTO public.calendar_taskings (id, organization_id, title, suspense_on)
VALUES (pg_temp.id('701'), pg_temp.id('101'), 'Alpha tasking', '2030-06-01');
INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, template_id)
VALUES (pg_temp.id('801'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('601'));
INSERT INTO public.personnel_extended_info (organization_id, personnel_id)
VALUES (pg_temp.id('101'), pg_temp.id('301'));
DELETE FROM public.audit_logs WHERE org_id IN (pg_temp.id('101'), pg_temp.id('102'));

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ UPDATE public.training_types SET exempt_personnel_ids = jsonb_build_array(pg_temp.id('302')) WHERE id = pg_temp.id('401') $$,
  '42501', 'Reference belongs to another Organization',
  'an exemption list cannot name a person of another unit');
SELECT is(
  (SELECT exempt_personnel_ids FROM public.training_types WHERE id = pg_temp.id('401')), '[]'::jsonb,
  'the refused exemption list is not saved');
SELECT lives_ok(
  $$ INSERT INTO public.training_types (id, organization_id, name, expiration_months, can_be_exempted, exempt_personnel_ids)
     VALUES (pg_temp.id('403'), pg_temp.id('101'), 'Alpha Drill', 12, true, jsonb_build_array(pg_temp.id('302'))) $$,
  'a training type created with a list is saved; no exemption entry is written for it, so no label is read');
RESET ROLE;

-- Writes that skip row level security, as the server's service role does, still stop at the trigger.
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id, completion_date)
     VALUES (pg_temp.id('101'), pg_temp.id('302'), pg_temp.id('401'), '2030-01-10') $$,
  '42501', 'Reference belongs to another Organization', 'a training record cannot name a person of another unit');
SELECT throws_ok(
  $$ INSERT INTO public.personnel_ict_completions (organization_id, personnel_id, ict_task_id, completed_at, validation_method)
     VALUES (pg_temp.id('101'), pg_temp.id('302'), pg_temp.id('501'), '2030-03-01', 'Demonstration') $$,
  '42501', 'Reference belongs to another Organization', 'a task completion cannot name a person of another unit');
SELECT throws_ok(
  $$ INSERT INTO public.rating_scheme_entries (organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end)
     VALUES (pg_temp.id('101'), pg_temp.id('302'), 'NCOER', '2030-01-01', '2030-12-31') $$,
  '42501', 'Reference belongs to another Organization', 'a rating scheme entry cannot rate a person of another unit');
SELECT throws_ok(
  $$ INSERT INTO public.onboarding_template_steps (organization_id, template_id, name, step_type, sort_order)
     VALUES (pg_temp.id('101'), pg_temp.id('602'), 'Hijack', 'checkbox', 0) $$,
  '42501', 'Reference belongs to another Organization', 'a template step cannot sit in a template of another unit');
SELECT throws_ok(
  $$ INSERT INTO public.personnel_onboardings (organization_id, personnel_id) VALUES (pg_temp.id('101'), pg_temp.id('302')) $$,
  '42501', 'Reference belongs to another Organization', 'an onboarding cannot name a person of another unit');
SELECT throws_ok(
  $$ UPDATE public.personnel_onboardings SET template_id = pg_temp.id('602') WHERE id = pg_temp.id('801') $$,
  '42501', 'Reference belongs to another Organization', 'an onboarding cannot switch to a template of another unit');
SELECT throws_ok(
  $$ INSERT INTO public.personnel_extended_info (organization_id, personnel_id) VALUES (pg_temp.id('101'), pg_temp.id('302')) $$,
  '42501', 'Reference belongs to another Organization', 'extended info cannot name a person of another unit');
RESET ROLE;

SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
   WHERE org_id = pg_temp.id('101')
     AND concat_ws(' ', record_label, subject_label, actor_label, details::text) ~ '(Zulu|Secret)'),
  0, 'nothing of the other unit''s names is in the first unit''s log after every refused write');

-- A list saved before this check can already hold another unit's person. Taking that person out must still work, and
-- it writes no entry, since the person cannot be named in this unit.
SET LOCAL session_replication_role = replica;
UPDATE public.training_types SET exempt_personnel_ids = jsonb_build_array(pg_temp.id('302'), pg_temp.id('301'))
WHERE id = pg_temp.id('401');
SET LOCAL session_replication_role = origin;
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
UPDATE public.training_types SET exempt_personnel_ids = jsonb_build_array(pg_temp.id('301')) WHERE id = pg_temp.id('401');
RESET ROLE;
SELECT is(
  (SELECT exempt_personnel_ids FROM public.training_types WHERE id = pg_temp.id('401')), jsonb_build_array(pg_temp.id('301')),
  'a stale exemption of another unit''s person can still be removed');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
   WHERE org_id = pg_temp.id('101') AND action LIKE 'training_type.exemption%'),
  0, 'removing a person the unit cannot name writes no exemption entry');

SET LOCAL session_replication_role = replica;
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date)
VALUES (pg_temp.id('411'), pg_temp.id('101'), pg_temp.id('302'), pg_temp.id('401'), '2030-01-10');
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE service_role;
UPDATE public.personnel_trainings SET completion_date = '2030-02-10' WHERE id = pg_temp.id('411');
RESET ROLE;
SELECT is(
  (SELECT completion_date FROM public.personnel_trainings WHERE id = pg_temp.id('411')), '2030-02-10'::date,
  'a record saved before the check, naming another unit''s person, can still be edited');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND action LIKE 'training_record.%'),
  0, 'editing it writes no entry, since its person cannot be named in this unit');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
UPDATE public.training_types SET exempt_personnel_ids = '[]'::jsonb WHERE id = pg_temp.id('401');
RESET ROLE;
SELECT bag_eq(
  $$ SELECT action, subject_label FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND action LIKE 'training_type.exemption%' $$,
  $$ VALUES ('training_type.exemption_removed', 'SPC Doe, Jane') $$,
  'removing a person of the unit still names them');

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ SELECT public.record_app_audit_entry('member.removed', 'organization', 'info', '{}'::jsonb,
       p_organization_id => pg_temp.id('101'), p_subject_personnel_id => pg_temp.id('302')) $$,
  '22023', 'Audit subject not found', 'the server writer cannot label a person of another unit');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
