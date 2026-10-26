-- Events are Organization-wide context: every Calendar reader sees them, only
-- Organization-wide Calendar operators write them, and the database owns
-- attribution and Activity. Every write below runs as an ordinary signed-in member.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('e1e10000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;

-- 1 Alpha owner, 2 Organization-wide Calendar operator, 3 Group-scoped Calendar operator,
-- 4 Calendar viewer, 5 member without Calendar, 6 Bravo owner.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'events-' || n || '@example.test', now()
FROM generate_series(1, 6) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Events Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Events Bravo', pg_temp.id('6'));
INSERT INTO public.groups (id, organization_id, name) VALUES (pg_temp.id('201'), pg_temp.id('101'), 'Alpha One');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'events-1@example.test'),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'viewer', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[], 'events-2@example.test'),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{"calendar":"configure"}', 'groups', ARRAY[pg_temp.id('201')], 'events-3@example.test'),
  (pg_temp.id('101'), pg_temp.id('4'), 'member', 'viewer', '{"calendar":"view"}', 'organization', ARRAY[]::uuid[], 'events-4@example.test'),
  (pg_temp.id('101'), pg_temp.id('5'), 'member', 'viewer', '{"calendar":"none"}', 'organization', ARRAY[]::uuid[], 'events-5@example.test'),
  (pg_temp.id('102'), pg_temp.id('6'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'events-6@example.test');

CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.insert_event(p_id text, p_coordinator text, p_title text DEFAULT 'Best Medic Competition')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.calendar_events (id, organization_id, title, starts_on, ends_on, host_name, coordinator_user_id)
  VALUES (pg_temp.id(p_id), pg_temp.id('101'), p_title, '2030-10-19', '2030-10-23', '1-1 BN', pg_temp.id(p_coordinator));
$$;

CREATE FUNCTION pg_temp.source_reference_kept(p_value text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.calendar_events (organization_id, title, starts_on, ends_on, coordinator_user_id, source_reference)
  VALUES (pg_temp.id('101'), 'Source', '2030-01-01', '2030-01-01', auth.uid(), p_value);
  RETURN true;
EXCEPTION WHEN check_violation THEN
  RETURN false;
END;
$$;
SELECT lives_ok($$UPDATE public.organizations SET disabled_features = ARRAY['eventsAndTaskings'] WHERE id = pg_temp.id('102')$$,
  'eventsAndTaskings is a known feature switch');
SELECT throws_ok($$UPDATE public.organizations SET disabled_features = ARRAY['events'] WHERE id = pg_temp.id('102')$$,
  '23514', NULL, 'an unknown feature key is still refused');
UPDATE public.organizations SET disabled_features = '{}' WHERE id = pg_temp.id('102');

SET LOCAL ROLE authenticated;

-- Organization-wide operator creates.
SELECT pg_temp.act_as('2');
SELECT lives_ok($$SELECT pg_temp.insert_event('301', '4')$$, 'an Organization-wide Calendar operator creates an event');
SELECT is((SELECT created_by FROM public.calendar_events WHERE id = pg_temp.id('301')), pg_temp.id('2'),
  'the creator is the signed-in member');
SELECT is((SELECT updated_by FROM public.calendar_events WHERE id = pg_temp.id('301')), pg_temp.id('2'),
  'a new event records its creator as last editor');
SELECT results_eq(
  $$SELECT kind, actor_id, payload FROM public.calendar_event_activity WHERE event_id = pg_temp.id('301') ORDER BY id$$,
  $$VALUES ('created'::text, pg_temp.id('2'), '{}'::jsonb)$$,
  'creating an event records one created Activity entry by the creator');

SELECT throws_ok(
  $$INSERT INTO public.calendar_events (organization_id, title, starts_on, ends_on, coordinator_user_id, created_by)
    VALUES (pg_temp.id('101'), 'Forged', '2030-01-01', '2030-01-01', pg_temp.id('2'), pg_temp.id('1'))$$,
  '42501', NULL, 'a client cannot name the creator');
SELECT throws_ok(
  $$INSERT INTO public.calendar_events (organization_id, title, starts_on, ends_on, coordinator_user_id, cancelled_at, cancelled_by)
    VALUES (pg_temp.id('101'), 'Forged', '2030-01-01', '2030-01-01', pg_temp.id('2'), now(), pg_temp.id('1'))$$,
  '42501', NULL, 'a client cannot insert a cancelled event');
SELECT throws_ok($$UPDATE public.calendar_events SET updated_by = pg_temp.id('1') WHERE id = pg_temp.id('301')$$,
  '42501', NULL, 'a client cannot name the last editor');
SELECT throws_ok($$UPDATE public.calendar_events SET created_at = '2000-01-01' WHERE id = pg_temp.id('301')$$,
  '42501', NULL, 'a client cannot move the creation time');
SELECT throws_ok($$UPDATE public.calendar_events SET cancelled_at = now(), cancelled_by = pg_temp.id('1') WHERE id = pg_temp.id('301')$$,
  '42501', NULL, 'a client cannot cancel by writing the cancellation columns');
SELECT throws_ok($$INSERT INTO public.calendar_event_activity (organization_id, event_id, kind) VALUES (pg_temp.id('101'), pg_temp.id('301'), 'cancelled')$$,
  '42501', NULL, 'a client cannot write Activity');
SELECT throws_ok($$DELETE FROM public.calendar_events WHERE id = pg_temp.id('301')$$,
  '42501', NULL, 'events are never deleted by a client');

SELECT throws_ok($$SELECT pg_temp.insert_event('302', '6')$$, '23514', NULL,
  'the coordinator must be a member of the Organization');
SELECT throws_ok(
  $$INSERT INTO public.calendar_events (organization_id, title, starts_on, ends_on, coordinator_user_id)
    VALUES (pg_temp.id('101'), 'Backwards', '2030-01-02', '2030-01-01', pg_temp.id('2'))$$,
  '23514', NULL, 'the end date cannot be before the start date');
SELECT lives_ok(
  $$INSERT INTO public.calendar_events (organization_id, title, starts_on, ends_on, coordinator_user_id)
    VALUES (pg_temp.id('101'), 'One day', '2030-01-01', '2030-01-01', pg_temp.id('2'))$$,
  'a one-day event uses the same date twice');
SELECT throws_ok(
  $$INSERT INTO public.calendar_events (organization_id, title, starts_on, ends_on, coordinator_user_id)
    VALUES (pg_temp.id('101'), '   ', '2030-01-01', '2030-01-01', pg_temp.id('2'))$$,
  '23514', NULL, 'the title cannot be blank');
SELECT is(
  ARRAY[
    pg_temp.source_reference_kept('BN FRAGO 27-012'),
    pg_temp.source_reference_kept('https://orders.example.mil/frago/27-012'),
    pg_temp.source_reference_kept('OPORD: 23-01'),
    pg_temp.source_reference_kept('javascript:alert(1)'),
    pg_temp.source_reference_kept('ftp://orders.example.mil/frago'),
    pg_temp.source_reference_kept('data:text/html,hi'),
    pg_temp.source_reference_kept('http://a b')
  ],
  ARRAY[true, true, true, false, false, false, false],
  'order identifiers and http(s) links are kept; other schemes are refused');

-- Edits record dates and coordination changes, never who wrote them as supplied.
UPDATE public.calendar_events SET starts_on = '2030-10-18', ends_on = '2030-10-24' WHERE id = pg_temp.id('301');
UPDATE public.calendar_events SET coordinator_user_id = pg_temp.id('2'), host_name = NULL WHERE id = pg_temp.id('301');
UPDATE public.calendar_events SET location = 'Range 4' WHERE id = pg_temp.id('301');
SELECT results_eq(
  $$SELECT kind, payload FROM public.calendar_event_activity WHERE event_id = pg_temp.id('301') AND kind <> 'created' ORDER BY id$$,
  $$VALUES
    ('dates_changed'::text, '{"from":{"startsOn":"2030-10-19","endsOn":"2030-10-23"},"to":{"startsOn":"2030-10-18","endsOn":"2030-10-24"}}'::jsonb),
    ('coordination_changed'::text, jsonb_build_object(
      'from', jsonb_build_object('hostName', '1-1 BN', 'coordinatorUserId', pg_temp.id('4')),
      'to', jsonb_build_object('hostName', NULL, 'coordinatorUserId', pg_temp.id('2'))))$$,
  'date and coordination changes are recorded; a location edit is not');

-- Group-scoped operators and viewers read every event but cannot write.
SELECT pg_temp.act_as('3');
SELECT is((SELECT count(*)::int FROM public.calendar_events WHERE id = pg_temp.id('301')), 1,
  'a Group-scoped Calendar operator reads Organization events');
SELECT throws_ok($$SELECT pg_temp.insert_event('303', '3')$$, '42501', NULL,
  'a Group-scoped Calendar operator cannot create an event');
WITH changed AS (UPDATE public.calendar_events SET title = 'Renamed' WHERE id = pg_temp.id('301') RETURNING id)
SELECT is((SELECT count(*)::int FROM changed), 0, 'a Group-scoped Calendar operator cannot edit an event');
SELECT throws_ok($$SELECT public.cancel_calendar_event(pg_temp.id('101'), pg_temp.id('301'), NULL)$$, '42501', NULL,
  'a Group-scoped Calendar operator cannot cancel an event');

SELECT pg_temp.act_as('4');
SELECT is((SELECT count(*)::int FROM public.calendar_event_activity WHERE event_id = pg_temp.id('301')), 3,
  'a Calendar viewer reads event Activity');
SELECT throws_ok($$SELECT pg_temp.insert_event('304', '4')$$, '42501', NULL, 'a Calendar viewer cannot create an event');
SELECT throws_ok($$SELECT public.cancel_calendar_event(pg_temp.id('101'), pg_temp.id('301'), NULL)$$, '42501', NULL,
  'a Calendar viewer cannot cancel an event');

SELECT pg_temp.act_as('5');
SELECT is((SELECT count(*)::int FROM public.calendar_events), 0, 'a member without Calendar access sees no events');
SELECT is((SELECT count(*)::int FROM public.calendar_event_activity), 0, 'a member without Calendar access sees no Activity');

SELECT pg_temp.act_as('6');
SELECT is((SELECT count(*)::int FROM public.calendar_events), 0, 'another Organization sees no events');
SELECT throws_ok(
  $$INSERT INTO public.calendar_events (organization_id, title, starts_on, ends_on, coordinator_user_id)
    VALUES (pg_temp.id('101'), 'Foreign', '2030-01-01', '2030-01-01', pg_temp.id('6'))$$,
  '42501', NULL, 'another Organization cannot create an event here or learn who belongs to it');
SELECT throws_ok($$SELECT public.cancel_calendar_event(pg_temp.id('101'), pg_temp.id('301'), NULL)$$, '42501', NULL,
  'another Organization cannot cancel an event here');

-- Cancellation is explicit, attributed by the database, final and idempotent.
SELECT pg_temp.act_as('2');
SELECT lives_ok($$SELECT public.cancel_calendar_event(pg_temp.id('101'), pg_temp.id('301'), '  Range closed  ')$$,
  'an Organization-wide Calendar operator cancels an event');
SELECT results_eq(
  $$SELECT cancelled_by, cancellation_reason, cancelled_at IS NOT NULL FROM public.calendar_events WHERE id = pg_temp.id('301')$$,
  $$VALUES (pg_temp.id('2'), 'Range closed'::text, true)$$,
  'cancelling records the signed-in member and the trimmed reason');
SELECT pg_temp.act_as('1');
SELECT lives_ok($$SELECT public.cancel_calendar_event(pg_temp.id('101'), pg_temp.id('301'), 'Again')$$,
  'cancelling a cancelled event succeeds without change');
SELECT results_eq(
  $$SELECT cancelled_by, cancellation_reason FROM public.calendar_events WHERE id = pg_temp.id('301')$$,
  $$VALUES (pg_temp.id('2'), 'Range closed'::text)$$,
  'a repeat cancel keeps the first actor and reason');
SELECT is((SELECT count(*)::int FROM public.calendar_event_activity WHERE event_id = pg_temp.id('301') AND kind = 'cancelled'), 1,
  'a cancellation is recorded once');
SELECT throws_ok($$UPDATE public.calendar_events SET title = 'Revived' WHERE id = pg_temp.id('301')$$, '55000', NULL,
  'a cancelled event cannot be edited');
SELECT throws_ok($$SELECT public.cancel_calendar_event(pg_temp.id('101'), pg_temp.id('399'), NULL)$$, 'P0002', NULL,
  'cancelling an unknown event reports not found');

-- Turning the switch off hides and freezes events for every role, owners included.
RESET ROLE;
UPDATE public.organizations SET disabled_features = ARRAY['eventsAndTaskings'] WHERE id = pg_temp.id('101');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('1');
SELECT is((SELECT count(*)::int FROM public.calendar_events), 0, 'an owner sees no events while the switch is off');
SELECT throws_ok($$SELECT pg_temp.insert_event('305', '1')$$, '42501', NULL, 'an owner cannot create events while the switch is off');
SELECT pg_temp.act_as('2');
SELECT is((SELECT count(*)::int FROM public.calendar_event_activity), 0, 'Activity is hidden while the switch is off');

SELECT * FROM finish();
ROLLBACK;
