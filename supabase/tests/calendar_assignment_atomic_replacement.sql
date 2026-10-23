-- Phase 11-02: replacement authorization and rollback are database contracts.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid =
  'public.replace_daily_assignment_slots(uuid,date[],jsonb)'::regprocedure),
  'the mutation RPC runs as the authenticated invoker');
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid =
  'calendar_private.can_replace_daily_assignment_rows(uuid,date[],jsonb)'::regprocedure),
  'the private read-only guard can inspect hidden affected rows');
SELECT ok(has_function_privilege('authenticated',
  'public.replace_daily_assignment_slots(uuid,date[],jsonb)', 'EXECUTE'),
  'authenticated callers can use the RPC');
SELECT ok(NOT has_function_privilege('anon',
  'public.replace_daily_assignment_slots(uuid,date[],jsonb)', 'EXECUTE'),
  'anonymous callers cannot use the RPC');
SELECT ok(NOT has_function_privilege('service_role',
  'public.replace_daily_assignment_slots(uuid,date[],jsonb)', 'EXECUTE'),
  'service role has no extra RPC grant');
SELECT ok(NOT has_schema_privilege('anon', 'calendar_private', 'USAGE'),
  'anonymous callers cannot reach the private helper schema');

INSERT INTO auth.users(id,email) VALUES
  ('b1100000-0000-4000-8000-000000000001','atomic-owner@example.test'),
  ('b1100000-0000-4000-8000-000000000002','atomic-operator@example.test'),
  ('b1100000-0000-4000-8000-000000000003','atomic-viewer@example.test'),
  ('b1100000-0000-4000-8000-000000000004','atomic-foreign@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES
  ('b1100000-0000-4000-8000-000000000101','Atomic A','b1100000-0000-4000-8000-000000000001'),
  ('b1100000-0000-4000-8000-000000000102','Atomic B','b1100000-0000-4000-8000-000000000004');
INSERT INTO public.groups(id,organization_id,name) VALUES
  ('b1100000-0000-4000-8000-000000000201','b1100000-0000-4000-8000-000000000101','Alpha'),
  ('b1100000-0000-4000-8000-000000000202','b1100000-0000-4000-8000-000000000101','Bravo'),
  ('b1100000-0000-4000-8000-000000000203','b1100000-0000-4000-8000-000000000102','Foreign');
INSERT INTO public.organization_memberships(
  organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
) VALUES
  ('b1100000-0000-4000-8000-000000000101','b1100000-0000-4000-8000-000000000001','owner','editor','{}','organization',ARRAY[]::uuid[]),
  ('b1100000-0000-4000-8000-000000000101','b1100000-0000-4000-8000-000000000002','member','operator','{"calendar":"operate"}','groups',ARRAY['b1100000-0000-4000-8000-000000000201']::uuid[]),
  ('b1100000-0000-4000-8000-000000000101','b1100000-0000-4000-8000-000000000003','member','viewer','{"calendar":"view"}','organization',ARRAY[]::uuid[]),
  ('b1100000-0000-4000-8000-000000000102','b1100000-0000-4000-8000-000000000004','owner','editor','{}','organization',ARRAY[]::uuid[]);
INSERT INTO public.personnel(id,organization_id,group_id,rank,first_name,last_name,mos,slug) VALUES
  ('b1100000-0000-4000-8000-000000000301','b1100000-0000-4000-8000-000000000101','b1100000-0000-4000-8000-000000000201','SGT','Able','Person','68W','atomic-able'),
  ('b1100000-0000-4000-8000-000000000302','b1100000-0000-4000-8000-000000000101','b1100000-0000-4000-8000-000000000202','SGT','Baker','Person','68W','atomic-baker'),
  ('b1100000-0000-4000-8000-000000000303','b1100000-0000-4000-8000-000000000102','b1100000-0000-4000-8000-000000000203','SGT','Foreign','Person','68W','atomic-foreign');
INSERT INTO public.assignment_types(id,organization_id,name,short_name,assign_to) VALUES
  ('b1100000-0000-4000-8000-000000000401','b1100000-0000-4000-8000-000000000101','Staff','STF','personnel'),
  ('b1100000-0000-4000-8000-000000000402','b1100000-0000-4000-8000-000000000101','Group','GRP','group'),
  ('b1100000-0000-4000-8000-000000000403','b1100000-0000-4000-8000-000000000102','Foreign','FOR','personnel');
INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id) VALUES
  ('b1100000-0000-4000-8000-000000000501','b1100000-0000-4000-8000-000000000101','b1100000-0000-4000-8000-000000000401','2030-03-01','b1100000-0000-4000-8000-000000000301'),
  ('b1100000-0000-4000-8000-000000000502','b1100000-0000-4000-8000-000000000101','b1100000-0000-4000-8000-000000000402','2030-03-01','b1100000-0000-4000-8000-000000000202'),
  ('b1100000-0000-4000-8000-000000000503','b1100000-0000-4000-8000-000000000101','b1100000-0000-4000-8000-000000000401','2030-03-02','b1100000-0000-4000-8000-000000000301'),
  ('b1100000-0000-4000-8000-000000000504','b1100000-0000-4000-8000-000000000102','b1100000-0000-4000-8000-000000000403','2030-03-01','b1100000-0000-4000-8000-000000000303');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$ SELECT * FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000102','{}'::date[],
  '[{"date":"2030-03-01","assignment_type_id":"b1100000-0000-4000-8000-000000000403","assignee_id":"b1100000-0000-4000-8000-000000000303"}]'::jsonb
) $$, '42501', 'Calendar assignment operation is not allowed', 'foreign Organization is denied');
SELECT throws_ok($$ SELECT * FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-03","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":"b1100000-0000-4000-8000-000000000302"}]'::jsonb
) $$, '42501', 'Calendar assignment operation is not allowed', 'out-of-scope proposed Person is denied');
SELECT throws_ok($$ SELECT * FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-01","assignment_type_id":"b1100000-0000-4000-8000-000000000402","assignee_id":""}]'::jsonb
) $$, 'P0001', 'Assignment slot unavailable', 'hidden occupied Group slot cannot be cleared');
SELECT throws_ok($$ SELECT * FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-01","assignment_type_id":"b1100000-0000-4000-8000-000000000402","assignee_id":"b1100000-0000-4000-8000-000000000201"}]'::jsonb
) $$, 'P0001', 'Assignment slot unavailable', 'hidden occupied Group slot cannot be reassigned');
SELECT throws_ok($$ SELECT * FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101',ARRAY['2030-03-01']::date[],'[]'::jsonb
) $$, 'P0001', 'Assignment slot unavailable', 'whole-day clear cannot partially remove visible rows');
SELECT is((SELECT count(*)::integer FROM public.daily_assignments WHERE organization_id=
  'b1100000-0000-4000-8000-000000000101' AND date='2030-03-01'),1,
  'Group-scoped caller still sees the one visible row after denied operations');
