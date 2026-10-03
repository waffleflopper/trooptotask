-- Observe real row-lock waits in separate committed synthetic transactions.
-- This tests cancellation's own terminal check, not later approve/deny effects.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email)
SELECT ('d1802000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'deletion-cancel-wait-'||n||'@example.test' FROM generate_series(1,5) n;
INSERT INTO public.organizations(id,name,created_by) VALUES
('d1802000-0000-4000-8000-000000000101','Cancellation Wait A','d1802000-0000-4000-8000-000000000002'),('d1802000-0000-4000-8000-000000000102','Cancellation Wait B','d1802000-0000-4000-8000-000000000002');
INSERT INTO public.organization_memberships(
  organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
)
SELECT 'd1802000-0000-4000-8000-000000000101'::uuid,('d1802000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  CASE WHEN n=2 THEN 'admin' ELSE 'member' END::public.organization_role,
  'viewer','{}','organization',ARRAY[]::uuid[] FROM generate_series(1,5) n;
INSERT INTO public.organization_memberships(
  organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
) VALUES('d1802000-0000-4000-8000-000000000102','d1802000-0000-4000-8000-000000000001','member','viewer','{}','organization',ARRAY[]::uuid[]),
('d1802000-0000-4000-8000-000000000102','d1802000-0000-4000-8000-000000000002','owner','viewer','{}','organization',ARRAY[]::uuid[]);
INSERT INTO public.personnel(id,organization_id,rank,first_name,last_name,slug,archived_at) VALUES
('d1802000-0000-4000-8000-000000000301','d1802000-0000-4000-8000-000000000101','SGT','Saved','Wait A','deletion-cancel-wait-a',NULL),
('d1802000-0000-4000-8000-000000000302','d1802000-0000-4000-8000-000000000102','SGT','Saved','Wait B','deletion-cancel-wait-b','2030-01-02T03:04:05.678Z');
INSERT INTO public.deletion_requests(
  id,organization_id,requested_by,requested_by_email,resource_type,resource_id,
  resource_description,resource_url,status,denial_reason,created_at
)
SELECT ('d1802000-0000-4000-8000-'||lpad(request::text,12,'0'))::uuid,
  CASE WHEN request=811 THEN 'd1802000-0000-4000-8000-000000000102' ELSE 'd1802000-0000-4000-8000-000000000101' END::uuid,
  ('d1802000-0000-4000-8000-'||lpad(actor::text,12,'0'))::uuid,
  'saved-wait-'||actor||'@example.test','personnel',
  CASE WHEN request=811 THEN 'd1802000-0000-4000-8000-000000000302' ELSE 'd1802000-0000-4000-8000-000000000301' END::uuid,
  'Saved request '||request,'/retained/request/'||request,'pending','Retained context',
  '2030-01-01T00:00:00.123Z'
FROM (VALUES(801,1),(802,1),(803,3),(804,4),(805,5),(806,1),(811,1)) r(request,actor);
COMMIT;
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT dblink_connect(name,'hostaddr='||host(inet_server_addr())||' port='||current_setting('port')||
  ' user=postgres password=postgres dbname='||current_database()||' application_name=t3_cancel_'||name)
FROM (VALUES('fixture'),('holder'),('first'),('second')) connections(name);
SELECT dblink_exec(name,$$SET statement_timeout='15s'$$)
FROM (VALUES('fixture'),('holder'),('first'),('second')) connections(name);
SELECT dblink_exec(name,$$SET TIME ZONE 'UTC'$$)
FROM (VALUES('fixture'),('holder'),('first'),('second')) connections(name);
CREATE FUNCTION pg_temp.cancel_begin(connection_name text,actor integer,isolation_level text DEFAULT 'READ COMMITTED')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM dblink_exec(connection_name,'BEGIN ISOLATION LEVEL '||isolation_level);
  PERFORM dblink_exec(connection_name,'SET LOCAL ROLE authenticated');
  PERFORM dblink_exec(connection_name,format('SET LOCAL request.jwt.claim.sub=%L',
    'd1802000-0000-4000-8000-'||lpad(actor::text,12,'0')));
END; $$;
CREATE FUNCTION pg_temp.cancel_sql(request_number integer) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.cancel_own_deletion_request(%L,%L)','d1802000-0000-4000-8000-000000000101',
    'd1802000-0000-4000-8000-'||lpad(request_number::text,12,'0'));
$$;
CREATE FUNCTION pg_temp.cancel_waits(waiter text,holder text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz:=clock_timestamp()+interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS(
      WITH RECURSIVE chain(pid,path) AS (
        SELECT w.pid,ARRAY[w.pid] FROM pg_stat_activity w
        WHERE w.application_name='t3_cancel_'||waiter AND w.wait_event_type='Lock'
        UNION ALL
        SELECT blocked.pid,c.path||blocked.pid FROM chain c,
          LATERAL unnest(pg_blocking_pids(c.pid)) blocked(pid)
        WHERE NOT blocked.pid=ANY(c.path)
      ) SELECT 1 FROM chain c JOIN pg_stat_activity b ON b.pid=c.pid
      WHERE b.application_name='t3_cancel_'||holder
    ) THEN RETURN true; END IF;
    IF clock_timestamp()>=deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END; $$;
CREATE TEMP TABLE requests_before AS SELECT id,to_jsonb(r) row_data FROM public.deletion_requests r
  WHERE organization_id IN('d1802000-0000-4000-8000-000000000101','d1802000-0000-4000-8000-000000000102');
CREATE TEMP TABLE sources_before AS SELECT id,to_jsonb(r) row_data FROM public.personnel r
  WHERE organization_id IN('d1802000-0000-4000-8000-000000000101','d1802000-0000-4000-8000-000000000102');
CREATE TEMP TABLE replies(connection_name text,value boolean);
CREATE TEMP TABLE loser(connection_name text);

-- Both duplicate commands actually wait on the same request before release.
SELECT dblink_exec('holder','BEGIN');
SELECT * FROM dblink('holder',$$ SELECT id FROM public.deletion_requests WHERE id='d1802000-0000-4000-8000-000000000801' FOR UPDATE $$) held(id uuid);
SELECT pg_temp.cancel_begin('first',1);
SELECT pg_temp.cancel_begin('second',1);
SELECT dblink_send_query('first',pg_temp.cancel_sql(801));
SELECT dblink_send_query('second',pg_temp.cancel_sql(801));
SELECT ok(pg_temp.cancel_waits('first','holder'),'first cancellation is observed waiting on the held request');
SELECT ok(pg_temp.cancel_waits('second','holder'),'duplicate cancellation is observed in the same row wait chain');
SELECT results_eq(
  $$ SELECT id,to_jsonb(r) FROM public.deletion_requests r WHERE organization_id IN('d1802000-0000-4000-8000-000000000101','d1802000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT id,row_data FROM requests_before ORDER BY id $$,
  'both observed waits leave all committed request fields unchanged');
SELECT dblink_exec('holder','ROLLBACK');
-- Either may win. Commit the first ready acknowledgement to release the loser.
DO $drain$
DECLARE connection_name text; deadline timestamptz:=clock_timestamp()+interval '5 seconds';
BEGIN
  LOOP
    IF dblink_is_busy('first')=0 THEN connection_name:='first'; EXIT;
    ELSIF dblink_is_busy('second')=0 THEN connection_name:='second'; EXIT; END IF;
    IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'Neither cancellation completed after release'; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
  INSERT INTO replies SELECT connection_name,value FROM dblink_get_result(connection_name) r(value boolean);
  PERFORM * FROM dblink_get_result(connection_name) r(value boolean);
  PERFORM dblink_exec(connection_name,'COMMIT');
  INSERT INTO loser VALUES(CASE WHEN connection_name='first' THEN 'second' ELSE 'first' END);
END;
$drain$;
SELECT throws_ok(format('SELECT value FROM dblink_get_result(%L) r(value boolean)',(SELECT connection_name FROM loser)),
  'P0002','Pending deletion request not found','duplicate loser cannot overwrite or acknowledge cancelled status');
SELECT * FROM dblink_get_result((SELECT connection_name FROM loser),false) r(value boolean);
SELECT dblink_exec((SELECT connection_name FROM loser),'ROLLBACK');
SELECT is((SELECT count(*)::integer FROM replies WHERE value),1,
  'exactly one independent duplicate cancellation receives true');
SELECT results_eq(
  $$ SELECT id,to_jsonb(r) FROM public.deletion_requests r WHERE organization_id IN('d1802000-0000-4000-8000-000000000101','d1802000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT id,CASE WHEN id='d1802000-0000-4000-8000-000000000801'::uuid THEN row_data||'{"status":"cancelled"}'::jsonb ELSE row_data END
    FROM requests_before ORDER BY id $$,
  'overlap changes exactly one status and no neighboring request or saved field');

-- A request row hold does not create an Organization-wide cancellation queue.
SELECT dblink_exec('holder','BEGIN');
SELECT * FROM dblink('holder',$$ SELECT id FROM public.deletion_requests WHERE id='d1802000-0000-4000-8000-000000000801' FOR UPDATE $$) held(id uuid);
SELECT pg_temp.cancel_begin('second',1);
SELECT is((SELECT value FROM dblink('second',pg_temp.cancel_sql(806)) r(value boolean)),true,
  'another owned request cancels before the unrelated request hold releases');
SELECT dblink_exec('second','COMMIT');
SELECT dblink_exec('holder','ROLLBACK');

-- A terminal review row committed ahead of the waiting command wins.
-- This is not a test of the existing effect-before-status review implementation.
SELECT dblink_exec('holder','BEGIN');
SELECT dblink_exec('holder',$$ UPDATE public.deletion_requests SET status='approved',reviewed_by='d1802000-0000-4000-8000-000000000002',
  reviewed_at='2030-05-01T00:00:00.456Z',denial_reason=NULL WHERE id='d1802000-0000-4000-8000-000000000802' $$);
SELECT pg_temp.cancel_begin('first',1);
SELECT dblink_send_query('first',pg_temp.cancel_sql(802));
SELECT ok(pg_temp.cancel_waits('first','holder'),'cancellation waits behind an uncommitted terminal review row');
SELECT dblink_exec('holder','COMMIT');
SELECT throws_ok($$ SELECT value FROM dblink_get_result('first') r(value boolean) $$,
  'P0002','Pending deletion request not found','fresh locked status prevents overwriting committed approval');
SELECT * FROM dblink_get_result('first',false) r(value boolean);
SELECT dblink_exec('first','ROLLBACK');
SELECT is((SELECT to_jsonb(r) FROM public.deletion_requests r WHERE id='d1802000-0000-4000-8000-000000000802'),
  (SELECT row_data||'{"status":"approved","reviewed_by":"d1802000-0000-4000-8000-000000000002","reviewed_at":"2030-05-01T00:00:00.456+00:00","denial_reason":null}'::jsonb
    FROM requests_before WHERE id='d1802000-0000-4000-8000-000000000802'),
  'waiting cancellation preserves the complete committed reviewer row');

-- membership removal is committed after admission during the observed row wait.
SELECT dblink_exec('holder','BEGIN');
SELECT * FROM dblink('holder',$$ SELECT id FROM public.deletion_requests WHERE id='d1802000-0000-4000-8000-000000000803' FOR UPDATE $$) held(id uuid);
SELECT pg_temp.cancel_begin('first',3);
SELECT dblink_send_query('first',pg_temp.cancel_sql(803));
SELECT ok(pg_temp.cancel_waits('first','holder'),'caller reaches the actual request wait before membership removal');
SELECT dblink_exec('fixture',$$ DELETE FROM public.organization_memberships WHERE organization_id='d1802000-0000-4000-8000-000000000101' AND user_id='d1802000-0000-4000-8000-000000000003' $$);
SELECT dblink_exec('holder','ROLLBACK');
SELECT throws_ok($$ SELECT value FROM dblink_get_result('first') r(value boolean) $$,
  '42501','Deletion request cancellation is not allowed','fresh admission rejects membership removal committed while waiting');
SELECT * FROM dblink_get_result('first',false) r(value boolean);
SELECT dblink_exec('first','ROLLBACK');
SELECT is((SELECT to_jsonb(r) FROM public.deletion_requests r WHERE id='d1802000-0000-4000-8000-000000000803'),
  (SELECT row_data FROM requests_before WHERE id='d1802000-0000-4000-8000-000000000803'),
  'membership removal denial preserves every field of the pending request');

-- account suspension is committed after admission during the observed row wait.
SELECT dblink_exec('holder','BEGIN');
SELECT * FROM dblink('holder',$$ SELECT id FROM public.deletion_requests WHERE id='d1802000-0000-4000-8000-000000000804' FOR UPDATE $$) held(id uuid);
SELECT pg_temp.cancel_begin('first',4);
SELECT dblink_send_query('first',pg_temp.cancel_sql(804));
SELECT ok(pg_temp.cancel_waits('first','holder'),'caller reaches the actual request wait before account suspension');
SELECT dblink_exec('fixture',$$ INSERT INTO public.user_suspensions(user_id,suspended_by,reason) VALUES('d1802000-0000-4000-8000-000000000004','d1802000-0000-4000-8000-000000000002','Suspended during cancellation wait') $$);
SELECT dblink_exec('holder','ROLLBACK');
SELECT throws_ok($$ SELECT value FROM dblink_get_result('first') r(value boolean) $$,
  '42501','Deletion request cancellation is not allowed','fresh admission rejects account suspension committed while waiting');
SELECT * FROM dblink_get_result('first',false) r(value boolean);
SELECT dblink_exec('first','ROLLBACK');
SELECT is((SELECT to_jsonb(r) FROM public.deletion_requests r WHERE id='d1802000-0000-4000-8000-000000000804'),
  (SELECT row_data FROM requests_before WHERE id='d1802000-0000-4000-8000-000000000804'),
  'account suspension denial preserves every field of the pending request');

-- Organization suspension is committed after admission during the observed row wait.
SELECT dblink_exec('holder','BEGIN');
SELECT * FROM dblink('holder',$$ SELECT id FROM public.deletion_requests WHERE id='d1802000-0000-4000-8000-000000000805' FOR UPDATE $$) held(id uuid);
SELECT pg_temp.cancel_begin('first',5);
SELECT dblink_send_query('first',pg_temp.cancel_sql(805));
SELECT ok(pg_temp.cancel_waits('first','holder'),'caller reaches the actual request wait before Organization suspension');
SELECT dblink_exec('fixture',$$ UPDATE public.organizations SET suspended_at='2030-06-01T00:00:00Z' WHERE id='d1802000-0000-4000-8000-000000000101' $$);
SELECT dblink_exec('holder','ROLLBACK');
SELECT throws_ok($$ SELECT value FROM dblink_get_result('first') r(value boolean) $$,
  '42501','Deletion request cancellation is not allowed','fresh admission rejects Organization suspension committed while waiting');
SELECT * FROM dblink_get_result('first',false) r(value boolean);
SELECT dblink_exec('first','ROLLBACK');
SELECT is((SELECT to_jsonb(r) FROM public.deletion_requests r WHERE id='d1802000-0000-4000-8000-000000000805'),
  (SELECT row_data FROM requests_before WHERE id='d1802000-0000-4000-8000-000000000805'),
  'Organization suspension denial preserves every field of the pending request');

-- Fixed snapshots cannot promise fresh access checks after a wait.
SELECT pg_temp.cancel_begin('first',1,'REPEATABLE READ');
SELECT throws_ok($$ SELECT value FROM dblink('first',pg_temp.cancel_sql(811)) r(value boolean) $$,
  '25001','Cancellation requires READ COMMITTED','repeatable-read transactions are rejected explicitly');
SELECT dblink_exec('first','ROLLBACK');
SELECT pg_temp.cancel_begin('first',1,'SERIALIZABLE');
SELECT throws_ok($$ SELECT value FROM dblink('first',pg_temp.cancel_sql(811)) r(value boolean) $$,
  '25001','Cancellation requires READ COMMITTED','serializable fixed snapshots are rejected explicitly');
SELECT dblink_exec('first','ROLLBACK');
SELECT results_eq(
  $$ SELECT id,to_jsonb(r) FROM public.deletion_requests r WHERE organization_id IN('d1802000-0000-4000-8000-000000000101','d1802000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT id,CASE WHEN id IN('d1802000-0000-4000-8000-000000000801'::uuid,'d1802000-0000-4000-8000-000000000806'::uuid) THEN row_data||'{"status":"cancelled"}'::jsonb
      WHEN id='d1802000-0000-4000-8000-000000000802'::uuid THEN row_data||'{"status":"approved","reviewed_by":"d1802000-0000-4000-8000-000000000002","reviewed_at":"2030-05-01T00:00:00.456+00:00","denial_reason":null}'::jsonb
      ELSE row_data END FROM requests_before ORDER BY id $$,
  'all concurrent scenarios retain exact metadata and unrelated A/B request history');
SELECT results_eq(
  $$ SELECT id,to_jsonb(r) FROM public.personnel r WHERE organization_id IN('d1802000-0000-4000-8000-000000000101','d1802000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT id,row_data FROM sources_before ORDER BY id $$,
  'successful and denied cancellation never deletes, archives or edits an A/B source');

SELECT dblink_disconnect(name) FROM (VALUES('holder'),('first'),('second')) connections(name);
SELECT dblink_exec('fixture',$cleanup$
  DELETE FROM public.organizations WHERE id IN('d1802000-0000-4000-8000-000000000101','d1802000-0000-4000-8000-000000000102');
  DELETE FROM public.user_suspensions WHERE user_id::text LIKE 'd1802000-0000-4000-8000-%';
  DELETE FROM auth.users WHERE id::text LIKE 'd1802000-0000-4000-8000-%';
$cleanup$);
SELECT is((SELECT count(*)::integer FROM dblink('fixture',$q$
  SELECT id FROM public.deletion_requests WHERE organization_id IN('d1802000-0000-4000-8000-000000000101','d1802000-0000-4000-8000-000000000102')
  UNION ALL SELECT id FROM public.personnel WHERE organization_id IN('d1802000-0000-4000-8000-000000000101','d1802000-0000-4000-8000-000000000102')
  UNION ALL SELECT id FROM public.organizations WHERE id IN('d1802000-0000-4000-8000-000000000101','d1802000-0000-4000-8000-000000000102')
  UNION ALL SELECT id FROM auth.users WHERE id::text LIKE 'd1802000-0000-4000-8000-%'
  UNION ALL SELECT user_id FROM public.user_suspensions WHERE user_id::text LIKE 'd1802000-0000-4000-8000-%'
$q$) r(id uuid)),0,'only the committed synthetic requests, sources, Organizations and accounts were cleaned');
SELECT dblink_disconnect('fixture');
SELECT * FROM finish();
ROLLBACK;
