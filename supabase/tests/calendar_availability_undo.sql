-- A removal keeps what it deleted in a private undo record, and the same actor can put it back for a short window.
-- Every behavioural call runs as an ordinary signed-in member. The owner role only seeds fixtures and reads rows back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a590000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.ids(p_suffixes text[]) RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg(pg_temp.id(s)), ARRAY[]::uuid[]) FROM unnest(p_suffixes) AS s;
$$;

-- 1 owner, 2 Organization-wide Calendar operator, 3 Calendar operator for Alpha and Bravo (narrowed later),
-- 4 Calendar viewer, 5 a second Organization-wide Calendar operator, 6 another Organization's owner, 7 no Calendar.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'undo-' || n || '@example.test', now()
FROM generate_series(1, 7) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Undo Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Undo Other', pg_temp.id('6'));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.id('201'), pg_temp.id('101'), 'Alpha'),
  (pg_temp.id('202'), pg_temp.id('101'), 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'viewer', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{"calendar":"operate"}', 'groups',
    ARRAY[pg_temp.id('201'), pg_temp.id('202')]),
  (pg_temp.id('101'), pg_temp.id('4'), 'member', 'viewer', '{"calendar":"view"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('5'), 'member', 'viewer', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('102'), pg_temp.id('6'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('7'), 'member', 'viewer', '{"calendar":"none"}', 'organization', ARRAY[]::uuid[]);
-- 501 and 502 Alpha, 503 Bravo.
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('501'), pg_temp.id('101'), pg_temp.id('201'), 'SPC', 'Ana', 'Adams', 'undo-501'),
  (pg_temp.id('502'), pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Ben', 'Baker', 'undo-502'),
  (pg_temp.id('503'), pg_temp.id('101'), pg_temp.id('202'), 'PFC', 'Cal', 'Cole', 'undo-503');
INSERT INTO public.status_types (id, organization_id, name) VALUES
  (pg_temp.id('601'), pg_temp.id('101'), 'Training'),
  (pg_temp.id('602'), pg_temp.id('101'), 'Leave'),
  (pg_temp.id('603'), pg_temp.id('101'), 'Retiring');

CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
-- Behavioural calls, made by whoever act_as last named, under the role that is set.
CREATE FUNCTION pg_temp.remove(p_ids text[]) RETURNS integer LANGUAGE sql AS $$
  SELECT public.delete_availability_entries(pg_temp.id('101'), pg_temp.ids(p_ids));
$$;
CREATE FUNCTION pg_temp.restore(p_ids text[], p_people text[]) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(right(r.id::text, 3) ORDER BY r.id), ARRAY[]::text[])
  FROM public.restore_availability_entries(pg_temp.id('101'), pg_temp.ids(p_ids), pg_temp.ids(p_people)) AS r;
$$;
CREATE FUNCTION pg_temp.covered(p_tasking text, p_person text) RETURNS boolean LANGUAGE sql AS $$
  SELECT g.covered FROM public.calendar_tasking_availability_gaps(pg_temp.id('101'), pg_temp.id(p_tasking)) AS g
  WHERE g.personnel_id = pg_temp.id(p_person);
$$;
-- Read-backs run as the owner, so they see the columns and the private table that members cannot.
CREATE FUNCTION pg_temp.entry(p_id text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT to_jsonb(e) - 'organization_id' FROM public.availability_entries e WHERE e.id = pg_temp.id(p_id);
$$;
CREATE FUNCTION pg_temp.link(p_id text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT e.set_for_tasking_id FROM public.availability_entries e WHERE e.id = pg_temp.id(p_id);
$$;
CREATE FUNCTION pg_temp.undo_rows(p_id text) RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*) FROM calendar_private.availability_undo u WHERE u.entry_id = pg_temp.id(p_id);
$$;

-- Tasking 401 (Alpha) is staffed with Ana; 402 and 403 only carry links.
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
INSERT INTO public.calendar_taskings (id, organization_id, title, responsible_group_id, suspense_on,
  execution_starts_on, execution_ends_on) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), 'Alpha medics', pg_temp.id('201'), '2030-10-23', '2030-10-19', '2030-10-23'),
  (pg_temp.id('402'), pg_temp.id('101'), 'Alpha range', pg_temp.id('201'), '2031-09-02', '2031-09-01', '2031-09-02'),
  (pg_temp.id('403'), pg_temp.id('101'), 'Alpha drill', pg_temp.id('201'), '2031-10-02', '2031-10-01', '2031-10-02');
