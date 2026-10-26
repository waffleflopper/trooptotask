-- The summary read shows a shared Event's other contributions as one-line rows.
-- Every call below runs as an ordinary signed-in member, never a superuser.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a530000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;

-- 1 owner, 2 Organization-wide operator, 3 Alpha-scoped operator, 4 Alpha-scoped viewer,
-- 5 member without Calendar, 6 another Organization's owner, 7 Organization-wide viewer.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'summaries-' || n || '@example.test', now()
FROM generate_series(1, 7) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Summaries Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Summaries Other', pg_temp.id('6'));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.id('201'), pg_temp.id('101'), 'Alpha'),
  (pg_temp.id('202'), pg_temp.id('101'), 'Bravo'),
  (pg_temp.id('203'), pg_temp.id('102'), 'Elsewhere');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'viewer', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{"calendar":"operate"}', 'groups', ARRAY[pg_temp.id('201')]),
  (pg_temp.id('101'), pg_temp.id('4'), 'member', 'viewer', '{"calendar":"view"}', 'groups', ARRAY[pg_temp.id('201')]),
  (pg_temp.id('101'), pg_temp.id('5'), 'member', 'viewer', '{"calendar":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('102'), pg_temp.id('6'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('7'), 'member', 'viewer', '{"calendar":"view"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.calendar_events (id, organization_id, title, starts_on, ends_on, coordinator_user_id) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'Best Medic Competition', '2030-10-19', '2030-10-23', pg_temp.id('1')),
  (pg_temp.id('302'), pg_temp.id('101'), 'Another Event', '2030-11-01', '2030-11-02', pg_temp.id('1')),
  (pg_temp.id('303'), pg_temp.id('102'), 'Other Organization event', '2030-10-19', '2030-10-23', pg_temp.id('6'));

-- 401 Alpha, 402 Bravo (staffed, blocked, instructions), 403 Organization-level, all under Event 301.
-- 404 Bravo standalone, 405 Bravo under Event 302.
INSERT INTO public.calendar_taskings (
  id, organization_id, title, event_id, responsible_group_id, suspense_on,
  execution_starts_on, execution_ends_on, report_time, staffing_required, qualifications, instructions
) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), 'Alpha lane coverage', pg_temp.id('301'), pg_temp.id('201'), '2030-10-23',
    '2030-10-19', '2030-10-23', '05:30', 4, '68W', 'Alpha instructions'),
  (pg_temp.id('402'), pg_temp.id('101'), 'Bravo litter teams', pg_temp.id('301'), pg_temp.id('202'), '2030-10-22',
    '2030-10-20', '2030-10-22', '06:00', 6, '68W, current BLS', 'Bravo secret instructions'),
  (pg_temp.id('403'), pg_temp.id('101'), 'Return borrowed equipment', pg_temp.id('301'), NULL, '2030-10-28',
    NULL, NULL, NULL, NULL, NULL, 'Organization instructions'),
  (pg_temp.id('404'), pg_temp.id('101'), 'Bravo standalone', NULL, pg_temp.id('202'), '2030-10-25',
    NULL, NULL, NULL, NULL, NULL, NULL),
  (pg_temp.id('405'), pg_temp.id('101'), 'Bravo other event', pg_temp.id('302'), pg_temp.id('202'), '2030-11-01',
    NULL, NULL, NULL, NULL, NULL, NULL);
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
SELECT pg_temp.act_as('2');
SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('402'), 'block', 'Bravo secret block reason');
CREATE FUNCTION pg_temp.summary_ids(p_event text) RETURNS uuid[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(id ORDER BY suspense_on, title, id), ARRAY[]::uuid[])
  FROM public.list_calendar_event_tasking_summaries(pg_temp.id('101'), pg_temp.id(p_event));
$$;

SET LOCAL ROLE authenticated;

-- An Alpha-scoped reader sees Bravo's and the Organization's contributions, in suspense order.
SELECT pg_temp.act_as('4');
SELECT is(pg_temp.summary_ids('301'), ARRAY[pg_temp.id('402'), pg_temp.id('403')],
  'an Alpha viewer gets a summary for the Bravo and Organization-level Taskings under the Event, not their own');
SELECT results_eq(
  $$SELECT title, responsible_group_name, status, staffing_required, suspense_on
    FROM public.list_calendar_event_tasking_summaries(pg_temp.id('101'), pg_temp.id('301'))$$,
  $$VALUES
    ('Bravo litter teams'::text, 'Bravo'::text, 'blocked'::text, 6, '2030-10-22'::date),
    ('Return borrowed equipment'::text, NULL::text, 'open'::text, NULL::integer, '2030-10-28'::date)$$,
  'a summary row carries the Group or Organization level, outcome, status, requirement and suspense');
SELECT results_eq(
  $$SELECT execution_starts_on, execution_ends_on
    FROM public.list_calendar_event_tasking_summaries(pg_temp.id('101'), pg_temp.id('301')) WHERE id = pg_temp.id('402')$$,
  $$VALUES ('2030-10-20'::date, '2030-10-22'::date)$$,
  'a summary row carries the execution dates the Event groups use');
