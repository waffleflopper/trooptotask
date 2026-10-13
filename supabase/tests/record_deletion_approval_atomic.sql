BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('f4700000-0000-4000-8000-000000000001', 'record-approval-reviewer@example.test'),
  ('f4700000-0000-4000-8000-000000000002', 'record-approval-requester@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('f4700000-0000-4000-8000-000000000101', 'Record Approval A', 'f4700000-0000-4000-8000-000000000001'),
  ('f4700000-0000-4000-8000-000000000102', 'Record Approval B', 'f4700000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  ('f4700000-0000-4000-8000-000000000201', 'f4700000-0000-4000-8000-000000000101', 'SGT', 'Alpha', 'Person', 'record-approval-alpha'),
  ('f4700000-0000-4000-8000-000000000202', 'f4700000-0000-4000-8000-000000000102', 'SGT', 'Bravo', 'Person', 'record-approval-bravo');
INSERT INTO public.training_types (id, organization_id, name) VALUES
  ('f4700000-0000-4000-8000-000000000301', 'f4700000-0000-4000-8000-000000000101', 'Alpha retired course'),
  ('f4700000-0000-4000-8000-000000000302', 'f4700000-0000-4000-8000-000000000101', 'Alpha CLS'),
  ('f4700000-0000-4000-8000-000000000303', 'f4700000-0000-4000-8000-000000000102', 'Bravo CLS'),
  ('f4700000-0000-4000-8000-000000000304', 'f4700000-0000-4000-8000-000000000101', 'Alpha Range');
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date) VALUES
  ('f4700000-0000-4000-8000-000000000311', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000201', 'f4700000-0000-4000-8000-000000000302', '2030-01-01'),
  ('f4700000-0000-4000-8000-000000000312', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000201', 'f4700000-0000-4000-8000-000000000304', '2031-01-01'),
  ('f4700000-0000-4000-8000-000000000313', 'f4700000-0000-4000-8000-000000000102', 'f4700000-0000-4000-8000-000000000202', 'f4700000-0000-4000-8000-000000000303', '2030-01-01');
INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rater_person_id, rating_period_start, rating_period_end, status) VALUES
  ('f4700000-0000-4000-8000-000000000321', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000201', 'NCOER', 'f4700000-0000-4000-8000-000000000201', '2030-01-01', '2030-12-31', 'active'),
  ('f4700000-0000-4000-8000-000000000322', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000201', 'NCOER', 'f4700000-0000-4000-8000-000000000201', '2031-01-01', '2031-12-31', 'active'),
  ('f4700000-0000-4000-8000-000000000323', 'f4700000-0000-4000-8000-000000000102', 'f4700000-0000-4000-8000-000000000202', 'NCOER', 'f4700000-0000-4000-8000-000000000202', '2030-01-01', '2030-12-31', 'active');
INSERT INTO public.deletion_requests
  (id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description, status) VALUES
  ('f4700000-0000-4000-8000-000000000401', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000002', 'record-approval-requester@example.test', 'training_type', 'f4700000-0000-4000-8000-000000000301', 'Local type', 'pending'),
  ('f4700000-0000-4000-8000-000000000402', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000002', 'record-approval-requester@example.test', 'training_type', 'f4700000-0000-4000-8000-000000000303', 'Foreign type', 'pending'),
  ('f4700000-0000-4000-8000-000000000403', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000002', 'record-approval-requester@example.test', 'training_type', 'f4700000-0000-4000-8000-000000000399', 'Missing type', 'pending'),
  ('f4700000-0000-4000-8000-000000000411', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000002', 'record-approval-requester@example.test', 'personnel_training', 'f4700000-0000-4000-8000-000000000311', 'Local record', 'pending'),
  ('f4700000-0000-4000-8000-000000000412', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000002', 'record-approval-requester@example.test', 'personnel_training', 'f4700000-0000-4000-8000-000000000313', 'Foreign record', 'pending'),
  ('f4700000-0000-4000-8000-000000000413', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000002', 'record-approval-requester@example.test', 'personnel_training', 'f4700000-0000-4000-8000-000000000399', 'Missing record', 'pending'),
  ('f4700000-0000-4000-8000-000000000421', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000002', 'record-approval-requester@example.test', 'rating_scheme_entry', 'f4700000-0000-4000-8000-000000000321', 'Local entry', 'pending'),
  ('f4700000-0000-4000-8000-000000000422', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000002', 'record-approval-requester@example.test', 'rating_scheme_entry', 'f4700000-0000-4000-8000-000000000323', 'Foreign entry', 'pending'),
  ('f4700000-0000-4000-8000-000000000423', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000002', 'record-approval-requester@example.test', 'rating_scheme_entry', 'f4700000-0000-4000-8000-000000000399', 'Missing entry', 'pending'),
  ('f4700000-0000-4000-8000-000000000424', 'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000002', 'record-approval-requester@example.test', 'rating_scheme_entry', 'f4700000-0000-4000-8000-000000000322', 'Cancelled entry', 'cancelled');

SELECT ok(NOT has_function_privilege('authenticated',
  'public.approve_record_deletion_request(uuid, uuid, text, uuid, uuid, timestamptz)', 'EXECUTE'),
  'authenticated clients cannot call the privileged approval command');
SELECT ok(has_function_privilege('service_role',
  'public.approve_record_deletion_request(uuid, uuid, text, uuid, uuid, timestamptz)', 'EXECUTE'),
  'the server service role can call the approval command');

CREATE FUNCTION public.reject_record_approval_status_test() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'status write failed' USING ERRCODE = 'P0001';
END;
$$;
CREATE TRIGGER reject_record_approval_status_test
BEFORE UPDATE ON public.deletion_requests FOR EACH ROW
WHEN (NEW.id = 'f4700000-0000-4000-8000-000000000401')
EXECUTE FUNCTION public.reject_record_approval_status_test();

SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000401', 'training_type',
  'f4700000-0000-4000-8000-000000000301', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  'P0001', 'status write failed', 'a failed status write rejects the approval');
RESET ROLE;
SELECT is((SELECT status FROM public.deletion_requests WHERE id = 'f4700000-0000-4000-8000-000000000401'),
  'pending', 'a failed status write leaves the request pending');
SELECT is((SELECT count(*)::integer FROM public.training_types WHERE id = 'f4700000-0000-4000-8000-000000000301'),
  1, 'a failed status write keeps the Training type for a retry');
DROP TRIGGER reject_record_approval_status_test ON public.deletion_requests;

SET LOCAL ROLE service_role;
SELECT lives_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000401', 'training_type',
  'f4700000-0000-4000-8000-000000000301', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  'the Training type approval succeeds on retry');
SELECT throws_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000401', 'training_type',
  'f4700000-0000-4000-8000-000000000301', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  'P0002', 'Deletion target not found', 'a replayed approval finds nothing to delete');
SELECT lives_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000411', 'personnel_training',
  'f4700000-0000-4000-8000-000000000311', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  'a Training record approval deletes its record');
SELECT lives_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000421', 'rating_scheme_entry',
  'f4700000-0000-4000-8000-000000000321', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  'a Rating Scheme entry approval deletes its entry');

SELECT throws_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000402', 'training_type',
  'f4700000-0000-4000-8000-000000000303', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  'P0002', 'Deletion target not found', 'another Organization''s Training type cannot be approved');
SELECT throws_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000403', 'training_type',
  'f4700000-0000-4000-8000-000000000399', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  'P0002', 'Deletion target not found', 'a missing Training type cannot be approved');
SELECT throws_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000412', 'personnel_training',
  'f4700000-0000-4000-8000-000000000313', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  'P0002', 'Deletion target not found', 'another Organization''s Training record cannot be approved');
SELECT throws_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000413', 'personnel_training',
  'f4700000-0000-4000-8000-000000000399', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  'P0002', 'Deletion target not found', 'a missing Training record cannot be approved');
SELECT throws_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000422', 'rating_scheme_entry',
  'f4700000-0000-4000-8000-000000000323', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  'P0002', 'Deletion target not found', 'another Organization''s Rating Scheme entry cannot be approved');
SELECT throws_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000423', 'rating_scheme_entry',
  'f4700000-0000-4000-8000-000000000399', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  'P0002', 'Deletion target not found', 'a missing Rating Scheme entry cannot be approved');
SELECT throws_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000424', 'rating_scheme_entry',
  'f4700000-0000-4000-8000-000000000322', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  'P0002', 'Pending deletion request not found', 'a cancelled request cannot delete its entry');
SELECT throws_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000412', 'personnel_training',
  'f4700000-0000-4000-8000-000000000312', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  'P0002', 'Pending deletion request not found', 'a request cannot delete a record it does not name');
