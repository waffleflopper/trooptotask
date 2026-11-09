-- #2030 Training types archive instead of deleting their records. Every write below runs as an ordinary signed-in
-- admin or member; setup and readback are the only privileged steps.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a2030000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;

-- 1 owner, 2 admin, 3 viewer who can see Training but not configure it.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'archive-types-' || n || '@example.test', now()
FROM generate_series(1, 3) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES
  (pg_temp.id('2'), 'SFC', 'Ada', 'Admin');
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Archive Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Archive Bravo', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'admin@example.test'),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{"training": "view", "personnel": "view"}',
    'organization', ARRAY[]::uuid[], 'viewer@example.test');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('201'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'archive-types-jane');

INSERT INTO public.training_types (id, organization_id, name, sort_order) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'Has a record', 0),
  (pg_temp.id('302'), pg_temp.id('101'), 'Has only history', 1),
  (pg_temp.id('303'), pg_temp.id('101'), 'Unused', 2),
  (pg_temp.id('304'), pg_temp.id('101'), 'Unused two', 3),
  (pg_temp.id('305'), pg_temp.id('102'), 'Bravo type', 0);
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), pg_temp.id('201'), pg_temp.id('301'), '2030-01-02');
INSERT INTO public.personnel_training_history (id, organization_id, personnel_id, training_type_id, completion_date) VALUES
  (pg_temp.id('402'), pg_temp.id('101'), pg_temp.id('201'), pg_temp.id('302'), '2029-01-02');
INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES
  (pg_temp.id('501'), pg_temp.id('101'), 'New arrival');
INSERT INTO public.onboarding_template_steps (id, organization_id, name, step_type, training_type_id, template_id) VALUES
  (pg_temp.id('502'), pg_temp.id('101'), 'Take the unused course', 'training', pg_temp.id('303'), pg_temp.id('501'));
DELETE FROM public.audit_logs WHERE org_id = pg_temp.id('101');

-- Archive and restore.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
UPDATE public.training_types SET archived_at = '1999-01-01T00:00:00Z' WHERE id = pg_temp.id('301');
RESET ROLE;
SELECT ok(
  (SELECT archived_at FROM public.training_types WHERE id = pg_temp.id('301')) > now() - interval '1 minute',
  'an admin archives a type and the database sets the time, whatever time the client sent');
SELECT results_eq(
  $$ SELECT count(*)::integer FROM public.personnel_trainings WHERE training_type_id = pg_temp.id('301') $$,
  $$ VALUES (1) $$,
  'archiving keeps every record that uses the type');

CREATE TEMP TABLE archived_at_before AS
  SELECT id, archived_at FROM public.training_types WHERE id = pg_temp.id('301');
GRANT SELECT ON archived_at_before TO authenticated;
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
UPDATE public.training_types SET archived_at = '2040-01-01T00:00:00Z', name = 'Has a record (renamed)'
  WHERE id = pg_temp.id('301');
RESET ROLE;
SELECT results_eq(
  $$ SELECT id, archived_at FROM public.training_types WHERE id = pg_temp.id('301') $$,
  $$ SELECT id, archived_at FROM archived_at_before $$,
  'an archived type keeps its archive time when saved again');

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
UPDATE public.training_types SET archived_at = NULL WHERE id = pg_temp.id('301');
RESET ROLE;
SELECT results_eq(
  $$ SELECT archived_at FROM public.training_types WHERE id = pg_temp.id('301') $$,
  $$ VALUES (NULL::timestamptz) $$,
  'an admin restores a type');

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
UPDATE public.training_types SET archived_at = now() WHERE id = pg_temp.id('301');
RESET ROLE;
SELECT bag_eq(
  $$ SELECT action, user_id, actor_label, record_label, details FROM public.audit_logs
     WHERE org_id = pg_temp.id('101') AND resource_type = 'training_type' $$,
  $$ VALUES
    ('training_type.archived', pg_temp.id('2'), 'SFC Admin, Ada', 'Has a record', '{}'::jsonb),
    ('training_type.updated', pg_temp.id('2'), 'SFC Admin, Ada', 'Has a record (renamed)',
      '{"change": {"name": {"from": "Has a record", "to": "Has a record (renamed)"}}}'::jsonb),
    ('training_type.restored', pg_temp.id('2'), 'SFC Admin, Ada', 'Has a record (renamed)', '{}'::jsonb),
    ('training_type.archived', pg_temp.id('2'), 'SFC Admin, Ada', 'Has a record (renamed)', '{}'::jsonb) $$,
  'archiving and restoring write their own entries naming the admin, and a repeat save writes nothing');

-- A member without configure access cannot archive, restore or delete.
SELECT pg_temp.act_as('3');
SET LOCAL ROLE authenticated;
UPDATE public.training_types SET archived_at = now() WHERE id = pg_temp.id('303');
UPDATE public.training_types SET archived_at = NULL WHERE id = pg_temp.id('301');
DELETE FROM public.training_types WHERE id = pg_temp.id('303');
SELECT throws_ok($$ SELECT * FROM public.training_type_record_counts('a2030000-0000-4000-8000-000000000101') $$,
  '42501', 'Training configuration is not allowed', 'a viewer cannot read Training type usage');
RESET ROLE;
SELECT results_eq(
  $$ SELECT count(*)::integer FROM public.training_types
       WHERE id IN (pg_temp.id('301'), pg_temp.id('303')) AND (id = pg_temp.id('301')) = (archived_at IS NOT NULL) $$,
  $$ VALUES (2) $$,
  'a viewer changed and removed nothing, so both the archived and the unused types are as they were');

