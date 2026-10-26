-- Taskings belong to one Group or to the Organization. Readers see what their
-- scope covers, operators write what their scope covers, only Organization-wide
-- operators move responsibility, and status changes only through the transition
-- function. Every write below runs as an ordinary signed-in member.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a510000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;

-- 1 owner, 2 Organization-wide Calendar operator, 3 Alpha-scoped Calendar operator,
-- 4 Organization-wide Calendar viewer, 5 member without Calendar, 6 another Organization's owner,
-- 7 Alpha-scoped Calendar viewer, 8 Calendar operator scoped to Alpha and Bravo.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'taskings-' || n || '@example.test', now()
FROM generate_series(1, 8) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Taskings Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Taskings Other', pg_temp.id('6'));
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
  (pg_temp.id('101'), pg_temp.id('4'), 'member', 'viewer', '{"calendar":"view"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('5'), 'member', 'viewer', '{"calendar":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('102'), pg_temp.id('6'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('7'), 'member', 'viewer', '{"calendar":"view"}', 'groups', ARRAY[pg_temp.id('201')]),
  (pg_temp.id('101'), pg_temp.id('8'), 'member', 'viewer', '{"calendar":"operate"}', 'groups',
    ARRAY[pg_temp.id('201'), pg_temp.id('202')]);
INSERT INTO public.calendar_events (id, organization_id, title, starts_on, ends_on, coordinator_user_id)
VALUES (pg_temp.id('301'), pg_temp.id('101'), 'Best Medic Competition', '2030-10-19', '2030-10-23', pg_temp.id('1')),
  (pg_temp.id('302'), pg_temp.id('102'), 'Other Organization event', '2030-10-19', '2030-10-23', pg_temp.id('6'));

CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.insert_tasking(p_id text, p_group text, p_event text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.calendar_taskings (id, organization_id, title, responsible_group_id, event_id, suspense_on)
  VALUES (pg_temp.id(p_id), pg_temp.id('101'), 'Provide four trauma-lane medics',
    CASE WHEN p_group IS NULL THEN NULL ELSE pg_temp.id(p_group) END,
    CASE WHEN p_event IS NULL THEN NULL ELSE pg_temp.id(p_event) END, '2030-10-23');
$$;
CREATE FUNCTION pg_temp.move(p_id text, p_action text, p_note text DEFAULT NULL) RETURNS boolean LANGUAGE sql AS $$
  SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id(p_id), p_action, p_note);
$$;
CREATE FUNCTION pg_temp.status_of(p_id text) RETURNS text LANGUAGE sql AS $$
  SELECT status FROM public.calendar_taskings WHERE id = pg_temp.id(p_id);
$$;
CREATE FUNCTION pg_temp.kinds(p_id text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(kind ORDER BY id), ARRAY[]::text[]) FROM public.calendar_tasking_activity WHERE tasking_id = pg_temp.id(p_id);
$$;

SET LOCAL ROLE authenticated;

-- Organization-wide operators create at any responsibility.
SELECT pg_temp.act_as('2');
SELECT lives_ok($$SELECT pg_temp.insert_tasking('401', '201', '301')$$,
  'an Organization-wide operator creates an Alpha Tasking under an Event');
SELECT lives_ok($$SELECT pg_temp.insert_tasking('402', NULL)$$,
  'an Organization-wide operator creates a standalone Organization-level Tasking');
SELECT lives_ok($$SELECT pg_temp.insert_tasking('403', '202')$$,
  'an Organization-wide operator creates a standalone Bravo Tasking');
SELECT results_eq(
  $$SELECT status, created_by, updated_by FROM public.calendar_taskings WHERE id = pg_temp.id('401')$$,
  $$VALUES ('open'::text, pg_temp.id('2'), pg_temp.id('2'))$$,
  'a new Tasking is Open and attributed to the signed-in member');
SELECT is(pg_temp.kinds('401'), ARRAY['created'], 'creating a Tasking records one created entry');

-- Attribution and status are the database's to write.
SELECT throws_ok(
  $$INSERT INTO public.calendar_taskings (organization_id, title, suspense_on, created_by)
    VALUES (pg_temp.id('101'), 'Forged', '2030-01-01', pg_temp.id('1'))$$,
  '42501', NULL, 'a client cannot name the creator');
SELECT throws_ok(
  $$INSERT INTO public.calendar_taskings (organization_id, title, suspense_on, status, completed_at, completed_by)
    VALUES (pg_temp.id('101'), 'Forged', '2030-01-01', 'completed', now(), pg_temp.id('1'))$$,
  '42501', NULL, 'a client cannot insert a completed Tasking');
SELECT throws_ok($$UPDATE public.calendar_taskings SET updated_by = pg_temp.id('1') WHERE id = pg_temp.id('401')$$,
  '42501', NULL, 'a client cannot name the last editor');
SELECT throws_ok($$UPDATE public.calendar_taskings SET created_at = '2000-01-01' WHERE id = pg_temp.id('401')$$,
  '42501', NULL, 'a client cannot move the creation time');
SELECT throws_ok($$UPDATE public.calendar_taskings SET status = 'completed' WHERE id = pg_temp.id('401')$$,
  '42501', NULL, 'a client cannot change status by writing it');
SELECT throws_ok(
  $$UPDATE public.calendar_taskings SET blocked_at = now(), blocked_by = pg_temp.id('1') WHERE id = pg_temp.id('401')$$,
  '42501', NULL, 'a client cannot write who blocked a Tasking');
SELECT throws_ok(
  $$UPDATE public.calendar_taskings SET completed_at = now(), completed_by = pg_temp.id('1') WHERE id = pg_temp.id('401')$$,
  '42501', NULL, 'a client cannot write who completed a Tasking');
SELECT throws_ok(
  $$UPDATE public.calendar_taskings SET cancelled_at = now(), cancelled_by = pg_temp.id('1') WHERE id = pg_temp.id('401')$$,
  '42501', NULL, 'a client cannot write who cancelled a Tasking');
SELECT throws_ok($$INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, kind) VALUES (pg_temp.id('101'), pg_temp.id('401'), 'completed')$$,
  '42501', NULL, 'a client cannot write Activity');
SELECT throws_ok($$DELETE FROM public.calendar_taskings WHERE id = pg_temp.id('401')$$,
  '42501', NULL, 'Taskings are never deleted by a client');

-- Shape rules.
SELECT throws_ok(
  $$INSERT INTO public.calendar_taskings (organization_id, title, suspense_on, execution_starts_on)
    VALUES (pg_temp.id('101'), 'Half dates', '2030-01-01', '2030-01-01')$$,
  '23514', NULL, 'execution dates come together');
SELECT throws_ok(
  $$INSERT INTO public.calendar_taskings (organization_id, title, suspense_on, execution_starts_on, execution_ends_on)
    VALUES (pg_temp.id('101'), 'Backwards', '2030-01-01', '2030-01-02', '2030-01-01')$$,
  '23514', NULL, 'execution cannot end before it starts');
SELECT throws_ok(
  $$INSERT INTO public.calendar_taskings (organization_id, title, suspense_on, report_time)
    VALUES (pg_temp.id('101'), 'Report alone', '2030-01-01', '06:30')$$,
  '23514', NULL, 'a report time needs execution dates');
SELECT throws_ok(
  $$INSERT INTO public.calendar_taskings (organization_id, title, suspense_on, staffing_required)
    VALUES (pg_temp.id('101'), 'Nobody', '2030-01-01', 0)$$,
  '23514', NULL, 'a staffing requirement is a positive count');
SELECT throws_ok(
  $$INSERT INTO public.calendar_taskings (organization_id, title, suspense_on, qualifications)
    VALUES (pg_temp.id('101'), 'Qualified nobody', '2030-01-01', '68W')$$,
  '23514', NULL, 'qualifications come with a count');
SELECT throws_ok(
  $$INSERT INTO public.calendar_taskings (organization_id, title, suspense_on, responsible_group_id)
    VALUES (pg_temp.id('101'), 'Foreign Group', '2030-01-01', pg_temp.id('203'))$$,
  '23503', NULL, 'a Group from another Organization cannot be responsible');
SELECT throws_ok(
  $$INSERT INTO public.calendar_taskings (organization_id, title, suspense_on, event_id)
    VALUES (pg_temp.id('101'), 'Foreign Event', '2030-01-01', pg_temp.id('302'))$$,
  '23503', NULL, 'an Event from another Organization cannot be linked');

-- Edits record their own Activity.
UPDATE public.calendar_taskings
SET suspense_on = '2030-10-22', execution_starts_on = '2030-10-19', execution_ends_on = '2030-10-23', report_time = '05:30'
WHERE id = pg_temp.id('401');
UPDATE public.calendar_taskings SET staffing_required = 4, qualifications = '68W, current BLS' WHERE id = pg_temp.id('401');
UPDATE public.calendar_taskings SET instructions = 'Report to Range 4' WHERE id = pg_temp.id('401');
UPDATE public.calendar_taskings SET event_id = NULL WHERE id = pg_temp.id('401');
UPDATE public.calendar_taskings SET event_id = pg_temp.id('301') WHERE id = pg_temp.id('401');
UPDATE public.calendar_taskings SET title = 'Provide four medics' WHERE id = pg_temp.id('401');
SELECT results_eq(
  $$SELECT kind, payload FROM public.calendar_tasking_activity WHERE tasking_id = pg_temp.id('401') AND kind <> 'created' ORDER BY id$$,
  $$VALUES
    ('dates_changed'::text, '{"from":{"suspenseOn":"2030-10-23","executionStartsOn":null,"executionEndsOn":null,"reportTime":null},"to":{"suspenseOn":"2030-10-22","executionStartsOn":"2030-10-19","executionEndsOn":"2030-10-23","reportTime":"05:30"}}'::jsonb),
    ('requirement_changed'::text, '{"from":{"count":null,"qualifications":null},"to":{"count":4,"qualifications":"68W, current BLS"}}'::jsonb),
    ('instructions_changed'::text, '{}'::jsonb),
    ('unlinked'::text, jsonb_build_object('eventId', pg_temp.id('301'))),
    ('linked'::text, jsonb_build_object('eventId', pg_temp.id('301'))),
    ('outcome_changed'::text, '{"from":"Provide four trauma-lane medics","to":"Provide four medics"}'::jsonb)$$,
  'dates, requirement, instructions, linking and the outcome each record what changed');
SELECT is((SELECT id FROM public.calendar_taskings WHERE id = pg_temp.id('401')), pg_temp.id('401'),
  'unlinking and relinking keeps the same Tasking');

-- An Organization-wide operator reroutes; the change is recorded.
SELECT lives_ok($$UPDATE public.calendar_taskings SET responsible_group_id = pg_temp.id('202') WHERE id = pg_temp.id('403')$$,
  'an Organization-wide operator changes responsibility');
UPDATE public.calendar_taskings SET responsible_group_id = pg_temp.id('201') WHERE id = pg_temp.id('403');
SELECT is(
  (SELECT payload FROM public.calendar_tasking_activity WHERE tasking_id = pg_temp.id('403') AND kind = 'responsibility_changed' ORDER BY id DESC LIMIT 1),
  jsonb_build_object('from', pg_temp.id('202'), 'to', pg_temp.id('201')),
  'a responsibility change records both Groups');
UPDATE public.calendar_taskings SET responsible_group_id = pg_temp.id('202') WHERE id = pg_temp.id('403');

-- A Group-scoped operator works only inside their Groups and never moves responsibility.
SELECT pg_temp.act_as('3');
SELECT lives_ok($$SELECT pg_temp.insert_tasking('404', '201')$$, 'an Alpha operator creates a standalone Alpha Tasking');
SELECT lives_ok($$SELECT pg_temp.insert_tasking('405', '201', '301')$$, 'an Alpha operator creates an Alpha Tasking under an Event');
SELECT throws_ok($$SELECT pg_temp.insert_tasking('406', '202')$$, '42501', NULL,
  'an Alpha operator cannot create a Bravo Tasking');
SELECT throws_ok($$SELECT pg_temp.insert_tasking('407', NULL)$$, '42501', NULL,
  'an Alpha operator cannot create an Organization-level Tasking');
SELECT is(
  (SELECT array_agg(id ORDER BY id) FROM public.calendar_taskings),
  ARRAY[pg_temp.id('401'), pg_temp.id('404'), pg_temp.id('405')],
  'an Alpha operator sees only Alpha Taskings, not Bravo or Organization-level ones');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_activity WHERE tasking_id IN (pg_temp.id('402'), pg_temp.id('403'))), 0,
  'an Alpha operator sees no Activity of hidden Taskings');
