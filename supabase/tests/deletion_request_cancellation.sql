-- The only elevated operation is current-owner pending -> cancelled.
-- Snapshot comparisons include saved request metadata and source/file rows.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
-- Synthetic saved request history and source/file metadata, not stored byte proof.
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claim.role', '', false);
SELECT set_config('request.jwt.claims', '{}', false);
SELECT set_config('request.jwt', '', false);
INSERT INTO auth.users(id,email)
SELECT ('d1803000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'deletion-cancel-' || n || '@example.test' FROM generate_series(1,5) n;
INSERT INTO public.organizations(id,name,created_by) VALUES
('d1803000-0000-4000-8000-000000000101','Cancellation A','d1803000-0000-4000-8000-000000000003'),('d1803000-0000-4000-8000-000000000102','Cancellation B','d1803000-0000-4000-8000-000000000003');
INSERT INTO public.organization_memberships(
  organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
) VALUES
('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000001','member','viewer','{"personnel":"none","training":"none","ratingScheme":"none"}','groups',ARRAY[]::uuid[]),
('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000002','member','viewer','{}','organization',ARRAY[]::uuid[]),
('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000003','admin','viewer','{}','organization',ARRAY[]::uuid[]),
('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000005','member','viewer','{}','organization',ARRAY[]::uuid[]),
('d1803000-0000-4000-8000-000000000102','d1803000-0000-4000-8000-000000000001','member','viewer','{}','organization',ARRAY[]::uuid[]),
('d1803000-0000-4000-8000-000000000102','d1803000-0000-4000-8000-000000000003','owner','viewer','{}','organization',ARRAY[]::uuid[]);
INSERT INTO public.personnel(id,organization_id,rank,first_name,last_name,slug,archived_at) VALUES
('d1803000-0000-4000-8000-000000000301','d1803000-0000-4000-8000-000000000101','SGT','Saved','Alpha','deletion-cancel-alpha',NULL),
('d1803000-0000-4000-8000-000000000302','d1803000-0000-4000-8000-000000000102','SGT','Saved','Bravo','deletion-cancel-bravo','2030-01-02T03:04:05.678Z');
INSERT INTO public.counseling_records(
  id,organization_id,personnel_id,date_conducted,subject,title,uploaded_by,file_path,notes
) VALUES
('d1803000-0000-4000-8000-000000000401','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000301','2030-01-01','Sensitive A','Saved A','fixture','d1803000-0000-4000-8000-000000000101/counseling-records/d1803000-0000-4000-8000-000000000301/saved.pdf','Retained A'),
('d1803000-0000-4000-8000-000000000402','d1803000-0000-4000-8000-000000000102','d1803000-0000-4000-8000-000000000302','2030-01-02','Sensitive B','Saved B','fixture','d1803000-0000-4000-8000-000000000102/counseling-records/d1803000-0000-4000-8000-000000000302/saved.pdf','Retained B');
INSERT INTO public.training_types(id,organization_id,name,expiration_months,description) VALUES
('d1803000-0000-4000-8000-000000000501','d1803000-0000-4000-8000-000000000101','Saved Training A',12,'Retained type A'),
('d1803000-0000-4000-8000-000000000502','d1803000-0000-4000-8000-000000000102','Saved Training B',NULL,'Retained type B');
INSERT INTO public.personnel_trainings(
  id,organization_id,personnel_id,training_type_id,completion_date,expiration_date,notes
) VALUES
('d1803000-0000-4000-8000-000000000601','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000301','d1803000-0000-4000-8000-000000000501','2030-01-03','2031-01-03','Saved completion A'),
('d1803000-0000-4000-8000-000000000602','d1803000-0000-4000-8000-000000000102','d1803000-0000-4000-8000-000000000302','d1803000-0000-4000-8000-000000000502',NULL,NULL,'Saved completion B');
INSERT INTO public.rating_scheme_entries(
  id,organization_id,rated_person_id,eval_type,rating_period_start,rating_period_end,notes
) VALUES
('d1803000-0000-4000-8000-000000000701','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000301','NCOER','2030-01-01','2030-12-31','Saved Rating A'),
('d1803000-0000-4000-8000-000000000702','d1803000-0000-4000-8000-000000000102','d1803000-0000-4000-8000-000000000302','NCOER','2030-01-02','2030-12-30','Saved Rating B');
INSERT INTO storage.objects(id,bucket_id,name,owner,owner_id,metadata) VALUES
('d1803000-0000-4000-8000-000000000901','counseling-files','d1803000-0000-4000-8000-000000000101/counseling-records/d1803000-0000-4000-8000-000000000301/saved.pdf','d1803000-0000-4000-8000-000000000001','d1803000-0000-4000-8000-000000000001','{"size":123,"mimetype":"application/pdf","fixture":"A"}'),
('d1803000-0000-4000-8000-000000000902','counseling-files','d1803000-0000-4000-8000-000000000102/counseling-records/d1803000-0000-4000-8000-000000000302/saved.pdf','d1803000-0000-4000-8000-000000000001','d1803000-0000-4000-8000-000000000001','{"size":456,"mimetype":"application/pdf","fixture":"B"}');
INSERT INTO public.deletion_requests(
  id,organization_id,requested_by,requested_by_email,resource_type,resource_id,
  resource_description,resource_url,status,reviewed_by,reviewed_at,denial_reason,created_at
)
SELECT id::uuid,organization_id::uuid,requested_by::uuid,
  'saved-' || requested_by || '@example.test',resource_type,resource_id::uuid,
  'Saved request ' || id,'/org/' || organization_id || '/personnel',status,
  CASE WHEN status IN ('approved','denied') THEN 'd1803000-0000-4000-8000-000000000003'::uuid ELSE NULL END,
  CASE WHEN status IN ('approved','denied') THEN '2030-02-03T04:05:06.789Z'::timestamptz ELSE NULL END,
  CASE WHEN status='denied' THEN 'Original denial reason' ELSE 'Retained request context' END,
  '2030-01-01T00:00:00.123Z'::timestamptz
FROM (VALUES
('d1803000-0000-4000-8000-000000000801','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000001','personnel','d1803000-0000-4000-8000-000000000301','pending'),
('d1803000-0000-4000-8000-000000000802','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000001','personnel','d1803000-0000-4000-8000-000000000301','approved'),
('d1803000-0000-4000-8000-000000000803','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000001','counseling_record','d1803000-0000-4000-8000-000000000401','denied'),
('d1803000-0000-4000-8000-000000000804','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000001','rating_scheme_entry','d1803000-0000-4000-8000-000000000701','cancelled'),
('d1803000-0000-4000-8000-000000000805','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000002','personnel','d1803000-0000-4000-8000-000000000301','pending'),
('d1803000-0000-4000-8000-000000000806','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000003','personnel','d1803000-0000-4000-8000-000000000301','pending'),
('d1803000-0000-4000-8000-000000000807','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000004','personnel','d1803000-0000-4000-8000-000000000301','pending'),
('d1803000-0000-4000-8000-000000000808','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000005','personnel','d1803000-0000-4000-8000-000000000301','pending'),
('d1803000-0000-4000-8000-000000000811','d1803000-0000-4000-8000-000000000102','d1803000-0000-4000-8000-000000000001','personnel','d1803000-0000-4000-8000-000000000302','pending'),
('d1803000-0000-4000-8000-000000000812','d1803000-0000-4000-8000-000000000102','d1803000-0000-4000-8000-000000000001','personnel','d1803000-0000-4000-8000-000000000302','approved'),
('d1803000-0000-4000-8000-000000000813','d1803000-0000-4000-8000-000000000102','d1803000-0000-4000-8000-000000000001','counseling_record','d1803000-0000-4000-8000-000000000402','denied'),
('d1803000-0000-4000-8000-000000000814','d1803000-0000-4000-8000-000000000102','d1803000-0000-4000-8000-000000000001','rating_scheme_entry','d1803000-0000-4000-8000-000000000702','cancelled'),
('d1803000-0000-4000-8000-000000000821','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000001','personnel','d1803000-0000-4000-8000-000000000301','pending'),
('d1803000-0000-4000-8000-000000000822','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000001','counseling_record','d1803000-0000-4000-8000-000000000401','pending'),
('d1803000-0000-4000-8000-000000000823','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000001','training_type','d1803000-0000-4000-8000-000000000501','pending'),
('d1803000-0000-4000-8000-000000000824','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000001','personnel_training','d1803000-0000-4000-8000-000000000601','pending'),
('d1803000-0000-4000-8000-000000000825','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000001','rating_scheme_entry','d1803000-0000-4000-8000-000000000701','pending'),
-- Retained history can outlive its source; Personnel 399 was never inserted.
('d1803000-0000-4000-8000-000000000826','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000001','personnel','d1803000-0000-4000-8000-000000000399','pending')
) rows(id,organization_id,requested_by,resource_type,resource_id,status);
CREATE VIEW upgrade_fixture.deletion_request_cancellation_current_rows AS
SELECT 'auth.users'::text table_name,id::text row_id,to_jsonb(r) row_data
  FROM auth.users r WHERE id::text LIKE 'd1803000-%'
UNION ALL SELECT 'organizations',id::text,to_jsonb(r) FROM public.organizations r WHERE id::text LIKE 'd1803000-%'
UNION ALL SELECT 'memberships',id::text,to_jsonb(r) FROM public.organization_memberships r WHERE organization_id::text LIKE 'd1803000-%'
UNION ALL SELECT 'personnel',id::text,to_jsonb(r) FROM public.personnel r WHERE id::text LIKE 'd1803000-%'
UNION ALL SELECT 'counseling_records',id::text,to_jsonb(r) FROM public.counseling_records r WHERE id::text LIKE 'd1803000-%'
UNION ALL SELECT 'training_types',id::text,to_jsonb(r) FROM public.training_types r WHERE id::text LIKE 'd1803000-%'
UNION ALL SELECT 'personnel_trainings',id::text,to_jsonb(r) FROM public.personnel_trainings r WHERE id::text LIKE 'd1803000-%'
UNION ALL SELECT 'rating_scheme_entries',id::text,to_jsonb(r) FROM public.rating_scheme_entries r WHERE id::text LIKE 'd1803000-%'
UNION ALL SELECT 'deletion_requests',id::text,to_jsonb(r) FROM public.deletion_requests r WHERE id::text LIKE 'd1803000-%'
UNION ALL SELECT 'storage.objects',id::text,to_jsonb(r) FROM storage.objects r WHERE id::text LIKE 'd1803000-%';
CREATE TABLE upgrade_fixture.deletion_request_cancellation_before_rows AS
  SELECT * FROM upgrade_fixture.deletion_request_cancellation_current_rows;
CREATE TEMP TABLE cancellation_direct_update(count integer);
GRANT INSERT ON cancellation_direct_update TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1803000-0000-4000-8000-000000000001',false);
WITH changed AS (
  UPDATE public.deletion_requests SET status='cancelled' WHERE id='d1803000-0000-4000-8000-000000000801' RETURNING id
) INSERT INTO cancellation_direct_update SELECT count(*)::integer FROM changed;
RESET ROLE;
CREATE TABLE upgrade_fixture.deletion_request_cancellation_baseline AS
SELECT NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261003000100') migration_absent,
  to_regprocedure('public.cancel_own_deletion_request(uuid,uuid)') IS NULL rpc_absent,
  (SELECT count FROM cancellation_direct_update) direct_update_count;
DROP TABLE cancellation_direct_update;
SELECT set_config('request.jwt.claim.sub','',false);

SELECT is((SELECT direct_update_count FROM upgrade_fixture.deletion_request_cancellation_baseline),0,
  'ordinary requester still has no direct request UPDATE');
SELECT ok(has_function_privilege('authenticated','public.cancel_own_deletion_request(uuid,uuid)','EXECUTE'),
  'ordinary authenticated callers can invoke cancellation');
SELECT ok(NOT has_function_privilege('anon','public.cancel_own_deletion_request(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.cancel_own_deletion_request(uuid,uuid)','EXECUTE'),
  'anonymous and service roles cannot invoke cancellation');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(p.proacl) a
  WHERE p.oid='public.cancel_own_deletion_request(uuid,uuid)'::regprocedure AND a.grantee=0),
  'PUBLIC has no cancellation grant');
