BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT plan(18);

SELECT dblink_connect('undo_fixture', 'hostaddr=' || host(inet_server_addr()) ||
  ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() ||
  ' application_name=t3_undo_fixture');
SELECT dblink_exec('undo_fixture', $$SET statement_timeout='10s'$$);
SELECT dblink_connect('undo_writer', 'hostaddr=' || host(inet_server_addr()) ||
  ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() ||
  ' application_name=t3_undo_writer');
SELECT dblink_exec('undo_writer', $$SET statement_timeout='10s'$$);
SELECT dblink_connect('undo_restorer', 'hostaddr=' || host(inet_server_addr()) ||
  ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() ||
  ' application_name=t3_undo_restorer');
SELECT dblink_exec('undo_restorer', $$SET statement_timeout='10s'$$);

SELECT dblink_exec('undo_fixture', $cleanup$
  DELETE FROM public.organizations WHERE id='7a5a0000-0000-4000-8000-000000000101';
  DELETE FROM auth.users WHERE id='7a5a0000-0000-4000-8000-000000000001';
$cleanup$);
SELECT dblink_exec('undo_fixture', $fixture$
  INSERT INTO auth.users(id,email) VALUES
    ('7a5a0000-0000-4000-8000-000000000001','undo-race-operator@example.test');
  INSERT INTO public.organizations(id,name,created_by) VALUES
    ('7a5a0000-0000-4000-8000-000000000101','Undo Race','7a5a0000-0000-4000-8000-000000000001');
  INSERT INTO public.organization_memberships(
    organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
  ) VALUES
    ('7a5a0000-0000-4000-8000-000000000101','7a5a0000-0000-4000-8000-000000000001',
     'member','viewer','{"calendar":"operate"}','organization',ARRAY[]::uuid[]);
  INSERT INTO public.personnel(id,organization_id,rank,first_name,last_name,slug) VALUES
    ('7a5a0000-0000-4000-8000-000000000301','7a5a0000-0000-4000-8000-000000000101','SPC','Race','Person','undo-race');
  INSERT INTO public.status_types(id,organization_id,name) VALUES
    ('7a5a0000-0000-4000-8000-000000000401','7a5a0000-0000-4000-8000-000000000101','Race Leave'),
    ('7a5a0000-0000-4000-8000-000000000402','7a5a0000-0000-4000-8000-000000000101','Race Training');
  INSERT INTO public.availability_entries(id,organization_id,personnel_id,status_type_id,start_date,end_date) VALUES
    ('7a5a0000-0000-4000-8000-000000000501','7a5a0000-0000-4000-8000-000000000101',
     '7a5a0000-0000-4000-8000-000000000301','7a5a0000-0000-4000-8000-000000000401','2030-05-01','2030-05-02'),
    ('7a5a0000-0000-4000-8000-000000000502','7a5a0000-0000-4000-8000-000000000101',
     '7a5a0000-0000-4000-8000-000000000301','7a5a0000-0000-4000-8000-000000000401','2030-06-01','2030-06-02'),
    ('7a5a0000-0000-4000-8000-000000000503','7a5a0000-0000-4000-8000-000000000101',
     '7a5a0000-0000-4000-8000-000000000301','7a5a0000-0000-4000-8000-000000000402','2030-07-01','2030-07-01');
  INSERT INTO public.calendar_taskings(id,organization_id,title,suspense_on) VALUES
    ('7a5a0000-0000-4000-8000-000000000601','7a5a0000-0000-4000-8000-000000000101','Race Tasking','2030-08-01');
$fixture$);

CREATE FUNCTION pg_temp.restorer_waits() RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (SELECT 1 FROM pg_stat_activity AS activity
      WHERE activity.application_name='t3_undo_restorer' AND activity.wait_event_type='Lock') THEN RETURN true; END IF;
    IF clock_timestamp() >= deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END $$;

CREATE FUNCTION pg_temp.act(p_connection text) RETURNS void
LANGUAGE sql AS $fn$
  SELECT dblink_exec(p_connection, 'BEGIN');
  SELECT dblink_exec(p_connection, 'SET LOCAL ROLE authenticated');
  SELECT dblink_exec(p_connection, $$SET LOCAL request.jwt.claim.sub='7a5a0000-0000-4000-8000-000000000001'$$);
$fn$;

CREATE FUNCTION pg_temp.entries(p_id text) RETURNS integer
LANGUAGE sql AS $$
  SELECT saved FROM dblink('undo_fixture', format(
    'SELECT count(*)::integer FROM public.availability_entries WHERE id = %L', p_id)) AS result(saved integer);
$$;

