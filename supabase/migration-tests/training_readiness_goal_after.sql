BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok((SELECT migration_absent FROM upgrade_fixture.training_readiness_goal_baseline),'saved witnesses precede the goal migration');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version='20261004000100'),1,'goal migration is recorded after upgrade');
\ir training_readiness_goal_contract.sql
SELECT * FROM finish();
ROLLBACK;
