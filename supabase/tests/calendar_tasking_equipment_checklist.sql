-- A Tasking's equipment and checklist follow the Tasking: readers see them where they
-- see the Tasking, operators edit them where they can manage it while it is active,
-- and order, attribution and Activity come from the database. Every write below runs
-- as an ordinary signed-in member.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a550000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;

-- 1 owner, 2 Organization-wide Calendar operator, 3 Alpha-scoped Calendar operator,
-- 4 Organization-wide Calendar viewer, 5 member without Calendar, 6 another Organization's owner,
-- 7 Alpha-scoped Calendar viewer.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'tasking-lists-' || n || '@example.test', now()
FROM generate_series(1, 7) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Lists Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Lists Other', pg_temp.id('6'));
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
  (pg_temp.id('102'), pg_temp.id('6'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('7'), 'member', 'viewer', '{"calendar":"view"}', 'groups', ARRAY[pg_temp.id('201')]);

CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.insert_tasking(p_id text, p_group text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.calendar_taskings (id, organization_id, title, responsible_group_id, suspense_on)
  VALUES (pg_temp.id(p_id), pg_temp.id('101'), 'Provide four trauma-lane medics',
    CASE WHEN p_group IS NULL THEN NULL ELSE pg_temp.id(p_group) END, '2030-10-23');
$$;
CREATE FUNCTION pg_temp.add_equipment(p_id text, p_tasking text, p_name text DEFAULT 'Litters', p_quantity integer DEFAULT 4, p_secured integer DEFAULT 0)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.calendar_tasking_equipment (id, organization_id, tasking_id, name, quantity, secured_quantity)
  VALUES (pg_temp.id(p_id), pg_temp.id('101'), pg_temp.id(p_tasking), p_name, p_quantity, p_secured);
$$;
CREATE FUNCTION pg_temp.add_item(p_id text, p_tasking text, p_label text DEFAULT 'Confirm the range is booked')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.calendar_tasking_checklist_items (id, organization_id, tasking_id, label)
  VALUES (pg_temp.id(p_id), pg_temp.id('101'), pg_temp.id(p_tasking), p_label);
$$;
CREATE FUNCTION pg_temp.reorder(p_tasking text, p_list text, p_ids text[]) RETURNS void LANGUAGE sql AS $$
  SELECT public.reorder_calendar_tasking_list(pg_temp.id('101'), pg_temp.id(p_tasking), p_list,
    ARRAY(SELECT pg_temp.id(i) FROM unnest(p_ids) AS i));
$$;
CREATE FUNCTION pg_temp.move(p_id text, p_action text, p_note text DEFAULT NULL) RETURNS boolean LANGUAGE sql AS $$
  SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id(p_id), p_action, p_note);
$$;
CREATE FUNCTION pg_temp.equipment_order(p_tasking text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(name ORDER BY position, created_at, id), ARRAY[]::text[])
  FROM public.calendar_tasking_equipment WHERE tasking_id = pg_temp.id(p_tasking);
$$;
CREATE FUNCTION pg_temp.checklist_order(p_tasking text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(label ORDER BY position, created_at, id), ARRAY[]::text[])
  FROM public.calendar_tasking_checklist_items WHERE tasking_id = pg_temp.id(p_tasking);
$$;
CREATE FUNCTION pg_temp.kinds(p_tasking text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(kind ORDER BY id), ARRAY[]::text[])
  FROM public.read_calendar_tasking_activity(pg_temp.id('101')) WHERE tasking_id = pg_temp.id(p_tasking) AND kind <> 'created';
$$;

SET LOCAL ROLE authenticated;

-- 401 Alpha, 402 Bravo, 403 Organization-level.
SELECT pg_temp.act_as('2');
SELECT pg_temp.insert_tasking('401', '201');
SELECT pg_temp.insert_tasking('402', '202');
SELECT pg_temp.insert_tasking('403', NULL);

-- Equipment: an Organization-wide operator adds at any responsibility.
SELECT lives_ok($$SELECT pg_temp.add_equipment('501', '401', 'Litters', 4, 1)$$, 'an operator adds equipment to an Alpha Tasking');
SELECT lives_ok($$SELECT pg_temp.add_equipment('502', '401', 'Radios', 2)$$, 'an operator adds a second requirement');
SELECT lives_ok($$SELECT pg_temp.add_equipment('503', '402', 'Bravo litters')$$, 'an operator adds equipment to a Bravo Tasking');
SELECT lives_ok($$SELECT pg_temp.add_equipment('504', '403', 'Org tents')$$, 'an operator adds equipment to an Organization-level Tasking');
SELECT lives_ok($$SELECT pg_temp.add_item('601', '401')$$, 'an operator adds a checklist item to an Alpha Tasking');
SELECT lives_ok($$SELECT pg_temp.add_item('602', '401', 'Brief the medics')$$, 'an operator adds a second item');
SELECT lives_ok($$SELECT pg_temp.add_item('603', '402', 'Bravo checklist')$$, 'an operator adds an item to a Bravo Tasking');
SELECT lives_ok($$SELECT pg_temp.add_item('604', '403', 'Org checklist')$$, 'an operator adds an item to an Organization-level Tasking');

SELECT results_eq(
  $$SELECT position, created_by, updated_by FROM public.calendar_tasking_equipment WHERE tasking_id = pg_temp.id('401') ORDER BY position$$,
  $$VALUES (1, pg_temp.id('2'), pg_temp.id('2')), (2, pg_temp.id('2'), pg_temp.id('2'))$$,
  'equipment is numbered in the order it was added and attributed to the signed-in member');
SELECT results_eq(
  $$SELECT position, done, done_by FROM public.calendar_tasking_checklist_items WHERE tasking_id = pg_temp.id('401') ORDER BY position$$,
  $$VALUES (1, false, NULL::uuid), (2, false, NULL::uuid)$$,
  'checklist items start open, in the order they were added');

-- Attribution, order and completion are the database's to write.
SELECT throws_ok(
  $$INSERT INTO public.calendar_tasking_equipment (organization_id, tasking_id, name, quantity, created_by)
    VALUES (pg_temp.id('101'), pg_temp.id('401'), 'Forged', 1, pg_temp.id('1'))$$,
  '42501', NULL, 'a client cannot name who added equipment');
SELECT throws_ok(
  $$INSERT INTO public.calendar_tasking_equipment (organization_id, tasking_id, name, quantity, position)
    VALUES (pg_temp.id('101'), pg_temp.id('401'), 'Jumped', 1, 1)$$,
  '42501', NULL, 'a client cannot choose the position of new equipment');
SELECT throws_ok($$UPDATE public.calendar_tasking_equipment SET updated_by = pg_temp.id('1') WHERE id = pg_temp.id('501')$$,
  '42501', NULL, 'a client cannot name who last edited equipment');
SELECT throws_ok($$UPDATE public.calendar_tasking_equipment SET position = 9 WHERE id = pg_temp.id('501')$$,
  '42501', NULL, 'a client cannot reposition equipment directly');
SELECT throws_ok($$UPDATE public.calendar_tasking_equipment SET tasking_id = pg_temp.id('402') WHERE id = pg_temp.id('501')$$,
  '42501', NULL, 'a client cannot move equipment to another Tasking');
SELECT throws_ok(
  $$INSERT INTO public.calendar_tasking_checklist_items (organization_id, tasking_id, label, done, done_at, done_by)
    VALUES (pg_temp.id('101'), pg_temp.id('401'), 'Forged', true, now(), pg_temp.id('1'))$$,
  '42501', NULL, 'a client cannot insert a completed item with an attributed completer');
SELECT throws_ok($$UPDATE public.calendar_tasking_checklist_items SET done_by = pg_temp.id('1') WHERE id = pg_temp.id('601')$$,
  '42501', NULL, 'a client cannot write who completed an item');
SELECT throws_ok($$UPDATE public.calendar_tasking_checklist_items SET done_at = now() WHERE id = pg_temp.id('601')$$,
  '42501', NULL, 'a client cannot write when an item was completed');
SELECT throws_ok($$UPDATE public.calendar_tasking_checklist_items SET created_by = pg_temp.id('1') WHERE id = pg_temp.id('601')$$,
  '42501', NULL, 'a client cannot rewrite who added an item');
SELECT throws_ok($$INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, kind) VALUES (pg_temp.id('101'), pg_temp.id('401'), 'equipment_added')$$,
  '42501', NULL, 'a client cannot write Activity');

