-- Saved Personnel identities and values on the schema before the row-scope repair.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260926000700') THEN
    RAISE EXCEPTION 'Personnel scope fixture requires the preceding schema';
  END IF;
END;
$$;
INSERT INTO auth.users (id, email) VALUES
  ('d7000000-0000-4000-8000-000000000001', 'personnel-upgrade-group@example.test'),
  ('d7000000-0000-4000-8000-000000000002', 'personnel-upgrade-empty@example.test'),
  ('d7000000-0000-4000-8000-000000000003', 'personnel-upgrade-org@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('d7000000-0000-4000-8000-000000000101', 'Personnel Upgrade', 'd7000000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('d7000000-0000-4000-8000-000000000201', 'd7000000-0000-4000-8000-000000000101', 'Alpha');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('d7000000-0000-4000-8000-000000000101', 'd7000000-0000-4000-8000-000000000001', 'member', 'viewer', '{"personnel":"operate"}', 'groups', ARRAY['d7000000-0000-4000-8000-000000000201']::uuid[]),
  ('d7000000-0000-4000-8000-000000000101', 'd7000000-0000-4000-8000-000000000002', 'member', 'viewer', '{"personnel":"operate"}', 'groups', ARRAY[]::uuid[]),
  ('d7000000-0000-4000-8000-000000000101', 'd7000000-0000-4000-8000-000000000003', 'member', 'viewer', '{"personnel":"operate"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('d7000000-0000-4000-8000-000000000301', 'd7000000-0000-4000-8000-000000000101', 'd7000000-0000-4000-8000-000000000201', 'SPC', 'Assigned', 'Active', 'personnel-upgrade-assigned-active', NULL),
  ('d7000000-0000-4000-8000-000000000302', 'd7000000-0000-4000-8000-000000000101', 'd7000000-0000-4000-8000-000000000201', 'SPC', 'Assigned', 'Archived', 'personnel-upgrade-assigned-archived', '2029-01-01'),
  ('d7000000-0000-4000-8000-000000000303', 'd7000000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Archived', 'personnel-upgrade-unassigned-archived', '2029-01-01');

CREATE TABLE upgrade_fixture.personnel_unassigned_before_rows (
  table_name text NOT NULL, row_id uuid NOT NULL, row_data jsonb NOT NULL,
  PRIMARY KEY (table_name, row_id)
);
INSERT INTO upgrade_fixture.personnel_unassigned_before_rows
SELECT 'auth.users', id, to_jsonb(row_value) FROM auth.users AS row_value WHERE id IN ('d7000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000002','d7000000-0000-4000-8000-000000000003')
UNION ALL
SELECT 'public.organizations', id, to_jsonb(row_value) FROM public.organizations AS row_value WHERE id = 'd7000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.groups', id, to_jsonb(row_value) FROM public.groups AS row_value WHERE id = 'd7000000-0000-4000-8000-000000000201'
UNION ALL
SELECT 'public.organization_memberships', id, to_jsonb(row_value) FROM public.organization_memberships AS row_value WHERE organization_id = 'd7000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel', id, to_jsonb(row_value) FROM public.personnel AS row_value WHERE organization_id = 'd7000000-0000-4000-8000-000000000101';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.personnel_unassigned_before_rows) <> 11 THEN
    RAISE EXCEPTION 'Personnel upgrade fixture is incomplete';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd7000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.personnel) <> 3 THEN
    RAISE EXCEPTION 'Pre-upgrade Group member no longer sees unassigned Person';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub', 'd7000000-0000-4000-8000-000000000002', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.personnel) <> 1 THEN
    RAISE EXCEPTION 'Pre-upgrade empty Group scope no longer sees unassigned Person';
  END IF;
END;
$$;
RESET ROLE;
COMMIT;
