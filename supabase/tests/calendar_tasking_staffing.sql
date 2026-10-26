-- Staffing picks People for a Tasking from its roster, replaces the whole
-- selection at once against a revision, keeps picks that stop qualifying under
-- review, and names picked People only to readers whose scope covers them.
-- Every staffing call below runs as an ordinary signed-in member.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a540000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;

-- 1 owner, 2 Organization-wide Calendar operator, 3 Alpha-scoped Calendar operator,
-- 4 Organization-wide Calendar viewer, 5 member without Calendar, 6 another Organization's owner,
-- 7 Alpha-scoped Calendar viewer.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'staffing-' || n || '@example.test', now()
FROM generate_series(1, 7) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Staffing Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Staffing Other', pg_temp.id('6'));
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
  (pg_temp.id('101'), pg_temp.id('7'), 'member', 'viewer', '{"calendar":"view"}', 'groups', ARRAY[pg_temp.id('201')]);
-- 501 and 502 Alpha, 503 Bravo, 504 ungrouped, 505 archived Alpha, 506 another Organization.
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  (pg_temp.id('501'), pg_temp.id('101'), pg_temp.id('201'), 'SPC', 'Ana', 'Adams', 'staffing-501', NULL),
  (pg_temp.id('502'), pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Ben', 'Baker', 'staffing-502', NULL),
  (pg_temp.id('503'), pg_temp.id('101'), pg_temp.id('202'), 'PFC', 'Cal', 'Cole', 'staffing-503', NULL),
  (pg_temp.id('504'), pg_temp.id('101'), NULL, 'CPT', 'Dee', 'Diaz', 'staffing-504', NULL),
  (pg_temp.id('505'), pg_temp.id('101'), pg_temp.id('201'), 'SPC', 'Eve', 'Ellis', 'staffing-505', now()),
  (pg_temp.id('506'), pg_temp.id('102'), pg_temp.id('203'), 'SPC', 'Fay', 'Ford', 'staffing-506', NULL);
INSERT INTO public.status_types (id, organization_id, name) VALUES (pg_temp.id('601'), pg_temp.id('101'), 'Leave');
INSERT INTO public.availability_entries (organization_id, personnel_id, status_type_id, start_date, end_date)
VALUES (pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), '2030-10-18', '2030-10-20');

CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.ids(p_suffixes text[]) RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg(pg_temp.id(s)), ARRAY[]::uuid[]) FROM unnest(p_suffixes) AS s;
$$;
CREATE FUNCTION pg_temp.save(
  p_tasking text, p_people text[], p_revision integer, p_kept text[] DEFAULT ARRAY[]::text[],
  p_remove_outside boolean DEFAULT false
) RETURNS text LANGUAGE sql AS $$
  SELECT outcome || ':' || revision FROM public.save_calendar_tasking_people(
    pg_temp.id('101'), pg_temp.id(p_tasking), pg_temp.ids(p_people), pg_temp.ids(p_kept), p_remove_outside, p_revision);
$$;
CREATE FUNCTION pg_temp.picks(p_tasking text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(right(personnel_id::text, 3) || CASE WHEN review_since IS NULL THEN '' ELSE '?' END
    ORDER BY personnel_id), ARRAY[]::text[])
  FROM public.calendar_tasking_participants WHERE tasking_id = pg_temp.id(p_tasking);
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
INSERT INTO public.calendar_taskings (id, organization_id, title, responsible_group_id, suspense_on,
  execution_starts_on, execution_ends_on) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), 'Provide trauma-lane medics', pg_temp.id('201'), '2030-10-23',
    '2030-10-19', '2030-10-23'),
  (pg_temp.id('402'), pg_temp.id('101'), 'Provide graders', NULL, '2030-10-23', '2030-10-19', '2030-10-23'),
  (pg_temp.id('403'), pg_temp.id('101'), 'Bravo range detail', pg_temp.id('202'), '2030-10-23', NULL, NULL),
  (pg_temp.id('404'), pg_temp.id('101'), 'Alpha litter carry', pg_temp.id('201'), '2030-10-22',
    '2030-10-21', '2030-10-22');