SELECT pg_temp.act('undo_fixture');
SELECT is((SELECT removed FROM dblink('undo_fixture', $call$
  SELECT public.delete_availability_entries('7a5a0000-0000-4000-8000-000000000101',
    ARRAY['7a5a0000-0000-4000-8000-000000000501','7a5a0000-0000-4000-8000-000000000502']::uuid[])
$call$) AS result(removed integer)), 2, 'the operator removes two Race Leave statuses and keeps their undo records');
SELECT dblink_exec('undo_fixture','COMMIT');

SELECT pg_temp.act('undo_writer');
SELECT dblink_exec('undo_writer', $$
  INSERT INTO public.availability_entries(organization_id,personnel_id,status_type_id,start_date,end_date)
  VALUES ('7a5a0000-0000-4000-8000-000000000101','7a5a0000-0000-4000-8000-000000000301',
    '7a5a0000-0000-4000-8000-000000000401','2030-05-02','2030-05-03')
$$);
SELECT pg_temp.act('undo_restorer');
SELECT dblink_send_query('undo_restorer', $call$
  SELECT count(*)::integer FROM public.restore_availability_entries('7a5a0000-0000-4000-8000-000000000101',
    ARRAY['7a5a0000-0000-4000-8000-000000000501']::uuid[], ARRAY['7a5a0000-0000-4000-8000-000000000301']::uuid[])
$call$);
SELECT ok(pg_temp.restorer_waits(), 'a restore waits for an uncommitted add of the same Person');
SELECT dblink_exec('undo_writer','COMMIT');
SELECT is((SELECT restored FROM dblink_get_result('undo_restorer') AS result(restored integer)), 0,
  'after the add commits the restore sees its Race Leave over those dates and restores nothing');
SELECT * FROM dblink_get_result('undo_restorer') AS result(restored integer);
SELECT dblink_exec('undo_restorer','COMMIT');
SELECT is(pg_temp.entries('7a5a0000-0000-4000-8000-000000000501'), 0, 'the overlapping status stays removed');

SELECT pg_temp.act('undo_writer');
SELECT dblink_exec('undo_writer', $$
  UPDATE public.availability_entries
  SET status_type_id='7a5a0000-0000-4000-8000-000000000401', start_date='2030-06-02', end_date='2030-06-03'
  WHERE id='7a5a0000-0000-4000-8000-000000000503'
$$);
SELECT pg_temp.act('undo_restorer');
SELECT dblink_send_query('undo_restorer', $call$
  SELECT count(*)::integer FROM public.restore_availability_entries('7a5a0000-0000-4000-8000-000000000101',
    ARRAY['7a5a0000-0000-4000-8000-000000000502']::uuid[], ARRAY['7a5a0000-0000-4000-8000-000000000301']::uuid[])
$call$);
SELECT ok(pg_temp.restorer_waits(), 'a restore waits for an uncommitted edit of the same Person''s status');
SELECT dblink_exec('undo_writer','COMMIT');
SELECT is((SELECT restored FROM dblink_get_result('undo_restorer') AS result(restored integer)), 0,
  'after the edit commits the restore sees the moved Race Leave and restores nothing');
SELECT * FROM dblink_get_result('undo_restorer') AS result(restored integer);
SELECT dblink_exec('undo_restorer','COMMIT');
SELECT is(pg_temp.entries('7a5a0000-0000-4000-8000-000000000502'), 0, 'the status the edit now overlaps stays removed');

SELECT pg_temp.act('undo_fixture');
SELECT is((SELECT removed FROM dblink('undo_fixture', $call$
  SELECT public.delete_availability_entries('7a5a0000-0000-4000-8000-000000000101',
    ARRAY['7a5a0000-0000-4000-8000-000000000503']::uuid[])
$call$) AS result(removed integer)), 1, 'the operator removes the edited status');
SELECT dblink_exec('undo_fixture','COMMIT');

SELECT pg_temp.act('undo_writer');
SELECT is((SELECT saved FROM dblink('undo_writer', $call$
  SELECT public.import_availability_entries('7a5a0000-0000-4000-8000-000000000101',
    '[{"personnel_id":"7a5a0000-0000-4000-8000-000000000301","status_type_id":"7a5a0000-0000-4000-8000-000000000401",
       "start_date":"2030-05-02","end_date":"2030-05-03","overlap":"none"}]')
$call$) AS result(saved jsonb)), '{"inserted":0,"deleted":0,"stale":[0]}'::jsonb,
  'an import of a status the Person already has saves nothing and keeps its Person lock open');
SELECT pg_temp.act('undo_restorer');
SELECT dblink_send_query('undo_restorer', $call$
  SELECT count(*)::integer FROM public.restore_availability_entries('7a5a0000-0000-4000-8000-000000000101',
    ARRAY['7a5a0000-0000-4000-8000-000000000503']::uuid[], ARRAY['7a5a0000-0000-4000-8000-000000000301']::uuid[])
$call$);
SELECT ok(pg_temp.restorer_waits(), 'a restore queues behind an open import of the same Person');
SELECT dblink_exec('undo_writer','COMMIT');
SELECT is((SELECT restored FROM dblink_get_result('undo_restorer') AS result(restored integer)), 1,
  'once the import commits the restore goes through');