SELECT is(
  (SELECT array_agg(key ORDER BY key) FROM (
    SELECT jsonb_object_keys(to_jsonb(s)) AS key
    FROM (SELECT * FROM public.list_calendar_event_tasking_summaries(pg_temp.id('101'), pg_temp.id('301')) LIMIT 1) AS s
  ) AS keys),
  ARRAY['execution_ends_on', 'execution_starts_on', 'id', 'responsible_group_name', 'staffing_required', 'status',
    'suspense_on', 'title'],
  'the summary read returns exactly the summary fields');
SELECT is(
  (SELECT count(*)::int
   FROM public.list_calendar_event_tasking_summaries(pg_temp.id('101'), pg_temp.id('301')) AS s
   WHERE to_jsonb(s)::text ~* '(secret|instructions|block reason|68W|05:30|06:00)'),
  0,
  'no summary row holds instructions, a block reason, qualifications or a report time');
SELECT is((SELECT count(*)::int FROM public.calendar_taskings WHERE id IN (pg_temp.id('402'), pg_temp.id('403'))), 0,
  'a summary grants no access to the Tasking itself');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_activity WHERE tasking_id IN (pg_temp.id('402'), pg_temp.id('403'))), 0,
  'a summary grants no access to its Activity');

-- Standalone Taskings outside the reader's scope are never shown, whatever Event is asked about.
SELECT ok(NOT pg_temp.id('404') = ANY (pg_temp.summary_ids('301') || pg_temp.summary_ids('302')),
  'a standalone Bravo Tasking is never summarised');
SELECT is(pg_temp.summary_ids('302'), ARRAY[pg_temp.id('405')],
  'asking about another Event returns only that Event''s contributions');
SELECT throws_ok($$SELECT * FROM public.list_calendar_event_tasking_summaries(pg_temp.id('101'), pg_temp.id('303'))$$,
  'P0002', NULL, 'another Organization''s Event is not found');
SELECT throws_ok($$SELECT * FROM public.list_calendar_event_tasking_summaries(pg_temp.id('102'), pg_temp.id('303'))$$,
  'P0002', NULL, 'an Alpha viewer cannot ask about another Organization');
SELECT throws_ok($$SELECT * FROM public.list_calendar_event_tasking_summaries(pg_temp.id('101'), pg_temp.id('399'))$$,
  'P0002', NULL, 'an unknown Event is not found');

-- A Group-scoped operator is a reader here too.
SELECT pg_temp.act_as('3');
SELECT is(pg_temp.summary_ids('301'), ARRAY[pg_temp.id('402'), pg_temp.id('403')],
  'an Alpha operator gets the same summaries');

-- An Organization-wide reader already sees every Tasking in full, so nothing is left to summarise.
SELECT pg_temp.act_as('7');
SELECT is(pg_temp.summary_ids('301'), ARRAY[]::uuid[], 'an Organization-wide viewer gets no summaries');
SELECT pg_temp.act_as('2');
SELECT is(pg_temp.summary_ids('301'), ARRAY[]::uuid[], 'an Organization-wide operator gets no summaries');

-- No Calendar access, no session, another Organization.
SELECT pg_temp.act_as('5');
SELECT throws_ok($$SELECT * FROM public.list_calendar_event_tasking_summaries(pg_temp.id('101'), pg_temp.id('301'))$$,
  'P0002', NULL, 'a member without Calendar access learns nothing');
SELECT pg_temp.act_as('6');
SELECT throws_ok($$SELECT * FROM public.list_calendar_event_tasking_summaries(pg_temp.id('101'), pg_temp.id('301'))$$,
  'P0002', NULL, 'another Organization learns nothing');
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
SELECT throws_ok($$SELECT * FROM public.list_calendar_event_tasking_summaries(pg_temp.id('101'), pg_temp.id('301'))$$,
  'P0002', NULL, 'a call with no signed-in member learns nothing');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.list_calendar_event_tasking_summaries(pg_temp.id('101'), pg_temp.id('301'))$$,
  '42501', NULL, 'the anonymous role cannot call the read');
RESET ROLE;

-- A cancelled Event still shows its contributions; the switch hides them for everyone.
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
SELECT public.cancel_calendar_event(pg_temp.id('101'), pg_temp.id('301'), 'Moved');
SELECT pg_temp.act_as('4');
SELECT is(pg_temp.summary_ids('301'), ARRAY[pg_temp.id('402'), pg_temp.id('403')],
  'a cancelled Event still shows its contributions');
RESET ROLE;
UPDATE public.organizations SET disabled_features = ARRAY['eventsAndTaskings'] WHERE id = pg_temp.id('101');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('4');
SELECT throws_ok($$SELECT * FROM public.list_calendar_event_tasking_summaries(pg_temp.id('101'), pg_temp.id('301'))$$,
  'P0002', NULL, 'nothing is summarised while the switch is off');

SELECT * FROM finish();
ROLLBACK;
