-- Onboarding writes its own audit entries: templates and their steps, a person's onboarding and the steps within it.
-- Every write below runs as an ordinary signed-in member; setup and readback are the only privileged steps.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1995000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'onboarding-' || n || '@example.test', now()
FROM generate_series(1, 2) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('101'), 'Onboarding Alpha', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'admin@example.test');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'onboarding-doe'),
  (pg_temp.id('302'), pg_temp.id('101'), 'PFC', 'Rich', 'Roe', 'onboarding-roe');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
INSERT INTO public.onboarding_templates (id, organization_id, name, description)
VALUES (pg_temp.id('401'), pg_temp.id('101'), 'New Soldier', 'Private details');
UPDATE public.onboarding_templates SET name = 'New Arrival', description = 'Other private details' WHERE id = pg_temp.id('401');
INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES (pg_temp.id('402'), pg_temp.id('101'), 'Officer');
INSERT INTO public.onboarding_template_steps (id, organization_id, template_id, name, step_type, stages, sort_order)
VALUES (pg_temp.id('411'), pg_temp.id('101'), pg_temp.id('401'), 'In-process', 'paperwork', '["Started", "Signed"]'::jsonb, 0);
INSERT INTO public.onboarding_template_steps (id, organization_id, template_id, name, step_type, sort_order)
VALUES (pg_temp.id('412'), pg_temp.id('101'), pg_temp.id('401'), 'Meet the first sergeant', 'checkbox', 1);
UPDATE public.onboarding_template_steps SET name = 'In-processing', stages = '["Started", "Reviewed", "Signed"]'::jsonb,
  description = 'Private details' WHERE id = pg_temp.id('411');
UPDATE public.onboarding_template_steps SET sort_order = 4 WHERE id = pg_temp.id('412');
SELECT public.start_onboarding_packet(pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('401'), '2030-01-05', '[]'::jsonb);
RESET ROLE;

SELECT bag_eq(
  $$ SELECT action, user_id, actor_label, record_label, details FROM public.audit_logs
     WHERE resource_type = 'onboarding_template' AND org_id = pg_temp.id('101') $$,
  $$ VALUES
    ('onboarding_template.created', pg_temp.id('1'), 'SSG Rivera, Sam', 'New Soldier', '{}'::jsonb),
    ('onboarding_template.updated', pg_temp.id('1'), 'SSG Rivera, Sam', 'New Arrival',
      '{"change": {"name": {"from": "New Soldier", "to": "New Arrival"}, "description": true}}'::jsonb),
    ('onboarding_template.created', pg_temp.id('1'), 'SSG Rivera, Sam', 'Officer', '{}'::jsonb) $$,
  'a template saves its name and notes a description change without it');
SELECT bag_eq(
  $$ SELECT action, record_label, details FROM public.audit_logs WHERE resource_type = 'onboarding_template_step' $$,
  $$ VALUES
    ('onboarding_template_step.created', 'In-process', '{"template": "New Arrival", "stepType": "paperwork"}'::jsonb),
    ('onboarding_template_step.created', 'Meet the first sergeant', '{"template": "New Arrival", "stepType": "checkbox"}'::jsonb),
    ('onboarding_template_step.updated', 'In-processing', '{"template": "New Arrival", "stepType": "paperwork",
      "change": {"name": {"from": "In-process", "to": "In-processing"}, "description": true, "stages": true}}'::jsonb) $$,
  'a template step saves its template and type, notes stages and descriptions by name only, and a reorder writes nothing');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND details::text ~ 'Private'),
  0, 'no description is saved in any entry');
SELECT bag_eq(
  $$ SELECT action, user_id, record_label, subject_personnel_id, subject_label, details FROM public.audit_logs
     WHERE resource_type = 'personnel_onboarding' $$,
  $$ VALUES ('onboarding.started', pg_temp.id('1'), 'SPC Doe, Jane', pg_temp.id('301'), 'SPC Doe, Jane', '{"template": "New Arrival"}'::jsonb) $$,
  'starting an onboarding names the person and the template');

INSERT INTO public.onboarding_step_progress (
  id, organization_id, onboarding_id, step_name, step_type, sort_order, current_stage, stages
) SELECT pg_temp.id('421'), organization_id, id, 'In-processing', 'paperwork', 0, 'Started', '["Started", "Reviewed", "Signed"]'::jsonb
  FROM public.personnel_onboardings WHERE personnel_id = pg_temp.id('301');
