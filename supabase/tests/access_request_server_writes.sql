BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email,created_at) VALUES
 ('e8690000-0000-4000-8000-000000000301','operator-inbox@example.test',now()),
 ('e8690000-0000-4000-8000-000000000302','ordinary-inbox@example.test',now());
INSERT INTO public.platform_operators(user_id) VALUES ('e8690000-0000-4000-8000-000000000301');
INSERT INTO public.access_requests(id,email,name,status) VALUES
 ('e8690000-0000-4000-8000-000000000311','inbox-request@example.test','Synthetic inbox request','pending');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e8690000-0000-4000-8000-000000000302',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT throws_ok($$INSERT INTO public.access_requests(email,name) VALUES ('forged@example.test','Forged')$$,'42501',NULL,'a signed-in non-operator cannot file a request directly');
SELECT throws_ok($$UPDATE public.access_requests SET status='approved' WHERE id='e8690000-0000-4000-8000-000000000311'$$,'42501',NULL,'a signed-in non-operator cannot approve a request directly');
SELECT throws_ok($$DELETE FROM public.access_requests WHERE id='e8690000-0000-4000-8000-000000000311'$$,'42501',NULL,'a signed-in non-operator cannot delete a request directly');
SELECT is((SELECT count(*)::integer FROM public.access_requests),0,'a non-operator still reads no requests');
SELECT throws_ok($$SELECT public.platform_inbox_stats(now())$$,'42501',NULL,'a non-operator cannot call the Inbox stats reader');
SELECT set_config('request.jwt.claim.sub','e8690000-0000-4000-8000-000000000301',true);
SELECT is((SELECT count(*)::integer FROM public.access_requests WHERE id='e8690000-0000-4000-8000-000000000311'),1,'the operator reads the request');
SELECT throws_ok($$UPDATE public.access_requests SET status='approved', reviewed_by='e8690000-0000-4000-8000-000000000301' WHERE id='e8690000-0000-4000-8000-000000000311'$$,'42501',NULL,'the operator session cannot approve or set the reviewer directly');
SELECT throws_ok($$UPDATE public.access_requests SET status='rejected' WHERE id='e8690000-0000-4000-8000-000000000311'$$,'42501',NULL,'the operator session cannot reject directly');
SELECT throws_ok($$INSERT INTO public.access_requests(email,name,status) VALUES ('direct@example.test','Direct','approved')$$,'42501',NULL,'the operator session cannot insert a request directly');
SELECT throws_ok($$DELETE FROM public.access_requests WHERE id='e8690000-0000-4000-8000-000000000311'$$,'42501',NULL,'the operator session cannot delete a request directly');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SELECT throws_ok($$INSERT INTO public.access_requests(email,name) VALUES ('anon@example.test','Anon')$$,'42501',NULL,'an anonymous client cannot file a request directly');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT cmp_ok((SELECT (public.platform_inbox_stats(now() - interval '1 hour')->>'newPeople')::integer),'>=',2,'the server counts people created since the cutoff');
SELECT is((SELECT (public.platform_inbox_stats(now() + interval '1 hour')->>'newPeople')::integer),0,'the cutoff excludes earlier people');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
