BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(1);

SELECT isnt(
	to_regclass('public.idx_audit_logs_timestamp_desc'),
	NULL,
	'platform audit timestamp index exists'
);

SELECT * FROM finish();

ROLLBACK;
