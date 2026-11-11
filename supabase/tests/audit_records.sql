-- Training, critical tasks and Rating Scheme entries write their own audit entries. Records about a person save the
-- person's roster label at the time. Every write below runs as an ordinary signed-in member; setup and readback are
-- the only privileged steps.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1994000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'records-' || n || '@example.test', now()
FROM generate_series(1, 2) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('101'), 'Records Alpha', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'admin@example.test');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'records-doe'),
  (pg_temp.id('302'), pg_temp.id('101'), 'PFC', 'Rich', 'Roe', 'records-roe');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
INSERT INTO public.training_types (id, organization_id, name, expiration_months, can_be_exempted)
VALUES (pg_temp.id('401'), pg_temp.id('101'), 'Annual Safety', 12, true);
UPDATE public.training_types SET name = 'Annual Safety Brief', expiration_months = 24,
  applies_to_roles = ARRAY['Medic'], description = 'Private details'
WHERE id = pg_temp.id('401');
UPDATE public.training_types SET sort_order = 5 WHERE id = pg_temp.id('401');
SELECT public.set_training_exemption(pg_temp.id('101'), pg_temp.id('401'), pg_temp.id('302'), true);
SELECT public.set_training_exemption(pg_temp.id('101'), pg_temp.id('401'), pg_temp.id('302'), false);
INSERT INTO public.training_views (id, organization_id, name, column_ids)
VALUES (pg_temp.id('411'), pg_temp.id('101'), 'Medics', ARRAY[pg_temp.id('401')]);
UPDATE public.training_views SET name = 'Medic board', column_ids = ARRAY[]::uuid[] WHERE id = pg_temp.id('411');
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date, expiration_date)
VALUES (pg_temp.id('421'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('401'), '2030-01-10', '2032-01-10');
UPDATE public.personnel_trainings SET completion_date = '2030-02-10', notes = 'Private note' WHERE id = pg_temp.id('421');
UPDATE public.personnel_trainings SET certificate_url = 'certificates/Private.pdf' WHERE id = pg_temp.id('421');
INSERT INTO public.ict_tasks (id, organization_id, task_code, title, mos) VALUES
  (pg_temp.id('501'), pg_temp.id('101'), '081-831-1101', 'Apply a tourniquet', ARRAY['68W']);
UPDATE public.ict_tasks SET title = 'Apply a hemorrhage tourniquet', mos = ARRAY['68W', '68C'] WHERE id = pg_temp.id('501');
UPDATE public.ict_tasks SET sort_order = 2 WHERE id = pg_temp.id('501');
UPDATE public.ict_tasks SET archived_at = now() WHERE id = pg_temp.id('501');
UPDATE public.ict_tasks SET archived_at = NULL WHERE id = pg_temp.id('501');
INSERT INTO public.personnel_ict_completions (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method)
VALUES (pg_temp.id('511'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('501'), '2030-03-01', 'Demonstration');
UPDATE public.personnel_ict_completions SET completed_at = '2030-03-02', notes = 'Private note' WHERE id = pg_temp.id('511');
UPDATE public.personnel_ict_completions SET validated_by = 'SSG Private' WHERE id = pg_temp.id('511');
INSERT INTO public.rating_scheme_entries (
  id, organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end
) VALUES (pg_temp.id('601'), pg_temp.id('101'), pg_temp.id('301'), 'NCOER', '2030-01-01', '2030-12-31');
UPDATE public.rating_scheme_entries SET rater_person_id = pg_temp.id('302'), notes = 'Private note'
WHERE id = pg_temp.id('601');
SELECT public.transition_rating_scheme_entry(pg_temp.id('101'), pg_temp.id('601'), 'completed');
RESET ROLE;

SELECT bag_eq(
  $$ SELECT action, record_label, subject_label, details FROM public.audit_logs
     WHERE resource_type = 'training_type' AND org_id = pg_temp.id('101') $$,
  $$ VALUES
    ('training_type.created', 'Annual Safety', NULL::text, '{}'::jsonb),
    ('training_type.updated', 'Annual Safety Brief', NULL, '{"change": {"name": {"from": "Annual Safety", "to": "Annual Safety Brief"},
       "expirationMonths": {"from": 12, "to": 24}, "audience": true, "description": true}}'::jsonb),
    ('training_type.exemption_added', 'Annual Safety Brief', 'PFC Roe, Rich', '{}'::jsonb),
    ('training_type.exemption_removed', 'Annual Safety Brief', 'PFC Roe, Rich', '{}'::jsonb) $$,
  'a training type saves the fields that changed and notes lists and descriptions by name only; an exemption names the person; a reorder writes nothing');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND details::text ~ 'Private'),
  0, 'no description or note is saved in any entry');