SELECT ok((SELECT provolatile='v' AND prosecdef AND proconfig=ARRAY['search_path=""']::text[]
  AND pronargs=2 AND proargnames=ARRAY['p_organization_id','p_request_id']::text[]
  FROM pg_proc WHERE oid='public.cancel_own_deletion_request(uuid,uuid)'::regprocedure),
  'volatile definer has an empty search path and accepts no actor or status');

SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000801') $$,
  '42501',NULL,'anonymous invocation is denied by grants');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000801') $$,
  '42501',NULL,'service role invocation is denied by grants');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000801') $$,
  '42501','Deletion request cancellation is not allowed','missing identity cannot cancel');
SELECT set_config('request.jwt.claim.sub','d1803000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000805') $$,
  'P0002','Pending deletion request not found','another ordinary requester is concealed');
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000811') $$,
  'P0002','Pending deletion request not found','dual membership cannot treat a B request as an A target');
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000102','d1803000-0000-4000-8000-000000000801') $$,
  'P0002','Pending deletion request not found','dual membership cannot treat an A request as a B target');
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000899') $$,
  'P0002','Pending deletion request not found','missing request has the concealed-target error');
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request(NULL,'d1803000-0000-4000-8000-000000000801') $$,
  'P0002','Pending deletion request not found','null organization identifies no target');
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101',NULL) $$,
  'P0002','Pending deletion request not found','null request identifies no target');
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000802') $$,
  'P0002','Pending deletion request not found','approved history cannot be cancelled');
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000803') $$,
  'P0002','Pending deletion request not found','denied history cannot be cancelled');
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000804') $$,
  'P0002','Pending deletion request not found','cancelled history cannot be cancelled again');
