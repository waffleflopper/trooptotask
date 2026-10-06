CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claim.role', '', false);
SELECT set_config('request.jwt.claims', '{}', false);
SELECT set_config('request.jwt', '', false);
INSERT INTO auth.users(id,email) VALUES
  ('f1501000-0000-4000-8000-000000000001','goal-owner@example.test'),
  ('f1501000-0000-4000-8000-000000000002','goal-admin@example.test'),
  ('f1501000-0000-4000-8000-000000000003','goal-member@example.test'),
  ('f1501000-0000-4000-8000-000000000004','goal-foreign-owner@example.test');
INSERT INTO public.organizations(id,name,created_by,archive_retention_months,loss_warning_window_days) VALUES
  ('f1501000-0000-4000-8000-000000000101','Goal A','f1501000-0000-4000-8000-000000000001',48,30),
  ('f1501000-0000-4000-8000-000000000102','Goal B','f1501000-0000-4000-8000-000000000004',12,365);
INSERT INTO public.organization_memberships(organization_id,user_id,role,member_preset,access_scope_kind) VALUES
  ('f1501000-0000-4000-8000-000000000101','f1501000-0000-4000-8000-000000000001','owner','viewer','organization'),
  ('f1501000-0000-4000-8000-000000000101','f1501000-0000-4000-8000-000000000002','admin','viewer','organization'),
  ('f1501000-0000-4000-8000-000000000101','f1501000-0000-4000-8000-000000000003','member','viewer','organization'),
  ('f1501000-0000-4000-8000-000000000102','f1501000-0000-4000-8000-000000000004','owner','viewer','organization');
CREATE VIEW upgrade_fixture.training_readiness_goal_current_rows AS
SELECT 'auth.users'::text table_name,id::text row_id,to_jsonb(r) row_data FROM auth.users r WHERE id::text LIKE 'f1501000-%'
UNION ALL SELECT 'organizations',id::text,to_jsonb(r) - 'training_readiness_goal_percent' FROM public.organizations r WHERE id::text LIKE 'f1501000-%'
UNION ALL SELECT 'memberships',id::text,to_jsonb(r) FROM public.organization_memberships r WHERE organization_id::text LIKE 'f1501000-%';
CREATE TABLE upgrade_fixture.training_readiness_goal_before_rows AS SELECT * FROM upgrade_fixture.training_readiness_goal_current_rows;
CREATE TABLE upgrade_fixture.training_readiness_goal_baseline AS
SELECT NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261004100618') migration_absent;
