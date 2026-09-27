-- Historical Rating Scheme rows include active and archived unassigned People.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260926000900') THEN
    RAISE EXCEPTION 'Rating Scheme fixture requires the preceding schema';
  END IF;
END;
$$;
INSERT INTO auth.users (id, email) VALUES
  ('f9000000-0000-4000-8000-000000000001', 'rating-upgrade-group@example.test'),
  ('f9000000-0000-4000-8000-000000000002', 'rating-upgrade-org@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('f9000000-0000-4000-8000-000000000101', 'Rating Upgrade', 'f9000000-0000-4000-8000-000000000002');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('f9000000-0000-4000-8000-000000000201', 'f9000000-0000-4000-8000-000000000101', 'Alpha');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000001', 'member', 'viewer', '{"ratingScheme":"operate","personnel":"none"}', 'groups', ARRAY['f9000000-0000-4000-8000-000000000201']::uuid[]),
  ('f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000002', 'member', 'viewer', '{"ratingScheme":"operate","personnel":"none"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('f9000000-0000-4000-8000-000000000301', 'f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000201', 'SPC', 'Assigned', 'Active', 'rating-upgrade-assigned-active', NULL),
  ('f9000000-0000-4000-8000-000000000302', 'f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000201', 'SGT', 'Assigned', 'Archived', 'rating-upgrade-assigned-archived', '2029-01-01'),
  ('f9000000-0000-4000-8000-000000000303', 'f9000000-0000-4000-8000-000000000101', NULL, 'PFC', 'Unassigned', 'Active', 'rating-upgrade-unassigned-active', NULL),
  ('f9000000-0000-4000-8000-000000000304', 'f9000000-0000-4000-8000-000000000101', NULL, 'CPL', 'Unassigned', 'Archived', 'rating-upgrade-unassigned-archived', '2029-01-01');
INSERT INTO public.rating_scheme_entries
  (id, organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end, notes) VALUES
  ('f9000000-0000-4000-8000-000000000401', 'f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000301', 'NCOER', '2029-01-01', '2029-12-31', 'assigned active'),
  ('f9000000-0000-4000-8000-000000000402', 'f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000302', 'NCOER', '2029-01-01', '2029-12-31', 'assigned archived'),
  ('f9000000-0000-4000-8000-000000000403', 'f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000303', 'NCOER', '2029-01-01', '2029-12-31', 'unassigned active'),
  ('f9000000-0000-4000-8000-000000000404', 'f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000304', 'NCOER', '2029-01-01', '2029-12-31', 'unassigned archived');

CREATE TABLE upgrade_fixture.rating_scheme_before_rows (
  table_name text NOT NULL, row_id uuid NOT NULL, row_data jsonb NOT NULL,
  PRIMARY KEY (table_name, row_id)
);
INSERT INTO upgrade_fixture.rating_scheme_before_rows
SELECT 'auth.users', id, to_jsonb(row_value) FROM auth.users AS row_value WHERE id IN ('f9000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000002')
UNION ALL
SELECT 'public.organizations', id, to_jsonb(row_value) FROM public.organizations AS row_value WHERE id = 'f9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.groups', id, to_jsonb(row_value) FROM public.groups AS row_value WHERE id = 'f9000000-0000-4000-8000-000000000201'
UNION ALL
SELECT 'public.organization_memberships', id, to_jsonb(row_value) FROM public.organization_memberships AS row_value WHERE organization_id = 'f9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel', id, to_jsonb(row_value) FROM public.personnel AS row_value WHERE organization_id = 'f9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.rating_scheme_entries', id, to_jsonb(row_value) FROM public.rating_scheme_entries AS row_value WHERE organization_id = 'f9000000-0000-4000-8000-000000000101';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.rating_scheme_before_rows) <> 14 THEN
    RAISE EXCEPTION 'Rating Scheme upgrade fixture is incomplete';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.rating_scheme_entries) <> 4 OR
     (SELECT count(*) FROM public.list_rating_scheme_personnel_lookup('f9000000-0000-4000-8000-000000000101')) <> 2 OR
     NOT public.can_edit_rating_scheme_record('f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000304') THEN
    RAISE EXCEPTION 'Pre-upgrade Rating Scheme NULL Group behavior changed';
  END IF;
END;
$$;
RESET ROLE;
COMMIT;
