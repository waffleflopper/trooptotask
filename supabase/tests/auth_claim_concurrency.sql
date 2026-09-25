-- R2/R3: two real sessions contend for the same committed synthetic row.
-- Connect back to this server interface; loopback uses trust and dblink rejects
-- trust authentication for the non-superuser test runner. The password below is the standard synthetic local-stack credential.
-- Run only in the disposable local project. All committed fixtures are removed below.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();
SELECT dblink_connect('winner','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database());
SELECT dblink_connect('contender','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t3_contract_contender');
SELECT dblink_exec('winner', $$ SET statement_timeout = '10s' $$);
SELECT dblink_exec('contender', $$ SET statement_timeout = '10s' $$);
SELECT dblink_exec('winner',$fixture$ INSERT INTO auth.users(id,email) VALUES ('a4000000-0000-4000-8000-000000000001','race-owner@example.test'),('a4000000-0000-4000-8000-000000000002','race-invitee@example.test');
INSERT INTO public.platform_admins(id,user_id,role,is_active) VALUES ('a4000000-0000-4000-8000-000000000501','a4000000-0000-4000-8000-000000000001','support',true);
INSERT INTO public.organizations(id,name,created_by) VALUES ('a4000000-0000-4000-8000-000000000101','Concurrent Invitation','a4000000-0000-4000-8000-000000000001');
INSERT INTO public.access_requests(id,email,name,status) VALUES
('a4000000-0000-4000-8000-000000000201','race-invitee@example.test','Concurrent Setup','approved'),
('a4000000-0000-4000-8000-000000000202','shared-claim@example.test','First same-email request','approved'),
('a4000000-0000-4000-8000-000000000203','shared-claim@example.test','Second same-email request','approved'),
('a4000000-0000-4000-8000-000000000204','shared-claim@example.test','Post-release same-email request','approved'),
('a4000000-0000-4000-8000-000000000205','shared-claim@example.test','Rollback contender request','approved');
INSERT INTO public.account_setup_links(id,access_request_id,token_hash,expires_at) VALUES
('a4000000-0000-4000-8000-000000000301','a4000000-0000-4000-8000-000000000201','synthetic-race-hash',now()+interval '1 day'),
('a4000000-0000-4000-8000-000000000302','a4000000-0000-4000-8000-000000000202','synthetic-same-email-first-hash',now()+interval '1 day'),
('a4000000-0000-4000-8000-000000000303','a4000000-0000-4000-8000-000000000203','synthetic-same-email-second-hash',now()+interval '1 day'),
('a4000000-0000-4000-8000-000000000304','a4000000-0000-4000-8000-000000000204','synthetic-post-release-hash',now()+interval '1 day'),
('a4000000-0000-4000-8000-000000000305','a4000000-0000-4000-8000-000000000205','synthetic-release-rollback-hash',now()+interval '1 day');
INSERT INTO public.organization_invitations(id,organization_id,email,invited_by,role,member_preset,access_scope_kind) VALUES ('a4000000-0000-4000-8000-000000000401','a4000000-0000-4000-8000-000000000101','race-invitee@example.test','a4000000-0000-4000-8000-000000000001','member','viewer','organization'); $fixture$);
CREATE FUNCTION pg_temp.contender_waits_for_lock() RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
 LOOP
  PERFORM pg_stat_clear_snapshot();
  IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name='t3_contract_contender' AND wait_event_type='Lock') THEN RETURN true; END IF;
  IF clock_timestamp() >= deadline THEN RETURN false; END IF;
  PERFORM pg_sleep(0.01);
 END LOOP;