-- Shape rules.
SELECT throws_ok($$SELECT pg_temp.add_equipment('510', '401', 'Zero', 0)$$, '23514', NULL, 'a quantity is positive');
SELECT throws_ok($$SELECT pg_temp.add_equipment('511', '401', 'Over', 4, 5)$$, '23514', NULL, 'secured cannot exceed the quantity');
SELECT throws_ok($$SELECT pg_temp.add_equipment('512', '401', 'Negative', 4, -1)$$, '23514', NULL, 'secured is not negative');
SELECT throws_ok($$SELECT pg_temp.add_equipment('513', '401', '   ')$$, '23514', NULL, 'equipment needs a name');
SELECT throws_ok($$SELECT pg_temp.add_item('610', '401', '   ')$$, '23514', NULL, 'a checklist item needs a label');
SELECT throws_ok($$UPDATE public.calendar_tasking_equipment SET quantity = 0 WHERE id = pg_temp.id('501')$$, '23514', NULL,
  'a quantity cannot be edited to zero');
SELECT throws_ok($$UPDATE public.calendar_tasking_equipment SET secured_quantity = 5 WHERE id = pg_temp.id('501')$$, '23514', NULL,
  'securing cannot pass the quantity');
SELECT throws_ok(
  $$INSERT INTO public.calendar_tasking_equipment (organization_id, tasking_id, name, quantity)
    VALUES (pg_temp.id('102'), pg_temp.id('401'), 'Cross', 1)$$,
  '42501', NULL, 'an item cannot name another Organization alongside this Tasking');

