BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(4);

SELECT isnt(
	to_regclass('public.idx_availability_entries_org_end_start'),
	NULL,
	'availability org/end/start index exists'
);
SELECT isnt(
	to_regclass('public.idx_availability_entries_org_start_end'),
	NULL,
	'availability org/start/end index exists'
);
SELECT isnt(
	to_regclass('public.idx_daily_assignments_org_date'),
	NULL,
	'daily assignments org/date index exists'
);
SELECT isnt(
	to_regclass('public.idx_special_days_org_date'),
	NULL,
	'special days org/date index exists'
);

SELECT * FROM finish();

ROLLBACK;
