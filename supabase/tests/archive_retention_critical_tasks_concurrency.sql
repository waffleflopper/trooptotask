BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();

SELECT dblink_connect('ct_writer','hostaddr='||host(inet_server_addr())||' port='||current_setting('port')||' user=postgres password=postgres dbname='||current_database()||' application_name=t3_ct_retention_writer');
SELECT dblink_connect('ct_cleanup','hostaddr='||host(inet_server_addr())||' port='||current_setting('port')||' user=postgres password=postgres dbname='||current_database()||' application_name=t3_ct_retention_cleanup');
SELECT dblink_connect('ct_overlap','hostaddr='||host(inet_server_addr())||' port='||current_setting('port')||' user=postgres password=postgres dbname='||current_database()||' application_name=t3_ct_retention_overlap');
SELECT dblink_exec('ct_writer',$$ SET statement_timeout='10s'; SET default_transaction_isolation='read committed' $$);
SELECT dblink_exec('ct_cleanup',$$ SET statement_timeout='10s'; SET default_transaction_isolation='read committed' $$);
SELECT dblink_exec('ct_overlap',$$ SET statement_timeout='10s'; SET default_transaction_isolation='read committed' $$);
SELECT dblink_exec('ct_writer',$fixture$
  INSERT INTO auth.users(id,email) VALUES ('d2540000-0000-4000-8000-000000000001','ct-retention-races@example.test');
  INSERT INTO public.organizations(id,name,created_by,url_slug) VALUES
    ('d2540000-0000-4000-8000-000000000101','CT Completion Race','d2540000-0000-4000-8000-000000000001','ct-retention-completion-race'),
    ('d2540000-0000-4000-8000-000000000102','CT Restore Race','d2540000-0000-4000-8000-000000000001','ct-retention-restore-race'),
    ('d2540000-0000-4000-8000-000000000103','CT Cleanup First','d2540000-0000-4000-8000-000000000001','ct-retention-cleanup-first'),
    ('d2540000-0000-4000-8000-000000000104','CT Overlapping Cleanup','d2540000-0000-4000-8000-000000000001','ct-retention-overlap');
  INSERT INTO public.personnel(id,organization_id,rank,first_name,last_name,slug) VALUES
    ('d2540000-0000-4000-8000-000000000201','d2540000-0000-4000-8000-000000000101','SPC','Completion','Race','ct-retention-completion-person'),
    ('d2540000-0000-4000-8000-000000000203','d2540000-0000-4000-8000-000000000103','SPC','Cleanup','First','ct-retention-cleanup-first-person');
  INSERT INTO public.ict_tasks(id,organization_id,task_code,title,archived_at) VALUES
    ('d2540000-0000-4000-8000-000000000301','d2540000-0000-4000-8000-000000000101','CT-COMPLETION-RACE','Concurrent saved completion','2020-01-01Z'),
    ('d2540000-0000-4000-8000-000000000302','d2540000-0000-4000-8000-000000000102','CT-RESTORE-RACE','Concurrent restoration','2020-01-01Z'),
    ('d2540000-0000-4000-8000-000000000303','d2540000-0000-4000-8000-000000000103','CT-CLEANUP-FIRST','Cleanup wins first','2020-01-01Z'),
    ('d2540000-0000-4000-8000-000000000304','d2540000-0000-4000-8000-000000000104','CT-OVERLAP-1','First overlapping candidate','2020-01-01Z'),
    ('d2540000-0000-4000-8000-000000000305','d2540000-0000-4000-8000-000000000104','CT-OVERLAP-2','Second overlapping candidate','2020-01-01Z');
$fixture$);
CREATE TEMP TABLE ct_race_tasks_before AS
  SELECT id,to_jsonb(task) AS row_data FROM public.ict_tasks AS task
  WHERE organization_id IN ('d2540000-0000-4000-8000-000000000101','d2540000-0000-4000-8000-000000000102','d2540000-0000-4000-8000-000000000103','d2540000-0000-4000-8000-000000000104');