SELECT * FROM dblink_get_result('undo_restorer') AS result(restored integer);
SELECT dblink_exec('undo_restorer','COMMIT');
SELECT is(pg_temp.entries('7a5a0000-0000-4000-8000-000000000503'), 1, 'the restored status is saved');

SELECT pg_temp.act('undo_fixture');
SELECT dblink_exec('undo_fixture', $$
  INSERT INTO public.availability_entries(id,organization_id,personnel_id,status_type_id,start_date,end_date,set_for_tasking_id)
  VALUES ('7a5a0000-0000-4000-8000-000000000504','7a5a0000-0000-4000-8000-000000000101',
    '7a5a0000-0000-4000-8000-000000000301','7a5a0000-0000-4000-8000-000000000402','2030-08-01','2030-08-01',
    '7a5a0000-0000-4000-8000-000000000601')
$$);
SELECT is((SELECT removed FROM dblink('undo_fixture', $call$
  SELECT public.delete_availability_entries('7a5a0000-0000-4000-8000-000000000101',
    ARRAY['7a5a0000-0000-4000-8000-000000000504']::uuid[])
$call$) AS result(removed integer)), 1, 'the operator removes a status set from a Tasking');
SELECT dblink_exec('undo_fixture','COMMIT');
SELECT dblink_exec('undo_writer', 'BEGIN');
SELECT dblink_exec('undo_writer', $$
  DELETE FROM public.calendar_taskings WHERE id='7a5a0000-0000-4000-8000-000000000601'
$$);
SELECT pg_temp.act('undo_restorer');
SELECT dblink_send_query('undo_restorer', $call$
  SELECT count(*)::integer FROM public.restore_availability_entries('7a5a0000-0000-4000-8000-000000000101',
    ARRAY['7a5a0000-0000-4000-8000-000000000504']::uuid[], ARRAY['7a5a0000-0000-4000-8000-000000000301']::uuid[])
$call$);
SELECT ok(pg_temp.restorer_waits(), 'a restore waits for an uncommitted delete of its Tasking');
SELECT dblink_exec('undo_writer','COMMIT');
SELECT is((SELECT restored FROM dblink_get_result('undo_restorer') AS result(restored integer)), 1,
  'once the delete commits the status still comes back');
SELECT * FROM dblink_get_result('undo_restorer') AS result(restored integer);
SELECT dblink_exec('undo_restorer','COMMIT');
SELECT is((SELECT linked FROM dblink('undo_fixture', $query$
  SELECT count(*)::integer FROM public.availability_entries
  WHERE id = '7a5a0000-0000-4000-8000-000000000504' AND set_for_tasking_id IS NULL
$query$) AS result(linked integer)), 1, 'it comes back without the link to the deleted Tasking');

SELECT dblink_exec('undo_restorer', 'BEGIN');
SELECT * FROM dblink('undo_restorer', $$
  SELECT 1 FROM public.personnel WHERE id='7a5a0000-0000-4000-8000-000000000301' FOR UPDATE
$$) AS locked(one integer);
SELECT pg_temp.act('undo_writer');
SELECT dblink_exec('undo_writer', $$SET LOCAL lock_timeout='2s'$$);
SELECT is((SELECT removed FROM dblink('undo_writer', $call$
  SELECT public.delete_availability_entries('7a5a0000-0000-4000-8000-000000000101',
    ARRAY['7a5a0000-0000-4000-8000-000000000503']::uuid[])
$call$) AS result(removed integer)), 1,
  'a removal never waits on the Person lock a restore takes before the Person''s entries');
SELECT dblink_exec('undo_writer','COMMIT');
SELECT dblink_exec('undo_restorer','COMMIT');
SELECT pg_temp.act('undo_writer');
SELECT is((SELECT restored FROM dblink('undo_writer', $call$
  SELECT count(*)::integer FROM public.restore_availability_entries('7a5a0000-0000-4000-8000-000000000101',
    ARRAY['7a5a0000-0000-4000-8000-000000000503']::uuid[], ARRAY['7a5a0000-0000-4000-8000-000000000301']::uuid[])
$call$) AS result(restored integer)), 1, 'its record still restores');
SELECT dblink_exec('undo_writer','COMMIT');

SELECT dblink_exec('undo_fixture', $cleanup$
  DELETE FROM public.organizations WHERE id='7a5a0000-0000-4000-8000-000000000101';
  DELETE FROM auth.users WHERE id='7a5a0000-0000-4000-8000-000000000001';
$cleanup$);
SELECT dblink_disconnect('undo_writer');
SELECT dblink_disconnect('undo_restorer');
SELECT dblink_disconnect('undo_fixture');
SELECT * FROM finish();
ROLLBACK;