SELECT set_config('request.jwt.claim.sub','d1803000-0000-4000-8000-000000000003',true);
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000801') $$,
  'P0002','Pending deletion request not found','an administrator cannot use the owned command for a peer');
SELECT set_config('request.jwt.claim.sub','d1803000-0000-4000-8000-000000000004',true);
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000807') $$,
  '42501','Deletion request cancellation is not allowed','saved requester without current membership cannot cancel');
RESET ROLE;

INSERT INTO public.user_suspensions(user_id,suspended_by,reason) VALUES('d1803000-0000-4000-8000-000000000005','d1803000-0000-4000-8000-000000000003','Cancellation test suspension');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1803000-0000-4000-8000-000000000005',true);
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000808') $$,
  '42501','Deletion request cancellation is not allowed','suspended current requester cannot cancel');
RESET ROLE;
DELETE FROM public.user_suspensions WHERE user_id='d1803000-0000-4000-8000-000000000005';
UPDATE public.organizations SET suspended_at='2030-04-01T00:00:00Z' WHERE id='d1803000-0000-4000-8000-000000000101';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1803000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000801') $$,
  '42501','Deletion request cancellation is not allowed','suspended organization cannot be changed');
RESET ROLE;
UPDATE public.organizations SET suspended_at=NULL WHERE id='d1803000-0000-4000-8000-000000000101';

