CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('b1643200-0000-4000-8000-000000000001', 'roster-upgrade-owner@example.test'),
  ('b1643200-0000-4000-8000-000000000002', 'roster-upgrade-operator@example.test'),
  ('b1643200-0000-4000-8000-000000000003', 'roster-upgrade-viewer@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('b1643200-0000-4000-8000-000000000101', 'Roster upgrade', 'b1643200-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('b1643200-0000-4000-8000-000000000201', 'b1643200-0000-4000-8000-000000000101', 'Upgrade group');
INSERT INTO public.organization_memberships (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids) VALUES
  ('b1643200-0000-4000-8000-000000000101', 'b1643200-0000-4000-8000-000000000001', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  ('b1643200-0000-4000-8000-000000000101', 'b1643200-0000-4000-8000-000000000002', 'member', 'viewer', '{"training":"operate"}', 'organization', ARRAY[]::uuid[]),
  ('b1643200-0000-4000-8000-000000000101', 'b1643200-0000-4000-8000-000000000003', 'member', 'viewer', '{"training":"view"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  ('b1643200-0000-4000-8000-000000000301', 'b1643200-0000-4000-8000-000000000101', 'b1643200-0000-4000-8000-000000000201', 'SGT', 'Saved', 'Person', 'roster-upgrade-person');
INSERT INTO public.sign_in_rosters (id, organization_id, title, roster_date, personnel_snapshot, personnel_ids, scope_group_ids, signed_file_path, created_by) VALUES
  ('b1643200-0000-4000-8000-000000000401', 'b1643200-0000-4000-8000-000000000101', 'Saved scan', '2030-03-01',
    '[{"id":"b1643200-0000-4000-8000-000000000301"}]', ARRAY['b1643200-0000-4000-8000-000000000301']::uuid[], ARRAY['b1643200-0000-4000-8000-000000000201']::uuid[],
    'b1643200-0000-4000-8000-000000000101/sign-in-rosters/b1643200-0000-4000-8000-000000000401/current.pdf', 'b1643200-0000-4000-8000-000000000001'),
  ('b1643200-0000-4000-8000-000000000402', 'b1643200-0000-4000-8000-000000000101', 'Legacy scan', '2030-03-01',
    '[{"id":"b1643200-0000-4000-8000-000000000301"}]', ARRAY['b1643200-0000-4000-8000-000000000301']::uuid[], ARRAY['b1643200-0000-4000-8000-000000000201']::uuid[],
    'b1643200-0000-4000-8000-000000000101/b1643200-0000-4000-8000-000000000402/signed.pdf', 'b1643200-0000-4000-8000-000000000001'),
  ('b1643200-0000-4000-8000-000000000403', 'b1643200-0000-4000-8000-000000000101', 'No scan', '2030-03-01',
    '[{"id":"b1643200-0000-4000-8000-000000000301"}]', ARRAY['b1643200-0000-4000-8000-000000000301']::uuid[], ARRAY['b1643200-0000-4000-8000-000000000201']::uuid[],
    NULL, 'b1643200-0000-4000-8000-000000000001');
INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES
  ('b1643200-0000-4000-8000-000000000501', 'counseling-files', 'b1643200-0000-4000-8000-000000000101/sign-in-rosters/b1643200-0000-4000-8000-000000000401/current.pdf', 'b1643200-0000-4000-8000-000000000002', 'b1643200-0000-4000-8000-000000000002', '{}'::jsonb),
  ('b1643200-0000-4000-8000-000000000502', 'counseling-files', 'b1643200-0000-4000-8000-000000000101/sign-in-rosters/b1643200-0000-4000-8000-000000000401/orphan.pdf', 'b1643200-0000-4000-8000-000000000002', 'b1643200-0000-4000-8000-000000000002', '{}'::jsonb),
  ('b1643200-0000-4000-8000-000000000503', 'counseling-files', 'b1643200-0000-4000-8000-000000000101/b1643200-0000-4000-8000-000000000402/signed.pdf', 'b1643200-0000-4000-8000-000000000002', 'b1643200-0000-4000-8000-000000000002', '{}'::jsonb);

CREATE VIEW upgrade_fixture.sign_in_roster_scan_current_rows AS
SELECT 'public.sign_in_rosters'::text AS table_name, id::text AS row_id, to_jsonb(row_value) AS row_data
  FROM public.sign_in_rosters AS row_value WHERE id::text LIKE 'b1643200-%'
UNION ALL SELECT 'storage.objects', id::text, jsonb_build_object('bucket_id', bucket_id, 'name', name, 'owner_id', owner_id)
  FROM storage.objects WHERE id::text LIKE 'b1643200-%';
CREATE TABLE upgrade_fixture.sign_in_roster_scan_before_rows AS
  SELECT * FROM upgrade_fixture.sign_in_roster_scan_current_rows;
CREATE TABLE upgrade_fixture.sign_in_roster_scan_baseline AS
SELECT NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261013000600'
) AS migration_absent;
