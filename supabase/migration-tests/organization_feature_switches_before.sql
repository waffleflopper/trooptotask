CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES
  ('f1521000-0000-4000-8000-000000000001','switch-owner@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES
  ('f1521000-0000-4000-8000-000000000101','Switch A','f1521000-0000-4000-8000-000000000001');
CREATE TABLE upgrade_fixture.organization_feature_switches_baseline AS
SELECT NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261021000100') migration_absent,
  (SELECT to_jsonb(r) FROM public.organizations r WHERE id='f1521000-0000-4000-8000-000000000101') organization_row;