RESET ROLE;
SELECT results_eq($$ SELECT id,assignee_id FROM public.daily_assignments WHERE organization_id=
  'b1100000-0000-4000-8000-000000000101' AND date='2030-03-01' ORDER BY id $$,
  $$ VALUES
    ('b1100000-0000-4000-8000-000000000501'::uuid,'b1100000-0000-4000-8000-000000000301'::text),
    ('b1100000-0000-4000-8000-000000000502'::uuid,'b1100000-0000-4000-8000-000000000202'::text) $$,
  'hidden-slot denial preserves both exact row IDs and assignees');

-- The save reads only the days it touches. A hidden row on a touched day blocks
-- it only when that row is replaced; one on another slot's day still blocks it.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000002',true);
SELECT is((SELECT count(*)::integer FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-01","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":"b1100000-0000-4000-8000-000000000301"}]'::jsonb
)),1,'Group operator replaces its own slot beside a hidden slot on the same day');
SELECT throws_ok($$ SELECT * FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-02","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":"b1100000-0000-4000-8000-000000000301"},
    {"date":"2030-03-01","assignment_type_id":"b1100000-0000-4000-8000-000000000402","assignee_id":""}]'::jsonb
) $$, 'P0001', 'Assignment slot unavailable', 'a hidden row on a later slot''s day blocks the whole save');
RESET ROLE;
SELECT results_eq($$ SELECT id,date,assignment_type_id FROM public.daily_assignments WHERE organization_id=
  'b1100000-0000-4000-8000-000000000101' AND id <> (SELECT id FROM public.daily_assignments WHERE organization_id=
  'b1100000-0000-4000-8000-000000000101' AND date='2030-03-01' AND assignment_type_id='b1100000-0000-4000-8000-000000000401')
  ORDER BY date, assignment_type_id $$,
  $$ VALUES
    ('b1100000-0000-4000-8000-000000000502'::uuid,'2030-03-01'::date,'b1100000-0000-4000-8000-000000000402'::uuid),
    ('b1100000-0000-4000-8000-000000000503'::uuid,'2030-03-02'::date,'b1100000-0000-4000-8000-000000000401'::uuid) $$,
  'the hidden slot and the blocked save''s first day keep their exact rows');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000003',true);