-- Organization-wide operators staff Group Taskings from the Group and Organization-level work from everyone.
SELECT is(pg_temp.save('401', ARRAY['501', '502'], 0), 'saved:1', 'an Organization-wide operator staffs an Alpha Tasking');
SELECT is(pg_temp.picks('401'), ARRAY['501', '502'], 'both picks are stored once');
SELECT results_eq(
  $$SELECT DISTINCT selected_by FROM public.calendar_tasking_participants WHERE tasking_id = pg_temp.id('401')$$,
  $$VALUES (pg_temp.id('2'))$$,
  'a pick is attributed to the signed-in member');
SELECT is(pg_temp.save('401', ARRAY['501', '502'], 0), 'unchanged:1', 'retrying a landed save changes nothing');
SELECT is(pg_temp.picks('401'), ARRAY['501', '502'], 'and adds no duplicate rows');
SELECT is(pg_temp.save('401', ARRAY['501'], 0), 'conflict:1', 'a different save from an old revision is refused');
SELECT is(pg_temp.picks('401'), ARRAY['501', '502'], 'and writes nothing');
SELECT is(pg_temp.save('402', ARRAY['503', '504'], 0), 'saved:1',
  'Organization-level work is staffed across Groups, including ungrouped People');
SELECT throws_ok($$SELECT pg_temp.save('401', ARRAY['501', '502', '503'], 1)$$, '23514', NULL,
  'a Group Tasking cannot pick from another Group');
SELECT throws_ok($$SELECT pg_temp.save('401', ARRAY['501', '505'], 1)$$, '23514', NULL,
  'an archived Person cannot be newly picked');
SELECT throws_ok($$SELECT pg_temp.save('402', ARRAY['503', '504', '506'], 1)$$, '23514', NULL,
  'another Organization''s Person cannot be picked');
SELECT throws_ok($$SELECT pg_temp.save('401', ARRAY['501', '501'], 1)$$, '22023', NULL, 'the same Person cannot be picked twice');
SELECT is(
  (SELECT array_agg(kind ORDER BY id) FROM public.calendar_tasking_activity WHERE tasking_id = pg_temp.id('401')),
  ARRAY['created', 'staffing_changed'], 'one staffing change is recorded per saved selection');

-- Group-scoped operators staff only their Group's Taskings, and only from that Group.
SELECT pg_temp.act_as('3');
SELECT is(pg_temp.save('401', ARRAY['501'], 1), 'saved:2', 'an Alpha operator changes the Alpha selection');
SELECT throws_ok($$SELECT pg_temp.save('401', ARRAY['501', '503'], 2)$$, '23514', NULL,
  'an Alpha operator cannot pick a hidden Bravo Person through the API');
SELECT throws_ok($$SELECT pg_temp.save('402', ARRAY['504'], 1)$$, 'P0002', NULL,
  'an Alpha operator cannot find Organization-level work to staff');
SELECT throws_ok($$SELECT pg_temp.save('403', ARRAY['503'], 0)$$, 'P0002', NULL,
  'an Alpha operator cannot find a Bravo Tasking to staff');
SELECT throws_ok(
  $$INSERT INTO public.calendar_tasking_participants (organization_id, tasking_id, personnel_id)
    VALUES (pg_temp.id('101'), pg_temp.id('401'), pg_temp.id('502'))$$,
  '42501', NULL, 'a client cannot insert a pick directly');
SELECT throws_ok(
  $$UPDATE public.calendar_tasking_participants SET selected_by = pg_temp.id('1'), review_since = NULL$$,
  '42501', NULL, 'a client cannot rewrite who picked or clear a review');
SELECT throws_ok($$DELETE FROM public.calendar_tasking_participants$$, '42501', NULL, 'a client cannot delete picks');
SELECT throws_ok($$UPDATE public.calendar_taskings SET staffing_revision = 9 WHERE id = pg_temp.id('401')$$,
  '42501', NULL, 'a client cannot set the staffing revision');

