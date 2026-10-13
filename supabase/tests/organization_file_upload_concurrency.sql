-- Real SQL sessions and lock ordering; not Storage/API byte or native UI proof.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();
SELECT dblink_connect('d17_holder','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=d17_upload_holder');
SELECT dblink_connect('d17_service','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=d17_upload_service');
SELECT dblink_connect('d17_owner','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=d17_upload_owner');
SELECT dblink_exec('d17_holder',$setup$
  CREATE SCHEMA d17_upload_test;
  CREATE FUNCTION d17_upload_test.capture(statement text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $body$
  DECLARE changed bigint;
  BEGIN
    EXECUTE statement;
    GET DIAGNOSTICS changed = ROW_COUNT;
    RETURN jsonb_build_object('code','00000','affected',changed,'isolation',current_setting('transaction_isolation'));
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('code',SQLSTATE,'message',SQLERRM);
  END;
  $body$;
  GRANT USAGE ON SCHEMA d17_upload_test TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION d17_upload_test.capture(text) TO authenticated, service_role;
  INSERT INTO auth.users(id,email) VALUES
    ('fa181000-0000-4000-8000-000000000001','d17-upload-lock-owner@example.test'),
    ('fa181000-0000-4000-8000-000000000002','d17-upload-lock-admin@example.test');
  INSERT INTO public.organizations(id,name,created_by) VALUES
    ('fa181000-0000-4000-8000-000000000101','D17 lock A','fa181000-0000-4000-8000-000000000001'),
    ('fa181000-0000-4000-8000-000000000103','D17 delete first','fa181000-0000-4000-8000-000000000001');
  INSERT INTO public.organization_memberships(organization_id,user_id,role,member_preset,access_scope_kind) VALUES
    ('fa181000-0000-4000-8000-000000000101','fa181000-0000-4000-8000-000000000001','owner','viewer','organization'),
    ('fa181000-0000-4000-8000-000000000101','fa181000-0000-4000-8000-000000000002','admin','viewer','organization'),
    ('fa181000-0000-4000-8000-000000000103','fa181000-0000-4000-8000-000000000001','owner','viewer','organization');
$setup$);
SELECT dblink_exec('d17_holder', $$SET statement_timeout='10s'$$);
SELECT dblink_exec('d17_service', $$SET statement_timeout='10s'$$);
SELECT dblink_exec('d17_owner', $$SET statement_timeout='10s'$$);
CREATE TEMP TABLE d17_upload_sessions(name text PRIMARY KEY,pid integer);
INSERT INTO d17_upload_sessions SELECT 'holder',pid FROM dblink('d17_holder','SELECT pg_backend_pid()') AS s(pid integer);
INSERT INTO d17_upload_sessions SELECT 'service',pid FROM dblink('d17_service','SELECT pg_backend_pid()') AS s(pid integer);
INSERT INTO d17_upload_sessions SELECT 'owner',pid FROM dblink('d17_owner','SELECT pg_backend_pid()') AS s(pid integer);
SELECT is((SELECT count(DISTINCT pid)::integer FROM d17_upload_sessions),3,'three independent real actor sessions');
CREATE TEMP TABLE d17_upload_waits(case_name text,observed_at timestamptz,receipt jsonb);
CREATE FUNCTION pg_temp.d17_wait(case_name text,waiter text,blocker text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp()+interval '5 seconds'; evidence jsonb; blocked boolean;
BEGIN
 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT b.pid=ANY(pg_blocking_pids(a.pid)) AND a.state='active' AND a.wait_event_type='Lock',
    jsonb_build_object('waiter',w.name,'pid',a.pid,'state',a.state,'wait_event_type',a.wait_event_type,
      'wait_event',a.wait_event,'blockers',pg_blocking_pids(a.pid),'query',a.query)
    INTO blocked,evidence FROM pg_stat_activity a JOIN d17_upload_sessions w ON w.pid=a.pid
      CROSS JOIN d17_upload_sessions b WHERE w.name=waiter AND b.name=blocker;
  IF blocked THEN INSERT INTO d17_upload_waits VALUES(case_name,clock_timestamp(),evidence); RETURN true; END IF;
  IF clock_timestamp()>deadline THEN RETURN false; END IF;
  PERFORM pg_sleep(0.01);
 END LOOP;
END;
$$;
CREATE TEMP TABLE d17_upload_results(case_name text,result jsonb);

-- An admission committed while DELETE waits must be visible after its row lock.
SELECT dblink_exec('d17_service', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
INSERT INTO d17_upload_results SELECT 'initial-admission',result FROM dblink('d17_service', $$SELECT d17_upload_test.capture($query$SELECT public.register_organization_file_upload('fa181000-0000-4000-8000-000000000601','fa181000-0000-4000-8000-000000000101','fa181000-0000-4000-8000-000000000001','personnel-documents','fa181000-0000-4000-8000-000000000101/held.pdf')$query$)$$) AS r(result jsonb);
SELECT is((SELECT result->>'code' FROM d17_upload_results WHERE case_name='initial-admission'),'00000','the blocking admission succeeds before DELETE starts');
SELECT dblink_exec('d17_owner', $$BEGIN; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SET LOCAL "request.jwt.claim.sub" = 'fa181000-0000-4000-8000-000000000001'$$);
SELECT dblink_send_query('d17_owner', $$SELECT d17_upload_test.capture($query$DELETE FROM public.organizations WHERE id='fa181000-0000-4000-8000-000000000101' AND name='D17 lock A'$query$)$$);
SELECT ok(pg_temp.d17_wait('admit-before-delete','owner','service'),'ordinary DELETE actually waits behind admission');
SELECT dblink_exec('d17_service','COMMIT');
INSERT INTO d17_upload_results SELECT 'admit-before-delete',result FROM dblink_get_result('d17_owner') AS r(result jsonb);
SELECT result FROM dblink_get_result('d17_owner') AS r(result jsonb);
SELECT is((SELECT result->>'code' FROM d17_upload_results WHERE case_name='admit-before-delete'),'P0001','new committed registration refuses waited DELETE');
SELECT is((SELECT result->>'message' FROM d17_upload_results WHERE case_name='admit-before-delete'),'An Organization file upload is still in progress','the refusal identifies the active registration');
SELECT dblink_exec('d17_owner','ROLLBACK');
SELECT is((SELECT count(*)::integer FROM organization_private.file_uploads WHERE id='fa181000-0000-4000-8000-000000000601'),1,'registration survives the refused deletion');

-- Settlement and metadata commit together while DELETE has an earlier snapshot.
SELECT dblink_exec('d17_holder', $$BEGIN; DO $body$ BEGIN PERFORM 1 FROM public.organizations WHERE id='fa181000-0000-4000-8000-000000000101' FOR UPDATE; END $body$;$$);
SELECT dblink_exec('d17_owner', $$BEGIN; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SET LOCAL "request.jwt.claim.sub" = 'fa181000-0000-4000-8000-000000000001'$$);
SELECT dblink_send_query('d17_owner', $$SELECT d17_upload_test.capture($query$DELETE FROM public.organizations WHERE id='fa181000-0000-4000-8000-000000000101' AND name='D17 lock A'$query$)$$);
SELECT ok(pg_temp.d17_wait('settle-before-delete','owner','holder'),'ordinary DELETE actually waits before settlement');
SELECT dblink_exec('d17_holder', $$SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'; INSERT INTO storage.objects(id,bucket_id,name,version) VALUES('fa181000-0000-4000-8000-000000000501','personnel-documents','fa181000-0000-4000-8000-000000000101/held.pdf','synthetic-version')$$);
SELECT result FROM dblink('d17_holder', $$SELECT public.settle_organization_file_upload('fa181000-0000-4000-8000-000000000601','fa181000-0000-4000-8000-000000000101','fa181000-0000-4000-8000-000000000001','personnel-documents','fa181000-0000-4000-8000-000000000101/held.pdf')$$) AS r(result boolean);
SELECT dblink_exec('d17_holder','COMMIT');
INSERT INTO d17_upload_results SELECT 'settle-before-delete',result FROM dblink_get_result('d17_owner') AS r(result jsonb);
SELECT result FROM dblink_get_result('d17_owner') AS r(result jsonb);
SELECT is((SELECT result->>'message' FROM d17_upload_results WHERE case_name='settle-before-delete'),'Organization files must be removed before deletion','waited DELETE sees new metadata after settlement rather than its old registration snapshot');
SELECT dblink_exec('d17_owner','ROLLBACK');
SELECT is((SELECT count(*)::integer FROM organization_private.file_uploads WHERE organization_id='fa181000-0000-4000-8000-000000000101'),0,'completed registration is gone');
SELECT is((SELECT count(*)::integer FROM storage.objects WHERE id='fa181000-0000-4000-8000-000000000501'),1,'completed file metadata remains');
SELECT dblink_exec('d17_holder', $$BEGIN; SET LOCAL "storage.allow_delete_query" = 'true'; DELETE FROM storage.objects WHERE id='fa181000-0000-4000-8000-000000000501'; COMMIT$$);

-- A winning parent deletion excludes the waiting begin before any byte call.
SELECT dblink_exec('d17_owner', $$BEGIN; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SET LOCAL "request.jwt.claim.sub" = 'fa181000-0000-4000-8000-000000000001'; DELETE FROM public.organizations WHERE id='fa181000-0000-4000-8000-000000000103'$$);
SELECT dblink_exec('d17_service', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
SELECT dblink_send_query('d17_service', $$SELECT d17_upload_test.capture($query$SELECT public.register_organization_file_upload('fa181000-0000-4000-8000-000000000603','fa181000-0000-4000-8000-000000000103','fa181000-0000-4000-8000-000000000001','personnel-documents','fa181000-0000-4000-8000-000000000103/late.pdf')$query$)$$);
SELECT ok(pg_temp.d17_wait('delete-before-admit','service','owner'),'new registration actually waits behind deletion');
SELECT dblink_exec('d17_owner','COMMIT');
INSERT INTO d17_upload_results SELECT 'delete-before-admit',result FROM dblink_get_result('d17_service') AS r(result jsonb);
SELECT result FROM dblink_get_result('d17_service') AS r(result jsonb);
SELECT is((SELECT result->>'message' FROM d17_upload_results WHERE case_name='delete-before-admit'),'Organization is unavailable for file uploads','waiting registration rejects the deleted parent');
SELECT dblink_exec('d17_service','ROLLBACK');
SELECT is((SELECT count(*)::integer FROM organization_private.file_uploads WHERE id='fa181000-0000-4000-8000-000000000603'),0,'losing admission creates no registration');
SELECT is((SELECT count(*)::integer FROM public.organizations WHERE id='fa181000-0000-4000-8000-000000000103'),0,'winning parent deletion is committed');

-- Authority changed while the final DELETE waited must also be read freshly.
SELECT dblink_exec('d17_holder', $$BEGIN; DO $body$ BEGIN PERFORM 1 FROM public.organizations WHERE id='fa181000-0000-4000-8000-000000000101' FOR UPDATE; END $body$;$$);
SELECT dblink_exec('d17_owner', $$BEGIN; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SET LOCAL "request.jwt.claim.sub" = 'fa181000-0000-4000-8000-000000000001'$$);
SELECT dblink_send_query('d17_owner', $$SELECT d17_upload_test.capture($query$DELETE FROM public.organizations WHERE id='fa181000-0000-4000-8000-000000000101' AND name='D17 lock A'$query$)$$);
SELECT ok(pg_temp.d17_wait('owner-lost','owner','holder'),'final DELETE actually waits before ownership transfer');
SELECT dblink_exec('d17_holder', $$SET LOCAL "request.jwt.claim.sub" = 'fa181000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('d17_holder', $$SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SELECT public.transfer_org_ownership('fa181000-0000-4000-8000-000000000101','fa181000-0000-4000-8000-000000000002'); COMMIT$$);
INSERT INTO d17_upload_results SELECT 'owner-lost',result FROM dblink_get_result('d17_owner') AS r(result jsonb);
SELECT result FROM dblink_get_result('d17_owner') AS r(result jsonb);
SELECT is((SELECT result->>'code' FROM d17_upload_results WHERE case_name='owner-lost'),'42501','former owner cannot complete a waited deletion');
SELECT dblink_exec('d17_owner','ROLLBACK');
SELECT is((SELECT count(*)::integer FROM public.organizations WHERE id='fa181000-0000-4000-8000-000000000101'),1,'Organization survives owner loss');
SELECT dblink_exec('d17_holder', $$UPDATE public.organization_memberships SET role=CASE user_id WHEN 'fa181000-0000-4000-8000-000000000001'::uuid THEN 'owner'::public.organization_role ELSE 'admin'::public.organization_role END WHERE organization_id='fa181000-0000-4000-8000-000000000101'$$);

-- A changed name is re-evaluated by the original conditional DELETE predicate.
SELECT dblink_exec('d17_holder', $$BEGIN; UPDATE public.organizations SET name='D17 renamed while waiting' WHERE id='fa181000-0000-4000-8000-000000000101'$$);
SELECT dblink_exec('d17_owner', $$BEGIN; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SET LOCAL "request.jwt.claim.sub" = 'fa181000-0000-4000-8000-000000000001'$$);
SELECT dblink_send_query('d17_owner', $$SELECT d17_upload_test.capture($query$DELETE FROM public.organizations WHERE id='fa181000-0000-4000-8000-000000000101' AND name='D17 lock A'$query$)$$);
SELECT ok(pg_temp.d17_wait('name-changed','owner','holder'),'conditional DELETE actually waits behind rename');
SELECT dblink_exec('d17_holder','COMMIT');
INSERT INTO d17_upload_results SELECT 'name-changed',result FROM dblink_get_result('d17_owner') AS r(result jsonb);
SELECT result FROM dblink_get_result('d17_owner') AS r(result jsonb);
SELECT is((SELECT result->>'code' FROM d17_upload_results WHERE case_name='name-changed'),'00000','stale-name DELETE completes without a hidden error');
SELECT is((SELECT (result->>'affected')::integer FROM d17_upload_results WHERE case_name='name-changed'),0,'stale name has no parent acknowledgment after the wait');
SELECT dblink_exec('d17_owner','ROLLBACK');
SELECT is((SELECT name FROM public.organizations WHERE id='fa181000-0000-4000-8000-000000000101'),'D17 renamed while waiting','renamed parent remains');

-- Stronger transaction snapshots cannot masquerade as the fresh-query contract.
SELECT dblink_exec('d17_service', $$BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'; SET LOCAL "request.jwt.claim.sub" = 'fa181000-0000-4000-8000-000000000001'$$);
INSERT INTO d17_upload_results SELECT 'repeatable-register',result FROM dblink('d17_service', $$SELECT d17_upload_test.capture($query$SELECT public.register_organization_file_upload('fa181000-0000-4000-8000-000000000604','fa181000-0000-4000-8000-000000000101','fa181000-0000-4000-8000-000000000001','personnel-documents','fa181000-0000-4000-8000-000000000101/strong.pdf')$query$)$$) AS r(result jsonb);
SELECT dblink_exec('d17_service','ROLLBACK');
SELECT dblink_exec('d17_service', $$BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'; SET LOCAL "request.jwt.claim.sub" = 'fa181000-0000-4000-8000-000000000001'$$);
INSERT INTO d17_upload_results SELECT 'repeatable-settle',result FROM dblink('d17_service', $$SELECT d17_upload_test.capture($query$SELECT public.settle_organization_file_upload('fa181000-0000-4000-8000-000000000604','fa181000-0000-4000-8000-000000000101','fa181000-0000-4000-8000-000000000001','personnel-documents','fa181000-0000-4000-8000-000000000101/strong.pdf')$query$)$$) AS r(result jsonb);
SELECT dblink_exec('d17_service','ROLLBACK');
SELECT dblink_exec('d17_owner', $$BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SET LOCAL "request.jwt.claim.sub" = 'fa181000-0000-4000-8000-000000000001'$$);
INSERT INTO d17_upload_results SELECT 'repeatable-delete',result FROM dblink('d17_owner', $$SELECT d17_upload_test.capture($query$DELETE FROM public.organizations WHERE id='fa181000-0000-4000-8000-000000000101'$query$)$$) AS r(result jsonb);
SELECT dblink_exec('d17_owner','ROLLBACK');
SELECT dblink_exec('d17_service', $$BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'; SET LOCAL "request.jwt.claim.sub" = 'fa181000-0000-4000-8000-000000000001'$$);
INSERT INTO d17_upload_results SELECT 'serializable-register',result FROM dblink('d17_service', $$SELECT d17_upload_test.capture($query$SELECT public.register_organization_file_upload('fa181000-0000-4000-8000-000000000604','fa181000-0000-4000-8000-000000000101','fa181000-0000-4000-8000-000000000001','personnel-documents','fa181000-0000-4000-8000-000000000101/strong.pdf')$query$)$$) AS r(result jsonb);
SELECT dblink_exec('d17_service','ROLLBACK');
SELECT dblink_exec('d17_service', $$BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'; SET LOCAL "request.jwt.claim.sub" = 'fa181000-0000-4000-8000-000000000001'$$);
INSERT INTO d17_upload_results SELECT 'serializable-settle',result FROM dblink('d17_service', $$SELECT d17_upload_test.capture($query$SELECT public.settle_organization_file_upload('fa181000-0000-4000-8000-000000000604','fa181000-0000-4000-8000-000000000101','fa181000-0000-4000-8000-000000000001','personnel-documents','fa181000-0000-4000-8000-000000000101/strong.pdf')$query$)$$) AS r(result jsonb);
SELECT dblink_exec('d17_service','ROLLBACK');
SELECT dblink_exec('d17_owner', $$BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SET LOCAL "request.jwt.claim.sub" = 'fa181000-0000-4000-8000-000000000001'$$);
INSERT INTO d17_upload_results SELECT 'serializable-delete',result FROM dblink('d17_owner', $$SELECT d17_upload_test.capture($query$DELETE FROM public.organizations WHERE id='fa181000-0000-4000-8000-000000000101'$query$)$$) AS r(result jsonb);
SELECT dblink_exec('d17_owner','ROLLBACK');
SELECT results_eq($$SELECT case_name,result->>'code' FROM d17_upload_results WHERE case_name LIKE 'repeatable-%' OR case_name LIKE 'serializable-%' ORDER BY 1$$,
  $$SELECT * FROM (VALUES('repeatable-delete','25000'),('repeatable-register','25000'),('repeatable-settle','25000'),('serializable-delete','25000'),('serializable-register','25000'),('serializable-settle','25000')) AS expected(case_name,code)$$,'begin, settlement and deletion reject both unsupported isolation levels');
SELECT ok((SELECT bool_and(result->>'isolation'='read committed') FROM d17_upload_results WHERE result->>'code'='00000'),'successful actor statements use the required READ COMMITTED isolation');
SELECT diag('ORGANIZATION_FILE_UPLOAD_WAIT_RECEIPTS=' || (SELECT jsonb_agg(to_jsonb(r) ORDER BY case_name)::text FROM d17_upload_waits r));
SELECT diag('ORGANIZATION_FILE_UPLOAD_ORDERING_RESULTS=' || (SELECT jsonb_agg(to_jsonb(r) ORDER BY case_name)::text FROM d17_upload_results r));
SELECT dblink_exec('d17_holder', $$DELETE FROM public.organizations WHERE id='fa181000-0000-4000-8000-000000000101'; DELETE FROM auth.users WHERE id IN ('fa181000-0000-4000-8000-000000000001','fa181000-0000-4000-8000-000000000002'); DROP SCHEMA d17_upload_test CASCADE$$);
SELECT is((SELECT count(*)::integer FROM public.organizations WHERE id IN ('fa181000-0000-4000-8000-000000000101','fa181000-0000-4000-8000-000000000103')),0,'exact committed test Organizations are cleaned');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id IN ('fa181000-0000-4000-8000-000000000001','fa181000-0000-4000-8000-000000000002')),0,'exact committed test accounts are cleaned');
SELECT ok(to_regnamespace('d17_upload_test') IS NULL,'committed test support schema is removed');
SELECT dblink_disconnect('d17_holder');
SELECT dblink_disconnect('d17_service');
SELECT dblink_disconnect('d17_owner');
SELECT * FROM finish();
ROLLBACK;
