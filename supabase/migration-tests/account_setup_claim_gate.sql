-- Reapply the forward claim gate with two historical held claims and a fresh
-- link on separate approved requests for the same email.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO public.access_requests (id,email,name,status) VALUES
 ('b2000000-0000-4000-8000-000000000001','upgrade-claim@example.test','Earlier request','approved'),
 ('b2000000-0000-4000-8000-000000000002','upgrade-claim@example.test','Second held request','approved'),
 ('b2000000-0000-4000-8000-000000000003','upgrade-claim@example.test','Later request','approved');
INSERT INTO public.account_setup_links (id,access_request_id,token_hash,expires_at,claimed_at) VALUES
 ('b2000000-0000-4000-8000-000000000011','b2000000-0000-4000-8000-000000000001','upgrade-held-hash','2030-01-02T00:00:00Z','2030-01-01T00:00:00Z'),
 ('b2000000-0000-4000-8000-000000000012','b2000000-0000-4000-8000-000000000002','upgrade-second-held-hash','2030-01-02T00:00:00Z','2030-01-01T00:00:00Z'),
 ('b2000000-0000-4000-8000-000000000013','b2000000-0000-4000-8000-000000000003','upgrade-fresh-hash','2030-01-02T00:00:00Z',NULL);
CREATE TEMP TABLE before_requests AS
 SELECT id,to_jsonb(request_row) AS row_data FROM public.access_requests AS request_row
 WHERE id IN ('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000003');
CREATE TEMP TABLE before_links AS
 SELECT id,to_jsonb(link_row) AS row_data FROM public.account_setup_links AS link_row
 WHERE id IN ('b2000000-0000-4000-8000-000000000011','b2000000-0000-4000-8000-000000000012','b2000000-0000-4000-8000-000000000013');
\ir ../migrations/20260923000100_guard_account_setup_claims.sql
SELECT results_eq(
 $$ SELECT id,to_jsonb(request_row) FROM public.access_requests AS request_row WHERE id IN ('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000003') ORDER BY id $$,
 $$ SELECT id,row_data FROM before_requests ORDER BY id $$,
 'upgrade preserves historical same-email Access Requests');
SELECT results_eq(
 $$ SELECT id,to_jsonb(link_row) FROM public.account_setup_links AS link_row WHERE id IN ('b2000000-0000-4000-8000-000000000011','b2000000-0000-4000-8000-000000000012','b2000000-0000-4000-8000-000000000013') ORDER BY id $$,
 $$ SELECT id,row_data FROM before_links ORDER BY id $$,
 'upgrade preserves historical duplicate claims and the fresh setup link');
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session(
 'b2000000-0000-4000-8000-000000000013','b2000000-0000-4000-8000-000000000003','2030-01-01T00:00:00Z')),
 'claim-in-progress','upgrade fails closed on historical duplicate claims before Auth');
RESET ROLE;
SELECT is((SELECT claimed_at FROM public.account_setup_links WHERE id='b2000000-0000-4000-8000-000000000013'),NULL::timestamptz,'denied upgrade claim leaves fresh link unclaimed');
SELECT ok(NOT has_table_privilege('authenticated','public.account_setup_links','UPDATE'),'upgrade removes authenticated direct writes');
\ir ../migrations/20260923000100_guard_account_setup_claims.sql
SELECT results_eq(
 $$ SELECT id,to_jsonb(link_row) FROM public.account_setup_links AS link_row WHERE id IN ('b2000000-0000-4000-8000-000000000011','b2000000-0000-4000-8000-000000000012','b2000000-0000-4000-8000-000000000013') ORDER BY id $$,
 $$ SELECT id,row_data FROM before_links ORDER BY id $$,
 'reapplying claim gate preserves existing links');
SELECT * FROM finish();
ROLLBACK;