-- Readers without operation access cannot staff.
SELECT pg_temp.act_as('4');
SELECT throws_ok($$SELECT pg_temp.save('401', ARRAY[]::text[], 2)$$, '42501', NULL, 'a Calendar viewer cannot staff');
SELECT pg_temp.act_as('7');
SELECT throws_ok($$SELECT pg_temp.save('401', ARRAY[]::text[], 2)$$, '42501', NULL, 'an Alpha viewer cannot staff');
SELECT pg_temp.act_as('5');
SELECT throws_ok($$SELECT pg_temp.save('401', ARRAY[]::text[], 2)$$, 'P0002', NULL,
  'a member without Calendar cannot find the Tasking');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_people(pg_temp.id('101'), pg_temp.id('401'))), 0,
  'and reads no picks');
SELECT pg_temp.act_as('6');
SELECT throws_ok($$SELECT pg_temp.save('401', ARRAY[]::text[], 2)$$, 'P0002', NULL,
  'another Organization''s owner cannot find the Tasking');

-- Advisories show other commitments over the execution dates; hidden work stays anonymous.
SELECT pg_temp.act_as('2');
SELECT is(pg_temp.save('402', ARRAY['501', '503', '504'], 1), 'saved:2', 'an Alpha Person is also picked as a grader');
SELECT is(pg_temp.save('404', ARRAY['501'], 0), 'saved:1', 'and for the litter carry');
SELECT pg_temp.act_as('3');
SELECT results_eq(
  $$SELECT kind, label, starts_on, ends_on, other_tasking_id
    FROM public.calendar_tasking_advisories(pg_temp.id('101'), pg_temp.id('401'))$$,
  $$VALUES
    ('availability'::text, 'Leave'::text, '2030-10-18'::date, '2030-10-20'::date, NULL::uuid),
    ('tasking', 'Alpha litter carry', '2030-10-21', '2030-10-22', pg_temp.id('404')),
    ('tasking', NULL, NULL, NULL, NULL)$$,
  'an Alpha operator sees Leave, a visible Alpha commitment and an anonymous Organization commitment');
SELECT is(
  (SELECT count(*)::int FROM public.calendar_tasking_advisories(pg_temp.id('101'), pg_temp.id('401'))
   WHERE personnel_id = pg_temp.id('503')), 0,
  'an Alpha operator gets no advisories about Bravo People');
SELECT pg_temp.act_as('2');
SELECT ok(
  (SELECT bool_and(other_tasking_id IS NOT NULL) FROM public.calendar_tasking_advisories(pg_temp.id('101'), pg_temp.id('401'))
   WHERE kind = 'tasking'),
  'an Organization-wide operator sees every conflicting Tasking');
SELECT lives_ok($$SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('404'), 'complete', NULL)$$,
  'the litter carry is completed');
SELECT is(
  (SELECT count(*)::int FROM public.calendar_tasking_advisories(pg_temp.id('101'), pg_temp.id('401'))
   WHERE other_tasking_id = pg_temp.id('404')), 0,
  'a Completed Tasking commits nobody');
SELECT pg_temp.act_as('4');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_advisories(pg_temp.id('101'), pg_temp.id('401'))), 0,
  'a viewer reads no advisories');

-- Staffing a closed Tasking is refused; resubmitting its stored selection is harmless.
SELECT pg_temp.act_as('2');
SELECT throws_ok($$SELECT pg_temp.save('404', ARRAY[]::text[], 1)$$, '55000', NULL,
  'a Completed Tasking keeps its staffing');
SELECT is(pg_temp.save('404', ARRAY['501'], 0), 'unchanged:1', 'resubmitting the stored selection is a no-op');

