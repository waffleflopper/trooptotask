BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('c5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act(actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', pg_temp.id(actor)::text, true);
END; $$;
CREATE FUNCTION pg_temp.ids(ns integer[]) RETURNS text LANGUAGE sql AS $$
  SELECT format('%L::uuid[]', (SELECT coalesce(array_agg(pg_temp.id(n) ORDER BY i), '{}')
    FROM unnest(ns) WITH ORDINALITY AS t(n, i)));
$$;
CREATE FUNCTION pg_temp.order_sql(group_ids integer[], expected_ids integer[]) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.set_group_order(%L, %s, %s)', pg_temp.id(101), pg_temp.ids(group_ids),
    pg_temp.ids(expected_ids));
$$;
CREATE FUNCTION pg_temp.group_names() RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(name ORDER BY sort_order, name, id), '{}') FROM public.groups WHERE organization_id = pg_temp.id(101);
$$;
CREATE FUNCTION pg_temp.pins(org integer DEFAULT 101) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(right(user_id::text, 1) || ':' || group_name ORDER BY user_id, group_name), '{}')
  FROM public.user_pinned_groups WHERE organization_id = pg_temp.id(org);
$$;
CREATE FUNCTION pg_temp.members(g integer) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(last_name ORDER BY last_name), '{}') FROM public.personnel
  WHERE organization_id = pg_temp.id(101) AND group_id IS NOT DISTINCT FROM pg_temp.id(g);
$$;
CREATE FUNCTION pg_temp.unassigned() RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(last_name ORDER BY last_name), '{}') FROM public.personnel
  WHERE organization_id = pg_temp.id(101) AND group_id IS NULL;
$$;