-- A type with records cannot be deleted, however it is reached.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ DELETE FROM public.training_types WHERE id = 'a2030000-0000-4000-8000-000000000301' $$,
  '23503', NULL, 'an admin cannot delete a Training type that has a current record');
SELECT throws_ok($$ DELETE FROM public.training_types WHERE id = 'a2030000-0000-4000-8000-000000000302' $$,
  '23503', NULL, 'an admin cannot delete a Training type that has only a history row');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role": "service_role"}', true);
INSERT INTO public.deletion_requests (id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description, status)
VALUES (pg_temp.id('801'), pg_temp.id('101'), pg_temp.id('3'), 'viewer@example.test', 'training_type', pg_temp.id('301'), 'Has a record', 'pending');
SET LOCAL ROLE service_role;
SELECT throws_ok(
  format($$ SELECT public.approve_record_deletion_request(%L, %L, 'training_type', %L, %L, now()) $$,
    pg_temp.id('101'), pg_temp.id('801'), pg_temp.id('301'), pg_temp.id('1')),
  '23503', NULL, 'approving the deletion of a Training type that gained records fails instead of removing them');
RESET ROLE;
SELECT results_eq(
  $$ SELECT (SELECT count(*)::integer FROM public.personnel_trainings WHERE id = pg_temp.id('401')),
            (SELECT count(*)::integer FROM public.personnel_training_history WHERE id = pg_temp.id('402')),
            (SELECT count(*)::integer FROM public.training_types WHERE id IN (pg_temp.id('301'), pg_temp.id('302'))) $$,
  $$ VALUES (1, 1, 2) $$,
  'every refused delete left the type and its records in place');

-- A type without records deletes, and onboarding steps that named it lose the reference.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
DELETE FROM public.training_types WHERE id = pg_temp.id('303');
RESET ROLE;
SELECT results_eq(
  $$ SELECT (SELECT count(*)::integer FROM public.training_types WHERE id = pg_temp.id('303')),
            (SELECT training_type_id FROM public.onboarding_template_steps WHERE id = pg_temp.id('502')) $$,
  $$ VALUES (0, NULL::uuid) $$,
  'an admin deletes a type that has no records, and the onboarding step that named it is kept without it');

-- Usage counts.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ SELECT training_type_id, record_count FROM public.training_type_record_counts('a2030000-0000-4000-8000-000000000101') ORDER BY training_type_id $$,
  $$ VALUES (pg_temp.id('301'), 1::bigint), (pg_temp.id('302'), 1::bigint), (pg_temp.id('304'), 0::bigint) $$,
  'Training usage counts current and history records for every type in the Organization');
SELECT throws_ok($$ SELECT * FROM public.training_type_record_counts('a2030000-0000-4000-8000-000000000102') $$,
  '42501', NULL, 'an admin of one Organization cannot read another''s usage');
RESET ROLE;

-- Reordering covers active types only.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
UPDATE public.training_types SET archived_at = NULL WHERE id = pg_temp.id('301');
UPDATE public.training_types SET archived_at = now() WHERE id = pg_temp.id('302');
SELECT lives_ok(
  format($$ SELECT public.set_training_type_order(%L, ARRAY[%L, %L]::uuid[], ARRAY[%L, %L]::uuid[]) $$,
    pg_temp.id('101'), pg_temp.id('304'), pg_temp.id('301'), pg_temp.id('301'), pg_temp.id('304')),
  'the Training order saves the active types in the new order');
SELECT throws_ok(
  format($$ SELECT public.set_training_type_order(%L, ARRAY[%L, %L, %L]::uuid[], ARRAY[%L, %L]::uuid[]) $$,
    pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('304'), pg_temp.id('302'), pg_temp.id('304'), pg_temp.id('301')),
  '22023', NULL, 'an order that names an archived Training type is refused');
RESET ROLE;
SELECT results_eq(
  $$ SELECT array_agg(id ORDER BY sort_order, id) FROM public.training_types
       WHERE organization_id = pg_temp.id('101') AND archived_at IS NULL $$,
  $$ VALUES (ARRAY[pg_temp.id('304'), pg_temp.id('301')]) $$,
  'the active types read back in the saved order');
SELECT results_eq(
  $$ SELECT sort_order FROM public.training_types WHERE id = pg_temp.id('302') $$,
  $$ VALUES (1) $$,
  'archived types keep the position they had');

-- Readiness reads only active Training types, and the archived type's completions stay out of the count.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ WITH signal AS (
       SELECT public.roster_signals(pg_temp.id('101'), '2026-10-23', '2025-11-01', ARRAY['training']) -> 'training' AS training
     )
     SELECT
       (SELECT array_agg(t ->> 'id' ORDER BY t ->> 'id') FROM signal, jsonb_array_elements(training -> 'types') t),
       (SELECT array_agg(c ->> 1 ORDER BY c ->> 1) FROM signal, jsonb_array_elements(training -> 'completions') c) $$,
  $$ VALUES (ARRAY[pg_temp.id('301')::text, pg_temp.id('304')::text], ARRAY[pg_temp.id('301')::text]) $$,
  'the roster signal lists active Training types and their completions only');
RESET ROLE;

-- Deleting an Organization still removes its types together with their records.
SELECT set_config('request.jwt.claim.sub', pg_temp.id('1')::text, true);
DELETE FROM public.organizations WHERE id = pg_temp.id('101');
SELECT results_eq(
  $$ SELECT (SELECT count(*)::integer FROM public.training_types WHERE organization_id = pg_temp.id('101')),
            (SELECT count(*)::integer FROM public.personnel_trainings WHERE organization_id = pg_temp.id('101')) $$,
  $$ VALUES (0, 0) $$,
  'deleting an Organization removes its types and records together');

SELECT * FROM finish();
ROLLBACK;