CREATE FUNCTION pg_temp.ct_retention_waits_for(waiter text,blocker text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp()+interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (
      SELECT 1 FROM pg_stat_activity AS waiting
      JOIN pg_stat_activity AS holding ON holding.pid=ANY(pg_blocking_pids(waiting.pid))
      WHERE waiting.application_name=waiter AND holding.application_name=blocker
        AND waiting.wait_event_type='Lock'
    ) THEN RETURN true; END IF;
    IF clock_timestamp()>=deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;

SELECT dblink_exec('ct_cleanup',$$ BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE service_role $$);
SELECT throws_ok($$ SELECT value FROM dblink('ct_cleanup',$call$ SELECT public.delete_expired_unreferenced_critical_tasks('d2540000-0000-4000-8000-000000000101','2025-05-30T12:00:00Z') $call$) AS result(value integer) $$,
  '25001','Critical task retention requires READ COMMITTED','repeatable-read cleanup rejects before mutation');
SELECT dblink_exec('ct_cleanup','ROLLBACK');
SELECT dblink_exec('ct_cleanup',$$ BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL ROLE service_role $$);
SELECT throws_ok($$ SELECT value FROM dblink('ct_cleanup',$call$ SELECT public.delete_expired_unreferenced_critical_tasks('d2540000-0000-4000-8000-000000000101','2025-05-30T12:00:00Z') $call$) AS result(value integer) $$,
  '25001','Critical task retention requires READ COMMITTED','serializable cleanup rejects before mutation');
SELECT dblink_exec('ct_cleanup','ROLLBACK');
SELECT results_eq($$ SELECT id,to_jsonb(task) FROM public.ict_tasks AS task WHERE organization_id IN ('d2540000-0000-4000-8000-000000000101','d2540000-0000-4000-8000-000000000102','d2540000-0000-4000-8000-000000000103','d2540000-0000-4000-8000-000000000104') ORDER BY id $$,
  $$ SELECT * FROM ct_race_tasks_before ORDER BY id $$,'unsupported isolation preserves every task field');

SELECT dblink_exec('ct_writer',$$ BEGIN; SET LOCAL ROLE service_role $$);
SELECT dblink_exec('ct_writer',$insert$
  INSERT INTO public.personnel_ict_completions(id,organization_id,personnel_id,ict_task_id,completed_at,validation_method,notes)
  VALUES ('d2540000-0000-4000-8000-000000000401','d2540000-0000-4000-8000-000000000101','d2540000-0000-4000-8000-000000000201','d2540000-0000-4000-8000-000000000301','2025-01-02','Practical Exercise','Concurrent committed history')
$insert$);
CREATE TEMP TABLE ct_race_completion_before AS
  SELECT row_data FROM dblink('ct_writer',$read$ SELECT to_jsonb(completion) FROM public.personnel_ict_completions AS completion WHERE id='d2540000-0000-4000-8000-000000000401' $read$) AS result(row_data jsonb);
SELECT dblink_exec('ct_cleanup',$$ SET ROLE service_role $$);
SELECT dblink_send_query('ct_cleanup',$call$ SELECT public.delete_expired_unreferenced_critical_tasks('d2540000-0000-4000-8000-000000000101','2025-05-30T12:00:00Z') $call$);
SELECT ok(pg_temp.ct_retention_waits_for('t3_ct_retention_cleanup','t3_ct_retention_writer'),'cleanup waits for the actual completion FK lock');
SELECT dblink_exec('ct_writer','COMMIT');
SELECT is((SELECT value FROM dblink_get_result('ct_cleanup') AS result(value integer)),0,'cleanup sees the completion committed while its lock waited');
SELECT results_eq($$ SELECT to_jsonb(task) FROM public.ict_tasks AS task WHERE id='d2540000-0000-4000-8000-000000000301' $$,
  $$ SELECT row_data FROM ct_race_tasks_before WHERE id='d2540000-0000-4000-8000-000000000301' $$,'the referenced task remains exact');
SELECT results_eq($$ SELECT to_jsonb(completion) FROM public.personnel_ict_completions AS completion WHERE id='d2540000-0000-4000-8000-000000000401' $$,
  $$ SELECT * FROM ct_race_completion_before $$,'the committed completion remains exact');
SELECT * FROM dblink_get_result('ct_cleanup') AS result(value integer);

SELECT dblink_exec('ct_writer',$$ BEGIN; SET LOCAL ROLE service_role $$);
SELECT dblink_exec('ct_writer',$restore$ UPDATE public.ict_tasks SET archived_at=NULL WHERE id='d2540000-0000-4000-8000-000000000302' $restore$);
CREATE TEMP TABLE ct_race_restored_before AS
  SELECT row_data FROM dblink('ct_writer',$read$ SELECT to_jsonb(task) FROM public.ict_tasks AS task WHERE id='d2540000-0000-4000-8000-000000000302' $read$) AS result(row_data jsonb);
SELECT dblink_send_query('ct_cleanup',$call$ SELECT public.delete_expired_unreferenced_critical_tasks('d2540000-0000-4000-8000-000000000102','2025-05-30T12:00:00Z') $call$);
SELECT ok(pg_temp.ct_retention_waits_for('t3_ct_retention_cleanup','t3_ct_retention_writer'),'cleanup waits for the actual task restore lock');
SELECT dblink_exec('ct_writer','COMMIT');
SELECT is((SELECT value FROM dblink_get_result('ct_cleanup') AS result(value integer)),0,'a task restored while cleanup waits is no longer eligible');
SELECT results_eq($$ SELECT to_jsonb(task) FROM public.ict_tasks AS task WHERE id='d2540000-0000-4000-8000-000000000302' $$,
  $$ SELECT * FROM ct_race_restored_before $$,'the completed restoration retains every saved field');
SELECT * FROM dblink_get_result('ct_cleanup') AS result(value integer);

SELECT dblink_exec('ct_cleanup','BEGIN');
SELECT is((SELECT value FROM dblink('ct_cleanup',$call$ SELECT public.delete_expired_unreferenced_critical_tasks('d2540000-0000-4000-8000-000000000103','2025-05-30T12:00:00Z') $call$) AS result(value integer)),1,'cleanup deletes the task while holding its transaction open');
SELECT dblink_exec('ct_writer',$$ BEGIN; SET LOCAL ROLE service_role $$);
SELECT dblink_send_query('ct_writer',$insert$
  INSERT INTO public.personnel_ict_completions(id,organization_id,personnel_id,ict_task_id,completed_at,validation_method)
  VALUES ('d2540000-0000-4000-8000-000000000403','d2540000-0000-4000-8000-000000000103','d2540000-0000-4000-8000-000000000203','d2540000-0000-4000-8000-000000000303','2025-01-03','Practical Exercise') RETURNING id
$insert$);
SELECT ok(pg_temp.ct_retention_waits_for('t3_ct_retention_writer','t3_ct_retention_cleanup'),'the later completion waits for the cleanup transaction');
SELECT dblink_exec('ct_cleanup','COMMIT');
SELECT throws_ok($$ SELECT id FROM dblink_get_result('ct_writer') AS result(id uuid) $$,'23503',NULL,'the later completion fails its FK after cleanup commits');
SELECT * FROM dblink_get_result('ct_writer',false) AS result(id uuid);
SELECT dblink_exec('ct_writer','ROLLBACK');
SELECT is((SELECT count(*)::integer FROM public.ict_tasks WHERE id='d2540000-0000-4000-8000-000000000303'),0,'the successfully deleted task stays absent');
SELECT is((SELECT count(*)::integer FROM public.personnel_ict_completions WHERE id='d2540000-0000-4000-8000-000000000403'),0,'the rejected completion was never saved');

SELECT dblink_exec('ct_writer','BEGIN');
SELECT value FROM dblink('ct_writer',$lock$ SELECT id FROM public.ict_tasks WHERE id='d2540000-0000-4000-8000-000000000304' FOR UPDATE $lock$) AS result(value uuid);
SELECT dblink_send_query('ct_cleanup',$call$ SELECT public.delete_expired_unreferenced_critical_tasks('d2540000-0000-4000-8000-000000000104','2025-05-30T12:00:00Z') $call$);
SELECT ok(pg_temp.ct_retention_waits_for('t3_ct_retention_cleanup','t3_ct_retention_writer'),'the first cleanup waits on the first stable candidate');
SELECT dblink_exec('ct_overlap',$$ SET ROLE service_role $$);
SELECT dblink_send_query('ct_overlap',$call$ SELECT public.delete_expired_unreferenced_critical_tasks('d2540000-0000-4000-8000-000000000104','2025-05-30T12:00:00Z') $call$);
SELECT ok(pg_temp.ct_retention_waits_for('t3_ct_retention_overlap','t3_ct_retention_cleanup'),'the overlapping cleanup queues behind the first candidate lock');
SELECT dblink_exec('ct_writer','COMMIT');
CREATE TEMP TABLE ct_overlap_counts AS
  SELECT value FROM dblink_get_result('ct_cleanup') AS result(value integer);
INSERT INTO ct_overlap_counts SELECT value FROM dblink_get_result('ct_overlap') AS result(value integer);
SELECT results_eq($$ SELECT value FROM ct_overlap_counts ORDER BY value $$,$$ VALUES (0),(2) $$,'overlapping cleanup counts both tasks once, without duplicate deletion');
SELECT is((SELECT count(*)::integer FROM public.ict_tasks WHERE organization_id='d2540000-0000-4000-8000-000000000104'),0,'both overlapping candidates are absent');
SELECT * FROM dblink_get_result('ct_cleanup') AS result(value integer);
SELECT * FROM dblink_get_result('ct_overlap') AS result(value integer);
SELECT is((SELECT value FROM dblink('ct_cleanup',$call$ SELECT public.delete_expired_unreferenced_critical_tasks('d2540000-0000-4000-8000-000000000104','2025-05-30T12:00:00Z') $call$) AS result(value integer)),0,'overlap replay has no new effects');
SELECT results_eq($$ SELECT to_jsonb(task) FROM public.ict_tasks AS task WHERE id='d2540000-0000-4000-8000-000000000301' $$,
  $$ SELECT row_data FROM ct_race_tasks_before WHERE id='d2540000-0000-4000-8000-000000000301' $$,'later cleanups leave the saved completion task unchanged');
SELECT results_eq($$ SELECT to_jsonb(completion) FROM public.personnel_ict_completions AS completion WHERE id='d2540000-0000-4000-8000-000000000401' $$,
  $$ SELECT * FROM ct_race_completion_before $$,'later cleanups leave the committed completion unchanged');

SELECT dblink_exec('ct_writer',$cleanup$
  DELETE FROM public.organizations WHERE id IN ('d2540000-0000-4000-8000-000000000101','d2540000-0000-4000-8000-000000000102','d2540000-0000-4000-8000-000000000103','d2540000-0000-4000-8000-000000000104');
  DELETE FROM auth.users WHERE id='d2540000-0000-4000-8000-000000000001';
$cleanup$);
SELECT is((SELECT count(*)::integer FROM public.organizations WHERE id IN ('d2540000-0000-4000-8000-000000000101','d2540000-0000-4000-8000-000000000102','d2540000-0000-4000-8000-000000000103','d2540000-0000-4000-8000-000000000104')),0,'the disposable race fixtures are removed');
SELECT dblink_disconnect('ct_writer');
SELECT dblink_disconnect('ct_cleanup');
SELECT dblink_disconnect('ct_overlap');
SELECT * FROM finish();
ROLLBACK;
