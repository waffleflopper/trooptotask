BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
DELETE FROM public.organizations WHERE id = 'd1643066-0000-4000-8000-000000000101';
DELETE FROM auth.users WHERE id::text LIKE 'd1643066-0000-4000-8000-%';
INSERT INTO auth.users (id, email)
SELECT ('d1643066-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'ict-reorder-race-' || n || '@example.test'
FROM generate_series(1, 2) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
('d1643066-0000-4000-8000-000000000101', 'Reorder Race Alpha', 'd1643066-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT 'd1643066-0000-4000-8000-000000000101'::uuid, ('d1643066-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer', '{"criticalTasks":"configure"}'::jsonb, 'organization', ARRAY[]::uuid[]
FROM generate_series(1, 2) AS actor;
INSERT INTO public.ict_tasks (id, organization_id, task_code, title, sort_order) VALUES
('d1643066-0000-4000-8000-000000000301', 'd1643066-0000-4000-8000-000000000101', 'A', 'Alpha', 0),
('d1643066-0000-4000-8000-000000000302', 'd1643066-0000-4000-8000-000000000101', 'B', 'Bravo', 1),
('d1643066-0000-4000-8000-000000000303', 'd1643066-0000-4000-8000-000000000101', 'C', 'Charlie', 2),
('d1643066-0000-4000-8000-000000000304', 'd1643066-0000-4000-8000-000000000101', 'D', 'Delta', 3);
COMMIT;

BEGIN;
SELECT no_plan();
SELECT dblink_connect(name, 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
  ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t1643ict_' || name)
FROM (VALUES ('fixture'), ('a'), ('b')) AS connections(name);
SELECT dblink_exec(name, $$SET statement_timeout = '10s'$$) FROM (VALUES ('a'), ('b')) AS connections(name);

CREATE FUNCTION pg_temp.expand(sql text) RETURNS text LANGUAGE sql AS $$
  SELECT regexp_replace(sql, '#(\d{3})', $r$'d1643066-0000-4000-8000-000000000\1'::uuid$r$, 'g');
$$;
CREATE FUNCTION pg_temp.call(connection_name text, sql text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT value FROM dblink(connection_name, pg_temp.expand(sql)) AS result(value jsonb);
$$;
CREATE FUNCTION pg_temp.send(connection_name text, sql text) RETURNS integer LANGUAGE sql AS $$
  SELECT dblink_send_query(connection_name, pg_temp.expand(sql));
$$;
CREATE FUNCTION pg_temp.exec(connection_name text, sql text) RETURNS text LANGUAGE sql AS $$
  SELECT dblink_exec(connection_name, pg_temp.expand(sql));
$$;
CREATE FUNCTION pg_temp.begin_as(connection_name text, actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM dblink_exec(connection_name, 'BEGIN');
  PERFORM dblink_exec(connection_name, 'SET LOCAL ROLE authenticated');
  PERFORM dblink_exec(connection_name, format('SET LOCAL request.jwt.claim.sub = %L',
    'd1643066-0000-4000-8000-' || lpad(actor::text, 12, '0')));
END; $$;
CREATE FUNCTION pg_temp.blocked_by(waiter text, blocker text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (
      SELECT 1 FROM pg_stat_activity w
      JOIN pg_stat_activity b ON b.pid = ANY (pg_blocking_pids(w.pid))
      WHERE w.application_name = 't1643ict_' || waiter AND b.application_name = 't1643ict_' || blocker
    ) THEN RETURN true; END IF;
    IF clock_timestamp() >= deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END; $$;
CREATE FUNCTION pg_temp.result(connection_name text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_value jsonb;
  v_error text;
BEGIN
  SELECT r.value INTO v_value FROM dblink_get_result(connection_name, false) AS r(value jsonb);
  v_error := dblink_error_message(connection_name);
  PERFORM 1 FROM dblink_get_result(connection_name, false) AS r(value jsonb);
  IF v_error <> 'OK' THEN RETURN jsonb_build_object('error', v_error); END IF;
  RETURN jsonb_build_object('value', v_value);
END; $$;
CREATE FUNCTION pg_temp.failed(result jsonb, message text) RETURNS boolean LANGUAGE sql AS $$
  SELECT coalesce(result->>'error' LIKE '%' || message || '%', false);
$$;
CREATE FUNCTION pg_temp.orders() RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.call('fixture', $q$SELECT jsonb_object_agg(task_code, sort_order) FROM public.ict_tasks
    WHERE organization_id = #101 AND archived_at IS NULL$q$);
$$;
-- Each argument is task, expected order, new order.
CREATE FUNCTION pg_temp.move_sql(VARIADIC changes integer[]) RETURNS text LANGUAGE sql AS $$
  SELECT format($q$SELECT to_jsonb(count(*)) FROM public.reorder_ict_tasks(#101, %L)$q$, (
    SELECT jsonb_agg(jsonb_build_object(
      'id', ('d1643066-0000-4000-8000-' || lpad(changes[i]::text, 12, '0'))::uuid,
      'expected_sort_order', changes[i + 1], 'sort_order', changes[i + 2]) ORDER BY i)
    FROM generate_series(1, array_length(changes, 1), 3) AS i));
$$;

SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', pg_temp.move_sql(302, 1, 0, 301, 0, 1)), '2', 'a move of A below B stays open');
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.move_sql(301, 0, 1, 302, 1, 0));
SELECT ok(pg_temp.blocked_by('b', 'a'), 'the same move listed in the other order waits instead of deadlocking');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'Task order changed'), 'the waiting duplicate is refused as stale');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.orders(), '{"A": 1, "B": 0, "C": 2, "D": 3}', 'only the first move is saved and nothing moves back');

SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', pg_temp.move_sql(301, 1, 2, 303, 2, 1)), '2', 'a move of A below C stays open');
SELECT pg_temp.begin_as('b', 2);
SELECT is(pg_temp.call('b', pg_temp.move_sql(302, 0, 3, 304, 3, 0)), '2',
  'a move of unrelated tasks completes without waiting');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.orders(), '{"A": 2, "B": 3, "C": 1, "D": 0}', 'both disjoint moves are saved');

SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', $$WITH changed AS (UPDATE public.ict_tasks SET sort_order = 7 WHERE id = #303 RETURNING 1)
  SELECT to_jsonb(count(*)) FROM changed$$), '1', 'a direct sort order edit stays open');
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.move_sql(303, 1, 2, 301, 2, 1));
SELECT ok(pg_temp.blocked_by('b', 'a'), 'the move waits on the edited task');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'Task order changed'), 'the move sees the committed edit and is refused');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.orders(), '{"A": 2, "B": 3, "C": 7, "D": 0}', 'the edit alone is saved and A keeps its order');

SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', $$WITH changed AS (UPDATE public.ict_tasks SET archived_at = now() WHERE id = #304 RETURNING 1)
  SELECT to_jsonb(count(*)) FROM changed$$), '1', 'archiving D stays open');
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.move_sql(301, 2, 0, 304, 0, 2));
SELECT ok(pg_temp.blocked_by('b', 'a'), 'the move waits on the archived task');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'Task not found'), 'the move rejects the newly archived task');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.orders(), '{"A": 2, "B": 3, "C": 7}', 'A keeps its order when its companion was archived');

SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', $$WITH changed AS (UPDATE public.ict_tasks SET title = 'Bravo edited' WHERE id = #302 RETURNING 1)
  SELECT to_jsonb(count(*)) FROM changed$$), '1', 'an edit of B stays open');
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.move_sql(301, 2, 3, 302, 3, 2));
SELECT ok(pg_temp.blocked_by('b', 'a'), 'the move waits on the edited task');
SELECT pg_temp.exec('fixture', $$UPDATE public.organization_memberships
  SET capability_overrides = '{"criticalTasks":"view"}' WHERE organization_id = #101 AND user_id = #002$$);
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'Critical Tasks library configuration is not allowed'),
  'access revoked during the wait denies the move');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.orders(), '{"A": 2, "B": 3, "C": 7}', 'the denied move changed neither task');

SELECT pg_temp.exec('fixture', $$
  DELETE FROM public.organizations WHERE id = #101;
  DELETE FROM auth.users WHERE id::text LIKE 'd1643066-0000-4000-8000-%';
$$);
SELECT dblink_disconnect(name) FROM (VALUES ('fixture'), ('a'), ('b')) AS connections(name);
SELECT * FROM finish();
ROLLBACK;
