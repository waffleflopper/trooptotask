-- Correcting a past Training completion edits its history row, not the current record. The correction writes one
-- entry that names the signed-in member, the Training type and the person, and a renamed person keeps the label each
-- earlier entry was saved with. Every write below runs as an ordinary signed-in member; setup and readback are the
-- only privileged steps.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1995000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'history-' || n || '@example.test', now()
FROM generate_series(1, 2) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('101'), 'History Alpha', pg_temp.id('1'));
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('102'), 'History Bravo', pg_temp.id('2'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('102'), pg_temp.id('2'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'history-doe');
INSERT INTO public.training_types (id, organization_id, name, expiration_months)
VALUES (pg_temp.id('401'), pg_temp.id('101'), 'Annual Safety', 12);

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date, expiration_date)
VALUES (pg_temp.id('421'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('401'), '2030-01-10', '2031-01-10');
UPDATE public.personnel_trainings SET completion_date = '2030-02-10', expiration_date = '2031-02-10' WHERE id = pg_temp.id('421');
RESET ROLE;

SELECT is(
  (SELECT count(*)::integer FROM public.personnel_training_history WHERE personnel_id = pg_temp.id('301')),
  1, 'a new completion supersedes the old one into history');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE action = 'training_record.history_corrected'),
  0, 'the system writing that history row is not a correction');

CREATE TEMP TABLE history AS SELECT id FROM public.personnel_training_history WHERE personnel_id = pg_temp.id('301');
GRANT SELECT ON history TO authenticated;

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT public.correct_training_completion(
  pg_temp.id('101'), 'history', (SELECT id FROM history), '2030-01-12', '2031-01-12', 'Private note');
RESET ROLE;

SELECT results_eq(
  $$ SELECT action, user_id, actor_label, record_label, subject_personnel_id, subject_label, details
     FROM public.audit_logs WHERE resource_type = 'training_record' AND action LIKE '%corrected' AND org_id = pg_temp.id('101') $$,
  $$ VALUES ('training_record.history_corrected', pg_temp.id('1'), 'SSG Rivera, Sam', 'Annual Safety', pg_temp.id('301'),
    'SPC Doe, Jane', '{"change": {"completionDate": {"from": "2030-01-10", "to": "2030-01-12"},
      "expirationDate": {"from": "2031-01-10", "to": "2031-01-12"}, "notes": true}}'::jsonb) $$,
  'correcting a past completion writes one entry with the actor, the type, the person and the changed fields');
SELECT is(
  (SELECT resource_id FROM public.audit_logs WHERE action = 'training_record.history_corrected' AND org_id = pg_temp.id('101')),
  (SELECT id FROM history), 'and the entry points at the history row');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND details::text ~ 'Private'),
  0, 'the note is never saved');

UPDATE public.personnel SET last_name = 'Smith' WHERE id = pg_temp.id('301');
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT public.correct_training_completion(
  pg_temp.id('101'), 'history', (SELECT id FROM history), '2030-01-13', '2031-01-12', 'Private note');
SELECT public.correct_training_completion(
  pg_temp.id('101'), 'history', (SELECT id FROM history), '2030-01-13', '2031-01-12', 'Private note');
RESET ROLE;

SELECT results_eq(
  $$ SELECT subject_label, details FROM public.audit_logs
     WHERE action = 'training_record.history_corrected' AND org_id = pg_temp.id('101') ORDER BY subject_label $$,
  $$ VALUES ('SPC Doe, Jane', '{"change": {"completionDate": {"from": "2030-01-10", "to": "2030-01-12"},
      "expirationDate": {"from": "2031-01-10", "to": "2031-01-12"}, "notes": true}}'::jsonb),
    ('SPC Smith, Jane', '{"change": {"completionDate": {"from": "2030-01-12", "to": "2030-01-13"}}}'::jsonb) $$,
  'a renamed person reads with the name at the time of each entry, and a correction that changes nothing writes nothing');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT public.correct_training_completion(
  pg_temp.id('101'), 'current', pg_temp.id('421'), '2030-02-11', '2031-02-11', NULL);
RESET ROLE;
SELECT results_eq(
  $$ SELECT action, details FROM public.audit_logs
     WHERE action = 'training_record.updated' AND org_id = pg_temp.id('101') AND details ->> 'completionDate' = '2030-02-11' $$,
  $$ VALUES ('training_record.updated', '{"completionDate": "2030-02-11", "expirationDate": "2031-02-11",
    "change": {"completionDate": {"from": "2030-02-10", "to": "2030-02-11"}, "expirationDate": {"from": "2031-02-10", "to": "2031-02-11"}}}'::jsonb) $$,
  'correcting the current completion is one update entry and leaves no history row');
SELECT is(
  (SELECT count(*)::integer FROM public.personnel_training_history WHERE personnel_id = pg_temp.id('301')),
  1, 'the current correction added no history row');

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM (SELECT public.correct_training_completion(
    pg_temp.id('102'), 'history', (SELECT id FROM history), '2030-03-01', '2031-03-01', NULL)) AS attempt WHERE attempt.correct_training_completion IS NOT NULL),
  0, 'another unit cannot correct this history row');
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE action = 'training_record.history_corrected'),
  2, 'and a refused correction writes no entry');

SELECT * FROM finish();
ROLLBACK;
