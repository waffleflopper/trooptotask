-- Evaluations saved before the lifecycle migration, one of them submitted to S1, one untracked and two at other steps.
-- The step after the rated Soldier signs is renamed to submitted-to-hrc by a later migration and no other step changes.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261112120000') THEN
    RAISE EXCEPTION 'Evaluation jump-steps fixture requires the preceding schema';
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('e7c10000-0000-4000-8000-000000000001', 'evaluation-jump-steps@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e7c10000-0000-4000-8000-000000000101', 'Evaluation Jump Steps', 'e7c10000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  ('e7c10000-0000-4000-8000-000000000301', 'e7c10000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Able', 'evaluation-jump-steps-rated');
INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rating_period_start,
  rating_period_end, status, workflow_status, report_type, notes, updated_at) VALUES
  ('e7c10000-0000-4000-8000-000000000401', 'e7c10000-0000-4000-8000-000000000101', 'e7c10000-0000-4000-8000-000000000301', 'NCOER', '2026-01-01', '2026-12-31', 'active', 'submitted-to-s1', 'AN', 'Sent on', '2026-03-01Z'),
  ('e7c10000-0000-4000-8000-000000000402', 'e7c10000-0000-4000-8000-000000000101', 'e7c10000-0000-4000-8000-000000000301', 'NCOER', '2025-01-01', '2025-12-31', 'active', 'sm-signed', 'AN', 'Signed by the Soldier', '2026-03-02Z'),
  ('e7c10000-0000-4000-8000-000000000403', 'e7c10000-0000-4000-8000-000000000101', 'e7c10000-0000-4000-8000-000000000301', 'NCOER', '2024-01-01', '2024-12-31', 'active', 'drafting', 'AN', 'Being written', '2026-03-03Z'),
  ('e7c10000-0000-4000-8000-000000000404', 'e7c10000-0000-4000-8000-000000000101', 'e7c10000-0000-4000-8000-000000000301', 'NCOER', '2023-01-01', '2023-12-31', 'active', NULL, 'AN', 'Not tracked', '2026-03-04Z');
CREATE TABLE upgrade_fixture.evaluation_jump_steps_before AS
  SELECT id, to_jsonb(e) AS saved FROM public.rating_scheme_entries e
  WHERE organization_id = 'e7c10000-0000-4000-8000-000000000101';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.evaluation_jump_steps_before) <> 4 THEN
    RAISE EXCEPTION 'Evaluation jump-steps upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
