BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(actor text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE found uuid;
BEGIN
  SELECT id::uuid INTO STRICT found FROM (VALUES
    ('org_wide_configurer', 'c5000000-0000-4000-8000-000000000001'),
    ('group_scoped_configurer', 'c5000000-0000-4000-8000-000000000002'),
    ('org_wide_operator', 'c5000000-0000-4000-8000-000000000003'),
    ('org_wide_viewer', 'c5000000-0000-4000-8000-000000000004'),
    ('bravo_owner', 'c5000000-0000-4000-8000-000000000005'),
    ('alpha_org', 'c5000000-0000-4000-8000-000000000101'),
    ('bravo_org', 'c5000000-0000-4000-8000-000000000102'),
    ('alpha_hq_group', 'c5000000-0000-4000-8000-000000000201'),
    ('alpha_first_platoon', 'c5000000-0000-4000-8000-000000000202'),
    ('alpha_second_platoon', 'c5000000-0000-4000-8000-000000000203'),
    ('alpha_empty_group', 'c5000000-0000-4000-8000-000000000204'),
    ('bravo_hq_group', 'c5000000-0000-4000-8000-000000000211'),
    ('bravo_second_platoon', 'c5000000-0000-4000-8000-000000000212'),
    ('alvarez', 'c5000000-0000-4000-8000-000000000301'),
    ('banks', 'c5000000-0000-4000-8000-000000000302'),
    ('archived_person', 'c5000000-0000-4000-8000-000000000303'),
    ('chen', 'c5000000-0000-4000-8000-000000000304'),
    ('okafor', 'c5000000-0000-4000-8000-000000000305')
  ) AS fixtures(name, id) WHERE name = actor;
  RETURN found;
END; $$;
CREATE FUNCTION pg_temp.act(actor text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', pg_temp.id(actor)::text, true);
END; $$;
CREATE FUNCTION pg_temp.ids(ns text[]) RETURNS text LANGUAGE sql AS $$
  SELECT format('%L::uuid[]', (SELECT coalesce(array_agg(pg_temp.id(n) ORDER BY i), '{}')
    FROM unnest(ns) WITH ORDINALITY AS t(n, i)));
$$;
CREATE FUNCTION pg_temp.order_sql(group_ids text[], expected_ids text[]) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.set_group_order(%L, %s, %s)', pg_temp.id('alpha_org'), pg_temp.ids(group_ids),
    pg_temp.ids(expected_ids));
$$;
CREATE FUNCTION pg_temp.group_names() RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(name ORDER BY sort_order, name, id), '{}') FROM public.groups WHERE organization_id = pg_temp.id('alpha_org');
$$;
CREATE FUNCTION pg_temp.pins(org text DEFAULT 'alpha_org') RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(right(pin.user_id::text, 1) || ':' || g.name ORDER BY pin.user_id, g.name), '{}')
  FROM public.user_pinned_groups AS pin
  JOIN public.groups AS g ON g.organization_id = pin.organization_id AND g.id = pin.group_id
  WHERE pin.organization_id = pg_temp.id(org);
$$;
CREATE FUNCTION pg_temp.members(g text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(last_name ORDER BY last_name), '{}') FROM public.personnel
  WHERE organization_id = pg_temp.id('alpha_org') AND group_id IS NOT DISTINCT FROM pg_temp.id(g);
$$;
CREATE FUNCTION pg_temp.unassigned() RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(last_name ORDER BY last_name), '{}') FROM public.personnel
  WHERE organization_id = pg_temp.id('alpha_org') AND group_id IS NULL;
$$;