SELECT is((SELECT outcome FROM public.save_calendar_tasking_people(
  pg_temp.id('101'), pg_temp.id('401'), pg_temp.ids(ARRAY['501']), ARRAY[]::uuid[], false, 0)),
  'saved', 'Ana is picked for the Alpha Tasking');
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date,
  note, set_for_tasking_id) VALUES
  (pg_temp.id('701'), pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), '2030-10-19', '2030-10-23',
    'covers the task', pg_temp.id('401')),
  (pg_temp.id('713'), pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), '2031-09-01', '2031-09-02',
    NULL, pg_temp.id('402')),
  (pg_temp.id('714'), pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), '2031-10-01', '2031-10-02',
    NULL, pg_temp.id('403'));
RESET ROLE;
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date, note)
VALUES
  (pg_temp.id('702'), pg_temp.id('101'), pg_temp.id('502'), pg_temp.id('601'), '2030-11-01', '2030-11-02', 'original'),
  (pg_temp.id('703'), pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), '2031-01-01', '2031-01-02', NULL),
  (pg_temp.id('704'), pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), '2031-02-01', '2031-02-02', NULL),
  (pg_temp.id('705'), pg_temp.id('101'), pg_temp.id('502'), pg_temp.id('601'), '2031-03-01', '2031-03-05', NULL),
  (pg_temp.id('707'), pg_temp.id('101'), pg_temp.id('502'), pg_temp.id('602'), '2031-04-01', '2031-04-05', NULL),
  (pg_temp.id('709'), pg_temp.id('101'), pg_temp.id('503'), pg_temp.id('601'), '2031-05-01', '2031-05-02', NULL),
  (pg_temp.id('710'), pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), '2031-07-01', '2031-07-02', NULL),
  (pg_temp.id('711'), pg_temp.id('101'), pg_temp.id('503'), pg_temp.id('601'), '2031-08-01', '2031-08-02', NULL),
  (pg_temp.id('712'), pg_temp.id('101'), pg_temp.id('503'), pg_temp.id('601'), '2031-08-05', '2031-08-06', NULL),
  (pg_temp.id('715'), pg_temp.id('101'), pg_temp.id('502'), pg_temp.id('601'), '2031-11-01', '2031-11-02', 'first'),
  (pg_temp.id('716'), pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('603'), '2031-12-01', '2031-12-02', NULL);
UPDATE public.availability_entries SET created_at = '2030-01-01 01:02:03+00' WHERE id::text LIKE '7a590000-%';

-- (a) A Tasking-linked status comes back linked, and the Tasking counts it again.
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
SELECT is(pg_temp.covered('401', '501'), true, 'before the removal the linked status covers the Tasking');
SELECT is(pg_temp.remove(ARRAY['701']), 1, 'the operator removes the linked status');
SELECT is(pg_temp.covered('401', '501'), false, 'after the removal the Tasking has a gap');
SELECT is(pg_temp.undo_rows('701'), 1::bigint, 'the removal kept one undo record');
SELECT is(pg_temp.restore(ARRAY['701'], ARRAY['501']), ARRAY['701'], 'the same operator restores it');
SELECT is(pg_temp.link('701'), pg_temp.id('401'), 'the restored status is linked to its Tasking again');
SELECT is(pg_temp.entry('701'), jsonb_build_object('id', pg_temp.id('701'), 'personnel_id', pg_temp.id('501'),
  'status_type_id', pg_temp.id('601'), 'start_date', '2030-10-19', 'end_date', '2030-10-23', 'note', 'covers the task',
  'created_at', '2030-01-01T01:02:03+00:00', 'set_for_tasking_id', pg_temp.id('401')),
  'the restored row has its id, creation time and every value');
SELECT is(pg_temp.covered('401', '501'), true, 'after the restore the Tasking counts the status as coverage');

-- (k) An Undo is one-shot.
SELECT is(pg_temp.undo_rows('701'), 0::bigint, 'the restore used up the undo record');
SELECT is(pg_temp.restore(ARRAY['701'], ARRAY['501']), ARRAY[]::text[], 'a second restore of the same record restores nothing');
SELECT is((SELECT count(*) FROM public.availability_entries WHERE id = pg_temp.id('701')), 1::bigint,
  'the second restore left a single row');

-- (b) The restore returns the values deleted, not an older copy.
SELECT pg_temp.act_as('5');
UPDATE public.availability_entries SET status_type_id = pg_temp.id('602'), start_date = '2030-11-03',
  end_date = '2030-11-05', note = 'edited by Dee' WHERE id = pg_temp.id('702');
