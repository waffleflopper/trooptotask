-- The range projection feeds the Calendar matrix. It shows what the caller's
-- policies already allow and nothing more. Every call below runs as an ordinary
-- signed-in member, never a superuser.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a540000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;

-- 1 owner, 2 Organization-wide operator, 3 Alpha-scoped operator, 4 Alpha-scoped viewer,
-- 5 member without Calendar, 6 another Organization's owner, 7 Organization-wide viewer.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'projection-' || n || '@example.test', now()
FROM generate_series(1, 7) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Projection Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Projection Other', pg_temp.id('6'));
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

-- 301 inside the range, 302 starts before it, 303 after it, 304 another Organization, 305 cancelled.
INSERT INTO public.calendar_events (id, organization_id, title, starts_on, ends_on, coordinator_user_id) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'Best Medic Competition', '2030-10-19', '2030-10-23', pg_temp.id('1')),
  (pg_temp.id('302'), pg_temp.id('101'), 'Straddles the start', '2030-09-28', '2030-10-02', pg_temp.id('1')),
  (pg_temp.id('303'), pg_temp.id('101'), 'After the range', '2030-11-05', '2030-11-06', pg_temp.id('1')),
  (pg_temp.id('304'), pg_temp.id('102'), 'Other Organization event', '2030-10-19', '2030-10-23', pg_temp.id('6')),
  (pg_temp.id('305'), pg_temp.id('101'), 'Cancelled event', '2030-10-10', '2030-10-11', pg_temp.id('1'));

-- The range is 2030-10-01 to 2030-10-31.
-- 401 Alpha, 402 Bravo, 403 Organization-level, 404 Alpha with its suspense after the range but execution in it,
-- 405 Alpha completed, 406 Bravo standalone without execution, 407 Alpha cancelled, 408 Alpha with its suspense before the range,
-- 409 Bravo work on the Event that straddles the start, 410 Alpha work on the cancelled Event, itself cancelled.
INSERT INTO public.calendar_taskings (
  id, organization_id, title, event_id, responsible_group_id, suspense_on, execution_starts_on, execution_ends_on
) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), 'Alpha lane coverage', pg_temp.id('301'), pg_temp.id('201'), '2030-10-23', '2030-10-19', '2030-10-23'),
  (pg_temp.id('402'), pg_temp.id('101'), 'Bravo litter teams', pg_temp.id('301'), pg_temp.id('202'), '2030-10-22', '2030-10-20', '2030-10-22'),
  (pg_temp.id('403'), pg_temp.id('101'), 'Return borrowed equipment', pg_temp.id('301'), NULL, '2030-10-28', '2030-10-25', '2030-10-26'),
  (pg_temp.id('404'), pg_temp.id('101'), 'Alpha standalone', NULL, pg_temp.id('201'), '2030-11-15', '2030-10-30', '2030-11-02'),
  (pg_temp.id('405'), pg_temp.id('101'), 'Alpha completed', NULL, pg_temp.id('201'), '2030-10-10', '2030-10-08', '2030-10-09'),
  (pg_temp.id('406'), pg_temp.id('101'), 'Bravo standalone', NULL, pg_temp.id('202'), '2030-10-25', NULL, NULL),
  (pg_temp.id('407'), pg_temp.id('101'), 'Alpha cancelled', NULL, pg_temp.id('201'), '2030-10-12', '2030-10-12', '2030-10-13'),
  (pg_temp.id('408'), pg_temp.id('101'), 'Alpha already due', NULL, pg_temp.id('201'), '2030-09-30', NULL, NULL),
  (pg_temp.id('409'), pg_temp.id('101'), 'Bravo early support', pg_temp.id('302'), pg_temp.id('202'), '2030-12-15', NULL, NULL),
  (pg_temp.id('410'), pg_temp.id('101'), 'Alpha dropped support', pg_temp.id('305'), pg_temp.id('201'), '2030-12-16', NULL, NULL);
