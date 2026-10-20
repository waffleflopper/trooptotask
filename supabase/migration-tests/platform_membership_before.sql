-- Only populated synthetic fixtures in the CI runner's disposable project.
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users(id,email) SELECT ('d2120000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'d21-upgrade-' || n || '@example.test' FROM generate_series(1,4) n;
INSERT INTO public.platform_admins(user_id,role) VALUES('d2120000-0000-4000-8000-000000000001','super_admin');
INSERT INTO public.organizations(id,name,created_by) VALUES
('d2120000-0000-4000-8000-000000000101','D21 saved A','d2120000-0000-4000-8000-000000000002'),
('d2120000-0000-4000-8000-000000000102','D21 saved B','d2120000-0000-4000-8000-000000000002');
INSERT INTO public.organization_memberships(id,organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids) VALUES
('d2120000-0000-4000-8000-000000000201','d2120000-0000-4000-8000-000000000101','d2120000-0000-4000-8000-000000000002','owner','editor','{}','organization','{}'),
('d2120000-0000-4000-8000-000000000202','d2120000-0000-4000-8000-000000000101','d2120000-0000-4000-8000-000000000003','member','operator','{"calendar":"view","criticalTasks":"none"}','groups','{d2120000-0000-4000-8000-000000000501}'),
('d2120000-0000-4000-8000-000000000203','d2120000-0000-4000-8000-000000000101','d2120000-0000-4000-8000-000000000004','admin','editor','{}','organization','{}'),
('d2120000-0000-4000-8000-000000000204','d2120000-0000-4000-8000-000000000102','d2120000-0000-4000-8000-000000000002','owner','editor','{}','organization','{}'),
('d2120000-0000-4000-8000-000000000205','d2120000-0000-4000-8000-000000000102','d2120000-0000-4000-8000-000000000003','member','viewer','{"training":"none"}','groups','{d2120000-0000-4000-8000-000000000502}');
CREATE VIEW upgrade_fixture.platform_membership_current_rows AS
SELECT 'auth.users'::text table_name,id::text row_id,to_jsonb(r) row_data FROM auth.users r WHERE id::text LIKE 'd2120000-%'
UNION ALL SELECT 'organizations',id::text,to_jsonb(r) - 'training_readiness_goal_percent' - 'disabled_features' - 'strength_floor_percent' FROM public.organizations r WHERE id::text LIKE 'd2120000-%'
UNION ALL SELECT 'memberships',id::text,to_jsonb(r) FROM public.organization_memberships r WHERE id::text LIKE 'd2120000-%'
UNION ALL SELECT 'platform_admins',user_id::text,to_jsonb(r) FROM public.platform_admins r WHERE user_id::text LIKE 'd2120000-%';
CREATE TABLE upgrade_fixture.platform_membership_before_rows AS SELECT * FROM upgrade_fixture.platform_membership_current_rows;
CREATE TABLE upgrade_fixture.platform_membership_baseline AS SELECT
  NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261003000200') migration_absent,
  to_regprocedure('public.platform_transfer_org_ownership(uuid,uuid,uuid,text)') IS NULL transfer_absent,
  to_regprocedure('public.platform_promote_org_member(uuid,uuid,uuid)') IS NULL promotion_absent,
  (SELECT proacl FROM pg_proc WHERE oid='public.transfer_org_ownership(uuid,uuid)'::regprocedure) ordinary_acl;