SELECT pg_temp.act_as('2');
SELECT is(pg_temp.remove(ARRAY['702']), 1, 'the first operator removes the entry another member edited');
SELECT is((SELECT jsonb_agg(to_jsonb(r) - 'organization_id' - 'created_at')
  FROM public.restore_availability_entries(pg_temp.id('101'), ARRAY[pg_temp.id('702')], ARRAY[pg_temp.id('502')]) AS r),
  jsonb_build_array(jsonb_build_object('id', pg_temp.id('702'), 'personnel_id', pg_temp.id('502'),
    'status_type_id', pg_temp.id('602'), 'start_date', '2030-11-03', 'end_date', '2030-11-05',
    'note', 'edited by Dee')),
  'the restore returns the edited type, dates and note');

-- (c) Another actor cannot restore it.
SELECT is(pg_temp.remove(ARRAY['703']), 1, 'the first operator removes a status');
SELECT pg_temp.act_as('5');
SELECT is(pg_temp.restore(ARRAY['703'], ARRAY['501']), ARRAY[]::text[], 'a second operator cannot restore it');
SELECT is(pg_temp.undo_rows('703'), 1::bigint, 'the attempt left the first operator''s record alone');
SELECT pg_temp.act_as('2');
SELECT is(pg_temp.restore(ARRAY['703'], ARRAY['501']), ARRAY['703'], 'the first operator still restores it');

-- (d) An expired record does not restore.
SELECT is(pg_temp.remove(ARRAY['704']), 1, 'the operator removes a status that will expire');
RESET ROLE;
UPDATE calendar_private.availability_undo SET expires_at = now() - interval '1 second'
WHERE entry_id = pg_temp.id('704');
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.restore(ARRAY['704'], ARRAY['501']), ARRAY[]::text[], 'an expired record does not restore');
SELECT is(pg_temp.remove(ARRAY['799']), 0, 'a later removal finds nothing to remove');
SELECT is(pg_temp.undo_rows('704'), 0::bigint, 'and purges the expired record');
SELECT is(pg_temp.entry('704'), NULL::jsonb, 'the expired removal stays removed');

-- (e) A Person who now has the same status over those dates is not given a second one.
SELECT is(pg_temp.remove(ARRAY['705', '707']), 2, 'the operator removes two statuses');
RESET ROLE;
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date) VALUES
  (pg_temp.id('706'), pg_temp.id('101'), pg_temp.id('502'), pg_temp.id('601'), '2031-03-04', '2031-03-08'),
  (pg_temp.id('708'), pg_temp.id('101'), pg_temp.id('502'), pg_temp.id('601'), '2031-04-01', '2031-04-05');
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.restore(ARRAY['705', '707'], ARRAY['502', '502']), ARRAY['707'],
  'only the removal with no same-status overlap comes back');
SELECT is(pg_temp.entry('705'), NULL::jsonb, 'the overlapped removal is not restored');
SELECT is(pg_temp.undo_rows('705'), 0::bigint, 'the overlapped record is used up');

-- (f) An id that exists again is not restored over.
SELECT is(pg_temp.remove(ARRAY['709']), 1, 'the operator removes a status whose id will be reused');
RESET ROLE;
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date, note)
VALUES (pg_temp.id('709'), pg_temp.id('101'), pg_temp.id('502'), pg_temp.id('601'), '2031-06-01', '2031-06-02',
  'came back');
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.restore(ARRAY['709'], ARRAY['503']), ARRAY[]::text[], 'an id that exists again is not restored');
SELECT is(pg_temp.entry('709') ->> 'note', 'came back', 'the row that holds the id is unchanged');
SELECT is(pg_temp.undo_rows('709'), 0::bigint, 'the record for a reused id is used up');

-- A second removal of the same id replaces its record with the values deleted last.
SELECT is(pg_temp.remove(ARRAY['715']), 1, 'the operator removes a status');
RESET ROLE;
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date, note)
VALUES (pg_temp.id('715'), pg_temp.id('101'), pg_temp.id('502'), pg_temp.id('601'), '2031-11-01', '2031-11-02',
  'second');
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.remove(ARRAY['715']), 1, 'the operator removes the same id again');
SELECT is(pg_temp.undo_rows('715'), 1::bigint, 'the id still has one record');
SELECT is(pg_temp.restore(ARRAY['715'], ARRAY['502']), ARRAY['715'], 'the record restores');
SELECT is(pg_temp.entry('715') ->> 'note', 'second', 'the restore brings back the last deleted values');