END $$;
SELECT dblink_exec('winner','BEGIN');
SELECT dblink_exec('winner','SET LOCAL ROLE service_role');
SELECT dblink_exec('contender','BEGIN');
SELECT dblink_exec('contender','SET LOCAL ROLE service_role');
SELECT is((SELECT status FROM dblink('winner',$call$ SELECT claim_status FROM public.claim_account_setup_link_for_session('a4000000-0000-4000-8000-000000000301','a4000000-0000-4000-8000-000000000201') $call$) AS result(status text)),'claim-started','first setup claim wins');
SELECT dblink_send_query('contender',$call$ SELECT claim_status FROM public.claim_account_setup_link_for_session('a4000000-0000-4000-8000-000000000301','a4000000-0000-4000-8000-000000000201') $call$);
SELECT ok(pg_temp.contender_waits_for_lock(),'competing setup claim waits for the uncommitted winner');
SELECT dblink_exec('winner','COMMIT');
SELECT is((SELECT status FROM dblink_get_result('contender') AS result(status text)),'claimed','competing setup claim observes the winner and cannot repeat it');
SELECT * FROM dblink_get_result('contender') AS result(status text);
SELECT dblink_exec('contender','COMMIT');
-- Two different Access Request rows cannot each claim a link for the same
-- stored email. The contender must wait on the email advisory lock, then see
-- the winner's committed claim in a fresh statement snapshot.
SELECT dblink_exec('winner','BEGIN');
SELECT dblink_exec('winner','SET LOCAL ROLE service_role');
SELECT dblink_exec('contender','BEGIN');
SELECT dblink_exec('contender','SET LOCAL ROLE service_role');
SELECT is((SELECT status FROM dblink('winner',$call$ SELECT claim_status FROM public.claim_account_setup_link_for_session('a4000000-0000-4000-8000-000000000302','a4000000-0000-4000-8000-000000000202') $call$) AS result(status text)),'claim-started','first same-email request acquires claim');
SELECT dblink_send_query('contender',$call$ SELECT claim_status FROM public.claim_account_setup_link_for_session('a4000000-0000-4000-8000-000000000303','a4000000-0000-4000-8000-000000000203') $call$);
SELECT ok(pg_temp.contender_waits_for_lock(),'cross-request same-email claim waits for the uncommitted winner');
SELECT dblink_exec('winner','COMMIT');
SELECT is((SELECT status FROM dblink_get_result('contender') AS result(status text)),'claim-in-progress','cross-request contender sees the committed claim');
SELECT * FROM dblink_get_result('contender') AS result(status text);
SELECT dblink_exec('contender','COMMIT');
SELECT ok((SELECT claimed_at IS NULL FROM public.account_setup_links WHERE id='a4000000-0000-4000-8000-000000000303'),'cross-request loser remains unclaimed');
SELECT dblink_exec('winner',$release$ UPDATE public.account_setup_links SET failed_at=now(), failure_reason='account-create-failed' WHERE id='a4000000-0000-4000-8000-000000000302' $release$);
SELECT dblink_exec('contender','BEGIN');
SELECT dblink_exec('contender','SET LOCAL ROLE service_role');
SELECT is((SELECT status FROM dblink('contender',$call$ SELECT claim_status FROM public.claim_account_setup_link_for_session('a4000000-0000-4000-8000-000000000303','a4000000-0000-4000-8000-000000000203') $call$) AS result(status text)),'claim-started','explicitly failed winner releases other same-email request');
SELECT dblink_exec('contender','COMMIT');
-- Staff release and a new same-email claim use the same advisory lock.
-- The contender must see the release only after its audit and link update commit.
SELECT dblink_exec('winner','BEGIN');
SELECT dblink_exec('winner','SET LOCAL ROLE service_role');
SELECT dblink_exec('contender','BEGIN');
SELECT dblink_exec('contender','SET LOCAL ROLE service_role');
SELECT ok((SELECT released FROM dblink('winner',$call$ SELECT public.release_account_setup_claim_for_staff('a4000000-0000-4000-8000-000000000303','a4000000-0000-4000-8000-000000000203','a4000000-0000-4000-8000-000000000001','provider-terminal','INC-54321') $call$) AS result(released boolean)),'staff release marks the held claim in its transaction');
SELECT dblink_send_query('contender',$call$ SELECT claim_status FROM public.claim_account_setup_link_for_session('a4000000-0000-4000-8000-000000000304','a4000000-0000-4000-8000-000000000204') $call$);
SELECT ok(pg_temp.contender_waits_for_lock(),'new same-email claim waits for the uncommitted staff release');
SELECT dblink_exec('winner','COMMIT');
SELECT is((SELECT status FROM dblink_get_result('contender') AS result(status text)),'claim-started','new claim begins after staff release commits');
SELECT * FROM dblink_get_result('contender') AS result(status text);
SELECT dblink_exec('contender','COMMIT');
SELECT ok((SELECT failure_reason='operator-released' AND failed_at IS NOT NULL FROM public.account_setup_links WHERE id='a4000000-0000-4000-8000-000000000303'),'held claim is terminal after release');
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE action='account_setup.claim_released_by_staff' AND resource_id='a4000000-0000-4000-8000-000000000303'),1,'release audit commits with the link update');
SELECT dblink_exec('winner','BEGIN');
SELECT dblink_exec('winner','SET LOCAL ROLE service_role');
SELECT dblink_exec('contender','BEGIN');
SELECT dblink_exec('contender','SET LOCAL ROLE service_role');
SELECT ok((SELECT released FROM dblink('winner',$call$ SELECT public.release_account_setup_claim_for_staff('a4000000-0000-4000-8000-000000000304','a4000000-0000-4000-8000-000000000204','a4000000-0000-4000-8000-000000000001','provider-quiescent','INC-54322') $call$) AS result(released boolean)),'staff release can be rolled back');
SELECT dblink_send_query('contender',$call$ SELECT claim_status FROM public.claim_account_setup_link_for_session('a4000000-0000-4000-8000-000000000305','a4000000-0000-4000-8000-000000000205') $call$);
SELECT ok(pg_temp.contender_waits_for_lock(),'new claim also waits for an uncommitted release that will roll back');
SELECT dblink_exec('winner','ROLLBACK');
SELECT is((SELECT status FROM dblink_get_result('contender') AS result(status text)),'claim-in-progress','rolled-back release leaves original claim held');
SELECT * FROM dblink_get_result('contender') AS result(status text);
SELECT dblink_exec('contender','COMMIT');
SELECT ok((SELECT failed_at IS NULL AND claimed_at IS NOT NULL FROM public.account_setup_links WHERE id='a4000000-0000-4000-8000-000000000304'),'rolled-back release preserves the held link');
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE action='account_setup.claim_released_by_staff' AND resource_id='a4000000-0000-4000-8000-000000000304'),0,'rolled-back release leaves no audit');
SELECT dblink_exec('winner','BEGIN');
SELECT dblink_exec('winner','SET LOCAL ROLE authenticated');
SELECT dblink_exec('winner',$jwt$ SET LOCAL request.jwt.claim.sub='a4000000-0000-4000-8000-000000000002'; SET LOCAL request.jwt.claims='{"sub":"a4000000-0000-4000-8000-000000000002","email":"race-invitee@example.test"}'; $jwt$);
SELECT dblink_exec('contender','BEGIN');
SELECT dblink_exec('contender','SET LOCAL ROLE authenticated');
SELECT dblink_exec('contender',$jwt$ SET LOCAL request.jwt.claim.sub='a4000000-0000-4000-8000-000000000002'; SET LOCAL request.jwt.claims='{"sub":"a4000000-0000-4000-8000-000000000002","email":"race-invitee@example.test"}'; $jwt$);
SELECT is((SELECT status FROM dblink('winner',$call$ SELECT accept_status FROM public.accept_organization_invitation('a4000000-0000-4000-8000-000000000401') $call$) AS result(status text)),'accepted','first invitation acceptance wins');
SELECT dblink_send_query('contender',$call$ SELECT accept_status FROM public.accept_organization_invitation('a4000000-0000-4000-8000-000000000401') $call$);
SELECT ok(pg_temp.contender_waits_for_lock(),'competing invitation acceptance waits for the uncommitted winner');
SELECT dblink_exec('winner','COMMIT');
SELECT is((SELECT status FROM dblink_get_result('contender') AS result(status text)),'already_accepted','competing invitation acceptance observes the winner and cannot repeat it');
SELECT * FROM dblink_get_result('contender') AS result(status text);
SELECT dblink_exec('contender','COMMIT');
SELECT is((SELECT count(*)::integer FROM public.organization_memberships WHERE organization_id='a4000000-0000-4000-8000-000000000101' AND user_id='a4000000-0000-4000-8000-000000000002'),1,'concurrent acceptance creates exactly one membership');
SELECT ok((SELECT claimed_at IS NOT NULL AND used_at IS NULL FROM public.account_setup_links WHERE id='a4000000-0000-4000-8000-000000000301'),'one setup claim persists without completing the account');
SELECT dblink_exec('winner',$cleanup$ DELETE FROM public.audit_logs WHERE action='account_setup.claim_released_by_staff' AND resource_id='a4000000-0000-4000-8000-000000000303'; DELETE FROM public.organizations WHERE id='a4000000-0000-4000-8000-000000000101'; DELETE FROM public.access_requests WHERE id IN ('a4000000-0000-4000-8000-000000000201','a4000000-0000-4000-8000-000000000202','a4000000-0000-4000-8000-000000000203','a4000000-0000-4000-8000-000000000204','a4000000-0000-4000-8000-000000000205'); DELETE FROM auth.users WHERE id IN ('a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002'); $cleanup$);
SELECT dblink_disconnect('winner');
SELECT dblink_disconnect('contender');
SELECT * FROM finish();
ROLLBACK;
