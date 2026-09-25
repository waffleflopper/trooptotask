-- A staff attestation releases a held setup claim only after the operator has
-- established the prior provider operation is terminal or quiescent.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('a5000000-0000-4000-8000-000000000001', 'setup-release-support@example.test'),
  ('a5000000-0000-4000-8000-000000000002', 'setup-release-billing@example.test'),
  ('a5000000-0000-4000-8000-000000000003', 'setup-release-inactive@example.test');
INSERT INTO public.platform_admins (id, user_id, role, is_active) VALUES
  ('a5000000-0000-4000-8000-000000000011', 'a5000000-0000-4000-8000-000000000001', 'support', true),
  ('a5000000-0000-4000-8000-000000000012', 'a5000000-0000-4000-8000-000000000002', 'billing', true),
  ('a5000000-0000-4000-8000-000000000013', 'a5000000-0000-4000-8000-000000000003', 'support', false);
INSERT INTO public.access_requests (id, email, name, status, setup_completed_at) VALUES
  ('a5000000-0000-4000-8000-000000000101', 'release@example.test', 'Held setup', 'approved', NULL),
  ('a5000000-0000-4000-8000-000000000102', 'release@example.test', 'Replacement setup', 'approved', NULL),
  ('a5000000-0000-4000-8000-000000000103', 'completed-release@example.test', 'Completed setup', 'approved', now()),
  ('a5000000-0000-4000-8000-000000000104', 'used-release@example.test', 'Used link', 'approved', NULL);
INSERT INTO public.account_setup_links
  (id, access_request_id, token_hash, expires_at, claimed_at, used_at, revoked_at, revocation_reason)
VALUES
  ('a5000000-0000-4000-8000-000000000201', 'a5000000-0000-4000-8000-000000000101', 'synthetic-held-release-hash', now()-interval '1 minute', now()-interval '1 hour', NULL, now()-interval '1 minute', 'manual'),
  ('a5000000-0000-4000-8000-000000000203', 'a5000000-0000-4000-8000-000000000103', 'synthetic-completed-release-hash', now()+interval '1 day', now()-interval '1 hour', NULL, NULL, NULL),
  ('a5000000-0000-4000-8000-000000000204', 'a5000000-0000-4000-8000-000000000104', 'synthetic-used-release-hash', now()+interval '1 day', now()-interval '1 hour', now()-interval '30 minutes', NULL, NULL);
INSERT INTO public.account_setup_links (id, access_request_id, token_hash, expires_at)
VALUES
  ('a5000000-0000-4000-8000-000000000202', 'a5000000-0000-4000-8000-000000000102', 'synthetic-replacement-release-hash', now()+interval '1 day'),
  ('a5000000-0000-4000-8000-000000000205', 'a5000000-0000-4000-8000-000000000103', 'synthetic-completed-request-replacement-hash', now()+interval '1 day');

