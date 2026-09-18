-- Regression: upgrade name-valued assignments without losing slot identity or
-- tenant isolation. Reapply the actual forward migration to legacy fixtures.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email) VALUES ('b1000000-0000-4000-8000-000000000001','group-upgrade@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES
 ('b1000000-0000-4000-8000-000000000101','Group Upgrade A','b1000000-0000-4000-8000-000000000001'),
 ('b1000000-0000-4000-8000-000000000102','Group Upgrade B','b1000000-0000-4000-8000-000000000001');
INSERT INTO public.groups(id,organization_id,name) VALUES
 ('b1000000-0000-4000-8000-000000000201','b1000000-0000-4000-8000-000000000101','Alpha'),
 ('b1000000-0000-4000-8000-000000000202','b1000000-0000-4000-8000-000000000102','Alpha');
INSERT INTO public.assignment_types(id,organization_id,name,short_name,assign_to) VALUES
 ('b1000000-0000-4000-8000-000000000301','b1000000-0000-4000-8000-000000000101','Group Duty','GD','group'),
 ('b1000000-0000-4000-8000-000000000302','b1000000-0000-4000-8000-000000000102','Group Duty','GD','group'),
 ('b1000000-0000-4000-8000-000000000303','b1000000-0000-4000-8000-000000000101','Person Duty','PD','personnel');
INSERT INTO public.daily_assignments(id,organization_id,date,assignment_type_id,assignee_id) VALUES
 ('b1000000-0000-4000-8000-000000000401','b1000000-0000-4000-8000-000000000101','2026-09-18','b1000000-0000-4000-8000-000000000301','Alpha'),
 ('b1000000-0000-4000-8000-000000000402','b1000000-0000-4000-8000-000000000102','2026-09-18','b1000000-0000-4000-8000-000000000302','Alpha'),
 ('b1000000-0000-4000-8000-000000000403','b1000000-0000-4000-8000-000000000101','2026-09-19','b1000000-0000-4000-8000-000000000301','b1000000-0000-4000-8000-000000000201'),
 ('b1000000-0000-4000-8000-000000000404','b1000000-0000-4000-8000-000000000101','2026-09-18','b1000000-0000-4000-8000-000000000303','Alpha');
CREATE TEMP TABLE before_conversion AS SELECT id, to_jsonb(assignment) - 'assignee_id' AS retained FROM public.daily_assignments AS assignment;
\ir ../migrations/20260918000300_canonicalize_calendar_group_assignees.sql
SELECT results_eq($$ SELECT assignee_id FROM public.daily_assignments ORDER BY id $$,$$ VALUES
 ('b1000000-0000-4000-8000-000000000201'::text),
 ('b1000000-0000-4000-8000-000000000202'::text),
 ('b1000000-0000-4000-8000-000000000201'::text),
 ('Alpha'::text) $$,'legacy names resolve in their own tenant; IDs and person assignments are unchanged');
SELECT results_eq($$ SELECT id,to_jsonb(assignment)-'assignee_id' FROM public.daily_assignments AS assignment ORDER BY id $$,$$ SELECT * FROM before_conversion ORDER BY id $$,'all slot IDs, dates, types, lineage, timestamps and other fields survive');
\ir ../migrations/20260918000300_canonicalize_calendar_group_assignees.sql
SELECT results_eq($$ SELECT id,to_jsonb(assignment)-'assignee_id' FROM public.daily_assignments AS assignment ORDER BY id $$,$$ SELECT * FROM before_conversion ORDER BY id $$,'reapplying is idempotent');
-- Expected migration failures are enclosed in savepoints; assert both the
-- SQLSTATE and unchanged rows. These are not ignored migration errors.
UPDATE public.daily_assignments SET assignee_id='Alpha' WHERE id='b1000000-0000-4000-8000-000000000401';
UPDATE public.daily_assignments SET assignee_id='Deleted Group' WHERE id='b1000000-0000-4000-8000-000000000402';
CREATE TEMP TABLE before_rejection AS SELECT * FROM public.daily_assignments;
SAVEPOINT conversion;
\set ON_ERROR_STOP off
\ir ../migrations/20260918000300_canonicalize_calendar_group_assignees.sql
\set migration_state :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT conversion;
SELECT is(:'migration_state'::text,'P0001'::text,'missing Group blocks conversion');
SELECT results_eq('SELECT * FROM public.daily_assignments ORDER BY id','SELECT * FROM before_rejection ORDER BY id','missing Group leaves every row unchanged');
DROP TABLE before_rejection;
UPDATE public.daily_assignments SET assignee_id='Alpha' WHERE id='b1000000-0000-4000-8000-000000000402';
UPDATE public.daily_assignments SET assignee_id='b1000000-0000-4000-8000-000000000201' WHERE id='b1000000-0000-4000-8000-000000000402';
CREATE TEMP TABLE before_rejection AS SELECT * FROM public.daily_assignments;
SAVEPOINT conversion;
\set ON_ERROR_STOP off
\ir ../migrations/20260918000300_canonicalize_calendar_group_assignees.sql
\set migration_state :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT conversion;
SELECT is(:'migration_state'::text,'P0001'::text,'foreign Group ID blocks conversion');
SELECT results_eq('SELECT * FROM public.daily_assignments ORDER BY id','SELECT * FROM before_rejection ORDER BY id','foreign Group ID leaves every row unchanged');
DROP TABLE before_rejection;
UPDATE public.daily_assignments SET assignee_id='Alpha' WHERE id='b1000000-0000-4000-8000-000000000402';
INSERT INTO public.groups(id,organization_id,name) VALUES('b1000000-0000-4000-8000-000000000203','b1000000-0000-4000-8000-000000000101','b1000000-0000-4000-8000-000000000201');
CREATE TEMP TABLE before_rejection AS SELECT * FROM public.daily_assignments;
SAVEPOINT conversion;
\set ON_ERROR_STOP off
\ir ../migrations/20260918000300_canonicalize_calendar_group_assignees.sql
\set migration_state :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT conversion;
SELECT is(:'migration_state'::text,'P0001'::text,'UUID/name ambiguity blocks conversion');
SELECT results_eq('SELECT * FROM public.daily_assignments ORDER BY id','SELECT * FROM before_rejection ORDER BY id','UUID/name ambiguity leaves every row unchanged');
DROP TABLE before_rejection;
DELETE FROM public.groups WHERE id='b1000000-0000-4000-8000-000000000203';
SELECT * FROM finish();
ROLLBACK;