-- (g) A claim for another Person, and a Person outside the caller's scope, do not restore.
SELECT is(pg_temp.remove(ARRAY['710']), 1, 'the operator removes a status for Ana');
SELECT is(pg_temp.restore(ARRAY['710'], ARRAY['502']), ARRAY[]::text[], 'a claim naming another Person restores nothing');
SELECT is(pg_temp.entry('710'), NULL::jsonb, 'the mismatched claim did not put the status back');
SELECT pg_temp.act_as('3');
SELECT is(pg_temp.remove(ARRAY['711']), 1, 'an Alpha and Bravo operator removes a Bravo status');
RESET ROLE;
UPDATE public.organization_memberships SET access_scope_group_ids = ARRAY[pg_temp.id('201')]
WHERE organization_id = pg_temp.id('101') AND user_id = pg_temp.id('3');
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.restore(ARRAY['711'], ARRAY['503']), ARRAY[]::text[],
  'a Person who has left the operator''s scope is not restored');
SELECT is(pg_temp.entry('711'), NULL::jsonb, 'the out-of-scope status stays removed');
SELECT is(pg_temp.remove(ARRAY['712']), 0, 'the narrowed operator removes nothing for the Bravo Person');
SELECT is(pg_temp.undo_rows('712'), 0::bigint, 'a removal that deleted nothing kept no record');
SELECT ok(pg_temp.entry('712') IS NOT NULL, 'the Bravo status is still saved');

-- (h) A link to a Tasking the caller cannot see comes back; one to a deleted Tasking comes back empty.
SELECT is(pg_temp.remove(ARRAY['713']), 1, 'the Alpha operator removes a status linked to an Alpha Tasking');
SELECT pg_temp.act_as('2');
UPDATE public.calendar_taskings SET responsible_group_id = pg_temp.id('202') WHERE id = pg_temp.id('402');
SELECT pg_temp.act_as('3');
SELECT throws_ok(format($$ INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id,
  start_date, end_date, set_for_tasking_id) VALUES (%L, %L, %L, %L, '2031-09-01', '2031-09-02', %L) $$,
  pg_temp.id('713'), pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), pg_temp.id('402')),
  '42501', 'Tasking is unavailable for this Organization',
  'while its undo record waits, a direct add of the removed status cannot test which hidden Tasking it named');
SELECT is(pg_temp.restore(ARRAY['713'], ARRAY['501']), ARRAY['713'], 'the status restores');
SELECT is(pg_temp.link('713'), pg_temp.id('402'),
  'it keeps its link to a Tasking the operator cannot see, which the server held');
SELECT throws_ok(format($$ INSERT INTO public.availability_entries (organization_id, personnel_id, status_type_id,
  start_date, end_date, set_for_tasking_id) VALUES (%L, %L, %L, '2031-09-10', '2031-09-11', %L) $$,
  pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), pg_temp.id('402')),
  '42501', 'Tasking is unavailable for this Organization',
  'a direct write still cannot name a Tasking the operator cannot see');
SELECT set_config('calendar_private.restoring_availability', 'on', true);
SELECT throws_ok(format($$ INSERT INTO public.availability_entries (organization_id, personnel_id, status_type_id,
  start_date, end_date, set_for_tasking_id) VALUES (%L, %L, %L, '2031-09-10', '2031-09-11', %L) $$,
  pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), pg_temp.id('402')),
  '42501', 'Tasking is unavailable for this Organization',
  'a setting the caller chooses does not let a direct add name a Tasking the operator cannot see');
SELECT throws_ok(format($$ UPDATE public.availability_entries SET set_for_tasking_id = %L WHERE id = %L $$,
  pg_temp.id('402'), pg_temp.id('703')),
  '42501', 'Tasking is unavailable for this Organization',
  'nor a direct edit');
SELECT is(pg_temp.link('703'), NULL::uuid, 'the edited status is still unlinked');
SELECT pg_temp.act_as('2');
SELECT is(pg_temp.remove(ARRAY['714', '716']), 2,
  'the operator removes a status linked to a Tasking and the last status of a type, both about to be deleted');
RESET ROLE;
DELETE FROM public.calendar_taskings WHERE id = pg_temp.id('403');
DELETE FROM public.status_types WHERE id = pg_temp.id('603');
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.restore(ARRAY['714', '716'], ARRAY['501', '501']), ARRAY['714'],
  'the status restores, and the one whose type is gone stays removed without failing the batch');
