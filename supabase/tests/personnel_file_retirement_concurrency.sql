-- Real SQL sessions and lock ordering for Personnel file keys; not Storage/API
-- byte or native UI proof.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();
SELECT dblink_connect('f643_first','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=f643_first');
SELECT dblink_connect('f643_second','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=f643_second');
SELECT dblink_exec('f643_first',$setup$
  CREATE SCHEMA f643_test;
  CREATE FUNCTION f643_test.capture(statement text) RETURNS jsonb LANGUAGE plpgsql AS $body$
  DECLARE changed bigint; answer text;
  BEGIN
    IF statement ~* '^\s*select' THEN EXECUTE statement INTO answer; ELSE EXECUTE statement; END IF;
    GET DIAGNOSTICS changed = ROW_COUNT;
    RETURN jsonb_build_object('code','00000','affected',changed,'answer',answer);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('code',SQLSTATE,'message',SQLERRM);
  END;
  $body$;
  CREATE FUNCTION f643_test.doc(name text) RETURNS text LANGUAGE sql AS $body$
    SELECT 'f6431000-0000-4000-8000-000000000101/personnel/f6431000-0000-4000-8000-000000000301/documents/' || name
  $body$;
  CREATE FUNCTION f643_test.retirement(name text) RETURNS text LANGUAGE sql AS $body$
    SELECT CASE WHEN object_name IS NULL THEN 'removed' ELSE 'pending' END FROM organization_private.file_retirements
    WHERE key_digest = sha256(convert_to('personnel-documents/' || f643_test.doc(name), 'UTF8'))
  $body$;
  CREATE FUNCTION f643_test.attach(id uuid, name text) RETURNS text LANGUAGE sql AS $body$
    SELECT format($q$INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by)
      VALUES (%L, 'f6431000-0000-4000-8000-000000000101', 'f6431000-0000-4000-8000-000000000301', 'Concurrent', %L, 1, 'application/pdf', 'fixture')$q$, id, f643_test.doc(name))
  $body$;
  GRANT USAGE ON SCHEMA f643_test TO service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA f643_test TO service_role;
  INSERT INTO auth.users(id,email) VALUES ('f6431000-0000-4000-8000-000000000001','file-retirement-race@example.test');
  INSERT INTO public.organizations(id,name,created_by) VALUES ('f6431000-0000-4000-8000-000000000101','File retirement race','f6431000-0000-4000-8000-000000000001');
  INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
    ('f6431000-0000-4000-8000-000000000301','f6431000-0000-4000-8000-000000000101','SGT','Race','Person','file-retirement-race');
  INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by, archived_at) VALUES
    ('f6431000-0000-4000-8000-000000000501','f6431000-0000-4000-8000-000000000101','f6431000-0000-4000-8000-000000000301','Last', f643_test.doc('retire-first.pdf'),1,'application/pdf','fixture','2030-01-01T00:00:00Z'),
    ('f6431000-0000-4000-8000-000000000502','f6431000-0000-4000-8000-000000000101','f6431000-0000-4000-8000-000000000301','Last', f643_test.doc('attach-first.pdf'),1,'application/pdf','fixture','2030-01-01T00:00:00Z'),
    ('f6431000-0000-4000-8000-000000000503','f6431000-0000-4000-8000-000000000101','f6431000-0000-4000-8000-000000000301','Restored', f643_test.doc('restored.pdf'),1,'application/pdf','fixture','2030-01-01T00:00:00Z'),
    ('f6431000-0000-4000-8000-000000000504','f6431000-0000-4000-8000-000000000101','f6431000-0000-4000-8000-000000000301','Retention', f643_test.doc('retention.pdf'),1,'application/pdf','fixture','2020-01-01T00:00:00Z');
