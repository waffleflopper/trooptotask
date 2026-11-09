BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SET LOCAL TIME ZONE 'UTC';

CREATE FUNCTION pg_temp.u(n bigint) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('e2075000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.act(n integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.u(n)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;

INSERT INTO auth.users (id, email) VALUES (pg_temp.u(1), 'archived-live-work@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.u(101), 'Archived Work', pg_temp.u(1));
INSERT INTO public.groups (id, organization_id, name) VALUES (pg_temp.u(201), pg_temp.u(101), 'Alpha');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES (pg_temp.u(101), pg_temp.u(1), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at)
SELECT pg_temp.u(n), pg_temp.u(101), pg_temp.u(201), 'SPC', 'Live', 'Work ' || n, 'archived-live-work-' || n,
  CASE n WHEN 304 THEN '2029-01-01T00:00:00Z'::timestamptz WHEN 305 THEN '2020-01-01T00:00:00Z'::timestamptz END
FROM generate_series(301, 305) AS n;
INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES (pg_temp.u(401), pg_temp.u(101), 'New Arrival');
INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, template_id, started_at, status, cancelled_at) VALUES
  (pg_temp.u(701), pg_temp.u(101), pg_temp.u(301), pg_temp.u(401), '2029-01-01', 'in_progress', NULL),
  (pg_temp.u(702), pg_temp.u(101), pg_temp.u(302), pg_temp.u(401), '2029-01-01', 'cancelled', '2029-01-02T00:00:00Z'),
  (pg_temp.u(703), pg_temp.u(101), pg_temp.u(302), pg_temp.u(401), '2029-01-03', 'in_progress', NULL);
INSERT INTO public.onboarding_step_progress (id, organization_id, onboarding_id, step_name, step_type, sort_order, completed, active)
VALUES (pg_temp.u(801), pg_temp.u(101), pg_temp.u(701), 'Paperwork', 'checkbox', 0, false, true);
INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, status, created_by)
VALUES (pg_temp.u(1101), pg_temp.u(101), pg_temp.u(301), 'Open item', 'open', 'fixture');

-- An archive cancels the Person's in-progress packet with its reason, and restore leaves it cancelled.
SELECT pg_temp.act(1);
SET LOCAL ROLE authenticated;
SELECT is(public.archive_personnel(pg_temp.u(101), ARRAY[pg_temp.u(301)], '2030-02-03T04:05:06Z'), 1, 'the owner archives the Person');
RESET ROLE;
SELECT results_eq(
  $$ SELECT status, cancelled_at, cancellation_reason FROM public.personnel_onboardings WHERE id = pg_temp.u(701) $$,
  $$ VALUES ('cancelled'::text, '2030-02-03T04:05:06Z'::timestamptz, 'archived'::text) $$,
  'archive cancels the in-progress packet at the archive time, because of the archive');
SELECT results_eq(
  $$ SELECT details FROM public.audit_logs WHERE action = 'onboarding.cancelled' AND resource_id = pg_temp.u(701) $$,
  $$ VALUES ('{"template": "New Arrival", "reason": "archived"}'::jsonb) $$,
  'the cancellation audit says the archive caused it');

SET LOCAL ROLE service_role;
SELECT public.update_personnel_artifact(pg_temp.u(1), pg_temp.u(101), pg_temp.u(301), 'personnel_follow_ups', pg_temp.u(1101),
  jsonb_build_object('status', 'archived', 'archived_at', '2030-03-01T00:00:00Z', 'archived_by', pg_temp.u(1)));
RESET ROLE;
SELECT is((SELECT archived_at FROM public.personnel_follow_ups WHERE id = pg_temp.u(1101)), '2030-02-03T04:05:06Z'::timestamptz,
  'a later archive of an archived Follow-Up keeps the Person''s archive time');

SELECT pg_temp.act(1);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ UPDATE public.personnel_onboardings SET status = 'in_progress' WHERE id = pg_temp.u(701) $$,
  '55000', 'This person is archived. Restore them before onboarding them.', 'an archived Person cannot have a packet reopened');
SELECT throws_ok(
  $$ UPDATE public.personnel_onboardings SET cancellation_reason = NULL WHERE id = pg_temp.u(701) $$,
  '42501', NULL, 'a signed-in member cannot set or clear the cancellation reason');
SELECT is(public.restore_personnel(pg_temp.u(101), pg_temp.u(301)), true, 'the owner restores the Person');
RESET ROLE;
SELECT is((SELECT status FROM public.personnel_onboardings WHERE id = pg_temp.u(701)), 'cancelled',
  'restore leaves the archive-cancelled packet cancelled');
SELECT results_eq($$ SELECT status, archived_at FROM public.personnel_follow_ups WHERE id = pg_temp.u(1101) $$,
  $$ VALUES ('open'::text, NULL::timestamptz) $$, 'restore reopens the Follow-Up the archive closed');

