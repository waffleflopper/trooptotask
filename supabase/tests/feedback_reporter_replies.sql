BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid,id::uuid,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now()
FROM (VALUES
 ('10000000-0000-4000-8000-000000186921','thread-reporter@example.test'),
 ('10000000-0000-4000-8000-000000186922','thread-peer@example.test'),
 ('10000000-0000-4000-8000-000000186923','thread-operator@example.test')) AS fixture(id,email);
INSERT INTO public.platform_operators(user_id) VALUES ('10000000-0000-4000-8000-000000186923');
INSERT INTO public.beta_feedback(id,user_id,user_email,message,status) VALUES
 ('50000000-0000-4000-8000-000000186921','10000000-0000-4000-8000-000000186921','thread-reporter@example.test','Open thread','reviewed'),
 ('50000000-0000-4000-8000-000000186922','10000000-0000-4000-8000-000000186921','thread-reporter@example.test','Closed thread','resolved'),
 ('50000000-0000-4000-8000-000000186923','10000000-0000-4000-8000-000000186922','thread-peer@example.test','Peer thread','new');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000186921',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SELECT is(current_user,'authenticated'::name,'reply contracts run as an ordinary signed-in role');
SELECT is(public.reply_to_own_feedback('50000000-0000-4000-8000-000000186921','  More detail  ')->>'author','reporter','reporter can reply to their open thread');
SELECT results_eq($$SELECT body,author,sent_by FROM public.feedback_replies WHERE feedback_id='50000000-0000-4000-8000-000000186921'$$,
 $$VALUES ('More detail'::text,'reporter'::text,'10000000-0000-4000-8000-000000186921'::uuid)$$,'reply trims the body and attributes the signed-in reporter');
SELECT results_eq($$SELECT status,updated_by FROM public.beta_feedback WHERE id='50000000-0000-4000-8000-000000186921'$$,
 $$VALUES ('new'::text,'10000000-0000-4000-8000-000000186921'::uuid)$$,'reporter reply resurfaces the thread for the operator');
SELECT is((SELECT count(*) FROM public.notifications),0::bigint,'reporter reply sends no notification');
SELECT is(public.reply_to_own_feedback('50000000-0000-4000-8000-000000186922','Too late')->>'status','closed','resolved feedback returns closed');
SELECT is(public.reply_to_own_feedback('50000000-0000-4000-8000-000000186923','Not mine'),NULL::jsonb,'peer feedback is concealed');
SELECT is(public.reply_to_own_feedback('50000000-0000-4000-8000-000000186924','Missing'),NULL::jsonb,'missing feedback has the same result');
SELECT is((SELECT count(*) FROM public.feedback_replies),1::bigint,'closed and concealed attempts append nothing');
SELECT throws_ok($$SELECT public.reply_to_own_feedback('50000000-0000-4000-8000-000000186921','  ')$$,'22023',NULL,'blank body is rejected');
SELECT throws_ok($$SELECT public.reply_to_own_feedback('50000000-0000-4000-8000-000000186921',NULL)$$,'22023',NULL,'null body is rejected');
SELECT throws_ok($$SELECT public.reply_to_own_feedback('50000000-0000-4000-8000-000000186921',repeat('a',5001))$$,'22023',NULL,'overlong body is rejected');
SELECT is(length(public.reply_to_own_feedback('50000000-0000-4000-8000-000000186921',repeat('a',5000))->>'body'),5000,'maximum body is accepted');
SELECT throws_ok($$INSERT INTO public.feedback_replies(feedback_id,body,author) VALUES('50000000-0000-4000-8000-000000186921','Forged operator','operator')$$,'42501',NULL,'reporter cannot insert replies directly');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000186923',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT is(public.reply_to_feedback('50000000-0000-4000-8000-000000186921','Acknowledged',false)->>'author','operator','operator RPC stamps its author');
SELECT results_eq($$SELECT author,sent_by FROM public.feedback_replies WHERE body='Acknowledged'$$,
 $$VALUES ('operator'::text,'10000000-0000-4000-8000-000000186923'::uuid)$$,'operator attribution uses the ordinary session');
SELECT is(public.reply_to_own_feedback('50000000-0000-4000-8000-000000186923','Operator is not owner'),NULL::jsonb,'operator privilege does not bypass reporter ownership');
SELECT throws_ok($$INSERT INTO public.feedback_replies(feedback_id,body,author) VALUES('50000000-0000-4000-8000-000000186921','Direct operator','operator')$$,'42501',NULL,'operator cannot insert replies directly');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000186921',true);
SELECT results_eq($$SELECT link FROM public.notifications WHERE type='feedback_reply'$$,
 $$VALUES ('/account/feedback/50000000-0000-4000-8000-000000186921'::text)$$,'operator reply links to Account feedback');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.reply_to_own_feedback('50000000-0000-4000-8000-000000186921','Anonymous')$$,'42501',NULL,'anonymous caller cannot reply');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