-- 501 and 502 are in Alpha, 503 and 504 in Bravo, 505 has no Group.
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('501'), pg_temp.id('101'), pg_temp.id('201'), 'SPC', 'Dana', 'Aldrin', 'aldrin-dana'),
  (pg_temp.id('502'), pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Eli', 'Alvarez', 'alvarez-eli'),
  (pg_temp.id('503'), pg_temp.id('101'), pg_temp.id('202'), 'PFC', 'Fay', 'Brooks', 'brooks-fay'),
  (pg_temp.id('504'), pg_temp.id('101'), pg_temp.id('202'), 'PFC', 'Gus', 'Bell', 'bell-gus'),
  (pg_temp.id('505'), pg_temp.id('101'), NULL, 'CPT', 'Hal', 'Unit', 'unit-hal');
-- 502's pick is under review, so it commits nobody.
INSERT INTO public.calendar_tasking_participants (organization_id, tasking_id, personnel_id, review_since) VALUES
  (pg_temp.id('101'), pg_temp.id('401'), pg_temp.id('501'), NULL),
  (pg_temp.id('101'), pg_temp.id('401'), pg_temp.id('502'), now()),
  (pg_temp.id('101'), pg_temp.id('402'), pg_temp.id('503'), NULL),
  (pg_temp.id('101'), pg_temp.id('403'), pg_temp.id('501'), NULL),
  (pg_temp.id('101'), pg_temp.id('403'), pg_temp.id('503'), NULL),
  (pg_temp.id('101'), pg_temp.id('403'), pg_temp.id('505'), NULL),
  (pg_temp.id('101'), pg_temp.id('404'), pg_temp.id('501'), NULL),
  (pg_temp.id('101'), pg_temp.id('405'), pg_temp.id('501'), NULL),
  (pg_temp.id('101'), pg_temp.id('407'), pg_temp.id('504'), NULL);
INSERT INTO public.status_types (id, organization_id, name, color, text_color) VALUES
  (pg_temp.id('601'), pg_temp.id('101'), 'Leave', '#2563eb', '#ffffff');
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date) VALUES
  (pg_temp.id('701'), pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), '2030-10-19', '2030-10-19');

CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
SELECT pg_temp.act_as('2');
SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('405'), 'complete', NULL);
SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('407'), 'cancel', NULL);
SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('410'), 'cancel', NULL);
SELECT public.cancel_calendar_event(pg_temp.id('101'), pg_temp.id('305'), 'Moved');

CREATE FUNCTION pg_temp.projection(p_org text DEFAULT '101') RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.calendar_range_projection(pg_temp.id(p_org), '2030-10-01', '2030-10-31');
$$;
-- The values of one key of one section, in the order the read returned them.
CREATE FUNCTION pg_temp.column_of(p_section text, p_key text, p_org text DEFAULT '101') RETURNS uuid[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg((item ->> p_key)::uuid ORDER BY position), ARRAY[]::uuid[])
  FROM jsonb_array_elements(pg_temp.projection(p_org) -> p_section) WITH ORDINALITY AS rows(item, position);
$$;
-- "person:tasking" for each commitment, in the order the read returned them.
CREATE FUNCTION pg_temp.commitments(p_org text DEFAULT '101') RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(
    right((item ->> 'personnelId'), 3) || ':' || right((item ->> 'taskingId'), 3) ORDER BY position), ARRAY[]::text[])
  FROM jsonb_array_elements(pg_temp.projection(p_org) -> 'commitments') WITH ORDINALITY AS rows(item, position);
$$;
-- The Events the read says the caller has work on, in the order it returned them.
CREATE FUNCTION pg_temp.events_with_work() RETURNS uuid[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg((item ->> 'id')::uuid ORDER BY position), ARRAY[]::uuid[])
  FROM jsonb_array_elements(pg_temp.projection() -> 'events') WITH ORDINALITY AS rows(item, position)
  WHERE (item ->> 'hasWork')::boolean;
$$;

SET LOCAL ROLE authenticated;

-- An Organization-wide reader sees every Event and Tasking that overlaps the range.
SELECT pg_temp.act_as('7');
SELECT is(pg_temp.column_of('events', 'id'), ARRAY[pg_temp.id('302'), pg_temp.id('305'), pg_temp.id('301')],
  'Events that overlap the range come back in date order, including one that starts before it and a cancelled one');
SELECT is((SELECT (item ->> 'cancelled')::boolean FROM jsonb_array_elements(pg_temp.projection() -> 'events') AS item
  WHERE item ->> 'id' = pg_temp.id('305')::text), true, 'a cancelled Event says so');
SELECT is((SELECT (item ->> 'cancelled')::boolean FROM jsonb_array_elements(pg_temp.projection() -> 'events') AS item
  WHERE item ->> 'id' = pg_temp.id('301')::text), false, 'an active Event is not marked cancelled');
SELECT is(pg_temp.column_of('suspenses', 'taskingId'),
  ARRAY[pg_temp.id('402'), pg_temp.id('401'), pg_temp.id('406'), pg_temp.id('403')],
  'active Taskings whose suspense is in the range come back in suspense order, whoever is responsible');
SELECT is(pg_temp.events_with_work(), ARRAY[pg_temp.id('302'), pg_temp.id('301')],
  'an Organization-wide reader has work on every Event with a Tasking that is not cancelled');
SELECT is(pg_temp.commitments(), ARRAY['501:401', '501:403', '501:404', '503:402', '503:403', '505:403'],
  'every counted pick of an active Tasking executing in the range commits its person, per Tasking');
SELECT is(
  (SELECT item ->> 'startsOn' || '/' || (item ->> 'endsOn') FROM jsonb_array_elements(pg_temp.projection() -> 'commitments') AS item
   WHERE item ->> 'taskingId' = pg_temp.id('404')::text),
  '2030-10-30/2030-11-02', 'a commitment carries the full execution dates, even past the range');
