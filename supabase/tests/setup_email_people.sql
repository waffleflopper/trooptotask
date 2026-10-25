BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email,created_at) VALUES
 ('f4a00000-0000-4000-8000-000000000001','s4-active@example.test','2026-10-20'),
 ('f4a00000-0000-4000-8000-000000000002','s4-suspended@example.test','2026-10-21'),
 ('f4a00000-0000-4000-8000-000000000003','s4-operator@example.test','2026-10-19');
INSERT INTO public.user_profiles(user_id,first_name,last_name) VALUES
 ('f4a00000-0000-4000-8000-000000000001','S4 Dana','Whitfield'),
 ('f4a00000-0000-4000-8000-000000000002','S4 Pat','100% Request_');
INSERT INTO public.platform_operators(user_id) VALUES ('f4a00000-0000-4000-8000-000000000003');
INSERT INTO public.user_suspensions(user_id,suspended_by,suspended_at,reason) VALUES
 ('f4a00000-0000-4000-8000-000000000002','f4a00000-0000-4000-8000-000000000003','2026-10-22','Address check');
INSERT INTO public.access_requests(id,name,email,status,approval_basis,reviewed_at,created_at) VALUES
 ('f4a00000-0000-4000-8000-000000000011','S4 New Person','s4-new@example.test','approved','platform_review','2026-10-22','2026-10-22'),
 ('f4a00000-0000-4000-8000-000000000012','S4 Existing Account','s4-active@example.test','approved','platform_review','2026-10-21','2026-10-21'),
 ('f4a00000-0000-4000-8000-000000000013','S4 Pending','s4-pending@example.test','pending',NULL,NULL,'2026-10-23'),
 ('f4a00000-0000-4000-8000-000000000014','S4 Expired','s4-expired@example.test','approved','platform_review','2026-09-01','2026-09-01'),
 ('f4a00000-0000-4000-8000-000000000015','S4 Claim','s4-claim@example.test','approved','platform_review','2026-09-01','2026-09-01');
INSERT INTO public.account_setup_links(id,access_request_id,token_hash,created_at,expires_at,resend_email_id,bounced_at,bounce_reason,claimed_at) VALUES
 ('f4a00000-0000-4000-8000-000000000021','f4a00000-0000-4000-8000-000000000011','s4-hash-1','2026-10-22','2026-11-05','resend-s4','2026-10-23','Mailbox gone',NULL),
 ('f4a00000-0000-4000-8000-000000000022','f4a00000-0000-4000-8000-000000000014','s4-hash-2','2026-09-01','2026-09-15',NULL,NULL,NULL,NULL),
 ('f4a00000-0000-4000-8000-000000000023','f4a00000-0000-4000-8000-000000000015','s4-hash-3','2026-09-01','2026-09-15',NULL,NULL,NULL,'2026-09-14');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f4a00000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT throws_ok($$SELECT public.platform_account_directory()$$,'42501',NULL,'ordinary signed-in member cannot read People');
SELECT throws_ok($$SELECT public.platform_setup_email_inbox()$$,'42501',NULL,'ordinary signed-in member cannot read setup Inbox');
SELECT throws_ok($$UPDATE public.account_setup_links SET bounced_at=now(), bounce_reason='forged', resend_email_id='forged'$$,'42501',NULL,'browser cannot forge provider fields');
SELECT set_config('request.jwt.claim.sub','f4a00000-0000-4000-8000-000000000003',true);
SELECT throws_ok($$SELECT public.platform_account_directory()$$,'42501',NULL,'operator browser session cannot bypass the server');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.platform_account_directory()$$,'42501',NULL,'anonymous callers cannot read People');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is(public.platform_account_directory('s4 dana')->'people'->0->>'email','s4-active@example.test','search finds profile name');
SELECT is(public.platform_account_directory('S4-SUSPENDED')->'people'->0->'state',
 '{"kind":"suspended","userId":"f4a00000-0000-4000-8000-000000000002","reason":"Address check","suspendedAt":"2026-10-22T00:00:00+00:00"}'::jsonb,'suspension carries reason and time');
SELECT is(public.platform_account_directory('100% request_')->>'totalCount','1','search treats percent and underscore literally');
SELECT is(public.platform_account_directory('%')->>'totalCount','1','percent is not a wildcard');
SELECT is(public.platform_account_directory('s4-new','notSetUp')->'people'->0->'state',
 '{"kind":"notSetUp","requestId":"f4a00000-0000-4000-8000-000000000011","approvedAt":"2026-10-22T00:00:00+00:00","linkExpiresAt":"2026-11-05T00:00:00+00:00"}'::jsonb,'approved request without account is Not set up');
SELECT is(public.platform_account_directory('s4-active','notSetUp')->>'totalCount','0','account and approved request do not duplicate a person');
SELECT is(public.platform_account_directory('s4-pending')->>'totalCount','0','pending requests stay in Inbox');
SELECT is(public.platform_account_directory('s4-','suspended')->>'totalCount','1','suspended filter contains only suspended accounts');
SELECT is(public.platform_account_directory('s4-', 'all', 1, 2)->'people'->0->>'email','s4-new@example.test','first page uses newest creation');
SELECT is(public.platform_account_directory('s4-', 'all', 2, 2)->'people'->0->>'email','s4-active@example.test','second page continues unique order');
SELECT is(public.platform_account_directory('no-such-person', 'all', 9, 20),
 '{"people":[],"totalCount":0,"page":1,"limit":20}'::jsonb,'empty page retains count and clamps page');
