-- The Dashboard's Tasking attention puts each active Tasking under its most urgent kind from the viewer's
-- day, counts only picks that fill a requirement, and shows each reader only the work their scope covers.
-- Every read below runs as an ordinary signed-in member.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a570000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;

-- 1 owner, 2 Organization-wide Calendar operator, 3 Alpha-scoped Calendar operator,
-- 4 Organization-wide Calendar viewer, 5 member without Calendar, 6 another Organization's owner.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'attention-' || n || '@example.test', now()
FROM generate_series(1, 6) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Attention Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Attention Other', pg_temp.id('6'));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.id('201'), pg_temp.id('101'), 'Alpha'),
  (pg_temp.id('202'), pg_temp.id('101'), 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'viewer', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{"calendar":"operate"}', 'groups', ARRAY[pg_temp.id('201')]),
  (pg_temp.id('101'), pg_temp.id('4'), 'member', 'viewer', '{"calendar":"view"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('5'), 'member', 'viewer', '{"calendar":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('102'), pg_temp.id('6'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('501'), pg_temp.id('101'), pg_temp.id('201'), 'SPC', 'Ana', 'Adams', 'attention-501'),
  (pg_temp.id('502'), pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Ben', 'Baker', 'attention-502'),
  (pg_temp.id('503'), pg_temp.id('101'), pg_temp.id('202'), 'PFC', 'Cal', 'Cole', 'attention-503');
INSERT INTO public.calendar_events (id, organization_id, title, starts_on, ends_on, coordinator_user_id) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'Ranger Challenge', '2030-10-22', '2030-10-26', pg_temp.id('1'));

-- The viewer's day is 2030-10-20. 401 and 402 are overdue (402 Bravo's), 403 is Blocked, 404 is short on people,
-- 405 is Organization-level and short on equipment, 406 is due in four days, and 407 is eleven days out.
-- 408 is overdue, blocked and short, so it shows once as Overdue. 409 is Completed, 410 has finished executing
-- unstaffed, 411 has its only pick under review, and 412 is due today.
INSERT INTO public.calendar_taskings (
  id, organization_id, event_id, title, responsible_group_id, suspense_on, execution_starts_on, execution_ends_on,
  staffing_required
) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), NULL, 'Submit roster', pg_temp.id('201'), '2030-10-17', NULL, NULL, NULL),
  (pg_temp.id('402'), pg_temp.id('101'), NULL, 'Bravo range detail', pg_temp.id('202'), '2030-10-18', NULL, NULL, NULL),
  (pg_temp.id('403'), pg_temp.id('101'), NULL, 'Wait on vehicles', pg_temp.id('201'), '2030-10-25', NULL, NULL, NULL),
  (pg_temp.id('404'), pg_temp.id('101'), pg_temp.id('301'), 'Provide medics', pg_temp.id('201'), '2030-10-28', '2030-10-22', '2030-10-26', 3),
  (pg_temp.id('405'), pg_temp.id('101'), pg_temp.id('301'), 'Provide graders', NULL, '2030-10-30', '2030-10-21', '2030-10-22', 1),
  (pg_temp.id('406'), pg_temp.id('101'), NULL, 'Plan route', pg_temp.id('201'), '2030-10-24', NULL, NULL, NULL),
  (pg_temp.id('407'), pg_temp.id('101'), NULL, 'Order water', pg_temp.id('201'), '2030-10-31', NULL, NULL, NULL),
  (pg_temp.id('408'), pg_temp.id('101'), NULL, 'Everything wrong', pg_temp.id('201'), '2030-10-19', '2030-10-21', '2030-10-23', 2),
  (pg_temp.id('409'), pg_temp.id('101'), NULL, 'Finished long ago', pg_temp.id('201'), '2030-10-10', NULL, NULL, NULL),
  (pg_temp.id('410'), pg_temp.id('101'), NULL, 'Return gear', pg_temp.id('201'), '2030-10-27', '2030-10-15', '2030-10-19', 2),
  (pg_temp.id('411'), pg_temp.id('101'), NULL, 'One lane', pg_temp.id('201'), '2030-11-09', '2030-10-25', '2030-10-26', 1),
  (pg_temp.id('412'), pg_temp.id('101'), NULL, 'Due today', pg_temp.id('201'), '2030-10-20', NULL, NULL, NULL);
INSERT INTO public.calendar_tasking_participants (organization_id, tasking_id, personnel_id, review_since) VALUES
  (pg_temp.id('101'), pg_temp.id('404'), pg_temp.id('501'), NULL),
  (pg_temp.id('101'), pg_temp.id('405'), pg_temp.id('501'), NULL),
  (pg_temp.id('101'), pg_temp.id('411'), pg_temp.id('502'), now());
