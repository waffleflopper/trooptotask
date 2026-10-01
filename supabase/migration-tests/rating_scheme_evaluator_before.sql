-- Populate the predecessor schema before the #1364 evaluator repair.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260930000100') THEN
    RAISE EXCEPTION 'Evaluator fixture requires the preceding schema';
  END IF;
END; $$;
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('d1602000-0000-4000-8000-000000000001', 'eval-upgrade@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('d1602000-0000-4000-8000-000000000101', 'Eval Upgrade Alpha', 'd1602000-0000-4000-8000-000000000001'),
  ('d1602000-0000-4000-8000-000000000102', 'Eval Upgrade Bravo', 'd1602000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('d1602000-0000-4000-8000-000000000201', 'd1602000-0000-4000-8000-000000000101', 'Alpha'),
  ('d1602000-0000-4000-8000-000000000202', 'd1602000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES (
  'd1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000001',
  'member', 'viewer', '{"ratingScheme":"operate","personnel":"none","calendar":"none","training":"none","criticalTasks":"none","onboarding":"none"}', 'groups', ARRAY['d1602000-0000-4000-8000-000000000201']::uuid[]
);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('d1602000-0000-4000-8000-000000000301', 'd1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000201', 'SGT', 'Rated', 'Alpha', 'eval-upgrade-rated', NULL),
  ('d1602000-0000-4000-8000-000000000302', 'd1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000201', 'SSG', 'Rater', 'Alpha', 'eval-upgrade-rater', NULL),
  ('d1602000-0000-4000-8000-000000000303', 'd1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000202', 'SSG', 'Archived', 'Bravo', 'eval-upgrade-archived', '2026-01-01T00:00:00Z'),
  ('d1602000-0000-4000-8000-000000000304', 'd1602000-0000-4000-8000-000000000101', NULL, 'SSG', 'Unassigned', 'Local', 'eval-upgrade-unassigned', NULL),
  ('d1602000-0000-4000-8000-000000000305', 'd1602000-0000-4000-8000-000000000102', NULL, 'SSG', 'Foreign', 'Bravo', 'eval-upgrade-foreign', NULL);
INSERT INTO public.rating_scheme_entries (
  id, organization_id, rated_person_id, eval_type, rater_person_id, senior_rater_person_id,
  intermediate_rater_person_id, reviewer_person_id, rater_name, senior_rater_name,
  intermediate_rater_name, reviewer_name, rating_period_start, rating_period_end,
  status, report_type, workflow_status, notes
) VALUES (
  'd1602000-0000-4000-8000-000000000401', 'd1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000301', 'NCOER',
  'd1602000-0000-4000-8000-000000000302', 'd1602000-0000-4000-8000-000000000302',
  'd1602000-0000-4000-8000-000000000302', 'd1602000-0000-4000-8000-000000000302',
  'Retained Rater', 'Retained Senior', 'Retained Intermediate', 'Retained Reviewer',
  '2026-01-01', '2026-12-31', 'change-of-rater', 'CR', 'with-rater', 'Retained evaluation history'
);

INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  ('d1602000-0000-4000-8000-000000000306', 'd1602000-0000-4000-8000-000000000102', 'SGT', 'Rated', 'Bravo', 'eval-upgrade-rated-bravo');
INSERT INTO public.rating_scheme_entries (
  id, organization_id, rated_person_id, eval_type, rater_person_id, senior_rater_person_id,
  intermediate_rater_person_id, reviewer_person_id, rating_period_start, rating_period_end, status, notes
) VALUES
  ('d1602000-0000-4000-8000-000000000402', 'd1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000301', 'OER',
   'd1602000-0000-4000-8000-000000000305', 'd1602000-0000-4000-8000-000000000305',
   'd1602000-0000-4000-8000-000000000305', 'd1602000-0000-4000-8000-000000000305',
   '2025-01-01', '2025-12-31', 'completed', 'Retained historical foreign links'),
  ('d1602000-0000-4000-8000-000000000403', 'd1602000-0000-4000-8000-000000000102', 'd1602000-0000-4000-8000-000000000306', 'NCOER',
   'd1602000-0000-4000-8000-000000000305', 'd1602000-0000-4000-8000-000000000305',
   'd1602000-0000-4000-8000-000000000305', 'd1602000-0000-4000-8000-000000000305',
   '2026-01-01', '2026-12-31', 'active', 'Bravo local clearing sentinel'),
  ('d1602000-0000-4000-8000-000000000404', 'd1602000-0000-4000-8000-000000000102', 'd1602000-0000-4000-8000-000000000305', 'NCOER',
   NULL, NULL, NULL, NULL, '2026-01-01', '2026-12-31', 'active', 'Bravo rated cascade sentinel'),
  ('d1602000-0000-4000-8000-000000000405', 'd1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000302', 'NCOER',
   NULL, NULL, NULL, NULL, '2026-01-01', '2026-12-31', 'active', 'Alpha rated cascade sentinel'),
  ('d1602000-0000-4000-8000-000000000407', 'd1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000301', 'OER',
   'd1602000-0000-4000-8000-000000000302', 'd1602000-0000-4000-8000-000000000302',
   'd1602000-0000-4000-8000-000000000305', 'd1602000-0000-4000-8000-000000000305',
   '2025-01-01', '2025-12-31', 'completed', 'Retained mixed local and foreign evaluator links');
INSERT INTO public.rating_scheme_entries (
  id, organization_id, rated_person_id, eval_type, rater_name, senior_rater_name,
  intermediate_rater_name, reviewer_name, rating_period_start, rating_period_end, status, notes
) VALUES (
  'd1602000-0000-4000-8000-000000000406', 'd1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000301', 'WOER',
  'External Rater', 'External Senior', 'External Intermediate', 'External Reviewer',
  '2026-01-01', '2026-12-31', 'active', 'Retained external evaluator names'
);

-- Show the old global action, then restore all rows before applying the migration.
SAVEPOINT old_evaluator_delete;
DELETE FROM public.personnel WHERE id = 'd1602000-0000-4000-8000-000000000305';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rating_scheme_entries
    WHERE id = 'd1602000-0000-4000-8000-000000000402'
      AND rater_person_id IS NULL AND senior_rater_person_id IS NULL
      AND intermediate_rater_person_id IS NULL AND reviewer_person_id IS NULL) THEN
    RAISE EXCEPTION 'Expected the predecessor to clear the historical foreign evaluator links';
  END IF;
  RAISE NOTICE 'Predecessor evaluator deletion changes another Organization evaluation';
END; $$;
ROLLBACK TO SAVEPOINT old_evaluator_delete;
RELEASE SAVEPOINT old_evaluator_delete;
CREATE TABLE upgrade_fixture.rating_scheme_evaluator_before AS
  SELECT 'personnel'::text AS table_name, id AS row_id, to_jsonb(p) AS row_data
  FROM public.personnel p WHERE organization_id IN
    ('d1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000102')
  UNION ALL
  SELECT 'entry', id, to_jsonb(e) FROM public.rating_scheme_entries e WHERE organization_id IN
    ('d1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000102');
DO $$ BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.rating_scheme_evaluator_before) <> 13 THEN
    RAISE EXCEPTION 'Expected thirteen populated Personnel/evaluation rows';
  END IF;
END; $$;
COMMIT;