SELECT bag_eq(
  $$ SELECT action, record_label, details FROM public.audit_logs WHERE resource_type = 'training_view' AND org_id = pg_temp.id('101') $$,
  $$ VALUES
    ('training_view.created', 'Medics', '{}'::jsonb),
    ('training_view.updated', 'Medic board', '{"change": {"name": {"from": "Medics", "to": "Medic board"}, "columns": true}}'::jsonb) $$,
  'a training view saves its name and notes a column change without the columns');
SELECT bag_eq(
  $$ SELECT action, user_id, actor_label, record_label, subject_personnel_id, subject_label, details FROM public.audit_logs
     WHERE resource_type = 'training_record' AND org_id = pg_temp.id('101') $$,
  $$ VALUES
    ('training_record.created', pg_temp.id('1'), 'SSG Rivera, Sam', 'Annual Safety Brief', pg_temp.id('301'), 'SPC Doe, Jane',
      '{"completionDate": "2030-01-10", "expirationDate": "2032-01-10"}'::jsonb),
    ('training_record.updated', pg_temp.id('1'), 'SSG Rivera, Sam', 'Annual Safety Brief', pg_temp.id('301'), 'SPC Doe, Jane',
      '{"completionDate": "2030-02-10", "expirationDate": "2032-01-10", "change": {"completionDate": {"from": "2030-01-10", "to": "2030-02-10"}, "notes": true}}'::jsonb),
    ('training_record.updated', pg_temp.id('1'), 'SSG Rivera, Sam', 'Annual Safety Brief', pg_temp.id('301'), 'SPC Doe, Jane',
      '{"completionDate": "2030-02-10", "expirationDate": "2032-01-10", "change": {"certificate": true}}'::jsonb) $$,
  'a training record saves the type, the person and the dates, and notes a change to its notes or certificate without them');
SELECT bag_eq(
  $$ SELECT action, record_label, details FROM public.audit_logs WHERE resource_type = 'ict_task' AND org_id = pg_temp.id('101') $$,
  $$ VALUES
    ('ict_task.created', 'Apply a tourniquet', '{"taskCode": "081-831-1101"}'::jsonb),
    ('ict_task.updated', 'Apply a hemorrhage tourniquet', '{"taskCode": "081-831-1101", "change": {"title": {"from": "Apply a tourniquet", "to": "Apply a hemorrhage tourniquet"}, "mos": true}}'::jsonb),
    ('ict_task.archived', 'Apply a hemorrhage tourniquet', '{"taskCode": "081-831-1101"}'::jsonb),
    ('ict_task.restored', 'Apply a hemorrhage tourniquet', '{"taskCode": "081-831-1101"}'::jsonb) $$,
  'a critical task saves its code and the fields that changed, and archiving and restoring read as their own entries');
SELECT bag_eq(
  $$ SELECT action, record_label, subject_label, details FROM public.audit_logs WHERE resource_type = 'personnel_ict_completion' AND org_id = pg_temp.id('101') $$,
  $$ VALUES
    ('personnel_ict_completion.created', 'Apply a hemorrhage tourniquet', 'SPC Doe, Jane',
      '{"completedAt": "2030-03-01", "validationMethod": "Demonstration"}'::jsonb),
    ('personnel_ict_completion.updated', 'Apply a hemorrhage tourniquet', 'SPC Doe, Jane',
      '{"completedAt": "2030-03-02", "validationMethod": "Demonstration", "change": {"completedAt": {"from": "2030-03-01", "to": "2030-03-02"}, "notes": true}}'::jsonb),
    ('personnel_ict_completion.updated', 'Apply a hemorrhage tourniquet', 'SPC Doe, Jane',
      '{"completedAt": "2030-03-02", "validationMethod": "Demonstration", "change": {"validator": true}}'::jsonb) $$,
  'a critical task completion saves the task title, the person and the date, and notes a change of validator without the name');
SELECT bag_eq(
  $$ SELECT action, record_label, subject_label, details FROM public.audit_logs WHERE resource_type = 'rating_scheme' AND org_id = pg_temp.id('101') $$,
  $$ VALUES
    ('rating_scheme.created', 'NCOER', 'SPC Doe, Jane', '{"periodStart": "2030-01-01", "periodEnd": "2030-12-31"}'::jsonb),
    ('rating_scheme.updated', 'NCOER', 'SPC Doe, Jane', '{"periodStart": "2030-01-01", "periodEnd": "2030-12-31",
      "change": {"raters": true, "notes": true}}'::jsonb),
    ('rating_scheme.updated', 'NCOER', 'SPC Doe, Jane', '{"periodStart": "2030-01-01", "periodEnd": "2030-12-31",
      "change": {"workflowStatus": {"from": null, "to": "completed"}}}'::jsonb) $$,
  'a Rating Scheme entry saves the rated person and period, its step changes, and a change of raters and notes without them');

