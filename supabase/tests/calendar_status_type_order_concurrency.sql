BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
DELETE FROM public.organizations WHERE id IN ('d1684055-0000-4000-8000-000000000101', 'd1684055-0000-4000-8000-000000000102');
DELETE FROM auth.users WHERE id::text LIKE 'd1684055-0000-4000-8000-%';
INSERT INTO auth.users (id, email)
SELECT ('d1684055-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'status-order-race-' || n || '@example.test'
FROM generate_series(1, 3) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
('d1684055-0000-4000-8000-000000000101', 'Status Race Alpha', 'd1684055-0000-4000-8000-000000000001'),
('d1684055-0000-4000-8000-000000000102', 'Status Race Bravo', 'd1684055-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT 'd1684055-0000-4000-8000-000000000101'::uuid, ('d1684055-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer',
  '{"calendar":"configure","personnel":"none","training":"none","onboarding":"none"}'::jsonb,
  'organization', ARRAY[]::uuid[]
FROM generate_series(1, 3) AS actor;
INSERT INTO public.groups (id, organization_id, name) VALUES
('d1684055-0000-4000-8000-000000000201', 'd1684055-0000-4000-8000-000000000101', 'Race Group');
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, mos, slug) VALUES
('d1684055-0000-4000-8000-000000000501', 'd1684055-0000-4000-8000-000000000101',
 'd1684055-0000-4000-8000-000000000201', 'SGT', 'Race', 'Person', '68W', 'status-order-race-person');
INSERT INTO public.status_types (id, organization_id, name, sort_order) VALUES
('d1684055-0000-4000-8000-000000000401', 'd1684055-0000-4000-8000-000000000101', 'Leave', 0),
('d1684055-0000-4000-8000-000000000402', 'd1684055-0000-4000-8000-000000000101', 'School', 1),
('d1684055-0000-4000-8000-000000000403', 'd1684055-0000-4000-8000-000000000101', 'Sick', 2),
('d1684055-0000-4000-8000-000000000411', 'd1684055-0000-4000-8000-000000000102', 'Bravo Leave', 0);
COMMIT;

BEGIN;
SELECT no_plan();
SELECT dblink_connect(name, 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
  ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t1684sto_' || name)
FROM (VALUES ('fixture'), ('a'), ('b'), ('c')) AS connections(name);
SELECT dblink_exec(name, $$SET statement_timeout = '10s'$$) FROM (VALUES ('a'), ('b'), ('c')) AS connections(name);

CREATE FUNCTION pg_temp.expand(sql text) RETURNS text LANGUAGE sql AS $$
  SELECT regexp_replace(sql, '#(\d{3})', $r$'d1684055-0000-4000-8000-000000000\1'::uuid$r$, 'g');
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
CREATE FUNCTION pg_temp.fx(sql text) RETURNS jsonb LANGUAGE sql AS $$ SELECT pg_temp.call('fixture', sql); $$;
CREATE FUNCTION pg_temp.begin_as(connection_name text, actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM dblink_exec(connection_name, 'BEGIN');
  PERFORM dblink_exec(connection_name, 'SET LOCAL ROLE authenticated');
  PERFORM dblink_exec(connection_name, format('SET LOCAL request.jwt.claim.sub = %L',
    'd1684055-0000-4000-8000-' || lpad(actor::text, 12, '0')));
END; $$;
-- Scheduling setup, not an assertion: the waiter must be blocked before the
-- blocker finishes, or the interleaving under test never happened.
CREATE FUNCTION pg_temp.await_wait(waiter text, blocker text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (
      SELECT 1 FROM pg_stat_activity w
      JOIN pg_stat_activity b ON b.pid = ANY (pg_blocking_pids(w.pid))
      WHERE w.application_name = 't1684sto_' || waiter AND b.application_name = 't1684sto_' || blocker
    ) THEN RETURN; END IF;
    IF clock_timestamp() >= deadline THEN RAISE EXCEPTION '% never waited on %', waiter, blocker; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END; $$;
CREATE FUNCTION pg_temp.hold(connection_name text, sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF pg_temp.call(connection_name, sql) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'setup on % did not change exactly one row', connection_name;
  END IF;
END; $$;
-- dblink raises a remote failure with the remote SQLSTATE.
CREATE FUNCTION pg_temp.result(connection_name text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_value jsonb;
  v_result jsonb;
BEGIN
  BEGIN
    SELECT r.value INTO v_value FROM dblink_get_result(connection_name) AS r(value jsonb);
    v_result := jsonb_build_object('value', v_value);
  EXCEPTION WHEN OTHERS THEN
    v_result := jsonb_build_object('sqlstate', SQLSTATE);
  END;
  PERFORM 1 FROM dblink_get_result(connection_name, false) AS r(value jsonb);
  RETURN v_result;
END; $$;
CREATE FUNCTION pg_temp.statuses() RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.fx($q$SELECT coalesce(jsonb_agg(name ORDER BY sort_order, id), '[]')
    FROM public.status_types WHERE organization_id = #101$q$);
$$;
CREATE FUNCTION pg_temp.set_calendar(actor integer, capability text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.exec('fixture', format($q$UPDATE public.organization_memberships
    SET capability_overrides = capability_overrides || jsonb_build_object('calendar', %L::text)
    WHERE organization_id = #101 AND user_id = #%s$q$, capability, lpad(actor::text, 3, '0')));
$$;
CREATE FUNCTION pg_temp.order_sql(desired text, expected text) RETURNS text LANGUAGE sql AS $$
  SELECT format($q$SELECT to_jsonb(public.set_status_type_order(#101, ARRAY[%s]::uuid[], ARRAY[%s]::uuid[])::text)$q$,
    (SELECT string_agg('#' || id, ', ') FROM unnest(string_to_array(desired, ',')) AS d(id)),
    (SELECT string_agg('#' || id, ', ') FROM unnest(string_to_array(expected, ',')) AS e(id)));
$$;
CREATE TEMP TABLE results(label text PRIMARY KEY, value jsonb);
INSERT INTO results SELECT 'bravo', pg_temp.fx($$SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)
  FROM public.status_types t WHERE organization_id = #102$$);

SELECT pg_temp.begin_as('a', 1);
SELECT pg_temp.call('a', pg_temp.order_sql('402,403,401', '401,402,403'));
SELECT pg_temp.begin_as('b', 3);
SELECT pg_temp.send('b', pg_temp.order_sql('403,401,402', '401,402,403'));
SELECT pg_temp.await_wait('b', 'a');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.result('b'), '{"sqlstate":"STO01"}', 'a different reorder from the same old order is a conflict');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.statuses(), '["School", "Sick", "Leave"]', 'the first committed reorder is kept and nothing is overwritten');

SELECT pg_temp.begin_as('a', 1);
SELECT pg_temp.call('a', pg_temp.order_sql('401,402,403', '402,403,401'));
SELECT pg_temp.begin_as('b', 3);
SELECT pg_temp.send('b', pg_temp.order_sql('401,402,403', '402,403,401'));
SELECT pg_temp.await_wait('b', 'a');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.result('b'), '{"value":""}', 'the same reorder from two people converges without a conflict');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.statuses(), '["Leave", "School", "Sick"]', 'both sessions agree on the saved order');

SELECT pg_temp.begin_as('a', 1);
SELECT pg_temp.call('a', pg_temp.order_sql('403,402,401', '401,402,403'));
SELECT pg_temp.begin_as('c', 3);
SELECT pg_temp.exec('c', $$SET LOCAL lock_timeout = '2s'$$);
SELECT is(pg_temp.call('c', $$WITH added AS (INSERT INTO public.status_types (id, organization_id, name, sort_order)
  VALUES (#404, #101, 'Quarters', 3) RETURNING 1) SELECT to_jsonb(count(*)) FROM added$$), '1',
  'a status type is created without waiting on the open reorder');
SELECT pg_temp.exec('c', 'COMMIT');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.statuses(), '["Sick", "School", "Leave", "Quarters"]',
  'the reorder and the type created alongside it are both kept, the new type last');
SELECT pg_temp.begin_as('b', 3);
SELECT pg_temp.send('b', pg_temp.order_sql('401,402,403', '403,402,401'));
SELECT is(pg_temp.result('b'), '{"sqlstate":"STO01"}',
  'a reorder read before that create is a conflict and cannot drop the new type');
SELECT pg_temp.exec('b', 'ROLLBACK');

SELECT pg_temp.begin_as('a', 3);
SELECT pg_temp.hold('a', $$WITH gone AS (DELETE FROM public.status_types WHERE id = #404 RETURNING 1)
  SELECT to_jsonb(count(*)) FROM gone$$);
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', pg_temp.order_sql('404,401,402,403', '403,402,401,404'));
SELECT pg_temp.await_wait('b', 'a');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.result('b'), '{"sqlstate":"STO01"}', 'the waiting reorder sees the deletion as a conflict');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.statuses(), '["Sick", "School", "Leave"]', 'the deletion is kept and the rest keep their order');

SELECT pg_temp.begin_as('a', 1);
SELECT pg_temp.call('a', pg_temp.order_sql('401,402,403', '403,402,401'));
SELECT pg_temp.exec('c', 'BEGIN');
SELECT pg_temp.exec('c', $$SET LOCAL lock_timeout = '2s'$$);
SELECT is(pg_temp.call('c', $$WITH added AS (INSERT INTO public.availability_entries
    (organization_id, personnel_id, status_type_id, start_date, end_date)
  VALUES (#101, #501, #401, '2030-05-01', '2030-05-02') RETURNING 1) SELECT to_jsonb(count(*)) FROM added$$), '1',
  'availability referencing a status type inserts without waiting on the open reorder');
SELECT pg_temp.exec('c', 'COMMIT');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.statuses(), '["Leave", "School", "Sick"]', 'the reorder commits alongside the reference');

SELECT pg_temp.begin_as('a', 1);
SELECT pg_temp.call('a', $$SELECT to_jsonb(pg_advisory_xact_lock(hashtextextended('calendar-status-order:' || #101::text, 0))::text)$$);
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.order_sql('403,402,401', '401,402,403'));
SELECT pg_temp.await_wait('b', 'a');
SELECT pg_temp.set_calendar(2, 'view');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.result('b'), '{"sqlstate":"42501"}', 'access revoked during the advisory wait denies the reorder');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_calendar(2, 'configure');

SELECT pg_temp.begin_as('a', 3);
SELECT pg_temp.hold('a', $$WITH changed AS (UPDATE public.status_types SET color = '#abcdef' WHERE id = #402 RETURNING 1)
  SELECT to_jsonb(count(*)) FROM changed$$);
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.order_sql('403,402,401', '401,402,403'));
SELECT pg_temp.await_wait('b', 'a');
SELECT pg_temp.set_calendar(2, 'view');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.result('b'), '{"sqlstate":"42501"}', 'access revoked during the row wait denies the reorder');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_calendar(2, 'configure');
SELECT is(pg_temp.fx($$SELECT jsonb_agg(jsonb_build_array(name, sort_order, color) ORDER BY sort_order)
  FROM public.status_types WHERE organization_id = #101$$),
  '[["Leave", 0, "#6b7280"], ["School", 1, "#abcdef"], ["Sick", 2, "#6b7280"]]',
  'the denied reorders wrote nothing and kept the committed edit');

SELECT is(pg_temp.fx($$SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.status_types t WHERE organization_id = #102$$),
  (SELECT value FROM results WHERE label = 'bravo'), 'another Organization is untouched throughout');

SELECT pg_temp.exec('fixture', $$
  DELETE FROM public.organizations WHERE id IN (#101, #102);
  DELETE FROM auth.users WHERE id::text LIKE 'd1684055-0000-4000-8000-%';
$$);
SELECT dblink_disconnect(name) FROM (VALUES ('fixture'), ('a'), ('b'), ('c')) AS connections(name);
SELECT * FROM finish();
ROLLBACK;
