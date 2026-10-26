-- Availability gaps name the picked People, among those the caller may write Availability for, whose entries
-- together leave an execution day uncovered. Every call below runs as an ordinary signed-in member.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a580000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;

-- 1 owner, 2 Organization-wide Calendar operator, 3 Alpha-scoped Calendar operator,
-- 4 Organization-wide Calendar viewer, 5 member without Calendar, 6 another Organization's owner.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'gaps-' || n || '@example.test', now()
FROM generate_series(1, 6) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Gaps Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Gaps Other', pg_temp.id('6'));
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
  (pg_temp.id('102'), pg_temp.id('6'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);
-- 501 and 502 Alpha, 503 Bravo, 504 ungrouped.
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('501'), pg_temp.id('101'), pg_temp.id('201'), 'SPC', 'Ana', 'Adams', 'gaps-501'),
  (pg_temp.id('502'), pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Ben', 'Baker', 'gaps-502'),
  (pg_temp.id('503'), pg_temp.id('101'), pg_temp.id('202'), 'PFC', 'Cal', 'Cole', 'gaps-503'),
  (pg_temp.id('504'), pg_temp.id('101'), NULL, 'CPT', 'Dee', 'Diaz', 'gaps-504');
INSERT INTO public.status_types (id, organization_id, name) VALUES (pg_temp.id('601'), pg_temp.id('101'), 'Training');
-- The work runs 19 to 23 Oct. 501: adjacent entries cover it. 502: overlapping entries stop at the 21st.
-- 503: one entry covers it and a nested one adds nothing. 504: nothing.
INSERT INTO public.availability_entries (organization_id, personnel_id, status_type_id, start_date, end_date) VALUES
  (pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), '2030-10-18', '2030-10-20'),
  (pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), '2030-10-21', '2030-10-25'),
  (pg_temp.id('101'), pg_temp.id('502'), pg_temp.id('601'), '2030-10-19', '2030-10-20'),
  (pg_temp.id('101'), pg_temp.id('502'), pg_temp.id('601'), '2030-10-20', '2030-10-21'),
  (pg_temp.id('101'), pg_temp.id('503'), pg_temp.id('601'), '2030-10-01', '2030-10-30'),
  (pg_temp.id('101'), pg_temp.id('503'), pg_temp.id('601'), '2030-10-20', '2030-10-21');

CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.ids(p_suffixes text[]) RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg(pg_temp.id(s)), ARRAY[]::uuid[]) FROM unnest(p_suffixes) AS s;
$$;
CREATE FUNCTION pg_temp.pick(p_tasking text, p_people text[]) RETURNS text LANGUAGE sql AS $$
  SELECT outcome FROM public.save_calendar_tasking_people(
    pg_temp.id('101'), pg_temp.id(p_tasking), pg_temp.ids(p_people), ARRAY[]::uuid[], false, 0);
$$;
CREATE FUNCTION pg_temp.gaps(p_tasking text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(right(personnel_id::text, 3) ORDER BY personnel_id), ARRAY[]::text[])
  FROM public.calendar_tasking_availability_gaps(pg_temp.id('101'), pg_temp.id(p_tasking));
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
INSERT INTO public.calendar_taskings (id, organization_id, title, responsible_group_id, suspense_on,
  execution_starts_on, execution_ends_on) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), 'Alpha medics', pg_temp.id('201'), '2030-10-23', '2030-10-19', '2030-10-23'),
  (pg_temp.id('402'), pg_temp.id('101'), 'Graders', NULL, '2030-10-23', '2030-10-19', '2030-10-23'),
  (pg_temp.id('403'), pg_temp.id('101'), 'Undated', pg_temp.id('201'), '2030-10-23', NULL, NULL);
SELECT is(pg_temp.pick('401', ARRAY['501', '502']), 'saved', 'two Alpha People are picked');
SELECT is(pg_temp.pick('402', ARRAY['501', '502', '503', '504']), 'saved', 'four People are picked for Organization-level work');
SELECT is(pg_temp.pick('403', ARRAY['501']), 'saved', 'a Tasking with no execution dates is staffed');

SELECT is(pg_temp.gaps('402'), ARRAY['502', '504'],
  'an Organization-wide operator is told who is not covered, merging adjacent, overlapping and nested entries');
SELECT is(pg_temp.gaps('401'), ARRAY['502'], 'a Group Tasking reports its own picks');
SELECT is(pg_temp.gaps('403'), ARRAY[]::text[], 'dates are needed before anything is uncovered');

SELECT pg_temp.act_as('3');
SELECT is(pg_temp.gaps('401'), ARRAY['502'], 'an Alpha operator is told about Alpha People');
SELECT is(pg_temp.gaps('402'), ARRAY[]::text[], 'an Alpha operator learns nothing about Organization-level work');

SELECT pg_temp.act_as('4');
SELECT is(pg_temp.gaps('402'), ARRAY[]::text[], 'a Calendar viewer is told nothing, since they cannot set Availability');
SELECT pg_temp.act_as('5');
SELECT is(pg_temp.gaps('402'), ARRAY[]::text[], 'a member without Calendar is told nothing');
SELECT pg_temp.act_as('6');
SELECT is(pg_temp.gaps('402'), ARRAY[]::text[], 'another Organization is told nothing even with the Tasking id');

-- A pick under review commits nobody, and covering the days clears a gap.
RESET ROLE;
UPDATE public.personnel SET archived_at = now() WHERE id = pg_temp.id('504');
INSERT INTO public.availability_entries (organization_id, personnel_id, status_type_id, start_date, end_date)
VALUES (pg_temp.id('101'), pg_temp.id('502'), pg_temp.id('601'), '2030-10-22', '2030-10-23');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
SELECT is(pg_temp.gaps('402'), ARRAY[]::text[], 'an archived pick and a newly covered Person leave nothing to set');

SELECT lives_ok($$SELECT * FROM public.calendar_tasking_availability_gaps(pg_temp.id('101'), pg_temp.id('402'))$$,
  'the read runs for a signed-in member');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.calendar_tasking_availability_gaps(pg_temp.id('101'), pg_temp.id('402'))$$,
  '42501', NULL, 'anonymous callers cannot execute the read');

RESET ROLE;
DELETE FROM public.availability_entries WHERE personnel_id = pg_temp.id('502') AND start_date = '2030-10-22';
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
SELECT is(pg_temp.gaps('402'), ARRAY['502'], 'removing the entry opens the gap again');
RESET ROLE;
UPDATE public.organizations SET disabled_features = ARRAY['eventsAndTaskings'] WHERE id = pg_temp.id('101');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
SELECT is(pg_temp.gaps('402'), ARRAY[]::text[], 'nothing is read while the switch is off');

SELECT * FROM finish();
ROLLBACK;
