-- Populated predecessor upgrade: prove both the denied baseline and unchanged
-- saved values before exercising the same fresh SQL/RLS contract.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok((SELECT migration_absent FROM upgrade_fixture.organization_storage_cleanup_baseline),
  'saved fixture and denied baseline precede the new migration');
SELECT is((SELECT visible_orphans FROM upgrade_fixture.organization_storage_cleanup_baseline),
  0, 'ordinary current owner could not read these five orphans before migration');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20261002001000'),
  1, 'new migration is recorded after populated upgrade');
\ir organization_storage_cleanup_contract.sql
SELECT * FROM finish();
ROLLBACK;
