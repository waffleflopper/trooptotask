-- Moving a critical task completion to another person or task is its own audit entry. Every write runs as an ordinary
-- signed-in member; setup and readback are the only privileged steps.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1994100-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
VALUES (pg_temp.id('1'), 'authenticated', 'authenticated', 'moves-1@example.test', now());
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('101'), 'Moves Alpha', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'moves-doe'),
  (pg_temp.id('302'), pg_temp.id('101'), 'PFC', 'Rich', 'Roe', 'moves-roe');
INSERT INTO public.ict_tasks (id, organization_id, task_code, title) VALUES
  (pg_temp.id('501'), pg_temp.id('101'), 'A', 'Apply a tourniquet'),
  (pg_temp.id('502'), pg_temp.id('101'), 'B', 'Treat shock');
INSERT INTO public.personnel_ict_completions (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method)
VALUES (pg_temp.id('511'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('501'), '2030-03-01', 'Demonstration');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
UPDATE public.personnel_ict_completions SET personnel_id = pg_temp.id('302') WHERE id = pg_temp.id('511');
UPDATE public.personnel_ict_completions SET ict_task_id = pg_temp.id('502') WHERE id = pg_temp.id('511');
UPDATE public.personnel_ict_completions SET personnel_id = pg_temp.id('301'), ict_task_id = pg_temp.id('501') WHERE id = pg_temp.id('511');
UPDATE public.personnel_ict_completions SET personnel_id = pg_temp.id('301'), ict_task_id = pg_temp.id('501') WHERE id = pg_temp.id('511');
RESET ROLE;

SELECT bag_eq(
  $$ SELECT record_label, subject_label, details FROM public.audit_logs
     WHERE action = 'personnel_ict_completion.updated' AND org_id = pg_temp.id('101') $$,
  $$ VALUES
    ('Apply a tourniquet', 'PFC Roe, Rich',
      '{"completedAt": "2030-03-01", "validationMethod": "Demonstration", "change": {"person": {"from": "SPC Doe, Jane", "to": "PFC Roe, Rich"}}}'::jsonb),
    ('Treat shock', 'PFC Roe, Rich',
      '{"completedAt": "2030-03-01", "validationMethod": "Demonstration", "change": {"task": {"from": "Apply a tourniquet", "to": "Treat shock"}}}'::jsonb),
    ('Apply a tourniquet', 'SPC Doe, Jane',
      '{"completedAt": "2030-03-01", "validationMethod": "Demonstration", "change": {"person": {"from": "PFC Roe, Rich", "to": "SPC Doe, Jane"}, "task": {"from": "Treat shock", "to": "Apply a tourniquet"}}}'::jsonb) $$,
  'moving a completion to another person, another task or both saves the old and new labels, and saving it unchanged saves nothing');

SELECT * FROM finish();
ROLLBACK;
