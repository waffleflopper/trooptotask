-- #1356: Organization-wide Training configuration owns shared types and views.
-- Exercise the authenticated table boundary in a disposable SQL test project.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email)
SELECT ('c8000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'training-catalog-' || n || '@example.test'
FROM generate_series(1, 6) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('c8000000-0000-4000-8000-000000000101', 'Catalog Alpha', 'c8000000-0000-4000-8000-000000000001'),
  ('c8000000-0000-4000-8000-000000000102', 'Catalog Bravo', 'c8000000-0000-4000-8000-000000000006');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('c8000000-0000-4000-8000-000000000201', 'c8000000-0000-4000-8000-000000000101', 'Alpha Group');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('c8000000-0000-4000-8000-000000000101', 'c8000000-0000-4000-8000-000000000001',
   'member', 'viewer', '{"training":"configure","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  ('c8000000-0000-4000-8000-000000000101', 'c8000000-0000-4000-8000-000000000002',
   'member', 'viewer', '{"training":"operate","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  ('c8000000-0000-4000-8000-000000000101', 'c8000000-0000-4000-8000-000000000003',
   'member', 'viewer', '{"training":"configure","personnel":"none"}',
   'groups', ARRAY['c8000000-0000-4000-8000-000000000201']::uuid[]),
  ('c8000000-0000-4000-8000-000000000101', 'c8000000-0000-4000-8000-000000000004',
   'member', 'viewer', '{"training":"view","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  ('c8000000-0000-4000-8000-000000000101', 'c8000000-0000-4000-8000-000000000005',
   'member', 'viewer', '{"training":"none","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  ('c8000000-0000-4000-8000-000000000102', 'c8000000-0000-4000-8000-000000000006',
   'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.training_types (id, organization_id, name, description) VALUES
  ('c8000000-0000-4000-8000-000000000301', 'c8000000-0000-4000-8000-000000000101', 'Alpha Type', 'Retained'),
  ('c8000000-0000-4000-8000-000000000302', 'c8000000-0000-4000-8000-000000000102', 'Bravo Type', 'Private');
INSERT INTO public.training_views (id, organization_id, name, column_ids, created_by) VALUES
  ('c8000000-0000-4000-8000-000000000401', 'c8000000-0000-4000-8000-000000000101',
   'Alpha View', ARRAY['c8000000-0000-4000-8000-000000000301']::uuid[],
   'c8000000-0000-4000-8000-000000000001'),
  ('c8000000-0000-4000-8000-000000000402', 'c8000000-0000-4000-8000-000000000102',
   'Bravo View', ARRAY['c8000000-0000-4000-8000-000000000302']::uuid[],
   'c8000000-0000-4000-8000-000000000006');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c8000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.training_types), 1,
  'Organization configurator reads only its Training type');
SELECT is((SELECT count(*)::integer FROM public.training_views), 1,
  'Organization configurator reads only its Training view');
SELECT lives_ok($$ INSERT INTO public.training_types (id, organization_id, name)
  VALUES ('c8000000-0000-4000-8000-000000000303', 'c8000000-0000-4000-8000-000000000101', 'New Type') $$,
  'Organization configurator creates a type');
SELECT lives_ok($$ INSERT INTO public.training_views (id, organization_id, name, column_ids)
  VALUES ('c8000000-0000-4000-8000-000000000403', 'c8000000-0000-4000-8000-000000000101',
          'New View', ARRAY['c8000000-0000-4000-8000-000000000303']::uuid[]) $$,
  'Organization configurator creates a view');
