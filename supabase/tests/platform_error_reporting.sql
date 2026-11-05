BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid,id::uuid,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now()
FROM (VALUES
 ('10000000-0000-4000-8000-000000190001','errors-reporter@example.test'),
 ('10000000-0000-4000-8000-000000190002','errors-peer@example.test'),
 ('10000000-0000-4000-8000-000000190003','errors-operator@example.test')) AS fixture(id,email);

SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.record_platform_error(
 'a0000000-0000-4000-8000-000000190001','fp-save','server','server_response','HttpError',NULL,'Internal server error',
 '/org/[orgId]/api/availability','POST',500::smallint,'10000000-0000-4000-8000-000000190001',NULL)$$,
 'the server records a first occurrence');
SELECT lives_ok($$SELECT public.record_platform_error(
 'a0000000-0000-4000-8000-000000190002','fp-save','server','server_response','HttpError',NULL,'Internal server error',
 '/org/[orgId]/api/availability','POST',500::smallint,'10000000-0000-4000-8000-000000190002',NULL)$$,
 'the same failure from another account joins the group');
SELECT lives_ok($$SELECT public.record_platform_error(
 'a0000000-0000-4000-8000-000000190002','fp-save','server','server_response','HttpError',NULL,'Internal server error',
 '/org/[orgId]/api/availability','POST',500::smallint,'10000000-0000-4000-8000-000000190002',NULL)$$,
 'a retry of the same reference is accepted');
SELECT is((SELECT count(*)::integer FROM public.platform_error_groups),1,'one fingerprint is one group');
SELECT is((SELECT count(*)::integer FROM public.platform_error_occurrences),2,'a retried reference is not stored twice');
SELECT results_eq($$SELECT occurrence_count, affected_users, total_count FROM public.list_platform_error_groups('open',25,0)$$,
 $$VALUES (2::bigint, 2::bigint, 1::bigint)$$,'the list counts occurrences and distinct affected accounts');

SELECT is((SELECT last_seen_at FROM public.platform_error_groups) >= (SELECT first_seen_at FROM public.platform_error_groups),true,'last seen follows first seen');
UPDATE public.platform_error_groups SET status='resolved', resolved_at=now(), resolved_by='10000000-0000-4000-8000-000000190003';
SELECT is((SELECT count(*)::integer FROM public.list_platform_error_groups('open',25,0)),0,'a resolved group leaves the open list');
SELECT is((SELECT count(*)::integer FROM public.list_platform_error_groups('resolved',25,0)),1,'a resolved group is in the resolved list');
SELECT lives_ok($$SELECT public.record_platform_error(
 'a0000000-0000-4000-8000-000000190003','fp-save','server','server_response','HttpError',NULL,'Internal server error',
 '/org/[orgId]/api/availability','POST',500::smallint,NULL,NULL)$$,'a recurrence is recorded');
SELECT results_eq($$SELECT status, resolved_at, resolved_by FROM public.platform_error_groups$$,
 $$VALUES ('open'::text, NULL::timestamptz, NULL::uuid)$$,'a recurrence reopens a resolved group and clears who resolved it');
SELECT lives_ok($$SELECT public.record_platform_error(
 'a0000000-0000-4000-8000-000000190003','fp-save','server','server_response','HttpError',NULL,'Internal server error',
 '/org/[orgId]/api/availability','POST',500::smallint,NULL,NULL)$$,'a retried recurrence is accepted');
UPDATE public.platform_error_groups SET status='resolved', resolved_at=now();
SELECT lives_ok($$SELECT public.record_platform_error(
 'a0000000-0000-4000-8000-000000190003','fp-save','server','server_response','HttpError',NULL,'Internal server error',
 '/org/[orgId]/api/availability','POST',500::smallint,NULL,NULL)$$,'a replayed reference after resolving is accepted');
SELECT is((SELECT status FROM public.platform_error_groups),'resolved','a replayed reference does not reopen a group');
SELECT throws_ok($$SELECT public.record_platform_error(
 'a0000000-0000-4000-8000-000000190004','fp-bad','client','render','Error',NULL,'x',NULL,NULL,NULL,NULL,NULL)$$,'23514',NULL,'an unknown origin is rejected');
