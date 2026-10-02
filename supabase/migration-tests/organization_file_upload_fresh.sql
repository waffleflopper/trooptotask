BEGIN;
\ir organization_file_upload_before.sql
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
\ir organization_file_upload_contract.sql
SELECT * FROM finish();
ROLLBACK;
