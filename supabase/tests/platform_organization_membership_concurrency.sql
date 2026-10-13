-- Independent real sessions observe lock waits and current values, not source text.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();
SELECT dblink_connect('d21_holder','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=d21_membership_holder');
SELECT dblink_connect('d21_first','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=d21_membership_first');
SELECT dblink_connect('d21_second','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=d21_membership_second');
SELECT dblink_exec('d21_holder',$setup$
  CREATE SCHEMA d21_membership_test;
  CREATE FUNCTION d21_membership_test.capture(statement text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $body$
  DECLARE payload jsonb;
  BEGIN EXECUTE statement INTO payload;
    RETURN jsonb_build_object('code','00000','result',payload,'isolation',current_setting('transaction_isolation'));
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('code',SQLSTATE,'message',SQLERRM); END;
  $body$;
  GRANT USAGE ON SCHEMA d21_membership_test TO authenticated,service_role;
  GRANT EXECUTE ON FUNCTION d21_membership_test.capture(text) TO authenticated,service_role;
  INSERT INTO auth.users(id,email) VALUES
  ('d2110000-0000-4000-8000-000000000001','d21-lock-super@example.test'),
  ('d2110000-0000-4000-8000-000000000005','d21-lock-owner@example.test'),
  ('d2110000-0000-4000-8000-000000000006','d21-lock-member@example.test'),
  ('d2110000-0000-4000-8000-000000000007','d21-lock-admin@example.test'),
  ('d2110000-0000-4000-8000-000000000008','d21-lock-unrelated-member@example.test');
  INSERT INTO public.platform_admins(user_id,role) VALUES('d2110000-0000-4000-8000-000000000001','super_admin');
  INSERT INTO public.organizations(id,name,created_by) VALUES
  ('d2110000-0000-4000-8000-000000000101','D21 lock A','d2110000-0000-4000-8000-000000000005'),
  ('d2110000-0000-4000-8000-000000000102','D21 lock B','d2110000-0000-4000-8000-000000000005');
  INSERT INTO public.organization_memberships(id,organization_id,user_id,role) VALUES
  ('d2110000-0000-4000-8000-000000000201','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000005','owner'),
  ('d2110000-0000-4000-8000-000000000202','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006','member'),
  ('d2110000-0000-4000-8000-000000000203','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000007','admin'),
  ('d2110000-0000-4000-8000-000000000204','d2110000-0000-4000-8000-000000000102','d2110000-0000-4000-8000-000000000005','owner'),
  ('d2110000-0000-4000-8000-000000000205','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000008','member');
$setup$);
CREATE TEMP TABLE d21_sessions(name text PRIMARY KEY,pid integer);
SELECT dblink_exec('d21_holder', $$SET statement_timeout='10s'$$);
INSERT INTO d21_sessions SELECT 'holder',pid FROM dblink('d21_holder','SELECT pg_backend_pid()') AS r(pid integer);
SELECT dblink_exec('d21_first', $$SET statement_timeout='10s'$$);
INSERT INTO d21_sessions SELECT 'first',pid FROM dblink('d21_first','SELECT pg_backend_pid()') AS r(pid integer);
SELECT dblink_exec('d21_second', $$SET statement_timeout='10s'$$);
INSERT INTO d21_sessions SELECT 'second',pid FROM dblink('d21_second','SELECT pg_backend_pid()') AS r(pid integer);
SELECT is((SELECT count(DISTINCT pid)::integer FROM d21_sessions),3,'three independent SQL sessions');
CREATE TEMP TABLE d21_waits(case_name text,receipt jsonb);
CREATE TEMP TABLE d21_results(case_name text,result jsonb);
CREATE TEMP TABLE d21_b_before AS SELECT id,to_jsonb(m) row_data FROM public.organization_memberships m WHERE organization_id='d2110000-0000-4000-8000-000000000102';
CREATE FUNCTION pg_temp.d21_wait(case_name text,waiter text,blocker text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz:=clock_timestamp()+interval '5 seconds'; observed jsonb; blocked boolean;
BEGIN LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT b.pid=ANY(pg_blocking_pids(a.pid)) AND a.state='active' AND a.wait_event_type='Lock',
    jsonb_build_object('waiter',w.name,'pid',a.pid,'state',a.state,'wait_event_type',a.wait_event_type,'wait_event',a.wait_event,'blockers',pg_blocking_pids(a.pid),'query',a.query)
    INTO blocked,observed FROM pg_stat_activity a JOIN d21_sessions w ON w.pid=a.pid CROSS JOIN d21_sessions b WHERE w.name=waiter AND b.name=blocker;
  IF blocked THEN INSERT INTO d21_waits VALUES(case_name,observed); RETURN true; END IF;
  IF clock_timestamp()>deadline THEN RETURN false; END IF;
  PERFORM pg_sleep(0.01);
END LOOP; END $$;

-- platform-platform: the loser reads only after the shared Organization lock.
SELECT dblink_exec('d21_holder', $$UPDATE public.organization_memberships SET role=CASE user_id WHEN 'd2110000-0000-4000-8000-000000000005'::uuid THEN 'owner'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000006'::uuid THEN 'member'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000008'::uuid THEN 'member'::public.organization_role ELSE 'admin'::public.organization_role END,member_preset='viewer',capability_overrides='{}'::jsonb,access_scope_kind='organization',access_scope_group_ids=ARRAY[]::uuid[] WHERE organization_id='d2110000-0000-4000-8000-000000000101'$$);
SELECT dblink_exec('d21_first', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
INSERT INTO d21_results SELECT 'platform-platform-winner',result FROM dblink('d21_first', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_transfer_org_ownership('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006','D21 lock A')$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_second', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
SELECT dblink_send_query('d21_second', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_transfer_org_ownership('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000007','D21 lock A')$command$)$query$);
SELECT ok(pg_temp.d21_wait('platform-platform','second','first'),'platform-platform actually waits on its winning transaction');
SELECT dblink_exec('d21_first','COMMIT');
INSERT INTO d21_results SELECT 'platform-platform',result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT dblink_exec('d21_second','COMMIT');
SELECT is((SELECT user_id FROM public.organization_memberships WHERE organization_id='d2110000-0000-4000-8000-000000000101' AND role='owner'),'d2110000-0000-4000-8000-000000000007'::uuid,'platform-platform leaves the expected sole owner');
SELECT is((SELECT result->'result'->>'status' FROM d21_results WHERE case_name='platform-platform'),'updated','platform-platform acknowledges current target state');
SELECT is((SELECT result->'result'->>'from_user_id' FROM d21_results WHERE case_name='platform-platform'),'d2110000-0000-4000-8000-000000000006','platform-platform discovers the winner as its current owner');

-- platform-ordinary: the loser reads only after the shared Organization lock.
SELECT dblink_exec('d21_holder', $$UPDATE public.organization_memberships SET role=CASE user_id WHEN 'd2110000-0000-4000-8000-000000000005'::uuid THEN 'owner'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000006'::uuid THEN 'member'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000008'::uuid THEN 'member'::public.organization_role ELSE 'admin'::public.organization_role END,member_preset='viewer',capability_overrides='{}'::jsonb,access_scope_kind='organization',access_scope_group_ids=ARRAY[]::uuid[] WHERE organization_id='d2110000-0000-4000-8000-000000000101'$$);
SELECT dblink_exec('d21_first', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
INSERT INTO d21_results SELECT 'platform-ordinary-winner',result FROM dblink('d21_first', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_transfer_org_ownership('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006','D21 lock A')$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_second', $$BEGIN; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SET LOCAL "request.jwt.claim.sub" = 'd2110000-0000-4000-8000-000000000005'$$);
SELECT dblink_send_query('d21_second', $query$SELECT d21_membership_test.capture($command$WITH changed AS (SELECT public.transfer_org_ownership('d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000007')) SELECT jsonb_build_object('status','updated') FROM changed$command$)$query$);
SELECT ok(pg_temp.d21_wait('platform-ordinary','second','first'),'platform-ordinary actually waits on its winning transaction');
SELECT dblink_exec('d21_first','COMMIT');
INSERT INTO d21_results SELECT 'platform-ordinary',result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT dblink_exec('d21_second','ROLLBACK');
SELECT is((SELECT user_id FROM public.organization_memberships WHERE organization_id='d2110000-0000-4000-8000-000000000101' AND role='owner'),'d2110000-0000-4000-8000-000000000006'::uuid,'platform-ordinary leaves the expected sole owner');
SELECT is((SELECT result->>'code' FROM d21_results WHERE case_name='platform-ordinary'),'P0001','waited former owner loses ordinary transfer authority');

-- ordinary-platform: the loser reads only after the shared Organization lock.
SELECT dblink_exec('d21_holder', $$UPDATE public.organization_memberships SET role=CASE user_id WHEN 'd2110000-0000-4000-8000-000000000005'::uuid THEN 'owner'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000006'::uuid THEN 'member'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000008'::uuid THEN 'member'::public.organization_role ELSE 'admin'::public.organization_role END,member_preset='viewer',capability_overrides='{}'::jsonb,access_scope_kind='organization',access_scope_group_ids=ARRAY[]::uuid[] WHERE organization_id='d2110000-0000-4000-8000-000000000101'$$);
SELECT dblink_exec('d21_first', $$BEGIN; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SET LOCAL "request.jwt.claim.sub" = 'd2110000-0000-4000-8000-000000000005'$$);
INSERT INTO d21_results SELECT 'ordinary-platform-winner',result FROM dblink('d21_first', $query$SELECT d21_membership_test.capture($command$WITH changed AS (SELECT public.transfer_org_ownership('d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006')) SELECT jsonb_build_object('status','updated') FROM changed$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_second', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
SELECT dblink_send_query('d21_second', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_transfer_org_ownership('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000007','D21 lock A')$command$)$query$);
SELECT ok(pg_temp.d21_wait('ordinary-platform','second','first'),'ordinary-platform actually waits on its winning transaction');
SELECT dblink_exec('d21_first','COMMIT');
INSERT INTO d21_results SELECT 'ordinary-platform',result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT dblink_exec('d21_second','COMMIT');
SELECT is((SELECT user_id FROM public.organization_memberships WHERE organization_id='d2110000-0000-4000-8000-000000000101' AND role='owner'),'d2110000-0000-4000-8000-000000000007'::uuid,'ordinary-platform leaves the expected sole owner');
SELECT is((SELECT result->'result'->>'status' FROM d21_results WHERE case_name='ordinary-platform'),'updated','ordinary-platform acknowledges current target state');
SELECT is((SELECT result->'result'->>'from_user_id' FROM d21_results WHERE case_name='ordinary-platform'),'d2110000-0000-4000-8000-000000000006','ordinary-platform discovers the winner as its current owner');

-- promote-transfer: the loser reads only after the shared Organization lock.
SELECT dblink_exec('d21_holder', $$UPDATE public.organization_memberships SET role=CASE user_id WHEN 'd2110000-0000-4000-8000-000000000005'::uuid THEN 'owner'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000006'::uuid THEN 'member'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000008'::uuid THEN 'member'::public.organization_role ELSE 'admin'::public.organization_role END,member_preset='viewer',capability_overrides='{}'::jsonb,access_scope_kind='organization',access_scope_group_ids=ARRAY[]::uuid[] WHERE organization_id='d2110000-0000-4000-8000-000000000101'$$);
SELECT dblink_exec('d21_first', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
INSERT INTO d21_results SELECT 'promote-transfer-winner',result FROM dblink('d21_first', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_promote_org_member('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006')$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_second', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
SELECT dblink_send_query('d21_second', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_transfer_org_ownership('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006','D21 lock A')$command$)$query$);
SELECT ok(pg_temp.d21_wait('promote-transfer','second','first'),'promote-transfer actually waits on its winning transaction');
SELECT dblink_exec('d21_first','COMMIT');
INSERT INTO d21_results SELECT 'promote-transfer',result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT dblink_exec('d21_second','COMMIT');
SELECT is((SELECT user_id FROM public.organization_memberships WHERE organization_id='d2110000-0000-4000-8000-000000000101' AND role='owner'),'d2110000-0000-4000-8000-000000000006'::uuid,'promote-transfer leaves the expected sole owner');
SELECT is((SELECT result->'result'->>'status' FROM d21_results WHERE case_name='promote-transfer'),'updated','promote-transfer acknowledges current target state');

-- transfer-promote: the loser reads only after the shared Organization lock.
SELECT dblink_exec('d21_holder', $$UPDATE public.organization_memberships SET role=CASE user_id WHEN 'd2110000-0000-4000-8000-000000000005'::uuid THEN 'owner'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000006'::uuid THEN 'member'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000008'::uuid THEN 'member'::public.organization_role ELSE 'admin'::public.organization_role END,member_preset='viewer',capability_overrides='{}'::jsonb,access_scope_kind='organization',access_scope_group_ids=ARRAY[]::uuid[] WHERE organization_id='d2110000-0000-4000-8000-000000000101'$$);
SELECT dblink_exec('d21_first', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
INSERT INTO d21_results SELECT 'transfer-promote-winner',result FROM dblink('d21_first', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_transfer_org_ownership('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006','D21 lock A')$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_second', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
SELECT dblink_send_query('d21_second', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_promote_org_member('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006')$command$)$query$);
SELECT ok(pg_temp.d21_wait('transfer-promote','second','first'),'transfer-promote actually waits on its winning transaction');
SELECT dblink_exec('d21_first','COMMIT');
INSERT INTO d21_results SELECT 'transfer-promote',result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT dblink_exec('d21_second','COMMIT');
SELECT is((SELECT user_id FROM public.organization_memberships WHERE organization_id='d2110000-0000-4000-8000-000000000101' AND role='owner'),'d2110000-0000-4000-8000-000000000006'::uuid,'transfer-promote leaves the expected sole owner');
SELECT is((SELECT result->'result'->>'status' FROM d21_results WHERE case_name='transfer-promote'),'already_owner','transfer-promote acknowledges current target state');

SELECT dblink_exec('d21_holder', $$UPDATE public.organization_memberships SET role=CASE user_id WHEN 'd2110000-0000-4000-8000-000000000005'::uuid THEN 'owner'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000006'::uuid THEN 'member'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000008'::uuid THEN 'member'::public.organization_role ELSE 'admin'::public.organization_role END,member_preset='viewer',capability_overrides='{}'::jsonb,access_scope_kind='organization',access_scope_group_ids=ARRAY[]::uuid[] WHERE organization_id='d2110000-0000-4000-8000-000000000101'$$);
SELECT dblink_exec('d21_first', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
INSERT INTO d21_results SELECT 'late-update-transfer',result FROM dblink('d21_first', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_transfer_org_ownership('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006','D21 lock A')$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_second', $$BEGIN; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SET LOCAL "request.jwt.claim.sub" = 'd2110000-0000-4000-8000-000000000005'$$);
SELECT dblink_send_query('d21_second', $query$SELECT d21_membership_test.capture($command$WITH changed AS (UPDATE public.organization_memberships SET role='member',member_preset='viewer' WHERE id='d2110000-0000-4000-8000-000000000202' AND organization_id='d2110000-0000-4000-8000-000000000101' AND role='member' RETURNING id) SELECT jsonb_build_object('affected',count(*)) FROM changed$command$)$query$);
SELECT ok(pg_temp.d21_wait('late-update','second','first'),'late-update actually waits on its winning transaction');
SELECT dblink_exec('d21_first','COMMIT');
INSERT INTO d21_results SELECT 'late-update',result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT dblink_exec('d21_second','COMMIT');
SELECT is((SELECT user_id FROM public.organization_memberships WHERE organization_id='d2110000-0000-4000-8000-000000000101' AND role='owner'),'d2110000-0000-4000-8000-000000000006'::uuid,'late-update cannot overwrite or remove the new owner');
SELECT is((SELECT result->'result'->>'affected' FROM d21_results WHERE case_name='late-update'),'0','late-update reports zero matched non-owner rows');
SELECT ok((SELECT role='owner' AND member_preset='editor' AND capability_overrides='{}'::jsonb AND access_scope_kind='organization' AND cardinality(access_scope_group_ids)=0 FROM public.organization_memberships WHERE id='d2110000-0000-4000-8000-000000000202'),'late-update retains membership ID and canonical owner fields');

SELECT dblink_exec('d21_holder', $$UPDATE public.organization_memberships SET role=CASE user_id WHEN 'd2110000-0000-4000-8000-000000000005'::uuid THEN 'owner'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000006'::uuid THEN 'member'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000008'::uuid THEN 'member'::public.organization_role ELSE 'admin'::public.organization_role END,member_preset='viewer',capability_overrides='{}'::jsonb,access_scope_kind='organization',access_scope_group_ids=ARRAY[]::uuid[] WHERE organization_id='d2110000-0000-4000-8000-000000000101'$$);
SELECT dblink_exec('d21_first', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
INSERT INTO d21_results SELECT 'late-delete-transfer',result FROM dblink('d21_first', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_transfer_org_ownership('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006','D21 lock A')$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_second', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
SELECT dblink_send_query('d21_second', $query$SELECT d21_membership_test.capture($command$WITH changed AS (DELETE FROM public.organization_memberships WHERE id='d2110000-0000-4000-8000-000000000202' AND organization_id='d2110000-0000-4000-8000-000000000101' AND role='member' RETURNING id) SELECT jsonb_build_object('affected',count(*)) FROM changed$command$)$query$);
SELECT ok(pg_temp.d21_wait('late-delete','second','first'),'late-delete actually waits on its winning transaction');
SELECT dblink_exec('d21_first','COMMIT');
INSERT INTO d21_results SELECT 'late-delete',result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT result FROM dblink_get_result('d21_second') AS r(result jsonb);
SELECT dblink_exec('d21_second','COMMIT');
SELECT is((SELECT user_id FROM public.organization_memberships WHERE organization_id='d2110000-0000-4000-8000-000000000101' AND role='owner'),'d2110000-0000-4000-8000-000000000006'::uuid,'late-delete cannot overwrite or remove the new owner');
SELECT is((SELECT result->'result'->>'affected' FROM d21_results WHERE case_name='late-delete'),'0','late-delete reports zero matched non-owner rows');
SELECT ok((SELECT role='owner' AND member_preset='editor' AND capability_overrides='{}'::jsonb AND access_scope_kind='organization' AND cardinality(access_scope_group_ids)=0 FROM public.organization_memberships WHERE id='d2110000-0000-4000-8000-000000000202'),'late-delete retains membership ID and canonical owner fields');

SELECT dblink_exec('d21_holder', $$UPDATE public.organization_memberships SET role=CASE user_id WHEN 'd2110000-0000-4000-8000-000000000005'::uuid THEN 'owner'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000006'::uuid THEN 'member'::public.organization_role WHEN 'd2110000-0000-4000-8000-000000000008'::uuid THEN 'member'::public.organization_role ELSE 'admin'::public.organization_role END,member_preset='viewer',capability_overrides='{}'::jsonb,access_scope_kind='organization',access_scope_group_ids=ARRAY[]::uuid[] WHERE organization_id='d2110000-0000-4000-8000-000000000101'$$);
SELECT dblink_exec('d21_holder', $$BEGIN; SET LOCAL ROLE postgres; SET LOCAL "request.jwt.claim.role" = 'postgres'$$);
SELECT dblink_exec('d21_holder',$$DO $body$ BEGIN PERFORM 1 FROM public.organizations WHERE id='d2110000-0000-4000-8000-000000000101' FOR UPDATE; END $body$;$$);
SELECT dblink_exec('d21_first', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
SELECT dblink_send_query('d21_first', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_transfer_org_ownership('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006','D21 lock A')$command$)$query$);
SELECT ok(pg_temp.d21_wait('revoked-super','first','holder'),'revoked-super actually waits on its winning transaction');
SELECT dblink_exec('d21_holder',$$UPDATE public.platform_admins SET role='support' WHERE user_id='d2110000-0000-4000-8000-000000000001'; COMMIT$$);
INSERT INTO d21_results SELECT 'revoked-super',result FROM dblink_get_result('d21_first') AS r(result jsonb);
SELECT result FROM dblink_get_result('d21_first') AS r(result jsonb);
SELECT dblink_exec('d21_first','ROLLBACK');
SELECT is((SELECT result->>'code' FROM d21_results WHERE case_name='revoked-super'),'42501','platform transfer rechecks the role revoked during its lock wait');
SELECT is((SELECT user_id FROM public.organization_memberships WHERE organization_id='d2110000-0000-4000-8000-000000000101' AND role='owner'),'d2110000-0000-4000-8000-000000000005'::uuid,'revoked super makes no membership change');
SELECT dblink_exec('d21_holder',$$UPDATE public.platform_admins SET role='super_admin' WHERE user_id='d2110000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('d21_first', $$BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
INSERT INTO d21_results SELECT 'repeatable-read-platform-transfer',result FROM dblink('d21_first', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_transfer_org_ownership('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006','D21 lock A')$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_first','ROLLBACK');
SELECT is((SELECT result->>'code' FROM d21_results WHERE case_name='repeatable-read-platform-transfer'),'25000','repeatable-read-platform-transfer refuses stale-snapshot isolation');
SELECT dblink_exec('d21_first', $$BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
INSERT INTO d21_results SELECT 'repeatable-read-platform-promotion',result FROM dblink('d21_first', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_promote_org_member('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006')$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_first','ROLLBACK');
SELECT is((SELECT result->>'code' FROM d21_results WHERE case_name='repeatable-read-platform-promotion'),'25000','repeatable-read-platform-promotion refuses stale-snapshot isolation');
SELECT dblink_exec('d21_first', $$BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SET LOCAL "request.jwt.claim.sub" = 'd2110000-0000-4000-8000-000000000005'$$);
INSERT INTO d21_results SELECT 'repeatable-read-ordinary-transfer',result FROM dblink('d21_first', $query$SELECT d21_membership_test.capture($command$WITH changed AS (SELECT public.transfer_org_ownership('d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006')) SELECT jsonb_build_object('status','updated') FROM changed$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_first','ROLLBACK');
SELECT is((SELECT result->>'code' FROM d21_results WHERE case_name='repeatable-read-ordinary-transfer'),'25000','repeatable-read-ordinary-transfer refuses stale-snapshot isolation');
SELECT dblink_exec('d21_first', $$BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
INSERT INTO d21_results SELECT 'serializable-platform-transfer',result FROM dblink('d21_first', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_transfer_org_ownership('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006','D21 lock A')$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_first','ROLLBACK');
SELECT is((SELECT result->>'code' FROM d21_results WHERE case_name='serializable-platform-transfer'),'25000','serializable-platform-transfer refuses stale-snapshot isolation');
SELECT dblink_exec('d21_first', $$BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
INSERT INTO d21_results SELECT 'serializable-platform-promotion',result FROM dblink('d21_first', $query$SELECT d21_membership_test.capture($command$SELECT public.platform_promote_org_member('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006')$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_first','ROLLBACK');
SELECT is((SELECT result->>'code' FROM d21_results WHERE case_name='serializable-platform-promotion'),'25000','serializable-platform-promotion refuses stale-snapshot isolation');
SELECT dblink_exec('d21_first', $$BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SET LOCAL "request.jwt.claim.sub" = 'd2110000-0000-4000-8000-000000000005'$$);
INSERT INTO d21_results SELECT 'serializable-ordinary-transfer',result FROM dblink('d21_first', $query$SELECT d21_membership_test.capture($command$WITH changed AS (SELECT public.transfer_org_ownership('d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006')) SELECT jsonb_build_object('status','updated') FROM changed$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_first','ROLLBACK');
SELECT is((SELECT result->>'code' FROM d21_results WHERE case_name='serializable-ordinary-transfer'),'25000','serializable-ordinary-transfer refuses stale-snapshot isolation');
-- A transfer need not lock an unrelated member's access settings.
SELECT dblink_exec('d21_first', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
INSERT INTO d21_results SELECT 'unrelated-member-transfer',result FROM dblink('d21_first',$query$SELECT d21_membership_test.capture($command$SELECT public.platform_transfer_org_ownership('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000006','D21 lock A')$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_second', $$BEGIN; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = '{"aal":"aal2"}'; SET LOCAL "request.jwt.claim.sub" = 'd2110000-0000-4000-8000-000000000007'$$);
INSERT INTO d21_results SELECT 'unrelated-member-update',result FROM dblink('d21_second',$query$SELECT d21_membership_test.capture($command$WITH changed AS (UPDATE public.organization_memberships SET member_preset='operator' WHERE id='d2110000-0000-4000-8000-000000000205' AND organization_id='d2110000-0000-4000-8000-000000000101' AND role='member' RETURNING id) SELECT jsonb_build_object('affected',count(*)) FROM changed$command$)$query$) AS r(result jsonb);
SELECT is((SELECT result->'result'->>'affected' FROM d21_results WHERE case_name='unrelated-member-update'),'1','ordinary admin updates its current non-owner while an unrelated transfer is still uncommitted');
SELECT dblink_exec('d21_second','COMMIT');
SELECT dblink_exec('d21_first','COMMIT');
SELECT is((SELECT member_preset FROM public.organization_memberships WHERE id='d2110000-0000-4000-8000-000000000205'),'operator','unrelated positive access change persists');
SELECT results_eq($$SELECT id,to_jsonb(m) FROM public.organization_memberships m WHERE organization_id='d2110000-0000-4000-8000-000000000102' ORDER BY id$$,$$SELECT * FROM d21_b_before ORDER BY id$$,'all competing commands retain B byte-equivalently');
SELECT is((SELECT count(*)::integer FROM public.organization_memberships WHERE organization_id='d2110000-0000-4000-8000-000000000101'),4,'all original A membership IDs remain');
SELECT ok((SELECT bool_and(result->>'isolation'='read committed') FROM d21_results WHERE result->>'code'='00000'),'successful actor statements use READ COMMITTED');
SELECT dblink_exec('d21_second', $$BEGIN; SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'$$);
INSERT INTO d21_results SELECT 'positive-non-owner-removal',result FROM dblink('d21_second',$query$SELECT d21_membership_test.capture($command$WITH changed AS (DELETE FROM public.organization_memberships WHERE id='d2110000-0000-4000-8000-000000000205' AND organization_id='d2110000-0000-4000-8000-000000000101' AND role='member' RETURNING id) SELECT jsonb_build_object('affected',count(*)) FROM changed$command$)$query$) AS r(result jsonb);
SELECT dblink_exec('d21_second','COMMIT');
SELECT is((SELECT result->'result'->>'affected' FROM d21_results WHERE case_name='positive-non-owner-removal'),'1','recorded non-owner membership remains removable with an exact role predicate');
SELECT diag('D21_MEMBERSHIP_WAIT_RECEIPTS=' || (SELECT jsonb_agg(to_jsonb(r) ORDER BY case_name)::text FROM d21_waits r));
SELECT diag('D21_MEMBERSHIP_RESULTS=' || (SELECT jsonb_agg(to_jsonb(r) ORDER BY case_name)::text FROM d21_results r));
SELECT dblink_exec('d21_holder',$$DELETE FROM public.organizations WHERE id IN ('d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000102'); DELETE FROM auth.users WHERE id IN ('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000005','d2110000-0000-4000-8000-000000000006','d2110000-0000-4000-8000-000000000007','d2110000-0000-4000-8000-000000000008'); DROP SCHEMA d21_membership_test CASCADE$$);
SELECT is((SELECT count(*)::integer FROM public.organizations WHERE id IN ('d2110000-0000-4000-8000-000000000101','d2110000-0000-4000-8000-000000000102')),0,'exact committed fixture Organizations are removed');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id IN ('d2110000-0000-4000-8000-000000000001','d2110000-0000-4000-8000-000000000005','d2110000-0000-4000-8000-000000000006','d2110000-0000-4000-8000-000000000007','d2110000-0000-4000-8000-000000000008')),0,'exact committed fixture Users are removed');
SELECT ok(to_regnamespace('d21_membership_test') IS NULL,'committed test support schema is removed');
SELECT dblink_disconnect('d21_holder');
SELECT dblink_disconnect('d21_first');
SELECT dblink_disconnect('d21_second');
SELECT * FROM finish();
ROLLBACK;
