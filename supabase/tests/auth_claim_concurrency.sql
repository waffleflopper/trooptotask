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
INSERT INTO public.organizations(id,name,created_by) VALUES ('a4000000-0000-4000-8000-000000000101','Concurrent Invitation','a4000000-0000-4000-8000-000000000001');
INSERT INTO public.access_requests(id,email,name,status) VALUES ('a4000000-0000-4000-8000-000000000201','race-invitee@example.test','Concurrent Setup','approved');
INSERT INTO public.account_setup_links(id,access_request_id,token_hash,expires_at) VALUES ('a4000000-0000-4000-8000-000000000301','a4000000-0000-4000-8000-000000000201','synthetic-race-hash',now()+interval '1 day');
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
SELECT dblink_exec('winner',$cleanup$ DELETE FROM public.organizations WHERE id='a4000000-0000-4000-8000-000000000101'; DELETE FROM public.access_requests WHERE id='a4000000-0000-4000-8000-000000000201'; DELETE FROM auth.users WHERE id IN ('a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002'); $cleanup$);
SELECT dblink_disconnect('winner');
SELECT dblink_disconnect('contender');
SELECT * FROM finish();
ROLLBACK;
