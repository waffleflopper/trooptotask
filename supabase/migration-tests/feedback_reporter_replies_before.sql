INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000186931','authenticated','authenticated','reply-upgrade@example.test','',now(),'{}','{}',now(),now());
INSERT INTO public.beta_feedback(id,user_id,user_email,message)
VALUES ('50000000-0000-4000-8000-000000186931','10000000-0000-4000-8000-000000186931','reply-upgrade@example.test','Retain this thread');
INSERT INTO public.feedback_replies(id,feedback_id,body,sent_by,sent_at)
VALUES ('60000000-0000-4000-8000-000000186931','50000000-0000-4000-8000-000000186931','Historical operator reply','10000000-0000-4000-8000-000000186931','2026-10-24T12:00:00Z');
INSERT INTO public.notifications(id,user_id,organization_id,type,title,message,link,read,created_at) VALUES
 ('70000000-0000-4000-8000-000000186931','10000000-0000-4000-8000-000000186931',NULL,'feedback_reply','Reply','Retain this notification','/feedback/50000000-0000-4000-8000-000000186931',true,'2026-10-24T12:00:00Z'),
 ('70000000-0000-4000-8000-000000186932','10000000-0000-4000-8000-000000186931',NULL,'feedback_reply','Reply','Already migrated','/account/feedback/50000000-0000-4000-8000-000000186931',false,'2026-10-24T13:00:00Z');
CREATE TABLE upgrade_fixture.replies_before AS SELECT id,to_jsonb(r) AS saved FROM public.feedback_replies r;
CREATE TABLE upgrade_fixture.reply_notifications_before AS SELECT id,to_jsonb(n) AS saved FROM public.notifications n;
