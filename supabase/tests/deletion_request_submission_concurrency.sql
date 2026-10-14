BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE FUNCTION pg_temp.u(n bigint) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('d1643c00-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
INSERT INTO auth.users (id, email)
SELECT pg_temp.u(n), 'submission-wait-' || n || '@example.test' FROM generate_series(1, 3) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.u(101), 'Submission Wait', pg_temp.u(1)), (pg_temp.u(102), 'Submission Foreign', pg_temp.u(3));
INSERT INTO public.deletion_requests (
  id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description, status, created_at
)
SELECT pg_temp.u(request), pg_temp.u(101), pg_temp.u(2), 'saved@example.test', resource_type, pg_temp.u(target),
  'Saved ' || request, status, '2029-01-01T00:00:00Z'
FROM (VALUES
  (601, 'personnel', 302, 'pending'), (602, 'personnel', 302, 'pending'),
  (603, 'personnel', 303, 'denied'), (604, 'personnel', 303, 'approved'), (605, 'personnel', 303, 'cancelled')
) AS rows(request, resource_type, target, status);
COMMIT;

BEGIN;
SELECT no_plan();
SET LOCAL TIME ZONE 'UTC';
SELECT dblink_connect(name, 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
  ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t3_submit_' || name)
FROM (VALUES ('fixture'), ('first'), ('second')) AS connections(name);
SELECT dblink_exec(name, $$SET statement_timeout = '15s'$$), dblink_exec(name, $$SET TIME ZONE 'UTC'$$)
FROM (VALUES ('fixture'), ('first'), ('second')) AS connections(name);

CREATE FUNCTION pg_temp.begin_service(conn text, isolation_level text DEFAULT 'READ COMMITTED') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM dblink_exec(conn, 'BEGIN ISOLATION LEVEL ' || isolation_level);
  PERFORM dblink_exec(conn, 'SET LOCAL ROLE service_role');
END;
$$;
CREATE FUNCTION pg_temp.submit_sql(org integer, resource_type text, target integer, requester integer DEFAULT 2) RETURNS text LANGUAGE sql AS $$
  SELECT format($q$SELECT public.submit_deletion_request(%L, %L, 'requester@example.test', %L, %L, 'Remove it', '/target')::text$q$,
    pg_temp.u(org), pg_temp.u(requester), resource_type, pg_temp.u(target))
$$;
CREATE FUNCTION pg_temp.reply(conn text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  deadline timestamptz := clock_timestamp() + interval '10 seconds';
  v_reply text;
BEGIN
  WHILE dblink_is_busy(conn) = 1 LOOP
    IF clock_timestamp() >= deadline THEN RAISE EXCEPTION '% did not return', conn; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
  BEGIN
    SELECT r.v INTO v_reply FROM dblink_get_result(conn) AS r(v text);
  EXCEPTION WHEN OTHERS THEN
    v_reply := SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM * FROM dblink_get_result(conn, false) AS r(v text);
  RETURN v_reply;
END;
$$;
CREATE FUNCTION pg_temp.run(conn text, sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF dblink_send_query(conn, sql) <> 1 THEN RAISE EXCEPTION 'Could not send to %', conn; END IF;
  RETURN pg_temp.reply(conn);
END;
$$;
CREATE FUNCTION pg_temp.waits(waiter text, holder text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (
      SELECT 1 FROM pg_stat_activity w, LATERAL unnest(pg_blocking_pids(w.pid)) AS blocking(pid)
      JOIN pg_stat_activity b ON b.pid = blocking.pid
      WHERE w.application_name = 't3_submit_' || waiter AND w.wait_event_type = 'Lock' AND w.wait_event = 'advisory'
        AND b.application_name = 't3_submit_' || holder
    ) THEN RETURN true; END IF;
    IF clock_timestamp() >= deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;
CREATE FUNCTION pg_temp.pending(org integer, target integer) RETURNS integer LANGUAGE sql AS $$
  SELECT count FROM dblink('fixture', format($q$ SELECT count(*)::integer FROM public.deletion_requests
    WHERE organization_id = %L AND resource_id = %L AND status = 'pending' $q$, pg_temp.u(org), pg_temp.u(target))) AS r(count integer)
$$;
CREATE TEMP TABLE saved AS SELECT * FROM dblink('fixture', $q$ SELECT id, to_jsonb(r) FROM public.deletion_requests r
  WHERE organization_id::text LIKE 'd1643c00-%' $q$) AS r(id uuid, row_data jsonb);

SELECT pg_temp.begin_service('first');
SELECT pg_temp.begin_service('second');
SELECT is(pg_temp.run('first', pg_temp.submit_sql(101, 'personnel', 301))::jsonb ->> 'outcome', 'created', 'first submission creates');
SELECT dblink_send_query('second', pg_temp.submit_sql(101, 'personnel', 301, 3));
SELECT ok(pg_temp.waits('second', 'first'), 'second submission waits on the same target key');
SELECT dblink_exec('first', 'COMMIT');
SELECT is(pg_temp.reply('second'), '{"outcome": "duplicate"}', 'second submission reports a duplicate without the saved request');
SELECT dblink_exec('second', 'COMMIT');
SELECT is(pg_temp.pending(101, 301), 1, 'one pending request exists for the target');

SELECT pg_temp.begin_service('first');
SELECT pg_temp.begin_service('second');
SELECT is(pg_temp.run('first', pg_temp.submit_sql(101, 'training_type', 304))::jsonb ->> 'outcome', 'created', 'first submission creates');
SELECT dblink_send_query('second', pg_temp.submit_sql(101, 'training_type', 304));
SELECT ok(pg_temp.waits('second', 'first'), 'second submission waits on the uncommitted one');
SELECT dblink_exec('first', 'ROLLBACK');
SELECT is(pg_temp.reply('second')::jsonb ->> 'outcome', 'created', 'second submission creates after the rollback');
SELECT dblink_exec('second', 'COMMIT');
SELECT is(pg_temp.pending(101, 304), 1, 'exactly the waiting submission is saved');

SELECT pg_temp.begin_service('first');
SELECT is(pg_temp.run('first', pg_temp.submit_sql(101, 'personnel', 305))::jsonb ->> 'outcome', 'created', 'a submission holds its key');
SELECT dblink_exec('second', $$SET lock_timeout = '1s'$$);
SELECT is(pg_temp.run('second', pg_temp.submit_sql(101, 'personnel', 306))::jsonb ->> 'outcome', 'created', 'another target does not wait');
SELECT is(pg_temp.run('second', pg_temp.submit_sql(101, 'counseling_record', 305))::jsonb ->> 'outcome', 'created', 'another resource type does not wait');
SELECT is(pg_temp.run('second', pg_temp.submit_sql(102, 'personnel', 305, 3))::jsonb ->> 'outcome', 'created', 'another Organization does not wait');
SELECT dblink_exec('second', $$RESET lock_timeout$$);
SELECT dblink_exec('first', 'COMMIT');

SELECT dblink_exec('first', 'SET ROLE service_role');
SELECT is(pg_temp.run('first', pg_temp.submit_sql(101, 'personnel', 302)), '{"outcome": "duplicate"}', 'saved duplicate pendings report a duplicate');
SELECT is(pg_temp.run('first', pg_temp.submit_sql(101, 'personnel', 303))::jsonb ->> 'outcome', 'created', 'terminal history does not block a new request');
SELECT is((pg_temp.run('first', pg_temp.submit_sql(101, 'rating_scheme_entry', 307))::jsonb -> 'request') - 'id' - 'created_at',
  jsonb_build_object('organization_id', pg_temp.u(101), 'requested_by', pg_temp.u(2), 'requested_by_email', 'requester@example.test',
    'resource_type', 'rating_scheme_entry', 'resource_id', pg_temp.u(307), 'resource_description', 'Remove it', 'resource_url', '/target',
    'status', 'pending', 'reviewed_by', NULL, 'reviewed_at', NULL, 'denial_reason', NULL),
  'a created request is returned with every saved field');
SELECT results_eq($$ SELECT * FROM dblink('fixture', $q$ SELECT id, to_jsonb(r) FROM public.deletion_requests r
    WHERE id::text LIKE 'd1643c00-%' ORDER BY id $q$) AS r(id uuid, row_data jsonb) $$,
  $$ SELECT id, row_data FROM saved ORDER BY id $$, 'saved duplicates and terminal history are unchanged');

SELECT is(pg_temp.run('first', pg_temp.submit_sql(101, 'onboarding', 308)), '22023 Invalid deletion request submission', 'an unknown type is rejected');
SELECT is(pg_temp.run('first', format($q$SELECT public.submit_deletion_request(%L, %L, 'requester@example.test', 'personnel', %L, NULL, NULL)::text$q$,
  pg_temp.u(101), pg_temp.u(2), pg_temp.u(308))), '22023 Invalid deletion request submission', 'a missing description is rejected');
SELECT matches(pg_temp.run('first', pg_temp.submit_sql(101, 'personnel', 308, 999)), '^23503 ', 'an unknown requester fails the insert');
SELECT is(pg_temp.pending(101, 308), 0, 'no rejected submission saved a request');
SELECT dblink_exec('first', 'RESET ROLE');
SELECT pg_temp.begin_service('first', 'REPEATABLE READ');
SELECT is(pg_temp.run('first', pg_temp.submit_sql(101, 'personnel', 308)), '25001 Deletion request submission requires READ COMMITTED',
  'a fixed snapshot is rejected');
SELECT dblink_exec('first', 'ROLLBACK');
SELECT is(
  ARRAY(SELECT role_name || ':' || has_function_privilege(role_name,
    'public.submit_deletion_request(uuid, uuid, text, text, uuid, text, text)', 'EXECUTE')
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name) ORDER BY 1),
  ARRAY['anon:false', 'authenticated:false', 'service_role:true'], 'only the server submits');

SELECT dblink_disconnect(name) FROM (VALUES ('first'), ('second')) AS connections(name);
SELECT dblink_exec('fixture', $cleanup$
  DELETE FROM public.organizations WHERE id::text LIKE 'd1643c00-%';
  DELETE FROM auth.users WHERE id::text LIKE 'd1643c00-%';
$cleanup$);
SELECT is(pg_temp.run('fixture', $q$ SELECT count(*)::text FROM (
  SELECT 1 FROM public.deletion_requests WHERE organization_id::text LIKE 'd1643c00-%'
  UNION ALL SELECT 1 FROM public.organizations WHERE id::text LIKE 'd1643c00-%'
  UNION ALL SELECT 1 FROM auth.users WHERE id::text LIKE 'd1643c00-%') AS residue $q$), '0', 'every committed synthetic row was cleaned');
SELECT dblink_disconnect('fixture');
SELECT * FROM finish();
ROLLBACK;
