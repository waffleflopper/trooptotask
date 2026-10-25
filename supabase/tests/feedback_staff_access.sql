BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid,id::uuid,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now()
FROM (VALUES
 ('10000000-0000-4000-8000-000000186911','feedback-reporter@example.test'),
 ('10000000-0000-4000-8000-000000186912','feedback-peer@example.test'),
 ('10000000-0000-4000-8000-000000186913','feedback-operator@example.test')) AS fixture(id,email);
INSERT INTO public.platform_operators(user_id) VALUES ('10000000-0000-4000-8000-000000186913');
INSERT INTO public.beta_feedback(id,user_id,user_email,message) VALUES
 ('50000000-0000-4000-8000-000000186911','10000000-0000-4000-8000-000000186911','feedback-reporter@example.test','Reporter message'),
 ('50000000-0000-4000-8000-000000186912','10000000-0000-4000-8000-000000186912','feedback-peer@example.test','Peer message');
INSERT INTO public.feedback_staff_notes(feedback_id,body) VALUES ('50000000-0000-4000-8000-000000186911','Keep private');
INSERT INTO public.feedback_replies(id,feedback_id,body,sent_by,author) VALUES
 ('60000000-0000-4000-8000-000000186911','50000000-0000-4000-8000-000000186911','Own reply','10000000-0000-4000-8000-000000186913','operator'),
 ('60000000-0000-4000-8000-000000186912','50000000-0000-4000-8000-000000186912','Peer reply','10000000-0000-4000-8000-000000186913','operator');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000186911',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT is(current_user,'authenticated'::name,'security assertions run as an ordinary signed-in role');
