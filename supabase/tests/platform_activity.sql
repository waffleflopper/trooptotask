BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f6a00000-0000-4000-8000-000000000001','Activity-Operator@example.test','{}'),
 ('f6a00000-0000-4000-8000-000000000002','activity-ordinary@example.test','{}'),
 ('f6a00000-0000-4000-8000-000000000003','activity-unnamed@example.test','{"rank":"SSG"}');
INSERT INTO public.user_profiles(user_id,first_name,last_name,rank) VALUES
 ('f6a00000-0000-4000-8000-000000000001','Robert','Cole','CPT'),
 ('f6a00000-0000-4000-8000-000000000002','Dana','Whitfield','CIV');
INSERT INTO public.platform_operators(user_id) VALUES ('f6a00000-0000-4000-8000-000000000001');
INSERT INTO public.organizations(id,name,created_by) VALUES
 ('f6a00000-0000-4000-8000-000000000101','Activity Alpha Company','f6a00000-0000-4000-8000-000000000002');
INSERT INTO public.audit_logs(id,"timestamp",user_id,org_id,action,resource_type,resource_id,details,severity) VALUES
 ('f6a00000-0000-4000-8000-000000000201','2026-10-20T12:00:00Z','f6a00000-0000-4000-8000-000000000001','f6a00000-0000-4000-8000-000000000101','suspend_org','organization','f6a00000-0000-4000-8000-000000000101','{"targetName":"Activity Alpha Company"}','critical'),
 ('f6a00000-0000-4000-8000-000000000202','2026-10-21T12:00:00Z','f6a00000-0000-4000-8000-000000000001',NULL,'suspend_user','user','f6a00000-0000-4000-8000-000000000002','{"actorEmail":"activity-operator@example.test","targetName":"Pat Lee"}','critical'),
 ('f6a00000-0000-4000-8000-000000000203','2026-10-22T12:00:00Z',NULL,NULL,'admin.future_action','user',NULL,'{}','info'),
 ('f6a00000-0000-4000-8000-000000000204','2026-10-23T12:00:00Z','f6a00000-0000-4000-8000-000000000001','f6a00000-0000-4000-8000-000000000101','personnel.updated','personnel',NULL,'{"actorEmail":"activity-operator@example.test"}','info'),
 ('f6a00000-0000-4000-8000-000000000205','2026-10-24T12:00:00Z','f6a00000-0000-4000-8000-000000000001',NULL,'access_request.rejected','access_request',NULL,'{"targetName":"Pat 100% Request_"}','warning'),
 ('f6a00000-0000-4000-8000-000000000206','2026-10-25T12:00:00Z','f6a00000-0000-4000-8000-000000000003',NULL,'auth.login_failure','user',NULL,'{}','warning');

SELECT is(has_function_privilege('anon','public.list_platform_activity(text[],text[],text,timestamptz,timestamptz,integer,integer)','EXECUTE'),false,'anonymous callers cannot read platform Activity');
SELECT is(has_function_privilege('authenticated','public.list_platform_activity(text[],text[],text,timestamptz,timestamptz,integer,integer)','EXECUTE'),false,'signed-in callers cannot read platform Activity directly');
SELECT is(has_function_privilege('service_role','public.list_platform_activity(text[],text[],text,timestamptz,timestamptz,integer,integer)','EXECUTE'),true,'the server reads platform Activity');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f6a00000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT throws_ok($$SELECT * FROM public.list_platform_activity(ARRAY['suspend_org'],ARRAY[]::text[],NULL,NULL,NULL,50,0)$$,'42501',NULL,'an operator session cannot call the server-only read');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT is((SELECT array_agg(id ORDER BY "timestamp" DESC) FROM public.list_platform_activity(ARRAY['suspend_org','suspend_user','access_request.rejected'],ARRAY['admin.'],NULL,NULL,NULL,50,0)),
 ARRAY['f6a00000-0000-4000-8000-000000000205','f6a00000-0000-4000-8000-000000000203','f6a00000-0000-4000-8000-000000000202','f6a00000-0000-4000-8000-000000000201']::uuid[],
 'listed actions and prefixes match newest first, and other events stay out');