-- Secure, edit, tick, rename; each records its own Activity.
UPDATE public.calendar_tasking_equipment SET secured_quantity = 4 WHERE id = pg_temp.id('501');
UPDATE public.calendar_tasking_equipment SET name = 'Field litters', quantity = 6 WHERE id = pg_temp.id('501');
UPDATE public.calendar_tasking_equipment SET secured_quantity = 2 WHERE id = pg_temp.id('502');
UPDATE public.calendar_tasking_checklist_items SET done = true WHERE id = pg_temp.id('601');
UPDATE public.calendar_tasking_checklist_items SET label = 'Confirm Range 4 is booked' WHERE id = pg_temp.id('601');
UPDATE public.calendar_tasking_checklist_items SET done = false WHERE id = pg_temp.id('601');
UPDATE public.calendar_tasking_checklist_items SET done = true WHERE id = pg_temp.id('601');
SELECT throws_ok($$UPDATE public.calendar_tasking_equipment SET quantity = 3 WHERE id = pg_temp.id('501')$$, '23514', NULL,
  'a quantity cannot be lowered under the secured count');
SELECT results_eq(
  $$SELECT secured_quantity, quantity, updated_by FROM public.calendar_tasking_equipment WHERE id = pg_temp.id('501')$$,
  $$VALUES (4, 6, pg_temp.id('2'))$$, 'securing and editing equipment is stored and attributed');
SELECT results_eq(
  $$SELECT done, done_by, done_at IS NOT NULL FROM public.calendar_tasking_checklist_items WHERE id = pg_temp.id('601')$$,
  $$VALUES (true, pg_temp.id('2'), true)$$, 'completing an item records who and when, written by the database');
UPDATE public.calendar_tasking_checklist_items SET done = false WHERE id = pg_temp.id('601');
SELECT results_eq(
  $$SELECT done, done_by, done_at FROM public.calendar_tasking_checklist_items WHERE id = pg_temp.id('601')$$,
  $$VALUES (false, NULL::uuid, NULL::timestamptz)$$, 'reopening an item clears who and when');
SELECT is(pg_temp.kinds('401'), ARRAY[
  'equipment_added', 'equipment_added', 'checklist_added', 'checklist_added',
  'equipment_secured', 'equipment_changed', 'equipment_secured',
  'checklist_completed', 'checklist_renamed', 'checklist_reopened', 'checklist_completed', 'checklist_reopened'
], 'each meaningful change records one Activity entry, and a no-op change records none');
SELECT results_eq(
  $$SELECT kind, actor_id, payload FROM public.read_calendar_tasking_activity(pg_temp.id('101'))
    WHERE tasking_id = pg_temp.id('401') AND kind IN ('equipment_changed', 'equipment_secured') ORDER BY id LIMIT 2$$,
  $$VALUES ('equipment_secured'::text, pg_temp.id('2'),
      '{"name":"Litters","quantity":4,"from":1,"to":4}'::jsonb),
    ('equipment_changed'::text, pg_temp.id('2'),
      '{"from":{"name":"Litters","quantity":4},"to":{"name":"Field litters","quantity":6}}'::jsonb)$$,
  'equipment Activity carries the actor and what changed');