UPDATE public.personnel SET last_name = 'Smith' WHERE id = pg_temp.id('301');
-- A Training type with history rows is archived, not deleted; clear them so the type can be removed.
DELETE FROM public.personnel_training_history WHERE training_type_id = pg_temp.id('401');
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
DELETE FROM public.personnel_trainings WHERE id = pg_temp.id('421');
DELETE FROM public.personnel_ict_completions WHERE id = pg_temp.id('511');
DELETE FROM public.rating_scheme_entries WHERE id = pg_temp.id('601');
DELETE FROM public.training_views WHERE id = pg_temp.id('411');
DELETE FROM public.training_types WHERE id = pg_temp.id('401');
RESET ROLE;
SELECT bag_eq(
  $$ SELECT action, user_id, actor_label, record_label, subject_label FROM public.audit_logs WHERE action LIKE '%.deleted' AND org_id = pg_temp.id('101') $$,
  $$ VALUES
    ('training_record.deleted', pg_temp.id('2'), 'admin@example.test', 'Annual Safety Brief', 'SPC Smith, Jane'),
    ('personnel_ict_completion.deleted', pg_temp.id('2'), 'admin@example.test', 'Apply a hemorrhage tourniquet', 'SPC Smith, Jane'),
    ('rating_scheme.deleted', pg_temp.id('2'), 'admin@example.test', 'NCOER', 'SPC Smith, Jane'),
    ('training_view.deleted', pg_temp.id('2'), 'admin@example.test', 'Medic board', NULL),
    ('training_type.deleted', pg_temp.id('2'), 'admin@example.test', 'Annual Safety Brief', NULL) $$,
  'a deletion saves the actor and the last labels, and an entry written before a rename keeps the name it had');
DELETE FROM public.ict_tasks WHERE id = pg_temp.id('501');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE action = 'ict_task.deleted' AND record_label = 'Apply a hemorrhage tourniquet' AND org_id = pg_temp.id('101')),
  1, 'a critical task removed by the retention job is still recorded');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE action = 'training_record.created' AND subject_label = 'SPC Doe, Jane' AND org_id = pg_temp.id('101')),
  1, 'a renamed person keeps the label of every earlier entry');

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_test_rejects_task CHECK (action <> 'ict_task.created') NOT VALID;
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.ict_tasks (id, organization_id, task_code, title) VALUES (pg_temp.id('502'), pg_temp.id('101'), 'X', 'Y') $$,
  '23514', NULL, 'a record change whose audit write fails raises the failure');
RESET ROLE;
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_test_rejects_task;
SELECT is((SELECT count(*)::integer FROM public.ict_tasks WHERE id = pg_temp.id('502')), 0, 'and the change is rolled back');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.audit_logs (user_id, actor_label, org_id, action, resource_type, record_label, subject_label)
     VALUES (pg_temp.id('2'), 'GEN Forged, Actor', pg_temp.id('101'), 'training_record.created', 'training_record', 'Annual Safety',
       'GEN Forged, Name') $$,
  '42501', NULL, 'an owner cannot write a record entry with a forged actor or label');
RESET ROLE;

INSERT INTO public.training_types (id, organization_id, name) VALUES (pg_temp.id('403'), pg_temp.id('101'), 'Orientation');
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date)
VALUES (pg_temp.id('423'), pg_temp.id('101'), pg_temp.id('302'), pg_temp.id('403'), '2030-05-01');
INSERT INTO public.ict_tasks (id, organization_id, task_code, title) VALUES (pg_temp.id('503'), pg_temp.id('101'), 'Z', 'Shock care');
INSERT INTO public.personnel_ict_completions (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method)
VALUES (pg_temp.id('513'), pg_temp.id('101'), pg_temp.id('302'), pg_temp.id('503'), '2030-05-02', 'Demonstration');
SELECT lives_ok($$ DELETE FROM public.personnel WHERE id = pg_temp.id('302') $$, 'a person with records can still be removed');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
    WHERE action IN ('training_record.deleted', 'personnel_ict_completion.deleted') AND record_label IN ('Orientation', 'Shock care')),
  0, 'records removed with their person leave the person deletion as the audited event');
SELECT lives_ok($$ DELETE FROM public.organizations WHERE id = pg_temp.id('101') $$, 'a unit with records can still be deleted');

SELECT * FROM finish();
ROLLBACK;
