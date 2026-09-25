-- R2/R3: only an approved, live credential may acquire the one setup session.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO public.access_requests (id,email,name,status)
VALUES ('a1000000-0000-4000-8000-000000000001','claim@example.test','Claim','approved'),
       ('a1000000-0000-4000-8000-000000000002','other@example.test','Other','approved');
INSERT INTO public.account_setup_links (id,access_request_id,token_hash,expires_at)
VALUES ('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','synthetic-claim-hash','2030-01-02T00:00:00Z');
SELECT ok(has_table_privilege('anon', 'public.account_setup_links', 'SELECT'), 'anon retains governed setup-link SELECT');
SELECT ok(has_table_privilege('authenticated', 'public.account_setup_links', 'SELECT'), 'authenticated retains governed setup-link SELECT');
SELECT ok(has_table_privilege('service_role', 'public.account_setup_links', 'INSERT') AND has_table_privilege('service_role', 'public.account_setup_links', 'UPDATE') AND has_table_privilege('service_role', 'public.account_setup_links', 'DELETE'), 'service role retains setup-link writes');
SELECT ok((
  SELECT bool_and(NOT has_table_privilege(role_name, 'public.account_setup_links', privilege_name))
  FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
  CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS privileges(privilege_name)
), 'anon and authenticated have no effective setup-link table write privilege');
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT * FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','2030-01-01T00:00:00Z') $$,'42501','permission denied for function claim_account_setup_link_for_session','anon cannot claim a setup credential');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT * FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','2030-01-01T00:00:00Z') $$,'42501','permission denied for function claim_account_setup_link_for_session','authenticated cannot claim a setup credential');
RESET ROLE;
SAVEPOINT scenario;

