BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id,email) VALUES ('e1360000-0000-4000-8000-000000000001','personnel-retention-sql@example.test');
INSERT INTO public.organizations (id,name,created_by) VALUES
 ('e1360000-0000-4000-8000-000000000101','Personnel Retention A','e1360000-0000-4000-8000-000000000001'),
 ('e1360000-0000-4000-8000-000000000102','Personnel Retention B','e1360000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (id,organization_id,rank,first_name,last_name,slug,archived_at) VALUES
 ('e1360000-0000-4000-8000-000000000301','e1360000-0000-4000-8000-000000000101','SGT','Expired','Selected','retention-sql-expired','2020-01-01Z'),
 ('e1360000-0000-4000-8000-000000000302','e1360000-0000-4000-8000-000000000101','SGT','Restored','Candidate','retention-sql-restored','2020-01-01Z'),
 ('e1360000-0000-4000-8000-000000000303','e1360000-0000-4000-8000-000000000101','SGT','Recent','Sentinel','retention-sql-recent','2026-01-01Z'),
 ('e1360000-0000-4000-8000-000000000304','e1360000-0000-4000-8000-000000000101','SGT','Cutoff','Sentinel','retention-sql-cutoff','2025-05-30T12:00:00Z'),
 ('e1360000-0000-4000-8000-000000000305','e1360000-0000-4000-8000-000000000102','SGT','Foreign','Sentinel','retention-sql-foreign','2020-01-01Z'),
 ('e1360000-0000-4000-8000-000000000306','e1360000-0000-4000-8000-000000000101','SGT','Unselected','Expired','retention-sql-unselected','2020-01-01Z'),
 ('e1360000-0000-4000-8000-000000000307','e1360000-0000-4000-8000-000000000101','SGT','Rated','Active','retention-sql-rated',NULL);
-- Candidate discovery preceded a restore. Eligibility must be rechecked by the DELETE.
UPDATE public.personnel SET archived_at=NULL WHERE id='e1360000-0000-4000-8000-000000000302';
INSERT INTO public.personnel_documents (id,organization_id,personnel_id,title,file_path,uploaded_by) VALUES
 ('e1360000-0000-4000-8000-000000000401','e1360000-0000-4000-8000-000000000101','e1360000-0000-4000-8000-000000000301','Active child','synthetic/retention/document.pdf','fixture'),
 ('e1360000-0000-4000-8000-000000000402','e1360000-0000-4000-8000-000000000102','e1360000-0000-4000-8000-000000000305','Foreign child','synthetic/retention/foreign.pdf','fixture');
INSERT INTO public.counseling_records (id,organization_id,personnel_id,date_conducted,subject,title,file_path,uploaded_by,archived_at) VALUES
 ('e1360000-0000-4000-8000-000000000411','e1360000-0000-4000-8000-000000000101','e1360000-0000-4000-8000-000000000301','2026-01-01','Recent child','Recent child','synthetic/retention/counseling.pdf','fixture','2026-01-01Z');
INSERT INTO public.leader_notes (id,organization_id,personnel_id,author,text) VALUES
 ('e1360000-0000-4000-8000-000000000421','e1360000-0000-4000-8000-000000000101','e1360000-0000-4000-8000-000000000301','Synthetic','Active cascade note');
INSERT INTO public.personnel_follow_ups (id,organization_id,personnel_id,title,status,created_by) VALUES
 ('e1360000-0000-4000-8000-000000000431','e1360000-0000-4000-8000-000000000101','e1360000-0000-4000-8000-000000000301','Open cascade follow-up','open','e1360000-0000-4000-8000-000000000001');
INSERT INTO public.rating_scheme_entries (id,organization_id,rated_person_id,eval_type,rater_person_id,senior_rater_person_id,intermediate_rater_person_id,reviewer_person_id,rater_name,senior_rater_name,intermediate_rater_name,reviewer_name,rating_period_start,rating_period_end,status,notes) VALUES
 ('e1360000-0000-4000-8000-000000000601','e1360000-0000-4000-8000-000000000101','e1360000-0000-4000-8000-000000000307','NCOER','e1360000-0000-4000-8000-000000000301','e1360000-0000-4000-8000-000000000301','e1360000-0000-4000-8000-000000000301','e1360000-0000-4000-8000-000000000301','Retained Rater','Retained Senior','Retained Intermediate','Retained Reviewer','2026-01-01','2026-12-31','active','Retained evaluation facts');
CREATE TEMP TABLE retention_personnel_before AS SELECT id,to_jsonb(p) row_data FROM public.personnel p WHERE organization_id IN
 ('e1360000-0000-4000-8000-000000000101','e1360000-0000-4000-8000-000000000102');
CREATE TEMP TABLE retention_evaluation_before AS SELECT to_jsonb(e) row_data FROM public.rating_scheme_entries e WHERE id='e1360000-0000-4000-8000-000000000601';

SELECT ok(NOT has_function_privilege('anon','public.delete_expired_personnel(uuid,uuid[],timestamptz)','EXECUTE'),'anonymous role cannot execute Personnel retention');
SELECT ok(NOT has_function_privilege('authenticated','public.delete_expired_personnel(uuid,uuid[],timestamptz)','EXECUTE'),'member role cannot execute Personnel retention');
SELECT ok(has_function_privilege('service_role','public.delete_expired_personnel(uuid,uuid[],timestamptz)','EXECUTE'),'service role can execute Personnel retention');
SELECT ok(NOT prosecdef AND proconfig @> ARRAY['search_path=""'],'retention is invoker-only with an empty search path') FROM pg_proc WHERE oid='public.delete_expired_personnel(uuid,uuid[],timestamptz)'::regprocedure;
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.delete_expired_personnel('e1360000-0000-4000-8000-000000000101',ARRAY[]::uuid[],'2025-05-30T12:00:00Z') $$,'42501',NULL,'anonymous execution actually rejects');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.delete_expired_personnel('e1360000-0000-4000-8000-000000000101',ARRAY[]::uuid[],'2025-05-30T12:00:00Z') $$,'42501',NULL,'authenticated execution actually rejects');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT public.delete_expired_personnel(NULL,ARRAY[]::uuid[],'2025-05-30T12:00:00Z') $$,'22023',NULL,'a NULL Organization is rejected');
SELECT throws_ok($$ SELECT public.delete_expired_personnel('e1360000-0000-4000-8000-000000000101',NULL,'2025-05-30T12:00:00Z') $$,'22023',NULL,'NULL candidate IDs are rejected');
SELECT throws_ok($$ SELECT public.delete_expired_personnel('e1360000-0000-4000-8000-000000000101',ARRAY[]::uuid[],NULL) $$,'22023',NULL,'a NULL cutoff is rejected');
SELECT is(public.delete_expired_personnel('e1360000-0000-4000-8000-000000000101',ARRAY[]::uuid[],'2025-05-30T12:00:00Z'),0,'empty candidates have no effect');
RESET ROLE;
SELECT results_eq($$ SELECT id,to_jsonb(p) FROM public.personnel p WHERE organization_id IN ('e1360000-0000-4000-8000-000000000101','e1360000-0000-4000-8000-000000000102') ORDER BY id $$,$$ SELECT * FROM retention_personnel_before ORDER BY id $$,'denied, invalid and empty calls retain every parent field');

