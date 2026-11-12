-- Evaluations as the old schema left them, with the audit entries its status column wrote. One person has a completed
-- evaluation a later one supersedes, an open one a later one supersedes, and one whose status last moved to completed.
-- Others have a completed evaluation whose status moved to completed and back, a completed newest one the log never
-- shows closing, and an open one.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261112130000') THEN
    RAISE EXCEPTION 'Rating scheme membership fixture requires the preceding schema';
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('e7c20000-0000-4000-8000-000000000001', 'rating-scheme-membership@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e7c20000-0000-4000-8000-000000000101', 'Rating Scheme Membership', 'e7c20000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  ('e7c20000-0000-4000-8000-000000000301', 'e7c20000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Able', 'membership-able'),
  ('e7c20000-0000-4000-8000-000000000302', 'e7c20000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Baker', 'membership-baker'),
  ('e7c20000-0000-4000-8000-000000000303', 'e7c20000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Cole', 'membership-cole'),
  ('e7c20000-0000-4000-8000-000000000304', 'e7c20000-0000-4000-8000-000000000101', 'SGT', 'Rated', 'Dana', 'membership-dana');
INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rating_period_start,
  rating_period_end, status, workflow_status, report_type, notes, updated_at) VALUES
  ('e7c20000-0000-4000-8000-000000000501', 'e7c20000-0000-4000-8000-000000000101', 'e7c20000-0000-4000-8000-000000000301', 'NCOER', '2023-01-01', '2023-12-31', 'active', 'completed', 'AN', 'Superseded and completed', '2026-02-01Z'),
  ('e7c20000-0000-4000-8000-000000000502', 'e7c20000-0000-4000-8000-000000000101', 'e7c20000-0000-4000-8000-000000000301', 'NCOER', '2024-01-01', '2024-12-31', 'active', 'sr-signed', 'AN', 'Superseded but open', '2026-02-02Z'),
  ('e7c20000-0000-4000-8000-000000000503', 'e7c20000-0000-4000-8000-000000000101', 'e7c20000-0000-4000-8000-000000000301', 'NCOER', '2025-01-01', '2025-12-31', 'completed', 'with-rater', 'AN', 'Status moved to completed', '2026-02-03Z'),
  ('e7c20000-0000-4000-8000-000000000504', 'e7c20000-0000-4000-8000-000000000101', 'e7c20000-0000-4000-8000-000000000302', 'NCOER', '2025-01-01', '2025-12-31', 'active', 'completed', 'AN', 'Completed, status moved back', '2026-02-04Z'),
  ('e7c20000-0000-4000-8000-000000000505', 'e7c20000-0000-4000-8000-000000000101', 'e7c20000-0000-4000-8000-000000000303', 'NCOER', '2026-01-01', '2026-12-31', 'active', 'completed', 'AN', 'Newest and completed', '2026-02-05Z'),
  ('e7c20000-0000-4000-8000-000000000506', 'e7c20000-0000-4000-8000-000000000101', 'e7c20000-0000-4000-8000-000000000304', 'NCOER', '2027-01-01', '2027-12-31', 'active', NULL, 'AN', 'Open', '2026-02-06Z');
INSERT INTO public.audit_logs (org_id, action, resource_type, resource_id, "timestamp", details) VALUES
  ('e7c20000-0000-4000-8000-000000000101', 'rating_scheme.updated', 'rating_scheme', 'e7c20000-0000-4000-8000-000000000503', '2026-03-01 09:00Z', '{"change": {"status": {"from": "active", "to": "completed"}}}'),
  ('e7c20000-0000-4000-8000-000000000101', 'rating_scheme.updated', 'rating_scheme', 'e7c20000-0000-4000-8000-000000000504', '2026-03-02 09:00Z', '{"change": {"status": {"from": "active", "to": "completed"}}}'),
  ('e7c20000-0000-4000-8000-000000000101', 'rating_scheme.updated', 'rating_scheme', 'e7c20000-0000-4000-8000-000000000504', '2026-03-03 09:00Z', '{"change": {"status": {"from": "completed", "to": "active"}}}');
CREATE TABLE upgrade_fixture.rating_scheme_membership_before AS
  SELECT id, to_jsonb(e) AS saved FROM public.rating_scheme_entries e
  WHERE organization_id = 'e7c20000-0000-4000-8000-000000000101';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.rating_scheme_membership_before) <> 6 THEN
    RAISE EXCEPTION 'Rating scheme membership upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
