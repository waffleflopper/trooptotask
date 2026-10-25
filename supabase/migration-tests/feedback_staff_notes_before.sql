CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000186901','authenticated','authenticated','feedback-upgrade@example.test','',now(),'{}','{}',now(),now());
INSERT INTO public.beta_feedback(id,user_id,user_email,category,message,status,admin_notes,created_at,updated_at,github_issue_number,github_issue_url)
VALUES
 ('50000000-0000-4000-8000-000000186901','10000000-0000-4000-8000-000000186901','feedback-upgrade@example.test','bug','Keep original content','reviewed','Private historical note','2026-01-01T00:00:00Z','2026-02-02T00:00:00Z',42,'https://github.com/waffleflopper/trooptotask/issues/42'),
 ('50000000-0000-4000-8000-000000186902','10000000-0000-4000-8000-000000186901','feedback-upgrade@example.test','general','Keep empty note','new','','2026-03-03T00:00:00Z','2026-04-04T00:00:00Z',NULL,NULL),
 ('50000000-0000-4000-8000-000000186903','10000000-0000-4000-8000-000000186901','feedback-upgrade@example.test','feature','Keep absent note','new',NULL,'2026-05-05T00:00:00Z','2026-06-06T00:00:00Z',NULL,NULL);
CREATE TABLE upgrade_fixture.feedback_before AS
 SELECT id, to_jsonb(f) AS saved FROM public.beta_feedback f WHERE user_id = '10000000-0000-4000-8000-000000186901';
CREATE TABLE upgrade_fixture.feedback_notifications_before AS SELECT count(*) AS total FROM public.notifications;