SET LOCAL ROLE service_role;
SELECT is(public.delete_expired_personnel('e1360000-0000-4000-8000-000000000101',ARRAY[
 'e1360000-0000-4000-8000-000000000301','e1360000-0000-4000-8000-000000000301',
 'e1360000-0000-4000-8000-000000000302','e1360000-0000-4000-8000-000000000303',
 'e1360000-0000-4000-8000-000000000304','e1360000-0000-4000-8000-000000000305',
 'e1360000-0000-4000-8000-000000000307','e1360000-0000-4000-8000-000000000399']::uuid[],'2025-05-30T12:00:00Z'),1,'duplicates count once while restored, active, recent, cutoff, foreign and missing rows are excluded');
SET CONSTRAINTS ALL IMMEDIATE;
RESET ROLE;
SELECT results_eq($$ SELECT id,to_jsonb(p) FROM public.personnel p WHERE organization_id IN ('e1360000-0000-4000-8000-000000000101','e1360000-0000-4000-8000-000000000102') ORDER BY id $$,$$ SELECT * FROM retention_personnel_before WHERE id<>'e1360000-0000-4000-8000-000000000301' ORDER BY id $$,'every retained parent keeps its identity, timestamp and other fields');
SELECT is((SELECT count(*)::integer FROM public.personnel_documents WHERE id='e1360000-0000-4000-8000-000000000401'),0,'active document metadata cascades');
SELECT is((SELECT count(*)::integer FROM public.counseling_records WHERE id='e1360000-0000-4000-8000-000000000411'),0,'recent counseling metadata cascades');
SELECT is((SELECT count(*)::integer FROM public.leader_notes WHERE id='e1360000-0000-4000-8000-000000000421'),0,'active leader-note metadata cascades');
SELECT is((SELECT count(*)::integer FROM public.personnel_follow_ups WHERE id='e1360000-0000-4000-8000-000000000431'),0,'open follow-up metadata cascades');
SELECT is((SELECT count(*)::integer FROM public.personnel_documents WHERE id='e1360000-0000-4000-8000-000000000402'),1,'foreign child metadata remains');
SELECT ok(rater_person_id IS NULL AND senior_rater_person_id IS NULL AND intermediate_rater_person_id IS NULL AND reviewer_person_id IS NULL,'all four local evaluator references clear') FROM public.rating_scheme_entries WHERE id='e1360000-0000-4000-8000-000000000601';
SELECT results_eq($$ SELECT to_jsonb(e)-ARRAY['rater_person_id','senior_rater_person_id','intermediate_rater_person_id','reviewer_person_id','updated_at'] FROM public.rating_scheme_entries e WHERE id='e1360000-0000-4000-8000-000000000601' $$,$$ SELECT row_data-ARRAY['rater_person_id','senior_rater_person_id','intermediate_rater_person_id','reviewer_person_id','updated_at'] FROM retention_evaluation_before $$,'every other Evaluation name, date and fact is preserved');
SELECT ok(updated_at >= (SELECT (row_data->>'updated_at')::timestamptz FROM retention_evaluation_before),'Evaluation update time remains monotonic') FROM public.rating_scheme_entries WHERE id='e1360000-0000-4000-8000-000000000601';