SELECT lives_ok(
  $$UPDATE public.calendar_taskings SET suspense_on = '2030-10-20', staffing_required = 5, event_id = NULL WHERE id = pg_temp.id('401')$$,
  'an Alpha operator edits dates, requirement and the link of an Alpha Tasking');
SELECT throws_ok($$UPDATE public.calendar_taskings SET responsible_group_id = NULL WHERE id = pg_temp.id('401')$$,
  '42501', NULL, 'an Alpha operator cannot promote a Tasking to Organization level');
SELECT throws_ok($$UPDATE public.calendar_taskings SET responsible_group_id = pg_temp.id('202') WHERE id = pg_temp.id('401')$$,
  '42501', NULL, 'an Alpha operator cannot reroute a Tasking to another Group');
WITH changed AS (UPDATE public.calendar_taskings SET title = 'Hijacked' WHERE id = pg_temp.id('403') RETURNING id)
SELECT is((SELECT count(*)::int FROM changed), 0, 'an Alpha operator cannot edit a Bravo Tasking');
SELECT throws_ok($$SELECT pg_temp.move('403', 'start')$$, 'P0002', NULL,
  'an Alpha operator cannot change a hidden Bravo Tasking and learns nothing about it');
SELECT throws_ok($$SELECT pg_temp.move('402', 'cancel')$$, 'P0002', NULL,
  'an Alpha operator cannot change a hidden Organization-level Tasking');

