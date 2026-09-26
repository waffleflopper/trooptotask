-- Upgrade a held claim without rewriting it; guarded staff release is a
-- separate, audited decision after provider-operation reconciliation.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users (id,email) VALUES
 ('b3000000-0000-4000-8000-000000000001','upgrade-support@example.test');
INSERT INTO public.platform_admins (id,user_id,role,is_active) VALUES
 ('b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000001','support',true);
INSERT INTO public.access_requests (id,email,name,status) VALUES
 ('b3000000-0000-4000-8000-000000000101','upgrade-release@example.test','Held request','approved'),
 ('b3000000-0000-4000-8000-000000000102','upgrade-release@example.test','Fresh request','approved');
INSERT INTO public.account_setup_links (id,access_request_id,token_hash,expires_at,claimed_at) VALUES
 ('b3000000-0000-4000-8000-000000000201','b3000000-0000-4000-8000-000000000101','upgrade-release-held-hash','2030-01-02T00:00:00Z','2030-01-01T00:00:00Z'),
 ('b3000000-0000-4000-8000-000000000202','b3000000-0000-4000-8000-000000000102','upgrade-release-fresh-hash','2030-01-02T00:00:00Z',NULL);
CREATE TEMP TABLE before_release AS
 SELECT id,to_jsonb(link_row) AS row_data FROM public.account_setup_links AS link_row
 WHERE id IN ('b3000000-0000-4000-8000-000000000201','b3000000-0000-4000-8000-000000000202');
\ir ../migrations/20260923000200_release_account_setup_claim_for_staff.sql
SELECT results_eq(
 $$ SELECT id,to_jsonb(link_row) FROM public.account_setup_links AS link_row WHERE id IN ('b3000000-0000-4000-8000-000000000201','b3000000-0000-4000-8000-000000000202') ORDER BY id $$,
 $$ SELECT id,row_data FROM before_release ORDER BY id $$,
 'upgrade leaves historical held and fresh links unchanged');
SELECT ok(NOT has_function_privilege('authenticated','public.release_account_setup_claim_for_staff(uuid,uuid,uuid,text,text)','EXECUTE'),'upgrade retains staff release execution denial');
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('b3000000-0000-4000-8000-000000000202','b3000000-0000-4000-8000-000000000102','2030-01-01T00:00:00Z')),'claim-in-progress','historical held claim still blocks a fresh link');
SELECT throws_ok($$ SELECT public.release_account_setup_claim_for_staff('b3000000-0000-4000-8000-000000000201','b3000000-0000-4000-8000-000000000101','b3000000-0000-4000-8000-000000000001','timeout','INC-12345') $$,'22023',NULL,'time alone cannot release an upgraded claim');
RESET ROLE;
SELECT results_eq(
 $$ SELECT id,to_jsonb(link_row) FROM public.account_setup_links AS link_row WHERE id IN ('b3000000-0000-4000-8000-000000000201','b3000000-0000-4000-8000-000000000202') ORDER BY id $$,
 $$ SELECT id,row_data FROM before_release ORDER BY id $$,
 'denied release leaves both links unchanged');
\ir ../migrations/20260923000200_release_account_setup_claim_for_staff.sql
SELECT results_eq(
 $$ SELECT id,to_jsonb(link_row) FROM public.account_setup_links AS link_row WHERE id IN ('b3000000-0000-4000-8000-000000000201','b3000000-0000-4000-8000-000000000202') ORDER BY id $$,
 $$ SELECT id,row_data FROM before_release ORDER BY id $$,
 'reapplying staff release migration preserves historical links');
SET LOCAL ROLE service_role;
SELECT ok(public.release_account_setup_claim_for_staff('b3000000-0000-4000-8000-000000000201','b3000000-0000-4000-8000-000000000101','b3000000-0000-4000-8000-000000000001','provider-terminal','INC-12345'),'attested support operator can release the held claim');
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session('b3000000-0000-4000-8000-000000000202','b3000000-0000-4000-8000-000000000102','2030-01-01T00:00:00Z')),'claim-started','fresh link claims only after release');
RESET ROLE;
SELECT ok((SELECT claimed_at IS NOT NULL AND failed_at IS NOT NULL AND failure_reason='operator-released' FROM public.account_setup_links WHERE id='b3000000-0000-4000-8000-000000000201'),'release preserves claim lineage and records operator reason');
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE action='account_setup.claim_released_by_staff' AND resource_id='b3000000-0000-4000-8000-000000000201'),1,'release writes one attributable audit');
SELECT * FROM finish();
ROLLBACK;
