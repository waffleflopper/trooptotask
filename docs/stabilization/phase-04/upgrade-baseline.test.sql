-- Run against upgrade-fixture.sql, before and after D02's future migration.
-- No commercial object is referenced: these are retained-data/access expectations.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT clinic_role FROM public.personnel WHERE id='c4010000-0000-4000-8000-000000000014'),'Respiratory Therapist','Personnel Duty Role survives');
SELECT is((SELECT normalized_email FROM public.organization_invitations WHERE id='c4010000-0000-4000-8000-000000000031'),'phase04-pending@example.test','pending invitation normalization survives');
SELECT ok((SELECT status='blocked' AND blocked_by='c4010000-0000-4000-8000-000000000001' AND blocked_at='2035-01-10Z' FROM public.organization_invitations WHERE id='c4010000-0000-4000-8000-000000000032'),'blocked invitation keeps its actor and timestamp');
SELECT ok((SELECT status='accepted' AND accepted_by='c4010000-0000-4000-8000-000000000007' FROM public.organization_invitations WHERE id='c4010000-0000-4000-8000-000000000033'),'accepted invitation keeps its identity');
SELECT is((SELECT raw_user_meta_data FROM auth.users WHERE id='c4010000-0000-4000-8000-000000000001'),'{"billing":"retained metadata","profile":{"source":"synthetic"}}'::jsonb,'commercial-looking user metadata is retained whole');
SELECT is((SELECT details FROM public.audit_logs WHERE id='c4010000-0000-4000-8000-000000000030'),'{"billing":{"historical":true},"retained":{"fileSizeBytes":4096}}'::jsonb,'shared audit JSON is retained whole');
SELECT ok((SELECT archive_retention_months=24 AND personnel_document_storage_cap_bytes=52428800 FROM public.organizations WHERE id='c4010000-0000-4000-8000-000000000008'),'retention and technical storage bounds survive');
SELECT is((SELECT suspended_at FROM public.organizations WHERE id='c4010000-0000-4000-8000-000000000010'),'2035-01-01Z'::timestamptz,'Organization suspension survives');
SELECT is((SELECT role FROM public.platform_admins WHERE id='c4010000-0000-4000-8000-000000000037'),'billing','stored platform billing identity is neither removed nor promoted');
SELECT results_eq($$ SELECT date,assignee_id FROM public.daily_assignments WHERE id IN ('c4010000-0000-4000-8000-000000000019','c4010000-0000-4000-8000-000000000020') ORDER BY id $$,
 $$ VALUES ('2035-01-10'::date,'c4010000-0000-4000-8000-000000000014'::text),('2035-01-10'::date,'c4010000-0000-4000-8000-000000000011'::text) $$,'saved person and Group assignments keep their facts');
SELECT ok((SELECT assignee_id='c4010000-0000-4000-8000-000000000015' AND duty_roster_template_run_id='c4010000-0000-4000-8000-000000000052' FROM public.daily_assignments WHERE id='c4010000-0000-4000-8000-000000000053'),'manually edited duty-origin saved fact survives billing retirement');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c4010000-0000-4000-8000-000000000002',true);
SELECT results_eq($$ SELECT id FROM public.daily_assignments ORDER BY id $$,
 $$ VALUES ('c4010000-0000-4000-8000-000000000019'::uuid),('c4010000-0000-4000-8000-000000000020'::uuid) $$,'Group operator sees only its saved person/Group assignments');
