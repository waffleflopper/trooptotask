-- The #1356 upgrade keeps saved facts, closes direct writes and isolates type deletion.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations
  WHERE version = '20260929000200'), 1, 'Training catalog migration was applied');
SELECT is((SELECT count(*)::integer FROM pg_constraint
  WHERE conname IN (
    'personnel_trainings_org_training_type_fkey',
    'onboarding_template_steps_org_training_type_fkey',
    'onboarding_step_progress_org_training_type_fkey'
  ) AND NOT convalidated), 3, 'new Organization/type references leave historical mismatches unvalidated');
SELECT is((SELECT count(*)::integer FROM pg_constraint
  WHERE conname IN (
    'personnel_trainings_training_type_id_fkey',
    'onboarding_template_steps_training_type_id_fkey',
    'onboarding_step_progress_training_type_id_fkey'
  ) AND confdeltype = 'a' AND condeferrable AND condeferred), 3,
  'all global type references block foreign deletion instead of mutating another Organization');
SELECT is((SELECT confdeltype::text FROM pg_constraint
  WHERE conname = 'personnel_trainings_org_training_type_fkey'), 'c',
  'same-Organization completions still cascade');
SELECT is((SELECT count(*)::integer FROM pg_constraint
  WHERE conname IN (
    'onboarding_template_steps_org_training_type_fkey',
    'onboarding_step_progress_org_training_type_fkey'
  ) AND confdeltype = 'n'), 2, 'same-Organization Onboarding references still clear');

CREATE TEMP VIEW training_catalog_current_rows AS
  SELECT 'type'::text AS table_name, id AS row_id, to_jsonb(t) AS row_data
    FROM public.training_types t WHERE id IN (
      'c8100000-0000-4000-8000-000000000401', 'c8100000-0000-4000-8000-000000000402')
  UNION ALL
  SELECT 'view', id, to_jsonb(v) FROM public.training_views v
    WHERE id = 'c8100000-0000-4000-8000-000000000501'
  UNION ALL
  SELECT 'completion', id, to_jsonb(r) FROM public.personnel_trainings r
    WHERE id IN (
      'c8100000-0000-4000-8000-000000000601', 'c8100000-0000-4000-8000-000000000602',
      'c8100000-0000-4000-8000-000000000603')
  UNION ALL
  SELECT 'template_step', id, to_jsonb(s) FROM public.onboarding_template_steps s
    WHERE id IN (
      'c8100000-0000-4000-8000-000000000801', 'c8100000-0000-4000-8000-000000000802',
      'c8100000-0000-4000-8000-000000000803')
  UNION ALL
  SELECT 'step_progress', id, to_jsonb(p) FROM public.onboarding_step_progress p
    WHERE id IN (
      'c8100000-0000-4000-8000-000000001001', 'c8100000-0000-4000-8000-000000001002',
      'c8100000-0000-4000-8000-000000001003');
SELECT is((SELECT count(*)::integer FROM training_catalog_current_rows), 12,
  'all saved catalog and relationship rows survive the upgrade');
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM training_catalog_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.training_catalog_before
     ORDER BY table_name, row_id $$,
  'existing type, view, completion and Onboarding IDs and values survive the upgrade');
SELECT is((SELECT count(*)::integer FROM (
    SELECT r.organization_id, r.training_type_id FROM public.personnel_trainings r
      WHERE r.id = 'c8100000-0000-4000-8000-000000000602'
    UNION ALL
    SELECT s.organization_id, s.training_type_id FROM public.onboarding_template_steps s
      WHERE s.id = 'c8100000-0000-4000-8000-000000000802'
    UNION ALL
    SELECT p.organization_id, p.training_type_id FROM public.onboarding_step_progress p
      WHERE p.id = 'c8100000-0000-4000-8000-000000001002'
  ) legacy JOIN public.training_types t ON t.id = legacy.training_type_id
  WHERE legacy.organization_id <> t.organization_id), 3,
  'the three historical Bravo references remain identifiable');

-- New mismatched references fail even though the historical ones remain.
SELECT throws_ok($$ INSERT INTO public.personnel_trainings (
  organization_id, personnel_id, training_type_id
) VALUES (
  'c8100000-0000-4000-8000-000000000102', 'c8100000-0000-4000-8000-000000000302',
  'c8100000-0000-4000-8000-000000000402') $$,
  '23503', NULL, 'new foreign completion reference fails');
SELECT throws_ok($$ INSERT INTO public.onboarding_template_steps (
  organization_id, template_id, name, step_type, training_type_id
) VALUES (
  'c8100000-0000-4000-8000-000000000102', 'c8100000-0000-4000-8000-000000000702',
  'New Foreign Step', 'training', 'c8100000-0000-4000-8000-000000000402') $$,
  '23503', NULL, 'new foreign template step reference fails');
SELECT throws_ok($$ INSERT INTO public.onboarding_step_progress (
  organization_id, onboarding_id, step_name, step_type, training_type_id
) VALUES (
  'c8100000-0000-4000-8000-000000000102', 'c8100000-0000-4000-8000-000000000902',
  'New Foreign Progress', 'training', 'c8100000-0000-4000-8000-000000000402') $$,
  '23503', NULL, 'new foreign progress reference fails');