-- Order.
SELECT lives_ok($$SELECT pg_temp.reorder('401', 'equipment', ARRAY['502', '501'])$$, 'an operator reorders equipment');
SELECT is(pg_temp.equipment_order('401'), ARRAY['Radios', 'Field litters'], 'equipment follows the new order');
SELECT lives_ok($$SELECT pg_temp.add_equipment('505', '401', 'Stretchers')$$, 'new equipment lands after the reordered list');
SELECT is(pg_temp.equipment_order('401'), ARRAY['Radios', 'Field litters', 'Stretchers'], 'a new requirement goes last');
SELECT lives_ok($$SELECT pg_temp.reorder('401', 'equipment', ARRAY['505', '999', '505'])$$,
  'unknown and repeated ids are ignored');
SELECT is(pg_temp.equipment_order('401'), ARRAY['Stretchers', 'Radios', 'Field litters'],
  'items not listed keep their order after the listed ones');
SELECT lives_ok($$SELECT pg_temp.reorder('401', 'checklist', ARRAY['602', '601'])$$, 'an operator reorders the checklist');
SELECT is(pg_temp.checklist_order('401'), ARRAY['Brief the medics', 'Confirm Range 4 is booked'], 'the checklist follows the new order');
SELECT throws_ok($$SELECT pg_temp.reorder('401', 'tasks', ARRAY[]::text[])$$, '22023', NULL, 'an unknown list is refused');
SELECT is(pg_temp.kinds('401') && ARRAY['equipment_reordered'], false, 'reordering is not a meaningful change');

-- Neither list ever moves the Tasking.
SELECT results_eq($$SELECT status FROM public.calendar_taskings WHERE id = pg_temp.id('401')$$, $$VALUES ('open'::text)$$,
  'securing everything and ticking items leaves the Tasking Open');

-- Removing an item records it.
SELECT lives_ok($$DELETE FROM public.calendar_tasking_equipment WHERE id = pg_temp.id('505')$$, 'an operator removes equipment');
SELECT lives_ok($$DELETE FROM public.calendar_tasking_checklist_items WHERE id = pg_temp.id('602')$$, 'an operator removes a checklist item');
SELECT results_eq(
  $$SELECT kind, actor_id, payload FROM public.read_calendar_tasking_activity(pg_temp.id('101'))
    WHERE tasking_id = pg_temp.id('401') AND kind IN ('equipment_removed', 'checklist_removed') ORDER BY id$$,
  $$VALUES ('equipment_removed'::text, pg_temp.id('2'), '{"name":"Stretchers","quantity":4,"securedQuantity":0}'::jsonb),
    ('checklist_removed'::text, pg_temp.id('2'), '{"label":"Brief the medics"}'::jsonb)$$,
  'a removal records what was removed and who removed it');

-- A Group-scoped operator works only on their Group's Tasking.
SELECT pg_temp.act_as('3');
SELECT lives_ok($$SELECT pg_temp.add_equipment('520', '401', 'Alpha tents')$$, 'an Alpha operator adds equipment to an Alpha Tasking');
SELECT lives_ok($$SELECT pg_temp.add_item('620', '401', 'Alpha item')$$, 'an Alpha operator adds a checklist item to an Alpha Tasking');
SELECT throws_ok($$SELECT pg_temp.add_equipment('521', '402', 'Bravo tents')$$, '42501', NULL,
  'an Alpha operator cannot add equipment to a Bravo Tasking');
SELECT throws_ok($$SELECT pg_temp.add_item('621', '402')$$, '42501', NULL, 'an Alpha operator cannot add a checklist item to a Bravo Tasking');
SELECT throws_ok($$SELECT pg_temp.add_equipment('522', '403', 'Org tents')$$, '42501', NULL,
  'an Alpha operator cannot add equipment to an Organization-level Tasking');
SELECT is((SELECT array_agg(name ORDER BY name) FROM public.calendar_tasking_equipment),
  ARRAY['Alpha tents', 'Field litters', 'Radios'], 'an Alpha operator sees only Alpha equipment');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_checklist_items WHERE tasking_id <> pg_temp.id('401')), 0,
  'an Alpha operator sees no checklist items of other Taskings');