SELECT pg_temp.act_as('8');
SELECT throws_ok($$UPDATE public.calendar_taskings SET responsible_group_id = pg_temp.id('202') WHERE id = pg_temp.id('404')$$,
  '42501', NULL, 'an operator scoped to both Groups still cannot move responsibility between them');

-- Readers.
SELECT pg_temp.act_as('7');
SELECT is((SELECT count(*)::int FROM public.calendar_taskings), 3, 'an Alpha viewer sees the three Alpha Taskings');
SELECT is((SELECT count(*)::int FROM public.calendar_taskings WHERE id = pg_temp.id('403')), 0,
  'an Alpha viewer cannot see a standalone Bravo Tasking');
WITH changed AS (UPDATE public.calendar_taskings SET title = 'Viewer edit' WHERE id = pg_temp.id('404') RETURNING id)
SELECT is((SELECT count(*)::int FROM changed), 0, 'an Alpha viewer cannot edit');
SELECT throws_ok($$SELECT pg_temp.move('404', 'start')$$, '42501', NULL, 'an Alpha viewer cannot change status');

SELECT pg_temp.act_as('4');
SELECT is((SELECT count(*)::int FROM public.calendar_taskings), 5, 'an Organization-wide viewer sees every Tasking');
SELECT throws_ok($$SELECT pg_temp.insert_tasking('408', '201')$$, '42501', NULL, 'a viewer cannot create');

