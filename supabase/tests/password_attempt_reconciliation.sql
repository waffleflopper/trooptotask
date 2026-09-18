BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email,encrypted_password,raw_user_meta_data) VALUES
 ('10000000-0000-4000-8000-000000000401','attempt-owner@example.test','old-hash','{"retained":"profile"}'),
 ('10000000-0000-4000-8000-000000000402','attempt-other@example.test','other-hash','{}');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES
 ('20000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000401',now(),now()),
 ('20000000-0000-4000-8000-000000000402','10000000-0000-4000-8000-000000000402',now(),now()),
 ('20000000-0000-4000-8000-000000000403','10000000-0000-4000-8000-000000000401',now(),now());
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.password_change_attempts'::regclass),'ledger RLS enabled');
SELECT ok(NOT has_table_privilege('authenticated','public.password_change_attempts','SELECT,INSERT,UPDATE,DELETE'),'no browser ledger privileges');
SELECT ok(NOT has_table_privilege('anon','public.password_change_attempts','SELECT,INSERT,UPDATE,DELETE'),'no anonymous ledger privileges');
SELECT ok(NOT has_table_privilege('service_role','public.password_change_attempts','SELECT,INSERT,UPDATE,DELETE'),'service client uses only narrow RPC');
SELECT ok(NOT has_function_privilege('authenticated','public.password_change_attempt(uuid,uuid,text,text,timestamptz,uuid)','EXECUTE'),'browser cannot forge completion');
SELECT ok(NOT has_function_privilege('anon','public.password_change_attempt(uuid,uuid,text,text,timestamptz,uuid)','EXECUTE'),'anonymous cannot admit');
SELECT ok(has_function_privilege('service_role','public.password_change_attempt(uuid,uuid,text,text,timestamptz,uuid)','EXECUTE'),'auth edge can use RPC');
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT * FROM public.password_change_attempts','42501',NULL,'tenant members cannot read any ledger');
SELECT throws_ok($$SELECT public.password_change_attempt('10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401','begin')$$,'42501',NULL,'browser RPC denied');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.password_change_attempt('10000000-0000-4000-8000-000000000402','20000000-0000-4000-8000-000000000401','begin')$$,'42501','Inactive password session','cross actor session denied');
SELECT is(public.password_change_attempt('10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401','begin','recovery',now()+interval '10 minutes')->>'acquired','true','first admission acquired');
SELECT is(public.password_change_attempt('10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401','begin','recovery',now()+interval '10 minutes')->>'acquired','false','duplicate cannot mutate');
SELECT is(public.password_change_attempt('10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000403','read','recovery')->>'state','expired','another same-actor session cannot resume');
SELECT is(public.password_change_attempt('10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401','read','invite')->>'state','expired','flow binding enforced');
SELECT is(public.password_change_attempt('10000000-0000-4000-8000-000000000402','20000000-0000-4000-8000-000000000402','read')->'state','null'::jsonb,'other actor has no attempt');
RESET ROLE;
SELECT throws_ok($$UPDATE auth.users SET raw_user_meta_data=jsonb_build_object('ttt_password_attempt',(SELECT id FROM public.password_change_attempts WHERE actor=auth.users.id)) WHERE id='10000000-0000-4000-8000-000000000401'$$,'42501','Password change witness missing','metadata alone cannot confirm');
SAVEPOINT provider_transaction;
UPDATE auth.users SET encrypted_password='new-hash' WHERE id='10000000-0000-4000-8000-000000000401';
UPDATE auth.users SET raw_user_meta_data=raw_user_meta_data || jsonb_build_object('ttt_password_attempt',(SELECT id FROM public.password_change_attempts WHERE actor=auth.users.id)) WHERE id='10000000-0000-4000-8000-000000000401';
SELECT is((SELECT state FROM public.password_change_attempts WHERE actor='10000000-0000-4000-8000-000000000401'),'pending','password plus marker confirms');
SELECT is((SELECT raw_user_meta_data FROM auth.users WHERE id='10000000-0000-4000-8000-000000000401'),'{"retained":"profile"}'::jsonb,'marker consumed and profile retained');
ROLLBACK TO provider_transaction;
SELECT is((SELECT state FROM public.password_change_attempts WHERE actor='10000000-0000-4000-8000-000000000401'),'started','provider rollback also rolls back confirmation');
SELECT is((SELECT encrypted_password FROM auth.users WHERE id='10000000-0000-4000-8000-000000000401'),'old-hash','rollback retains password');
-- Fence the uncertain request before retry. Its delayed transaction must fail.
SELECT is(public.password_change_attempt('10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401','reconcile','recovery',NULL,(SELECT id FROM public.password_change_attempts WHERE actor='10000000-0000-4000-8000-000000000401'))->>'state','failed','reconcile fences an uncommitted attempt');
SELECT throws_ok($$UPDATE auth.users SET encrypted_password='late-hash', raw_user_meta_data=raw_user_meta_data || jsonb_build_object('ttt_password_attempt',(SELECT id FROM public.password_change_attempts WHERE actor=auth.users.id)) WHERE id='10000000-0000-4000-8000-000000000401'$$,'42501','Password attempt fenced','late password and metadata transaction rejected');
SELECT is((SELECT encrypted_password FROM auth.users WHERE id='10000000-0000-4000-8000-000000000401'),'old-hash','fenced mutation did not change password');
SELECT is(public.password_change_attempt('10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401','restart','recovery')->'state','null'::jsonb,'explicit restart after fencing');
SELECT public.password_change_attempt('10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401','begin','recovery',now()+interval '10 minutes');
UPDATE auth.users SET encrypted_password='confirmed-hash', raw_user_meta_data=raw_user_meta_data || jsonb_build_object('ttt_password_attempt',(SELECT id FROM public.password_change_attempts WHERE actor=auth.users.id)) WHERE id='10000000-0000-4000-8000-000000000401';
SELECT is(public.password_change_attempt('10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401','reconcile','recovery',NULL,(SELECT id FROM public.password_change_attempts WHERE actor='10000000-0000-4000-8000-000000000401'))->>'state','pending','lost response reconciles commit without another mutation');
SELECT is(public.password_change_attempt('10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401','complete','recovery',NULL,(SELECT id FROM public.password_change_attempts WHERE actor='10000000-0000-4000-8000-000000000401'))->>'state','complete','revocation acknowledgment persists');
SELECT throws_ok($$UPDATE auth.users SET encrypted_password='replay-hash', raw_user_meta_data=raw_user_meta_data || jsonb_build_object('ttt_password_attempt',(SELECT id FROM public.password_change_attempts WHERE actor=auth.users.id)) WHERE id='10000000-0000-4000-8000-000000000401'$$,'42501','Password attempt fenced','completed marker replay rejected');
UPDATE public.password_change_attempts SET expires_at=now()-interval '1 second';
SELECT is(public.password_change_attempt('10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401','read','recovery')->>'state','expired','expiry survives reload');
SELECT is(public.password_change_attempt('10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000403','restart','recovery')->'state','null'::jsonb,'fresh session can retire expired attempt');
SELECT is((SELECT encrypted_password FROM auth.users WHERE id='10000000-0000-4000-8000-000000000402'),'other-hash','other actor password retained');
SELECT * FROM finish();
ROLLBACK;