INSERT INTO auth.users (id, email)
SELECT pg_temp.id(actor), 'group-editor-' || n || '@example.test'
FROM (VALUES
  ('org_wide_configurer', 1),
  ('group_scoped_configurer', 2),
  ('org_wide_operator', 3),
  ('org_wide_viewer', 4),
  ('bravo_owner', 5)
) AS users(actor, n);
INSERT INTO public.organizations (id, name, created_by) VALUES
(pg_temp.id('alpha_org'), 'Groups Alpha', pg_temp.id('org_wide_configurer')),
(pg_temp.id('bravo_org'), 'Groups Bravo', pg_temp.id('bravo_owner'));
INSERT INTO public.groups (id, organization_id, name, sort_order) VALUES
(pg_temp.id('alpha_hq_group'), pg_temp.id('alpha_org'), 'HQ', 0),
(pg_temp.id('alpha_first_platoon'), pg_temp.id('alpha_org'), '1st Platoon', 1),
(pg_temp.id('alpha_second_platoon'), pg_temp.id('alpha_org'), '2nd Platoon', 2),
(pg_temp.id('alpha_empty_group'), pg_temp.id('alpha_org'), 'Empty', 3),
(pg_temp.id('bravo_hq_group'), pg_temp.id('bravo_org'), 'Bravo HQ', 0),
(pg_temp.id('bravo_second_platoon'), pg_temp.id('bravo_org'), '2nd Platoon', 1);
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
(pg_temp.id('alpha_org'), pg_temp.id('org_wide_configurer'), 'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]),
(pg_temp.id('alpha_org'), pg_temp.id('group_scoped_configurer'), 'member', 'viewer', '{"personnel":"configure"}', 'groups', ARRAY[pg_temp.id('alpha_second_platoon')]),
(pg_temp.id('alpha_org'), pg_temp.id('org_wide_operator'), 'member', 'viewer', '{"personnel":"operate"}', 'organization', ARRAY[]::uuid[]),
(pg_temp.id('alpha_org'), pg_temp.id('org_wide_viewer'), 'member', 'viewer', '{"personnel":"view"}', 'organization', ARRAY[]::uuid[]),
(pg_temp.id('bravo_org'), pg_temp.id('bravo_owner'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, mos, clinic_role, archived_at) VALUES
(pg_temp.id('alvarez'), pg_temp.id('alpha_org'), pg_temp.id('alpha_second_platoon'), 'SGT', 'A', 'Alvarez', 'ge-alvarez', '68W', '', NULL),
(pg_temp.id('banks'), pg_temp.id('alpha_org'), pg_temp.id('alpha_second_platoon'), 'PFC', 'B', 'Banks', 'ge-banks', '68W', '', NULL),
(pg_temp.id('archived_person'), pg_temp.id('alpha_org'), pg_temp.id('alpha_second_platoon'), 'SPC', 'C', 'Archived', 'ge-archived', '68W', '', '2026-01-01'),
(pg_temp.id('chen'), pg_temp.id('alpha_org'), pg_temp.id('alpha_first_platoon'), 'SPC', 'D', 'Chen', 'ge-chen', '68W', '', NULL),
(pg_temp.id('okafor'), pg_temp.id('alpha_org'), pg_temp.id('alpha_hq_group'), 'SSG', 'E', 'Okafor', 'ge-okafor', '68W', '', NULL);
INSERT INTO public.user_pinned_groups (user_id, organization_id, group_id, sort_order) VALUES
(pg_temp.id('org_wide_configurer'), pg_temp.id('alpha_org'), pg_temp.id('alpha_second_platoon'), 0),
(pg_temp.id('org_wide_operator'), pg_temp.id('alpha_org'), pg_temp.id('alpha_second_platoon'), 0),
(pg_temp.id('org_wide_viewer'), pg_temp.id('alpha_org'), pg_temp.id('alpha_hq_group'), 0),
(pg_temp.id('group_scoped_configurer'), pg_temp.id('alpha_org'), pg_temp.id('alpha_second_platoon'), 0),
(pg_temp.id('bravo_owner'), pg_temp.id('bravo_org'), pg_temp.id('bravo_second_platoon'), 0);

SELECT pg_temp.act('org_wide_configurer');
SELECT ok(NOT has_function_privilege('anon', 'public.set_group_order(uuid, uuid[], uuid[], uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.rename_group(uuid, uuid, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.delete_group_with_reassignment(uuid, uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.set_group_order(uuid, uuid[], uuid[], uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.delete_group_with_reassignment(uuid, uuid, uuid)', 'EXECUTE'),
  'only signed-in members can run the Group commands');
SELECT hasnt_trigger('public', 'groups', 'sync_group_pins', 'no trigger rewrites pins on a Group rename');

SELECT pg_temp.act('group_scoped_configurer');
SELECT throws_ok(pg_temp.order_sql(
    ARRAY['alpha_empty_group', 'alpha_second_platoon', 'alpha_first_platoon', 'alpha_hq_group'],
    ARRAY['alpha_hq_group', 'alpha_first_platoon', 'alpha_second_platoon', 'alpha_empty_group']), '42501', NULL,
  'a Group-scoped configurer cannot reorder Groups');
SELECT throws_ok(format('SELECT * FROM public.rename_group(%L, %L, %L)', pg_temp.id('alpha_org'), pg_temp.id('alpha_second_platoon'), 'Second'),
  '42501', NULL, 'a Group-scoped configurer cannot rename their own Group');
SELECT throws_ok(format('SELECT public.delete_group_with_reassignment(%L, %L, NULL)', pg_temp.id('alpha_org'), pg_temp.id('alpha_second_platoon')),
  '42501', NULL, 'a Group-scoped configurer cannot delete their own Group');
SELECT pg_temp.act('org_wide_operator');
SELECT throws_ok(pg_temp.order_sql(
    ARRAY['alpha_empty_group', 'alpha_second_platoon', 'alpha_first_platoon', 'alpha_hq_group'],
    ARRAY['alpha_hq_group', 'alpha_first_platoon', 'alpha_second_platoon', 'alpha_empty_group']), '42501', NULL,
  'an operator cannot reorder Groups');
SELECT throws_ok(format('SELECT public.delete_group_with_reassignment(%L, %L, NULL)', pg_temp.id('alpha_org'), pg_temp.id('alpha_empty_group')),
  '42501', NULL, 'an operator cannot delete a Group');
SELECT pg_temp.act('bravo_owner');
SELECT throws_ok(format('SELECT * FROM public.rename_group(%L, %L, %L)', pg_temp.id('alpha_org'), pg_temp.id('alpha_hq_group'), 'Taken'),
  '42501', NULL, 'another Organization''s owner cannot rename a Group');
SELECT pg_temp.act('org_wide_configurer');
SELECT lives_ok(format('SELECT personnel_private.require_group_manager(%L)', pg_temp.id('alpha_org')),
  'a manager can still check Group authority');
SELECT lives_ok(format('SELECT personnel_private.lock_group_catalog(%L)', pg_temp.id('alpha_org')),
  'a manager can still lock the Group catalog');
SELECT is((SELECT name FROM public.rename_group(pg_temp.id('alpha_org'), pg_temp.id('alpha_hq_group'), 'HQ')), 'HQ',
  'renaming to the saved name leaves the Group unchanged');
SELECT pg_temp.act('org_wide_viewer');
WITH changed AS (
  UPDATE public.groups SET name = 'Taken' WHERE id = pg_temp.id('alpha_hq_group') RETURNING 1
) SELECT is(count(*)::integer, 0, 'RLS refuses a non-manager''s direct Group rename') FROM changed;
SELECT is((SELECT name FROM public.groups WHERE id = pg_temp.id('alpha_hq_group')), 'HQ',
  'a refused direct rename leaves the Group name unchanged');
SELECT is(pg_temp.pins(), ARRAY['4:HQ'], 'an Organization-wide viewer reads only their own pin');
SELECT lives_ok(format('INSERT INTO public.user_pinned_groups (user_id, organization_id, group_id, sort_order) VALUES (%L, %L, %L, 1)',
    pg_temp.id('org_wide_viewer'), pg_temp.id('alpha_org'), pg_temp.id('alpha_first_platoon')),
  'an Organization-wide viewer pins a Group');
SELECT throws_ok(format('INSERT INTO public.user_pinned_groups (user_id, organization_id, group_id, sort_order) VALUES (%L, %L, %L, 2)',
    pg_temp.id('org_wide_viewer'), pg_temp.id('alpha_org'), pg_temp.id('bravo_hq_group')),
  '23503', NULL, 'a pin cannot point at another Organization''s Group');
SELECT throws_ok(format('INSERT INTO public.user_pinned_groups (user_id, organization_id, group_id, sort_order) VALUES (%L, %L, %L, 2)',
    pg_temp.id('org_wide_operator'), pg_temp.id('alpha_org'), pg_temp.id('alpha_empty_group')),
  '42501', NULL, 'a viewer cannot pin for another member');
WITH removed AS (
  DELETE FROM public.user_pinned_groups WHERE group_id = pg_temp.id('alpha_first_platoon') RETURNING 1
) SELECT is(count(*)::integer, 1, 'an Organization-wide viewer unpins their own pin') FROM removed;
SELECT pg_temp.act('group_scoped_configurer');
SELECT is(pg_temp.pins(), ARRAY[]::text[], 'a Group-scoped reader reads none of their saved pins');
SELECT throws_ok(format('INSERT INTO public.user_pinned_groups (user_id, organization_id, group_id, sort_order) VALUES (%L, %L, %L, 1)',
    pg_temp.id('group_scoped_configurer'), pg_temp.id('alpha_org'), pg_temp.id('alpha_first_platoon')),
  '42501', NULL, 'a Group-scoped reader cannot pin a Group');
WITH removed AS (
  DELETE FROM public.user_pinned_groups WHERE organization_id = pg_temp.id('alpha_org') RETURNING 1
) SELECT is(count(*)::integer, 0, 'a Group-scoped reader cannot unpin') FROM removed;
SELECT pg_temp.act('org_wide_configurer');
WITH moved AS (
  UPDATE public.user_pinned_groups SET sort_order = 7 WHERE organization_id = pg_temp.id('alpha_org') RETURNING 1
) SELECT is(count(*)::integer, 1, 'row security alone lets a manager change only their own pins') FROM moved;
SELECT is(pg_temp.group_names(), ARRAY['HQ', '1st Platoon', '2nd Platoon', 'Empty'], 'refused commands kept the order');

SELECT pg_temp.act('org_wide_configurer');
UPDATE public.groups SET sort_order = 0 WHERE organization_id = pg_temp.id('alpha_org');
SELECT lives_ok(pg_temp.order_sql(
    ARRAY['alpha_hq_group', 'alpha_first_platoon', 'alpha_second_platoon', 'alpha_empty_group'],
    ARRAY['alpha_first_platoon', 'alpha_second_platoon', 'alpha_empty_group', 'alpha_hq_group']),
  'equal display positions compare by Group name before id');
SELECT lives_ok(pg_temp.order_sql(
    ARRAY['alpha_second_platoon', 'alpha_hq_group', 'alpha_first_platoon', 'alpha_empty_group'],
    ARRAY['alpha_hq_group', 'alpha_first_platoon', 'alpha_second_platoon', 'alpha_empty_group']),
  'an Organization-wide configurer reorders Groups');
SELECT lives_ok(pg_temp.order_sql(
    ARRAY['alpha_second_platoon', 'alpha_hq_group', 'alpha_first_platoon', 'alpha_empty_group'],
    ARRAY['alpha_hq_group', 'alpha_first_platoon', 'alpha_second_platoon', 'alpha_empty_group']),
  'a replay of the saved order converges');
SELECT throws_ok(pg_temp.order_sql(
    ARRAY['alpha_hq_group', 'alpha_second_platoon', 'alpha_first_platoon', 'alpha_empty_group'],
    ARRAY['alpha_hq_group', 'alpha_first_platoon', 'alpha_second_platoon', 'alpha_empty_group']), 'GRP01', NULL,
  'an order made from a stale read is refused');
SELECT throws_ok(pg_temp.order_sql(
    ARRAY['alpha_second_platoon', 'alpha_hq_group', 'alpha_first_platoon'],
    ARRAY['alpha_second_platoon', 'alpha_hq_group', 'alpha_first_platoon', 'alpha_empty_group']), '22023', NULL,
  'an order that leaves out a Group is refused');
SELECT throws_ok(pg_temp.order_sql(
    ARRAY['alpha_second_platoon', 'alpha_second_platoon', 'alpha_hq_group', 'alpha_first_platoon'],
    ARRAY['alpha_second_platoon', 'alpha_hq_group', 'alpha_first_platoon', 'alpha_empty_group']), '22023', NULL,
  'an order that names a Group twice is refused');
SELECT is(pg_temp.group_names(), ARRAY['2nd Platoon', 'HQ', '1st Platoon', 'Empty'], 'the display order saved');
SELECT pg_temp.act('org_wide_viewer');
SELECT is(pg_temp.pins(), ARRAY['4:HQ'], 'reordering leaves pins unchanged');

SELECT pg_temp.act('org_wide_configurer');
SELECT is((SELECT name FROM public.rename_group(pg_temp.id('alpha_org'), pg_temp.id('alpha_second_platoon'), '  Weapons ')), 'Weapons',
  'a rename trims and returns the saved name');
SELECT throws_ok(format('SELECT * FROM public.rename_group(%L, %L, %L)', pg_temp.id('alpha_org'), pg_temp.id('alpha_hq_group'), '1st Platoon'),
  '23505', NULL, 'a rename to another Group''s name is refused');
SELECT throws_ok(format('SELECT * FROM public.rename_group(%L, %L, %L)', pg_temp.id('alpha_org'), pg_temp.id('alpha_hq_group'), '   '),
  '22023', NULL, 'a blank name is refused');
SELECT throws_ok(format('SELECT * FROM public.rename_group(%L, %L, %L)', pg_temp.id('alpha_org'), pg_temp.id('bravo_hq_group'), 'Mine'),
  'P0002', NULL, 'another Organization''s Group cannot be renamed');
SELECT is(pg_temp.pins(), ARRAY['1:Weapons'], 'the manager''s pin stays on the renamed Group');
SELECT pg_temp.act('org_wide_operator');
SELECT is(pg_temp.pins(), ARRAY['3:Weapons'], 'another member''s pin stays on the renamed Group');
SELECT pg_temp.act('org_wide_viewer');
SELECT is(pg_temp.pins(), ARRAY['4:HQ'], 'a viewer who never pinned the Group keeps their own pin');
SELECT pg_temp.act('bravo_owner');
SELECT is(pg_temp.pins('bravo_org'), ARRAY['5:2nd Platoon'], 'rename leaves another Organization''s pins unchanged');

SELECT ok(NOT has_function_privilege('anon', 'public.move_group(uuid, uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.move_group(uuid, uuid, uuid)', 'EXECUTE'),
  'only signed-in members can move a Group');
SELECT pg_temp.act('group_scoped_configurer');
SELECT throws_ok(format('SELECT * FROM public.move_group(%L, %L, %L)', pg_temp.id('alpha_org'), pg_temp.id('alpha_empty_group'), pg_temp.id('alpha_first_platoon')),
  '42501', NULL, 'a Group-scoped configurer cannot move a Group');
SELECT pg_temp.act('org_wide_operator');
SELECT throws_ok(format('SELECT * FROM public.move_group(%L, %L, %L)', pg_temp.id('alpha_org'), pg_temp.id('alpha_empty_group'), pg_temp.id('alpha_first_platoon')),
  '42501', NULL, 'an operator cannot move a Group');
SELECT pg_temp.act('bravo_owner');
SELECT throws_ok(format('SELECT * FROM public.move_group(%L, %L, %L)', pg_temp.id('alpha_org'), pg_temp.id('alpha_empty_group'), pg_temp.id('alpha_first_platoon')),
  '42501', NULL, 'another Organization''s owner cannot move a Group');
SELECT pg_temp.act('org_wide_configurer');
SELECT results_eq(format('SELECT parent_id, depth, sort_order FROM public.move_group(%L, %L, %L)', pg_temp.id('alpha_org'), pg_temp.id('alpha_empty_group'), pg_temp.id('alpha_first_platoon')),
  format('VALUES (%L::uuid, 2, 0)', pg_temp.id('alpha_first_platoon')), 'a move puts the Group first under a parent with no sub-groups');
SELECT throws_ok(format('SELECT * FROM public.move_group(%L, %L, %L)', pg_temp.id('alpha_org'), pg_temp.id('alpha_first_platoon'), pg_temp.id('alpha_empty_group')),
  '22023', NULL, 'a move under its own sub-group is refused');
SELECT throws_ok(format('SELECT * FROM public.move_group(%L, %L, %L)', pg_temp.id('alpha_org'), pg_temp.id('alpha_empty_group'), pg_temp.id('bravo_hq_group')),
  '23503', NULL, 'a parent in another Organization is refused');
SELECT throws_ok(format('SELECT * FROM public.move_group(%L, %L, NULL)', pg_temp.id('alpha_org'), pg_temp.id('bravo_hq_group')),
  'P0002', NULL, 'another Organization''s Group cannot be moved');
SELECT results_eq(format('SELECT parent_id, depth, sort_order FROM public.move_group(%L, %L)', pg_temp.id('alpha_org'), pg_temp.id('alpha_empty_group')),
  'VALUES (NULL::uuid, 1, 3)', 'a move to the top level puts the Group last there');
SELECT is(pg_temp.group_names(), ARRAY['Weapons', 'HQ', '1st Platoon', 'Empty'], 'moves leave the other Groups in place');

SELECT pg_temp.act('org_wide_configurer');
SELECT throws_ok(format('SELECT public.delete_group_with_reassignment(%L, %L, %L)', pg_temp.id('alpha_org'), pg_temp.id('alpha_second_platoon'),
  pg_temp.id('bravo_hq_group')), 'P0002', NULL, 'a target in another Organization is refused');
SELECT is(pg_temp.members('alpha_second_platoon'), ARRAY['Alvarez', 'Archived', 'Banks'], 'a refused delete moved nobody');
SELECT pg_temp.act('org_wide_configurer');
SELECT is((SELECT public.delete_group_with_reassignment(pg_temp.id('alpha_org'), pg_temp.id('alpha_second_platoon'), pg_temp.id('alpha_first_platoon'))), 3,
  'deleting Weapons moves its three members');
SELECT is(pg_temp.members('alpha_first_platoon'), ARRAY['Alvarez', 'Archived', 'Banks', 'Chen'], 'active and archived members moved');
SELECT is(pg_temp.group_names(), ARRAY['HQ', '1st Platoon', 'Empty'], 'the Group is gone');
SELECT is(pg_temp.pins(), ARRAY[]::text[], 'deleting a Group removes the manager''s pin');
SELECT pg_temp.act('org_wide_operator');
SELECT is(pg_temp.pins(), ARRAY[]::text[], 'deleting a Group removes another member''s pin');
SELECT pg_temp.act('org_wide_viewer');
SELECT is(pg_temp.pins(), ARRAY['4:HQ'], 'deleting a Group removes its pin and preserves an unrelated pin');
SELECT pg_temp.act('bravo_owner');
SELECT is(pg_temp.pins('bravo_org'), ARRAY['5:2nd Platoon'], 'delete leaves another Organization''s pins unchanged');
RESET role;
SELECT is((SELECT count(*)::integer FROM public.user_pinned_groups WHERE user_id = pg_temp.id('group_scoped_configurer')), 0,
  'deleting a Group also removes a Group-scoped reader''s stored pin on it');
SELECT pg_temp.act('org_wide_configurer');
SELECT is((SELECT public.delete_group_with_reassignment(pg_temp.id('alpha_org'), pg_temp.id('alpha_hq_group'), NULL)), 1,
  'deleting HQ to Unassigned moves its one member');
SELECT is((SELECT public.delete_group_with_reassignment(pg_temp.id('alpha_org'), pg_temp.id('alpha_empty_group'), NULL)), 0,
  'an empty Group deletes');
SELECT throws_ok(format('SELECT public.delete_group_with_reassignment(%L, %L, NULL)', pg_temp.id('alpha_org'), pg_temp.id('alpha_empty_group')),
  'P0002', NULL, 'a Group already deleted is not found');
SELECT is(pg_temp.unassigned(), ARRAY['Okafor'], 'the HQ member is Unassigned');
SELECT pg_temp.act('org_wide_viewer');
SELECT is(pg_temp.pins(), ARRAY[]::text[], 'the HQ pin is gone');

SELECT * FROM finish();
ROLLBACK;