-- A pick that stops qualifying is kept under review until someone removes or keeps it.
RESET ROLE;
UPDATE public.personnel SET group_id = pg_temp.id('202') WHERE id = pg_temp.id('501');
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.picks('401'), ARRAY['501?'], 'moving a picked Person out of the Group flags the pick');
SELECT is(pg_temp.picks('402'), ARRAY['501', '503', '504'], 'an Organization-level pick does not depend on the Group');
SELECT results_eq(
  $$SELECT picked, needs_review, outside_scope FROM public.calendar_tasking_staffing(pg_temp.id('101'), ARRAY[pg_temp.id('401')])$$,
  $$VALUES (0, 1, 0)$$, 'a flagged pick leaves the picked count');
SELECT pg_temp.act_as('7');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_participants), 0,
  'an Alpha viewer cannot read the pick of a Person now in Bravo');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_people(pg_temp.id('101'), pg_temp.id('401'))), 0,
  'nor their name');
SELECT is((SELECT count(*)::int FROM public.calendar_person_labels(pg_temp.id('101'), ARRAY[pg_temp.id('501')])), 0,
  'nor a label for them in Activity');
SELECT results_eq(
  $$SELECT picked, needs_review, outside_scope FROM public.calendar_tasking_staffing(pg_temp.id('101'), ARRAY[pg_temp.id('401')])$$,
  $$VALUES (0, 1, 1)$$, 'the Alpha viewer sees only that one pick sits outside their Groups');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_staffing(pg_temp.id('101'), ARRAY[pg_temp.id('402')])), 0,
  'and no staffing for Organization-level work they cannot see');
SELECT pg_temp.act_as('3');
SELECT is(pg_temp.save('401', ARRAY[]::text[], 2), 'unchanged:2',
  'an Alpha operator''s save keeps the pick they cannot name');
SELECT pg_temp.act_as('4');
SELECT results_eq(
  $$SELECT last_name, group_id, review_since IS NOT NULL FROM public.calendar_tasking_people(pg_temp.id('101'), pg_temp.id('401'))$$,
  $$VALUES ('Adams'::text, pg_temp.id('202'), true)$$, 'an Organization-wide viewer sees the flagged pick by name');

RESET ROLE;
UPDATE public.personnel SET group_id = pg_temp.id('201') WHERE id = pg_temp.id('501');
UPDATE public.personnel SET archived_at = now() WHERE id = pg_temp.id('503');
UPDATE public.personnel SET archived_at = NULL WHERE id = pg_temp.id('503');
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.picks('401'), ARRAY['501?'], 'moving the Person back does not clear the review');
SELECT is(pg_temp.picks('402'), ARRAY['501', '503?', '504'], 'archiving flags a pick and restoring does not clear it');

SELECT pg_temp.act_as('3');
SELECT is(pg_temp.save('401', ARRAY['501'], 2, ARRAY['501']), 'saved:3', 'an Alpha operator keeps the reviewed pick');
SELECT is(pg_temp.picks('401'), ARRAY['501'], 'keeping clears the review');
SELECT pg_temp.act_as('2');
SELECT is(pg_temp.save('402', ARRAY['501', '504'], 2), 'saved:3', 'removing a flagged pick resolves it');
RESET ROLE;
UPDATE public.personnel SET archived_at = now() WHERE id = pg_temp.id('504');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.save('402', ARRAY['501', '504'], 3, ARRAY['504'])$$, '23514', NULL,
  'an archived pick cannot be kept');
SELECT is(pg_temp.save('402', ARRAY['501', '504', '502'], 3), 'saved:4', 'a pick under review may stay while others change');
SELECT is(pg_temp.picks('402'), ARRAY['501', '502', '504?'], 'and stays flagged');

SELECT lives_ok($$UPDATE public.calendar_taskings SET responsible_group_id = pg_temp.id('202') WHERE id = pg_temp.id('401')$$,
  'an Organization-wide operator reroutes the Alpha Tasking to Bravo');
SELECT is(pg_temp.picks('401'), ARRAY['501?'], 'rerouting flags the picks the new Group does not hold');