SELECT pg_temp.act_as('5');
SELECT is((SELECT count(*)::int FROM public.calendar_taskings), 0, 'a member without Calendar access sees no Taskings');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_activity), 0, 'a member without Calendar access sees no Activity');

SELECT pg_temp.act_as('6');
SELECT is((SELECT count(*)::int FROM public.calendar_taskings), 0, 'another Organization sees no Taskings');
SELECT throws_ok($$SELECT pg_temp.insert_tasking('409', NULL)$$, '42501', NULL, 'another Organization cannot create here');
SELECT throws_ok($$SELECT pg_temp.move('401', 'start')$$, 'P0002', NULL, 'another Organization cannot change status here');

-- The lifecycle, through the one transition function.
SELECT pg_temp.act_as('3');
SELECT throws_ok($$SELECT pg_temp.move('404', 'unblock')$$, '55000', NULL, 'an Open Tasking cannot be unblocked');
SELECT throws_ok($$SELECT pg_temp.move('404', 'reopen')$$, '55000', NULL, 'an Open Tasking cannot be reopened');
SELECT throws_ok($$SELECT pg_temp.move('404', 'block', '   ')$$, '23514', NULL, 'a block needs a reason');
SELECT throws_ok($$SELECT pg_temp.move('404', 'archive')$$, '22023', NULL, 'an unknown action is refused');
SELECT is(pg_temp.move('404', 'start'), true, 'an Alpha operator starts an Alpha Tasking');
SELECT is(pg_temp.move('404', 'start'), false, 'starting again changes nothing and says so');
SELECT lives_ok($$SELECT pg_temp.move('404', 'block', '  Litters short  ')$$, 'an In progress Tasking is blocked with a reason');
SELECT results_eq(
  $$SELECT status, block_reason, blocked_by, blocked_at IS NOT NULL, suspense_on FROM public.calendar_taskings WHERE id = pg_temp.id('404')$$,
  $$VALUES ('blocked'::text, 'Litters short'::text, pg_temp.id('3'), true, '2030-10-23'::date)$$,
  'blocking records the trimmed reason and the actor and keeps the suspense');