INSERT INTO public.onboarding_step_progress (id, organization_id, onboarding_id, step_name, step_type, sort_order)
SELECT pg_temp.id('422'), organization_id, id, 'Meet the first sergeant', 'checkbox', 1
  FROM public.personnel_onboardings WHERE personnel_id = pg_temp.id('301');
INSERT INTO public.onboarding_step_progress (id, organization_id, onboarding_id, step_name, step_type, sort_order, active)
SELECT pg_temp.id('423'), organization_id, id, 'Old step', 'checkbox', 2, false
  FROM public.personnel_onboardings WHERE personnel_id = pg_temp.id('301');
DELETE FROM public.audit_logs WHERE resource_type = 'onboarding_step_progress';

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
UPDATE public.onboarding_step_progress SET current_stage = 'Reviewed' WHERE id = pg_temp.id('421');
UPDATE public.onboarding_step_progress SET current_stage = 'Signed', completed = true WHERE id = pg_temp.id('421');
UPDATE public.onboarding_step_progress SET completed = true WHERE id = pg_temp.id('422');
UPDATE public.onboarding_step_progress SET completed = false WHERE id = pg_temp.id('422');
SELECT public.append_onboarding_step_note(pg_temp.id('101'), pg_temp.id('422'), 'Private note');
DELETE FROM public.onboarding_step_progress WHERE id = pg_temp.id('423');
RESET ROLE;

SELECT bag_eq(
  $$ SELECT action, user_id, actor_label, record_label, subject_personnel_id, subject_label, details FROM public.audit_logs
     WHERE resource_type = 'onboarding_step_progress' $$,
  $$ VALUES
    ('onboarding_step.stage_advanced', pg_temp.id('2'), 'admin@example.test', 'In-processing', pg_temp.id('301'), 'SPC Doe, Jane',
      '{"stage": "Reviewed", "completed": false}'::jsonb),
    ('onboarding_step.stage_advanced', pg_temp.id('2'), 'admin@example.test', 'In-processing', pg_temp.id('301'), 'SPC Doe, Jane',
      '{"stage": "Signed", "completed": true}'::jsonb),
    ('onboarding_step.toggled', pg_temp.id('2'), 'admin@example.test', 'Meet the first sergeant', pg_temp.id('301'), 'SPC Doe, Jane',
      '{"completed": true}'::jsonb),
    ('onboarding_step.toggled', pg_temp.id('2'), 'admin@example.test', 'Meet the first sergeant', pg_temp.id('301'), 'SPC Doe, Jane',
      '{"completed": false}'::jsonb),
    ('onboarding_step.note_added', pg_temp.id('2'), 'admin@example.test', 'Meet the first sergeant', pg_temp.id('301'), 'SPC Doe, Jane', '{}'::jsonb),
    ('onboarding_step.inactive_removed', pg_temp.id('2'), 'admin@example.test', 'Old step', pg_temp.id('301'), 'SPC Doe, Jane', '{}'::jsonb) $$,
  'a step entry names the step and the person, and a note is recorded without its text');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE details::text ~ 'Private note'), 0, 'a note is never saved in an entry');

UPDATE public.personnel SET last_name = 'Smith' WHERE id = pg_temp.id('301');
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
INSERT INTO public.onboarding_template_steps (id, organization_id, template_id, name, step_type, sort_order)
VALUES (pg_temp.id('413'), pg_temp.id('101'), pg_temp.id('402'), 'Pack the field kit', 'checkbox', 0);
SELECT public.reconcile_onboarding_packet(
  pg_temp.id('101'), (SELECT id FROM public.personnel_onboardings WHERE personnel_id = pg_temp.id('301')), pg_temp.id('402'));
UPDATE public.personnel_onboardings SET status = 'cancelled'
WHERE personnel_id = pg_temp.id('301');
UPDATE public.personnel_onboardings SET status = 'in_progress'
WHERE personnel_id = pg_temp.id('301');
UPDATE public.personnel_onboardings SET status = 'completed'
WHERE personnel_id = pg_temp.id('301');
RESET ROLE;

SELECT bag_eq(
  $$ SELECT action, record_label, subject_label, details FROM public.audit_logs
     WHERE resource_type = 'personnel_onboarding' AND action <> 'onboarding.started' $$,
  $$ VALUES
    ('onboarding.template_switched', 'SPC Smith, Jane', 'SPC Smith, Jane', '{"template": "Officer", "previousTemplate": "New Arrival"}'::jsonb),
    ('onboarding.completed', 'SPC Smith, Jane', 'SPC Smith, Jane', '{"template": "Officer", "incomplete": 1}'::jsonb),
    ('onboarding.reopened', 'SPC Smith, Jane', 'SPC Smith, Jane', '{"template": "Officer"}'::jsonb),
    ('onboarding.cancelled', 'SPC Smith, Jane', 'SPC Smith, Jane', '{"template": "Officer"}'::jsonb) $$,
  'an onboarding saves each change of state with its template, and the unfinished steps when it completes');
