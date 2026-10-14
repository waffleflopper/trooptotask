BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
DELETE FROM public.organizations WHERE id IN ('d1643055-0000-4000-8000-000000000101', 'd1643055-0000-4000-8000-000000000102');
DELETE FROM auth.users WHERE id::text LIKE 'd1643055-0000-4000-8000-%';
INSERT INTO auth.users (id, email)
SELECT ('d1643055-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'calendar-concurrency-' || n || '@example.test'
FROM generate_series(1, 3) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
('d1643055-0000-4000-8000-000000000101', 'Calendar Race Alpha', 'd1643055-0000-4000-8000-000000000001'),
('d1643055-0000-4000-8000-000000000102', 'Calendar Race Bravo', 'd1643055-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT 'd1643055-0000-4000-8000-000000000101'::uuid, ('d1643055-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer',
  '{"calendar":"configure","personnel":"none","training":"none","onboarding":"none"}'::jsonb,
  'organization', ARRAY[]::uuid[]
FROM generate_series(1, 3) AS actor;
INSERT INTO public.groups (id, organization_id, name) VALUES
('d1643055-0000-4000-8000-000000000201', 'd1643055-0000-4000-8000-000000000101', 'Race Group');
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, mos, slug) VALUES
('d1643055-0000-4000-8000-000000000501', 'd1643055-0000-4000-8000-000000000101',
 'd1643055-0000-4000-8000-000000000201', 'SGT', 'Race', 'Person', '68W', 'calendar-race-person');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to, show_in_date_header) VALUES
('d1643055-0000-4000-8000-000000000401', 'd1643055-0000-4000-8000-000000000101', 'Staff', 'STF', 'personnel', true),
('d1643055-0000-4000-8000-000000000402', 'd1643055-0000-4000-8000-000000000101', 'Group', 'GRP', 'group', false),
('d1643055-0000-4000-8000-000000000403', 'd1643055-0000-4000-8000-000000000101', 'Retiring', 'RET', 'personnel', false),
('d1643055-0000-4000-8000-000000000405', 'd1643055-0000-4000-8000-000000000101', 'Doomed', 'DMD', 'personnel', false),
('d1643055-0000-4000-8000-000000000406', 'd1643055-0000-4000-8000-000000000101', 'Archiving', 'ARC', 'personnel', false),
('d1643055-0000-4000-8000-000000000411', 'd1643055-0000-4000-8000-000000000102', 'Bravo Staff', 'BST', 'personnel', true);
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to, archived_at) VALUES
('d1643055-0000-4000-8000-000000000404', 'd1643055-0000-4000-8000-000000000101', 'Legacy', 'LEG', 'personnel', '2020-01-01T00:00:00Z');
INSERT INTO public.special_days (id, organization_id, date, name, type) VALUES
('d1643055-0000-4000-8000-000000000301', 'd1643055-0000-4000-8000-000000000101', '2019-07-04', 'Old Independence Day', 'federal-holiday'),
('d1643055-0000-4000-8000-000000000303', 'd1643055-0000-4000-8000-000000000101', '2026-08-14', 'Alpha Stand-down', 'org-closure'),
('d1643055-0000-4000-8000-000000000311', 'd1643055-0000-4000-8000-000000000102', '2026-07-03', 'Bravo Independence Day', 'federal-holiday');
COMMIT;

