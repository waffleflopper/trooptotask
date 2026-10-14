BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users (id, email)
SELECT ('f1643000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'template-concurrency-' || n || '@example.test'
FROM generate_series(1, 4) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
('f1643000-0000-4000-8000-000000000101', 'Concurrency Alpha', 'f1643000-0000-4000-8000-000000000001'),
('f1643000-0000-4000-8000-000000000102', 'Concurrency Bravo', 'f1643000-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT 'f1643000-0000-4000-8000-000000000101'::uuid, ('f1643000-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer',
  jsonb_build_object('onboarding', capability, 'personnel', 'none', 'training', 'none', 'calendar', 'none'),
  'organization', ARRAY[]::uuid[]
FROM (VALUES (1, 'configure'), (2, 'configure'), (3, 'operate'), (4, 'configure')) AS actors(actor, capability);
INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES
('f1643000-0000-4000-8000-000000000301', 'f1643000-0000-4000-8000-000000000101', 'Reorder inserts'),
('f1643000-0000-4000-8000-000000000302', 'f1643000-0000-4000-8000-000000000101', 'Reorder deletes'),
('f1643000-0000-4000-8000-000000000303', 'f1643000-0000-4000-8000-000000000101', 'Other'),
('f1643000-0000-4000-8000-000000000304', 'f1643000-0000-4000-8000-000000000101', 'Snapshot'),
('f1643000-0000-4000-8000-000000000305', 'f1643000-0000-4000-8000-000000000101', 'Dup source'),
('f1643000-0000-4000-8000-000000000306', 'f1643000-0000-4000-8000-000000000101', 'Delete with progress'),
('f1643000-0000-4000-8000-000000000307', 'f1643000-0000-4000-8000-000000000101', 'Delete while reconciling'),
('f1643000-0000-4000-8000-000000000308', 'f1643000-0000-4000-8000-000000000101', 'Authority source'),
('f1643000-0000-4000-8000-000000000309', 'f1643000-0000-4000-8000-000000000101', 'Authority delete'),
('f1643000-0000-4000-8000-000000000310', 'f1643000-0000-4000-8000-000000000101', 'Authority doomed source'),
('f1643000-0000-4000-8000-000000000312', 'f1643000-0000-4000-8000-000000000101', 'Authority doomed reorder'),
('f1643000-0000-4000-8000-000000000311', 'f1643000-0000-4000-8000-000000000102', 'Bravo witness');
INSERT INTO public.onboarding_template_steps (id, organization_id, template_id, name, step_type, sort_order)
SELECT ('f1643000-0000-4000-8000-' || lpad(step::text, 12, '0'))::uuid,
  CASE WHEN step = 511 THEN 'f1643000-0000-4000-8000-000000000102' ELSE 'f1643000-0000-4000-8000-000000000101' END::uuid,
  ('f1643000-0000-4000-8000-' || lpad((300 + step / 10 % 10 + CASE WHEN step = 511 THEN 10 ELSE 0 END)::text, 12, '0'))::uuid,
  name, 'checkbox', position
FROM (VALUES
  (411, 'One', 0), (412, 'Two', 1), (413, 'Three', 2),
  (421, 'One', 0), (422, 'Two', 1), (423, 'Three', 2),
  (431, 'Other step', 0),
  (441, 'First', 0), (442, 'Second', 1), (443, 'Third', 2),
  (451, 'Alpha step', 0), (452, 'Beta step', 1),
  (461, 'Linked first', 0), (462, 'Linked second', 1),
  (471, 'Reconciled', 0),
  (481, 'Authority step', 0), (483, 'Authority extra', 1),
  (491, 'Authority linked', 0),
  (511, 'Bravo step', 0)
) AS steps(step, name, position);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug)
SELECT ('f1643000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'f1643000-0000-4000-8000-000000000101',
  'SPC', 'Person', n::text, 'template-concurrency-' || n
FROM generate_series(501, 505) AS n;
INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, template_id, status) VALUES
('f1643000-0000-4000-8000-000000000701', 'f1643000-0000-4000-8000-000000000101', 'f1643000-0000-4000-8000-000000000501', 'f1643000-0000-4000-8000-000000000306', 'in_progress'),
('f1643000-0000-4000-8000-000000000702', 'f1643000-0000-4000-8000-000000000101', 'f1643000-0000-4000-8000-000000000502', 'f1643000-0000-4000-8000-000000000307', 'in_progress'),
('f1643000-0000-4000-8000-000000000705', 'f1643000-0000-4000-8000-000000000101', 'f1643000-0000-4000-8000-000000000505', 'f1643000-0000-4000-8000-000000000309', 'in_progress');
INSERT INTO public.onboarding_step_progress (
  id, organization_id, onboarding_id, template_step_id, step_name, step_type, sort_order, completed, notes
) VALUES
('f1643000-0000-4000-8000-000000000861', 'f1643000-0000-4000-8000-000000000101', 'f1643000-0000-4000-8000-000000000701', 'f1643000-0000-4000-8000-000000000461', 'Linked first', 'checkbox', 0, false, '[]'),
('f1643000-0000-4000-8000-000000000862', 'f1643000-0000-4000-8000-000000000101', 'f1643000-0000-4000-8000-000000000701', 'f1643000-0000-4000-8000-000000000462', 'Linked second', 'checkbox', 1, true, '[]'),
('f1643000-0000-4000-8000-000000000871', 'f1643000-0000-4000-8000-000000000101', 'f1643000-0000-4000-8000-000000000702', 'f1643000-0000-4000-8000-000000000471', 'Reconciled', 'checkbox', 0, true, '[]'),
('f1643000-0000-4000-8000-000000000891', 'f1643000-0000-4000-8000-000000000101', 'f1643000-0000-4000-8000-000000000705', 'f1643000-0000-4000-8000-000000000491', 'Authority linked', 'checkbox', 0, false, '[]');
COMMIT;

BEGIN;
SELECT dblink_connect(name, 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
  ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t1643_' || name)
FROM (VALUES ('fixture'), ('a'), ('b'), ('c')) AS connections(name);
SELECT dblink_exec(name, $$SET statement_timeout = '10s'$$) FROM (VALUES ('a'), ('b'), ('c')) AS connections(name);

CREATE FUNCTION pg_temp.expand_fixture_uuids(sql text) RETURNS text LANGUAGE sql AS $$
  SELECT regexp_replace(regexp_replace(sql,
    '#(\d{4})', $r$'f1643000-0000-4000-8000-00000000\1'::uuid$r$, 'g'),
    '#(\d{3})', $r$'f1643000-0000-4000-8000-000000000\1'::uuid$r$, 'g');
$$;
CREATE FUNCTION pg_temp.call(connection_name text, sql text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT value FROM dblink(connection_name, pg_temp.expand_fixture_uuids(sql)) AS result(value jsonb);
$$;
CREATE FUNCTION pg_temp.send(connection_name text, sql text) RETURNS integer LANGUAGE sql AS $$
  SELECT dblink_send_query(connection_name, pg_temp.expand_fixture_uuids(sql));
$$;
CREATE FUNCTION pg_temp.exec(connection_name text, sql text) RETURNS text LANGUAGE sql AS $$
  SELECT dblink_exec(connection_name, pg_temp.expand_fixture_uuids(sql));
$$;
CREATE FUNCTION pg_temp.fx(sql text) RETURNS jsonb LANGUAGE sql AS $$ SELECT pg_temp.call('fixture', sql); $$;
CREATE FUNCTION pg_temp.begin_as(connection_name text, actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM dblink_exec(connection_name, 'BEGIN');
  PERFORM dblink_exec(connection_name, 'SET LOCAL ROLE authenticated');
  PERFORM dblink_exec(connection_name, format('SET LOCAL request.jwt.claim.sub = %L',
    'f1643000-0000-4000-8000-' || lpad(actor::text, 12, '0')));
END; $$;
CREATE FUNCTION pg_temp.waits(waiter text, blocker text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (SELECT 1 FROM pg_stat_activity w JOIN pg_stat_activity b ON b.pid = ANY (pg_blocking_pids(w.pid))
      WHERE w.application_name = 't1643_' || waiter AND b.application_name = 't1643_' || blocker
        AND w.wait_event_type = 'Lock') THEN RETURN true; END IF;
    IF clock_timestamp() >= deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END; $$;
CREATE FUNCTION pg_temp.connection_result(connection_name text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_value jsonb;
  v_error text;
BEGIN
  SELECT result.value INTO v_value FROM dblink_get_result(connection_name, false) AS result(value jsonb);
  v_error := dblink_error_message(connection_name);
  PERFORM 1 FROM dblink_get_result(connection_name, false) AS result(value jsonb);
  IF v_error <> 'OK' THEN RETURN jsonb_build_object('error', v_error); END IF;
  RETURN jsonb_build_object('value', v_value);
END; $$;
CREATE FUNCTION pg_temp.failed(result jsonb, message text) RETURNS boolean LANGUAGE sql AS $$
  SELECT coalesce(result->>'error' LIKE '%' || message || '%', false);
$$;
CREATE FUNCTION pg_temp.order_of(template integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.fx(format($q$SELECT coalesce(jsonb_agg(jsonb_build_array(right(id::text, 3)::integer, sort_order)
    ORDER BY sort_order, id), '[]') FROM public.onboarding_template_steps WHERE template_id = #%s$q$, template));
$$;
CREATE FUNCTION pg_temp.set_onboarding(actor integer, capability text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.exec('fixture', format($q$UPDATE public.organization_memberships
    SET capability_overrides = capability_overrides || jsonb_build_object('onboarding', %L::text)
    WHERE organization_id = #101 AND user_id = #%s$q$, capability, lpad(actor::text, 3, '0')));
$$;
CREATE TEMP TABLE results(label text PRIMARY KEY, value jsonb);
INSERT INTO results SELECT 'bravo', pg_temp.fx($$SELECT jsonb_build_object(
  't', (SELECT jsonb_agg(to_jsonb(t)) FROM public.onboarding_templates t WHERE organization_id = #102),
  's', (SELECT jsonb_agg(to_jsonb(s)) FROM public.onboarding_template_steps s WHERE organization_id = #102))$$);

SELECT pg_temp.begin_as('a', 2);
SELECT is(pg_temp.call('a', $$WITH w AS (INSERT INTO public.onboarding_template_steps
  (id, organization_id, template_id, name, step_type, sort_order) VALUES (#414, #101, #301, 'Four', 'checkbox', 3)
  RETURNING 1) SELECT to_jsonb(count(*)) FROM w$$), '1', 'a step insert into the template is held open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', $$SELECT public.reorder_onboarding_template_steps(#101, #301, ARRAY[#413, #412, #411])$$);
SELECT ok(pg_temp.waits('b', 'a'), 'reorder waits for the uncommitted step insert');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.connection_result('b'), 'Step order does not match the selected onboarding template'),
  'the awaited reorder rejects an order missing the inserted step');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.order_of(301), '[[411,0],[412,1],[413,2],[414,3]]', 'the rejected reorder changed no position');

SELECT pg_temp.begin_as('b', 1);
SELECT is(jsonb_array_length(pg_temp.call('b', $$SELECT public.reorder_onboarding_template_steps(#101, #301,
  ARRAY[#414, #413, #412, #411])$$)), 4, 'a complete reorder is held open');
SELECT pg_temp.begin_as('a', 2);
SELECT pg_temp.send('a', $$WITH w AS (INSERT INTO public.onboarding_template_steps
  (id, organization_id, template_id, name, step_type, sort_order) VALUES (#415, #101, #301, 'Five', 'checkbox', 4)
  RETURNING 1) SELECT to_jsonb(count(*)) FROM w$$);
SELECT ok(pg_temp.waits('a', 'b'), 'a step insert waits for the reorder holding its template');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.connection_result('a'), '{"value":1}', 'the awaited insert succeeds after the reorder');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.order_of(301), '[[414,0],[413,1],[412,2],[411,3],[415,4]]', 'the insert lands after the whole reorder');

SELECT pg_temp.begin_as('a', 2);
SELECT is(pg_temp.call('a', $$WITH w AS (UPDATE public.onboarding_template_steps SET template_id = #301
  WHERE id = #431 RETURNING 1) SELECT to_jsonb(count(*)) FROM w$$), '1', 'a step move into the template is held open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', $$SELECT public.reorder_onboarding_template_steps(#101, #301, ARRAY[#411, #412, #413, #414, #415])$$);
SELECT ok(pg_temp.waits('b', 'a'), 'reorder waits for the step moving in');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.connection_result('b'), 'Step order does not match the selected onboarding template'),
  'the awaited reorder rejects an order missing the moved-in step');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.order_of(301), '[[414,0],[431,0],[413,1],[412,2],[411,3],[415,4]]', 'the rejected reorder changed no position');

SELECT pg_temp.begin_as('b', 1);
SELECT is(jsonb_array_length(pg_temp.call('b', $$SELECT public.reorder_onboarding_template_steps(#101, #301,
  ARRAY[#431, #415, #414, #413, #412, #411])$$)), 6, 'a reorder including the moved-in step is held open');
SELECT pg_temp.begin_as('a', 2);
SELECT pg_temp.send('a', $$WITH w AS (UPDATE public.onboarding_template_steps SET template_id = #303
  WHERE id = #431 RETURNING 1) SELECT to_jsonb(count(*)) FROM w$$);
SELECT ok(pg_temp.waits('a', 'b'), 'moving a step out waits for the reorder holding its row');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.connection_result('a'), '{"value":1}', 'the awaited move out succeeds after the reorder');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.order_of(301), '[[415,1],[414,2],[413,3],[412,4],[411,5]]', 'the remaining steps keep the committed order');

SELECT pg_temp.begin_as('a', 2);
SELECT is(pg_temp.call('a', $$WITH w AS (UPDATE public.onboarding_template_steps SET template_id = #303
  WHERE id = #415 RETURNING 1) SELECT to_jsonb(count(*)) FROM w$$), '1', 'a step move out of the template is held open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', $$SELECT public.reorder_onboarding_template_steps(#101, #301, ARRAY[#415, #414, #413, #412, #411])$$);
SELECT ok(pg_temp.waits('b', 'a'), 'reorder waits for the step moving out');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.connection_result('b'), 'Step order does not match the selected onboarding template'),
  'the awaited reorder rejects an order that still names the moved-out step');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.order_of(301), '[[414,2],[413,3],[412,4],[411,5]]', 'the rejected reorder changed no position');

SELECT pg_temp.begin_as('b', 1);
SELECT is(jsonb_array_length(pg_temp.call('b', $$SELECT public.reorder_onboarding_template_steps(#101, #301,
  ARRAY[#411, #412, #413, #414])$$)), 4, 'a reorder is held open');
SELECT pg_temp.begin_as('a', 2);
SELECT pg_temp.send('a', $$WITH w AS (UPDATE public.onboarding_template_steps SET template_id = #301
  WHERE id = #415 RETURNING 1) SELECT to_jsonb(count(*)) FROM w$$);
SELECT ok(pg_temp.waits('a', 'b'), 'moving a step in waits for the reorder holding its template');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.connection_result('a'), '{"value":1}', 'the awaited move in succeeds after the reorder');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.order_of(301), '[[411,0],[412,1],[415,1],[413,2],[414,3]]', 'the moved-in step keeps its own position');

SELECT pg_temp.begin_as('a', 2);
SELECT is(pg_temp.call('a', $$WITH w AS (DELETE FROM public.onboarding_template_steps WHERE id = #422 RETURNING 1)
  SELECT to_jsonb(count(*)) FROM w$$), '1', 'a step delete is held open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', $$SELECT public.reorder_onboarding_template_steps(#101, #302, ARRAY[#423, #422, #421])$$);
SELECT ok(pg_temp.waits('b', 'a'), 'reorder waits for the step delete');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.connection_result('b'), 'Step order does not match the selected onboarding template'),
  'the awaited reorder rejects an order naming the deleted step');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.order_of(302), '[[421,0],[423,2]]', 'the rejected reorder changed no position');

SELECT pg_temp.begin_as('b', 1);
SELECT is(jsonb_array_length(pg_temp.call('b', $$SELECT public.reorder_onboarding_template_steps(#101, #302,
  ARRAY[#423, #421])$$)), 2, 'a reorder is held open');
SELECT pg_temp.begin_as('a', 2);
SELECT pg_temp.send('a', $$WITH w AS (DELETE FROM public.onboarding_template_steps WHERE id = #421 RETURNING 1)
  SELECT to_jsonb(count(*)) FROM w$$);
SELECT ok(pg_temp.waits('a', 'b'), 'a step delete waits for the reorder holding its row');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.connection_result('a'), '{"value":1}', 'the awaited delete succeeds after the reorder');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.order_of(302), '[[423,0]]', 'the delete removes only its step');

SELECT pg_temp.begin_as('b', 1);
SELECT is(jsonb_array_length(pg_temp.call('b', $$SELECT public.reorder_onboarding_template_steps(#101, #304,
  ARRAY[#443, #442, #441])$$)), 3, 'a reorder is held open');
SELECT pg_temp.begin_as('a', 1);
SELECT pg_temp.send('a', $$SELECT public.start_onboarding_packet(#101, #503, #304, '2030-01-01', '[]')$$);
SELECT ok(pg_temp.waits('a', 'b'), 'a packet start waits for the reorder holding its template');
SELECT pg_temp.exec('b', 'COMMIT');
INSERT INTO results SELECT 'start-after', pg_temp.connection_result('a');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is((SELECT jsonb_agg(jsonb_build_array(step->>'step_name', step->'sort_order') ORDER BY ordinal) FROM results,
    jsonb_array_elements(value->'value'->'steps') WITH ORDINALITY AS rows(step, ordinal) WHERE label = 'start-after'),
  '[["Third",0],["Second",1],["First",2]]', 'the awaited start copies the whole new order');

SELECT pg_temp.begin_as('a', 1);
INSERT INTO results SELECT 'start-before', jsonb_build_object('value',
  pg_temp.call('a', $$SELECT public.start_onboarding_packet(#101, #504, #304, '2030-01-01', '[]')$$));
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', $$SELECT public.reorder_onboarding_template_steps(#101, #304, ARRAY[#441, #442, #443])$$);
SELECT ok(pg_temp.waits('b', 'a'), 'reorder waits for the packet start holding its template');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(jsonb_array_length(pg_temp.connection_result('b')->'value'), 3, 'the awaited reorder succeeds');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.fx($$SELECT jsonb_agg(jsonb_build_array(p.step_name, p.sort_order) ORDER BY p.sort_order, p.id)
    FROM public.onboarding_step_progress p JOIN public.personnel_onboardings po ON po.id = p.onboarding_id
    WHERE po.personnel_id = #504$$),
  '[["Third",0],["Second",1],["First",2]]', 'the earlier start keeps the whole old order');

SELECT pg_temp.begin_as('b', 1);
SELECT is(jsonb_array_length(pg_temp.call('b', $$SELECT public.reorder_onboarding_template_steps(#101, #304,
  ARRAY[#442, #441, #443])$$)), 3, 'a reorder is held open');
SELECT pg_temp.begin_as('a', 1);
SELECT pg_temp.exec('a', $$SET LOCAL statement_timeout = '3s'$$);
INSERT INTO results SELECT 'reconcile-during', pg_temp.call('a', format(
  $$SELECT public.reconcile_onboarding_packet(#101, %L::uuid, NULL)$$,
  (SELECT value->'value'->'onboarding'->>'id' FROM results WHERE label = 'start-after')));
SELECT pg_temp.exec('a', 'COMMIT');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is((SELECT jsonb_agg(jsonb_build_array(step->>'step_name', step->'sort_order') ORDER BY ordinal) FROM results,
    jsonb_array_elements(value->'steps') WITH ORDINALITY AS rows(step, ordinal) WHERE label = 'reconcile-during'),
  '[["First",0],["Second",1],["Third",2]]', 'reconciliation during an uncommitted reorder uses the whole committed order');
SELECT pg_temp.begin_as('a', 1);
INSERT INTO results SELECT 'reconcile-after', pg_temp.call('a', format(
  $$SELECT public.reconcile_onboarding_packet(#101, %L::uuid, NULL)$$,
  (SELECT value->'value'->'onboarding'->>'id' FROM results WHERE label = 'start-after')));
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is((SELECT jsonb_agg(jsonb_build_array(step->>'step_name', step->'sort_order') ORDER BY ordinal) FROM results,
    jsonb_array_elements(value->'steps') WITH ORDINALITY AS rows(step, ordinal) WHERE label = 'reconcile-after'),
  '[["Second",0],["First",1],["Third",2]]', 'a later reconciliation uses the whole committed reorder');

SELECT pg_temp.begin_as('a', 1);
INSERT INTO results SELECT 'same-key-first', pg_temp.call('a', $$SELECT public.duplicate_onboarding_template(#101, #305, #9001)$$);
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', $$SELECT public.duplicate_onboarding_template(#101, #305, #9001)$$);
SELECT ok(pg_temp.waits('b', 'a'), 'the same request waits for the first attempt');
SELECT pg_temp.exec('a', 'COMMIT');
INSERT INTO results SELECT 'same-key-second', pg_temp.connection_result('b');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is((SELECT value->'value' FROM results WHERE label = 'same-key-second'),
  (SELECT value || '{"created":false}' FROM results WHERE label = 'same-key-first'),
  'the awaited attempt returns the committed copy with created=false');
SELECT is(pg_temp.fx($$SELECT to_jsonb(count(*)) FROM public.onboarding_templates WHERE name LIKE 'Dup source Copy%'$$),
  '1', 'overlapping attempts of one request make one copy');

SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', $$SELECT public.duplicate_onboarding_template(#101, #305, #9002)$$)->'template'->>'name',
  'Dup source Copy 2', 'an attempt is held open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', $$SELECT public.duplicate_onboarding_template(#101, #305, #9002)$$);
SELECT ok(pg_temp.waits('b', 'a'), 'the same request waits for the open attempt');
SELECT pg_temp.exec('a', 'ROLLBACK');
INSERT INTO results SELECT 'same-key-after-rollback', pg_temp.connection_result('b');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is((SELECT jsonb_build_array(value->'value'->'template'->>'name', value->'value'->'created',
    jsonb_array_length(value->'value'->'steps')) FROM results WHERE label = 'same-key-after-rollback'),
  '["Dup source Copy 2", true, 2]', 'after the first attempt rolls back the waiting attempt creates the copy');

SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', $$SELECT public.duplicate_onboarding_template(#101, #305, #9003)$$)->'template'->>'name',
  'Dup source Copy 3', 'a copy name is held open');
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', $$SELECT public.duplicate_onboarding_template(#101, #305, #9004)$$);
SELECT ok(pg_temp.waits('b', 'a'), 'another request waits on the uncommitted copy name');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.connection_result('b')->'value'->'template'->>'name', 'Dup source Copy 4', 'the waiting request takes the next free name');
SELECT pg_temp.exec('b', 'COMMIT');

SELECT pg_temp.begin_as('a', 2);
SELECT is(pg_temp.call('a', $$WITH w AS (UPDATE public.onboarding_templates SET name = 'Renamed source'
  WHERE id = #305 RETURNING 1) SELECT to_jsonb(count(*)) FROM w$$), '1', 'a source rename is held open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', $$SELECT public.duplicate_onboarding_template(#101, #305, #9005)$$);
SELECT ok(pg_temp.waits('b', 'a'), 'a duplicate waits for the source rename');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.connection_result('b')->'value'->'template'->>'name', 'Renamed source Copy', 'the awaited duplicate names the copy from the committed name');
SELECT pg_temp.exec('b', 'COMMIT');

SELECT pg_temp.begin_as('b', 1);
SELECT is(pg_temp.call('b', $$SELECT public.duplicate_onboarding_template(#101, #305, #9006)$$)->'template'->>'name',
  'Renamed source Copy 2', 'a duplicate is held open');
SELECT pg_temp.begin_as('a', 2);
SELECT pg_temp.send('a', $$WITH w AS (UPDATE public.onboarding_templates SET name = 'Final source'
  WHERE id = #305 RETURNING 1) SELECT to_jsonb(count(*)) FROM w$$);
SELECT ok(pg_temp.waits('a', 'b'), 'a source rename waits for the duplicate');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.connection_result('a'), '{"value":1}', 'the awaited rename succeeds after the duplicate');
SELECT pg_temp.exec('a', 'COMMIT');

SELECT pg_temp.begin_as('b', 1);
INSERT INTO results SELECT 'copy-before-insert', pg_temp.call('b', $$SELECT public.duplicate_onboarding_template(#101, #305, #9007)$$);
SELECT pg_temp.begin_as('a', 2);
SELECT pg_temp.exec('a', $$SET LOCAL statement_timeout = '2s'$$);
SELECT is(pg_temp.call('a', $$WITH w AS (INSERT INTO public.onboarding_template_steps
  (id, organization_id, template_id, name, step_type, sort_order) VALUES (#453, #101, #305, 'Gamma step', 'checkbox', 2)
  RETURNING 1) SELECT to_jsonb(count(*)) FROM w$$), '1', 'a step insert into the source does not wait for an open duplicate');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is((SELECT jsonb_agg(step->>'name' ORDER BY ordinal) FROM results,
    jsonb_array_elements(value->'steps') WITH ORDINALITY AS rows(step, ordinal) WHERE label = 'copy-before-insert'),
  '["Alpha step","Beta step"]', 'the copy holds the source steps it read');

SELECT pg_temp.begin_as('a', 2);
SELECT is(pg_temp.call('a', $$WITH w AS (INSERT INTO public.onboarding_template_steps
  (id, organization_id, template_id, name, step_type, sort_order) VALUES (#454, #101, #305, 'Uncommitted step', 'checkbox', 3)
  RETURNING 1) SELECT to_jsonb(count(*)) FROM w$$), '1', 'an uncommitted source step is held open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.exec('b', $$SET LOCAL statement_timeout = '2s'$$);
SELECT is((SELECT jsonb_agg(step->>'name' ORDER BY ordinal) FROM jsonb_array_elements(
    pg_temp.call('b', $$SELECT public.duplicate_onboarding_template(#101, #305, #9008)$$)->'steps') WITH ORDINALITY AS rows(step, ordinal)),
  '["Alpha step","Beta step","Gamma step"]', 'a duplicate does not wait for an uncommitted source step and omits it');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT pg_temp.exec('a', 'ROLLBACK');

SELECT pg_temp.begin_as('a', 2);
SELECT is(pg_temp.call('a', $$SELECT to_jsonb(public.delete_onboarding_template(#101, #305))$$), 'true', 'a source delete is held open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', $$SELECT public.duplicate_onboarding_template(#101, #305, #9009)$$);
SELECT ok(pg_temp.waits('b', 'a'), 'a duplicate waits for the source delete');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.connection_result('b'), 'Onboarding template not found'), 'the awaited duplicate finds no source');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT is(pg_temp.fx($$SELECT to_jsonb(count(*)) FROM onboarding_private.template_duplicate_receipts WHERE request_id = #9009$$),
  '0', 'the not-found duplicate leaves no receipt');
SELECT pg_temp.begin_as('a', 1);
SELECT is(pg_temp.call('a', $$SELECT public.duplicate_onboarding_template(#101, #305, #9001)$$),
  (SELECT value FROM results WHERE label = 'same-key-first') || '{"created":false}',
  'a retry after the source was deleted still returns its copy');
SELECT pg_temp.exec('a', 'COMMIT');

SELECT pg_temp.begin_as('b', 1);
SELECT is(pg_temp.call('b', $$SELECT public.duplicate_onboarding_template(#101, #303, #9010)$$)->'template'->>'name',
  'Other Copy', 'a duplicate is held open');
SELECT pg_temp.begin_as('a', 2);
SELECT pg_temp.send('a', $$SELECT to_jsonb(public.delete_onboarding_template(#101, #303))$$);
SELECT ok(pg_temp.waits('a', 'b'), 'a source delete waits for the duplicate');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.connection_result('a'), '{"value":true}', 'the awaited delete succeeds after the duplicate');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.fx($$SELECT jsonb_agg(s.name ORDER BY s.sort_order) FROM public.onboarding_template_steps s
    JOIN public.onboarding_templates t ON t.id = s.template_id WHERE t.name = 'Other Copy'$$),
  '["Other step"]', 'the committed copy keeps every source step');

SELECT pg_temp.begin_as('a', 1);
INSERT INTO results SELECT 'replay-before-delete', pg_temp.call('a', $$SELECT public.duplicate_onboarding_template(#101, #303, #9010)$$);
SELECT pg_temp.exec('a', 'COMMIT');
SELECT pg_temp.exec('fixture', $$
  ALTER FUNCTION onboarding_private.require_template_configuration(uuid) RENAME TO require_template_configuration_unpaused;
  CREATE FUNCTION onboarding_private.require_template_configuration(p_organization_id uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE AS $f$
  DECLARE v_call integer := coalesce(nullif(pg_catalog.current_setting('t1643.authority_calls', true), ''), '0')::integer + 1;
  BEGIN
    PERFORM pg_catalog.set_config('t1643.authority_calls', v_call::text, true);
    IF v_call::text = pg_catalog.current_setting('t1643.pause_at_authority_call', true) THEN
      PERFORM pg_catalog.pg_advisory_xact_lock_shared(1643);
    END IF;
    PERFORM onboarding_private.require_template_configuration_unpaused(p_organization_id);
  END $f$;
$$);
SELECT pg_temp.exec('c', 'DO $d$ BEGIN PERFORM pg_advisory_lock(1643); END $d$');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.exec('b', $$SET LOCAL t1643.pause_at_authority_call = '3'$$);
SELECT pg_temp.send('b', $$SELECT public.duplicate_onboarding_template(#101, #303, #9010)$$);
SELECT ok(pg_temp.waits('b', 'c'), 'a replay is paused at its last authority check');
SELECT pg_temp.begin_as('a', 2);
SELECT is(pg_temp.call('a', format($$SELECT to_jsonb(public.delete_onboarding_template(#101, %L))$$,
    (SELECT value->'template'->>'id' FROM results WHERE label = 'replay-before-delete'))),
  'true', 'another configurator deletes the copy while the replay is paused');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT pg_temp.exec('c', 'DO $d$ BEGIN PERFORM pg_advisory_unlock(1643); END $d$');
INSERT INTO results SELECT 'replay-after-delete', pg_temp.connection_result('b');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.exec('fixture', $$
  DROP FUNCTION onboarding_private.require_template_configuration(uuid);
  ALTER FUNCTION onboarding_private.require_template_configuration_unpaused(uuid) RENAME TO require_template_configuration;
$$);
SELECT diag('replay racing its copy delete: ' || (SELECT value::text FROM results WHERE label = 'replay-after-delete'));
SELECT ok((SELECT pg_temp.failed(value, 'The copy from this request was deleted')
    OR value = jsonb_build_object('value', (SELECT value FROM results WHERE label = 'replay-before-delete'))
    FROM results WHERE label = 'replay-after-delete'),
  'a replay racing deletion of its copy returns the whole copy or the deleted-copy conflict');
SELECT is(pg_temp.fx($$SELECT jsonb_build_object(
    'receipt', (SELECT result_template_id FROM onboarding_private.template_duplicate_receipts WHERE request_id = #9010),
    'copies', (SELECT count(*) FROM public.onboarding_templates WHERE name LIKE 'Other Copy%'))$$),
  jsonb_build_object('receipt', (SELECT value->'template'->'id' FROM results WHERE label = 'replay-before-delete'), 'copies', 0),
  'the receipt still names the deleted copy and no replacement is made');

SELECT pg_temp.begin_as('a', 3);
SELECT is(pg_temp.call('a', $$WITH w AS (UPDATE public.onboarding_step_progress SET completed = true,
  notes = notes || '[{"text":"Operator note","timestamp":"2030-01-01T00:00:00Z","userId":"f1643000-0000-4000-8000-000000000003"}]'
  WHERE id = #861 RETURNING 1) SELECT to_jsonb(count(*)) FROM w$$), '1', 'an operator progress edit is held open');
SELECT pg_temp.begin_as('b', 1);
SELECT pg_temp.send('b', $$SELECT to_jsonb(public.delete_onboarding_template(#101, #306))$$);
SELECT ok(pg_temp.waits('b', 'a'), 'the template delete waits for the progress edit');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT is(pg_temp.connection_result('b'), '{"value":true}', 'the awaited delete succeeds');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT is(pg_temp.fx($$SELECT jsonb_build_object(
    'packet', (SELECT template_id FROM public.personnel_onboardings WHERE id = #701),
    'progress', (SELECT jsonb_agg(jsonb_build_array(step_name, template_step_id, completed, notes->-1->>'text') ORDER BY sort_order)
      FROM public.onboarding_step_progress WHERE onboarding_id = #701))$$),
  '{"packet":null,"progress":[["Linked first",null,true,"Operator note"],["Linked second",null,true,null]]}',
  'the packet keeps the operator edit and earlier progress, unlinked');

SELECT pg_temp.exec('fixture', $$INSERT INTO public.onboarding_template_steps (id, organization_id, template_id, name, step_type, sort_order)
  VALUES (#472, #101, #307, 'Added definition', 'checkbox', 1)$$);
SELECT pg_temp.exec('c', 'BEGIN');
SELECT is(pg_temp.call('c', $$SELECT to_jsonb(id) FROM public.organizations WHERE id = #101 FOR UPDATE$$),
  '"f1643000-0000-4000-8000-000000000101"', 'the Organization row is held');
SELECT pg_temp.begin_as('a', 1);
SELECT pg_temp.send('a', $$SELECT public.reconcile_onboarding_packet(#101, #702, NULL)$$);
SELECT ok(pg_temp.waits('a', 'c'), 'reconciliation locks the packet and progress, then waits inserting the added step');
SELECT pg_temp.begin_as('b', 2);
SELECT pg_temp.send('b', $$SELECT to_jsonb(public.delete_onboarding_template(#101, #307))$$);
SELECT ok(pg_temp.waits('b', 'a'), 'the template delete waits on the reconciling packet rows');
SELECT pg_temp.exec('c', 'ROLLBACK');
INSERT INTO results SELECT 'deadlock-reconcile', pg_temp.connection_result('a');
INSERT INTO results SELECT 'deadlock-delete', pg_temp.connection_result('b');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT pg_temp.exec('b', 'COMMIT');
SELECT diag('reconcile: ' || (SELECT value::text FROM results WHERE label = 'deadlock-reconcile'));
SELECT diag('delete: ' || (SELECT value::text FROM results WHERE label = 'deadlock-delete'));
SELECT is((SELECT count(*)::integer FROM results WHERE label LIKE 'deadlock-%' AND pg_temp.failed(value, 'deadlock detected')), 1,
  'exactly one command is the deadlock victim');
SELECT is(pg_temp.fx($$SELECT jsonb_build_object(
    'template', (SELECT count(*) FROM public.onboarding_templates WHERE id = #307),
    'packet', (SELECT template_id FROM public.personnel_onboardings WHERE id = #702),
    'progress', (SELECT jsonb_agg(jsonb_build_array(step_name, template_step_id, completed) ORDER BY sort_order, step_name)
      FROM public.onboarding_step_progress WHERE onboarding_id = #702))$$),
  CASE WHEN pg_temp.failed((SELECT value FROM results WHERE label = 'deadlock-reconcile'), 'deadlock detected')
    THEN '{"template":0,"packet":null,"progress":[["Reconciled",null,true]]}'::jsonb
    ELSE '{"template":1,"packet":"f1643000-0000-4000-8000-000000000307","progress":[["Reconciled","f1643000-0000-4000-8000-000000000471",true],["Added definition","f1643000-0000-4000-8000-000000000472",false]]}'::jsonb
  END, 'the survivor commits its whole effect and the victim leaves none');

SELECT pg_temp.begin_as('a', 2);
SELECT is(pg_temp.call('a', $$SELECT to_jsonb(public.delete_onboarding_template(#101, #310))$$), 'true', 'a source delete is held open');
SELECT pg_temp.begin_as('b', 4);
SELECT pg_temp.send('b', $$SELECT public.duplicate_onboarding_template(#101, #310, #9101)$$);
SELECT ok(pg_temp.waits('b', 'a'), 'a duplicate waits on its source');
SELECT pg_temp.set_onboarding(4, 'operate');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.connection_result('b'), 'Onboarding configuration is not allowed'),
  'access revoked during the source wait is denied, not told the source is gone');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_onboarding(4, 'configure');

SELECT pg_temp.begin_as('a', 4);
SELECT is(pg_temp.call('a', $$SELECT public.duplicate_onboarding_template(#101, #308, #9102)$$)->'template'->>'name',
  'Authority source Copy', 'a first attempt is held open');
SELECT pg_temp.begin_as('b', 4);
SELECT pg_temp.send('b', $$SELECT public.duplicate_onboarding_template(#101, #309, #9102)$$);
SELECT ok(pg_temp.waits('b', 'a'), 'the same request id waits on the first attempt');
SELECT pg_temp.set_onboarding(4, 'operate');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.connection_result('b'), 'Onboarding configuration is not allowed'),
  'access revoked during the receipt wait is denied, not told the request id was used');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_onboarding(4, 'configure');

SELECT pg_temp.begin_as('a', 2);
SELECT is(pg_temp.call('a', $$SELECT public.duplicate_onboarding_template(#101, #308, #9103)$$)->'template'->>'name',
  'Authority source Copy 2', 'a copy name is held open');
SELECT pg_temp.begin_as('b', 4);
SELECT pg_temp.send('b', $$SELECT public.duplicate_onboarding_template(#101, #308, #9104)$$);
SELECT ok(pg_temp.waits('b', 'a'), 'a duplicate waits on the uncommitted name');
SELECT pg_temp.set_onboarding(4, 'operate');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.connection_result('b'), 'Onboarding configuration is not allowed'), 'access revoked during the name wait denies the duplicate');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_onboarding(4, 'configure');
SELECT is(pg_temp.fx($$SELECT jsonb_build_object(
    'receipts', (SELECT jsonb_agg(right(request_id::text, 4) ORDER BY request_id) FROM onboarding_private.template_duplicate_receipts
      WHERE request_id IN (#9101, #9102, #9103, #9104)),
    'copies', (SELECT jsonb_agg(name ORDER BY name) FROM public.onboarding_templates WHERE name LIKE 'Authority%Copy%'))$$),
  '{"receipts":["9102","9103"],"copies":["Authority source Copy","Authority source Copy 2"]}',
  'denied duplicates leave no receipt or copy');

SELECT pg_temp.begin_as('a', 2);
SELECT is(pg_temp.call('a', $$SELECT to_jsonb(public.delete_onboarding_template(#101, #312))$$), 'true', 'a template delete is held open');
SELECT pg_temp.begin_as('b', 4);
SELECT pg_temp.send('b', $$SELECT public.reorder_onboarding_template_steps(#101, #312, '{}')$$);
SELECT ok(pg_temp.waits('b', 'a'), 'a reorder waits on its template');
SELECT pg_temp.set_onboarding(4, 'operate');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.connection_result('b'), 'Onboarding configuration is not allowed'),
  'access revoked during the template wait is denied, not told the template is gone');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_onboarding(4, 'configure');

SELECT pg_temp.exec('fixture', $$UPDATE public.onboarding_template_steps SET sort_order = 7 WHERE id = #481$$);
SELECT pg_temp.begin_as('a', 2);
SELECT is(pg_temp.call('a', $$WITH w AS (DELETE FROM public.onboarding_template_steps WHERE id = #483 RETURNING 1)
  SELECT to_jsonb(count(*)) FROM w$$), '1', 'a step delete is held open');
SELECT pg_temp.begin_as('b', 4);
SELECT pg_temp.send('b', $$SELECT public.reorder_onboarding_template_steps(#101, #308, ARRAY[#483, #481])$$);
SELECT ok(pg_temp.waits('b', 'a'), 'a reorder waits on the step row');
SELECT pg_temp.set_onboarding(4, 'operate');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.connection_result('b'), 'Onboarding configuration is not allowed'),
  'access revoked during the step wait is denied, not told the order no longer matches');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_onboarding(4, 'configure');
SELECT is(pg_temp.order_of(308), '[[481,7]]', 'denied reorders change no position');

SELECT pg_temp.begin_as('a', 3);
SELECT is(pg_temp.call('a', $$WITH w AS (UPDATE public.onboarding_step_progress SET completed = true
  WHERE id = #891 RETURNING 1) SELECT to_jsonb(count(*)) FROM w$$), '1', 'an operator progress edit is held open');
SELECT pg_temp.begin_as('b', 4);
SELECT pg_temp.send('b', $$SELECT to_jsonb(public.delete_onboarding_template(#101, #309))$$);
SELECT ok(pg_temp.waits('b', 'a'), 'a template delete waits on linked progress');
SELECT pg_temp.set_onboarding(4, 'operate');
SELECT pg_temp.exec('a', 'COMMIT');
SELECT ok(pg_temp.failed(pg_temp.connection_result('b'), 'Onboarding configuration is not allowed'), 'access revoked during the progress wait denies the delete');
SELECT pg_temp.exec('b', 'ROLLBACK');
SELECT pg_temp.set_onboarding(4, 'configure');
SELECT is(pg_temp.fx($$SELECT jsonb_build_object(
    'template', (SELECT count(*) FROM public.onboarding_templates WHERE id = #309),
    'steps', (SELECT count(*) FROM public.onboarding_template_steps WHERE template_id = #309),
    'packet', (SELECT template_id FROM public.personnel_onboardings WHERE id = #705),
    'progress', (SELECT jsonb_build_array(template_step_id, completed) FROM public.onboarding_step_progress WHERE id = #891))$$),
  '{"template":1,"steps":1,"packet":"f1643000-0000-4000-8000-000000000309","progress":["f1643000-0000-4000-8000-000000000491",true]}',
  'the denied delete leaves the template, steps and links in place');

SELECT is(pg_temp.fx($$SELECT jsonb_build_object(
  't', (SELECT jsonb_agg(to_jsonb(t)) FROM public.onboarding_templates t WHERE organization_id = #102),
  's', (SELECT jsonb_agg(to_jsonb(s)) FROM public.onboarding_template_steps s WHERE organization_id = #102))$$),
  (SELECT value FROM results WHERE label = 'bravo'), 'another Organization is untouched throughout');

SELECT pg_temp.exec('fixture', $$
  DELETE FROM public.organizations WHERE id IN (#101, #102);
  DELETE FROM auth.users WHERE id IN (#001, #002, #003, #004);
$$);
SELECT dblink_disconnect(name) FROM (VALUES ('fixture'), ('a'), ('b'), ('c')) AS connections(name);
SELECT * FROM finish();
ROLLBACK;