SELECT ok(has_function_privilege('service_role', 'public.release_account_setup_claim_for_staff(uuid,uuid,uuid,text,text)', 'EXECUTE'), 'service role can call staff release');
SELECT ok(NOT has_function_privilege('anon', 'public.release_account_setup_claim_for_staff(uuid,uuid,uuid,text,text)', 'EXECUTE'), 'anonymous cannot call staff release');
SELECT ok(NOT has_function_privilege('authenticated', 'public.release_account_setup_claim_for_staff(uuid,uuid,uuid,text,text)', 'EXECUTE'), 'member cannot call staff release');
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000201','a5000000-0000-4000-8000-000000000101','a5000000-0000-4000-8000-000000000001','provider-terminal','INC-12345') $$, '42501', NULL, 'anonymous execution is denied');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000201','a5000000-0000-4000-8000-000000000101','a5000000-0000-4000-8000-000000000001','provider-terminal','INC-12345') $$, '42501', NULL, 'member execution is denied');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a5000000-0000-4000-8000-000000000202','a5000000-0000-4000-8000-000000000102')), 'claim-in-progress', 'expired and revoked held claim still blocks a replacement');
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000201','a5000000-0000-4000-8000-000000000101','a5000000-0000-4000-8000-000000000002','provider-terminal','INC-12345') $$, '42501', NULL, 'billing admin cannot attest release');
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000201','a5000000-0000-4000-8000-000000000101','a5000000-0000-4000-8000-000000000003','provider-terminal','INC-12345') $$, '42501', NULL, 'inactive support cannot attest release');
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000201','a5000000-0000-4000-8000-000000000101','a5000000-0000-4000-8000-000000000001','timeout','INC-12345') $$, '22023', NULL, 'elapsed time cannot attest provider quiescence');
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000201','a5000000-0000-4000-8000-000000000101','a5000000-0000-4000-8000-000000000001','provider-terminal',NULL) $$, '22023', NULL, 'operator evidence reference is required');
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000201','a5000000-0000-4000-8000-000000000101','a5000000-0000-4000-8000-000000000001','provider-terminal','https://example.test/raw-token') $$, '22023', NULL, 'URL cannot be stored as evidence reference');
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000201','a5000000-0000-4000-8000-000000000101','a5000000-0000-4000-8000-000000000001','provider-terminal','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$, '22023', NULL, 'raw setup token cannot be stored as evidence reference');
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000202','a5000000-0000-4000-8000-000000000102','a5000000-0000-4000-8000-000000000001','provider-terminal','INC-12345') $$, '55000', NULL, 'unclaimed replacement cannot be released');
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000204','a5000000-0000-4000-8000-000000000104','a5000000-0000-4000-8000-000000000001','provider-terminal','INC-12345') $$, '55000', NULL, 'already used link cannot be released');
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000201','a5000000-0000-4000-8000-000000000102','a5000000-0000-4000-8000-000000000001','provider-terminal','INC-12345') $$, '55000', NULL, 'claim must match its Access Request');
RESET ROLE;
SELECT ok((SELECT failed_at IS NULL FROM public.account_setup_links WHERE id='a5000000-0000-4000-8000-000000000201'), 'denials leave held claim unchanged');
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE action='account_setup.claim_released_by_staff' AND resource_id='a5000000-0000-4000-8000-000000000201'), 0, 'denials write no release audit');

SET LOCAL ROLE service_role;
SELECT ok(public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000201','a5000000-0000-4000-8000-000000000101','a5000000-0000-4000-8000-000000000001','provider-quiescent','INC-12345'), 'active support can release a verified held claim');
SELECT ok(public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000203','a5000000-0000-4000-8000-000000000103','a5000000-0000-4000-8000-000000000001','provider-terminal','INC-12346'), 'staff can release a link held after Access Request completion tracking succeeded');
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff('a5000000-0000-4000-8000-000000000201','a5000000-0000-4000-8000-000000000101','a5000000-0000-4000-8000-000000000001','provider-terminal','INC-12345') $$, '55000', NULL, 'release cannot be repeated');
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a5000000-0000-4000-8000-000000000202','a5000000-0000-4000-8000-000000000102')), 'claim-started', 'replacement may claim after explicit operator release');
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a5000000-0000-4000-8000-000000000205','a5000000-0000-4000-8000-000000000103')), 'access-request-completed', 'release cannot restart setup on a completed request');
RESET ROLE;
SELECT ok((SELECT claimed_at IS NOT NULL AND failed_at IS NOT NULL AND failure_reason='operator-released' AND used_at IS NULL FROM public.account_setup_links WHERE id='a5000000-0000-4000-8000-000000000201'), 'release terminates the held link without erasing claim history');
SELECT ok((SELECT setup_completed_at IS NOT NULL FROM public.access_requests WHERE id='a5000000-0000-4000-8000-000000000103'), 'release preserves completed Access Request state');
SELECT ok((SELECT failure_reason='operator-released' AND failed_at IS NOT NULL FROM public.account_setup_links WHERE id='a5000000-0000-4000-8000-000000000203'), 'completed request held link is released');
SELECT ok((SELECT user_id='a5000000-0000-4000-8000-000000000001' AND resource_type='account_setup_link' AND severity='warning' AND details->>'accessRequestId'='a5000000-0000-4000-8000-000000000101' AND details->>'releaseReason'='provider-quiescent' AND details->>'evidenceReference'='INC-12345' AND details ? 'priorClaimedAt' FROM public.audit_logs WHERE action='account_setup.claim_released_by_staff' AND resource_id='a5000000-0000-4000-8000-000000000201'), 'one attributable audit records the operator attestation and evidence reference');
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE action='account_setup.claim_released_by_staff' AND resource_id='a5000000-0000-4000-8000-000000000201'), 1, 'release records exactly one audit');
SELECT * FROM finish();
ROLLBACK;