WITH changed AS (UPDATE public.training_types SET name = 'Edited Type'
  WHERE id = 'c8000000-0000-4000-8000-000000000303' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization configurator edits a type') FROM changed;
WITH changed AS (UPDATE public.training_views SET name = 'Edited View'
  WHERE id = 'c8000000-0000-4000-8000-000000000403' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization configurator edits a view') FROM changed;
WITH removed AS (DELETE FROM public.training_views
  WHERE id = 'c8000000-0000-4000-8000-000000000403' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization configurator deletes a view') FROM removed;
WITH removed AS (DELETE FROM public.training_types
  WHERE id = 'c8000000-0000-4000-8000-000000000303' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization configurator deletes a type') FROM removed;

SELECT set_config('request.jwt.claim.sub', 'c8000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.training_types), 1,
  'Training operator can read its Organization type');
SELECT is((SELECT count(*)::integer FROM public.training_views), 1,
  'Training operator can read its Organization view');
SAVEPOINT operator_denials;
SELECT throws_ok($$ INSERT INTO public.training_types (organization_id, name)
  VALUES ('c8000000-0000-4000-8000-000000000101', 'Operator Type') $$,
  '42501', NULL, 'Training operator cannot create a type');
SELECT throws_ok($$ INSERT INTO public.training_views (organization_id, name)
  VALUES ('c8000000-0000-4000-8000-000000000101', 'Operator View') $$,
  '42501', NULL, 'Training operator cannot create a view');
WITH changed AS (UPDATE public.training_types SET description = 'Operator edit'
  WHERE id = 'c8000000-0000-4000-8000-000000000301' RETURNING id)
SELECT is(count(*)::integer, 0, 'Training operator cannot edit a type') FROM changed;
WITH changed AS (UPDATE public.training_views SET name = 'Operator edit'
  WHERE id = 'c8000000-0000-4000-8000-000000000401' RETURNING id)
SELECT is(count(*)::integer, 0, 'Training operator cannot edit a view') FROM changed;
WITH removed AS (DELETE FROM public.training_views
  WHERE id = 'c8000000-0000-4000-8000-000000000401' RETURNING id)
SELECT is(count(*)::integer, 0, 'Training operator cannot delete a view') FROM removed;
WITH removed AS (DELETE FROM public.training_types
  WHERE id = 'c8000000-0000-4000-8000-000000000301' RETURNING id)
SELECT is(count(*)::integer, 0, 'Training operator cannot delete a type') FROM removed;
ROLLBACK TO SAVEPOINT operator_denials;
RELEASE SAVEPOINT operator_denials;

SELECT set_config('request.jwt.claim.sub', 'c8000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.training_types), 1,
  'Group-scoped configurator retains Organization catalog read');
SELECT is((SELECT count(*)::integer FROM public.training_views), 1,
  'Group-scoped configurator retains Organization view read');
SAVEPOINT group_denials;
SELECT throws_ok($$ INSERT INTO public.training_types (organization_id, name)
  VALUES ('c8000000-0000-4000-8000-000000000101', 'Group Type') $$,
  '42501', NULL, 'Group-scoped configure cannot create a type');
SELECT throws_ok($$ INSERT INTO public.training_views (organization_id, name)
  VALUES ('c8000000-0000-4000-8000-000000000101', 'Group View') $$,
  '42501', NULL, 'Group-scoped configure cannot create a view');
WITH changed AS (UPDATE public.training_types SET description = 'Group edit'
  WHERE id = 'c8000000-0000-4000-8000-000000000301' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group-scoped configure cannot edit a type') FROM changed;
WITH changed AS (UPDATE public.training_views SET name = 'Group edit'
  WHERE id = 'c8000000-0000-4000-8000-000000000401' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group-scoped configure cannot edit a view') FROM changed;
WITH removed AS (DELETE FROM public.training_views
  WHERE id = 'c8000000-0000-4000-8000-000000000401' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group-scoped configure cannot delete a view') FROM removed;
WITH removed AS (DELETE FROM public.training_types
  WHERE id = 'c8000000-0000-4000-8000-000000000301' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group-scoped configure cannot delete a type') FROM removed;
ROLLBACK TO SAVEPOINT group_denials;
RELEASE SAVEPOINT group_denials;

SELECT set_config('request.jwt.claim.sub', 'c8000000-0000-4000-8000-000000000004', true);
SELECT is((SELECT count(*)::integer FROM public.training_types), 1,
  'Training viewer reads its Organization type');
SELECT is((SELECT count(*)::integer FROM public.training_views), 1,
  'Training viewer reads its Organization view');
SELECT set_config('request.jwt.claim.sub', 'c8000000-0000-4000-8000-000000000005', true);
SELECT is((SELECT count(*)::integer FROM public.training_types), 0,
  'Member without Training access cannot read types');
SELECT is((SELECT count(*)::integer FROM public.training_views), 0,
  'Member without Training access cannot read views');
SELECT set_config('request.jwt.claim.sub', 'c8000000-0000-4000-8000-000000000006', true);
SELECT is((SELECT count(*)::integer FROM public.training_types), 1,
  'Foreign Organization owner reads only its own type');
SELECT is((SELECT count(*)::integer FROM public.training_views), 1,
  'Foreign Organization owner reads only its own view');
SELECT set_config('request.jwt.claim.sub', 'c8000000-0000-4000-8000-000000000001', true);
SELECT throws_ok($$ INSERT INTO public.training_types (organization_id, name)
  VALUES ('c8000000-0000-4000-8000-000000000102', 'Foreign Type') $$,
  '42501', NULL, 'Alpha configurator cannot create a foreign type');
SELECT throws_ok($$ INSERT INTO public.training_views (organization_id, name)
  VALUES ('c8000000-0000-4000-8000-000000000102', 'Foreign View') $$,
  '42501', NULL, 'Alpha configurator cannot create a foreign view');
SELECT throws_ok($$ UPDATE public.training_types
  SET organization_id = 'c8000000-0000-4000-8000-000000000102'
  WHERE id = 'c8000000-0000-4000-8000-000000000301' $$,
  '42501', NULL, 'Alpha configurator cannot move a type to a foreign Organization');
SELECT throws_ok($$ UPDATE public.training_views
  SET organization_id = 'c8000000-0000-4000-8000-000000000102'
  WHERE id = 'c8000000-0000-4000-8000-000000000401' $$,
  '42501', NULL, 'Alpha configurator cannot move a view to a foreign Organization');

RESET ROLE;
SELECT is((SELECT description FROM public.training_types
  WHERE id = 'c8000000-0000-4000-8000-000000000301'), 'Retained',
  'denied writes leave the original type unchanged');
SELECT is((SELECT name FROM public.training_views
  WHERE id = 'c8000000-0000-4000-8000-000000000401'), 'Alpha View',
  'denied writes leave the original view unchanged');

-- New foreign references fail at the database boundary. Deleting a type with
-- only same-Organization references keeps the retained CASCADE/SET NULL effects.
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  ('c8000000-0000-4000-8000-000000000501', 'c8000000-0000-4000-8000-000000000101',
   'c8000000-0000-4000-8000-000000000201', 'SPC', 'Training', 'Alpha', 'training-catalog-alpha'),
  ('c8000000-0000-4000-8000-000000000502', 'c8000000-0000-4000-8000-000000000102',
   NULL, 'SPC', 'Training', 'Bravo', 'training-catalog-bravo');
INSERT INTO public.training_types (id, organization_id, name) VALUES
  ('c8000000-0000-4000-8000-000000000304', 'c8000000-0000-4000-8000-000000000101', 'Delete Probe');
INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES
  ('c8000000-0000-4000-8000-000000000601', 'c8000000-0000-4000-8000-000000000101', 'Alpha Packet'),
  ('c8000000-0000-4000-8000-000000000602', 'c8000000-0000-4000-8000-000000000102', 'Bravo Packet');
INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, template_id) VALUES
  ('c8000000-0000-4000-8000-000000000701', 'c8000000-0000-4000-8000-000000000101',
   'c8000000-0000-4000-8000-000000000501', 'c8000000-0000-4000-8000-000000000601'),
  ('c8000000-0000-4000-8000-000000000702', 'c8000000-0000-4000-8000-000000000102',
   'c8000000-0000-4000-8000-000000000502', 'c8000000-0000-4000-8000-000000000602');
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id) VALUES
  ('c8000000-0000-4000-8000-000000001001', 'c8000000-0000-4000-8000-000000000101',
   'c8000000-0000-4000-8000-000000000501', 'c8000000-0000-4000-8000-000000000304');
INSERT INTO public.onboarding_template_steps (
  id, organization_id, template_id, name, step_type, training_type_id
) VALUES (
  'c8000000-0000-4000-8000-000000000901', 'c8000000-0000-4000-8000-000000000101',
  'c8000000-0000-4000-8000-000000000601', 'Alpha Step', 'training',
  'c8000000-0000-4000-8000-000000000304'
);
INSERT INTO public.onboarding_step_progress (
  id, organization_id, onboarding_id, step_name, step_type, training_type_id
) VALUES (
  'c8000000-0000-4000-8000-000000000801', 'c8000000-0000-4000-8000-000000000101',
  'c8000000-0000-4000-8000-000000000701', 'Alpha Progress', 'training',
  'c8000000-0000-4000-8000-000000000304'
);
SELECT throws_ok($$ INSERT INTO public.personnel_trainings (
  organization_id, personnel_id, training_type_id
) VALUES (
  'c8000000-0000-4000-8000-000000000102', 'c8000000-0000-4000-8000-000000000502',
  'c8000000-0000-4000-8000-000000000304') $$,
  '23503', NULL, 'new foreign completion reference is rejected');
SELECT throws_ok($$ INSERT INTO public.onboarding_template_steps (
  organization_id, template_id, name, step_type, training_type_id
) VALUES (
  'c8000000-0000-4000-8000-000000000102', 'c8000000-0000-4000-8000-000000000602',
  'Foreign Step', 'training', 'c8000000-0000-4000-8000-000000000304') $$,
  '23503', NULL, 'new foreign template step reference is rejected');
SELECT throws_ok($$ INSERT INTO public.onboarding_step_progress (
  organization_id, onboarding_id, step_name, step_type, training_type_id
) VALUES (
  'c8000000-0000-4000-8000-000000000102', 'c8000000-0000-4000-8000-000000000702',
  'Foreign Progress', 'training', 'c8000000-0000-4000-8000-000000000304') $$,
  '23503', NULL, 'new foreign progress reference is rejected');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c8000000-0000-4000-8000-000000000001', true);
SELECT lives_ok($$ DELETE FROM public.training_types
  WHERE id = 'c8000000-0000-4000-8000-000000000304' $$,
  'Organization configurator can delete a type with only its own references');
SELECT lives_ok($$ SET CONSTRAINTS personnel_trainings_training_type_id_fkey,
  onboarding_template_steps_training_type_id_fkey,
  onboarding_step_progress_training_type_id_fkey IMMEDIATE $$,
  'same-Organization reference actions satisfy the deferred global constraints');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings
  WHERE id = 'c8000000-0000-4000-8000-000000001001'), 0,
  'same-Organization completion cascades');
SELECT is((SELECT count(*)::integer FROM public.onboarding_template_steps
  WHERE id = 'c8000000-0000-4000-8000-000000000901'
    AND organization_id = 'c8000000-0000-4000-8000-000000000101'
    AND template_id = 'c8000000-0000-4000-8000-000000000601'
    AND training_type_id IS NULL), 1,
  'same-Organization template step retains identity and clears only the type');
SELECT is((SELECT count(*)::integer FROM public.onboarding_step_progress
  WHERE id = 'c8000000-0000-4000-8000-000000000801'
    AND organization_id = 'c8000000-0000-4000-8000-000000000101'
    AND onboarding_id = 'c8000000-0000-4000-8000-000000000701'
    AND training_type_id IS NULL), 1,
  'same-Organization progress retains identity and clears only the type');
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is((SELECT count(*)::integer FROM public.training_types), 0, 'Anonymous cannot read types');
SELECT is((SELECT count(*)::integer FROM public.training_views), 0, 'Anonymous cannot read views');
SELECT * FROM finish();
ROLLBACK;
