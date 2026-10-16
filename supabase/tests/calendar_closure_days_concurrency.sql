BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
DELETE FROM public.organizations WHERE id = 'd1686055-0000-4000-8000-000000000101';
DELETE FROM auth.users WHERE id::text LIKE 'd1686055-0000-4000-8000-%';
INSERT INTO auth.users (id, email)
SELECT ('d1686055-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'closure-concurrency-' || n || '@example.test'
FROM generate_series(1, 3) AS n;
INSERT INTO public.organizations (id, name, created_by)
VALUES ('d1686055-0000-4000-8000-000000000101', 'Closure Race Alpha', 'd1686055-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT 'd1686055-0000-4000-8000-000000000101'::uuid, ('d1686055-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer',
  '{"calendar":"configure","personnel":"none","training":"none","onboarding":"none"}'::jsonb,
  'organization', ARRAY[]::uuid[]
FROM generate_series(1, 3) AS actor;
INSERT INTO public.special_days (id, organization_id, date, name, type)
VALUES ('d1686055-0000-4000-8000-000000000301', 'd1686055-0000-4000-8000-000000000101', '2026-12-25', 'Christmas Day', 'federal-holiday');
COMMIT;

BEGIN;
SELECT no_plan();
SELECT dblink_connect(name, 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
  ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t1686cl_' || name)
FROM (VALUES ('fixture'), ('a'), ('b'), ('c')) AS connections(name);
SELECT dblink_exec(name, $$SET statement_timeout = '10s'$$) FROM (VALUES ('a'), ('b'), ('c')) AS connections(name);

CREATE FUNCTION pg_temp.expand(sql text) RETURNS text LANGUAGE sql AS $$
  SELECT regexp_replace(sql, '#(\d{3})', $r$'d1686055-0000-4000-8000-000000000\1'::uuid$r$, 'g');
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
    'd1686055-0000-4000-8000-' || lpad(actor::text, 12, '0')));
END; $$;
CREATE FUNCTION pg_temp.blocked_by(waiter text, blocker text, lock_type text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (
      SELECT 1 FROM pg_stat_activity w
      JOIN pg_locks l ON l.pid = w.pid AND NOT l.granted
      JOIN pg_stat_activity b ON b.pid = ANY (pg_blocking_pids(w.pid))
      WHERE w.application_name = 't1686cl_' || waiter AND b.application_name = 't1686cl_' || blocker
        AND l.locktype = lock_type
    ) THEN RETURN true; END IF;
    IF clock_timestamp() >= deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END; $$;
-- dblink re-raises a remote error with the remote SQLSTATE, which is all a denial needs to show.
CREATE FUNCTION pg_temp.result(connection_name text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_value jsonb;
  v_state text;
BEGIN
  SELECT r.value INTO v_value FROM dblink_get_result(connection_name, true) AS r(value jsonb);
  PERFORM 1 FROM dblink_get_result(connection_name, true) AS r(value jsonb);
  RETURN jsonb_build_object('value', v_value);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  PERFORM 1 FROM dblink_get_result(connection_name, false) AS r(value jsonb);
  RETURN jsonb_build_object('sqlstate', v_state);
END; $$;
CREATE FUNCTION pg_temp.days(org text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.fx(format($q$SELECT coalesce(jsonb_agg(jsonb_build_array(date, name, type) ORDER BY date, type, name), '[]')
    FROM public.special_days WHERE organization_id = #%s$q$, org));
$$;
CREATE FUNCTION pg_temp.snapshot() RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.fx($q$SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]') FROM public.special_days d
    WHERE organization_id = #101$q$);
$$;
CREATE FUNCTION pg_temp.set_calendar(actor integer, capability text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.exec('fixture', format($q$UPDATE public.organization_memberships
    SET capability_overrides = capability_overrides || jsonb_build_object('calendar', %L::text)
    WHERE organization_id = #101 AND user_id = #%s$q$, capability, lpad(actor::text, 3, '0')));
$$;
-- Returns the inserted dates so a result shows exactly which days each session created.
CREATE FUNCTION pg_temp.add_sql(name text, dates text) RETURNS text LANGUAGE sql AS $$
  SELECT format($q$SELECT coalesce(jsonb_agg(date ORDER BY date), '[]') FROM public.add_closure_days(#101, %L, %L::date[])$q$,
    name, dates);
$$;
CREATE TEMP TABLE results(label text PRIMARY KEY, value jsonb);

SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', pg_temp.add_sql('Block leave', '{2026-12-21,2026-12-22,2026-12-23,2026-12-24}')),
  '["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24"]', 'the first range inserts its four days and stays open');
SELECT pg_temp.begin_as('b', 3);
SELECT pg_temp.send('b', pg_temp.add_sql('Block leave', '{2026-12-23,2026-12-24,2026-12-25,2026-12-28}'));
SELECT ok(pg_temp.blocked_by('b', 'a', 'advisory'), 'the overlapping range waits on the first range''s advisory lock');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.result('b'), '{"value": ["2026-12-28"]}',
  'after the first commits, the second range inserts only the day nobody holds');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.days('101'),
  '[["2026-12-21","Block leave","org-closure"],["2026-12-22","Block leave","org-closure"],["2026-12-23","Block leave","org-closure"],["2026-12-24","Block leave","org-closure"],["2026-12-25","Christmas Day","federal-holiday"],["2026-12-28","Block leave","org-closure"]]',
  'overlapping ranges leave exactly one day per date');

INSERT INTO results SELECT 'before-lock-revoke', pg_temp.snapshot();
SELECT pg_temp.begin_as('a', 1);
SELECT pg_temp.call('a', $$SELECT to_jsonb(pg_advisory_xact_lock(hashtextextended('calendar-closure-days:' || #101::text, 0))::text)$$);
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.add_sql('Revoked leave', '{2027-01-04,2027-01-05}'));
SELECT ok(pg_temp.blocked_by('b', 'a', 'advisory'), 'the command waits on the advisory lock');
SELECT pg_temp.set_calendar(2, 'view');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.result('b'), '{"sqlstate": "42501"}', 'access revoked during the advisory wait denies the command');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_calendar(2, 'configure');
SELECT is(pg_temp.snapshot(), (SELECT value FROM results WHERE label = 'before-lock-revoke'),
  'the command denied after the lock wait inserted nothing');

INSERT INTO results SELECT 'before-fk-wait', pg_temp.snapshot();
SELECT pg_temp.exec('c', 'BEGIN');
SELECT pg_temp.call('c', $$SELECT to_jsonb(count(*)) FROM (SELECT 1 FROM public.organizations WHERE id = #101 FOR UPDATE) AS held$$);
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.add_sql('Revoked leave', '{2027-01-04,2027-01-05}'));
SELECT ok(pg_temp.blocked_by('b', 'c', 'transactionid'), 'the command waits on the held Organization row');
SELECT pg_temp.set_calendar(2, 'view');
SELECT pg_temp.exec('c', 'ROLLBACK');
SELECT is(pg_temp.result('b'), '{"sqlstate": "42501"}', 'access revoked during the foreign-key wait denies the command');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT pg_temp.set_calendar(2, 'configure');
SELECT is(pg_temp.snapshot(), (SELECT value FROM results WHERE label = 'before-fk-wait'),
  'the command denied after the foreign-key wait committed nothing');

SELECT pg_temp.exec('fixture', $$
  DELETE FROM public.organizations WHERE id = #101;
  DELETE FROM auth.users WHERE id::text LIKE 'd1686055-0000-4000-8000-%';
$$);
SELECT dblink_disconnect(name) FROM (VALUES ('fixture'), ('a'), ('b'), ('c')) AS connections(name);
SELECT * FROM finish();
ROLLBACK;