INSERT INTO public.personnel (id,organization_id,rank,first_name,last_name,slug,archived_at)
 SELECT ('e1361000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'e1360000-0000-4000-8000-000000000101','SPC','Bulk','Retention'||n,'retention-sql-bulk-'||n,'2020-01-01Z'::timestamptz FROM generate_series(1,1001) n;
SET LOCAL ROLE service_role;
SELECT is(public.delete_expired_personnel('e1360000-0000-4000-8000-000000000101',(SELECT array_agg(id) FROM public.personnel WHERE organization_id='e1360000-0000-4000-8000-000000000101' AND slug LIKE 'retention-sql-bulk-%'),'2025-05-30T12:00:00Z'),1001,'the actual parent count exceeds the provider returned-row cap');
SELECT is(public.delete_expired_personnel('e1360000-0000-4000-8000-000000000101',ARRAY['e1360000-0000-4000-8000-000000000301']::uuid[],'2025-05-30T12:00:00Z'),0,'replay reports zero new deletions');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.personnel WHERE organization_id='e1360000-0000-4000-8000-000000000101' AND slug LIKE 'retention-sql-bulk-%'),0,'all 1001 selected parent IDs are absent');
SELECT results_eq($$ SELECT id,to_jsonb(p) FROM public.personnel p WHERE organization_id IN ('e1360000-0000-4000-8000-000000000101','e1360000-0000-4000-8000-000000000102') ORDER BY id $$,$$ SELECT * FROM retention_personnel_before WHERE id<>'e1360000-0000-4000-8000-000000000301' ORDER BY id $$,'bulk deletion and replay leave every other parent exact');
SELECT * FROM finish();
ROLLBACK;
