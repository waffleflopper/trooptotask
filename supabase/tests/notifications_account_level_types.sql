BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(7);

INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000205901','authenticated','authenticated',
 'account-notice@example.test','',now(),'{}','{}',now(),now());
INSERT INTO public.organizations(id,name,created_by,url_slug)
VALUES ('20000000-0000-4000-8000-000000205901','Account Notice Org','10000000-0000-4000-8000-000000205901','account-notice-2059');

SELECT lives_ok($$INSERT INTO public.notifications(id,user_id,organization_id,type,title,message,link)
 VALUES ('60000000-0000-4000-8000-000000205901','10000000-0000-4000-8000-000000205901',NULL,'organization_invitation_received',
 'Invitation to join Account Notice Org','Open your invitations','/dashboard?show=all')$$,
 'a received invitation needs no Organization');
SELECT lives_ok($$INSERT INTO public.notifications(id,user_id,organization_id,type,title,message)
 VALUES ('60000000-0000-4000-8000-000000205902','10000000-0000-4000-8000-000000205901',NULL,'feedback_reply','Reply','Reply body')$$,
 'a feedback reply still needs no Organization');
SELECT throws_ok($$INSERT INTO public.notifications(user_id,organization_id,type,title,message)
 VALUES ('10000000-0000-4000-8000-000000205901',NULL,'member_invited','Member invited','No Organization')$$,
 '23514',NULL,'any other type still requires an Organization');
SELECT throws_ok($$INSERT INTO public.notifications(user_id,organization_id,type,title,message)
 VALUES ('10000000-0000-4000-8000-000000205901',NULL,'ORGANIZATION_INVITATION_RECEIVED','Wrong case','No Organization')$$,
 '23514',NULL,'the account-level type names match exactly');
SELECT lives_ok($$INSERT INTO public.notifications(id,user_id,organization_id,type,title,message)
 VALUES ('60000000-0000-4000-8000-000000205903','10000000-0000-4000-8000-000000205901','20000000-0000-4000-8000-000000205901','member_invited','Member invited','In an Organization')$$,
 'an Organization notification of any type is still accepted');
SELECT results_eq($$SELECT convalidated FROM pg_constraint WHERE conrelid='public.notifications'::regclass AND conname='notifications_account_level_types'$$,
 $$VALUES (true)$$,'the account-level constraint is validated');
SELECT is((SELECT count(*) FROM pg_constraint WHERE conrelid='public.notifications'::regclass AND conname='notifications_account_feedback_only'),
 0::bigint,'the feedback-only constraint is gone');

SELECT * FROM finish();
ROLLBACK;