SELECT is((SELECT count(*)::int FROM public.availability_entries WHERE organization_id = pg_temp.id('101')), 1,
  'the projection never creates availability');

-- A Group-scoped reader sees every Event but only the Taskings and People their scope covers.
SELECT pg_temp.act_as('4');
SELECT is(pg_temp.column_of('events', 'id'), ARRAY[pg_temp.id('302'), pg_temp.id('305'), pg_temp.id('301')],
  'an Alpha viewer sees the same Events');
SELECT is(pg_temp.events_with_work(), ARRAY[pg_temp.id('301')],
  'an Alpha viewer has work only on the Event with Alpha work, not on one with only Bravo work or a cancelled Tasking');
SELECT is(pg_temp.column_of('suspenses', 'taskingId'), ARRAY[pg_temp.id('401')],
  'an Alpha viewer sees only the Alpha suspense: no Bravo Tasking, standalone or under a shared Event, and no Organization-level one');
SELECT is(pg_temp.commitments(), ARRAY['501:401', '501:404'],
  'an Alpha viewer sees commitments only of Alpha People on Alpha Taskings, none for a Bravo person or an ungrouped one');
SELECT is(
  (SELECT count(*)::int FROM jsonb_array_elements(pg_temp.projection() -> 'suspenses') AS item
   WHERE item::text ~* '(Bravo|Return borrowed)'),
  0, 'no Bravo or Organization-level title is in an Alpha viewer''s suspenses');
SELECT is(
  (SELECT count(*)::int FROM jsonb_array_elements(pg_temp.projection() -> 'commitments') AS item
   WHERE item::text ~* '(Bravo|Return borrowed)'),
  0, 'no Bravo or Organization-level title is in an Alpha viewer''s commitments');
SELECT pg_temp.act_as('3');
SELECT is(pg_temp.column_of('suspenses', 'taskingId'), ARRAY[pg_temp.id('401')], 'an Alpha operator reads the same as an Alpha viewer');
SELECT is(pg_temp.commitments(), ARRAY['501:401', '501:404'], 'an Alpha operator sees the same commitments');
SELECT is(pg_temp.events_with_work(), ARRAY[pg_temp.id('301')], 'an Alpha operator has work on the same Events');

-- An Organization-wide operator reads what the Organization-wide viewer does.
SELECT pg_temp.act_as('2');
SELECT is(pg_temp.commitments(), ARRAY['501:401', '501:403', '501:404', '503:402', '503:403', '505:403'],
  'an Organization-wide operator sees every counted commitment');

-- The range bounds are the only filter on dates.
SELECT is(
  (SELECT jsonb_array_length(public.calendar_range_projection(pg_temp.id('101'), '2030-11-01', '2030-11-30') -> 'suspenses')),
  1, 'a later range holds only the Tasking whose suspense falls in it');
SELECT is(
  (SELECT jsonb_array_length(public.calendar_range_projection(pg_temp.id('101'), '2030-10-19', '2030-10-19') -> 'events')),
  1, 'a one-day range holds the Event that covers the day');
SELECT throws_ok($$SELECT public.calendar_range_projection(pg_temp.id('101'), '2030-10-31', '2030-10-01')$$,
  '22023', NULL, 'a reversed range is refused');
SELECT throws_ok($$SELECT public.calendar_range_projection(pg_temp.id('101'), '2030-01-01', '2031-12-31')$$,
  '22023', NULL, 'a range over a year is refused');

-- No Calendar access, another Organization, no session.
SELECT pg_temp.act_as('5');
SELECT is(pg_temp.projection(), '{"events": [], "suspenses": [], "commitments": []}'::jsonb,
  'a member without Calendar access gets nothing');
SELECT pg_temp.act_as('6');
SELECT is(pg_temp.projection(), '{"events": [], "suspenses": [], "commitments": []}'::jsonb,
  'another Organization gets nothing');
SELECT is(array_length(pg_temp.column_of('events', 'id', '102'), 1), 1, 'another Organization reads only its own Events');
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
SELECT is(pg_temp.projection(), '{"events": [], "suspenses": [], "commitments": []}'::jsonb, 'a call with no session gets nothing');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.calendar_range_projection(pg_temp.id('101'), '2030-10-01', '2030-10-31')$$,
  '42501', NULL, 'the anonymous role cannot call the read');
RESET ROLE;

-- The switch hides everything from everyone.
UPDATE public.organizations SET disabled_features = ARRAY['eventsAndTaskings'] WHERE id = pg_temp.id('101');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('7');
SELECT is(pg_temp.projection(), '{"events": [], "suspenses": [], "commitments": []}'::jsonb,
  'nothing is projected while the switch is off');

SELECT * FROM finish();
ROLLBACK;