SELECT is(
  (SELECT subject_label FROM public.audit_logs WHERE action = 'onboarding.started'),
  'SPC Doe, Jane', 'an entry written before a rename keeps the name it had');

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
DELETE FROM public.onboarding_template_steps WHERE id = pg_temp.id('412');
SELECT public.delete_onboarding_template(pg_temp.id('101'), pg_temp.id('402'));
RESET ROLE;
SELECT bag_eq(
  $$ SELECT action, user_id, record_label FROM public.audit_logs WHERE action LIKE 'onboarding_template%.deleted' $$,
  $$ VALUES
    ('onboarding_template_step.deleted', pg_temp.id('2'), 'Meet the first sergeant'),
    ('onboarding_template.deleted', pg_temp.id('2'), 'Officer') $$,
  'deleting a template and a step each save the actor and the last name');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE action = 'onboarding.template_switched'),
  1, 'a template deleted under an onboarding is not recorded as a switch');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT public.duplicate_onboarding_template(pg_temp.id('101'), pg_temp.id('401'), pg_temp.id('451'));
SELECT public.duplicate_onboarding_template(pg_temp.id('101'), pg_temp.id('401'), pg_temp.id('451'));
INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES (pg_temp.id('404'), pg_temp.id('101'), 'Brand new');
RESET ROLE;
SELECT bag_eq(
  $$ SELECT action, user_id, record_label, details FROM public.audit_logs
     WHERE resource_type = 'onboarding_template' AND record_label IN ('New Arrival Copy', 'Brand new') $$,
  $$ VALUES
    ('onboarding_template.duplicated', pg_temp.id('1'), 'New Arrival Copy', '{"source": "New Arrival"}'::jsonb),
    ('onboarding_template.created', pg_temp.id('1'), 'Brand new', '{}'::jsonb) $$,
  'a duplicated template names the template it was copied from, a replayed request writes nothing more, and a template added afterwards is still a new one');
SELECT is(
  (SELECT count(DISTINCT batch_id)::integer FROM public.audit_logs
    WHERE record_label = 'New Arrival Copy' OR details ->> 'template' = 'New Arrival Copy'),
  1, 'the copy and its steps share one batch');
UPDATE public.onboarding_templates SET name = 'Renamed source' WHERE id = pg_temp.id('401');
SELECT is(
  (SELECT details ->> 'source' FROM public.audit_logs WHERE action = 'onboarding_template.duplicated'),
  'New Arrival', 'the saved source name does not follow a rename');

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_test_rejects_template CHECK (action <> 'onboarding_template.created') NOT VALID;
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES (pg_temp.id('403'), pg_temp.id('101'), 'Rejected') $$,
  '23514', NULL, 'an onboarding change whose audit write fails raises the failure');
RESET ROLE;
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_test_rejects_template;
SELECT is((SELECT count(*)::integer FROM public.onboarding_templates WHERE id = pg_temp.id('403')), 0, 'and the change is rolled back');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.audit_logs (user_id, actor_label, org_id, action, resource_type, record_label, subject_label)
     VALUES (pg_temp.id('2'), 'GEN Forged, Actor', pg_temp.id('101'), 'onboarding.started', 'personnel_onboarding', 'Forged', 'GEN Forged, Name') $$,
  '42501', NULL, 'an owner cannot write an onboarding entry with a forged actor or label');
RESET ROLE;

INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, template_id)
VALUES (pg_temp.id('431'), pg_temp.id('101'), pg_temp.id('302'), pg_temp.id('401'));
INSERT INTO public.onboarding_step_progress (id, organization_id, onboarding_id, step_name, step_type, active)
VALUES (pg_temp.id('432'), pg_temp.id('101'), pg_temp.id('431'), 'Removed with person', 'checkbox', false);
SELECT lives_ok($$ DELETE FROM public.personnel WHERE id = pg_temp.id('302') $$, 'a person with an onboarding can still be removed');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE record_label = 'Removed with person'),
  0, 'steps removed with their person leave the person deletion as the audited event');
SELECT lives_ok($$ DELETE FROM public.organizations WHERE id = pg_temp.id('101') $$, 'a unit with onboarding can still be deleted');

SELECT * FROM finish();
ROLLBACK;