SELECT results_eq($$ SELECT id FROM public.personnel ORDER BY id $$,$$ VALUES ('c4010000-0000-4000-8000-000000000014'::uuid) $$,'Group operator sees only its Personnel');
SELECT results_eq($$ SELECT id FROM public.sign_in_rosters ORDER BY id $$,$$ VALUES ('c4010000-0000-4000-8000-000000000027'::uuid) $$,'Group operator sees its independent signed roster only');
WITH changed AS (UPDATE public.daily_assignments SET date='2035-01-15' WHERE id='c4010000-0000-4000-8000-000000000021' RETURNING id)
SELECT is(count(*)::integer,0,'Group operator cannot update hidden assignment') FROM changed;
SELECT throws_ok($$ UPDATE public.daily_assignments SET assignee_id='c4010000-0000-4000-8000-000000000016' WHERE id='c4010000-0000-4000-8000-000000000019' $$,'42501',NULL,'operator cannot move its slot to foreign Personnel');
SELECT throws_ok($$ INSERT INTO public.data_exports(org_id,requested_by,status) VALUES ('c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000002','processing') $$,'42501',NULL,'Group operator cannot initiate Organization export');
WITH changed AS (UPDATE public.daily_assignments SET date='2035-01-15' WHERE id='c4010000-0000-4000-8000-000000000019' RETURNING date)
SELECT is((SELECT date FROM changed),'2035-01-15'::date,'operator can edit its allowed person slot');
WITH changed AS (UPDATE public.daily_assignments SET date='2035-01-15' WHERE id='c4010000-0000-4000-8000-000000000020' RETURNING date)
SELECT is((SELECT date FROM changed),'2035-01-15'::date,'operator can edit its allowed Group slot');
SELECT set_config('request.jwt.claim.sub','c4010000-0000-4000-8000-000000000003',true);
SELECT is((SELECT count(*)::integer FROM public.daily_assignments),0,'foreign owner cannot read Alpha Calendar');
SELECT is((SELECT count(*)::integer FROM public.sign_in_rosters),0,'foreign owner cannot read Alpha signed rosters');
SELECT is((SELECT count(*)::integer FROM public.data_exports),0,'foreign owner cannot read Alpha exports');
SELECT set_config('request.jwt.claim.sub','c4010000-0000-4000-8000-000000000001',true);
SELECT is((SELECT count(*)::integer FROM public.daily_assignments),4,'owner sees all four saved Organization assignments');
SELECT is((SELECT file_size_bytes FROM public.data_exports WHERE id='c4010000-0000-4000-8000-000000000029'),4096::bigint,'owner reads retained completed export');
SELECT throws_ok($$ INSERT INTO public.data_exports(org_id,requested_by,status) VALUES ('c4010000-0000-4000-8000-000000000009','c4010000-0000-4000-8000-000000000001','processing') $$,'42501',NULL,'owner export authority does not cross Organizations');
SELECT set_config('request.jwt.claim.sub','c4010000-0000-4000-8000-000000000006',true);
WITH changed AS (UPDATE public.data_exports SET file_size_bytes=8192 WHERE id='c4010000-0000-4000-8000-000000000029' RETURNING file_size_bytes)
SELECT is((SELECT file_size_bytes FROM changed),8192::bigint,'current Organization admin retains export lifecycle authority');
SELECT set_config('request.jwt.claim.sub','c4010000-0000-4000-8000-000000000004',true);
SELECT is(public.is_super_admin(),false,'stored billing identity has no super-admin authority');
WITH changed AS (UPDATE public.platform_admins SET role='super_admin' WHERE id='c4010000-0000-4000-8000-000000000037' RETURNING id)
SELECT is(count(*)::integer,0,'billing identity cannot promote itself') FROM changed;
SELECT set_config('request.jwt.claim.sub','c4010000-0000-4000-8000-000000000005',true);
SELECT is(public.is_user_suspended('c4010000-0000-4000-8000-000000000005'),true,'suspended actor can resolve own suspension');
SELECT set_config('request.jwt.claim.sub','c4010000-0000-4000-8000-000000000002',true);
SELECT is(public.is_user_suspended('c4010000-0000-4000-8000-000000000005'),false,'ordinary actor cannot inspect another user suspension');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SELECT is((SELECT count(*)::integer FROM public.daily_assignments),0,'anonymous actor sees no saved assignments');
SELECT is((SELECT count(*)::integer FROM public.sign_in_rosters),0,'anonymous actor sees no signed rosters');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
