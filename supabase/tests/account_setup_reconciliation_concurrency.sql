-- Renewal locks an unclaimed link before inserting its replacement. Recovery
-- must not take a request lock that blocks that INSERT's FK KEY SHARE.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();
SELECT dblink_connect('renewal','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
 ' user=postgres password=postgres dbname=' || current_database());
SELECT dblink_connect('recovery','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
 ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t3_setup_recovery');
SELECT dblink_exec('renewal', $$SET statement_timeout='5s'$$);
SELECT dblink_exec('recovery', $$SET statement_timeout='5s'$$);
-- A previous interrupted dblink run can leave its committed synthetic rows.
SELECT dblink_exec('renewal',$cleanup$
 DELETE FROM public.access_requests WHERE id IN
 ('e4000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002');
 $cleanup$);
SELECT dblink_exec('renewal',$fixture$
 INSERT INTO public.access_requests(id,email,name,status) VALUES
 ('e4000000-0000-4000-8000-000000000001','renewal-race@example.test','Held','approved'),
 ('e4000000-0000-4000-8000-000000000002','renewal-race@example.test','Fresh','approved');
 INSERT INTO public.account_setup_links(id,access_request_id,token_hash,expires_at) VALUES
 ('e5000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','race-held','2030-01-01'),
 ('e5000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000002','race-target','2030-01-01');
 $fixture$);
SELECT is((SELECT claim_status FROM dblink('renewal',$call$
 SELECT claim_status FROM public.claim_account_setup_link_for_session(
 'e5000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',now())
 $call$) AS claim(claim_status text)),'claim-started','source claim creates held attempt');

CREATE FUNCTION pg_temp.recovery_waits_for_link() RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '3 seconds';
BEGIN
 LOOP
  PERFORM pg_stat_clear_snapshot();
  IF EXISTS (SELECT 1 FROM pg_stat_activity
    WHERE application_name='t3_setup_recovery' AND wait_event_type='Lock') THEN RETURN true; END IF;
  IF clock_timestamp() >= deadline THEN RETURN false; END IF;
  PERFORM pg_sleep(0.01);
 END LOOP;
END $$;

SELECT dblink_exec('renewal','BEGIN');
SELECT dblink_exec('renewal',$sql$ UPDATE public.account_setup_links
 SET revoked_at=now(), revocation_reason='replaced'
 WHERE id='e5000000-0000-4000-8000-000000000002' $sql$);
SELECT dblink_exec('recovery','BEGIN');
SELECT dblink_exec('recovery','SET LOCAL ROLE service_role');
SELECT dblink_send_query('recovery',$sql$ SELECT public.reconcile_account_setup_claim(
 'e5000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000002') $sql$);
SELECT ok(pg_temp.recovery_waits_for_link(),'recovery waits for renewal target-link row');
SELECT is(dblink_exec('renewal',$sql$ INSERT INTO public.account_setup_links
 (id,access_request_id,token_hash,expires_at) VALUES
 ('e5000000-0000-4000-8000-000000000003','e4000000-0000-4000-8000-000000000002',
 'race-replacement','2030-01-01') $sql$),'INSERT 0 1',
 'renewal can insert replacement while recovery holds request NO KEY UPDATE');
SELECT dblink_exec('renewal','COMMIT');
SELECT is((SELECT result->>'state' FROM dblink_get_result('recovery') AS result(result jsonb)),
 'support-required','recovery sees target revocation after renewal commits');
-- dblink_send_query leaves a final empty result that must be drained before COMMIT.
SELECT * FROM dblink_get_result('recovery') AS result(result jsonb);
SELECT dblink_exec('recovery','COMMIT');
SELECT is((SELECT count(*)::integer FROM public.account_setup_links
 WHERE id='e5000000-0000-4000-8000-000000000003'),1,'replacement persists');
SELECT dblink_exec('renewal',$sql$ DELETE FROM public.access_requests
 WHERE id IN ('e4000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002') $sql$);
SELECT dblink_disconnect('renewal');
SELECT dblink_disconnect('recovery');
SELECT * FROM finish();
ROLLBACK;
