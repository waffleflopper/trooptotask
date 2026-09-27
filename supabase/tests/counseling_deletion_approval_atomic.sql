BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'counseling-reviewer@example.test'),
  ('f1000000-0000-4000-8000-000000000002', 'counseling-requester@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('f1000000-0000-4000-8000-000000000101', 'Counseling Approval A', 'f1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000102', 'Counseling Approval B', 'f1000000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  ('f1000000-0000-4000-8000-000000000201', 'f1000000-0000-4000-8000-000000000101', 'SGT', 'Alpha', 'Person', 'counseling-approval-alpha'),
  ('f1000000-0000-4000-8000-000000000202', 'f1000000-0000-4000-8000-000000000102', 'SGT', 'Bravo', 'Person', 'counseling-approval-bravo');
INSERT INTO public.counseling_records
  (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path) VALUES
  ('f1000000-0000-4000-8000-000000000301', 'f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000201', '2030-01-01', 'Review A', 'Review A', 'fixture', NULL),
  ('f1000000-0000-4000-8000-000000000302', 'f1000000-0000-4000-8000-000000000102', 'f1000000-0000-4000-8000-000000000202', '2030-01-01', 'Review B', 'Review B', 'fixture', NULL),
  ('f1000000-0000-4000-8000-000000000303', 'f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000201', '2030-01-02', 'File changed', 'File changed', 'fixture', 'f1000000-0000-4000-8000-000000000101/counseling-records/f1000000-0000-4000-8000-000000000201/current.pdf');
INSERT INTO public.deletion_requests
  (id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description) VALUES
  ('f1000000-0000-4000-8000-000000000401', 'f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000002', 'counseling-requester@example.test', 'counseling_record', 'f1000000-0000-4000-8000-000000000301', 'Review A'),
  ('f1000000-0000-4000-8000-000000000402', 'f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000002', 'counseling-requester@example.test', 'counseling_record', 'f1000000-0000-4000-8000-000000000302', 'Foreign review'),
  ('f1000000-0000-4000-8000-000000000403', 'f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000002', 'counseling-requester@example.test', 'counseling_record', 'f1000000-0000-4000-8000-000000000399', 'Missing review'),
  ('f1000000-0000-4000-8000-000000000404', 'f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000002', 'counseling-requester@example.test', 'counseling_record', 'f1000000-0000-4000-8000-000000000303', 'Changed file review');

SELECT ok(NOT has_function_privilege('authenticated',
  'public.approve_counseling_deletion_request(uuid, uuid, uuid, uuid, timestamptz, text)', 'EXECUTE'),
  'authenticated clients cannot call the privileged approval command');
SELECT ok(has_function_privilege('service_role',
  'public.approve_counseling_deletion_request(uuid, uuid, uuid, uuid, timestamptz, text)', 'EXECUTE'),
  'the server service role can call the approval command');

CREATE FUNCTION public.reject_counseling_approval_status_test() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'status write failed' USING ERRCODE = 'P0001';
END;
$$;
CREATE TRIGGER reject_counseling_approval_status_test
BEFORE UPDATE ON public.deletion_requests FOR EACH ROW
WHEN (NEW.id = 'f1000000-0000-4000-8000-000000000401')
EXECUTE FUNCTION public.reject_counseling_approval_status_test();

SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT public.approve_counseling_deletion_request(
  'f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000401',
  'f1000000-0000-4000-8000-000000000301', 'f1000000-0000-4000-8000-000000000001',
  '2030-02-01T00:00:00Z', NULL) $$,
  'P0001', 'status write failed', 'failed status write does not delete the counseling row');
RESET ROLE;
SELECT is((SELECT status FROM public.deletion_requests WHERE id = 'f1000000-0000-4000-8000-000000000401'),
  'pending', 'failed status write leaves request pending');
SELECT is((SELECT count(*)::integer FROM public.counseling_records WHERE id = 'f1000000-0000-4000-8000-000000000301'),
  1, 'failed status write leaves the counseling row for retry');