SELECT throws_ok($$ SELECT * FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-04","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":""}]'::jsonb
) $$, '42501', 'Calendar assignment operation is not allowed', 'Calendar viewer cannot clear an empty slot');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$ SELECT * FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101',ARRAY['2030-03-01','2030-03-01']::date[],'[]'::jsonb
) $$, '22023', 'Invalid Calendar assignment replacement', 'duplicate replacement days are rejected');
SELECT throws_ok($$ SELECT * FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-01","assignment_type_id":"b1100000-0000-4000-8000-000000000401"}]'::jsonb
) $$, '22023', 'Invalid Calendar assignment slot', 'missing assignee field is rejected');
SELECT throws_ok($$ SELECT * FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-02-30","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":""}]'::jsonb
) $$, '22023', 'Invalid Calendar assignment slot', 'malformed calendar date returns generic input error');
SELECT throws_ok($$ SELECT * FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-01","assignment_type_id":"not-a-uuid","assignee_id":""}]'::jsonb
) $$, '22023', 'Invalid Calendar assignment slot', 'malformed type ID returns generic input error');
SELECT is((SELECT count(*)::integer FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-01","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":"b1100000-0000-4000-8000-000000000302"}]'::jsonb
)),1,'owner can replace one occupied slot');
RESET ROLE;
SELECT is((SELECT assignee_id FROM public.daily_assignments WHERE organization_id=
  'b1100000-0000-4000-8000-000000000101' AND date='2030-03-01'
  AND assignment_type_id='b1100000-0000-4000-8000-000000000401'),
  'b1100000-0000-4000-8000-000000000302','replacement persists');
SELECT is((SELECT id FROM public.daily_assignments WHERE organization_id=
  'b1100000-0000-4000-8000-000000000101' AND date='2030-03-01'
  AND assignment_type_id='b1100000-0000-4000-8000-000000000402'),
  'b1100000-0000-4000-8000-000000000502'::uuid,'unaffected Group row keeps its ID');

CREATE FUNCTION pg_temp.fail_atomic_assignment_insert() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.date='2030-03-01' AND NEW.assignment_type_id='b1100000-0000-4000-8000-000000000401' THEN
    RAISE EXCEPTION 'synthetic insert failure' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fail_atomic_assignment_insert BEFORE INSERT ON public.daily_assignments
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_atomic_assignment_insert();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$ SELECT * FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-01","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":"b1100000-0000-4000-8000-000000000301"},
    {"date":"2030-03-01","assignment_type_id":"b1100000-0000-4000-8000-000000000402","assignee_id":""}]'::jsonb
) $$, '23514', 'synthetic insert failure', 'insert failure rolls back the companion slot clear');
RESET ROLE;
SELECT is((SELECT assignee_id FROM public.daily_assignments WHERE organization_id=
  'b1100000-0000-4000-8000-000000000101' AND date='2030-03-01'
  AND assignment_type_id='b1100000-0000-4000-8000-000000000401'),
  'b1100000-0000-4000-8000-000000000302','the successful replacement survives a later failed replacement');