SELECT is(pg_temp.link('714'), NULL::uuid, 'it comes back without the link to a deleted Tasking');

-- (l) Input and caller checks.
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries(NULL,
  ARRAY['7a590000-0000-4000-8000-000000000701']::uuid[], ARRAY['7a590000-0000-4000-8000-000000000501']::uuid[]) $$,
  '42501', 'Calendar availability restore is not allowed', 'a null Organization is denied');
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  NULL, ARRAY['7a590000-0000-4000-8000-000000000501']::uuid[]) $$,
  '22023', 'Invalid Calendar availability restore', 'a null ID array is rejected');
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  ARRAY['7a590000-0000-4000-8000-000000000701']::uuid[], NULL) $$,
  '22023', 'Invalid Calendar availability restore', 'a null Person array is rejected');
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  '{}'::uuid[], '{}'::uuid[]) $$,
  '22023', 'Invalid Calendar availability restore', 'empty arrays are rejected');
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  ARRAY['7a590000-0000-4000-8000-000000000701']::uuid[],
  ARRAY['7a590000-0000-4000-8000-000000000501', '7a590000-0000-4000-8000-000000000502']::uuid[]) $$,
  '22023', 'Invalid Calendar availability restore', 'arrays of different lengths are rejected');
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  ARRAY['7a590000-0000-4000-8000-000000000701', NULL]::uuid[],
  ARRAY['7a590000-0000-4000-8000-000000000501', '7a590000-0000-4000-8000-000000000501']::uuid[]) $$,
  '22023', 'Invalid Calendar availability restore', 'a null ID among valid IDs is rejected');
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  ARRAY['7a590000-0000-4000-8000-000000000701']::uuid[],
  ARRAY['7a590000-0000-4000-8000-000000000501', NULL]::uuid[]) $$,
  '22023', 'Invalid Calendar availability restore', 'a null Person among valid Persons is rejected');
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  array_fill('7a590000-0000-4000-8000-000000000701'::uuid, ARRAY[501]),
  array_fill('7a590000-0000-4000-8000-000000000501'::uuid, ARRAY[501])) $$,
  '22023', 'Invalid Calendar availability restore', '501 IDs exceed the batch limit');
SELECT lives_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  array_fill('7a590000-0000-4000-8000-000000000701'::uuid, ARRAY[500]),
  array_fill('7a590000-0000-4000-8000-000000000501'::uuid, ARRAY[500])) $$, '500 IDs are accepted');
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  ARRAY['not-a-uuid']::uuid[], ARRAY['7a590000-0000-4000-8000-000000000501']::uuid[]) $$,
  '22P02', NULL, 'a malformed UUID never reaches the restore');
SELECT pg_temp.act_as('4');
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  ARRAY['7a590000-0000-4000-8000-000000000701']::uuid[], ARRAY['7a590000-0000-4000-8000-000000000501']::uuid[]) $$,
  '42501', 'Calendar availability restore is not allowed', 'Calendar view cannot restore');
SELECT pg_temp.act_as('7');
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  ARRAY['7a590000-0000-4000-8000-000000000701']::uuid[], ARRAY['7a590000-0000-4000-8000-000000000501']::uuid[]) $$,
  '42501', 'Calendar availability restore is not allowed', 'a member without the Calendar lane cannot restore');
SELECT pg_temp.act_as('6');
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  ARRAY['7a590000-0000-4000-8000-000000000701']::uuid[], ARRAY['7a590000-0000-4000-8000-000000000501']::uuid[]) $$,
  '42501', 'Calendar availability restore is not allowed', 'another Organization''s owner cannot restore');
SELECT set_config('request.jwt.claims', '{}', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  ARRAY['7a590000-0000-4000-8000-000000000701']::uuid[], ARRAY['7a590000-0000-4000-8000-000000000501']::uuid[]) $$,
  '42501', 'Calendar availability restore is not allowed', 'an authenticated role without a user cannot restore');

-- (i) Only signed-in members can execute either function.
RESET ROLE;
SELECT ok(has_function_privilege('authenticated', 'public.restore_availability_entries(uuid,uuid[],uuid[])', 'EXECUTE'),
  'authenticated members can reach the restore');
SELECT ok(NOT has_function_privilege('anon', 'public.restore_availability_entries(uuid,uuid[],uuid[])', 'EXECUTE'),
  'anonymous callers cannot execute the restore');
SELECT ok(NOT has_function_privilege('service_role', 'public.restore_availability_entries(uuid,uuid[],uuid[])', 'EXECUTE'),
  'the service role cannot execute the restore');