SELECT is((SELECT count(*)::int FROM public.read_calendar_tasking_activity(pg_temp.id('101')) WHERE tasking_id IN (pg_temp.id('402'), pg_temp.id('403'))), 0,
  'an Alpha operator sees no Activity of the hidden Taskings, items included');
WITH changed AS (UPDATE public.calendar_tasking_equipment SET secured_quantity = 4 WHERE id IN (pg_temp.id('503'), pg_temp.id('504')) RETURNING id)
SELECT is((SELECT count(*)::int FROM changed), 0, 'an Alpha operator cannot secure another Group’s equipment');
WITH removed AS (DELETE FROM public.calendar_tasking_equipment WHERE id IN (pg_temp.id('503'), pg_temp.id('504')) RETURNING id)
SELECT is((SELECT count(*)::int FROM removed), 0, 'an Alpha operator cannot remove another Group’s equipment');
WITH changed AS (UPDATE public.calendar_tasking_checklist_items SET done = true WHERE id IN (pg_temp.id('603'), pg_temp.id('604')) RETURNING id)
SELECT is((SELECT count(*)::int FROM changed), 0, 'an Alpha operator cannot complete another Group’s checklist item');
SELECT throws_ok($$SELECT pg_temp.reorder('402', 'equipment', ARRAY['503'])$$, 'P0002', NULL,
  'an Alpha operator cannot reorder a hidden Tasking and learns nothing about it');
SELECT throws_ok($$SELECT pg_temp.reorder('403', 'checklist', ARRAY['604'])$$, 'P0002', NULL,
  'an Alpha operator cannot reorder a hidden Organization-level Tasking');
SELECT throws_ok(
  $$INSERT INTO public.calendar_tasking_equipment (organization_id, tasking_id, name, quantity)
    VALUES (pg_temp.id('101'), pg_temp.id('402'), 'Hidden', 1)$$,
  '42501', NULL, 'an Alpha operator cannot slip equipment under a hidden Tasking');

-- Readers.
SELECT pg_temp.act_as('7');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_equipment), 3, 'an Alpha viewer sees the Alpha equipment');
SELECT throws_ok($$SELECT pg_temp.add_equipment('530', '401')$$, '42501', NULL, 'a viewer cannot add equipment');
SELECT throws_ok($$SELECT pg_temp.add_item('630', '401')$$, '42501', NULL, 'a viewer cannot add a checklist item');
WITH changed AS (UPDATE public.calendar_tasking_equipment SET secured_quantity = 0 WHERE tasking_id = pg_temp.id('401') RETURNING id)
SELECT is((SELECT count(*)::int FROM changed), 0, 'a viewer cannot secure equipment');
WITH changed AS (UPDATE public.calendar_tasking_checklist_items SET done = true WHERE tasking_id = pg_temp.id('401') RETURNING id)
SELECT is((SELECT count(*)::int FROM changed), 0, 'a viewer cannot complete an item');
WITH removed AS (DELETE FROM public.calendar_tasking_equipment WHERE tasking_id = pg_temp.id('401') RETURNING id)
SELECT is((SELECT count(*)::int FROM removed), 0, 'a viewer cannot remove equipment');
SELECT throws_ok($$SELECT pg_temp.reorder('401', 'equipment', ARRAY['502'])$$, '42501', NULL, 'a viewer cannot reorder');

SELECT pg_temp.act_as('4');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_equipment), 5, 'an Organization-wide viewer sees every Tasking’s equipment');
SELECT throws_ok($$SELECT pg_temp.add_equipment('531', '401')$$, '42501', NULL, 'an Organization-wide viewer cannot add equipment');

SELECT pg_temp.act_as('5');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_equipment), 0, 'a member without Calendar access sees no equipment');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_checklist_items), 0, 'a member without Calendar access sees no checklist items');
SELECT throws_ok($$SELECT pg_temp.add_equipment('532', '401')$$, '42501', NULL, 'a member without Calendar access cannot add equipment');

SELECT pg_temp.act_as('6');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_equipment), 0, 'another Organization sees no equipment');
SELECT throws_ok($$SELECT pg_temp.add_item('633', '401')$$, '42501', NULL, 'another Organization cannot add an item here');
SELECT throws_ok($$SELECT pg_temp.reorder('401', 'equipment', ARRAY['502'])$$, 'P0002', NULL, 'another Organization cannot reorder here');