CREATE TEMP TABLE raw_updates(count integer);
GRANT INSERT ON raw_updates TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1803000-0000-4000-8000-000000000001',true);
WITH changed AS (
  UPDATE public.deletion_requests SET status='approved',requested_by='d1803000-0000-4000-8000-000000000003',resource_description='Unauthorized edit'
  WHERE id='d1803000-0000-4000-8000-000000000801' RETURNING id
) INSERT INTO raw_updates SELECT count(*)::integer FROM changed;
RESET ROLE;
SELECT is((SELECT count FROM raw_updates),0,
  'the narrow RPC does not grant arbitrary status, actor or description UPDATE');

SELECT is((SELECT count(*) FROM public.personnel WHERE id='d1803000-0000-4000-8000-000000000399'),0::bigint,
  'the saved missing-source request has no exact Personnel target even under privileged readback');

-- Force an actual database write failure, rather than mock a response.
CREATE FUNCTION pg_temp.fail_cancel_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Cancellation status write failed' USING ERRCODE='P0001'; END; $$;
CREATE TRIGGER cancellation_test_failure BEFORE UPDATE ON public.deletion_requests
FOR EACH ROW WHEN (OLD.id='d1803000-0000-4000-8000-000000000801'::uuid AND NEW.status='cancelled')
EXECUTE FUNCTION pg_temp.fail_cancel_write();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1803000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000801') $$,
  'P0001','Cancellation status write failed','SQL write failure propagates without a success acknowledgement');