BEGIN;
SELECT no_plan();
SELECT dblink_connect(name, 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
  ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t1643cal_' || name)
FROM (VALUES ('fixture'), ('a'), ('b'), ('c')) AS connections(name);
SELECT dblink_exec(name, $$SET statement_timeout = '10s'$$) FROM (VALUES ('a'), ('b'), ('c')) AS connections(name);

CREATE FUNCTION pg_temp.expand(sql text) RETURNS text LANGUAGE sql AS $$
  SELECT regexp_replace(sql, '#(\d{3})', $r$'d1643055-0000-4000-8000-000000000\1'::uuid$r$, 'g');
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
    'd1643055-0000-4000-8000-' || lpad(actor::text, 12, '0')));
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
      WHERE w.application_name = 't1643cal_' || waiter AND b.application_name = 't1643cal_' || blocker
        AND l.locktype = lock_type
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
CREATE FUNCTION pg_temp.days(org text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.fx(format($q$SELECT coalesce(jsonb_agg(jsonb_build_array(date, name, type) ORDER BY date, type, name), '[]')
    FROM public.special_days WHERE organization_id = #%s$q$, org));
$$;
CREATE FUNCTION pg_temp.headers(org text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.fx(format($q$SELECT coalesce(jsonb_agg(name ORDER BY name), '[]')
    FROM public.assignment_types WHERE organization_id = #%s AND show_in_date_header$q$, org));
$$;
CREATE FUNCTION pg_temp.set_calendar(actor integer, capability text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.exec('fixture', format($q$UPDATE public.organization_memberships
    SET capability_overrides = capability_overrides || jsonb_build_object('calendar', %L::text)
    WHERE organization_id = #101 AND user_id = #%s$q$, capability, lpad(actor::text, 3, '0')));
$$;
CREATE FUNCTION pg_temp.reset_sql() RETURNS text LANGUAGE sql AS $$
  SELECT $q$SELECT to_jsonb(count(*)) FROM public.reset_federal_holidays(#101,
    '[{"date":"2027-01-01","name":"New Year''s Day"},{"date":"2026-12-25","name":"Christmas Day"}]')$q$;
$$;
CREATE FUNCTION pg_temp.header_sql(type_id text) RETURNS text LANGUAGE sql AS $$
  SELECT format($q$SELECT to_jsonb(public.set_assignment_type_date_header(#101, #%s)::text)$q$, type_id);
$$;
CREATE TEMP TABLE results(label text PRIMARY KEY, value jsonb);
INSERT INTO results SELECT 'bravo', pg_temp.fx($$SELECT jsonb_build_object(
  'days', (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.special_days d WHERE organization_id = #102),
  'types', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.assignment_types t WHERE organization_id = #102))$$);

SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', pg_temp.reset_sql()), '2', 'the first reset runs and stays open');
SELECT pg_temp.begin_as('b', 3);
SELECT pg_temp.send('b', pg_temp.reset_sql());
SELECT ok(pg_temp.blocked_by('b', 'a', 'advisory'), 'the second reset waits on the first reset''s advisory lock');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.result('b'), '{"value":2}', 'the second reset completes after the first commits');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.days('101'),
  '[["2026-08-14","Alpha Stand-down","org-closure"],["2026-12-25","Christmas Day","federal-holiday"],["2027-01-01","New Year''s Day","federal-holiday"]]',
  'overlapping resets leave exactly one default set and the closure');

SELECT pg_temp.exec('fixture', $$DELETE FROM public.special_days WHERE organization_id = #101 AND type = 'federal-holiday'$$);
SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', pg_temp.reset_sql()), '2', 'a reset from an empty federal set stays open');
SELECT pg_temp.begin_as('b', 3);
SELECT pg_temp.send('b', pg_temp.reset_sql());
SELECT ok(pg_temp.blocked_by('b', 'a', 'advisory'), 'with no rows to lock, the second reset still waits on the advisory lock');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.result('b'), '{"value":2}', 'the second empty-start reset completes');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.days('101'),
  '[["2026-08-14","Alpha Stand-down","org-closure"],["2026-12-25","Christmas Day","federal-holiday"],["2027-01-01","New Year''s Day","federal-holiday"]]',
  'the empty-start race also leaves one default set');

INSERT INTO results SELECT 'christmas', pg_temp.fx($$SELECT to_jsonb(id) FROM public.special_days
  WHERE organization_id = #101 AND name = 'Christmas Day'$$);
SELECT pg_temp.begin_as('a', 3);
SELECT is(pg_temp.call('a', format($$WITH changed AS (UPDATE public.special_days SET type = 'org-closure', name = 'Christmas Closure'
  WHERE id = %L RETURNING 1) SELECT to_jsonb(count(*)) FROM changed$$, (SELECT value->>0 FROM results WHERE label = 'christmas'))),
  '1', 'an edit of a federal row into a closure stays open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', pg_temp.reset_sql());
SELECT ok(pg_temp.blocked_by('b', 'a', 'transactionid'), 'the reset DELETE waits on the edited federal row');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.result('b'), '{"value":2}', 'the reset completes after the edit commits');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.days('101'),
  '[["2026-08-14","Alpha Stand-down","org-closure"],["2026-12-25","Christmas Day","federal-holiday"],["2026-12-25","Christmas Closure","org-closure"],["2027-01-01","New Year''s Day","federal-holiday"]]',
  'the edited row survives as a closure and the reset still stores one default set');
SELECT is(pg_temp.fx(format($$SELECT to_jsonb(type) FROM public.special_days WHERE id = %L$$,
  (SELECT value->>0 FROM results WHERE label = 'christmas'))), '"org-closure"', 'the closure keeps the edited row''s ID');

SELECT pg_temp.begin_as('b', 1);
SELECT is(pg_temp.call('b', pg_temp.reset_sql()), '2', 'a reset stays open');
SELECT pg_temp.begin_as('a', 3);
SELECT is(pg_temp.call('a', $$WITH added AS (INSERT INTO public.special_days (organization_id, date, name, type)
  VALUES (#101, '2026-11-27', 'Added During Reset', 'org-closure') RETURNING 1) SELECT to_jsonb(count(*)) FROM added$$),
  '1', 'a closure insert completes while the reset is open');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.fx($$SELECT to_jsonb(count(*)) FROM public.special_days
  WHERE organization_id = #101 AND name = 'Added During Reset' AND type = 'org-closure'$$), '1',
  'the closure added during the reset is kept');

INSERT INTO results SELECT 'before-revoked-reset', pg_temp.fx($$SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id)
  FROM public.special_days d WHERE organization_id = #101$$);
SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', $$SELECT to_jsonb(pg_advisory_xact_lock(hashtextextended('calendar-federal-holiday-reset:' || #101::text, 0))::text)$$),
  '""', 'another session holds the reset lock');
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.reset_sql());
SELECT ok(pg_temp.blocked_by('b', 'a', 'advisory'), 'the reset waits on the advisory lock');
SELECT pg_temp.set_calendar(2, 'view');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'Calendar configuration is not allowed'),
  'access revoked during the advisory wait denies the reset');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_calendar(2, 'configure');
SELECT is(pg_temp.fx($$SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.special_days d WHERE organization_id = #101$$),
  (SELECT value FROM results WHERE label = 'before-revoked-reset'), 'the denied reset changed no day');

SELECT pg_temp.begin_as('a', 3);
SELECT is(pg_temp.call('a', $$WITH changed AS (UPDATE public.special_days SET name = 'New Year Observed'
  WHERE organization_id = #101 AND name = 'New Year''s Day' RETURNING 1) SELECT to_jsonb(count(*)) FROM changed$$),
  '1', 'a federal row edit stays open');
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.reset_sql());
SELECT ok(pg_temp.blocked_by('b', 'a', 'transactionid'), 'the reset DELETE waits on the edited federal row');
SELECT pg_temp.set_calendar(2, 'view');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'new row violates row-level security policy for table "special_days"'),
  'access revoked during the federal row wait denies the reset');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_calendar(2, 'configure');
SELECT is(pg_temp.fx($$SELECT jsonb_agg(jsonb_build_array(id, name) ORDER BY id) FROM public.special_days
  WHERE organization_id = #101 AND type = 'federal-holiday'$$),
  (SELECT jsonb_agg(jsonb_build_array(d->'id', CASE WHEN d->>'name' = 'New Year''s Day' THEN 'New Year Observed' ELSE d->>'name' END) ORDER BY d->>'id')
    FROM results, jsonb_array_elements(value) AS d WHERE label = 'before-revoked-reset' AND d->>'type' = 'federal-holiday'),
  'only the committed edit changed the federal rows');

SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', pg_temp.header_sql('402')), '""', 'choosing Group stays open');
SELECT pg_temp.begin_as('b', 3);
SELECT pg_temp.send('b', pg_temp.header_sql('403'));
SELECT ok(pg_temp.blocked_by('b', 'a', 'advisory'), 'choosing Retiring waits on the advisory lock');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.result('b'), '{"value":""}', 'the later choice completes without a conflict');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.headers('101'), '["Retiring"]', 'the later committed choice is the only header');

SELECT pg_temp.begin_as('a', 3);
SELECT is(pg_temp.call('a', $$WITH gone AS (DELETE FROM public.assignment_types WHERE id = #405 RETURNING 1)
  SELECT to_jsonb(count(*)) FROM gone$$), '1', 'a delete of the target stays open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', pg_temp.header_sql('405'));
SELECT ok(pg_temp.blocked_by('b', 'a', 'transactionid'), 'the choice waits on the deleted target row');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'Assignment type not found'), 'the waiting choice finds no target');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.headers('101'), '["Retiring"]', 'the old header survives a deleted target');

SELECT pg_temp.begin_as('a', 3);
SELECT is(pg_temp.call('a', $$WITH changed AS (UPDATE public.assignment_types SET archived_at = now() WHERE id = #406 RETURNING 1)
  SELECT to_jsonb(count(*)) FROM changed$$), '1', 'archiving the target stays open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', pg_temp.header_sql('406'));
SELECT ok(pg_temp.blocked_by('b', 'a', 'transactionid'), 'the choice waits on the archived target row');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'Assignment type not found'), 'the waiting choice rejects an archived target');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.headers('101'), '["Retiring"]', 'the old header survives an archived target');

SELECT pg_temp.begin_as('a', 3);
SELECT is(pg_temp.call('a', $$WITH changed AS (UPDATE public.assignment_types SET name = 'Retiring Edited' WHERE id = #403 RETURNING 1)
  SELECT to_jsonb(count(*)) FROM changed$$), '1', 'an edit of the current header stays open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', pg_temp.header_sql('401'));
SELECT ok(pg_temp.blocked_by('b', 'a', 'transactionid'), 'the clear waits on the edited header row');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.result('b'), '{"value":""}', 'the choice completes after the edit');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.fx($$SELECT jsonb_agg(jsonb_build_array(name, show_in_date_header) ORDER BY name)
  FROM public.assignment_types WHERE id IN (#401, #403)$$), '[["Retiring Edited", false], ["Staff", true]]',
  'both the edit and the new header are kept');

SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', pg_temp.header_sql('402')), '""', 'choosing Group stays open');
SELECT pg_temp.exec('c', 'BEGIN');
SELECT pg_temp.exec('c', $$SET LOCAL lock_timeout = '2s'$$);
SELECT is(pg_temp.call('c', $$WITH added AS (INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id)
  VALUES (#101, #402, '2030-05-01', 'd1643055-0000-4000-8000-000000000501'),
         (#101, #401, '2030-05-01', 'd1643055-0000-4000-8000-000000000501') RETURNING 1)
  SELECT to_jsonb(count(*)) FROM added$$), '2', 'assignments referencing the new and old header insert without waiting');
SELECT pg_temp.exec('c', 'COMMIT');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.headers('101'), '["Group"]', 'the choice commits alongside the references');

SELECT pg_temp.exec('c', 'BEGIN');
SELECT is(pg_temp.call('c', $$WITH added AS (INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id)
  VALUES (#101, #401, '2030-05-02', 'd1643055-0000-4000-8000-000000000501') RETURNING 1)
  SELECT to_jsonb(count(*)) FROM added$$), '1', 'an assignment referencing Staff stays open');
SELECT pg_temp.begin_as('a', 1);
SELECT pg_temp.exec('a', $$SET LOCAL lock_timeout = '2s'$$);
SELECT is(pg_temp.call('a', pg_temp.header_sql('401')), '""', 'choosing Staff completes while the referencing insert is open');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT pg_temp.exec('c', 'COMMIT');
SELECT is(pg_temp.headers('101'), '["Staff"]', 'the choice and the held reference both commit');

SELECT pg_temp.exec('fixture', $$UPDATE public.assignment_types SET show_in_date_header = false WHERE organization_id = #101;
  UPDATE public.assignment_types SET show_in_date_header = true WHERE id = #404$$);
SELECT pg_temp.exec('a', 'BEGIN');
SELECT pg_temp.exec('a', 'SET LOCAL ROLE service_role');
SELECT is(pg_temp.call('a', $$SELECT to_jsonb(public.delete_expired_unreferenced_assignment_types(#101, ARRAY[#404], now()))$$),
  '1', 'retention deletes the archived legacy header and stays open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', pg_temp.header_sql('401'));
SELECT ok(pg_temp.blocked_by('b', 'a', 'transactionid'), 'the clear waits on the retention delete');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.result('b'), '{"value":""}', 'the choice completes after retention');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.fx($$SELECT jsonb_build_object('legacy', (SELECT count(*) FROM public.assignment_types WHERE id = #404),
  'headers', (SELECT jsonb_agg(name) FROM public.assignment_types WHERE organization_id = #101 AND show_in_date_header))$$),
  '{"legacy": 0, "headers": ["Staff"]}', 'retention removed the legacy row and Staff is the only header');

SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', $$SELECT to_jsonb(pg_advisory_xact_lock(hashtextextended('calendar-date-header:' || #101::text, 0))::text)$$),
  '""', 'another session holds the header lock');
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.header_sql('402'));
SELECT ok(pg_temp.blocked_by('b', 'a', 'advisory'), 'the choice waits on the advisory lock');
SELECT pg_temp.set_calendar(2, 'view');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'Calendar configuration is not allowed'),
  'access revoked during the advisory wait denies the choice');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_calendar(2, 'configure');
SELECT is(pg_temp.headers('101'), '["Staff"]', 'the denied choice kept the header');

SELECT pg_temp.begin_as('a', 3);
SELECT is(pg_temp.call('a', $$WITH changed AS (UPDATE public.assignment_types SET color = '#abcdef' WHERE id = #402 RETURNING 1)
  SELECT to_jsonb(count(*)) FROM changed$$), '1', 'an edit of the target stays open');
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.header_sql('402'));
SELECT ok(pg_temp.blocked_by('b', 'a', 'transactionid'), 'the choice waits on the target row');
SELECT pg_temp.set_calendar(2, 'view');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'Calendar configuration is not allowed'),
  'access revoked during the target wait denies the choice');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_calendar(2, 'configure');
SELECT is(pg_temp.headers('101'), '["Staff"]', 'the header is unchanged after the target-wait denial');

SELECT pg_temp.begin_as('a', 3);
SELECT is(pg_temp.call('a', $$WITH changed AS (UPDATE public.assignment_types SET color = '#fedcba' WHERE id = #401 RETURNING 1)
  SELECT to_jsonb(count(*)) FROM changed$$), '1', 'an edit of the current header stays open');
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.header_sql('402'));
SELECT ok(pg_temp.blocked_by('b', 'a', 'transactionid'), 'the clear waits on the current header row');
SELECT pg_temp.set_calendar(2, 'view');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'Date header was not saved'),
  'access revoked during the header wait denies the choice before reporting success');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_calendar(2, 'configure');
SELECT is(pg_temp.fx($$SELECT jsonb_agg(jsonb_build_array(name, show_in_date_header, color) ORDER BY name)
  FROM public.assignment_types WHERE id IN (#401, #402)$$), '[["Group", false, "#abcdef"], ["Staff", true, "#fedcba"]]',
  'the denied choice cleared nothing and kept both committed edits');

INSERT INTO results SELECT 'before-fk-wait', pg_temp.fx($$SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id)
  FROM public.special_days d WHERE organization_id = #101$$);
SELECT pg_temp.exec('c', 'BEGIN');
SELECT is(pg_temp.call('c', $$SELECT to_jsonb(count(*)) FROM (SELECT 1 FROM public.organizations WHERE id = #101 FOR UPDATE) AS held$$),
  '1', 'another session holds the Organization row without changing it');
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.reset_sql());
SELECT ok(pg_temp.blocked_by('b', 'c', 'transactionid'), 'the reset waits on the held Organization row');
SELECT ok(EXISTS (SELECT 1 FROM pg_stat_activity w JOIN pg_locks l ON l.pid = w.pid AND l.granted
    WHERE w.application_name = 't1643cal_b' AND l.locktype = 'tuple' AND l.relation = 'public.organizations'::regclass),
  'the waiting lock is the reset INSERT''s Organization foreign-key check');
SELECT pg_temp.set_calendar(2, 'view');
SELECT pg_temp.exec('c', 'ROLLBACK');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'Calendar configuration is not allowed'),
  'access revoked during the foreign-key wait denies the reset');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT pg_temp.set_calendar(2, 'configure');
SELECT is(pg_temp.fx($$SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.special_days d WHERE organization_id = #101$$),
  (SELECT value FROM results WHERE label = 'before-fk-wait'), 'the denied reset committed no day after the wait');

SELECT pg_temp.exec('fixture', $$UPDATE public.assignment_types SET show_in_date_header = false WHERE organization_id = #101$$);
SELECT pg_temp.begin_as('a', 3);
SELECT is(pg_temp.call('a', $$WITH added AS (INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to, show_in_date_header)
  VALUES (#407, #101, 'Direct Header', 'DHD', 'personnel', true) RETURNING 1) SELECT to_jsonb(count(*)) FROM added$$),
  '1', 'a direct insert of a new header stays open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', pg_temp.header_sql('402'));
SELECT ok(pg_temp.blocked_by('b', 'a', 'transactionid'), 'the choice waits on the uncommitted direct header');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'duplicate key value violates unique constraint "assignment_types_one_header_per_org"'),
  'the wait was the final update''s one-header index check');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.headers('101'), '["Direct Header"]', 'the committed direct header stays the only header');

SELECT pg_temp.exec('fixture', $$DELETE FROM public.assignment_types WHERE id = #407$$);
INSERT INTO results SELECT 'before-index-wait', pg_temp.fx($$SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)
  FROM public.assignment_types t WHERE organization_id = #101$$);
SELECT pg_temp.begin_as('a', 3);
SELECT is(pg_temp.call('a', $$WITH added AS (INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to, show_in_date_header)
  VALUES (#407, #101, 'Direct Header', 'DHD', 'personnel', true) RETURNING 1) SELECT to_jsonb(count(*)) FROM added$$),
  '1', 'another direct header insert stays open');
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', pg_temp.header_sql('402'));
SELECT ok(pg_temp.blocked_by('b', 'a', 'transactionid'), 'the final header update waits on the one-header index');
SELECT pg_temp.set_calendar(2, 'view');
SELECT pg_temp.exec('a', 'ROLLBACK');
SELECT ok(pg_temp.failed(pg_temp.result('b'), 'Calendar configuration is not allowed'),
  'access revoked during the index wait denies the choice');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT pg_temp.set_calendar(2, 'configure');
SELECT is(pg_temp.fx($$SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.assignment_types t WHERE organization_id = #101$$),
  (SELECT value FROM results WHERE label = 'before-index-wait'), 'the denied choice committed no assignment type change after the wait');

SELECT is(pg_temp.fx($$SELECT jsonb_build_object(
  'days', (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.special_days d WHERE organization_id = #102),
  'types', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.assignment_types t WHERE organization_id = #102))$$),
  (SELECT value FROM results WHERE label = 'bravo'), 'another Organization is untouched throughout');

SELECT pg_temp.exec('fixture', $$
  DELETE FROM public.organizations WHERE id IN (#101, #102);
  DELETE FROM auth.users WHERE id::text LIKE 'd1643055-0000-4000-8000-%';
$$);
SELECT dblink_disconnect(name) FROM (VALUES ('fixture'), ('a'), ('b'), ('c')) AS connections(name);
SELECT * FROM finish();
ROLLBACK;