SELECT pg_temp.act(1);
SET LOCAL ROLE authenticated;
UPDATE public.personnel_onboardings SET status = 'in_progress' WHERE id = pg_temp.u(701);
SELECT throws_ok(
  $$ UPDATE public.personnel_onboardings SET status = 'in_progress' WHERE id = pg_temp.u(702) $$,
  '23505', NULL, 'reopening beside another active packet is refused by the active packet index');
RESET ROLE;
SELECT results_eq(
  $$ SELECT status, cancelled_at, cancellation_reason FROM public.personnel_onboardings WHERE id = pg_temp.u(701) $$,
  $$ VALUES ('in_progress'::text, NULL::timestamptz, NULL::text) $$,
  'a leader reopens the packet after restore, and the cancellation reason clears');
SELECT throws_ok(
  $$ UPDATE public.personnel_onboardings SET cancellation_reason = 'archived' WHERE id = pg_temp.u(701) $$,
  '23514', NULL, 'only a cancelled packet can keep a cancellation reason');

-- New artifacts are refused for an archived Person, the whole batch at once.
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ SELECT public.insert_personnel_artifacts(pg_temp.u(1), pg_temp.u(101), 'leader_notes', jsonb_build_array(
       jsonb_build_object('personnel_id', pg_temp.u(303), 'author', 'Owner', 'text', 'Active'),
       jsonb_build_object('personnel_id', pg_temp.u(304), 'author', 'Owner', 'text', 'Archived'))) $$,
  '55000', 'This person is archived. Restore them before adding records.', 'a batch naming an archived Person writes nothing');
SELECT is(
  (SELECT count(*)::integer FROM public.insert_personnel_artifacts(pg_temp.u(1), pg_temp.u(101), 'leader_notes',
    jsonb_build_array(jsonb_build_object('personnel_id', pg_temp.u(303), 'author', 'Owner', 'text', 'Active')))),
  1, 'an active Person still gets new records');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.leader_notes WHERE organization_id = pg_temp.u(101)), 1,
  'only the active Person''s note was saved');

-- A purge cancels the pending deletion requests for the Person and their records.
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by)
VALUES (pg_temp.u(901), pg_temp.u(101), pg_temp.u(305), '2019-06-01', 'Subject', 'Counseling', 'fixture');
INSERT INTO public.training_types (id, organization_id, name) VALUES (pg_temp.u(601), pg_temp.u(101), 'CPR');
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id)
VALUES (pg_temp.u(902), pg_temp.u(101), pg_temp.u(305), pg_temp.u(601));
INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end)
VALUES (pg_temp.u(903), pg_temp.u(101), pg_temp.u(305), 'NCOER', '2019-01-01', '2019-12-31');
INSERT INTO public.deletion_requests (id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description, status)
VALUES
  (pg_temp.u(1001), pg_temp.u(101), pg_temp.u(1), 'owner@example.test', 'personnel', pg_temp.u(305), 'Person', 'pending'),
  (pg_temp.u(1002), pg_temp.u(101), pg_temp.u(1), 'owner@example.test', 'counseling_record', pg_temp.u(901), 'Counseling', 'pending'),
  (pg_temp.u(1003), pg_temp.u(101), pg_temp.u(1), 'owner@example.test', 'personnel_training', pg_temp.u(902), 'Training', 'pending'),
  (pg_temp.u(1004), pg_temp.u(101), pg_temp.u(1), 'owner@example.test', 'rating_scheme_entry', pg_temp.u(903), 'Rating', 'pending'),
  (pg_temp.u(1005), pg_temp.u(101), pg_temp.u(1), 'owner@example.test', 'personnel', pg_temp.u(303), 'Active Person', 'pending'),
  (pg_temp.u(1006), pg_temp.u(101), pg_temp.u(1), 'owner@example.test', 'personnel', pg_temp.u(305), 'Denied before', 'denied');

SET LOCAL ROLE service_role;
SELECT is(public.delete_expired_personnel(pg_temp.u(101), ARRAY[pg_temp.u(303), pg_temp.u(305)], '2025-01-01T00:00:00Z'), 1,
  'the purge removes only the expired Person');
RESET ROLE;
SELECT results_eq(
  $$ SELECT id, status FROM public.deletion_requests WHERE organization_id = pg_temp.u(101) ORDER BY id $$,
  $$ VALUES (pg_temp.u(1001), 'cancelled'::text), (pg_temp.u(1002), 'cancelled'), (pg_temp.u(1003), 'cancelled'),
       (pg_temp.u(1004), 'cancelled'), (pg_temp.u(1005), 'pending'), (pg_temp.u(1006), 'denied') $$,
  'the purge cancels pending requests for the purged Person and their records, and leaves other requests');

SELECT * FROM finish();
ROLLBACK;
