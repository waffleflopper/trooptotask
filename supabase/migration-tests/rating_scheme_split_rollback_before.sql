-- Entries in one table, for the split's rollback round trip. Able has one open entry, Baker's two entries are archived,
-- Cole has an older not-tracked entry with another chain and an open one, Dana has a not-tracked entry rated by a
-- Person retention will delete, and Eve is an archived Person retention will delete.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261113120000') THEN
    RAISE EXCEPTION 'Rating scheme split rollback fixture requires the preceding schema';
  END IF;
END;
$$;
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at) VALUES
  ('e7c50000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'split-rollback@example.test', now());
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e7c50000-0000-4000-8000-000000000101', 'Rating Scheme Split Rollback', 'e7c50000-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  ('e7c50000-0000-4000-8000-000000000101', 'e7c50000-0000-4000-8000-000000000001', 'owner', 'editor', '{}',
    'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('e7c50000-0000-4000-8000-000000000301', 'e7c50000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Able', 'rollback-able', NULL),
  ('e7c50000-0000-4000-8000-000000000302', 'e7c50000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Baker', 'rollback-baker', NULL),
  ('e7c50000-0000-4000-8000-000000000303', 'e7c50000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Cole', 'rollback-cole', NULL),
  ('e7c50000-0000-4000-8000-000000000304', 'e7c50000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Dana', 'rollback-dana', NULL),
  ('e7c50000-0000-4000-8000-000000000305', 'e7c50000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Eve', 'rollback-eve', '2020-01-01Z'),
  ('e7c50000-0000-4000-8000-000000000311', 'e7c50000-0000-4000-8000-000000000101', 'SSG', 'Leaving', 'Rater', 'rollback-rater', '2020-01-01Z');
INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rater_person_id, rater_name,
  intermediate_rater_name, senior_rater_name, rating_period_start, rating_period_end, workflow_status, report_type,
  notes, created_at, updated_at, archived_at, archived_by) VALUES
  ('e7c50000-0000-4000-8000-000000000501', 'e7c50000-0000-4000-8000-000000000101', 'e7c50000-0000-4000-8000-000000000301', 'NCOER', NULL, 'Able Rater', 'Ivy External', 'Able Senior', '2026-01-01', '2026-12-31', 'drafting', 'AN', 'Able notes', '2026-01-02Z', '2026-01-03Z', NULL, NULL),
  ('e7c50000-0000-4000-8000-000000000502', 'e7c50000-0000-4000-8000-000000000101', 'e7c50000-0000-4000-8000-000000000302', 'OER', NULL, 'Old Rater', NULL, 'Old Senior', '2024-01-01', '2024-12-31', 'completed', 'AN', 'Baker first', '2024-01-02Z', '2025-01-05Z', '2025-01-10Z', 'baker-first-archiver'),
  ('e7c50000-0000-4000-8000-000000000503', 'e7c50000-0000-4000-8000-000000000101', 'e7c50000-0000-4000-8000-000000000302', 'OER', NULL, 'New Rater', NULL, 'New Senior', '2025-01-01', '2025-12-31', 'drafting', 'AN', 'Baker open', '2025-01-02Z', '2025-03-01Z', '2025-03-02Z', 'baker-last-archiver'),
  ('e7c50000-0000-4000-8000-000000000504', 'e7c50000-0000-4000-8000-000000000101', 'e7c50000-0000-4000-8000-000000000303', 'NCOER', NULL, 'Cole Old Rater', NULL, 'Cole Senior', '2025-01-01', '2025-12-31', NULL, 'AN', 'Cole older', '2025-01-02Z', '2025-02-01Z', NULL, NULL),
  ('e7c50000-0000-4000-8000-000000000505', 'e7c50000-0000-4000-8000-000000000101', 'e7c50000-0000-4000-8000-000000000303', 'NCOER', NULL, 'Cole Rater', NULL, 'Cole Senior', '2026-01-01', '2026-12-31', 'drafting', 'AN', 'Cole newest', '2026-01-02Z', '2026-02-01Z', NULL, NULL),
  ('e7c50000-0000-4000-8000-000000000506', 'e7c50000-0000-4000-8000-000000000101', 'e7c50000-0000-4000-8000-000000000304', 'NCOER', 'e7c50000-0000-4000-8000-000000000311', NULL, NULL, 'Dana Senior', '2026-01-01', '2026-12-31', NULL, NULL, NULL, '2026-01-02Z', '2026-01-03Z', NULL, NULL),
  ('e7c50000-0000-4000-8000-000000000507', 'e7c50000-0000-4000-8000-000000000101', 'e7c50000-0000-4000-8000-000000000305', 'WOER', NULL, 'Eve Rater', NULL, 'Eve Senior', '2026-01-01', '2026-12-31', 'drafting', 'AN', 'Eve notes', '2026-01-02Z', '2026-01-03Z', NULL, NULL);
INSERT INTO public.deletion_requests (id, organization_id, requested_by, requested_by_email, resource_type, resource_id,
  resource_description, resource_url, status) VALUES
  ('e7c50000-0000-4000-8000-000000000701', 'e7c50000-0000-4000-8000-000000000101', 'e7c50000-0000-4000-8000-000000000001', 'split-rollback@example.test', 'rating_scheme_entry', 'e7c50000-0000-4000-8000-000000000504', 'Rating scheme entry for SGT Cole', '/org/e7c50000-0000-4000-8000-000000000101/evals', 'pending'),
  ('e7c50000-0000-4000-8000-000000000702', 'e7c50000-0000-4000-8000-000000000101', 'e7c50000-0000-4000-8000-000000000001', 'split-rollback@example.test', 'rating_scheme_entry', 'e7c50000-0000-4000-8000-000000000505', 'Rating scheme entry for SGT Cole', '/org/e7c50000-0000-4000-8000-000000000101/evals', 'denied');
CREATE TABLE upgrade_fixture.rating_scheme_split_rollback_before AS
  SELECT id, to_jsonb(e) AS saved FROM public.rating_scheme_entries e
  WHERE organization_id = 'e7c50000-0000-4000-8000-000000000101';
-- Earlier upgrade fixtures leave legacy evaluator links to another Organization's People, which main's keys skip.
CREATE TABLE upgrade_fixture.rating_scheme_split_rollback_foreign_links AS
  SELECT e.id, e.rater_person_id, e.intermediate_rater_person_id, e.senior_rater_person_id, e.reviewer_person_id
  FROM public.rating_scheme_entries e
  WHERE EXISTS (SELECT 1 FROM public.personnel p WHERE p.organization_id <> e.organization_id
    AND p.id IN (e.rater_person_id, e.intermediate_rater_person_id, e.senior_rater_person_id, e.reviewer_person_id));
COMMIT;