SELECT results_eq($$SELECT id FROM public.beta_feedback ORDER BY id$$,$$VALUES ('50000000-0000-4000-8000-000000186911'::uuid)$$,'reporter reads only their own feedback');
SELECT results_eq($$SELECT body FROM public.feedback_replies ORDER BY id$$,$$VALUES ('Own reply'::text)$$,'reporter reads only replies to their own feedback');
SELECT is((SELECT count(*) FROM public.feedback_staff_notes),0::bigint,'reporter cannot read staff notes');
SELECT throws_ok($$SELECT admin_notes FROM public.beta_feedback$$,'42703',NULL,'legacy notes column is unavailable');
SELECT lives_ok($$INSERT INTO public.beta_feedback(user_id,user_email,category,message) VALUES('10000000-0000-4000-8000-000000186911','feedback-reporter@example.test','general','Allowed own submission')$$,'message-only submission succeeds');
SELECT throws_ok($$INSERT INTO public.beta_feedback(user_id,user_email,message,status) VALUES('10000000-0000-4000-8000-000000186911','feedback-reporter@example.test','Forged status','new')$$,'42501',NULL,'even an explicit default status is forbidden');
SELECT throws_ok($$INSERT INTO public.beta_feedback(user_id,user_email,message,admin_notes) VALUES('10000000-0000-4000-8000-000000186911','feedback-reporter@example.test','Forged note','Private staff content')$$,'42703',NULL,'submitter cannot insert the removed staff-notes field');
SELECT throws_ok($$INSERT INTO public.beta_feedback(user_id,user_email,message,updated_at) VALUES('10000000-0000-4000-8000-000000186911','feedback-reporter@example.test','Forged timestamp','2000-01-01')$$,'42501',NULL,'submitter cannot set the staff update timestamp');
SELECT throws_ok($$INSERT INTO public.beta_feedback(user_id,user_email,message,github_issue_number) VALUES('10000000-0000-4000-8000-000000186911','feedback-reporter@example.test','Forged issue',42)$$,'42501',NULL,'submitter cannot set GitHub issue number');
SELECT throws_ok($$INSERT INTO public.beta_feedback(user_id,user_email,message,github_issue_url) VALUES('10000000-0000-4000-8000-000000186911','feedback-reporter@example.test','Forged issue','https://github.com/waffleflopper/trooptotask/issues/42')$$,'42501',NULL,'submitter cannot set GitHub issue URL');
SELECT throws_ok($$INSERT INTO public.beta_feedback(user_id,user_email,message,updated_by) VALUES('10000000-0000-4000-8000-000000186911','feedback-reporter@example.test','Forged updater','10000000-0000-4000-8000-000000186913')$$,'42501',NULL,'submitter cannot set updatedBy');
SELECT throws_ok($$INSERT INTO public.beta_feedback(user_id,user_email,message,created_at) VALUES('10000000-0000-4000-8000-000000186911','feedback-reporter@example.test','Forged timestamp','2000-01-01')$$,'42501',NULL,'submitter cannot backdate feedback');
SELECT throws_ok($$INSERT INTO public.feedback_staff_notes(feedback_id,body,updated_by) VALUES('50000000-0000-4000-8000-000000186912','Forged note','10000000-0000-4000-8000-000000186913')$$,'42501',NULL,'submitter cannot write notes or their actor');
SELECT throws_ok($$INSERT INTO public.feedback_replies(feedback_id,body,sent_by) VALUES('50000000-0000-4000-8000-000000186911','Forged reply','10000000-0000-4000-8000-000000186913')$$,'42501',NULL,'submitter cannot set sentBy or create replies');
SELECT throws_ok($$INSERT INTO public.audit_logs(user_id,action,resource_type) VALUES('10000000-0000-4000-8000-000000186913','feedback.replied','feedback')$$,'42501',NULL,'submitter cannot forge audit actors');
SELECT throws_ok($$SELECT public.reply_to_feedback('50000000-0000-4000-8000-000000186911','Forbidden',false)$$,'42501',NULL,'non-operator cannot call reply function');
SELECT throws_ok($$SELECT public.save_feedback_staff_note('50000000-0000-4000-8000-000000186911','Forbidden')$$,'42501',NULL,'non-operator cannot call staff-note function');
SELECT throws_ok($$SELECT public.save_feedback_github_issue('50000000-0000-4000-8000-000000186911',42,'https://github.com/waffleflopper/trooptotask/issues/42')$$,'42501',NULL,'non-operator cannot call issue-link function');
SELECT throws_ok($$UPDATE public.feedback_replies SET body='Changed'$$,'42501',NULL,'reporter cannot edit replies');
SELECT throws_ok($$DELETE FROM public.feedback_replies$$,'42501',NULL,'reporter cannot delete replies');
WITH changed AS (UPDATE public.beta_feedback SET updated_by='10000000-0000-4000-8000-000000186913' WHERE id='50000000-0000-4000-8000-000000186911' RETURNING id)
SELECT is((SELECT count(*) FROM changed),0::bigint,'reporter cannot reattribute existing feedback');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000186913',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SELECT is((SELECT count(*) FROM public.feedback_staff_notes),0::bigint,'operator without aal2 cannot read notes');
SELECT throws_ok($$SELECT public.reply_to_feedback('50000000-0000-4000-8000-000000186911','Forbidden',false)$$,'42501',NULL,'operator without aal2 cannot reply');
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT is((SELECT body FROM public.feedback_staff_notes WHERE feedback_id='50000000-0000-4000-8000-000000186911'),'Keep private','admitted operator can read notes');
SELECT lives_ok($$SELECT public.reply_to_feedback('50000000-0000-4000-8000-000000186911','Operator acknowledgement',false)$$,'operator can reply');
SELECT results_eq($$SELECT status,updated_by FROM public.beta_feedback WHERE id='50000000-0000-4000-8000-000000186911'$$,$$VALUES ('reviewed'::text,'10000000-0000-4000-8000-000000186913'::uuid)$$,'reply reviews feedback and stamps the session operator');
SELECT results_eq($$SELECT body,sent_by FROM public.feedback_replies WHERE body='Operator acknowledgement'$$,$$VALUES ('Operator acknowledgement'::text,'10000000-0000-4000-8000-000000186913'::uuid)$$,'reply attribution comes from the ordinary signed-in operator');
SELECT lives_ok($$SELECT public.reply_to_feedback('50000000-0000-4000-8000-000000186911','Fix shipped',true)$$,'operator can append a later reply and close');
SELECT is((SELECT status FROM public.beta_feedback WHERE id='50000000-0000-4000-8000-000000186911'),'resolved','reply and close resolves feedback');
SELECT is((SELECT count(*) FROM public.feedback_replies WHERE feedback_id='50000000-0000-4000-8000-000000186911'),3::bigint,'later reply retains the original thread');
SELECT is(public.reply_to_feedback('50000000-0000-4000-8000-000000186911','Stale reply',false)->>'status','closed','a stale reply returns a distinct closed result');
SELECT is(public.reply_to_feedback('50000000-0000-4000-8000-000000186911','Stale close',true)->>'status','closed','a stale reply-and-close returns a distinct closed result');
SELECT is((SELECT status FROM public.beta_feedback WHERE id='50000000-0000-4000-8000-000000186911'),'resolved','stale replies cannot reopen closed feedback');
SELECT is((SELECT count(*) FROM public.feedback_replies WHERE feedback_id='50000000-0000-4000-8000-000000186911'),3::bigint,'closed feedback receives no extra replies');
RESET ROLE;
CREATE FUNCTION pg_temp.reject_feedback_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Synthetic notification failure';
END;
$$;
CREATE TRIGGER reject_feedback_notification BEFORE INSERT ON public.notifications
 FOR EACH ROW WHEN (NEW.link = '/account/feedback/50000000-0000-4000-8000-000000186912')
 EXECUTE FUNCTION pg_temp.reject_feedback_notification();
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.reply_to_feedback('50000000-0000-4000-8000-000000186912','Must roll back',false)$$,'P0001','Synthetic notification failure','notification failure rejects the reply transaction');
SELECT results_eq($$SELECT status,updated_by FROM public.beta_feedback WHERE id='50000000-0000-4000-8000-000000186912'$$,$$VALUES ('new'::text,NULL::uuid)$$,'notification failure rolls back status and attribution');
SELECT results_eq($$SELECT body FROM public.feedback_replies WHERE feedback_id='50000000-0000-4000-8000-000000186912'$$,$$VALUES ('Peer reply'::text)$$,'notification failure leaves no new reply');
RESET ROLE;
DROP TRIGGER reject_feedback_notification ON public.notifications;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$UPDATE public.feedback_replies SET sent_by='10000000-0000-4000-8000-000000186911'$$,'42501',NULL,'operator cannot reattribute append-only replies');
SELECT throws_ok($$DELETE FROM public.feedback_replies$$,'42501',NULL,'operator cannot delete append-only replies');
SELECT lives_ok($$SELECT public.save_feedback_staff_note('50000000-0000-4000-8000-000000186911','New private note')$$,'operator can replace staff note');
SELECT results_eq($$SELECT body,updated_by FROM public.feedback_staff_notes WHERE feedback_id='50000000-0000-4000-8000-000000186911'$$,$$VALUES ('New private note'::text,'10000000-0000-4000-8000-000000186913'::uuid)$$,'note attribution comes from the signed-in operator');
SELECT ok(public.save_feedback_github_issue('50000000-0000-4000-8000-000000186911',42,'https://github.com/waffleflopper/trooptotask/issues/42'),'operator stores GitHub issue link');
SELECT is(public.save_feedback_github_issue('50000000-0000-4000-8000-000000186911',43,'https://github.com/waffleflopper/trooptotask/issues/43'),false,'existing GitHub link is not overwritten');
SELECT throws_ok($$SELECT public.reply_to_feedback('50000000-0000-4000-8000-000000186911','  ',false)$$,'22023',NULL,'blank reply is rejected at SQL boundary');
SELECT throws_ok($$SELECT public.save_feedback_github_issue('50000000-0000-4000-8000-000000186912',42,'https://evil.example/42')$$,'22023',NULL,'foreign issue URL is rejected');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000186911',true);
SELECT is((SELECT count(*) FROM public.feedback_staff_notes),0::bigint,'new staff notes remain concealed from their reporter');
SELECT is((SELECT count(*) FROM public.feedback_replies WHERE feedback_id='50000000-0000-4000-8000-000000186911'),3::bigint,'reporter sees the complete appended reply thread');
SELECT results_eq($$SELECT user_id,organization_id,type,link FROM public.notifications WHERE type='feedback_reply' ORDER BY id$$,
 $$VALUES ('10000000-0000-4000-8000-000000186911'::uuid,NULL::uuid,'feedback_reply'::text,'/account/feedback/50000000-0000-4000-8000-000000186911'::text),
          ('10000000-0000-4000-8000-000000186911'::uuid,NULL::uuid,'feedback_reply'::text,'/account/feedback/50000000-0000-4000-8000-000000186911'::text)$$,
 'each committed reply notifies its reporter, including reply-and-close, without a stale-reply notification');
SELECT is((SELECT count(*) FROM public.platform_operators),0::bigint,'ordinary submitter cannot read operator membership');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SELECT lives_ok($$INSERT INTO public.notifications(user_id,organization_id,type,title,message,link) VALUES('10000000-0000-4000-8000-000000186911',NULL,'feedback_reply','Reply','An operator replied','/account/feedback/50000000-0000-4000-8000-000000186911')$$,'server can notify an account-only reporter');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000186911',true);
SELECT results_eq($$SELECT link FROM public.notifications WHERE type='feedback_reply' AND title='Reply'$$,$$VALUES ('/account/feedback/50000000-0000-4000-8000-000000186911'::text)$$,'reply notification is readable by its reporter without membership');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000186912',true);
SELECT is((SELECT count(*) FROM public.notifications WHERE type='feedback_reply'),0::bigint,'peer cannot read reporter reply notification');
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$SELECT public.reply_to_feedback('50000000-0000-4000-8000-000000186911','Forbidden',false)$$,'42501',NULL,'anonymous caller cannot call staff reply function');
SELECT throws_ok($$SELECT * FROM public.feedback_replies$$,'42501',NULL,'anonymous caller cannot read replies');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
