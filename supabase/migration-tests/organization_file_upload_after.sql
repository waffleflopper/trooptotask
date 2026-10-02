BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok((SELECT migration_absent FROM upgrade_fixture.organization_file_upload_baseline),'populated witnesses precede the registration migration');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version='20261002002000'),1,'registration migration is recorded after upgrade');
\ir organization_file_upload_contract.sql
SELECT * FROM finish();
ROLLBACK;