SELECT is((SELECT org_name FROM public.list_platform_activity(ARRAY['suspend_org'],ARRAY[]::text[],NULL,NULL,NULL,50,0)),'Activity Alpha Company','the Organization name arrives with the row');
SELECT is((SELECT count(*)::integer FROM public.list_platform_activity(ARRAY[]::text[],ARRAY[]::text[],NULL,NULL,NULL,50,0)),0,'no scope matches nothing');
SELECT is((SELECT array_agg(id) FROM public.list_platform_activity(ARRAY['suspend_org','suspend_user'],ARRAY[]::text[],'PAT LEE',NULL,NULL,50,0)),ARRAY['f6a00000-0000-4000-8000-000000000202']::uuid[],'search ignores case and finds the target name');
SELECT is((SELECT array_agg(id) FROM public.list_platform_activity(ARRAY['suspend_org','suspend_user'],ARRAY[]::text[],'ACTIVITY-ORDINARY',NULL,NULL,50,0)),ARRAY['f6a00000-0000-4000-8000-000000000202']::uuid[],'search finds the account a user event acted on by its email');
SELECT is((SELECT array_agg(id ORDER BY "timestamp") FROM public.list_platform_activity(ARRAY['suspend_org','suspend_user'],ARRAY[]::text[],'activity-operator@example',NULL,NULL,50,0)),ARRAY['f6a00000-0000-4000-8000-000000000201','f6a00000-0000-4000-8000-000000000202']::uuid[],'search finds an Organization event by its actor email although the row stores none');
SELECT is((SELECT array_agg(id) FROM public.list_platform_activity(ARRAY['suspend_org'],ARRAY[]::text[],'robert cole',NULL,NULL,50,0)),ARRAY['f6a00000-0000-4000-8000-000000000201']::uuid[],'search finds an event by its actor name');
SELECT is((SELECT array_agg(id) FROM public.list_platform_activity(ARRAY['suspend_org','suspend_user'],ARRAY[]::text[],'dana whit',NULL,NULL,50,0)),ARRAY['f6a00000-0000-4000-8000-000000000202']::uuid[],'search finds the account a user event acted on by its profile name');
SELECT is((SELECT actor_email FROM public.list_platform_activity(ARRAY['suspend_org'],ARRAY[]::text[],NULL,NULL,NULL,50,0)),'Activity-Operator@example.test','the actor email arrives with the row');
SELECT is((SELECT actor_name FROM public.list_platform_activity(ARRAY['suspend_org'],ARRAY[]::text[],NULL,NULL,NULL,50,0)),'CPT Robert Cole','the actor name arrives with its rank');
SELECT is((SELECT actor_name FROM public.list_platform_activity(ARRAY['auth.login_failure'],ARRAY[]::text[],'activity-unnamed',NULL,NULL,50,0)),NULL,'a rank without a name is not a name');
SELECT is((SELECT actor_email FROM public.list_platform_activity(ARRAY[]::text[],ARRAY['admin.'],NULL,NULL,'2026-10-23T00:00:00Z',50,0) WHERE id='f6a00000-0000-4000-8000-000000000203'),NULL,'a system event has no actor account');
SELECT is((SELECT array_agg(id) FROM public.list_platform_activity(ARRAY['suspend_org','suspend_user'],ARRAY[]::text[],'alpha company',NULL,NULL,50,0)),ARRAY['f6a00000-0000-4000-8000-000000000201']::uuid[],'search finds the Organization name');
SELECT is((SELECT array_agg(id) FROM public.list_platform_activity(ARRAY['access_request.rejected'],ARRAY[]::text[],'100% request_',NULL,NULL,50,0)),ARRAY['f6a00000-0000-4000-8000-000000000205']::uuid[],'percent and underscore in a search match literally');
SELECT is((SELECT count(*)::integer FROM public.list_platform_activity(ARRAY['suspend_org','suspend_user'],ARRAY[]::text[],'%',NULL,NULL,50,0)),0,'a bare percent matches no text');
SELECT is((SELECT array_agg(id ORDER BY "timestamp" DESC) FROM public.list_platform_activity(ARRAY['suspend_org','suspend_user','access_request.rejected'],ARRAY['admin.'],NULL,'2026-10-21T00:00:00Z','2026-10-23T00:00:00Z',50,0)),
 ARRAY['f6a00000-0000-4000-8000-000000000203','f6a00000-0000-4000-8000-000000000202']::uuid[],'the range keeps its start and drops its end instant');
SELECT is((SELECT array_agg(id ORDER BY "timestamp" DESC) FROM public.list_platform_activity(ARRAY['suspend_org','suspend_user','access_request.rejected'],ARRAY['admin.'],NULL,NULL,NULL,2,2)),
 ARRAY['f6a00000-0000-4000-8000-000000000202','f6a00000-0000-4000-8000-000000000201']::uuid[],'the second page continues the order');
SELECT is((SELECT total_count FROM public.list_platform_activity(ARRAY['suspend_org','suspend_user','access_request.rejected'],ARRAY['admin.'],NULL,NULL,NULL,2,2) LIMIT 1),4::bigint,'every row carries the total');
SELECT is((SELECT array_agg(id ORDER BY "timestamp" DESC) FROM public.list_platform_activity(ARRAY['suspend_org','suspend_user','access_request.rejected'],ARRAY['admin.'],NULL,NULL,NULL,3,99)),
 ARRAY['f6a00000-0000-4000-8000-000000000201']::uuid[],'an offset past the end shows the last page');
SELECT is((SELECT page_offset FROM public.list_platform_activity(ARRAY['suspend_org','suspend_user','access_request.rejected'],ARRAY['admin.'],NULL,NULL,NULL,3,99) LIMIT 1),3,'the clamped offset comes back');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
