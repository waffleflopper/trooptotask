-- A saved Calendar assignment committed while retention waits must survive the FK cascade.
-- The two dblink sessions use only this disposable local database and clean their fixture.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT plan(4);

SELECT dblink_connect('retention_writer', 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database());
SELECT dblink_connect('retention_cleanup', 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t3_retention_cleanup');
SELECT dblink_exec('retention_writer', $$ SET statement_timeout = '10s' $$);
SELECT dblink_exec('retention_cleanup', $$ SET statement_timeout = '10s' $$);
SELECT dblink_exec('retention_writer', $fixture$
  INSERT INTO auth.users(id,email) VALUES ('c5200000-0000-4000-8000-000000000001','retention-race-owner@example.test');
  INSERT INTO public.organizations(id,name,created_by,url_slug) VALUES ('c5200000-0000-4000-8000-000000000011','Retention Race','c5200000-0000-4000-8000-000000000001','retention-race');
  INSERT INTO public.groups(id,organization_id,name) VALUES ('c5200000-0000-4000-8000-000000000021','c5200000-0000-4000-8000-000000000011','Race Group');
  INSERT INTO public.assignment_types(id,organization_id,name,short_name,assign_to,archived_at) VALUES ('c5200000-0000-4000-8000-000000000031','c5200000-0000-4000-8000-000000000011','Race type','RT','group','2024-01-01Z');
$fixture$);

CREATE FUNCTION pg_temp.retention_waits_for_lock() RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name='t3_retention_cleanup' AND wait_event_type='Lock') THEN RETURN true; END IF;
    IF clock_timestamp() >= deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END $$;

SELECT dblink_exec('retention_writer','BEGIN');
SELECT dblink_exec('retention_writer', $insert$
  INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id)
  VALUES ('c5200000-0000-4000-8000-000000000041','c5200000-0000-4000-8000-000000000011','c5200000-0000-4000-8000-000000000031','2025-01-02','c5200000-0000-4000-8000-000000000021')
$insert$);
SELECT dblink_send_query('retention_cleanup', $call$
  SELECT public.delete_expired_unreferenced_assignment_types(
    'c5200000-0000-4000-8000-000000000011',
    ARRAY['c5200000-0000-4000-8000-000000000031']::uuid[],
    '2025-09-22Z'
  )
$call$);
SELECT ok(pg_temp.retention_waits_for_lock(), 'retention waits for the concurrent Calendar assignment');
SELECT dblink_exec('retention_writer','COMMIT');
SELECT is((SELECT deleted FROM dblink_get_result('retention_cleanup') AS result(deleted integer)), 0, 'retention sees the committed reference and deletes nothing');
SELECT is((SELECT count(*)::integer FROM public.assignment_types WHERE id='c5200000-0000-4000-8000-000000000031'), 1, 'referenced type remains');
SELECT is((SELECT count(*)::integer FROM public.daily_assignments WHERE id='c5200000-0000-4000-8000-000000000041'), 1, 'saved Calendar assignment remains');

SELECT dblink_exec('retention_writer', $cleanup$
  DELETE FROM public.organizations WHERE id='c5200000-0000-4000-8000-000000000011';
  DELETE FROM auth.users WHERE id='c5200000-0000-4000-8000-000000000001';
$cleanup$);
SELECT dblink_disconnect('retention_writer');
SELECT dblink_disconnect('retention_cleanup');
SELECT * FROM finish();
ROLLBACK;