CREATE TEMP TABLE claim_before ON COMMIT DROP AS SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000002','2030-01-01T00:00:00Z')),'missing','mismatched request cannot claim the link');
RESET ROLE;
SELECT is((SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011'),(SELECT claimed_at FROM claim_before),'denial preserves prior claim state');
ROLLBACK TO scenario;
SAVEPOINT scenario;

CREATE TEMP TABLE claim_before ON COMMIT DROP AS SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','2030-01-02T00:00:00Z')),'expired','exact expiry rejects the claim');
RESET ROLE;
SELECT is((SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011'),(SELECT claimed_at FROM claim_before),'denial preserves prior claim state');
ROLLBACK TO scenario;
SAVEPOINT scenario;
UPDATE public.access_requests SET status='pending' WHERE id='a1000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE claim_before ON COMMIT DROP AS SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','2030-01-01T00:00:00Z')),'access-request-not-approved','pending requests cannot claim');
RESET ROLE;
SELECT is((SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011'),(SELECT claimed_at FROM claim_before),'denial preserves prior claim state');
ROLLBACK TO scenario;
SAVEPOINT scenario;
UPDATE public.access_requests SET status='rejected' WHERE id='a1000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE claim_before ON COMMIT DROP AS SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','2030-01-01T00:00:00Z')),'access-request-not-approved','rejected requests cannot claim');
RESET ROLE;
SELECT is((SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011'),(SELECT claimed_at FROM claim_before),'denial preserves prior claim state');
ROLLBACK TO scenario;
SAVEPOINT scenario;
UPDATE public.access_requests SET setup_completed_at='2029-12-31Z' WHERE id='a1000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE claim_before ON COMMIT DROP AS SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','2030-01-01T00:00:00Z')),'access-request-completed','completed requests cannot restart setup');
RESET ROLE;
SELECT is((SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011'),(SELECT claimed_at FROM claim_before),'denial preserves prior claim state');
ROLLBACK TO scenario;
SAVEPOINT scenario;
UPDATE public.account_setup_links SET claimed_at='2029-12-30Z',used_at='2029-12-31Z' WHERE id='a1000000-0000-4000-8000-000000000011';
CREATE TEMP TABLE claim_before ON COMMIT DROP AS SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','2030-01-01T00:00:00Z')),'used','used credentials cannot claim');
RESET ROLE;
SELECT is((SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011'),(SELECT claimed_at FROM claim_before),'denial preserves prior claim state');
ROLLBACK TO scenario;
SAVEPOINT scenario;
UPDATE public.account_setup_links SET claimed_at='2029-12-30Z',failed_at='2029-12-31Z',failure_reason='account-create-failed' WHERE id='a1000000-0000-4000-8000-000000000011';
CREATE TEMP TABLE claim_before ON COMMIT DROP AS SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','2030-01-01T00:00:00Z')),'failed','failed credentials cannot claim');
RESET ROLE;
SELECT is((SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011'),(SELECT claimed_at FROM claim_before),'denial preserves prior claim state');
ROLLBACK TO scenario;
SAVEPOINT scenario;
UPDATE public.account_setup_links SET revoked_at='2029-12-31Z',revocation_reason='replaced' WHERE id='a1000000-0000-4000-8000-000000000011';
CREATE TEMP TABLE claim_before ON COMMIT DROP AS SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','2030-01-01T00:00:00Z')),'replaced','replaced credentials cannot claim');
RESET ROLE;
SELECT is((SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011'),(SELECT claimed_at FROM claim_before),'denial preserves prior claim state');
ROLLBACK TO scenario;
SAVEPOINT scenario;
UPDATE public.account_setup_links SET revoked_at='2029-12-31Z',revocation_reason='manual' WHERE id='a1000000-0000-4000-8000-000000000011';
CREATE TEMP TABLE claim_before ON COMMIT DROP AS SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','2030-01-01T00:00:00Z')),'revoked','revoked credentials cannot claim');
RESET ROLE;
SELECT is((SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011'),(SELECT claimed_at FROM claim_before),'denial preserves prior claim state');
ROLLBACK TO scenario;
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','2030-01-01T00:00:00Z')),'claim-started','approved live link starts setup');
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','2030-01-01T00:00:00Z')),'claimed','replay cannot acquire a second session');
RESET ROLE;
SELECT is((SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000011'),'2030-01-01T00:00:00Z'::timestamptz,'the winning claim time persists');
SELECT is((SELECT setup_completed_at FROM public.access_requests WHERE id='a1000000-0000-4000-8000-000000000001'),NULL::timestamptz,'claim does not complete account setup');
-- A claimed credential blocks replacement on its own request and every other
-- approved Access Request for the same normalized email, even after expiry and revocation.
INSERT INTO public.account_setup_links (id,access_request_id,token_hash,expires_at)
VALUES ('a1000000-0000-4000-8000-000000000012','a1000000-0000-4000-8000-000000000001','synthetic-replacement-hash','2030-01-02T00:00:00Z');
INSERT INTO public.access_requests (id,email,name,status)
VALUES ('a1000000-0000-4000-8000-000000000003','claim@example.test','Same email','approved');
INSERT INTO public.account_setup_links (id,access_request_id,token_hash,expires_at)
VALUES ('a1000000-0000-4000-8000-000000000013','a1000000-0000-4000-8000-000000000003','synthetic-other-request-hash','2030-01-02T00:00:00Z');
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000012','a1000000-0000-4000-8000-000000000001','2030-01-01T00:00:00Z')),'claim-in-progress','same-request replacement cannot claim while old link is held');
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000013','a1000000-0000-4000-8000-000000000003','2030-01-01T00:00:00Z')),'claim-in-progress','same-email separate request cannot claim while old link is held');
RESET ROLE;
SELECT is((SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000012'),NULL::timestamptz,'blocked same-request replacement remains unclaimed');
SELECT is((SELECT claimed_at FROM public.account_setup_links WHERE id='a1000000-0000-4000-8000-000000000013'),NULL::timestamptz,'blocked cross-request link remains unclaimed');
UPDATE public.account_setup_links SET expires_at='2029-12-31T00:00:00Z',revoked_at='2029-12-31T00:00:00Z',revocation_reason='manual'
WHERE id='a1000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000013','a1000000-0000-4000-8000-000000000003','2030-01-01T00:00:00Z')),'claim-in-progress','expired and revoked claim still blocks another request');
RESET ROLE;
UPDATE public.account_setup_links SET failed_at='2030-01-01T00:00:00Z',failure_reason='account-create-failed'
WHERE id='a1000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000012','a1000000-0000-4000-8000-000000000001','2030-01-01T00:00:00Z')),'claim-started','explicit failure releases same-request replacement');
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000013','a1000000-0000-4000-8000-000000000003','2030-01-01T00:00:00Z')),'claim-in-progress','new winner holds other same-email requests');
RESET ROLE;
UPDATE public.account_setup_links SET failed_at='2030-01-01T00:00:00Z',failure_reason='account-create-failed'
WHERE id='a1000000-0000-4000-8000-000000000012';
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('a1000000-0000-4000-8000-000000000013','a1000000-0000-4000-8000-000000000003','2030-01-01T00:00:00Z')),'claim-started','explicit failure releases cross-request same-email claim');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
