BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT plan(5);
SELECT dblink_connect('swap_fixture', 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t2t_swap_fixture');
SELECT dblink_connect('swap_winner', 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t2t_swap_winner');
SELECT dblink_connect('swap_contender', 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t2t_swap_contender');
SELECT dblink_exec('swap_fixture',$cleanup$DROP FUNCTION IF EXISTS public.t2t_swap_race_contender(); DELETE FROM public.organizations WHERE id='b1858100-0000-4000-8000-000000000101'; DELETE FROM auth.users WHERE id IN ('b1858100-0000-4000-8000-000000000001','b1858100-0000-4000-8000-000000000002','b1858100-0000-4000-8000-000000000003','b1858100-0000-4000-8000-000000000004');$cleanup$);
SELECT dblink_exec('swap_fixture',$fixture$INSERT INTO auth.users(id,email) VALUES ('b1858100-0000-4000-8000-000000000001','swap-race-owner@example.test'),('b1858100-0000-4000-8000-000000000002','swap-race-operator@example.test'),('b1858100-0000-4000-8000-000000000003','swap-race-group@example.test'),('b1858100-0000-4000-8000-000000000004','swap-race-viewer@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES ('b1858100-0000-4000-8000-000000000101','Duty swaps','b1858100-0000-4000-8000-000000000001');
INSERT INTO public.groups(id,organization_id,name) VALUES ('b1858100-0000-4000-8000-000000000201','b1858100-0000-4000-8000-000000000101','Alpha');
INSERT INTO public.organization_memberships(organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids) VALUES
('b1858100-0000-4000-8000-000000000101','b1858100-0000-4000-8000-000000000001','owner','editor','{}','organization',ARRAY[]::uuid[]),
('b1858100-0000-4000-8000-000000000101','b1858100-0000-4000-8000-000000000002','member','operator','{"calendar":"operate"}','organization',ARRAY[]::uuid[]),
('b1858100-0000-4000-8000-000000000101','b1858100-0000-4000-8000-000000000003','member','operator','{"calendar":"operate"}','groups',ARRAY['b1858100-0000-4000-8000-000000000201']::uuid[]),
('b1858100-0000-4000-8000-000000000101','b1858100-0000-4000-8000-000000000004','member','viewer','{"calendar":"view"}','organization',ARRAY[]::uuid[]);
INSERT INTO public.personnel(id,organization_id,group_id,rank,first_name,last_name,mos,slug) VALUES
('b1858100-0000-4000-8000-000000000301','b1858100-0000-4000-8000-000000000101','b1858100-0000-4000-8000-000000000201','SPC','','Kim','68W','swap-race-kim'),('b1858100-0000-4000-8000-000000000302','b1858100-0000-4000-8000-000000000101','b1858100-0000-4000-8000-000000000201','SPC','','Patel','68W','swap-race-patel');
INSERT INTO public.assignment_types(id,organization_id,name,short_name,assign_to) VALUES
('b1858100-0000-4000-8000-000000000401','b1858100-0000-4000-8000-000000000101','Staff Duty','SD','personnel'),('b1858100-0000-4000-8000-000000000402','b1858100-0000-4000-8000-000000000101','Group Duty','GD','group');

INSERT INTO public.daily_assignments(organization_id,assignment_type_id,date,assignee_id) VALUES
('b1858100-0000-4000-8000-000000000101','b1858100-0000-4000-8000-000000000401',current_date,'b1858100-0000-4000-8000-000000000301'),('b1858100-0000-4000-8000-000000000101','b1858100-0000-4000-8000-000000000401',current_date+7,'b1858100-0000-4000-8000-000000000302'),('b1858100-0000-4000-8000-000000000101','b1858100-0000-4000-8000-000000000401',current_date+14,'b1858100-0000-4000-8000-000000000302');
CREATE FUNCTION public.t2t_swap_race_contender() RETURNS text LANGUAGE plpgsql AS $body$
BEGIN
  PERFORM public.swap_roster_days('b1858100-0000-4000-8000-000000000101','b1858100-0000-4000-8000-000000000401',current_date,'b1858100-0000-4000-8000-000000000301',current_date+14,'b1858100-0000-4000-8000-000000000302',current_date);
  RETURN 'unexpected success';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END;
$body$;
$fixture$);
CREATE FUNCTION pg_temp.swap_contender_waits() RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
 LOOP
  PERFORM pg_stat_clear_snapshot();
  IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name='t2t_swap_contender' AND wait_event='advisory') THEN RETURN true; END IF;
  IF clock_timestamp() >= deadline THEN RETURN false; END IF;
  PERFORM pg_sleep(0.01);
 END LOOP;
END;
$$;
SELECT dblink_exec('swap_winner',$$SET statement_timeout='10s'$$);
SELECT dblink_exec('swap_winner','BEGIN');
SELECT dblink_exec('swap_winner','SET LOCAL ROLE authenticated');
SELECT dblink_exec('swap_winner', $$SET LOCAL request.jwt.claim.sub='b1858100-0000-4000-8000-000000000002'$$);
SELECT dblink_exec('swap_contender',$$SET statement_timeout='10s'$$);
SELECT dblink_exec('swap_contender','BEGIN');
SELECT dblink_exec('swap_contender','SET LOCAL ROLE authenticated');
SELECT dblink_exec('swap_contender', $$SET LOCAL request.jwt.claim.sub='b1858100-0000-4000-8000-000000000002'$$);
SELECT is((SELECT result->'swap'->>'first_held_by' FROM dblink('swap_winner',$call$SELECT public.swap_roster_days('b1858100-0000-4000-8000-000000000101','b1858100-0000-4000-8000-000000000401',current_date,'b1858100-0000-4000-8000-000000000301',current_date+7,'b1858100-0000-4000-8000-000000000302',current_date)$call$) AS r(result jsonb)),'b1858100-0000-4000-8000-000000000301','the ordinary operator enters the winning swap');
SELECT dblink_send_query('swap_contender','SELECT public.t2t_swap_race_contender()');
SELECT ok(pg_temp.swap_contender_waits(),'the contender blocks on the shared day advisory lock');
SELECT dblink_exec('swap_winner','COMMIT');
SELECT is((SELECT code FROM dblink_get_result('swap_contender') AS r(code text)),'RSW01','the contender gets the roster-changed SQLSTATE');
SELECT * FROM dblink_get_result('swap_contender') AS r(code text);
SELECT dblink_exec('swap_contender','COMMIT');
SELECT is((SELECT total FROM dblink('swap_fixture',$query$SELECT count(*)::integer FROM public.roster_swaps WHERE organization_id='b1858100-0000-4000-8000-000000000101'$query$) AS r(total integer)),1,'exactly one exchange exists');
SELECT results_eq($$SELECT date,assignee_id FROM dblink('swap_fixture',$query$SELECT date,assignee_id FROM public.daily_assignments WHERE organization_id='b1858100-0000-4000-8000-000000000101' ORDER BY date$query$) AS r(date date, assignee_id text)$$,
 $$VALUES (current_date,'b1858100-0000-4000-8000-000000000302'::text),(current_date+7,'b1858100-0000-4000-8000-000000000301'::text),(current_date+14,'b1858100-0000-4000-8000-000000000302'::text)$$,'the failed contender leaves every day as the winner left it');
SELECT dblink_exec('swap_fixture',$cleanup$DROP FUNCTION IF EXISTS public.t2t_swap_race_contender(); DELETE FROM public.organizations WHERE id='b1858100-0000-4000-8000-000000000101'; DELETE FROM auth.users WHERE id IN ('b1858100-0000-4000-8000-000000000001','b1858100-0000-4000-8000-000000000002','b1858100-0000-4000-8000-000000000003','b1858100-0000-4000-8000-000000000004');$cleanup$);
SELECT dblink_disconnect('swap_winner');
SELECT dblink_disconnect('swap_contender');
SELECT dblink_disconnect('swap_fixture');
SELECT * FROM finish();
ROLLBACK;