SELECT throws_ok($$ SELECT public.approve_record_deletion_request(
  'f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000412', 'personnel',
  'f4700000-0000-4000-8000-000000000201', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z') $$,
  '22023', 'Unsupported deletion resource type', 'Personnel archival is not a record deletion');
RESET ROLE;

SELECT results_eq(
  $$ SELECT id::text, status, reviewed_by::text, reviewed_at FROM public.deletion_requests
     WHERE organization_id = 'f4700000-0000-4000-8000-000000000101' ORDER BY id $$,
  $$ VALUES
    ('f4700000-0000-4000-8000-000000000401', 'approved', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z'::timestamptz),
    ('f4700000-0000-4000-8000-000000000402', 'pending', NULL, NULL),
    ('f4700000-0000-4000-8000-000000000403', 'pending', NULL, NULL),
    ('f4700000-0000-4000-8000-000000000411', 'approved', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z'::timestamptz),
    ('f4700000-0000-4000-8000-000000000412', 'pending', NULL, NULL),
    ('f4700000-0000-4000-8000-000000000413', 'pending', NULL, NULL),
    ('f4700000-0000-4000-8000-000000000421', 'approved', 'f4700000-0000-4000-8000-000000000001', '2030-02-01T00:00:00Z'::timestamptz),
    ('f4700000-0000-4000-8000-000000000422', 'pending', NULL, NULL),
    ('f4700000-0000-4000-8000-000000000423', 'pending', NULL, NULL),
    ('f4700000-0000-4000-8000-000000000424', 'cancelled', NULL, NULL) $$,
  'only approvals that deleted their target are approved');
SELECT results_eq(
  $$ SELECT id::text FROM public.training_types WHERE id::text LIKE 'f4700000-%'
     UNION ALL SELECT id::text FROM public.personnel_trainings WHERE id::text LIKE 'f4700000-%'
     UNION ALL SELECT id::text FROM public.rating_scheme_entries WHERE id::text LIKE 'f4700000-%'
     ORDER BY 1 $$,
  $$ VALUES
    ('f4700000-0000-4000-8000-000000000302'), ('f4700000-0000-4000-8000-000000000303'),
    ('f4700000-0000-4000-8000-000000000304'), ('f4700000-0000-4000-8000-000000000312'), ('f4700000-0000-4000-8000-000000000313'),
    ('f4700000-0000-4000-8000-000000000322'), ('f4700000-0000-4000-8000-000000000323') $$,
  'approvals delete only their own targets and leave B unchanged');

SELECT * FROM finish();
ROLLBACK;