SELECT is((SELECT id FROM public.daily_assignments WHERE organization_id=
  'b1100000-0000-4000-8000-000000000101' AND date='2030-03-01'
  AND assignment_type_id='b1100000-0000-4000-8000-000000000402'),
  'b1100000-0000-4000-8000-000000000502'::uuid,'failed upsert restores the companion cleared Group row');
DROP TRIGGER fail_atomic_assignment_insert ON public.daily_assignments;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$ SELECT * FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-01","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":""},
    {"date":"2030-03-01","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":""}]'::jsonb
) $$, '22023', 'Duplicate Calendar assignment slot', 'duplicate slots are rejected');
SELECT is((SELECT count(*)::integer FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101',ARRAY['2030-03-01']::date[],
  '[{"date":"2030-03-01","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":"b1100000-0000-4000-8000-000000000301"}]'::jsonb
)),1,'day replacement saves the requested Person row');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.daily_assignments WHERE organization_id=
  'b1100000-0000-4000-8000-000000000101' AND date='2030-03-01'),1,
  'day replacement removes the other slot without affecting other days');
SELECT is((SELECT id FROM public.daily_assignments WHERE organization_id=
  'b1100000-0000-4000-8000-000000000101' AND date='2030-03-02'),
  'b1100000-0000-4000-8000-000000000503'::uuid,'unaffected day keeps exact ID');
SELECT is((SELECT id FROM public.daily_assignments WHERE organization_id=
  'b1100000-0000-4000-8000-000000000102' AND date='2030-03-01'),
  'b1100000-0000-4000-8000-000000000504'::uuid,'foreign Organization row keeps exact ID');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000001',true);
SELECT is((SELECT count(*)::integer FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101',ARRAY['2030-03-02']::date[],
  '[{"date":"2030-03-01","assignment_type_id":"b1100000-0000-4000-8000-000000000402","assignee_id":"b1100000-0000-4000-8000-000000000201"}]'::jsonb
)),1,'one save clears one day and fills a slot on another');
RESET ROLE;
SELECT results_eq($$ SELECT date,assignment_type_id,assignee_id FROM public.daily_assignments WHERE organization_id=
  'b1100000-0000-4000-8000-000000000101' ORDER BY date, assignment_type_id $$,
  $$ VALUES
    ('2030-03-01'::date,'b1100000-0000-4000-8000-000000000401'::uuid,'b1100000-0000-4000-8000-000000000301'::text),
    ('2030-03-01'::date,'b1100000-0000-4000-8000-000000000402'::uuid,'b1100000-0000-4000-8000-000000000201'::text) $$,
  'the cleared day is empty and the other slot on the filled day is untouched');

UPDATE public.organization_memberships SET access_scope_group_ids = ARRAY['b1100000-0000-4000-8000-000000000201','b1100000-0000-4000-8000-000000000202']::uuid[]
WHERE organization_id = 'b1100000-0000-4000-8000-000000000101' AND user_id = 'b1100000-0000-4000-8000-000000000002';
SELECT set_config('calendar.roster_write','on',true);
INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id,created_at,source) VALUES
  ('b1100000-0000-4000-8000-000000000510','b1100000-0000-4000-8000-000000000101','b1100000-0000-4000-8000-000000000401','2030-03-10','b1100000-0000-4000-8000-000000000301','2029-01-02 03:04:05+00','roster'),
  ('b1100000-0000-4000-8000-000000000511','b1100000-0000-4000-8000-000000000101','b1100000-0000-4000-8000-000000000402','2030-03-10','b1100000-0000-4000-8000-000000000201','2029-01-02 03:04:05+00','manual');
SELECT set_config('calendar.roster_write','',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000002',true);
SELECT results_eq($$ SELECT id,created_at,assignee_id,source FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-10","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":"b1100000-0000-4000-8000-000000000301"}]'::jsonb
) $$,
  $$ VALUES ('b1100000-0000-4000-8000-000000000510'::uuid,'2029-01-02 03:04:05+00'::timestamptz,'b1100000-0000-4000-8000-000000000301'::text,'roster'::text) $$,
  'Person unchanged returns the saved row with its original identity and source');
