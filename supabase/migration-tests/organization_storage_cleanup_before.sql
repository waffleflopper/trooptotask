-- Synthetic saved rows shared by fresh and populated-upgrade proof. The
-- staged runner loads this before the new migration; its after test verifies
-- that the migration was absent and orphan visibility was zero at this point.
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('fa170000-0000-4000-8000-000000000001', 'd17-owner@example.test'),
  ('fa170000-0000-4000-8000-000000000002', 'd17-admin@example.test'),
  ('fa170000-0000-4000-8000-000000000003', 'd17-configurator@example.test'),
  ('fa170000-0000-4000-8000-000000000004', 'd17-foreign-owner@example.test'),
  ('fa170000-0000-4000-8000-000000000005', 'd17-uploader-staff@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('fa170000-0000-4000-8000-000000000101', 'D17 retained A', 'fa170000-0000-4000-8000-000000000001'),
  ('fa170000-0000-4000-8000-000000000102', 'D17 retained B', 'fa170000-0000-4000-8000-000000000004');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('fa170000-0000-4000-8000-000000000101', 'fa170000-0000-4000-8000-000000000001', 'owner', 'viewer', '{}', 'organization', ARRAY[]::uuid[]),
  ('fa170000-0000-4000-8000-000000000101', 'fa170000-0000-4000-8000-000000000002', 'admin', 'viewer', '{}', 'organization', ARRAY[]::uuid[]),
  ('fa170000-0000-4000-8000-000000000101', 'fa170000-0000-4000-8000-000000000003', 'member', 'viewer', '{"personnel":"configure","training":"view"}', 'organization', ARRAY[]::uuid[]),
  ('fa170000-0000-4000-8000-000000000102', 'fa170000-0000-4000-8000-000000000004', 'owner', 'viewer', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.platform_admins (user_id, role, is_active) VALUES
  ('fa170000-0000-4000-8000-000000000005', 'support', true);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  ('fa170000-0000-4000-8000-000000000301', 'fa170000-0000-4000-8000-000000000101', 'SPC', 'Retained', 'Person', 'd17-retained-person');
INSERT INTO public.sign_in_rosters (
  id, organization_id, title, roster_date, personnel_snapshot, personnel_ids,
  scope_group_ids, signed_file_path, created_by
) VALUES (
  'fa170000-0000-4000-8000-000000000401', 'fa170000-0000-4000-8000-000000000101',
  'D17 retained roster', '2030-01-01', '[{"id":"fa170000-0000-4000-8000-000000000301"}]',
  ARRAY['fa170000-0000-4000-8000-000000000301']::uuid[], ARRAY[]::uuid[],
  'fa170000-0000-4000-8000-000000000101/sign-in-rosters/fa170000-0000-4000-8000-000000000401/saved.pdf',
  'fa170000-0000-4000-8000-000000000001'
);
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by) VALUES
  ('fa170000-0000-4000-8000-000000000601', 'fa170000-0000-4000-8000-000000000101', 'fa170000-0000-4000-8000-000000000301', '2030-01-01', 'Retained subject', 'Retained counseling', 'fixture');
INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by) VALUES
  ('fa170000-0000-4000-8000-000000000602', 'fa170000-0000-4000-8000-000000000101', 'fa170000-0000-4000-8000-000000000301', 'Retained document', 'fa170000-0000-4000-8000-000000000101/personnel/fa170000-0000-4000-8000-000000000301/documents/saved.pdf', 256, 'application/pdf', 'fixture');
INSERT INTO storage.buckets (id, name, public) VALUES ('d17-unrelated', 'd17-unrelated', false);
-- The original uploader is neither an Organization member nor its owner.
INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata)
SELECT id::uuid, bucket, object_name,
  'fa170000-0000-4000-8000-000000000005'::uuid,
  'fa170000-0000-4000-8000-000000000005', '{"size":256,"mimetype":"application/pdf"}'::jsonb
