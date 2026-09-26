-- Populate Training records before the strict scope migration in a disposable project.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260926000300') THEN
    RAISE EXCEPTION 'Training upgrade fixture requires the preceding schema';
  END IF;
END;
$$;

INSERT INTO auth.users (id, email) VALUES
  ('b7000000-0000-4000-8000-000000000001', 'training-upgrade@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('b7000000-0000-4000-8000-000000000101', 'Training Upgrade', 'b7000000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('b7000000-0000-4000-8000-000000000201', 'b7000000-0000-4000-8000-000000000101', 'Alpha');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES (
  'b7000000-0000-4000-8000-000000000101', 'b7000000-0000-4000-8000-000000000001',
  'member', 'viewer', '{"training":"operate","personnel":"none"}',
  'groups', ARRAY['b7000000-0000-4000-8000-000000000201']::uuid[]
);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('b7000000-0000-4000-8000-000000000301', 'b7000000-0000-4000-8000-000000000101', 'b7000000-0000-4000-8000-000000000201', 'SPC', 'Active', 'Alpha', 'upgrade-active', NULL),
  ('b7000000-0000-4000-8000-000000000302', 'b7000000-0000-4000-8000-000000000101', 'b7000000-0000-4000-8000-000000000201', 'SPC', 'Archived', 'Alpha', 'upgrade-archived', '2026-01-01'),
  ('b7000000-0000-4000-8000-000000000303', 'b7000000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Alpha', 'upgrade-unassigned', NULL);
INSERT INTO public.training_types (id, organization_id, name) VALUES
  ('b7000000-0000-4000-8000-000000000401', 'b7000000-0000-4000-8000-000000000101', 'Existing Type');
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date) VALUES
  ('b7000000-0000-4000-8000-000000000501', 'b7000000-0000-4000-8000-000000000101', 'b7000000-0000-4000-8000-000000000301', 'b7000000-0000-4000-8000-000000000401', '2026-06-01'),
  ('b7000000-0000-4000-8000-000000000502', 'b7000000-0000-4000-8000-000000000101', 'b7000000-0000-4000-8000-000000000302', 'b7000000-0000-4000-8000-000000000401', '2026-06-02'),
  ('b7000000-0000-4000-8000-000000000503', 'b7000000-0000-4000-8000-000000000101', 'b7000000-0000-4000-8000-000000000303', 'b7000000-0000-4000-8000-000000000401', '2026-06-03');

CREATE TABLE upgrade_fixture.training_before_rows (
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  row_data jsonb NOT NULL,
  PRIMARY KEY (table_name, row_id)
);
INSERT INTO upgrade_fixture.training_before_rows
SELECT 'auth.users', id, to_jsonb(row_value) FROM auth.users AS row_value WHERE id = 'b7000000-0000-4000-8000-000000000001'
UNION ALL
SELECT 'public.organizations', id, to_jsonb(row_value) FROM public.organizations AS row_value WHERE id = 'b7000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.groups', id, to_jsonb(row_value) FROM public.groups AS row_value WHERE id = 'b7000000-0000-4000-8000-000000000201'
UNION ALL
SELECT 'public.organization_memberships', id, to_jsonb(row_value) FROM public.organization_memberships AS row_value WHERE organization_id = 'b7000000-0000-4000-8000-000000000101' AND user_id = 'b7000000-0000-4000-8000-000000000001'
UNION ALL
SELECT 'public.personnel', id, to_jsonb(row_value) FROM public.personnel AS row_value WHERE id IN ('b7000000-0000-4000-8000-000000000301','b7000000-0000-4000-8000-000000000302','b7000000-0000-4000-8000-000000000303')
UNION ALL
SELECT 'public.training_types', id, to_jsonb(row_value) FROM public.training_types AS row_value WHERE id = 'b7000000-0000-4000-8000-000000000401'
UNION ALL
SELECT 'public.personnel_trainings', id, to_jsonb(row_value) FROM public.personnel_trainings AS row_value WHERE id IN ('b7000000-0000-4000-8000-000000000501','b7000000-0000-4000-8000-000000000502','b7000000-0000-4000-8000-000000000503');
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.training_before_rows) <> 11 THEN
    RAISE EXCEPTION 'Training upgrade fixture is incomplete';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b7000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.personnel_trainings) <> 3 THEN
    RAISE EXCEPTION 'Pre-upgrade Training policy did not expose all three synthetic records';
  END IF;
END;
$$;
RESET ROLE;
COMMIT;