SELECT ok(NOT has_function_privilege('anon', 'public.delete_availability_entries(uuid,uuid[])', 'EXECUTE'),
  'anonymous callers still cannot execute the removal');
SELECT ok(NOT has_function_privilege('service_role', 'public.delete_availability_entries(uuid,uuid[])', 'EXECUTE'),
  'the service role still cannot execute the removal');
SELECT ok(has_function_privilege('authenticated', 'public.delete_availability_entries(uuid,uuid[])', 'EXECUTE'),
  'authenticated members still reach the removal');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) entry
  WHERE p.oid IN ('public.restore_availability_entries(uuid,uuid[],uuid[])'::regprocedure,
      'public.delete_availability_entries(uuid,uuid[])'::regprocedure)
    AND entry.grantee = 0 AND entry.privilege_type = 'EXECUTE'
), 'PUBLIC has no execution grant on either function');
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  ARRAY['7a590000-0000-4000-8000-000000000701']::uuid[], ARRAY['7a590000-0000-4000-8000-000000000501']::uuid[]) $$,
  '42501', NULL, 'an anonymous restore call is denied');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT * FROM public.restore_availability_entries('7a590000-0000-4000-8000-000000000101',
  ARRAY['7a590000-0000-4000-8000-000000000701']::uuid[], ARRAY['7a590000-0000-4000-8000-000000000501']::uuid[]) $$,
  '42501', NULL, 'a service role restore call is denied');
RESET ROLE;

-- (j) No signed-in role can read the Tasking link through this path.
SELECT ok(NOT has_table_privilege('authenticated', 'calendar_private.availability_undo', 'SELECT'),
  'members cannot select the undo record');
SELECT ok(NOT has_table_privilege('authenticated', 'calendar_private.availability_undo', 'INSERT'),
  'members cannot insert an undo record');
SELECT ok(NOT has_table_privilege('authenticated', 'calendar_private.availability_undo', 'UPDATE'),
  'members cannot change an undo record');
SELECT ok(NOT has_table_privilege('authenticated', 'calendar_private.availability_undo', 'DELETE'),
  'members cannot delete an undo record');
SELECT ok(NOT has_table_privilege('anon', 'calendar_private.availability_undo', 'SELECT')
  AND NOT has_table_privilege('service_role', 'calendar_private.availability_undo', 'SELECT'),
  'neither the anonymous nor the service role can select the undo record');
SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'calendar_private.availability_undo'::regclass), true,
  'the undo record has row level security on');
SELECT is((SELECT array_agg(name ORDER BY ord) FROM (
    SELECT n.name, n.ord FROM pg_proc p,
      LATERAL unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS n(name, mode, ord)
    WHERE p.oid = 'public.restore_availability_entries(uuid,uuid[],uuid[])'::regprocedure AND n.mode = 't'
  ) AS result_columns),
  ARRAY['id', 'organization_id', 'personnel_id', 'status_type_id', 'start_date', 'end_date', 'note', 'created_at'],
  'the restore returns the public columns and never set_for_tasking_id');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
SELECT throws_ok($$ SELECT count(*) FROM calendar_private.availability_undo $$, '42501', NULL,
  'a member cannot read the undo record');
SELECT throws_ok($$ SELECT set_for_tasking_id FROM public.availability_entries $$, '42501', NULL,
  'a member still cannot select the Tasking link');
SELECT throws_ok($$ SELECT id FROM public.availability_entries WHERE set_for_tasking_id IS NOT NULL $$, '42501', NULL,
  'a member still cannot filter on the Tasking link');
RESET ROLE;

-- (m) A Person deleted for good keeps no removed status.
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('504'), pg_temp.id('101'), pg_temp.id('201'), 'PVT', 'Dee', 'Dunn', 'undo-504');
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date, note)
VALUES (pg_temp.id('717'), pg_temp.id('101'), pg_temp.id('504'), pg_temp.id('601'), '2032-01-01', '2032-01-02',
  'private note');
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.remove(ARRAY['717']), 1, 'the operator removes a status of a Person about to be deleted');
RESET ROLE;
SELECT is(pg_temp.undo_rows('717'), 1::bigint, 'the removal kept an undo record');
DELETE FROM public.personnel WHERE id = pg_temp.id('504');
SELECT is(pg_temp.undo_rows('717'), 0::bigint, 'deleting the Person deletes the undo record with it');

SELECT * FROM finish();
ROLLBACK;
