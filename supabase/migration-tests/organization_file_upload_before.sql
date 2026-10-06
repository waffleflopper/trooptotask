-- Saved historical metadata, never evidence of stored file bytes.
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claim.role', '', false);
SELECT set_config('request.jwt.claims', '{}', false);
SELECT set_config('request.jwt', '', false);
INSERT INTO auth.users(id,email) VALUES
  ('fa180000-0000-4000-8000-000000000001','d17-file-owner@example.test'),
  ('fa180000-0000-4000-8000-000000000002','d17-file-admin@example.test'),
  ('fa180000-0000-4000-8000-000000000003','d17-file-foreign@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES
  ('fa180000-0000-4000-8000-000000000101','D17 file A','fa180000-0000-4000-8000-000000000001'),
  ('fa180000-0000-4000-8000-000000000102','D17 file B','fa180000-0000-4000-8000-000000000003');
INSERT INTO public.organization_memberships(organization_id,user_id,role,member_preset,access_scope_kind) VALUES
  ('fa180000-0000-4000-8000-000000000101','fa180000-0000-4000-8000-000000000001','owner','viewer','organization'),
  ('fa180000-0000-4000-8000-000000000101','fa180000-0000-4000-8000-000000000002','admin','viewer','organization'),
  ('fa180000-0000-4000-8000-000000000102','fa180000-0000-4000-8000-000000000003','owner','viewer','organization');
INSERT INTO public.personnel(id,organization_id,rank,first_name,last_name,slug) VALUES
  ('fa180000-0000-4000-8000-000000000301','fa180000-0000-4000-8000-000000000101','SPC','Synthetic','Upload','d17-upload-person');
INSERT INTO storage.buckets(id,name,public) VALUES ('d17-file-other','d17-file-other',false);
INSERT INTO storage.objects(id,bucket_id,name,metadata) VALUES
  ('fa180000-0000-4000-8000-000000000501','counseling-files','FA180000-0000-4000-8000-000000000101/history/counseling.pdf','{"size":17}'),
  ('fa180000-0000-4000-8000-000000000502','personnel-documents','fa180000-0000-4000-8000-000000000101/','{"size":19}'),
  ('fa180000-0000-4000-8000-000000000503','personnel-documents','fa180000-0000-4000-8000-000000000102/foreign.pdf','{"size":23}'),
  ('fa180000-0000-4000-8000-000000000504','counseling-files','fa180000-0000-4000-8000-000000000101-extra/legacy.pdf','{"size":29}'),
  ('fa180000-0000-4000-8000-000000000505','d17-file-other','fa180000-0000-4000-8000-000000000101/unrelated.pdf','{"size":31}');
CREATE VIEW upgrade_fixture.organization_file_upload_current_rows AS
SELECT 'auth.users'::text table_name,id::text row_id,to_jsonb(r) row_data FROM auth.users r WHERE id::text LIKE 'fa180000-%'
UNION ALL SELECT 'organizations',id::text,to_jsonb(r) - 'training_readiness_goal_percent' FROM public.organizations r WHERE id::text LIKE 'fa180000-%'
UNION ALL SELECT 'memberships',id::text,to_jsonb(r) FROM public.organization_memberships r WHERE organization_id::text LIKE 'fa180000-%'
UNION ALL SELECT 'personnel',id::text,to_jsonb(r) FROM public.personnel r WHERE id::text LIKE 'fa180000-%'
UNION ALL SELECT 'buckets',id,to_jsonb(r) FROM storage.buckets r WHERE id IN ('counseling-files','personnel-documents','d17-file-other')
UNION ALL SELECT 'objects',id::text,to_jsonb(r) FROM storage.objects r WHERE id::text LIKE 'fa180000-%';
CREATE TABLE upgrade_fixture.organization_file_upload_before_rows AS SELECT * FROM upgrade_fixture.organization_file_upload_current_rows;
CREATE TABLE upgrade_fixture.organization_file_upload_baseline AS
SELECT NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261002002000') migration_absent;
