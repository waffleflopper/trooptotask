-- Saved suspended and active Organizations before the directory functions and suspension notes exist.
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claim.role', '', false);
SELECT set_config('request.jwt.claims', '{}', false);
INSERT INTO auth.users(id,email)
SELECT ('c6425000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'directory-upgrade-' || n || '@example.test' FROM generate_series(1,3) n;
INSERT INTO public.organizations(id,name,created_by,suspended_at) VALUES
('c6425000-0000-4000-8000-000000000101','Directory Suspended','c6425000-0000-4000-8000-000000000001','2030-01-02T03:04:05Z'),
('c6425000-0000-4000-8000-000000000102','Directory Active','c6425000-0000-4000-8000-000000000002',NULL);
INSERT INTO public.organization_memberships(
  id,organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids,email
) VALUES
('c6425000-0000-4000-8000-000000000301','c6425000-0000-4000-8000-000000000101','c6425000-0000-4000-8000-000000000001','owner','editor','{}','organization',ARRAY[]::uuid[],'directory-upgrade-1@example.test'),
('c6425000-0000-4000-8000-000000000302','c6425000-0000-4000-8000-000000000102','c6425000-0000-4000-8000-000000000002','owner','editor','{}','organization',ARRAY[]::uuid[],'directory-upgrade-2@example.test'),
('c6425000-0000-4000-8000-000000000303','c6425000-0000-4000-8000-000000000102','c6425000-0000-4000-8000-000000000003','member','editor','{}','organization',ARRAY[]::uuid[],'directory-upgrade-3@example.test');
INSERT INTO public.personnel(id,organization_id,rank,last_name,first_name,clinic_role,mos,slug) VALUES
('c6425000-0000-4000-8000-000000000401','c6425000-0000-4000-8000-000000000102','SSG','Active','Ari','Medic','68W','directory-upgrade-ari');
INSERT INTO public.audit_logs(org_id,user_id,action,resource_type,severity,"timestamp") VALUES
('c6425000-0000-4000-8000-000000000102','c6425000-0000-4000-8000-000000000002','personnel.create','personnel','info',now());
CREATE VIEW upgrade_fixture.directory_current_rows AS
SELECT 'organizations'::text table_name,id::text row_id,
    jsonb_build_object('name',name,'created_by',created_by,'suspended_at',suspended_at) row_data
  FROM public.organizations r WHERE id::text LIKE 'c6425000-%'
UNION ALL SELECT 'memberships',id::text,
    jsonb_build_object('organization_id',organization_id,'user_id',user_id,'role',role,'email',email)
  FROM public.organization_memberships r WHERE id::text LIKE 'c6425000-%'
UNION ALL SELECT 'personnel',id::text,
    jsonb_build_object('organization_id',organization_id,'last_name',last_name,'archived_at',archived_at)
  FROM public.personnel r WHERE id::text LIKE 'c6425000-%';
CREATE TABLE upgrade_fixture.directory_before_rows AS SELECT * FROM upgrade_fixture.directory_current_rows;
CREATE TABLE upgrade_fixture.directory_baseline AS
SELECT NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261025080100') migration_absent;
