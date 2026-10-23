BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT plan(6);

SELECT dblink_connect('import_fixture', 'hostaddr=' || host(inet_server_addr()) ||
  ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() ||
  ' application_name=t3_import_fixture');
SELECT dblink_exec('import_fixture', $$SET statement_timeout='10s'$$);
SELECT dblink_connect('import_winner', 'hostaddr=' || host(inet_server_addr()) ||
  ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() ||
  ' application_name=t3_import_winner');
SELECT dblink_exec('import_winner', $$SET statement_timeout='10s'$$);
SELECT dblink_connect('import_contender', 'hostaddr=' || host(inet_server_addr()) ||
  ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() ||
  ' application_name=t3_import_contender');
SELECT dblink_exec('import_contender', $$SET statement_timeout='10s'$$);

SELECT dblink_exec('import_fixture', $cleanup$
  DELETE FROM public.organizations WHERE id='e6210000-0000-4000-8000-000000000101';
  DELETE FROM auth.users WHERE id='e6210000-0000-4000-8000-000000000001';
$cleanup$);
SELECT dblink_exec('import_fixture', $fixture$
  INSERT INTO auth.users(id,email) VALUES
    ('e6210000-0000-4000-8000-000000000001','import-race-operator@example.test');
  INSERT INTO public.organizations(id,name,created_by) VALUES
    ('e6210000-0000-4000-8000-000000000101','Import Race','e6210000-0000-4000-8000-000000000001');
  INSERT INTO public.organization_memberships(
    organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
  ) VALUES
    ('e6210000-0000-4000-8000-000000000101','e6210000-0000-4000-8000-000000000001',
     'member','viewer','{"calendar":"operate"}','organization',ARRAY[]::uuid[]);
  INSERT INTO public.personnel(id,organization_id,rank,first_name,last_name,slug) VALUES
    ('e6210000-0000-4000-8000-000000000301','e6210000-0000-4000-8000-000000000101','SPC','First','Person','import-race-first'),
    ('e6210000-0000-4000-8000-000000000302','e6210000-0000-4000-8000-000000000101','SPC','Other','Person','import-race-other');
  INSERT INTO public.status_types(id,organization_id,name) VALUES
    ('e6210000-0000-4000-8000-000000000401','e6210000-0000-4000-8000-000000000101','Race Status');
$fixture$);

CREATE FUNCTION pg_temp.import_contender_waits() RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (
      SELECT 1 FROM pg_stat_activity AS activity
      JOIN pg_locks AS lock ON lock.pid = activity.pid
      WHERE activity.application_name='t3_import_contender'
        AND activity.wait_event_type='Lock' AND lock.locktype='advisory' AND NOT lock.granted
    ) THEN RETURN true; END IF;
    IF clock_timestamp() >= deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END $$;

SELECT dblink_exec('import_winner','BEGIN');
SELECT dblink_exec('import_winner','SET LOCAL ROLE authenticated');
SELECT dblink_exec('import_winner',
  $$SET LOCAL request.jwt.claim.sub='e6210000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('import_contender','BEGIN');
SELECT dblink_exec('import_contender','SET LOCAL ROLE authenticated');
SELECT dblink_exec('import_contender',
  $$SET LOCAL request.jwt.claim.sub='e6210000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('import_fixture','BEGIN');
SELECT dblink_exec('import_fixture','SET LOCAL ROLE authenticated');
SELECT dblink_exec('import_fixture',
  $$SET LOCAL request.jwt.claim.sub='e6210000-0000-4000-8000-000000000001'$$);

SELECT is((SELECT saved FROM dblink('import_winner',$call$
  SELECT public.import_availability_entries('e6210000-0000-4000-8000-000000000101',
    '[{"personnel_id":"e6210000-0000-4000-8000-000000000301","status_type_id":"e6210000-0000-4000-8000-000000000401",
       "start_date":"2030-04-01","end_date":"2030-04-03","overlap":"none"}]')
$call$) AS result(saved jsonb)), '{"inserted":1,"deleted":0,"stale":[]}'::jsonb,
  'the first ordinary operator inserts and holds the Person lock');
SELECT dblink_send_query('import_contender',$call$
  SELECT public.import_availability_entries('e6210000-0000-4000-8000-000000000101',
    '[{"personnel_id":"e6210000-0000-4000-8000-000000000301","status_type_id":"e6210000-0000-4000-8000-000000000401",
       "start_date":"2030-04-02","end_date":"2030-04-04","overlap":"none"}]')
$call$);
SELECT ok(pg_temp.import_contender_waits(), 'a competing import waits on the Person advisory lock');
SELECT is((SELECT saved FROM dblink('import_fixture',$call$
  SELECT public.import_availability_entries('e6210000-0000-4000-8000-000000000101',
    '[{"personnel_id":"e6210000-0000-4000-8000-000000000302","status_type_id":"e6210000-0000-4000-8000-000000000401",
       "start_date":"2030-04-02","end_date":"2030-04-04","overlap":"none"}]')
$call$) AS result(saved jsonb)), '{"inserted":1,"deleted":0,"stale":[]}'::jsonb,
  'an import for another Person completes while the first transaction holds its lock');
SELECT dblink_exec('import_fixture','COMMIT');
SELECT dblink_exec('import_winner','COMMIT');
SELECT is((SELECT saved FROM dblink_get_result('import_contender') AS result(saved jsonb)),
  '{"inserted":0,"deleted":0,"stale":[0]}'::jsonb,
  'after the first commit the competing ordinary operator sees the overlap and refuses its stale row');
SELECT * FROM dblink_get_result('import_contender') AS result(saved jsonb);
SELECT dblink_exec('import_contender','COMMIT');
SELECT results_eq($$
  SELECT personnel_id,start_date,end_date FROM dblink('import_fixture',$query$
    SELECT personnel_id::text,start_date::text,end_date::text FROM public.availability_entries
    WHERE organization_id='e6210000-0000-4000-8000-000000000101' ORDER BY personnel_id
  $query$) AS result(personnel_id text,start_date text,end_date text)
$$,$$ VALUES ('e6210000-0000-4000-8000-000000000301','2030-04-01','2030-04-03'),
  ('e6210000-0000-4000-8000-000000000302','2030-04-02','2030-04-04') $$,
  'only the first import and the other Person persist');
SELECT is((SELECT saved FROM dblink('import_fixture',$query$
  SELECT count(*)::integer FROM public.availability_entries
  WHERE organization_id='e6210000-0000-4000-8000-000000000101' AND start_date='2030-04-02'
    AND personnel_id='e6210000-0000-4000-8000-000000000301'
$query$) AS result(saved integer)),0, 'the stale contender saves no entry');

SELECT dblink_exec('import_fixture', $cleanup$
  DELETE FROM public.organizations WHERE id='e6210000-0000-4000-8000-000000000101';
  DELETE FROM auth.users WHERE id='e6210000-0000-4000-8000-000000000001';
$cleanup$);
SELECT dblink_disconnect('import_winner');
SELECT dblink_disconnect('import_contender');
SELECT dblink_disconnect('import_fixture');
SELECT * FROM finish();
ROLLBACK;