SELECT results_eq($$ SELECT id,created_at,assignee_id,source FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-10","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":"b1100000-0000-4000-8000-000000000302"}]'::jsonb
) $$,
  $$ VALUES ('b1100000-0000-4000-8000-000000000510'::uuid,'2029-01-02 03:04:05+00'::timestamptz,'b1100000-0000-4000-8000-000000000302'::text,'manual'::text) $$,
  'Person Alpha to Bravo returns the saved row with its original identity and source');
SELECT results_eq($$ SELECT id,created_at,assignee_id,source FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-10","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":"b1100000-0000-4000-8000-000000000301"}]'::jsonb
) $$,
  $$ VALUES ('b1100000-0000-4000-8000-000000000510'::uuid,'2029-01-02 03:04:05+00'::timestamptz,'b1100000-0000-4000-8000-000000000301'::text,'manual'::text) $$,
  'Person Bravo to Alpha returns the saved row with its original identity and source');
SELECT results_eq($$ SELECT id,created_at,assignee_id,source FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-10","assignment_type_id":"b1100000-0000-4000-8000-000000000402","assignee_id":"b1100000-0000-4000-8000-000000000201"}]'::jsonb
) $$,
  $$ VALUES ('b1100000-0000-4000-8000-000000000511'::uuid,'2029-01-02 03:04:05+00'::timestamptz,'b1100000-0000-4000-8000-000000000201'::text,'manual'::text) $$,
  'Group unchanged returns the saved row with its original identity and source');
SELECT results_eq($$ SELECT id,created_at,assignee_id,source FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-10","assignment_type_id":"b1100000-0000-4000-8000-000000000402","assignee_id":"b1100000-0000-4000-8000-000000000202"}]'::jsonb
) $$,
  $$ VALUES ('b1100000-0000-4000-8000-000000000511'::uuid,'2029-01-02 03:04:05+00'::timestamptz,'b1100000-0000-4000-8000-000000000202'::text,'manual'::text) $$,
  'Group Alpha to Bravo returns the saved row with its original identity and source');
SELECT results_eq($$ SELECT id,created_at,assignee_id,source FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-10","assignment_type_id":"b1100000-0000-4000-8000-000000000402","assignee_id":"b1100000-0000-4000-8000-000000000201"}]'::jsonb
) $$,
  $$ VALUES ('b1100000-0000-4000-8000-000000000511'::uuid,'2029-01-02 03:04:05+00'::timestamptz,'b1100000-0000-4000-8000-000000000201'::text,'manual'::text) $$,
  'Group Bravo to Alpha returns the saved row with its original identity and source');
SELECT results_eq($$ SELECT id,created_at,assignee_id FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101',ARRAY['2030-03-10']::date[],
  '[{"date":"2030-03-10","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":"b1100000-0000-4000-8000-000000000302"}]'::jsonb
) $$,
  $$ VALUES ('b1100000-0000-4000-8000-000000000510'::uuid,'2029-01-02 03:04:05+00'::timestamptz,'b1100000-0000-4000-8000-000000000302'::text) $$,
  'day replacement preserves the surviving slot identity');
SELECT is((SELECT count(*)::integer FROM public.daily_assignments WHERE organization_id='b1100000-0000-4000-8000-000000000101'
  AND date='2030-03-10'),1,'day replacement removes the omitted Group slot');
SELECT is((SELECT count(*)::integer FROM public.replace_daily_assignment_slots(
  'b1100000-0000-4000-8000-000000000101','{}'::date[],
  '[{"date":"2030-03-10","assignment_type_id":"b1100000-0000-4000-8000-000000000401","assignee_id":""}]'::jsonb
)),0,'explicit clear returns no saved row');
SELECT is((SELECT count(*)::integer FROM public.daily_assignments WHERE organization_id='b1100000-0000-4000-8000-000000000101'
  AND date='2030-03-10'),0,'explicit clear deletes the surviving slot');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