SELECT lives_ok($$SELECT public.record_platform_error(
 'a0000000-0000-4000-8000-000000190005','fp-client','client_reported','render','TypeError',NULL,'Cannot read properties of undefined',
 '/org/[orgId]/personnel','GET',NULL,'10000000-0000-4000-8000-000000190001',NULL)$$,'a client report is a separate group');
SELECT is((SELECT count(*)::integer FROM public.platform_error_groups),2,'origin keeps a client report out of a server group');

INSERT INTO public.beta_feedback(id,user_id,user_email,message,category,error_reference) VALUES
 ('50000000-0000-4000-8000-000000190001','10000000-0000-4000-8000-000000190001','errors-reporter@example.test','It broke','bug','a0000000-0000-4000-8000-000000190001');
SELECT results_eq($$SELECT jsonb_array_length(reports) FROM public.list_platform_error_groups('resolved',25,0)$$,
 $$VALUES (1)$$,'a linked report shows on its group');

UPDATE public.platform_error_occurrences SET occurred_at = now() - interval '31 days' WHERE id = 'a0000000-0000-4000-8000-000000190005';
SELECT is((SELECT count(*)::integer FROM public.list_platform_error_groups('open',25,0)),0,'the list ignores occurrences older than 30 days before cleanup runs');
SELECT is(public.cleanup_old_platform_errors(),1,'cleanup reports the occurrences it deleted');
SELECT is((SELECT count(*)::integer FROM public.platform_error_groups WHERE fingerprint='fp-client'),0,'cleanup removes a group left with no occurrences');
SELECT is((SELECT count(*)::integer FROM public.platform_error_groups WHERE fingerprint='fp-save'),1,'cleanup keeps a group that still has occurrences');
UPDATE public.platform_error_occurrences SET occurred_at = now() - interval '31 days' WHERE id = 'a0000000-0000-4000-8000-000000190001';
SELECT is(public.cleanup_old_platform_errors(),1,'cleanup deletes an occurrence a report links to');
SELECT is((SELECT error_reference FROM public.beta_feedback WHERE id='50000000-0000-4000-8000-000000190001'),NULL::uuid,'the report survives with its link cleared');

SELECT lives_ok($$SELECT public.record_platform_error(
 'c0000000-0000-4000-8000-000000190001','fp-client-resolved','client_reported','render','TypeError',NULL,'Cannot read properties of null',
 '/org/[orgId]/personnel','GET',NULL,'10000000-0000-4000-8000-000000190001',NULL)$$,'a client report creates its group');
SELECT is((SELECT first_reported_by FROM public.platform_error_groups WHERE fingerprint='fp-client-resolved'),'10000000-0000-4000-8000-000000190001'::uuid,'a client group records the account that first reported it');
SELECT is((SELECT first_reported_by FROM public.platform_error_groups WHERE fingerprint='fp-save'),NULL::uuid,'a server group records no reporter');
UPDATE public.platform_error_groups SET status='resolved', resolved_at='2026-01-02 00:00:00+00', resolved_by='10000000-0000-4000-8000-000000190003', last_seen_at='2026-01-01 00:00:00+00' WHERE fingerprint='fp-client-resolved';
SELECT lives_ok($$SELECT public.record_platform_error(
 'c0000000-0000-4000-8000-000000190002','fp-client-resolved','client_reported','render','TypeError',NULL,'Cannot read properties of null',
 '/org/[orgId]/personnel','GET',NULL,'10000000-0000-4000-8000-000000190002',NULL)$$,'a client report of a resolved failure is accepted');
SELECT results_eq($$SELECT status, resolved_at, resolved_by FROM public.platform_error_groups WHERE fingerprint='fp-client-resolved'$$,
 $$VALUES ('resolved'::text, '2026-01-02 00:00:00+00'::timestamptz, '10000000-0000-4000-8000-000000190003'::uuid)$$,'a client report leaves a resolved group resolved and keeps who resolved it');
SELECT is((SELECT last_seen_at > '2026-01-01 00:00:00+00' FROM public.platform_error_groups WHERE fingerprint='fp-client-resolved'),true,'a client report still advances last seen');
SELECT is((SELECT count(*)::integer FROM public.platform_error_occurrences WHERE group_id=(SELECT id FROM public.platform_error_groups WHERE fingerprint='fp-client-resolved')),2,'a client report of a resolved failure is still stored');
SELECT lives_ok($$SELECT public.record_platform_error(
 'c0000000-0000-4000-8000-000000190003','fp-client-resolved','server','server_exception','TypeError',NULL,'Cannot read properties of null',
 '/org/[orgId]/personnel','GET',500::smallint,NULL,NULL)$$,'a server failure with the same fingerprint is accepted');
