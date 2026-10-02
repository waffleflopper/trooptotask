-- Populate the predecessor schema before the #1356 Training catalog policy repair.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260929000200') THEN
    RAISE EXCEPTION 'Training catalog fixture requires the preceding schema';
  END IF;
END;
$$;
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('c8100000-0000-4000-8000-000000000001', 'training-catalog-upgrade-config@example.test'),
  ('c8100000-0000-4000-8000-000000000002', 'training-catalog-upgrade-operator@example.test'),
  ('c8100000-0000-4000-8000-000000000003', 'training-catalog-upgrade-group@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('c8100000-0000-4000-8000-000000000101', 'Training Upgrade Alpha', 'c8100000-0000-4000-8000-000000000001'),
  ('c8100000-0000-4000-8000-000000000102', 'Training Upgrade Bravo', 'c8100000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('c8100000-0000-4000-8000-000000000201', 'c8100000-0000-4000-8000-000000000101', 'Alpha Group');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('c8100000-0000-4000-8000-000000000101', 'c8100000-0000-4000-8000-000000000001',
   'member', 'viewer', '{"training":"configure","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  ('c8100000-0000-4000-8000-000000000101', 'c8100000-0000-4000-8000-000000000002',
   'member', 'viewer', '{"training":"operate","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  ('c8100000-0000-4000-8000-000000000101', 'c8100000-0000-4000-8000-000000000003',
   'member', 'viewer', '{"training":"configure","personnel":"none"}',
   'groups', ARRAY['c8100000-0000-4000-8000-000000000201']::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  ('c8100000-0000-4000-8000-000000000301', 'c8100000-0000-4000-8000-000000000101',
   'c8100000-0000-4000-8000-000000000201', 'SPC', 'Catalog', 'Keeper', 'catalog-keeper'),
  ('c8100000-0000-4000-8000-000000000302', 'c8100000-0000-4000-8000-000000000102',
   NULL, 'SPC', 'Catalog', 'Foreign', 'catalog-foreign');
INSERT INTO public.training_types (id, organization_id, name, description) VALUES
  ('c8100000-0000-4000-8000-000000000401', 'c8100000-0000-4000-8000-000000000101',
   'Retained Type', 'Existing description'),
  ('c8100000-0000-4000-8000-000000000402', 'c8100000-0000-4000-8000-000000000101',
   'Same Organization Type', 'Delete probe');
INSERT INTO public.training_views (id, organization_id, name, column_ids, created_by) VALUES
  ('c8100000-0000-4000-8000-000000000501', 'c8100000-0000-4000-8000-000000000101',
   'Retained View', ARRAY['c8100000-0000-4000-8000-000000000401']::uuid[],
   'c8100000-0000-4000-8000-000000000001');
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date) VALUES
  ('c8100000-0000-4000-8000-000000000601', 'c8100000-0000-4000-8000-000000000101',
   'c8100000-0000-4000-8000-000000000301', 'c8100000-0000-4000-8000-000000000401', '2026-08-01'),
  ('c8100000-0000-4000-8000-000000000602', 'c8100000-0000-4000-8000-000000000102',
   'c8100000-0000-4000-8000-000000000302', 'c8100000-0000-4000-8000-000000000401', '2026-08-02'),
  ('c8100000-0000-4000-8000-000000000603', 'c8100000-0000-4000-8000-000000000101',
   'c8100000-0000-4000-8000-000000000301', 'c8100000-0000-4000-8000-000000000402', '2026-08-03');
INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES
  ('c8100000-0000-4000-8000-000000000701', 'c8100000-0000-4000-8000-000000000101', 'Alpha Packet'),
  ('c8100000-0000-4000-8000-000000000702', 'c8100000-0000-4000-8000-000000000102', 'Bravo Packet');
INSERT INTO public.onboarding_template_steps (
  id, organization_id, template_id, name, step_type, training_type_id
) VALUES
  ('c8100000-0000-4000-8000-000000000801', 'c8100000-0000-4000-8000-000000000101',
   'c8100000-0000-4000-8000-000000000701', 'Alpha Step', 'training', 'c8100000-0000-4000-8000-000000000401'),
  ('c8100000-0000-4000-8000-000000000802', 'c8100000-0000-4000-8000-000000000102',
   'c8100000-0000-4000-8000-000000000702', 'Bravo Legacy Step', 'training', 'c8100000-0000-4000-8000-000000000401'),
  ('c8100000-0000-4000-8000-000000000803', 'c8100000-0000-4000-8000-000000000101',
   'c8100000-0000-4000-8000-000000000701', 'Alpha Delete Step', 'training', 'c8100000-0000-4000-8000-000000000402');
INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, template_id) VALUES
  ('c8100000-0000-4000-8000-000000000901', 'c8100000-0000-4000-8000-000000000101',
   'c8100000-0000-4000-8000-000000000301', 'c8100000-0000-4000-8000-000000000701'),
  ('c8100000-0000-4000-8000-000000000902', 'c8100000-0000-4000-8000-000000000102',
   'c8100000-0000-4000-8000-000000000302', 'c8100000-0000-4000-8000-000000000702');
INSERT INTO public.onboarding_step_progress (
  id, organization_id, onboarding_id, step_name, step_type, training_type_id
) VALUES
  ('c8100000-0000-4000-8000-000000001001', 'c8100000-0000-4000-8000-000000000101',
   'c8100000-0000-4000-8000-000000000901', 'Alpha Progress', 'training', 'c8100000-0000-4000-8000-000000000401'),
  ('c8100000-0000-4000-8000-000000001002', 'c8100000-0000-4000-8000-000000000102',
   'c8100000-0000-4000-8000-000000000902', 'Bravo Legacy Progress', 'training', 'c8100000-0000-4000-8000-000000000401'),
  ('c8100000-0000-4000-8000-000000001003', 'c8100000-0000-4000-8000-000000000101',
   'c8100000-0000-4000-8000-000000000901', 'Alpha Delete Progress', 'training', 'c8100000-0000-4000-8000-000000000402');

-- Prove the predecessor's global ID foreign keys affect Bravo when Alpha's
-- type is deleted, then roll the demonstration back before the upgrade.
SAVEPOINT legacy_type_delete;
DELETE FROM public.training_types WHERE id = 'c8100000-0000-4000-8000-000000000401';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.personnel_trainings
             WHERE id = 'c8100000-0000-4000-8000-000000000602')
     OR (SELECT training_type_id FROM public.onboarding_template_steps
           WHERE id = 'c8100000-0000-4000-8000-000000000802') IS NOT NULL
     OR (SELECT training_type_id FROM public.onboarding_step_progress
           WHERE id = 'c8100000-0000-4000-8000-000000001002') IS NOT NULL THEN
    RAISE EXCEPTION 'Pre-upgrade global Training type delete did not affect every foreign reference';
  END IF;
  RAISE NOTICE 'Pre-upgrade Alpha type delete removed Bravo completion and cleared Bravo Onboarding references';
END;
$$;
ROLLBACK TO SAVEPOINT legacy_type_delete;
RELEASE SAVEPOINT legacy_type_delete;
CREATE TABLE upgrade_fixture.training_catalog_before AS
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
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.training_catalog_before) <> 12 THEN
    RAISE EXCEPTION 'Training catalog upgrade snapshot is incomplete';
  END IF;
END;
$$;
COMMIT;
