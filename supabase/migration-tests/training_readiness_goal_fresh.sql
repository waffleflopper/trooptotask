BEGIN;
\ir training_readiness_goal_before.sql
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
\ir training_readiness_goal_contract.sql
SELECT * FROM finish();
ROLLBACK;
