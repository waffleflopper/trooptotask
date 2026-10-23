-- A successful occupied-slot replacement survives a failed contender. Two
-- distinct slots on an initially empty day also share the advisory lock.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT plan(12);

SELECT dblink_connect('atomic_fixture', 'hostaddr=' || host(inet_server_addr()) ||
  ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database());
SELECT dblink_connect('atomic_winner', 'hostaddr=' || host(inet_server_addr()) ||
  ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() ||
  ' application_name=t3_atomic_winner');
SELECT dblink_connect('atomic_contender', 'hostaddr=' || host(inet_server_addr()) ||
  ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() ||
  ' application_name=t3_atomic_contender');
SELECT dblink_exec('atomic_winner', $$SET statement_timeout='10s'$$);
SELECT dblink_exec('atomic_contender', $$SET statement_timeout='10s'$$);

-- A prior interrupted run may have left only this committed synthetic fixture.
SELECT dblink_exec('atomic_fixture', $cleanup$
  DROP TRIGGER IF EXISTS t3_fail_atomic_assignment_insert ON public.daily_assignments;
  DROP FUNCTION IF EXISTS public.t3_fail_atomic_assignment_insert();
  DELETE FROM public.organizations WHERE id='b1110000-0000-4000-8000-000000000101';
  DELETE FROM auth.users WHERE id='b1110000-0000-4000-8000-000000000001';
$cleanup$);
SELECT dblink_exec('atomic_fixture', $fixture$
  INSERT INTO auth.users(id,email) VALUES
    ('b1110000-0000-4000-8000-000000000001','atomic-race-owner@example.test');
  INSERT INTO public.organizations(id,name,created_by) VALUES
    ('b1110000-0000-4000-8000-000000000101','Atomic Race',
     'b1110000-0000-4000-8000-000000000001');
  INSERT INTO public.groups(id,organization_id,name) VALUES
    ('b1110000-0000-4000-8000-000000000201',
     'b1110000-0000-4000-8000-000000000101','Race Group');
  INSERT INTO public.organization_memberships(
    organization_id,user_id,role,member_preset,capability_overrides,
    access_scope_kind,access_scope_group_ids
  ) VALUES
    ('b1110000-0000-4000-8000-000000000101',
     'b1110000-0000-4000-8000-000000000001','owner','editor','{}',
     'organization',ARRAY[]::uuid[]);
  INSERT INTO public.personnel(
    id,organization_id,group_id,rank,first_name,last_name,mos,slug
  ) VALUES
    ('b1110000-0000-4000-8000-000000000301',
     'b1110000-0000-4000-8000-000000000101',
     'b1110000-0000-4000-8000-000000000201','SGT','Old','Person','68W','atomic-race-old'),
    ('b1110000-0000-4000-8000-000000000302',
     'b1110000-0000-4000-8000-000000000101',
     'b1110000-0000-4000-8000-000000000201','SGT','New','Person','68W','atomic-race-new');
  INSERT INTO public.assignment_types(id,organization_id,name,short_name,assign_to) VALUES
    ('b1110000-0000-4000-8000-000000000401',
     'b1110000-0000-4000-8000-000000000101','Staff','STF','personnel'),
    ('b1110000-0000-4000-8000-000000000402',
     'b1110000-0000-4000-8000-000000000101','Reserve','RSV','personnel');
  INSERT INTO public.daily_assignments(
    id,organization_id,assignment_type_id,date,assignee_id,created_at
  ) VALUES
    ('b1110000-0000-4000-8000-000000000501',
     'b1110000-0000-4000-8000-000000000101',
     'b1110000-0000-4000-8000-000000000401',
     '2030-04-01','b1110000-0000-4000-8000-000000000301','2029-01-02 03:04:05+00');
$fixture$);
SELECT dblink_exec('atomic_fixture', $function$
  CREATE FUNCTION public.t3_fail_atomic_assignment_insert() RETURNS trigger
  LANGUAGE plpgsql AS $trigger$
  BEGIN
    IF NEW.organization_id='b1110000-0000-4000-8000-000000000101'
      AND NEW.assignee_id='b1110000-0000-4000-8000-000000000301' THEN
      RAISE EXCEPTION 'synthetic contender insert failure' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END
  $trigger$;
  CREATE TRIGGER t3_fail_atomic_assignment_insert
  BEFORE INSERT ON public.daily_assignments
  FOR EACH ROW EXECUTE FUNCTION public.t3_fail_atomic_assignment_insert();
$function$);