CREATE FUNCTION pg_temp.foreign_type_delete_rejected() RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER AS $fn$
BEGIN
  DELETE FROM public.training_types
    WHERE id = 'c8100000-0000-4000-8000-000000000401';
  SET CONSTRAINTS personnel_trainings_training_type_id_fkey,
                  onboarding_template_steps_training_type_id_fkey,
                  onboarding_step_progress_training_type_id_fkey IMMEDIATE;
  RETURN false;
EXCEPTION WHEN foreign_key_violation THEN
  RETURN true;
END;
$fn$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c8100000-0000-4000-8000-000000000001', true);
SELECT ok(public.can_manage_training_configuration('c8100000-0000-4000-8000-000000000101'),
  'Organization-scoped Training configurator keeps catalog authority');
SELECT ok(pg_temp.foreign_type_delete_rejected(),
  'Alpha configurator cannot delete a type referenced by historical Bravo rows');
SELECT lives_ok($$ INSERT INTO public.training_types (organization_id, name)
  VALUES ('c8100000-0000-4000-8000-000000000101', 'New Upgrade Type') $$,
  'configurator can create a type after upgrade');
SELECT lives_ok($$ INSERT INTO public.training_views (organization_id, name)
  VALUES ('c8100000-0000-4000-8000-000000000101', 'New Upgrade View') $$,
  'configurator can create a view after upgrade');

SELECT set_config('request.jwt.claim.sub', 'c8100000-0000-4000-8000-000000000002', true);
SELECT ok(NOT public.can_manage_training_configuration('c8100000-0000-4000-8000-000000000101'),
  'Training operator lacks configuration authority');
SELECT throws_ok($$ INSERT INTO public.training_views (organization_id, name)
  VALUES ('c8100000-0000-4000-8000-000000000101', 'Operator Upgrade View') $$,
  '42501', NULL, 'Training operator cannot directly create a shared view');
WITH changed AS (UPDATE public.training_views SET name = 'Operator Upgrade Edit'
  WHERE id = 'c8100000-0000-4000-8000-000000000501' RETURNING id)
SELECT is(count(*)::integer, 0, 'Training operator cannot directly edit a shared view') FROM changed;

SELECT set_config('request.jwt.claim.sub', 'c8100000-0000-4000-8000-000000000003', true);
SELECT ok(NOT public.can_manage_training_configuration('c8100000-0000-4000-8000-000000000101'),
  'Group-scoped Training configure lacks Organization catalog authority');
SELECT is((SELECT count(*)::integer FROM public.training_types
  WHERE id = 'c8100000-0000-4000-8000-000000000401'), 1,
  'Group-scoped configurator retains catalog read');
SELECT throws_ok($$ INSERT INTO public.training_types (organization_id, name)
  VALUES ('c8100000-0000-4000-8000-000000000101', 'Group Upgrade Type') $$,
  '42501', NULL, 'Group-scoped configure cannot directly create a type');
SELECT throws_ok($$ INSERT INTO public.training_views (organization_id, name)
  VALUES ('c8100000-0000-4000-8000-000000000101', 'Group Upgrade View') $$,
  '42501', NULL, 'Group-scoped configure cannot directly create a view');
WITH removed AS (DELETE FROM public.training_types
  WHERE id = 'c8100000-0000-4000-8000-000000000401' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group-scoped configure cannot remove retained type') FROM removed;
WITH removed AS (DELETE FROM public.training_views
  WHERE id = 'c8100000-0000-4000-8000-000000000501' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group-scoped configure cannot remove retained view') FROM removed;

RESET ROLE;
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM training_catalog_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.training_catalog_before
     ORDER BY table_name, row_id $$,
  'rejected delete and denied writes leave both Organizations unchanged');

-- A type with only Alpha references still deletes its completion and clears
-- only the type column of its Onboarding rows.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c8100000-0000-4000-8000-000000000001', true);
SELECT lives_ok($$ DELETE FROM public.training_types
  WHERE id = 'c8100000-0000-4000-8000-000000000402' $$,
  'same-Organization type deletion remains allowed');
SELECT lives_ok($$ SET CONSTRAINTS personnel_trainings_training_type_id_fkey,
  onboarding_template_steps_training_type_id_fkey,
  onboarding_step_progress_training_type_id_fkey IMMEDIATE $$,
  'same-Organization cascades satisfy deferred global references');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings
  WHERE id = 'c8100000-0000-4000-8000-000000000603'), 0,
  'same-Organization completion cascades');
SELECT is((SELECT count(*)::integer FROM public.onboarding_template_steps
  WHERE id = 'c8100000-0000-4000-8000-000000000803'
    AND organization_id = 'c8100000-0000-4000-8000-000000000101'
    AND template_id = 'c8100000-0000-4000-8000-000000000701'
    AND training_type_id IS NULL), 1,
  'same-Organization template step keeps identity and clears only type');
SELECT is((SELECT count(*)::integer FROM public.onboarding_step_progress
  WHERE id = 'c8100000-0000-4000-8000-000000001003'
    AND organization_id = 'c8100000-0000-4000-8000-000000000101'
    AND onboarding_id = 'c8100000-0000-4000-8000-000000000901'
    AND training_type_id IS NULL), 1,
  'same-Organization progress keeps identity and clears only type');
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings
  WHERE id = 'c8100000-0000-4000-8000-000000000602'), 1,
  'same-Organization deletion leaves Bravo historical completion');
SELECT * FROM finish();
ROLLBACK;