SELECT results_eq($$SELECT status, resolved_at, resolved_by FROM public.platform_error_groups WHERE fingerprint='fp-client-resolved'$$,
 $$VALUES ('open'::text, NULL::timestamptz, NULL::uuid)$$,'a server failure reopens a resolved group');

SELECT lives_ok($$SELECT public.record_platform_error(gen_random_uuid(),'cap-'||n,'client_reported','render','TypeError',NULL,'Failure '||n,
 '/org/[orgId]/personnel','GET',NULL,'10000000-0000-4000-8000-000000190001',NULL) FROM generate_series(1,19) AS n$$,'an account fills its daily allowance of new groups');
SELECT is((SELECT count(*)::integer FROM public.platform_error_groups WHERE first_reported_by='10000000-0000-4000-8000-000000190001'),20,'twenty new groups are created');
SELECT lives_ok($$SELECT public.record_platform_error(
 'd0000000-0000-4000-8000-000000190001','cap-20','client_reported','render','TypeError',NULL,'Failure 20',
 '/org/[orgId]/personnel','GET',NULL,'10000000-0000-4000-8000-000000190001',NULL)$$,'the next new failure from the account is accepted');
SELECT is((SELECT count(*)::integer FROM public.platform_error_groups WHERE first_reported_by='10000000-0000-4000-8000-000000190001'),21,'the next new failure creates only the overflow group');
SELECT is((SELECT count(*)::integer FROM public.platform_error_groups WHERE fingerprint='cap-20'),0,'the failure past the allowance gets no group of its own');
SELECT results_eq($$SELECT origin, kind, name, code, message, route_id, method FROM public.platform_error_groups WHERE fingerprint='client-overflow:10000000-0000-4000-8000-000000190001'$$,
 $$VALUES ('client_reported'::text,'render'::text,'ClientReportOverflow'::text,NULL::text,'Further new client failures from this account passed the daily limit'::text,NULL::text,NULL::text)$$,'the overflow group carries fixed text and none of the failure');
SELECT lives_ok($$SELECT public.record_platform_error(
 'd0000000-0000-4000-8000-000000190002','cap-21','client_reported','transport','TypeError',NULL,'Failure 21',
 '/org/[orgId]/calendar','POST',NULL,'10000000-0000-4000-8000-000000190001',NULL)$$,'a second failure past the allowance is accepted');
SELECT is((SELECT count(*)::integer FROM public.platform_error_groups WHERE first_reported_by='10000000-0000-4000-8000-000000190001'),21,'a second failure joins the same overflow group');
SELECT is((SELECT count(*)::integer FROM public.platform_error_occurrences WHERE group_id=(SELECT id FROM public.platform_error_groups WHERE fingerprint='client-overflow:10000000-0000-4000-8000-000000190001')),2,'both overflow occurrences are stored');
SELECT lives_ok($$SELECT public.record_platform_error(
 'd0000000-0000-4000-8000-000000190003','cap-1','client_reported','render','TypeError',NULL,'Failure 1',
 '/org/[orgId]/personnel','GET',NULL,'10000000-0000-4000-8000-000000190001',NULL)$$,'a known failure from a capped account is accepted');
SELECT is((SELECT count(*)::integer FROM public.platform_error_occurrences WHERE group_id=(SELECT id FROM public.platform_error_groups WHERE fingerprint='cap-1')),2,'a known failure from a capped account joins its own group');
SELECT lives_ok($$SELECT public.record_platform_error(
 'd0000000-0000-4000-8000-000000190004','cap-peer','client_reported','render','TypeError',NULL,'Peer failure',
 '/org/[orgId]/personnel','GET',NULL,'10000000-0000-4000-8000-000000190002',NULL)$$,'another account reports a new failure');
