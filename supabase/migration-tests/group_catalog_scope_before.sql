-- Saved Groups and scoped memberships before the Group catalog follows scope.
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO auth.users(id,email)
SELECT ('c1383000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'group-catalog-upgrade-' || n || '@example.test' FROM generate_series(1,4) n;
INSERT INTO public.organizations(id,name,created_by) VALUES
('c1383000-0000-4000-8000-000000000101','Group Catalog Upgrade','c1383000-0000-4000-8000-000000000001');
INSERT INTO public.groups(id,organization_id,name,sort_order) VALUES
('c1383000-0000-4000-8000-000000000201','c1383000-0000-4000-8000-000000000101','Upgrade One',1),
('c1383000-0000-4000-8000-000000000202','c1383000-0000-4000-8000-000000000101','Upgrade Two',2);
INSERT INTO public.organization_memberships(
  organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
) VALUES
('c1383000-0000-4000-8000-000000000101','c1383000-0000-4000-8000-000000000001','owner','editor','{}','organization',ARRAY[]::uuid[]),
('c1383000-0000-4000-8000-000000000101','c1383000-0000-4000-8000-000000000002','member','viewer',
  '{"personnel":"configure"}','groups',ARRAY['c1383000-0000-4000-8000-000000000201']::uuid[]),
('c1383000-0000-4000-8000-000000000101','c1383000-0000-4000-8000-000000000003','member','viewer',
  '{"personnel":"configure"}','organization',ARRAY[]::uuid[]),
('c1383000-0000-4000-8000-000000000101','c1383000-0000-4000-8000-000000000004','member','viewer',
  '{}','groups',ARRAY[]::uuid[]);
CREATE VIEW upgrade_fixture.group_catalog_current_rows AS
SELECT 'groups'::text table_name,id::text row_id,to_jsonb(r) row_data
  FROM public.groups r WHERE id::text LIKE 'c1383000-%'
UNION ALL SELECT 'memberships',id::text,to_jsonb(r)
  FROM public.organization_memberships r WHERE organization_id::text LIKE 'c1383000-%';
CREATE TABLE upgrade_fixture.group_catalog_before_rows AS
  SELECT * FROM upgrade_fixture.group_catalog_current_rows;
SELECT set_config('request.jwt.claim.sub','c1383000-0000-4000-8000-000000000002',false);
CREATE TABLE upgrade_fixture.group_catalog_baseline AS
SELECT NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012000700') migration_absent,
  public.can_view_groups('c1383000-0000-4000-8000-000000000101') scoped_member_could_view_every_group,
  public.can_manage_groups('c1383000-0000-4000-8000-000000000101') scoped_configurer_could_manage_groups;
SELECT set_config('request.jwt.claim.sub','',false);