$setup$);
SELECT dblink_exec('f643_first', $$SET statement_timeout='10s'$$);
SELECT dblink_exec('f643_second', $$SET statement_timeout='10s'$$);
CREATE TEMP TABLE f643_sessions(name text PRIMARY KEY,pid integer);
INSERT INTO f643_sessions SELECT 'first',pid FROM dblink('f643_first','SELECT pg_backend_pid()') AS s(pid integer);
INSERT INTO f643_sessions SELECT 'second',pid FROM dblink('f643_second','SELECT pg_backend_pid()') AS s(pid integer);
SELECT is((SELECT count(DISTINCT pid)::integer FROM f643_sessions),2,'two independent real sessions');
CREATE TEMP TABLE f643_waits(case_name text,receipt jsonb);
CREATE FUNCTION pg_temp.f643_wait(case_name text,waiter text,blocker text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp()+interval '5 seconds'; evidence jsonb; blocked boolean;
BEGIN
 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT b.pid=ANY(pg_blocking_pids(a.pid)) AND a.state='active' AND a.wait_event_type='Lock',
    jsonb_build_object('waiter',w.name,'wait_event',a.wait_event,'blockers',pg_blocking_pids(a.pid))
    INTO blocked,evidence FROM pg_stat_activity a JOIN f643_sessions w ON w.pid=a.pid
      CROSS JOIN f643_sessions b WHERE w.name=waiter AND b.name=blocker;
  IF blocked THEN INSERT INTO f643_waits VALUES(case_name,evidence); RETURN true; END IF;
  IF clock_timestamp()>deadline THEN RETURN false; END IF;
  PERFORM pg_sleep(0.01);
 END LOOP;
END;
$$;
CREATE TEMP TABLE f643_results(case_name text,result jsonb);

-- Retiring the last reference first makes a waiting attachment fail.
SELECT dblink_exec('f643_first', $$BEGIN; DELETE FROM public.personnel_documents WHERE id='f6431000-0000-4000-8000-000000000501'$$);
SELECT dblink_exec('f643_second', 'BEGIN');
SELECT dblink_send_query('f643_second', $$SELECT f643_test.capture(f643_test.attach('f6431000-0000-4000-8000-000000000511','retire-first.pdf'))$$);
SELECT ok(pg_temp.f643_wait('retire-before-attach','second','first'),'attachment waits on the key held by the retiring delete');
SELECT dblink_exec('f643_first','COMMIT');
INSERT INTO f643_results SELECT 'retire-before-attach',result FROM dblink_get_result('f643_second') AS r(result jsonb);
SELECT result FROM dblink_get_result('f643_second') AS r(result jsonb);
SELECT dblink_exec('f643_second','COMMIT');
SELECT is((SELECT result->>'code' FROM f643_results WHERE case_name='retire-before-attach'),'23514','the waiting attachment cannot claim the retired key');
SELECT is(f643_test.retirement('retire-first.pdf'),'pending','the key stays retired');

-- Attaching first keeps the key referenced, so the waiting delete does not retire it.
SELECT dblink_exec('f643_first', 'BEGIN');
SELECT result FROM dblink('f643_first', $$SELECT f643_test.capture(f643_test.attach('f6431000-0000-4000-8000-000000000512','attach-first.pdf'))$$) AS r(result jsonb);
SELECT dblink_exec('f643_second', 'BEGIN');
SELECT dblink_send_query('f643_second', $$SELECT f643_test.capture($q$DELETE FROM public.personnel_documents WHERE id='f6431000-0000-4000-8000-000000000502'$q$)$$);
SELECT ok(pg_temp.f643_wait('attach-before-retire','second','first'),'the delete waits on the key held by the attachment');
SELECT dblink_exec('f643_first','COMMIT');
INSERT INTO f643_results SELECT 'attach-before-retire',result FROM dblink_get_result('f643_second') AS r(result jsonb);
SELECT result FROM dblink_get_result('f643_second') AS r(result jsonb);
SELECT dblink_exec('f643_second','COMMIT');
SELECT is((SELECT result->>'code' FROM f643_results WHERE case_name='attach-before-retire'),'00000','the delete completes');
SELECT is(f643_test.retirement('attach-first.pdf'),NULL,'a key the committed attachment references is not retired');

-- A restore committed while the conditional delete waits keeps the record.
SELECT dblink_exec('f643_first', $$BEGIN; UPDATE public.personnel_documents SET archived_at=NULL WHERE id='f6431000-0000-4000-8000-000000000503'$$);
SELECT dblink_exec('f643_second', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
SELECT dblink_send_query('f643_second', $$SELECT f643_test.capture($q$SELECT count(*) FROM public.delete_archived_personnel_artifact('f6431000-0000-4000-8000-000000000101','f6431000-0000-4000-8000-000000000301','document','f6431000-0000-4000-8000-000000000503','2030-01-01T00:00:00Z')$q$)$$);
SELECT ok(pg_temp.f643_wait('restore-before-delete','second','first'),'the conditional delete waits behind the restore');
SELECT dblink_exec('f643_first','COMMIT');
INSERT INTO f643_results SELECT 'restore-before-delete',result FROM dblink_get_result('f643_second') AS r(result jsonb);
SELECT result FROM dblink_get_result('f643_second') AS r(result jsonb);
SELECT dblink_exec('f643_second','COMMIT');
SELECT is((SELECT result->>'answer' FROM f643_results WHERE case_name='restore-before-delete'),'0','the stale delete reports nothing deleted');
SELECT is((SELECT archived_at FROM public.personnel_documents WHERE id='f6431000-0000-4000-8000-000000000503'),NULL,'the restored record remains active');

-- Scheduled retention rechecks the archive state after waiting.
SELECT dblink_exec('f643_first', $$BEGIN; UPDATE public.personnel_documents SET archived_at=NULL WHERE id='f6431000-0000-4000-8000-000000000504'$$);
SELECT dblink_exec('f643_second', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
SELECT dblink_send_query('f643_second', $$SELECT f643_test.capture($q$DELETE FROM public.personnel_documents WHERE organization_id='f6431000-0000-4000-8000-000000000101' AND archived_at IS NOT NULL AND archived_at < '2021-01-01T00:00:00Z'$q$)$$);
SELECT ok(pg_temp.f643_wait('restore-before-retention','second','first'),'retention waits behind the restore');
SELECT dblink_exec('f643_first','COMMIT');
INSERT INTO f643_results SELECT 'restore-before-retention',result FROM dblink_get_result('f643_second') AS r(result jsonb);
SELECT result FROM dblink_get_result('f643_second') AS r(result jsonb);
SELECT dblink_exec('f643_second','COMMIT');
SELECT is((SELECT (result->>'affected')::integer FROM f643_results WHERE case_name='restore-before-retention'),0,'retention deletes no restored record');
SELECT is(f643_test.retirement('retention.pdf'),NULL,'the restored record keeps its key');

-- Reconciliation that waits for an in-flight attachment returns it.
SELECT dblink_exec('f643_first', 'BEGIN');
SELECT result FROM dblink('f643_first', $$SELECT f643_test.capture(f643_test.attach('f6431000-0000-4000-8000-000000000513','late-ack.pdf'))$$) AS r(result jsonb);
SELECT dblink_exec('f643_second', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
SELECT dblink_send_query('f643_second', $$SELECT f643_test.capture($q$SELECT public.reconcile_personnel_file_attachment('f6431000-0000-4000-8000-000000000101','f6431000-0000-4000-8000-000000000301','document',f643_test.doc('late-ack.pdf'))$q$)$$);
SELECT ok(pg_temp.f643_wait('attach-before-reconcile','second','first'),'reconciliation waits on the attaching key');
SELECT dblink_exec('f643_first','COMMIT');
INSERT INTO f643_results SELECT 'attach-before-reconcile',result FROM dblink_get_result('f643_second') AS r(result jsonb);
SELECT result FROM dblink_get_result('f643_second') AS r(result jsonb);
SELECT dblink_exec('f643_second','COMMIT');
SELECT is((SELECT result->>'answer' FROM f643_results WHERE case_name='attach-before-reconcile'),'f6431000-0000-4000-8000-000000000513','reconciliation returns the committed attachment');
SELECT is(f643_test.retirement('late-ack.pdf'),NULL,'the attached key is not retired');

-- Reconciliation first retires the key, so a late attachment fails.
SELECT dblink_exec('f643_first', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
SELECT result FROM dblink('f643_first', $$SELECT f643_test.capture($q$SELECT public.reconcile_personnel_file_attachment('f6431000-0000-4000-8000-000000000101','f6431000-0000-4000-8000-000000000301','document',f643_test.doc('lost.pdf'))$q$)$$) AS r(result jsonb);
SELECT dblink_exec('f643_second', 'BEGIN');
SELECT dblink_send_query('f643_second', $$SELECT f643_test.capture(f643_test.attach('f6431000-0000-4000-8000-000000000514','lost.pdf'))$$);
SELECT ok(pg_temp.f643_wait('reconcile-before-attach','second','first'),'the late attachment waits on the reconciling key');
SELECT dblink_exec('f643_first','COMMIT');
INSERT INTO f643_results SELECT 'reconcile-before-attach',result FROM dblink_get_result('f643_second') AS r(result jsonb);
SELECT result FROM dblink_get_result('f643_second') AS r(result jsonb);
SELECT dblink_exec('f643_second','COMMIT');
SELECT is((SELECT result->>'code' FROM f643_results WHERE case_name='reconcile-before-attach'),'23514','the late attachment cannot claim the reconciled key');

-- Overlapping workers list different pending keys without a lease.
SELECT dblink_exec('f643_first', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
SELECT dblink_exec('f643_second', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
CREATE TEMP TABLE f643_pages(worker text,object_name text);
INSERT INTO f643_pages SELECT 'first',object_name FROM dblink('f643_first', $$SELECT object_name FROM public.list_pending_organization_file_retirements(1)$$) AS r(object_name text);
INSERT INTO f643_pages SELECT 'second',object_name FROM dblink('f643_second', $$SELECT object_name FROM public.list_pending_organization_file_retirements(1)$$) AS r(object_name text);
SELECT dblink_exec('f643_first','ROLLBACK');
SELECT dblink_exec('f643_second','ROLLBACK');
SELECT is((SELECT count(DISTINCT object_name)::integer FROM f643_pages),2,'an in-flight page is skipped by another worker');

SELECT diag('PERSONNEL_FILE_RETIREMENT_WAIT_RECEIPTS=' || (SELECT jsonb_agg(to_jsonb(r) ORDER BY case_name)::text FROM f643_waits r));
SELECT diag('PERSONNEL_FILE_RETIREMENT_RESULTS=' || (SELECT jsonb_agg(to_jsonb(r) ORDER BY case_name)::text FROM f643_results r));
SELECT dblink_exec('f643_first', $$
  DELETE FROM public.organizations WHERE id='f6431000-0000-4000-8000-000000000101';
  DELETE FROM organization_private.file_retirements WHERE object_name LIKE 'f6431000-0000-4000-8000-000000000101/%';
  DELETE FROM organization_private.file_artifact_deletions WHERE organization_id='f6431000-0000-4000-8000-000000000101';
  DELETE FROM auth.users WHERE id='f6431000-0000-4000-8000-000000000001';
  DROP SCHEMA f643_test CASCADE$$);
SELECT is((SELECT count(*)::integer FROM organization_private.file_retirements WHERE object_name LIKE 'f6431000-%'),0,'committed test keys are cleaned');
SELECT ok(to_regnamespace('f643_test') IS NULL,'committed test support schema is removed');
SELECT dblink_disconnect('f643_first');
SELECT dblink_disconnect('f643_second');
SELECT * FROM finish();
ROLLBACK;
