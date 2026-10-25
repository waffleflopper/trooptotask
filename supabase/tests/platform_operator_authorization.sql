BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email) VALUES
 ('e8690000-0000-4000-8000-000000000001','operator-1869@example.test'),
 ('e8690000-0000-4000-8000-000000000002','ordinary-1869@example.test');
INSERT INTO public.platform_operators(user_id) VALUES ('e8690000-0000-4000-8000-000000000001');
INSERT INTO public.access_requests(id,email,name,status) VALUES
 ('e8690000-0000-4000-8000-000000000101','request-1869@example.test','Synthetic request','pending');
INSERT INTO public.account_setup_links(id,access_request_id,token_hash,expires_at) VALUES
 ('e8690000-0000-4000-8000-000000000201','e8690000-0000-4000-8000-000000000101','synthetic-1869-hash',now()+interval '1 day');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e8690000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT is(public.is_platform_operator(),false,'an ordinary signed-in account has no operator authority');
SELECT is((SELECT count(*)::integer FROM public.platform_operators),0,'non-operator cannot read operator membership');
SELECT is((SELECT count(*)::integer FROM public.access_requests WHERE id='e8690000-0000-4000-8000-000000000101'),0,'non-operator cannot read platform requests');
SELECT is((SELECT count(*)::integer FROM public.account_setup_links WHERE id='e8690000-0000-4000-8000-000000000201'),0,'non-operator cannot read setup credentials');
SELECT throws_ok($$SELECT public.count_platform_users()$$,'42501',NULL,'non-operator cannot call the platform account reader');
SELECT throws_ok($$SELECT public.platform_transfer_org_ownership('e8690000-0000-4000-8000-000000000001','e8690000-0000-4000-8000-000000000101','e8690000-0000-4000-8000-000000000002','forged')$$,'42501',NULL,'a signed-in non-operator cannot forge the actor of a server-only command');
SELECT throws_ok($$INSERT INTO public.platform_operators(user_id) VALUES ('e8690000-0000-4000-8000-000000000002')$$,'42501',NULL,'ordinary accounts cannot grant themselves operator membership');
SELECT set_config('request.jwt.claim.sub','e8690000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SELECT is(public.is_platform_operator(),false,'operator password-only sessions have no platform SQL authority');
SELECT is((SELECT count(*)::integer FROM public.platform_operators),0,'operator membership is not exposed before MFA');
SELECT is((SELECT count(*)::integer FROM public.access_requests),0,'operator sessions cannot bypass MFA through direct platform reads');
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT is(public.is_platform_operator(),true,'operator membership grants authority to an ordinary signed-in database role');
SELECT is((SELECT user_id FROM public.platform_operators WHERE user_id='e8690000-0000-4000-8000-000000000001'),'e8690000-0000-4000-8000-000000000001'::uuid,'operator reads the saved membership');
SELECT is((SELECT id FROM public.access_requests WHERE id='e8690000-0000-4000-8000-000000000101'),'e8690000-0000-4000-8000-000000000101'::uuid,'operator reads the platform request');
SELECT is((SELECT id FROM public.account_setup_links WHERE id='e8690000-0000-4000-8000-000000000201'),'e8690000-0000-4000-8000-000000000201'::uuid,'operator reads the setup link');
SELECT throws_ok($$INSERT INTO public.user_suspensions(user_id,suspended_by) VALUES ('e8690000-0000-4000-8000-000000000002','e8690000-0000-4000-8000-000000000001')$$,'42501',NULL,'operator clients cannot bypass server suspension MFA and audit');
SELECT throws_ok($$DELETE FROM public.user_suspensions WHERE user_id='e8690000-0000-4000-8000-000000000002'$$,'42501',NULL,'operator clients cannot bypass server unsuspension MFA and audit');
SELECT throws_ok($$DELETE FROM public.platform_operators WHERE user_id='e8690000-0000-4000-8000-000000000001'$$,'42501',NULL,'operator membership cannot be managed from an authenticated client');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SELECT is(public.is_platform_operator(),false,'anonymous policy evaluation has no operator authority');
SELECT is((SELECT count(*)::integer FROM public.access_requests),0,'anonymous request reads return no platform data');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