DROP TRIGGER reject_counseling_approval_status_test ON public.deletion_requests;

CREATE FUNCTION public.reject_counseling_approval_delete_test() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'counseling delete failed' USING ERRCODE = 'P0001';
END;
$$;
CREATE TRIGGER reject_counseling_approval_delete_test
BEFORE DELETE ON public.counseling_records FOR EACH ROW
WHEN (OLD.id = 'f1000000-0000-4000-8000-000000000301')
EXECUTE FUNCTION public.reject_counseling_approval_delete_test();
SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT public.approve_counseling_deletion_request(
  'f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000401',
  'f1000000-0000-4000-8000-000000000301', 'f1000000-0000-4000-8000-000000000001',
  '2030-02-01T00:00:00Z', NULL) $$,
  'P0001', 'counseling delete failed', 'failed row deletion rolls request approval back');
RESET ROLE;
SELECT is((SELECT status FROM public.deletion_requests WHERE id = 'f1000000-0000-4000-8000-000000000401'),
  'pending', 'failed row deletion restores pending request');
DROP TRIGGER reject_counseling_approval_delete_test ON public.counseling_records;

SET LOCAL ROLE service_role;
SELECT lives_ok($$ SELECT public.approve_counseling_deletion_request(
  'f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000401',
  'f1000000-0000-4000-8000-000000000301', 'f1000000-0000-4000-8000-000000000001',
  '2030-02-01T00:00:00Z', NULL) $$,
  'approval succeeds on retry after both failure types');
SELECT throws_ok($$ SELECT public.approve_counseling_deletion_request(
  'f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000401',
  'f1000000-0000-4000-8000-000000000301', 'f1000000-0000-4000-8000-000000000001',
  '2030-02-01T00:00:00Z', NULL) $$,
  'P0002', 'Pending deletion request not found', 'replayed approval cannot run a second time');
SELECT throws_ok($$ SELECT public.approve_counseling_deletion_request(
  'f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000402',
  'f1000000-0000-4000-8000-000000000302', 'f1000000-0000-4000-8000-000000000001',
  '2030-02-01T00:00:00Z', NULL) $$,
  'P0002', 'Counseling record not found', 'foreign counseling row cannot be approved');
SELECT throws_ok($$ SELECT public.approve_counseling_deletion_request(
  'f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000403',
  'f1000000-0000-4000-8000-000000000399', 'f1000000-0000-4000-8000-000000000001',
  '2030-02-01T00:00:00Z', NULL) $$,
  'P0002', 'Counseling record not found', 'missing counseling row cannot be approved');
SELECT throws_ok($$ SELECT public.approve_counseling_deletion_request(
  'f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000404',
  'f1000000-0000-4000-8000-000000000303', 'f1000000-0000-4000-8000-000000000001',
  '2030-02-01T00:00:00Z', NULL) $$,
  'P0002', 'Counseling record not found', 'changed file path cannot be deleted after preflight');
RESET ROLE;

SELECT is((SELECT status FROM public.deletion_requests WHERE id = 'f1000000-0000-4000-8000-000000000401'),
  'approved', 'successful retry approves the request');
SELECT is((SELECT reviewed_by FROM public.deletion_requests WHERE id = 'f1000000-0000-4000-8000-000000000401'),
  'f1000000-0000-4000-8000-000000000001'::uuid, 'successful retry records reviewer');
SELECT is((SELECT count(*)::integer FROM public.counseling_records WHERE id = 'f1000000-0000-4000-8000-000000000301'),
  0, 'successful retry deletes the same-Organization row');
SELECT is((SELECT count(*)::integer FROM public.counseling_records WHERE id = 'f1000000-0000-4000-8000-000000000302'),
  1, 'foreign counseling row remains');
SELECT is((SELECT count(*)::integer FROM public.deletion_requests WHERE status = 'pending'),
  3, 'foreign, missing and changed-file requests remain pending');

SELECT * FROM finish();
ROLLBACK;
