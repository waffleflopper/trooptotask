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
('d1803000-0000-4000-8000-000000000825','d1803000-0000-4000-8000-000000000101','d1803000-0000-4000-8000-000000000001','rating_scheme_entry','d1803000-0000-4000-8000-000000000701','pending')
) rows(id,organization_id,requested_by,resource_type,resource_id,status);
CREATE VIEW upgrade_fixture.deletion_request_cancellation_current_rows AS
SELECT 'auth.users'::text table_name,id::text row_id,to_jsonb(r) row_data
  FROM auth.users r WHERE id::text LIKE 'd1803000-%'
UNION ALL SELECT 'organizations',id::text,to_jsonb(r) - 'training_readiness_goal_percent' FROM public.organizations r WHERE id::text LIKE 'd1803000-%'
UNION ALL SELECT 'memberships',id::text,to_jsonb(r) FROM public.organization_memberships r WHERE organization_id::text LIKE 'd1803000-%'
UNION ALL SELECT 'personnel',id::text,to_jsonb(r) FROM public.personnel r WHERE id::text LIKE 'd1803000-%'
UNION ALL SELECT 'counseling_records',id::text,to_jsonb(r) - 'archived_by' - 'conducted_by' FROM public.counseling_records r WHERE id::text LIKE 'd1803000-%'
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