CREATE FUNCTION pg_temp.atomic_contender_waits() RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (
      SELECT 1 FROM pg_stat_activity
      WHERE application_name='t3_atomic_contender' AND wait_event_type='Lock'
    ) THEN RETURN true; END IF;
    IF clock_timestamp() >= deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END $$;

CREATE FUNCTION pg_temp.atomic_contender_waits_for_advisory() RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (
      SELECT 1 FROM pg_locks AS lock
      JOIN pg_stat_activity AS activity ON activity.pid = lock.pid
      WHERE activity.application_name='t3_atomic_contender'
        AND lock.locktype='advisory' AND NOT lock.granted
    ) THEN RETURN true; END IF;
    IF clock_timestamp() >= deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END $$;

SELECT dblink_exec('atomic_winner','BEGIN');
SELECT dblink_exec('atomic_winner','SET LOCAL ROLE authenticated');
SELECT dblink_exec('atomic_winner',
  $$SET LOCAL request.jwt.claim.sub='b1110000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('atomic_contender','BEGIN');
SELECT dblink_exec('atomic_contender','SET LOCAL ROLE authenticated');
SELECT dblink_exec('atomic_contender',
  $$SET LOCAL request.jwt.claim.sub='b1110000-0000-4000-8000-000000000001'$$);
SELECT is((SELECT saved FROM dblink('atomic_winner',$call$
  SELECT count(*)::integer FROM public.replace_daily_assignment_slots(
    'b1110000-0000-4000-8000-000000000101','{}'::date[],
    '[{"date":"2030-04-01","assignment_type_id":"b1110000-0000-4000-8000-000000000401","assignee_id":"b1110000-0000-4000-8000-000000000302"}]'::jsonb
  )
$call$) AS result(saved integer)),1,'first writer replaces the occupied slot');
SELECT dblink_send_query('atomic_contender',$call$
  SELECT count(*)::integer FROM public.replace_daily_assignment_slots(
    'b1110000-0000-4000-8000-000000000101','{}'::date[],
    '[{"date":"2030-04-01","assignment_type_id":"b1110000-0000-4000-8000-000000000401","assignee_id":"b1110000-0000-4000-8000-000000000301"}]'::jsonb
  )
$call$);
SELECT ok(pg_temp.atomic_contender_waits(), 'competing writer waits for the first transaction');
SELECT dblink_exec('atomic_winner','COMMIT');
SELECT * FROM dblink_get_result('atomic_contender', false) AS result(saved integer);
SELECT ok(dblink_error_message('atomic_contender') LIKE
  '%synthetic contender insert failure%', 'second writer reaches insert and fails');
-- Async dblink queries leave one final empty result before another command.
SELECT * FROM dblink_get_result('atomic_contender', false) AS result(saved integer);
SELECT dblink_exec('atomic_contender','ROLLBACK');
SELECT is((SELECT count(*)::integer FROM dblink('atomic_fixture',$query$
  SELECT count(*)::integer FROM public.daily_assignments
  WHERE organization_id='b1110000-0000-4000-8000-000000000101'
    AND date='2030-04-01'
$query$) AS result(count integer)),1,'exactly one assignment survives');
SELECT is((SELECT assignee_id FROM dblink('atomic_fixture',$query$
  SELECT assignee_id FROM public.daily_assignments
  WHERE organization_id='b1110000-0000-4000-8000-000000000101'
    AND date='2030-04-01'
$query$) AS result(assignee_id text)),
  'b1110000-0000-4000-8000-000000000302',
  'failed contender cannot restore stale assignee over the committed winner');
SELECT is((SELECT id FROM dblink('atomic_fixture',$query$
  SELECT id FROM public.daily_assignments
  WHERE organization_id='b1110000-0000-4000-8000-000000000101'
    AND date='2030-04-01'
$query$) AS result(id uuid)),
  'b1110000-0000-4000-8000-000000000501'::uuid,
  'the committed winner keeps the original slot ID');

SELECT is((SELECT created_at FROM dblink('atomic_fixture',$query$
  SELECT created_at FROM public.daily_assignments
  WHERE id='b1110000-0000-4000-8000-000000000501'
$query$) AS result(created_at timestamptz)), '2029-01-02 03:04:05+00'::timestamptz,
  'the committed winner keeps the original creation time after the contender fails');

-- With no prior rows and different type IDs, a row lock or unique conflict
-- cannot explain the wait: the RPC's Organization/day advisory lock does.
SELECT is((SELECT saved FROM dblink('atomic_fixture',$query$
  SELECT count(*)::integer FROM public.daily_assignments
  WHERE organization_id='b1110000-0000-4000-8000-000000000101'
    AND date='2030-04-02'
$query$) AS result(saved integer)),0,'the second race starts on an empty day');
SELECT dblink_exec('atomic_winner','BEGIN');
SELECT dblink_exec('atomic_winner','SET LOCAL ROLE authenticated');
SELECT dblink_exec('atomic_winner',
  $$SET LOCAL request.jwt.claim.sub='b1110000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('atomic_contender','BEGIN');
SELECT dblink_exec('atomic_contender','SET LOCAL ROLE authenticated');
SELECT dblink_exec('atomic_contender',
  $$SET LOCAL request.jwt.claim.sub='b1110000-0000-4000-8000-000000000001'$$);
SELECT is((SELECT saved FROM dblink('atomic_winner',$call$
  SELECT count(*)::integer FROM public.replace_daily_assignment_slots(
    'b1110000-0000-4000-8000-000000000101','{}'::date[],
    '[{"date":"2030-04-02","assignment_type_id":"b1110000-0000-4000-8000-000000000401","assignee_id":"b1110000-0000-4000-8000-000000000302"}]'::jsonb
  )
$call$) AS result(saved integer)),1,'first empty-day writer saves Staff');
SELECT dblink_send_query('atomic_contender',$call$
  SELECT count(*)::integer FROM public.replace_daily_assignment_slots(
    'b1110000-0000-4000-8000-000000000101','{}'::date[],
    '[{"date":"2030-04-02","assignment_type_id":"b1110000-0000-4000-8000-000000000402","assignee_id":"b1110000-0000-4000-8000-000000000302"}]'::jsonb
  )
$call$);
SELECT ok(pg_temp.atomic_contender_waits_for_advisory(),
  'different empty-day slot waits on the Organization/day advisory lock');
SELECT dblink_exec('atomic_winner','COMMIT');
SELECT is((SELECT saved FROM dblink_get_result('atomic_contender') AS result(saved integer)),1,
  'second empty-day writer saves Reserve after winner commits');
SELECT * FROM dblink_get_result('atomic_contender') AS result(saved integer);
SELECT dblink_exec('atomic_contender','COMMIT');
SELECT results_eq($$
  SELECT assignment_type_id, assignee_id FROM dblink('atomic_fixture',$query$
    SELECT assignment_type_id, assignee_id FROM public.daily_assignments
    WHERE organization_id='b1110000-0000-4000-8000-000000000101'
      AND date='2030-04-02'
    ORDER BY assignment_type_id
  $query$) AS result(assignment_type_id uuid, assignee_id text)
$$,$$ VALUES
  ('b1110000-0000-4000-8000-000000000401'::uuid,'b1110000-0000-4000-8000-000000000302'::text),
  ('b1110000-0000-4000-8000-000000000402'::uuid,'b1110000-0000-4000-8000-000000000302'::text)
$$,'both independently saved empty-day slots persist');

SELECT dblink_exec('atomic_fixture', $cleanup$
  DROP TRIGGER t3_fail_atomic_assignment_insert ON public.daily_assignments;
  DROP FUNCTION public.t3_fail_atomic_assignment_insert();
  DELETE FROM public.organizations WHERE id='b1110000-0000-4000-8000-000000000101';
  DELETE FROM auth.users WHERE id='b1110000-0000-4000-8000-000000000001';
$cleanup$);
SELECT dblink_disconnect('atomic_winner');
SELECT dblink_disconnect('atomic_contender');
SELECT dblink_disconnect('atomic_fixture');
SELECT * FROM finish();
ROLLBACK;
