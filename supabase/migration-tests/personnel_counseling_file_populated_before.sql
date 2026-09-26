-- Saved Personnel and file objects on the preceding schema, including an
-- unassigned Person's counseling file that Group scope currently exposes.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260926000800') THEN
    RAISE EXCEPTION 'Counseling file fixture requires the preceding schema';
  END IF;
END;
$$;
INSERT INTO auth.users (id, email) VALUES
  ('e9000000-0000-4000-8000-000000000001', 'file-upgrade-group@example.test'),
  ('e9000000-0000-4000-8000-000000000002', 'file-upgrade-org@example.test'),
  ('e9000000-0000-4000-8000-000000000003', 'file-upgrade-training@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e9000000-0000-4000-8000-000000000101', 'Counseling File Upgrade', 'e9000000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('e9000000-0000-4000-8000-000000000201', 'e9000000-0000-4000-8000-000000000101', 'Alpha');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('e9000000-0000-4000-8000-000000000101', 'e9000000-0000-4000-8000-000000000001', 'member', 'viewer', '{"personnel":"operate","training":"none"}', 'groups', ARRAY['e9000000-0000-4000-8000-000000000201']::uuid[]),
  ('e9000000-0000-4000-8000-000000000101', 'e9000000-0000-4000-8000-000000000002', 'member', 'viewer', '{"personnel":"operate","training":"none"}', 'organization', ARRAY[]::uuid[]),
  ('e9000000-0000-4000-8000-000000000101', 'e9000000-0000-4000-8000-000000000003', 'member', 'viewer', '{"personnel":"none","training":"view"}', 'groups', ARRAY['e9000000-0000-4000-8000-000000000201']::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('e9000000-0000-4000-8000-000000000301', 'e9000000-0000-4000-8000-000000000101', 'e9000000-0000-4000-8000-000000000201', 'SPC', 'Alpha', 'Archived', 'file-upgrade-alpha', '2029-01-01'),
  ('e9000000-0000-4000-8000-000000000302', 'e9000000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Archived', 'file-upgrade-unassigned', '2029-01-01');
INSERT INTO public.sign_in_rosters (
  id, organization_id, title, roster_date, blank_date, separate_by_group, sort_by,
  personnel_snapshot, personnel_ids, scope_group_ids, created_by
) VALUES (
  'e9000000-0000-4000-8000-000000000401', 'e9000000-0000-4000-8000-000000000101',
  'Alpha roster', '2030-01-01', false, false, 'alphabetical',
  '[{"id":"e9000000-0000-4000-8000-000000000301"}]',
  ARRAY['e9000000-0000-4000-8000-000000000301']::uuid[],
  ARRAY['e9000000-0000-4000-8000-000000000201']::uuid[],
  'e9000000-0000-4000-8000-000000000001'
);
INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES
  ('e9000000-0000-4000-8000-000000000501', 'counseling-files', 'e9000000-0000-4000-8000-000000000101/counseling-records/e9000000-0000-4000-8000-000000000301/alpha.pdf', 'e9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', '{}'::jsonb),
  ('e9000000-0000-4000-8000-000000000502', 'counseling-files', 'e9000000-0000-4000-8000-000000000101/counseling-records/e9000000-0000-4000-8000-000000000302/unassigned.pdf', 'e9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', '{}'::jsonb),
  ('e9000000-0000-4000-8000-000000000503', 'counseling-files', 'e9000000-0000-4000-8000-000000000101/sign-in-rosters/e9000000-0000-4000-8000-000000000401/alpha.pdf', 'e9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', '{}'::jsonb);

CREATE TABLE upgrade_fixture.personnel_counseling_file_before_rows (
  table_name text NOT NULL, row_id uuid NOT NULL, row_data jsonb NOT NULL,
  PRIMARY KEY (table_name, row_id)
);
INSERT INTO upgrade_fixture.personnel_counseling_file_before_rows
SELECT 'auth.users', id, to_jsonb(row_value) FROM auth.users AS row_value WHERE id IN ('e9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000002','e9000000-0000-4000-8000-000000000003')
UNION ALL
SELECT 'public.organizations', id, to_jsonb(row_value) FROM public.organizations AS row_value WHERE id = 'e9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.groups', id, to_jsonb(row_value) FROM public.groups AS row_value WHERE id = 'e9000000-0000-4000-8000-000000000201'
UNION ALL
SELECT 'public.organization_memberships', id, to_jsonb(row_value) FROM public.organization_memberships AS row_value WHERE organization_id = 'e9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel', id, to_jsonb(row_value) FROM public.personnel AS row_value WHERE organization_id = 'e9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.sign_in_rosters', id, to_jsonb(row_value) FROM public.sign_in_rosters AS row_value WHERE id = 'e9000000-0000-4000-8000-000000000401'
UNION ALL
SELECT 'storage.objects', id, to_jsonb(row_value) FROM storage.objects AS row_value WHERE id IN ('e9000000-0000-4000-8000-000000000501','e9000000-0000-4000-8000-000000000502','e9000000-0000-4000-8000-000000000503');
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.personnel_counseling_file_before_rows) <> 14 THEN
    RAISE EXCEPTION 'Counseling file upgrade fixture is incomplete';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM storage.objects) <> 2 THEN
    RAISE EXCEPTION 'Pre-upgrade Group file access changed';
  END IF;
END;
$$;
RESET ROLE;
COMMIT;