INSERT INTO public.calendar_tasking_equipment (organization_id, tasking_id, name, quantity, secured_quantity, position) VALUES
  (pg_temp.id('101'), pg_temp.id('405'), 'Radios', 4, 3, 1),
  (pg_temp.id('101'), pg_temp.id('405'), 'Cones', 10, 10, 2);

CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.attention(p_limit integer DEFAULT 100) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(kind || ':' || right(tasking_id::text, 3) ORDER BY ordinality), ARRAY[]::text[])
  FROM (
    SELECT a.kind, a.tasking_id, row_number() OVER () AS ordinality
    FROM public.calendar_tasking_attention(pg_temp.id('101'), '2030-10-20', p_limit) AS a
  ) AS rows;
$$;

SET LOCAL ROLE authenticated;

SELECT pg_temp.act_as('2');
SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('403'), 'block', 'No dispatch');
SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('408'), 'block', 'Waiting');
SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('404'), 'start', NULL);
SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('409'), 'complete', NULL);
SELECT is(pg_temp.attention(), ARRAY[
  'overdue:401', 'overdue:402', 'overdue:408',
  'blocked:403',
  'short:405', 'short:404', 'short:411',
  'due_soon:412', 'due_soon:406', 'due_soon:410'
], 'an Organization-wide reader sees each active Tasking once, under its most urgent kind');
SELECT results_eq(
  $$SELECT staffing_picked, staffing_required, equipment_not_ready FROM public.calendar_tasking_attention(pg_temp.id('101'), '2030-10-20')
    WHERE tasking_id IN (pg_temp.id('404'), pg_temp.id('405'), pg_temp.id('411')) ORDER BY staffing_required DESC, tasking_id$$,
  $$VALUES (1, 3, 0), (1, 1, 1), (0, 1, 0)$$,
  'rows carry picks that fill the requirement and the equipment not ready; a pick under review fills nothing');
SELECT is((SELECT max(attention_total)::int FROM public.calendar_tasking_attention(pg_temp.id('101'), '2030-10-20')), 10,
  'the total counts every row');
SELECT is(pg_temp.attention(2), ARRAY['overdue:401', 'overdue:402'], 'a limit bounds the rows, most urgent first');
SELECT is((SELECT max(attention_total)::int FROM public.calendar_tasking_attention(pg_temp.id('101'), '2030-10-20', 2)), 10,
  'and the total still counts the rows it left out');
SELECT is(
  (SELECT array_agg(kind ORDER BY tasking_id) FROM public.calendar_tasking_attention(pg_temp.id('101'), '2030-10-27')
   WHERE tasking_id IN (pg_temp.id('403'), pg_temp.id('412'))),
  ARRAY['overdue', 'overdue'], 'the viewer''s day decides what is overdue');
SELECT is(
  (SELECT event_title FROM public.calendar_tasking_attention(pg_temp.id('101'), '2030-10-20') WHERE tasking_id = pg_temp.id('404')),
  'Ranger Challenge', 'a Tasking names its Event');

SELECT pg_temp.act_as('3');
SELECT is(pg_temp.attention(), ARRAY[
  'overdue:401', 'overdue:408', 'blocked:403', 'short:404', 'short:411', 'due_soon:412', 'due_soon:406', 'due_soon:410'
], 'an Alpha-scoped reader sees only Alpha work, never Bravo''s standalone or Organization-level Taskings');
SELECT is((SELECT max(attention_total)::int FROM public.calendar_tasking_attention(pg_temp.id('101'), '2030-10-20')), 8,
  'and the total counts only what that reader can see');

SELECT pg_temp.act_as('4');
SELECT is(cardinality(pg_temp.attention()), 10, 'a Calendar viewer reads the same attention as an operator');

SELECT pg_temp.act_as('5');
SELECT is(cardinality(pg_temp.attention()), 0, 'a member without Calendar reads nothing');
SELECT pg_temp.act_as('6');
SELECT is(cardinality(pg_temp.attention()), 0, 'another Organization''s owner reads nothing');

RESET ROLE;
UPDATE public.organizations SET disabled_features = ARRAY['eventsAndTaskings'] WHERE id = pg_temp.id('101');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
SELECT is(cardinality(pg_temp.attention()), 0, 'with Events & Taskings off, nothing is read');

SELECT * FROM finish();
ROLLBACK;