SELECT pg_temp.act_as('2');
SELECT lives_ok($$SELECT pg_temp.move('404', 'block', 'Another reason')$$, 'blocking again changes nothing');
SELECT is((SELECT blocked_by FROM public.calendar_taskings WHERE id = pg_temp.id('404')), pg_temp.id('3'),
  'a repeat block keeps the first actor');
SELECT throws_ok($$SELECT pg_temp.move('404', 'start')$$, '55000', NULL, 'a Blocked Tasking is unblocked, not started');
SELECT lives_ok($$SELECT pg_temp.move('404', 'unblock')$$, 'a Blocked Tasking is unblocked');
SELECT results_eq(
  $$SELECT status, block_reason, blocked_by FROM public.calendar_taskings WHERE id = pg_temp.id('404')$$,
  $$VALUES ('in_progress'::text, NULL::text, NULL::uuid)$$,
  'unblocking clears the current block');
SELECT lives_ok($$SELECT pg_temp.move('404', 'complete', 'Names sent to BN S3')$$, 'an In progress Tasking is completed with a note');
SELECT results_eq(
  $$SELECT status, completion_note, completed_by FROM public.calendar_taskings WHERE id = pg_temp.id('404')$$,
  $$VALUES ('completed'::text, 'Names sent to BN S3'::text, pg_temp.id('2'))$$,
  'completing records the note and the actor');
SELECT throws_ok($$UPDATE public.calendar_taskings SET title = 'Late edit' WHERE id = pg_temp.id('404')$$, '55000', NULL,
  'a Completed Tasking cannot be edited');
