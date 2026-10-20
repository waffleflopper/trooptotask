-- Saved suspended Organization and account rows before SQL admission.
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claim.role', '', false);
SELECT set_config('request.jwt.claims', '{}', false);
SELECT set_config('request.jwt', '', false);
INSERT INTO auth.users(id,email)
SELECT ('c6422000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'suspension-upgrade-' || n || '@example.test' FROM generate_series(1,4) n;
INSERT INTO public.organizations(id,name,created_by,suspended_at) VALUES
('c6422000-0000-4000-8000-000000000101','Suspended Upgrade','c6422000-0000-4000-8000-000000000001','2030-01-02T03:04:05Z'),
('c6422000-0000-4000-8000-000000000102','Active Upgrade','c6422000-0000-4000-8000-000000000002',NULL);
INSERT INTO public.organization_memberships(
  id,organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
) VALUES
('c6422000-0000-4000-8000-000000000301','c6422000-0000-4000-8000-000000000101','c6422000-0000-4000-8000-000000000001','owner','editor','{}','organization',ARRAY[]::uuid[]),
('c6422000-0000-4000-8000-000000000302','c6422000-0000-4000-8000-000000000102','c6422000-0000-4000-8000-000000000002','owner','editor','{}','organization',ARRAY[]::uuid[]),
('c6422000-0000-4000-8000-000000000303','c6422000-0000-4000-8000-000000000102','c6422000-0000-4000-8000-000000000003','member','editor','{}','organization',ARRAY[]::uuid[]);
INSERT INTO public.personnel(id,organization_id,rank,last_name,first_name,clinic_role,mos,slug) VALUES
('c6422000-0000-4000-8000-000000000401','c6422000-0000-4000-8000-000000000101','SGT','Suspended','Sam','Medic','68W','suspension-upgrade-sam'),
('c6422000-0000-4000-8000-000000000402','c6422000-0000-4000-8000-000000000102','SSG','Active','Ari','Medic','68W','suspension-upgrade-ari');
INSERT INTO public.user_suspensions(user_id,suspended_by,reason) VALUES
('c6422000-0000-4000-8000-000000000003','c6422000-0000-4000-8000-000000000004','Synthetic upgrade suspension');
CREATE VIEW upgrade_fixture.suspension_admission_current_rows AS
SELECT 'organizations'::text table_name,id::text row_id,to_jsonb(r) - 'training_readiness_goal_percent' - 'disabled_features' - 'strength_floor_percent' row_data
  FROM public.organizations r WHERE id::text LIKE 'c6422000-%'
UNION ALL SELECT 'memberships',id::text,to_jsonb(r) FROM public.organization_memberships r WHERE id::text LIKE 'c6422000-%'
UNION ALL SELECT 'personnel',id::text,to_jsonb(r) FROM public.personnel r WHERE id::text LIKE 'c6422000-%'
UNION ALL SELECT 'suspensions',user_id::text,to_jsonb(r) FROM public.user_suspensions r WHERE user_id::text LIKE 'c6422000-%';
CREATE TABLE upgrade_fixture.suspension_admission_before_rows AS
  SELECT * FROM upgrade_fixture.suspension_admission_current_rows;
SELECT set_config('request.jwt.claim.sub','c6422000-0000-4000-8000-000000000001',false);
CREATE TABLE upgrade_fixture.suspension_admission_baseline AS
SELECT NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012000500') migration_absent,
  public.is_org_owner('c6422000-0000-4000-8000-000000000101') suspended_owner_was_admitted;
SELECT set_config('request.jwt.claim.sub','',false);