SELECT is(public.platform_setup_email_inbox('open',1,'2026-10-25')->>'count','2','bounded Inbox retains full count');
SELECT is(public.platform_setup_email_inbox('open',1,'2026-10-25')->'rows'->0->>'reason','bounced','bounce opens an item');
SELECT is(public.platform_setup_email_inbox('open',50,'2026-10-25')->'rows'->1->>'reason','expiredUnused','expired unclaimed link opens an item');
SELECT is(jsonb_array_length(public.platform_setup_email_inbox('open',0,'2026-10-25')->'rows'),0,'count-only reads return no rows');
UPDATE public.account_setup_links SET revoked_at='2026-10-24',revocation_reason='cleanup' WHERE id='f4a00000-0000-4000-8000-000000000022';
SELECT is(public.platform_setup_email_inbox('open',50,'2026-10-25')->>'count','2','credential cleanup does not resolve an expired failure');
SELECT is(public.platform_setup_email_inbox('open',50,'2026-10-25','f4a00000-0000-4000-8000-000000000022')->'rows'->0->'isOpen','true'::jsonb,'cleaned-up expiry remains actionable');
SELECT is(public.platform_setup_email_inbox('done',50,'2026-10-25')->>'count','0','credential cleanup is not a Done outcome');
UPDATE public.account_setup_links SET revoked_at='2026-10-24',revocation_reason='replaced' WHERE id='f4a00000-0000-4000-8000-000000000021';
INSERT INTO public.account_setup_links(id,access_request_id,token_hash,created_at,expires_at) VALUES
 ('f4a00000-0000-4000-8000-000000000024','f4a00000-0000-4000-8000-000000000011','s4-hash-4','2026-10-24','2026-11-07');
SELECT is(public.platform_setup_email_inbox('done',50,'2026-10-25')->>'count','0','replacement without a sent email does not fabricate Done');
SELECT is(public.platform_setup_email_inbox('open',50,'2026-10-25')->'rows'->0->>'id','f4a00000-0000-4000-8000-000000000021','replacement without a sent email keeps the original failure open');
INSERT INTO public.auth_email_outbox(access_request_id,setup_link_id,recipient,purpose,status,sent_at) VALUES
 ('f4a00000-0000-4000-8000-000000000011','f4a00000-0000-4000-8000-000000000024','s4-new@example.test','account_setup','failed',NULL);
SELECT is(public.platform_setup_email_inbox('open',50,'2026-10-25')->'rows'->0->>'id','f4a00000-0000-4000-8000-000000000021','failed replacement email keeps the original failure open');
SELECT is(public.platform_setup_email_inbox('done',50,'2026-10-25')->>'count','0','failed replacement email does not close the failure');
UPDATE public.auth_email_outbox SET status='sent',sent_at='2026-10-24' WHERE setup_link_id='f4a00000-0000-4000-8000-000000000024';
SELECT is(public.platform_setup_email_inbox('done',50,'2026-10-25')->'rows'->0->>'closedAt','2026-10-24T00:00:00+00:00','successful resend closes the historical failure at send time');
SELECT is(public.platform_setup_email_inbox('done',50,'2026-12-01')->>'count','0','Done excludes resolutions older than 30 days');
UPDATE public.access_requests SET status='rescinded' WHERE id='f4a00000-0000-4000-8000-000000000014';
SELECT is(public.platform_setup_email_inbox('done',50,now())->'rows'->0->>'reason','expiredUnused','rescind closes an old expiry failure now');
SELECT ok((SELECT rescinded_at IS NOT NULL FROM public.access_requests WHERE id='f4a00000-0000-4000-8000-000000000014'),'rescission records its own time');
UPDATE public.account_setup_links SET bounced_at='2026-10-25',bounce_reason='Delayed bounce',claimed_at='2026-10-25',used_at='2026-10-26'
 WHERE id='f4a00000-0000-4000-8000-000000000024';
UPDATE public.access_requests SET setup_completed_at='2026-10-26'
 WHERE id='f4a00000-0000-4000-8000-000000000011';
SELECT is(public.platform_setup_email_inbox('done',50,'2026-10-27','f4a00000-0000-4000-8000-000000000024')->'rows'->0->>'closedAt',
 '2026-10-26T00:00:00+00:00','finishing setup closes a bounced link at completion time');
SELECT is(public.platform_setup_email_inbox('open',50,'2026-10-27')->>'count','0','completed, rescinded and claimed requests leave no open failures');
INSERT INTO public.access_requests(id,name,email,status,approval_basis,reviewed_at,created_at) VALUES
 ('f4a00000-0000-4000-8000-000000000016','S4 Withdrawn','s4-withdrawn@example.test','approved','organization_invitation','2026-09-01','2026-09-01');
INSERT INTO public.account_setup_links(id,access_request_id,token_hash,created_at,expires_at) VALUES
 ('f4a00000-0000-4000-8000-000000000026','f4a00000-0000-4000-8000-000000000016','s4-withdrawn-hash','2026-09-01','2026-09-15');
SELECT is(public.platform_account_directory('s4-withdrawn','notSetUp')->>'totalCount','0',
 'a withdrawn invitation-only approval is not waiting for setup');
SELECT is(public.platform_setup_email_inbox('open',50,'2026-10-27')->>'count','0',
 'withdrawn invitation-only approval creates no operator Inbox work');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