SELECT throws_ok($$SELECT pg_temp.move('404', 'cancel')$$, '55000', NULL, 'a Completed Tasking cannot be cancelled');
SELECT lives_ok($$SELECT pg_temp.move('404', 'reopen')$$, 'a Completed Tasking is reopened');
SELECT results_eq(
  $$SELECT status, completed_at IS NULL FROM public.calendar_taskings WHERE id = pg_temp.id('404')$$,
  $$VALUES ('in_progress'::text, true)$$,
  'reopening returns to In progress');
SELECT lives_ok($$SELECT pg_temp.move('404', 'cancel', 'Competition moved')$$, 'an In progress Tasking is cancelled');
SELECT throws_ok($$SELECT pg_temp.move('404', 'reopen')$$, '55000', NULL, 'a Cancelled Tasking cannot be reopened');
SELECT throws_ok($$UPDATE public.calendar_taskings SET instructions = 'After' WHERE id = pg_temp.id('404')$$, '55000', NULL,
  'a Cancelled Tasking cannot be edited');
SELECT is(pg_temp.kinds('404'),
  ARRAY['created', 'started', 'blocked', 'unblocked', 'completed', 'reopened', 'cancelled'],
  'every transition is recorded once, and reopening keeps the earlier completion');
SELECT results_eq(
  $$SELECT kind, actor_id, payload FROM public.calendar_tasking_activity
    WHERE tasking_id = pg_temp.id('404') AND kind IN ('blocked', 'completed', 'cancelled') ORDER BY id$$,
  $$VALUES ('blocked'::text, pg_temp.id('3'), '{"reason":"Litters short"}'::jsonb),
    ('completed'::text, pg_temp.id('2'), '{"note":"Names sent to BN S3"}'::jsonb),
    ('cancelled'::text, pg_temp.id('2'), '{"reason":"Competition moved"}'::jsonb)$$,
  'status Activity carries the actor and the reason or note');
SELECT lives_ok($$SELECT pg_temp.move('402', 'complete')$$, 'an Open Tasking is completed without a note');
SELECT lives_ok($$SELECT pg_temp.move('403', 'block', 'No vehicle')$$, 'an Open Tasking is blocked directly');
SELECT lives_ok($$SELECT pg_temp.move('403', 'cancel')$$, 'a Blocked Tasking is cancelled without a reason');
SELECT results_eq(
  $$SELECT status, block_reason, cancelled_by FROM public.calendar_taskings WHERE id = pg_temp.id('403')$$,
  $$VALUES ('cancelled'::text, NULL::text, pg_temp.id('2'))$$,
  'cancelling a Blocked Tasking clears the block');
SELECT throws_ok($$SELECT pg_temp.move('499', 'start')$$, 'P0002', NULL, 'an unknown Tasking reports not found');

-- The switch hides and freezes Taskings for every role.
RESET ROLE;
UPDATE public.organizations SET disabled_features = ARRAY['eventsAndTaskings'] WHERE id = pg_temp.id('101');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('1');
SELECT is((SELECT count(*)::int FROM public.calendar_taskings), 0, 'an owner sees no Taskings while the switch is off');
SELECT throws_ok($$SELECT pg_temp.insert_tasking('410', NULL)$$, '42501', NULL, 'an owner cannot create while the switch is off');
SELECT throws_ok($$SELECT pg_temp.move('401', 'start')$$, 'P0002', NULL, 'status cannot change while the switch is off');

-- Group deletion never clears responsibility; Organization deletion takes its Taskings with it.
RESET ROLE;
UPDATE public.organizations SET disabled_features = '{}' WHERE id = pg_temp.id('101');
SELECT throws_ok($$DELETE FROM public.groups WHERE id = pg_temp.id('202')$$, '23503', NULL,
  'a Group that owns Taskings cannot be deleted');
SELECT lives_ok($$DELETE FROM public.organizations WHERE id = pg_temp.id('101')$$,
  'deleting an Organization removes its Groups, Events and Taskings together');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_activity WHERE organization_id = pg_temp.id('101')), 0,
  'and their Activity');

SELECT * FROM finish();
ROLLBACK;
