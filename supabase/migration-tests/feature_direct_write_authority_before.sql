-- Saved feature rows before direct writes follow app authority.
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO auth.users(id,email)
SELECT ('f4600000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'feature-writes-upgrade-' || n || '@example.test' FROM generate_series(1,2) n;
INSERT INTO public.organizations(id,name,created_by) VALUES
('f4600000-0000-4000-8000-000000000101','Feature Writes Upgrade','f4600000-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships(
  organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
) VALUES
('f4600000-0000-4000-8000-000000000101','f4600000-0000-4000-8000-000000000001','owner','editor','{}','organization',ARRAY[]::uuid[]),
('f4600000-0000-4000-8000-000000000101','f4600000-0000-4000-8000-000000000002','member','viewer',
  '{"personnel":"operate","onboarding":"operate"}','organization',ARRAY[]::uuid[]);
INSERT INTO public.personnel(id,organization_id,rank,last_name,first_name,slug,archived_at) VALUES
('f4600000-0000-4000-8000-000000000301','f4600000-0000-4000-8000-000000000101','SGT','Active','Avery','feature-upgrade-active',NULL),
('f4600000-0000-4000-8000-000000000302','f4600000-0000-4000-8000-000000000101','SPC','Archived','Blake','feature-upgrade-archived','2029-01-01T00:00:00Z');
-- A saved path from before upload binding stays readable and editable.
INSERT INTO public.counseling_records(id,organization_id,personnel_id,date_conducted,subject,title,uploaded_by,file_path) VALUES
('f4600000-0000-4000-8000-000000000501','f4600000-0000-4000-8000-000000000101','f4600000-0000-4000-8000-000000000301',
  '2030-01-01','Legacy','Legacy path','fixture','legacy/counseling.pdf');
INSERT INTO public.personnel_onboardings(id,organization_id,personnel_id,status) VALUES
('f4600000-0000-4000-8000-000000000701','f4600000-0000-4000-8000-000000000101','f4600000-0000-4000-8000-000000000301','in_progress');
INSERT INTO public.onboarding_step_progress(id,organization_id,onboarding_id,step_name,step_type,sort_order,completed,notes) VALUES
('f4600000-0000-4000-8000-000000000711','f4600000-0000-4000-8000-000000000101','f4600000-0000-4000-8000-000000000701',
  'Orientation','checkbox',1,false,
  '[{"text":"Saved note","timestamp":"2030-01-01T00:00:00Z","userId":"f4600000-0000-4000-8000-000000000001"}]');
CREATE VIEW upgrade_fixture.feature_writes_current_rows AS
SELECT 'personnel'::text table_name,id::text row_id,to_jsonb(r) row_data FROM public.personnel r WHERE id::text LIKE 'f4600000-%'
UNION ALL SELECT 'counseling',id::text,to_jsonb(r) FROM public.counseling_records r WHERE id::text LIKE 'f4600000-%'
UNION ALL SELECT 'onboarding',id::text,to_jsonb(r) FROM public.personnel_onboardings r WHERE id::text LIKE 'f4600000-%'
UNION ALL SELECT 'step',id::text,to_jsonb(r) FROM public.onboarding_step_progress r WHERE id::text LIKE 'f4600000-%';
CREATE TABLE upgrade_fixture.feature_writes_before_rows AS
  SELECT * FROM upgrade_fixture.feature_writes_current_rows;
CREATE TABLE upgrade_fixture.feature_writes_baseline AS
SELECT NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012000600') migration_absent,
  to_regprocedure('public.is_full_editor_for_org(uuid)') IS NOT NULL legacy_helper_present;