-- Permanent deletion of a referenced Person or Group is refused and explained.
SELECT pg_temp.act_as('7');
SELECT results_eq(
  $$SELECT tasking_id, title FROM public.calendar_deletion_references(pg_temp.id('101'), pg_temp.id('502'), NULL)$$,
  $$VALUES (NULL::uuid, NULL::text)$$, 'a reader sees a hidden referencing Tasking only as a row to count');
SELECT pg_temp.act_as('2');
SELECT results_eq(
  $$SELECT tasking_id, title FROM public.calendar_deletion_references(pg_temp.id('101'), NULL, pg_temp.id('201'))$$,
  $$VALUES (pg_temp.id('404'), 'Alpha litter carry'::text)$$, 'an Organization-wide reader sees the Group''s Tasking');
SELECT lives_ok($$INSERT INTO public.calendar_taskings (id, organization_id, title, responsible_group_id, suspense_on)
  VALUES (pg_temp.id('405'), pg_temp.id('101'), 'Alpha barracks detail', pg_temp.id('201'), '2030-11-02')$$,
  'an Organization-wide operator adds another Alpha Tasking');
SELECT is(pg_temp.save('405', ARRAY['501'], 0), 'saved:1', 'and picks an Alpha Person for it');
RESET ROLE;
UPDATE public.personnel SET group_id = pg_temp.id('202') WHERE id = pg_temp.id('501');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('3');
SELECT is(pg_temp.save('405', ARRAY[]::text[], 1, ARRAY[]::text[], true), 'saved:2',
  'an Alpha operator explicitly removes the pick now outside their Groups');
SELECT is(pg_temp.picks('405'), ARRAY[]::text[], 'and it is gone');
SELECT pg_temp.act_as('7');
SELECT is((SELECT count(*)::int FROM public.calendar_deletion_references(pg_temp.id('101'), pg_temp.id('501'), NULL)), 0,
  'an Alpha reader learns nothing about the Taskings of a Person who left their Groups');
SELECT pg_temp.act_as('6');
SELECT is((SELECT count(*)::int FROM public.calendar_deletion_references(pg_temp.id('101'), pg_temp.id('502'), NULL)), 0,
  'another Organization learns nothing');
SELECT pg_temp.act_as('1');
RESET ROLE;
UPDATE public.personnel SET archived_at = now() - interval '10 years' WHERE id IN (pg_temp.id('502'), pg_temp.id('505'));
SET CONSTRAINTS public.calendar_tasking_participants_personnel_fkey IMMEDIATE;
SELECT throws_ok($$DELETE FROM public.personnel WHERE id = pg_temp.id('502')$$, '23503', NULL,
  'a picked Person cannot be permanently deleted');
SET CONSTRAINTS public.calendar_tasking_participants_personnel_fkey DEFERRED;
SET LOCAL ROLE service_role;
SELECT is(
  public.delete_expired_personnel(pg_temp.id('101'), pg_temp.ids(ARRAY['502', '505']), now() - interval '1 year'), 1,
  'retention deletes only the expired Person nobody picked');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('1');
SELECT throws_ok($$SELECT public.delete_group_with_reassignment(pg_temp.id('101'), pg_temp.id('201'), NULL)$$, '23503', NULL,
  'a Group responsible for a Tasking cannot be deleted');

-- The switch freezes staffing for every role.
RESET ROLE;
UPDATE public.organizations SET disabled_features = ARRAY['eventsAndTaskings'] WHERE id = pg_temp.id('101');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('1');
SELECT throws_ok($$SELECT pg_temp.save('402', ARRAY[]::text[], 4)$$, 'P0002', NULL, 'staffing is frozen while the switch is off');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_participants), 0, 'and picks are hidden');

RESET ROLE;
SELECT lives_ok($$DELETE FROM public.organizations WHERE id = pg_temp.id('101')$$,
  'deleting an Organization removes its People, Taskings and picks together');
SELECT is((SELECT count(*)::int FROM public.calendar_tasking_participants WHERE organization_id = pg_temp.id('101')), 0,
  'no pick survives its Organization');

SELECT * FROM finish();
ROLLBACK;
