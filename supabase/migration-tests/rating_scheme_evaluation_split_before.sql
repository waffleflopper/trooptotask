-- Entries as one table left them. Able has a completed Change of Rater report off the scheme and the open successor
-- with a new rater. Baker's entries are all archived, the newest one still open. Cole has two listed entries, the
-- older not tracked with another chain. Dana has one listed entry. Two deletion requests name entries.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261113120000') THEN
    RAISE EXCEPTION 'Rating scheme evaluation split fixture requires the preceding schema';
  END IF;
END;
$$;
-- The cancellation contract read entries through this view before the split; the split drops the entries table.
DROP VIEW IF EXISTS upgrade_fixture.deletion_request_cancellation_current_rows;

CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('e7c40000-0000-4000-8000-000000000001', 'rating-scheme-split@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e7c40000-0000-4000-8000-000000000101', 'Rating Scheme Split', 'e7c40000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  ('e7c40000-0000-4000-8000-000000000301', 'e7c40000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Able', 'split-able'),
  ('e7c40000-0000-4000-8000-000000000302', 'e7c40000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Baker', 'split-baker'),
  ('e7c40000-0000-4000-8000-000000000303', 'e7c40000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Cole', 'split-cole'),
  ('e7c40000-0000-4000-8000-000000000304', 'e7c40000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Dana', 'split-dana'),
  ('e7c40000-0000-4000-8000-000000000311', 'e7c40000-0000-4000-8000-000000000101', 'SSG', 'First', 'Rater', 'split-rater-one'),
  ('e7c40000-0000-4000-8000-000000000312', 'e7c40000-0000-4000-8000-000000000101', 'SSG', 'Second', 'Rater', 'split-rater-two'),
  ('e7c40000-0000-4000-8000-000000000313', 'e7c40000-0000-4000-8000-000000000101', 'SFC', 'Senior', 'Rater', 'split-senior');
INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rater_person_id, rater_name,
  intermediate_rater_name, senior_rater_person_id, senior_rater_name, reviewer_name, rating_period_start,
  rating_period_end, workflow_status, report_type, notes, created_at, updated_at, archived_at, archived_by) VALUES
  ('e7c40000-0000-4000-8000-000000000501', 'e7c40000-0000-4000-8000-000000000101', 'e7c40000-0000-4000-8000-000000000301', 'NCOER', 'e7c40000-0000-4000-8000-000000000311', NULL, NULL, 'e7c40000-0000-4000-8000-000000000313', NULL, NULL, '2025-01-01', '2025-06-30', 'completed', 'CR', 'Signed by the first rater', '2025-01-02Z', '2025-07-01Z', '2025-07-01Z', 'e7c40000-0000-4000-8000-000000000001'),
  ('e7c40000-0000-4000-8000-000000000502', 'e7c40000-0000-4000-8000-000000000101', 'e7c40000-0000-4000-8000-000000000301', 'NCOER', 'e7c40000-0000-4000-8000-000000000312', NULL, 'Ivy External', 'e7c40000-0000-4000-8000-000000000313', NULL, NULL, '2025-07-01', '2026-06-30', 'with-rater', 'AN', 'Successor', '2025-07-01Z', '2025-08-01Z', NULL, NULL),
  ('e7c40000-0000-4000-8000-000000000503', 'e7c40000-0000-4000-8000-000000000101', 'e7c40000-0000-4000-8000-000000000302', 'OER', NULL, 'Old External', NULL, NULL, 'Old Senior', NULL, '2024-01-01', '2024-12-31', 'completed', 'AN', 'Archived first', '2024-01-02Z', '2025-01-05Z', '2025-01-10Z', 'baker-first-archiver'),
  ('e7c40000-0000-4000-8000-000000000504', 'e7c40000-0000-4000-8000-000000000101', 'e7c40000-0000-4000-8000-000000000302', 'OER', NULL, 'New External', NULL, NULL, 'New Senior', 'Rex Reviewer', '2025-01-01', '2025-12-31', 'drafting', 'AN', 'Archived while open', '2025-01-02Z', '2025-03-01Z', '2025-03-02Z', 'baker-last-archiver'),
  ('e7c40000-0000-4000-8000-000000000505', 'e7c40000-0000-4000-8000-000000000101', 'e7c40000-0000-4000-8000-000000000303', 'NCOER', NULL, 'Cole Old Rater', NULL, NULL, 'Cole Senior', NULL, '2025-01-01', '2025-12-31', NULL, 'AN', 'Older, another chain', '2025-01-02Z', '2025-02-01Z', NULL, NULL),
  ('e7c40000-0000-4000-8000-000000000506', 'e7c40000-0000-4000-8000-000000000101', 'e7c40000-0000-4000-8000-000000000303', 'WOER', NULL, 'Cole Rater', NULL, NULL, 'Cole Senior', NULL, '2026-01-01', '2026-12-31', 'drafting', 'AN', 'Newest listed', '2026-01-02Z', '2026-02-01Z', NULL, NULL),
  ('e7c40000-0000-4000-8000-000000000507', 'e7c40000-0000-4000-8000-000000000101', 'e7c40000-0000-4000-8000-000000000304', 'NCOER', 'e7c40000-0000-4000-8000-000000000311', NULL, NULL, 'e7c40000-0000-4000-8000-000000000313', NULL, NULL, '2026-01-01', '2026-12-31', NULL, NULL, NULL, '2026-01-02Z', '2026-01-03Z', NULL, NULL);
INSERT INTO public.deletion_requests (id, organization_id, requested_by, requested_by_email, resource_type, resource_id,
  resource_description, resource_url, status) VALUES
  ('e7c40000-0000-4000-8000-000000000701', 'e7c40000-0000-4000-8000-000000000101', 'e7c40000-0000-4000-8000-000000000001', 'rating-scheme-split@example.test', 'rating_scheme_entry', 'e7c40000-0000-4000-8000-000000000505', 'Rating scheme entry for SGT Cole', '/org/e7c40000-0000-4000-8000-000000000101/evals', 'pending'),
  ('e7c40000-0000-4000-8000-000000000702', 'e7c40000-0000-4000-8000-000000000101', 'e7c40000-0000-4000-8000-000000000001', 'rating-scheme-split@example.test', 'rating_scheme_entry', 'e7c40000-0000-4000-8000-000000000501', 'Rating scheme entry for SGT Able', '/org/e7c40000-0000-4000-8000-000000000101/evals', 'denied');
CREATE TABLE upgrade_fixture.rating_scheme_evaluation_split_before AS
  SELECT id, to_jsonb(e) AS saved FROM public.rating_scheme_entries e
  WHERE organization_id = 'e7c40000-0000-4000-8000-000000000101';
-- Writing the entries above audited them; the split must add nothing to that history.
CREATE TABLE upgrade_fixture.rating_scheme_evaluation_split_audit AS
  SELECT id FROM public.audit_logs WHERE org_id = 'e7c40000-0000-4000-8000-000000000101';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.rating_scheme_evaluation_split_before) <> 7 THEN
    RAISE EXCEPTION 'Rating scheme evaluation split upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