SELECT is((SELECT count(*)::integer FROM public.platform_error_groups WHERE fingerprint='cap-peer'),1,'another account is not capped by the first');
SELECT lives_ok($$SELECT public.record_platform_error(
 'd0000000-0000-4000-8000-000000190005','server-new','server','server_response','HttpError',NULL,'Another server failure',
 '/org/[orgId]/api/availability','POST',500::smallint,'10000000-0000-4000-8000-000000190001',NULL)$$,'a server failure is recorded for a capped account');
SELECT is((SELECT count(*)::integer FROM public.platform_error_groups WHERE fingerprint='server-new'),1,'a server failure is never capped');
SELECT lives_ok($$SELECT public.record_platform_error(
 'd0000000-0000-4000-8000-000000190001','cap-20','client_reported','render','TypeError',NULL,'Failure 20',
 '/org/[orgId]/personnel','GET',NULL,'10000000-0000-4000-8000-000000190001',NULL)$$,'a replayed overflow reference is accepted');
SELECT is((SELECT count(*)::integer FROM public.platform_error_occurrences WHERE group_id=(SELECT id FROM public.platform_error_groups WHERE fingerprint='client-overflow:10000000-0000-4000-8000-000000190001')),2,'a replayed overflow reference is not stored twice');
SELECT is((SELECT count(*)::integer FROM public.platform_error_groups WHERE fingerprint='cap-20'),0,'a replayed overflow reference creates no group');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000190001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT is(current_user,'authenticated'::name,'security assertions run as an ordinary signed-in role');
SELECT throws_ok($$SELECT count(*) FROM public.platform_error_groups$$,'42501',NULL,'a signed-in account cannot read groups');
SELECT throws_ok($$SELECT count(*) FROM public.platform_error_occurrences$$,'42501',NULL,'a signed-in account cannot read occurrences');
SELECT throws_ok($$INSERT INTO public.platform_error_groups(fingerprint,origin,kind,name,message) VALUES ('forged','server','render','E','m')$$,'42501',NULL,'a signed-in account cannot create a group');
SELECT throws_ok($$INSERT INTO public.platform_error_occurrences(id,group_id) VALUES (gen_random_uuid(),gen_random_uuid())$$,'42501',NULL,'a signed-in account cannot create an occurrence');
SELECT throws_ok($$UPDATE public.platform_error_groups SET status='resolved'$$,'42501',NULL,'a signed-in account cannot resolve a group');
SELECT throws_ok($$UPDATE public.platform_error_occurrences SET user_id=NULL$$,'42501',NULL,'a signed-in account cannot edit an occurrence');
SELECT throws_ok($$DELETE FROM public.platform_error_groups$$,'42501',NULL,'a signed-in account cannot delete a group');
SELECT throws_ok($$DELETE FROM public.platform_error_occurrences$$,'42501',NULL,'a signed-in account cannot delete an occurrence');
SELECT throws_ok($$SELECT public.record_platform_error(gen_random_uuid(),'forged','server','render','E',NULL,'m',NULL,NULL,NULL,NULL,NULL)$$,'42501',NULL,'a signed-in account cannot call the recorder');
SELECT throws_ok($$SELECT * FROM public.list_platform_error_groups('open',25,0)$$,'42501',NULL,'a signed-in account cannot call the admin list');
SELECT throws_ok($$SELECT public.cleanup_old_platform_errors()$$,'42501',NULL,'a signed-in account cannot call cleanup');
SELECT throws_ok($$INSERT INTO public.beta_feedback(user_id,user_email,message,error_reference) VALUES ('10000000-0000-4000-8000-000000190001','errors-reporter@example.test','Forged link','a0000000-0000-4000-8000-000000190003')$$,'42501',NULL,'a submitter cannot attach an error reference themselves');
UPDATE public.beta_feedback SET error_reference='a0000000-0000-4000-8000-000000190003';
SELECT is((SELECT error_reference FROM public.beta_feedback WHERE id='50000000-0000-4000-8000-000000190001'),NULL::uuid,'a submitter cannot link an error reference afterwards');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT count(*) FROM public.platform_error_groups$$,'42501',NULL,'a signed-out visitor cannot read groups');
SELECT throws_ok($$SELECT public.record_platform_error(gen_random_uuid(),'forged','server','render','E',NULL,'m',NULL,NULL,NULL,NULL,NULL)$$,'42501',NULL,'a signed-out visitor cannot call the recorder');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
