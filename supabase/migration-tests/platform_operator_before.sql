CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
CREATE TABLE upgrade_fixture.platform_operator_before AS SELECT user_id,created_at FROM public.platform_admins;
CREATE TABLE upgrade_fixture.platform_operator_baseline AS SELECT
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261025000100') migration_absent;