RESET ROLE;
DROP TRIGGER cancellation_test_failure ON public.deletion_requests;
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.deletion_request_cancellation_current_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.deletion_request_cancellation_before_rows ORDER BY table_name,row_id $$,
  'all rejection and failed-write cases preserve every saved request, source and file field');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1803000-0000-4000-8000-000000000001',true);
SELECT is(public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000801'),true,
  'ordinary identity cancellation works despite no feature capabilities and empty group scope');
SELECT is(public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000821'),true,'Personnel request cancellation is acknowledged');
SELECT is(public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000822'),true,'Counseling request cancellation is acknowledged');
SELECT is(public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000823'),true,'Training type request cancellation is acknowledged');
SELECT is(public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000824'),true,'Completion request cancellation is acknowledged');
SELECT is(public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000825'),true,'Rating request cancellation is acknowledged');
SELECT is(public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000826'),true,
  'current requester can cancel saved pending history whose exact Personnel source never existed');
SELECT throws_ok($$ SELECT public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000801') $$,
  'P0002','Pending deletion request not found','duplicate cancellation cannot acknowledge a second transition');
SELECT set_config('request.jwt.claim.sub','d1803000-0000-4000-8000-000000000003',true);
SELECT is(public.cancel_own_deletion_request('d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000806'),true,
  'an administrator retains supported cancellation of their own request');
RESET ROLE;
SELECT results_eq(
  $$ SELECT row_id,row_data FROM upgrade_fixture.deletion_request_cancellation_current_rows
    WHERE table_name='deletion_requests' ORDER BY row_id $$,
  $$ SELECT row_id,CASE WHEN row_id IN ('d1803000-0000-4000-8000-000000000801','d1803000-0000-4000-8000-000000000806','d1803000-0000-4000-8000-000000000821','d1803000-0000-4000-8000-000000000822','d1803000-0000-4000-8000-000000000823','d1803000-0000-4000-8000-000000000824','d1803000-0000-4000-8000-000000000825','d1803000-0000-4000-8000-000000000826')
      THEN row_data||'{"status":"cancelled"}'::jsonb ELSE row_data END
    FROM upgrade_fixture.deletion_request_cancellation_before_rows
    WHERE table_name='deletion_requests' ORDER BY row_id $$,
  'only the owned pending status changes; every saved requester, resource and review field is retained');
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.deletion_request_cancellation_current_rows
    WHERE table_name<>'deletion_requests' ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.deletion_request_cancellation_before_rows
    WHERE table_name<>'deletion_requests' ORDER BY table_name,row_id $$,
  'cancellation retains exact A/B identities, memberships, all source rows and file metadata');
SELECT * FROM finish();
ROLLBACK;
