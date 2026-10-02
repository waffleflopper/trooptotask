-- Full-replay SQL authority; fixtures contain metadata, not Storage file bytes.
BEGIN;
\ir organization_storage_cleanup_before.sql
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
\ir organization_storage_cleanup_contract.sql
SELECT * FROM finish();
ROLLBACK;
