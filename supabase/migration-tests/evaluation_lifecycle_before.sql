-- Evaluations saved with both lifecycle columns, including pairs that disagree. The change-of-rater entries, one of
-- them already completed, are saved as Annual reports. Entries with an intermediate rater sit at each step of the old
-- senior-rater-first order.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261111120000') THEN
    RAISE EXCEPTION 'Evaluation lifecycle fixture requires the preceding schema';
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('e7b10000-0000-4000-8000-000000000001', 'evaluation-lifecycle@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e7b10000-0000-4000-8000-000000000101', 'Evaluation Lifecycle', 'e7b10000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  ('e7b10000-0000-4000-8000-000000000301', 'e7b10000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Able', 'evaluation-lifecycle-rated');
INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rating_period_start,
  rating_period_end, status, workflow_status, report_type, notes, updated_at) VALUES
  ('e7b10000-0000-4000-8000-000000000401', 'e7b10000-0000-4000-8000-000000000101', 'e7b10000-0000-4000-8000-000000000301', 'NCOER', '2026-01-01', '2026-12-31', 'active', NULL, 'AN', 'Untracked', '2026-02-01Z'),
  ('e7b10000-0000-4000-8000-000000000402', 'e7b10000-0000-4000-8000-000000000101', 'e7b10000-0000-4000-8000-000000000301', 'NCOER', '2026-01-01', '2026-12-31', 'active', 'sr-signed', 'AN', 'In progress', '2026-02-02Z'),
  ('e7b10000-0000-4000-8000-000000000403', 'e7b10000-0000-4000-8000-000000000101', 'e7b10000-0000-4000-8000-000000000301', 'NCOER', '2026-01-01', '2026-12-31', 'active', 'completed', 'AN', 'Finished workflow', '2026-02-03Z'),
  ('e7b10000-0000-4000-8000-000000000404', 'e7b10000-0000-4000-8000-000000000101', 'e7b10000-0000-4000-8000-000000000301', 'NCOER', '2025-01-01', '2025-12-31', 'completed', 'with-rater', 'AN', 'Closed early', '2026-02-04Z'),
  ('e7b10000-0000-4000-8000-000000000405', 'e7b10000-0000-4000-8000-000000000101', 'e7b10000-0000-4000-8000-000000000301', 'NCOER', '2024-01-01', '2024-06-30', 'change-of-rater', NULL, 'AN', 'Rater left', '2026-02-05Z'),
  ('e7b10000-0000-4000-8000-000000000406', 'e7b10000-0000-4000-8000-000000000101', 'e7b10000-0000-4000-8000-000000000301', 'NCOER', '2023-01-01', '2023-12-31', 'completed', 'completed', 'AN', 'Agreed', '2026-02-06Z'),
  ('e7b10000-0000-4000-8000-000000000407', 'e7b10000-0000-4000-8000-000000000101', 'e7b10000-0000-4000-8000-000000000301', 'NCOER', '2022-01-01', '2022-06-30', 'change-of-rater', 'completed', 'AN', 'Rater left, workflow done', '2026-02-07Z');
INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rating_period_start,
  rating_period_end, status, workflow_status, report_type, intermediate_rater_name, notes, updated_at) VALUES
  ('e7b10000-0000-4000-8000-000000000408', 'e7b10000-0000-4000-8000-000000000101', 'e7b10000-0000-4000-8000-000000000301', 'OER', '2026-01-01', '2026-12-31', 'active', 'with-senior-rater', 'AN', 'MAJ Middle', 'With the senior rater first', '2026-02-08Z'),
  ('e7b10000-0000-4000-8000-000000000409', 'e7b10000-0000-4000-8000-000000000101', 'e7b10000-0000-4000-8000-000000000301', 'OER', '2026-01-01', '2026-12-31', 'active', 'sr-signed', 'AN', 'MAJ Middle', 'Senior rater signed first', '2026-02-09Z'),
  ('e7b10000-0000-4000-8000-000000000410', 'e7b10000-0000-4000-8000-000000000101', 'e7b10000-0000-4000-8000-000000000301', 'OER', '2026-01-01', '2026-12-31', 'active', 'ir-signed', 'AN', 'MAJ Middle', 'Both signed', '2026-02-10Z'),
  ('e7b10000-0000-4000-8000-000000000411', 'e7b10000-0000-4000-8000-000000000101', 'e7b10000-0000-4000-8000-000000000301', 'OER', '2026-01-01', '2026-12-31', 'active', 'with-intermediate-rater', 'AN', 'MAJ Middle', 'With the intermediate rater', '2026-02-11Z');
CREATE TABLE upgrade_fixture.evaluation_lifecycle_before AS
  SELECT id, to_jsonb(e) AS saved FROM public.rating_scheme_entries e
  WHERE organization_id = 'e7b10000-0000-4000-8000-000000000101';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.evaluation_lifecycle_before) <> 11 THEN
    RAISE EXCEPTION 'Evaluation lifecycle upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