FROM (VALUES
  ('fa170000-0000-4000-8000-000000000501', 'counseling-files', 'fa170000-0000-4000-8000-000000000101/counseling-records/fa170000-0000-4000-8000-000000000301/saved.pdf'),
  ('fa170000-0000-4000-8000-000000000502', 'personnel-documents', 'fa170000-0000-4000-8000-000000000101/personnel/fa170000-0000-4000-8000-000000000301/documents/saved.pdf'),
  ('fa170000-0000-4000-8000-000000000503', 'counseling-files', 'fa170000-0000-4000-8000-000000000101/sign-in-rosters/fa170000-0000-4000-8000-000000000401/saved.pdf'),
  ('fa170000-0000-4000-8000-000000000504', 'counseling-files', 'fa170000-0000-4000-8000-000000000101/counseling-records/fa170000-0000-4000-8000-000000000999/missing.pdf'),
  ('fa170000-0000-4000-8000-000000000505', 'personnel-documents', 'fa170000-0000-4000-8000-000000000101/personnel/fa170000-0000-4000-8000-000000000999/documents/missing.pdf'),
  ('fa170000-0000-4000-8000-000000000506', 'counseling-files', 'FA170000-0000-4000-8000-000000000101/old/orphan.pdf'),
  ('fa170000-0000-4000-8000-000000000507', 'personnel-documents', 'Fa170000-0000-4000-8000-000000000101/nested/deeper/lost.pdf'),
  ('fa170000-0000-4000-8000-000000000508', 'personnel-documents', 'fa170000-0000-4000-8000-000000000101/loose.pdf'),
  ('fa170000-0000-4000-8000-000000000509', 'counseling-files', 'fa170000-0000-4000-8000-000000000101'),
  ('fa170000-0000-4000-8000-000000000510', 'counseling-files', 'fa170000000040008000000000000101/orphan.pdf'),
  ('fa170000-0000-4000-8000-000000000511', 'personnel-documents', '{fa170000-0000-4000-8000-000000000101}/orphan.pdf'),
  ('fa170000-0000-4000-8000-000000000512', 'counseling-files', 'xfa170000-0000-4000-8000-000000000101/orphan.pdf'),
  ('fa170000-0000-4000-8000-000000000513', 'personnel-documents', 'fa170000-0000-4000-8000-000000000101x/orphan.pdf'),
  ('fa170000-0000-4000-8000-000000000514', 'counseling-files', 'fa170000-0000-4000-8000-000000000102/orphan.pdf'),
  ('fa170000-0000-4000-8000-000000000515', 'personnel-documents', 'fa170000-0000-4000-8000-000000000102/nested/orphan.pdf'),
  ('fa170000-0000-4000-8000-000000000516', 'd17-unrelated', 'fa170000-0000-4000-8000-000000000101/orphan.pdf'),
  ('fa170000-0000-4000-8000-000000000517', 'counseling-files', 'ga170000-0000-4000-8000-000000000101/orphan.pdf'),
  ('fa170000-0000-4000-8000-000000000518', 'personnel-documents', 'before/fa170000-0000-4000-8000-000000000101/orphan.pdf')
) AS objects(id, bucket, object_name);

CREATE VIEW upgrade_fixture.organization_storage_cleanup_current_rows AS
SELECT 'auth.users'::text AS table_name, id::text AS row_id, to_jsonb(row_value) AS row_data
  FROM auth.users AS row_value WHERE id::text LIKE 'fa170000-%'
UNION ALL SELECT 'public.organizations', id::text, to_jsonb(row_value) - 'training_readiness_goal_percent'
  FROM public.organizations AS row_value WHERE id::text LIKE 'fa170000-%'
UNION ALL SELECT 'public.organization_memberships', id::text, to_jsonb(row_value)
  FROM public.organization_memberships AS row_value WHERE organization_id::text LIKE 'fa170000-%'
UNION ALL SELECT 'public.platform_admins', user_id::text, to_jsonb(row_value)
  FROM public.platform_admins AS row_value WHERE user_id::text LIKE 'fa170000-%'
UNION ALL SELECT 'public.personnel', id::text, to_jsonb(row_value)
  FROM public.personnel AS row_value WHERE id::text LIKE 'fa170000-%'
UNION ALL SELECT 'public.sign_in_rosters', id::text, to_jsonb(row_value)
  FROM public.sign_in_rosters AS row_value WHERE id::text LIKE 'fa170000-%'
UNION ALL SELECT 'public.counseling_records', id::text, to_jsonb(row_value)
  FROM public.counseling_records AS row_value WHERE id::text LIKE 'fa170000-%'
UNION ALL SELECT 'public.personnel_documents', id::text, to_jsonb(row_value)
  FROM public.personnel_documents AS row_value WHERE id::text LIKE 'fa170000-%'
UNION ALL SELECT 'storage.buckets', id, to_jsonb(row_value)
  FROM storage.buckets AS row_value WHERE id IN ('counseling-files', 'personnel-documents', 'd17-unrelated')
UNION ALL SELECT 'storage.objects', id::text, to_jsonb(row_value)
  FROM storage.objects AS row_value WHERE id::text LIKE 'fa170000-%';
CREATE TABLE upgrade_fixture.organization_storage_cleanup_before_rows AS
  SELECT * FROM upgrade_fixture.organization_storage_cleanup_current_rows;
CREATE TEMP TABLE d17_baseline_visibility (objects integer);
GRANT INSERT ON d17_baseline_visibility TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fa170000-0000-4000-8000-000000000001', false);
INSERT INTO d17_baseline_visibility SELECT count(*) FROM storage.objects
  WHERE id BETWEEN 'fa170000-0000-4000-8000-000000000504' AND 'fa170000-0000-4000-8000-000000000508';
RESET ROLE;
CREATE TABLE upgrade_fixture.organization_storage_cleanup_baseline AS
SELECT NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261002001000'
) AS migration_absent, (SELECT objects FROM d17_baseline_visibility) AS visible_orphans;
DROP TABLE d17_baseline_visibility;
