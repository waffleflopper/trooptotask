-- A Critical Tasks import is one command, so its entries share one batch. Each row saves or fails alone: a failing row
-- leaves no change and no entry. The command writes as the signed-in member, so row security decides each row and the
-- member is the actor.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1999700-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.outcomes(p_reply jsonb, p_key text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_agg(CASE WHEN outcome ? 'row' THEN outcome -> 'row' ->> p_key
    ELSE concat_ws(' ', outcome ->> 'code', outcome ->> 'constraint') END ORDER BY n)
  FROM jsonb_array_elements(p_reply) WITH ORDINALITY AS item(outcome, n);
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'imports-' || n || '@example.test', now()
FROM generate_series(1, 2) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Imports Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Imports Bravo', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], 'viewer@example.test'),
  (pg_temp.id('102'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'imports-doe'),
  (pg_temp.id('391'), pg_temp.id('102'), 'SGT', 'Other', 'Unit', 'imports-other');
INSERT INTO public.ict_tasks (id, organization_id, task_code, title, sort_order, archived_at) VALUES
  (pg_temp.id('501'), pg_temp.id('101'), 'OLD-1', 'Old title', 3, now()),
  (pg_temp.id('502'), pg_temp.id('101'), 'KEEP-1', 'Kept task', 4, NULL),
  (pg_temp.id('591'), pg_temp.id('102'), 'FOREIGN-1', 'Foreign task', 0, NULL);
INSERT INTO public.personnel_ict_completions (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method)
VALUES (pg_temp.id('511'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('502'), '2030-03-01', 'Demonstration');
DELETE FROM public.audit_logs WHERE org_id IN (pg_temp.id('101'), pg_temp.id('102'));
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_test_rejects_label CHECK (record_label IS DISTINCT FROM 'Audit refused') NOT VALID;

SELECT ok(has_function_privilege('authenticated', 'public.import_ict_tasks(uuid, jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.import_ict_completions(uuid, jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.import_ict_tasks(uuid, jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.import_ict_completions(uuid, jsonb)', 'EXECUTE'),
  'signed-in members run the import commands and anonymous callers cannot');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT is(
  pg_temp.outcomes(public.import_ict_tasks(pg_temp.id('101'), jsonb_build_array(
    jsonb_build_object('op', 'insert', 'id', pg_temp.id('503'), 'values', jsonb_build_object(
      'task_code', 'NEW-1', 'title', 'New task', 'mos', jsonb_build_array('68W'), 'sort_order', 5,
      'organization_id', pg_temp.id('102'))),
    jsonb_build_object('op', 'update', 'id', pg_temp.id('501'), 'values', jsonb_build_object(
      'title', 'Restored title', 'archived_at', NULL)),
    jsonb_build_object('op', 'insert', 'id', pg_temp.id('504'), 'values', jsonb_build_object(
      'task_code', 'KEEP-1', 'title', 'Duplicate code')),
    jsonb_build_object('op', 'update', 'id', pg_temp.id('591'), 'values', jsonb_build_object('title', 'Taken over')),
    jsonb_build_object('op', 'insert', 'id', pg_temp.id('505'), 'values', jsonb_build_object(
      'task_code', 'NEW-2', 'title', 'Audit refused')))), 'task_code'),
  '["NEW-1", "OLD-1", "23505 ict_tasks_organization_id_task_code_key", "P0002", "23514 audit_test_rejects_label"]'::jsonb,
  'a task import reports each row in order: saved, a code conflict, a task outside the unit and a refused audit entry');
SELECT is(
  pg_temp.outcomes(public.import_ict_completions(pg_temp.id('101'), jsonb_build_array(
    jsonb_build_object('op', 'insert', 'id', pg_temp.id('512'), 'values', jsonb_build_object(
      'personnel_id', pg_temp.id('301'), 'ict_task_id', pg_temp.id('501'), 'completed_at', '2030-03-05',
      'validation_method', 'Other', 'logged_by', pg_temp.id('2'))),
    jsonb_build_object('op', 'update', 'id', pg_temp.id('511'), 'values', jsonb_build_object(
      'validation_method', 'Simulation', 'notes', 'Private note', 'logged_by', pg_temp.id('2'))),
    jsonb_build_object('op', 'insert', 'id', pg_temp.id('513'), 'values', jsonb_build_object(
      'personnel_id', pg_temp.id('301'), 'ict_task_id', pg_temp.id('502'), 'completed_at', '2030-03-01',
      'validation_method', 'Other')),
    jsonb_build_object('op', 'insert', 'id', pg_temp.id('514'), 'values', jsonb_build_object(
      'personnel_id', pg_temp.id('391'), 'ict_task_id', pg_temp.id('502'), 'completed_at', '2030-03-01',
      'validation_method', 'Other')))), 'id'),
  jsonb_build_array(pg_temp.id('512'), pg_temp.id('511'), '23505 personnel_ict_completions_org_person_task_date_key',
    '42501'),
  'a completion import reports each row in order: saved, updated, a repeated date and a person outside the unit');
RESET ROLE;

SELECT bag_eq(
  $$ SELECT action, user_id, actor_label, record_label, subject_label FROM public.audit_logs
     WHERE org_id = pg_temp.id('101') $$,
  $$ VALUES
    ('ict_task.created', pg_temp.id('1'), 'SSG Rivera, Sam', 'New task', NULL::text),
    ('ict_task.restored', pg_temp.id('1'), 'SSG Rivera, Sam', 'Restored title', NULL),
    ('personnel_ict_completion.created', pg_temp.id('1'), 'SSG Rivera, Sam', 'Restored title', 'SPC Doe, Jane'),
    ('personnel_ict_completion.updated', pg_temp.id('1'), 'SSG Rivera, Sam', 'Kept task', 'SPC Doe, Jane') $$,
  'each saved row writes one entry naming the signed-in member, and a failed row writes none');
SELECT is((SELECT count(DISTINCT batch_id)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101')), 1,
  'creates and updates share one batch, though each row is undone alone on failure');
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('102')), 0,
  'nothing is written for the other unit');
SELECT results_eq(
  $$ SELECT id, organization_id, task_code, title, archived_at IS NULL FROM public.ict_tasks
     WHERE id IN (pg_temp.id('501'), pg_temp.id('503'), pg_temp.id('504'), pg_temp.id('505'), pg_temp.id('591')) ORDER BY id $$,
  $$ VALUES
    (pg_temp.id('501'), pg_temp.id('101'), 'OLD-1', 'Restored title', true),
    (pg_temp.id('503'), pg_temp.id('101'), 'NEW-1', 'New task', true),
    (pg_temp.id('591'), pg_temp.id('102'), 'FOREIGN-1', 'Foreign task', true) $$,
  'saved rows stay in the importing unit and failed rows leave no change');
SELECT results_eq(
  $$ SELECT id, validation_method::text, logged_by FROM public.personnel_ict_completions
     WHERE id IN (pg_temp.id('511'), pg_temp.id('512'), pg_temp.id('513'), pg_temp.id('514')) ORDER BY id $$,
  $$ VALUES (pg_temp.id('511'), 'Simulation', NULL::uuid), (pg_temp.id('512'), 'Other', pg_temp.id('1')) $$,
  'an import cannot name another member as the one who logged a completion');

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT is(
  pg_temp.outcomes(public.import_ict_tasks(pg_temp.id('101'), jsonb_build_array(
    jsonb_build_object('op', 'insert', 'id', pg_temp.id('506'), 'values', jsonb_build_object(
      'task_code', 'VIEW-1', 'title', 'Viewer task')),
    jsonb_build_object('op', 'update', 'id', pg_temp.id('502'), 'values', jsonb_build_object('title', 'Viewer edit')))),
    'task_code'),
  '["42501", "P0002"]'::jsonb,
  'a member who cannot configure the library has every row refused');
SELECT is(
  pg_temp.outcomes(public.import_ict_completions(pg_temp.id('101'), jsonb_build_array(
    jsonb_build_object('op', 'update', 'id', pg_temp.id('511'), 'values', jsonb_build_object('notes', 'Viewer note')))),
    'id'),
  '["P0002"]'::jsonb,
  'a member who cannot record completions cannot change one');
SELECT throws_ok(
  format($$ SELECT public.import_ict_tasks(%L, '{}'::jsonb) $$, pg_temp.id('101')),
  '22023', NULL, 'an import that is not a list of rows is refused');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE user_id = pg_temp.id('2')), 0,
  'refused rows write no entry');
SELECT is((SELECT title FROM public.ict_tasks WHERE id = pg_temp.id('502')), 'Kept task', 'and change nothing');

ALTER TABLE public.audit_logs DROP CONSTRAINT audit_test_rejects_label;
SELECT * FROM finish();
ROLLBACK;
