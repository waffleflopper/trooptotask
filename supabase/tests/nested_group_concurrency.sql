BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users (id, email) VALUES ('7a51c000-0000-4000-8000-000000000001', 'nested-concurrency@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('7a51c000-0000-4000-8000-000000000101', 'Nested concurrency', '7a51c000-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (organization_id, user_id, role, member_preset, access_scope_kind) VALUES
  ('7a51c000-0000-4000-8000-000000000101', '7a51c000-0000-4000-8000-000000000001', 'owner', 'editor', 'organization');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('7a51c000-0000-4000-8000-000000000201', '7a51c000-0000-4000-8000-000000000101', 'Alpha'),
  ('7a51c000-0000-4000-8000-000000000202', '7a51c000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  ('7a51c000-0000-4000-8000-000000000301', '7a51c000-0000-4000-8000-000000000101',
   '7a51c000-0000-4000-8000-000000000201', 'SPC', 'Concurrent', 'Pick', 'nested-concurrent-pick');
INSERT INTO public.calendar_taskings (id, organization_id, responsible_group_id, title, suspense_on) VALUES
  ('7a51c000-0000-4000-8000-000000000401', '7a51c000-0000-4000-8000-000000000101',
   '7a51c000-0000-4000-8000-000000000202', 'Concurrent staffing', '2030-01-01');
COMMIT;

BEGIN;
SELECT dblink_connect(name, 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
  ' user=postgres password=postgres dbname=' || current_database() || ' application_name=s1_nested_' || name)
FROM (VALUES ('a'), ('b')) connections(name);
SELECT dblink_exec(name, $$SET statement_timeout = '10s'; SET ROLE authenticated;
  SET request.jwt.claim.sub = '7a51c000-0000-4000-8000-000000000001'$$)
FROM (VALUES ('a'), ('b')) connections(name);
SELECT is((SELECT actor FROM dblink('a', 'SELECT current_user::text') AS result(actor text)),
  'authenticated', 'the first move runs as an ordinary signed-in user');
SELECT is((SELECT actor FROM dblink('b', 'SELECT current_user::text') AS result(actor text)),
  'authenticated', 'the competing move runs as an ordinary signed-in user');
SELECT dblink_exec('b', $$CREATE FUNCTION pg_temp.try_move() RETURNS text LANGUAGE plpgsql AS $fn$
BEGIN
  UPDATE public.groups SET parent_id = '7a51c000-0000-4000-8000-000000000201'
  WHERE id = '7a51c000-0000-4000-8000-000000000202';
  RETURN 'moved';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END;
$fn$;$$);
SELECT dblink_exec('a', 'BEGIN');
SELECT dblink_exec('a', $$UPDATE public.groups SET parent_id = '7a51c000-0000-4000-8000-000000000202'
  WHERE id = '7a51c000-0000-4000-8000-000000000201'$$);
SELECT dblink_send_query('b', 'SELECT pg_temp.try_move()');
CREATE FUNCTION pg_temp.waits_for_structure_lock() RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (SELECT 1 FROM pg_stat_activity w JOIN pg_stat_activity b ON b.pid = ANY(pg_blocking_pids(w.pid))
      WHERE w.application_name = 's1_nested_b' AND b.application_name = 's1_nested_a' AND w.wait_event_type = 'Lock')
    THEN RETURN true; END IF;
    IF clock_timestamp() >= deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;
SELECT ok(pg_temp.waits_for_structure_lock(), 'a competing move waits for the Organization structure lock');
SELECT dblink_exec('a', 'COMMIT');
SELECT is((SELECT outcome FROM dblink_get_result('b') AS result(outcome text)), '22023',
  'after the first move commits, the second rejects the cycle');
SELECT * FROM dblink_get_result('b') AS result(outcome text);
SELECT is((SELECT paths FROM dblink('a', $$SELECT jsonb_agg(path ORDER BY id) FROM public.groups
  WHERE organization_id = '7a51c000-0000-4000-8000-000000000101'$$) AS result(paths jsonb)),
  '[["7a51c000-0000-4000-8000-000000000202","7a51c000-0000-4000-8000-000000000201"], ["7a51c000-0000-4000-8000-000000000202"]]'::jsonb,
  'only the first move persists, with consistent ancestor paths');
SELECT dblink_exec('b', $$CREATE FUNCTION pg_temp.try_pick() RETURNS text LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM public.save_calendar_tasking_people('7a51c000-0000-4000-8000-000000000101',
    '7a51c000-0000-4000-8000-000000000401', ARRAY['7a51c000-0000-4000-8000-000000000301']::uuid[],
    ARRAY[]::uuid[], false, 0);
  RETURN 'picked';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END;
$fn$;$$);
SELECT dblink_exec('a', 'BEGIN');
SELECT dblink_exec('a', $$UPDATE public.groups SET parent_id = NULL
  WHERE id = '7a51c000-0000-4000-8000-000000000201'$$);
SELECT dblink_send_query('b', 'SELECT pg_temp.try_pick()');
SELECT ok(pg_temp.waits_for_structure_lock(), 'staffing waits for a Group move before validating candidacy');
SELECT dblink_exec('a', 'COMMIT');
SELECT is((SELECT outcome FROM dblink_get_result('b') AS result(outcome text)), '23514',
  'staffing rejects a Person who left the responsible subtree while it waited');
SELECT * FROM dblink_get_result('b') AS result(outcome text);
SELECT is((SELECT picks FROM dblink('a', $$SELECT count(*)::integer FROM public.calendar_tasking_participants
  WHERE tasking_id = '7a51c000-0000-4000-8000-000000000401'$$) AS result(picks integer)), 0,
  'the refused concurrent save leaves no unreviewed pick');
SELECT dblink_exec('a', $$UPDATE public.groups SET parent_id = '7a51c000-0000-4000-8000-000000000202'
  WHERE id = '7a51c000-0000-4000-8000-000000000201';
  UPDATE public.personnel SET group_id = '7a51c000-0000-4000-8000-000000000202'
  WHERE id = '7a51c000-0000-4000-8000-000000000301'$$);
SELECT is((SELECT outcome FROM dblink('b', 'SELECT pg_temp.try_pick()') AS result(outcome text)), 'picked',
  'a Person in the responsible Group can be picked before the competing moves');
SELECT dblink_exec('a', 'BEGIN');
SELECT dblink_exec('a', $$UPDATE public.groups SET parent_id = NULL
  WHERE id = '7a51c000-0000-4000-8000-000000000201'$$);
SELECT dblink_send_query('b', $$WITH moved AS (
  UPDATE public.personnel SET group_id = '7a51c000-0000-4000-8000-000000000201'
  WHERE id = '7a51c000-0000-4000-8000-000000000301' RETURNING 1
) SELECT count(*)::integer FROM moved$$);
SELECT ok(pg_temp.waits_for_structure_lock(), 'a Person move waits for its target Group move');
SELECT dblink_exec('a', 'COMMIT');
SELECT is((SELECT moved FROM dblink_get_result('b') AS result(moved integer)), 1, 'the Person move completes');
SELECT * FROM dblink_get_result('b') AS result(moved integer);
SELECT is((SELECT reviewed FROM dblink('a', $$SELECT count(*)::integer FROM public.calendar_tasking_participants
  WHERE tasking_id = '7a51c000-0000-4000-8000-000000000401' AND review_since IS NOT NULL$$) AS result(reviewed integer)), 1,
  'the concurrent Person move marks the pick Needs review against the new tree');
SELECT dblink_disconnect(name) FROM (VALUES ('a'), ('b')) connections(name);
DELETE FROM public.organizations WHERE id = '7a51c000-0000-4000-8000-000000000101';
DELETE FROM auth.users WHERE id = '7a51c000-0000-4000-8000-000000000001';
SELECT * FROM finish();
COMMIT;