INSERT INTO auth.users (id, email)
SELECT pg_temp.id(n), 'group-editor-' || n || '@example.test' FROM generate_series(1, 5) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
(pg_temp.id(101), 'Groups Alpha', pg_temp.id(1)),
(pg_temp.id(102), 'Groups Bravo', pg_temp.id(5));
INSERT INTO public.groups (id, organization_id, name, sort_order) VALUES
(pg_temp.id(201), pg_temp.id(101), 'HQ', 0),
(pg_temp.id(202), pg_temp.id(101), '1st Platoon', 1),
(pg_temp.id(203), pg_temp.id(101), '2nd Platoon', 2),
(pg_temp.id(204), pg_temp.id(101), 'Empty', 3),
(pg_temp.id(211), pg_temp.id(102), 'Bravo HQ', 0),
(pg_temp.id(212), pg_temp.id(102), '2nd Platoon', 1);
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
(pg_temp.id(101), pg_temp.id(1), 'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]),
(pg_temp.id(101), pg_temp.id(2), 'member', 'viewer', '{"personnel":"configure"}', 'groups', ARRAY[pg_temp.id(203)]),
(pg_temp.id(101), pg_temp.id(3), 'member', 'viewer', '{"personnel":"operate"}', 'organization', ARRAY[]::uuid[]),
(pg_temp.id(101), pg_temp.id(4), 'member', 'viewer', '{"personnel":"view"}', 'organization', ARRAY[]::uuid[]),
(pg_temp.id(102), pg_temp.id(5), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, mos, clinic_role, archived_at) VALUES
(pg_temp.id(301), pg_temp.id(101), pg_temp.id(203), 'SGT', 'A', 'Alvarez', 'ge-alvarez', '68W', '', NULL),
(pg_temp.id(302), pg_temp.id(101), pg_temp.id(203), 'PFC', 'B', 'Banks', 'ge-banks', '68W', '', NULL),
(pg_temp.id(303), pg_temp.id(101), pg_temp.id(203), 'SPC', 'C', 'Archived', 'ge-archived', '68W', '', '2026-01-01'),
(pg_temp.id(304), pg_temp.id(101), pg_temp.id(202), 'SPC', 'D', 'Chen', 'ge-chen', '68W', '', NULL),
(pg_temp.id(305), pg_temp.id(101), pg_temp.id(201), 'SSG', 'E', 'Okafor', 'ge-okafor', '68W', '', NULL);
INSERT INTO public.user_pinned_groups (user_id, organization_id, group_name, sort_order) VALUES
(pg_temp.id(1), pg_temp.id(101), '2nd Platoon', 0),
(pg_temp.id(3), pg_temp.id(101), '2nd Platoon', 0),
(pg_temp.id(4), pg_temp.id(101), 'HQ', 0),
(pg_temp.id(4), pg_temp.id(101), 'Weapons', 1),
(pg_temp.id(5), pg_temp.id(102), '2nd Platoon', 0),
(pg_temp.id(5), pg_temp.id(102), 'Weapons', 1);

SELECT pg_temp.act(1);
SELECT ok(NOT has_function_privilege('anon', 'public.set_group_order(uuid, uuid[], uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.rename_group(uuid, uuid, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.delete_group_with_reassignment(uuid, uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.set_group_order(uuid, uuid[], uuid[])', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.delete_group_with_reassignment(uuid, uuid, uuid)', 'EXECUTE'),
  'only signed-in members can run the Group commands');
SELECT ok(NOT has_function_privilege('anon', 'personnel_private.sync_group_pins()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'personnel_private.sync_group_pins()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'personnel_private.sync_group_pins()', 'EXECUTE'),
  'API roles cannot execute the privileged pin trigger');

SELECT pg_temp.act(2);
SELECT throws_ok(pg_temp.order_sql(ARRAY[204, 203, 202, 201], ARRAY[201, 202, 203, 204]), '42501', NULL,
  'a Group-scoped configurer cannot reorder Groups');
SELECT throws_ok(format('SELECT * FROM public.rename_group(%L, %L, %L)', pg_temp.id(101), pg_temp.id(203), 'Second'),
  '42501', NULL, 'a Group-scoped configurer cannot rename their own Group');
SELECT throws_ok(format('SELECT public.delete_group_with_reassignment(%L, %L, NULL)', pg_temp.id(101), pg_temp.id(203)),
  '42501', NULL, 'a Group-scoped configurer cannot delete their own Group');
SELECT pg_temp.act(3);
SELECT throws_ok(pg_temp.order_sql(ARRAY[204, 203, 202, 201], ARRAY[201, 202, 203, 204]), '42501', NULL,
  'an operator cannot reorder Groups');
SELECT throws_ok(format('SELECT public.delete_group_with_reassignment(%L, %L, NULL)', pg_temp.id(101), pg_temp.id(204)),
  '42501', NULL, 'an operator cannot delete a Group');
SELECT pg_temp.act(5);
SELECT throws_ok(format('SELECT * FROM public.rename_group(%L, %L, %L)', pg_temp.id(101), pg_temp.id(201), 'Taken'),
  '42501', NULL, 'another Organization''s owner cannot rename a Group');
SELECT pg_temp.act(1);
SELECT throws_ok('SELECT personnel_private.sync_group_pins()', '42501', NULL,
  'an authenticated manager cannot execute the pin trigger');
SELECT throws_ok($$SELECT personnel_private.carry_group_pins('c5000000-0000-4000-8000-000000000101', 'Weapons', 'HQ')$$,
  '42883', NULL, 'the former helper cannot carry another viewer''s leftover pin');
SELECT throws_ok($$SELECT personnel_private.carry_group_pins('c5000000-0000-4000-8000-000000000101', 'Weapons', NULL)$$,
  '42883', NULL, 'the former helper cannot delete another viewer''s leftover pin');
SELECT lives_ok(format('SELECT personnel_private.require_group_manager(%L)', pg_temp.id(101)),
  'a manager can still check Group authority');
SELECT lives_ok(format('SELECT personnel_private.lock_group_catalog(%L)', pg_temp.id(101)),
  'a manager can still lock the Group catalog');
SELECT is((SELECT name FROM public.rename_group(pg_temp.id(101), pg_temp.id(201), 'HQ')), 'HQ',
  'renaming to the saved name leaves the Group unchanged');
UPDATE public.groups SET name = name WHERE organization_id = pg_temp.id(101);
SELECT pg_temp.act(4);
SELECT is(pg_temp.pins(), ARRAY['4:HQ', '4:Weapons'],
  'calls without a Group rename or delete keep both existing and leftover pins');
WITH changed AS (
  UPDATE public.groups SET name = 'Taken' WHERE id = pg_temp.id(201) RETURNING 1
) SELECT is(count(*)::integer, 0, 'RLS refuses a non-manager''s direct Group rename') FROM changed;
SELECT is((SELECT name FROM public.groups WHERE id = pg_temp.id(201)), 'HQ',
  'a refused direct rename leaves the Group name unchanged');
SELECT is(pg_temp.pins(), ARRAY['4:HQ', '4:Weapons'],
  'a refused direct rename leaves the viewer''s pins unchanged');
SELECT pg_temp.act(1);
WITH moved AS (
  UPDATE public.user_pinned_groups SET group_name = 'Mine' WHERE organization_id = pg_temp.id(101) RETURNING 1
) SELECT is(count(*)::integer, 1, 'row security alone lets a manager move only their own pins') FROM moved;
UPDATE public.user_pinned_groups SET group_name = '2nd Platoon' WHERE group_name = 'Mine';
SELECT is(pg_temp.group_names(), ARRAY['HQ', '1st Platoon', '2nd Platoon', 'Empty'], 'refused commands kept the order');

SELECT pg_temp.act(1);
UPDATE public.groups SET sort_order = 0 WHERE organization_id = pg_temp.id(101);
SELECT lives_ok(pg_temp.order_sql(ARRAY[201, 202, 203, 204], ARRAY[202, 203, 204, 201]),
  'equal display positions compare by Group name before id');
SELECT lives_ok(pg_temp.order_sql(ARRAY[203, 201, 202, 204], ARRAY[201, 202, 203, 204]),
  'an Organization-wide configurer reorders Groups');
SELECT lives_ok(pg_temp.order_sql(ARRAY[203, 201, 202, 204], ARRAY[201, 202, 203, 204]),
  'a replay of the saved order converges');
SELECT throws_ok(pg_temp.order_sql(ARRAY[201, 203, 202, 204], ARRAY[201, 202, 203, 204]), 'GRP01', NULL,
  'an order made from a stale read is refused');
SELECT throws_ok(pg_temp.order_sql(ARRAY[203, 201, 202], ARRAY[203, 201, 202, 204]), '22023', NULL,
  'an order that leaves out a Group is refused');
SELECT throws_ok(pg_temp.order_sql(ARRAY[203, 203, 201, 202], ARRAY[203, 201, 202, 204]), '22023', NULL,
  'an order that names a Group twice is refused');
SELECT is(pg_temp.group_names(), ARRAY['2nd Platoon', 'HQ', '1st Platoon', 'Empty'], 'the display order saved');
SELECT pg_temp.act(4);
SELECT is(pg_temp.pins(), ARRAY['4:HQ', '4:Weapons'], 'reordering leaves existing and leftover pins unchanged');

SELECT pg_temp.act(1);
INSERT INTO public.user_pinned_groups (user_id, organization_id, group_name, sort_order)
VALUES (pg_temp.id(1), pg_temp.id(101), 'Weapons', 1);
SELECT is((SELECT name FROM public.rename_group(pg_temp.id(101), pg_temp.id(203), '  Weapons ')), 'Weapons',
  'a rename trims and returns the saved name');
SELECT throws_ok(format('SELECT * FROM public.rename_group(%L, %L, %L)', pg_temp.id(101), pg_temp.id(201), '1st Platoon'),
  '23505', NULL, 'a rename to another Group''s name is refused');
SELECT throws_ok(format('SELECT * FROM public.rename_group(%L, %L, %L)', pg_temp.id(101), pg_temp.id(201), '   '),
  '22023', NULL, 'a blank name is refused');
SELECT throws_ok(format('SELECT * FROM public.rename_group(%L, %L, %L)', pg_temp.id(101), pg_temp.id(211), 'Mine'),
  'P0002', NULL, 'another Organization''s Group cannot be renamed');
SELECT is(pg_temp.pins(), ARRAY['1:Weapons'], 'the manager''s old pin follows the rename without duplicates');
SELECT pg_temp.act(3);
SELECT is(pg_temp.pins(), ARRAY['3:Weapons'], 'another member''s old pin follows the rename');
SELECT pg_temp.act(4);
SELECT is(pg_temp.pins(), ARRAY['4:HQ', '4:Weapons'], 'a viewer without an old pin keeps both existing pins');
SELECT pg_temp.act(5);
SELECT is(pg_temp.pins(102), ARRAY['5:2nd Platoon', '5:Weapons'], 'rename leaves another Organization''s pins unchanged');

SELECT pg_temp.act(1);
SELECT throws_ok(format('SELECT public.delete_group_with_reassignment(%L, %L, %L)', pg_temp.id(101), pg_temp.id(203),
  pg_temp.id(211)), 'P0002', NULL, 'a target in another Organization is refused');
SELECT is(pg_temp.members(203), ARRAY['Alvarez', 'Archived', 'Banks'], 'a refused delete moved nobody');
SELECT pg_temp.act(1);
SELECT is((SELECT public.delete_group_with_reassignment(pg_temp.id(101), pg_temp.id(203), pg_temp.id(202))), 3,
  'deleting Weapons moves its three members');
SELECT is(pg_temp.members(202), ARRAY['Alvarez', 'Archived', 'Banks', 'Chen'], 'active and archived members moved');
SELECT is(pg_temp.group_names(), ARRAY['HQ', '1st Platoon', 'Empty'], 'the Group is gone');
SELECT is(pg_temp.pins(), ARRAY[]::text[], 'deleting a Group removes the manager''s pin');
SELECT pg_temp.act(3);
SELECT is(pg_temp.pins(), ARRAY[]::text[], 'deleting a Group removes another member''s pin');
SELECT pg_temp.act(4);
SELECT is(pg_temp.pins(), ARRAY['4:HQ'], 'deleting a Group removes its pin and preserves an unrelated pin');
SELECT pg_temp.act(5);
SELECT is(pg_temp.pins(102), ARRAY['5:2nd Platoon', '5:Weapons'], 'delete leaves another Organization''s pins unchanged');
SELECT pg_temp.act(1);
SELECT is((SELECT public.delete_group_with_reassignment(pg_temp.id(101), pg_temp.id(201), NULL)), 1,
  'deleting HQ to Unassigned moves its one member');
SELECT is((SELECT public.delete_group_with_reassignment(pg_temp.id(101), pg_temp.id(204), NULL)), 0,
  'an empty Group deletes');
SELECT throws_ok(format('SELECT public.delete_group_with_reassignment(%L, %L, NULL)', pg_temp.id(101), pg_temp.id(204)),
  'P0002', NULL, 'a Group already deleted is not found');
SELECT is(pg_temp.unassigned(), ARRAY['Okafor'], 'the HQ member is Unassigned');
SELECT pg_temp.act(4);
SELECT is(pg_temp.pins(), ARRAY[]::text[], 'the HQ pin is gone');

SELECT * FROM finish();
ROLLBACK;
