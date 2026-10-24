BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(43);
INSERT INTO auth.users(id,email) VALUES ('b1858000-0000-4000-8000-000000000001','swap-owner@example.test'),('b1858000-0000-4000-8000-000000000002','swap-operator@example.test'),('b1858000-0000-4000-8000-000000000003','swap-group@example.test'),('b1858000-0000-4000-8000-000000000004','swap-viewer@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES ('b1858000-0000-4000-8000-000000000101','Duty swaps','b1858000-0000-4000-8000-000000000001');
INSERT INTO public.groups(id,organization_id,name) VALUES ('b1858000-0000-4000-8000-000000000201','b1858000-0000-4000-8000-000000000101','Alpha');
INSERT INTO public.organization_memberships(organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids) VALUES
('b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000001','owner','editor','{}','organization',ARRAY[]::uuid[]),
('b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000002','member','operator','{"calendar":"operate"}','organization',ARRAY[]::uuid[]),
('b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000003','member','operator','{"calendar":"operate"}','groups',ARRAY['b1858000-0000-4000-8000-000000000201']::uuid[]),
('b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000004','member','viewer','{"calendar":"view"}','organization',ARRAY[]::uuid[]);
INSERT INTO public.personnel(id,organization_id,group_id,rank,first_name,last_name,mos,slug) VALUES
('b1858000-0000-4000-8000-000000000301','b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000201','SPC','','Kim','68W','swap-kim'),('b1858000-0000-4000-8000-000000000302','b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000201','SPC','','Patel','68W','swap-patel');
INSERT INTO public.assignment_types(id,organization_id,name,short_name,assign_to) VALUES
('b1858000-0000-4000-8000-000000000401','b1858000-0000-4000-8000-000000000101','Staff Duty','SD','personnel'),('b1858000-0000-4000-8000-000000000402','b1858000-0000-4000-8000-000000000101','Group Duty','GD','group');
SELECT set_config('calendar.roster_write','on',true);
INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id,source) VALUES
('b1858000-0000-4000-8000-000000000501','b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000401',current_date,'b1858000-0000-4000-8000-000000000301','roster'),
('b1858000-0000-4000-8000-000000000502','b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000401',current_date+7,'b1858000-0000-4000-8000-000000000302','manual'),
('b1858000-0000-4000-8000-000000000503','b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000401',current_date+2,'b1858000-0000-4000-8000-000000000301','roster'),
('b1858000-0000-4000-8000-000000000504','b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000401',current_date+14,'b1858000-0000-4000-8000-000000000302','roster');
SELECT set_config('calendar.roster_write','',true);
CREATE FUNCTION pg_temp.exchange(a date DEFAULT current_date, b date DEFAULT current_date+7, wa text DEFAULT 'b1858000-0000-4000-8000-000000000301', wb text DEFAULT 'b1858000-0000-4000-8000-000000000302', t uuid DEFAULT 'b1858000-0000-4000-8000-000000000401') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.swap_roster_days('b1858000-0000-4000-8000-000000000101',t,a,wa,b,wb,current_date);
$$;
CREATE FUNCTION pg_temp.undo_swap(day date DEFAULT current_date) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.undo_roster_swap('b1858000-0000-4000-8000-000000000101',(SELECT id FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'),day);
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1858000-0000-4000-8000-000000000002',true);
SELECT lives_ok($$SELECT pg_temp.exchange()$$,'an ordinary Organization-wide Calendar operator swaps the days');
SELECT results_eq($$SELECT id,assignee_id,source FROM public.daily_assignments WHERE organization_id='b1858000-0000-4000-8000-000000000101' AND date IN (current_date,current_date+7) ORDER BY date$$,
 $$VALUES ('b1858000-0000-4000-8000-000000000501'::uuid,'b1858000-0000-4000-8000-000000000302'::text,'manual'::text),('b1858000-0000-4000-8000-000000000502'::uuid,'b1858000-0000-4000-8000-000000000301'::text,'manual'::text)$$,'the exchange keeps row identities and stamps both days manual');
SELECT results_eq($$SELECT first_held_by,first_source,second_held_by,second_source,created_by,created_at=now() FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'$$,
 $$VALUES ('b1858000-0000-4000-8000-000000000301'::text,'roster'::text,'b1858000-0000-4000-8000-000000000302'::text,'manual'::text,'b1858000-0000-4000-8000-000000000002'::uuid,true)$$,'the function saves the original holders and sources and attributes the entry to the ordinary operator');
SELECT throws_ok($$INSERT INTO public.roster_swaps(organization_id,assignment_type_id,first_date,first_held_by,second_date,second_held_by,created_by) VALUES ('b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000401',current_date+1,'b1858000-0000-4000-8000-000000000302',current_date+2,'b1858000-0000-4000-8000-000000000301','b1858000-0000-4000-8000-000000000001')$$,'42501',NULL,'clients cannot insert holders or attribution');
SELECT throws_ok($$UPDATE public.roster_swaps SET first_held_by='forged',created_by='b1858000-0000-4000-8000-000000000001' WHERE organization_id='b1858000-0000-4000-8000-000000000101'$$,'42501',NULL,'clients cannot change holders or attribution');
SELECT throws_ok($$DELETE FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'$$,'42501',NULL,'clients cannot delete a swap directly');
SELECT throws_ok($$SELECT pg_temp.exchange(current_date,current_date+7,'b1858000-0000-4000-8000-000000000301','b1858000-0000-4000-8000-000000000302')$$,'RSW01',NULL,'a stale preview is refused');
SELECT throws_ok($$SELECT pg_temp.exchange(current_date,current_date+7,'b1858000-0000-4000-8000-000000000302','b1858000-0000-4000-8000-000000000301')$$,'RSW07',NULL,'an already swapped day is refused');
SELECT throws_ok($$SELECT pg_temp.undo_swap(current_date+1)$$,'RSW02',NULL,'undo after either day has passed is refused');
SELECT lives_ok($$SELECT pg_temp.undo_swap()$$,'undo restores the original days');
SELECT results_eq($$SELECT assignee_id,source FROM public.daily_assignments WHERE organization_id='b1858000-0000-4000-8000-000000000101' AND date IN (current_date,current_date+7) ORDER BY date$$,$$VALUES ('b1858000-0000-4000-8000-000000000301'::text,'roster'::text),('b1858000-0000-4000-8000-000000000302'::text,'manual'::text)$$,'undo restores both holders and their original roster and manual sources');
SELECT is((SELECT count(*)::integer FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'),0,'undo removes the swap');
SELECT throws_ok($$SELECT public.undo_roster_swap('b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000999',current_date)$$,'RSW01',NULL,'undo of a missing swap reports a changed roster');
SELECT throws_ok($$SELECT pg_temp.exchange(current_date-1,current_date+7)$$,'RSW02',NULL,'past days are refused');
SELECT throws_ok($$SELECT pg_temp.exchange(current_date,current_date)$$,'RSW03',NULL,'the same date twice is refused');
SELECT throws_ok($$SELECT pg_temp.exchange(current_date,current_date+1)$$,'RSW04',NULL,'an empty day is refused');
SELECT throws_ok($$SELECT pg_temp.exchange(current_date,current_date+2,'b1858000-0000-4000-8000-000000000301','b1858000-0000-4000-8000-000000000301')$$,'RSW05',NULL,'the same person on both days is refused');
SELECT throws_ok($$SELECT pg_temp.exchange(current_date,current_date+7,'b1858000-0000-4000-8000-000000000301','b1858000-0000-4000-8000-000000000302','b1858000-0000-4000-8000-000000000402')$$,'RSW06',NULL,'a Group-assigned duty is refused');
SELECT throws_ok($$SELECT pg_temp.exchange(current_date,current_date+7,'b1858000-0000-4000-8000-000000000302','b1858000-0000-4000-8000-000000000301')$$,'RSW01',NULL,'a forged previous holder is refused');
SELECT is((SELECT count(*)::integer FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'),0,'refused exchanges write no swap');
SELECT is((SELECT assignee_id FROM public.daily_assignments WHERE id='b1858000-0000-4000-8000-000000000501'),'b1858000-0000-4000-8000-000000000301','refused exchanges leave the calendar unchanged');
SELECT throws_ok($$SELECT public.swap_roster_days('b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000401',current_date,'b1858000-0000-4000-8000-000000000301',current_date+7,'b1858000-0000-4000-8000-000000000302',current_date-3)$$,'RSD01',NULL,'an incorrect device date is refused');
SELECT lives_ok($$SELECT pg_temp.exchange(current_date+7,current_date,'b1858000-0000-4000-8000-000000000302','b1858000-0000-4000-8000-000000000301')$$,'the operator can start a swap from the later manual day');
SELECT lives_ok($$SELECT pg_temp.undo_swap()$$,'the operator can undo a swap started from the later day');
SELECT results_eq($$SELECT assignee_id,source FROM public.daily_assignments WHERE organization_id='b1858000-0000-4000-8000-000000000101' AND date IN (current_date,current_date+7) ORDER BY date$$,$$VALUES ('b1858000-0000-4000-8000-000000000301'::text,'roster'::text),('b1858000-0000-4000-8000-000000000302'::text,'manual'::text)$$,'undo preserves the original holders and sources when swap inputs are reversed');
UPDATE public.daily_assignments SET assignee_id='b1858000-0000-4000-8000-000000000301' WHERE id='b1858000-0000-4000-8000-000000000501';
SELECT lives_ok($$SELECT pg_temp.exchange(current_date,current_date+14)$$,'the operator can swap an earlier manual day with a later roster day');
SELECT lives_ok($$SELECT pg_temp.undo_swap()$$,'the operator can undo a swap with the roster day second');
SELECT results_eq($$SELECT assignee_id,source FROM public.daily_assignments WHERE organization_id='b1858000-0000-4000-8000-000000000101' AND date IN (current_date,current_date+14) ORDER BY date$$,$$VALUES ('b1858000-0000-4000-8000-000000000301'::text,'manual'::text),('b1858000-0000-4000-8000-000000000302'::text,'roster'::text)$$,'undo restores a manual first day and a roster second day');
SELECT pg_temp.exchange();
SELECT set_config('request.jwt.claim.sub','b1858000-0000-4000-8000-000000000003',true);
SELECT is((SELECT count(*)::integer FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'),0,'Group-scoped operators cannot read duty swaps');
SELECT throws_ok($$SELECT pg_temp.exchange()$$,'42501',NULL,'Group-scoped operators cannot swap');
SELECT throws_ok($$SELECT public.undo_roster_swap('b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000999',current_date)$$,'42501',NULL,'Group-scoped operators cannot undo');
SELECT set_config('request.jwt.claim.sub','b1858000-0000-4000-8000-000000000004',true);
SELECT is((SELECT count(*)::integer FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'),1,'an Organization-wide viewer can read swaps');
SELECT throws_ok($$SELECT pg_temp.exchange()$$,'42501',NULL,'viewers cannot swap');
SELECT throws_ok($$SELECT pg_temp.undo_swap()$$,'42501',NULL,'viewers cannot undo');
SELECT set_config('request.jwt.claim.sub','b1858000-0000-4000-8000-000000000002',true);
SELECT lives_ok($$SELECT * FROM public.replace_daily_assignment_slots('b1858000-0000-4000-8000-000000000101','{}'::date[],jsonb_build_array(jsonb_build_object('date',current_date,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','b1858000-0000-4000-8000-000000000302')))$$,'re-saving the same assignee succeeds');
SELECT is((SELECT count(*)::integer FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'),1,'same-assignee save keeps the swap');
SELECT * FROM public.replace_daily_assignment_slots('b1858000-0000-4000-8000-000000000101','{}'::date[],jsonb_build_array(jsonb_build_object('date',current_date,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','b1858000-0000-4000-8000-000000000301')));
SELECT is((SELECT count(*)::integer FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'),0,'reassignment through the batch ends the swap');

SELECT * FROM public.replace_daily_assignment_slots('b1858000-0000-4000-8000-000000000101','{}'::date[],jsonb_build_array(jsonb_build_object('date',current_date,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','b1858000-0000-4000-8000-000000000301'),jsonb_build_object('date',current_date+7,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','b1858000-0000-4000-8000-000000000302')));
SELECT pg_temp.exchange();
SELECT * FROM public.replace_daily_assignment_slots('b1858000-0000-4000-8000-000000000101','{}'::date[],jsonb_build_array(jsonb_build_object('date',current_date,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','')));
SELECT is((SELECT count(*)::integer FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'),0,'empty-assignee clear ends the swap in the transaction');
DELETE FROM public.daily_assignments WHERE organization_id='b1858000-0000-4000-8000-000000000101' AND date IN (current_date,current_date+1);
INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id) VALUES ('b1858000-0000-4000-8000-000000000501','b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000401',current_date,'b1858000-0000-4000-8000-000000000301');

SELECT * FROM public.replace_daily_assignment_slots('b1858000-0000-4000-8000-000000000101','{}'::date[],jsonb_build_array(jsonb_build_object('date',current_date,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','b1858000-0000-4000-8000-000000000301'),jsonb_build_object('date',current_date+7,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','b1858000-0000-4000-8000-000000000302')));
SELECT pg_temp.exchange();
SELECT * FROM public.replace_daily_assignment_slots('b1858000-0000-4000-8000-000000000101',ARRAY[current_date],'[]'::jsonb);
SELECT is((SELECT count(*)::integer FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'),0,'replace-days clear ends the swap in the transaction');
DELETE FROM public.daily_assignments WHERE organization_id='b1858000-0000-4000-8000-000000000101' AND date IN (current_date,current_date+1);
INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id) VALUES ('b1858000-0000-4000-8000-000000000501','b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000401',current_date,'b1858000-0000-4000-8000-000000000301');

SELECT * FROM public.replace_daily_assignment_slots('b1858000-0000-4000-8000-000000000101','{}'::date[],jsonb_build_array(jsonb_build_object('date',current_date,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','b1858000-0000-4000-8000-000000000301'),jsonb_build_object('date',current_date+7,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','b1858000-0000-4000-8000-000000000302')));
SELECT pg_temp.exchange();
DELETE FROM public.daily_assignments WHERE id='b1858000-0000-4000-8000-000000000501';
SELECT is((SELECT count(*)::integer FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'),0,'plain DELETE ends the swap in the transaction');
DELETE FROM public.daily_assignments WHERE organization_id='b1858000-0000-4000-8000-000000000101' AND date IN (current_date,current_date+1);
INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id) VALUES ('b1858000-0000-4000-8000-000000000501','b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000401',current_date,'b1858000-0000-4000-8000-000000000301');

SELECT * FROM public.replace_daily_assignment_slots('b1858000-0000-4000-8000-000000000101','{}'::date[],jsonb_build_array(jsonb_build_object('date',current_date,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','b1858000-0000-4000-8000-000000000301'),jsonb_build_object('date',current_date+7,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','b1858000-0000-4000-8000-000000000302')));
SELECT pg_temp.exchange();
UPDATE public.daily_assignments SET date=current_date+1 WHERE id='b1858000-0000-4000-8000-000000000501';
SELECT is((SELECT count(*)::integer FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'),0,'moving the day ends the swap in the transaction');
DELETE FROM public.daily_assignments WHERE organization_id='b1858000-0000-4000-8000-000000000101' AND date IN (current_date,current_date+1);
INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id) VALUES ('b1858000-0000-4000-8000-000000000501','b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000401',current_date,'b1858000-0000-4000-8000-000000000301');

SELECT * FROM public.replace_daily_assignment_slots('b1858000-0000-4000-8000-000000000101','{}'::date[],jsonb_build_array(jsonb_build_object('date',current_date,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','b1858000-0000-4000-8000-000000000301'),jsonb_build_object('date',current_date+7,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','b1858000-0000-4000-8000-000000000302')));
SELECT pg_temp.exchange();
UPDATE public.daily_assignments SET assignment_type_id='b1858000-0000-4000-8000-000000000402',assignee_id='b1858000-0000-4000-8000-000000000201' WHERE id='b1858000-0000-4000-8000-000000000501';
SELECT is((SELECT count(*)::integer FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'),0,'changing the duty type ends the swap in the transaction');
DELETE FROM public.daily_assignments WHERE organization_id='b1858000-0000-4000-8000-000000000101' AND date IN (current_date,current_date+1);
INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id) VALUES ('b1858000-0000-4000-8000-000000000501','b1858000-0000-4000-8000-000000000101','b1858000-0000-4000-8000-000000000401',current_date,'b1858000-0000-4000-8000-000000000301');

UPDATE public.daily_assignments SET assignee_id='b1858000-0000-4000-8000-000000000302' WHERE id='b1858000-0000-4000-8000-000000000502';
SELECT pg_temp.exchange();
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT * FROM public.write_roster_assignment_slots('b1858000-0000-4000-8000-000000000002','b1858000-0000-4000-8000-000000000101',jsonb_build_array(jsonb_build_object('date',current_date,'assignment_type_id','b1858000-0000-4000-8000-000000000401','assignee_id','b1858000-0000-4000-8000-000000000301','was','b1858000-0000-4000-8000-000000000302','source','roster')));
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.roster_swaps WHERE organization_id='b1858000-0000-4000-8000-000000000101'),0,'a server roster write ends the swap in the transaction');
SELECT * FROM finish();
ROLLBACK;