-- A completed or cancelled Tasking is a record.
SELECT pg_temp.act_as('2');
SELECT pg_temp.move('401', 'complete', 'Done');
SELECT throws_ok($$SELECT pg_temp.add_equipment('540', '401')$$, '55000', NULL, 'equipment cannot be added to a Completed Tasking');
SELECT throws_ok($$SELECT pg_temp.add_item('640', '401')$$, '55000', NULL, 'an item cannot be added to a Completed Tasking');
SELECT throws_ok($$UPDATE public.calendar_tasking_equipment SET secured_quantity = 0 WHERE tasking_id = pg_temp.id('401')$$,
  '55000', NULL, 'equipment of a Completed Tasking cannot change, except what was returned');
WITH removed AS (DELETE FROM public.calendar_tasking_checklist_items WHERE tasking_id = pg_temp.id('401') RETURNING id)
SELECT is((SELECT count(*)::int FROM removed), 0, 'items of a Completed Tasking cannot be removed');
SELECT throws_ok($$SELECT pg_temp.reorder('401', 'equipment', ARRAY['502'])$$, '55000', NULL, 'a Completed Tasking cannot be reordered');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_equipment WHERE tasking_id = pg_temp.id('401')), 3,
  'a Completed Tasking keeps its equipment on record');
SELECT pg_temp.move('401', 'reopen');
SELECT lives_ok($$SELECT pg_temp.add_equipment('541', '401', 'After reopen')$$, 'reopening makes the lists editable again');

-- The limit per list.
SELECT lives_ok(
  $$INSERT INTO public.calendar_tasking_equipment (id, organization_id, tasking_id, name, quantity)
    SELECT gen_random_uuid(), pg_temp.id('101'), pg_temp.id('402'), 'Bulk ' || n, 1 FROM generate_series(1, 99) AS n$$,
  'a Tasking fills up to one hundred requirements');
SELECT throws_ok($$SELECT pg_temp.add_equipment('542', '402', 'One too many')$$, '54000', NULL,
  'the hundred and first requirement is refused');
SELECT lives_ok(
  $$INSERT INTO public.calendar_tasking_checklist_items (id, organization_id, tasking_id, label)
    SELECT gen_random_uuid(), pg_temp.id('101'), pg_temp.id('402'), 'Bulk ' || n FROM generate_series(1, 99) AS n$$,
  'a Tasking fills up to one hundred checklist items');
SELECT throws_ok($$SELECT pg_temp.add_item('642', '402', 'One too many')$$, '54000', NULL,
  'the hundred and first checklist item is refused');

-- The switch freezes both lists for every role.
RESET ROLE;
SELECT throws_ok(
  $$INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, kind) VALUES (pg_temp.id('101'), pg_temp.id('401'), 'bogus')$$,
  '23514', NULL, 'Activity still refuses a kind nothing records');
SELECT lives_ok($$INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, kind) VALUES (pg_temp.id('101'), pg_temp.id('401'), 'instructions_changed')$$,
  'Activity keeps the kinds the Tasking itself records');
UPDATE public.organizations SET disabled_features = ARRAY['eventsAndTaskings'] WHERE id = pg_temp.id('101');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('1');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_equipment), 0, 'an owner sees no equipment while the switch is off');
SELECT throws_ok($$SELECT pg_temp.add_equipment('543', '401')$$, '42501', NULL, 'an owner cannot add equipment while the switch is off');
SELECT throws_ok($$SELECT pg_temp.reorder('401', 'equipment', ARRAY['502'])$$, 'P0002', NULL, 'an owner cannot reorder while the switch is off');

-- Deleting an Organization takes its Taskings, items and Activity together.
RESET ROLE;
UPDATE public.organizations SET disabled_features = '{}' WHERE id = pg_temp.id('101');
SELECT lives_ok($$DELETE FROM public.organizations WHERE id = pg_temp.id('101')$$,
  'deleting an Organization is not blocked by its equipment or checklist items');
SELECT is(
  (SELECT count(*)::int FROM public.calendar_tasking_equipment WHERE organization_id = pg_temp.id('101'))
    + (SELECT count(*)::int FROM public.calendar_tasking_checklist_items WHERE organization_id = pg_temp.id('101'))
    + (SELECT count(*)::int FROM public.calendar_tasking_activity WHERE organization_id = pg_temp.id('101')),
  0, 'and nothing of theirs is left behind');

SELECT * FROM finish();
ROLLBACK;
