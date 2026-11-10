-- Every Tasking action from every status, as an ordinary Calendar operator.
-- The same 30 cells are asserted against TASKING_TRANSITIONS in taskingModel.test.ts, so the table cannot
-- change on one side alone. An outcome is the resulting status, "unchanged" (the call returns false) or
-- "refused" (SQLSTATE 55000).
--
--             start        block        unblock      complete   reopen       cancel
-- open        in_progress  blocked      refused      completed  refused      cancelled
-- in_progress unchanged    blocked      unchanged    completed  unchanged    cancelled
-- blocked     refused      unchanged*   in_progress  completed  refused      cancelled
-- completed   refused      refused      refused      unchanged  in_progress  refused
-- cancelled   refused      refused      refused      refused    refused      unchanged
--
-- * Blocking a blocked Tasking with the reason it already has changes nothing. A different reason edits the
--   reason in place and returns true; that is asserted separately below.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a5e0000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.new_tasking(p_status text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.calendar_taskings (id, organization_id, title, suspense_on)
  VALUES (v_id, pg_temp.id('101'), 'Matrix ' || p_status, '2030-10-23');
  PERFORM public.transition_calendar_tasking(pg_temp.id('101'), v_id, a.action, 'Waiting')
  FROM (VALUES ('in_progress', 'start'), ('blocked', 'block'), ('completed', 'complete'), ('cancelled', 'cancel'))
    AS a(status, action)
  WHERE a.status = p_status;
  RETURN v_id;
END;
$$;
CREATE FUNCTION pg_temp.attempt(p_status text, p_action text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := pg_temp.new_tasking(p_status);
  v_changed boolean;
BEGIN
  BEGIN
    v_changed := public.transition_calendar_tasking(pg_temp.id('101'), v_id, p_action, 'Waiting');
  EXCEPTION WHEN SQLSTATE '55000' THEN
    RETURN 'refused';
  END;
  IF NOT v_changed THEN
    RETURN 'unchanged';
  END IF;
  RETURN (SELECT status FROM public.calendar_taskings WHERE id = v_id);
END;
$$;

CREATE FUNCTION pg_temp.reblock() RETURNS TABLE (changed boolean, status text, reason text) LANGUAGE plpgsql AS $$
DECLARE v_id uuid := pg_temp.new_tasking('blocked');
BEGIN
  changed := public.transition_calendar_tasking(pg_temp.id('101'), v_id, 'block', 'Now waiting on parts');
  SELECT t.status, t.block_reason INTO status, reason FROM public.calendar_taskings AS t WHERE t.id = v_id;
  RETURN NEXT;
END;
$$;
CREATE TEMP TABLE matrix (status text, action text, outcome text);
GRANT ALL ON matrix TO authenticated;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'transitions-' || n || '@example.test', now()
FROM generate_series(1, 2) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('101'), 'Transitions Alpha', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'viewer', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[]);

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');

INSERT INTO matrix VALUES
  ('open', 'start', 'in_progress'), ('open', 'block', 'blocked'), ('open', 'unblock', 'refused'),
  ('open', 'complete', 'completed'), ('open', 'reopen', 'refused'), ('open', 'cancel', 'cancelled'),
  ('in_progress', 'start', 'unchanged'), ('in_progress', 'block', 'blocked'), ('in_progress', 'unblock', 'unchanged'),
  ('in_progress', 'complete', 'completed'), ('in_progress', 'reopen', 'unchanged'), ('in_progress', 'cancel', 'cancelled'),
  ('blocked', 'start', 'refused'), ('blocked', 'block', 'unchanged'), ('blocked', 'unblock', 'in_progress'),
  ('blocked', 'complete', 'completed'), ('blocked', 'reopen', 'refused'), ('blocked', 'cancel', 'cancelled'),
  ('completed', 'start', 'refused'), ('completed', 'block', 'refused'), ('completed', 'unblock', 'refused'),
  ('completed', 'complete', 'unchanged'), ('completed', 'reopen', 'in_progress'), ('completed', 'cancel', 'refused'),
  ('cancelled', 'start', 'refused'), ('cancelled', 'block', 'refused'), ('cancelled', 'unblock', 'refused'),
  ('cancelled', 'complete', 'refused'), ('cancelled', 'reopen', 'refused'), ('cancelled', 'cancel', 'unchanged');

SELECT is((SELECT count(*)::int FROM matrix), 30, 'the matrix covers five statuses and six actions');
SELECT is(pg_temp.attempt(status, action), outcome, status || ' + ' || action || ' is ' || outcome) FROM matrix;

-- Blocking a blocked Tasking with a different reason edits the reason in place.
SELECT results_eq($$SELECT * FROM pg_temp.reblock()$$, $$VALUES (true, 'blocked'::text, 'Now waiting on parts'::text)$$,
  'a new reason on a blocked Tasking is saved and reported as a change');

SELECT * FROM finish();
ROLLBACK;
