-- An approved deletion runs through the service role for the reviewer, so the entry names the reviewer and not System.
-- A signed-in client has no way to choose whose name an entry carries: it cannot run the command, cannot write an
-- entry, and its own writes always carry its own id.
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
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'approved-' || n || '@example.test', now()
FROM generate_series(1, 3) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('101'), 'Approved Alpha', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'admin-two@example.test'),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'member@example.test');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug)
VALUES (pg_temp.id('301'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'approved-doe');
INSERT INTO public.training_types (id, organization_id, name) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), 'Annual Safety'),
  (pg_temp.id('402'), pg_temp.id('101'), 'Retired Course'),
  (pg_temp.id('403'), pg_temp.id('101'), 'Client Course');
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date) VALUES
  (pg_temp.id('421'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('401'), '2030-01-10'),
  (pg_temp.id('422'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('403'), '2030-01-11');
INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end)
VALUES (pg_temp.id('601'), pg_temp.id('101'), pg_temp.id('301'), 'NCOER', '2030-01-01', '2030-12-31');
INSERT INTO public.deletion_requests
  (id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description, status) VALUES
  (pg_temp.id('701'), pg_temp.id('101'), pg_temp.id('3'), 'member@example.test', 'personnel_training', pg_temp.id('421'), 'Record', 'pending'),
  (pg_temp.id('702'), pg_temp.id('101'), pg_temp.id('3'), 'member@example.test', 'training_type', pg_temp.id('402'), 'Type', 'pending'),
  (pg_temp.id('703'), pg_temp.id('101'), pg_temp.id('3'), 'member@example.test', 'rating_scheme_entry', pg_temp.id('601'), 'Entry', 'pending');
DELETE FROM public.audit_logs WHERE org_id = pg_temp.id('101');

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$ SELECT public.approve_record_deletion_request(%L, %L, 'personnel_training', %L, %L, now()) $$,
    pg_temp.id('101'), pg_temp.id('701'), pg_temp.id('421'), pg_temp.id('1')),
  '42501', NULL, 'a signed-in administrator cannot run the approval command, so cannot name another reviewer');
SELECT throws_ok(
  format($$ SELECT public.record_app_audit_entries(%L::jsonb, %L, %L) $$,
    '[{"kind": "training_record.deleted", "recordType": "training_record"}]', pg_temp.id('1'), pg_temp.id('101')),
  '42501', NULL, 'a signed-in client cannot write entries in the name of another member');
DELETE FROM public.personnel_trainings WHERE id = pg_temp.id('422');
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.personnel_trainings WHERE id = pg_temp.id('421')),
  1, 'the refused command deleted nothing');
SELECT is(
  (SELECT user_id FROM public.audit_logs WHERE action = 'training_record.deleted' AND org_id = pg_temp.id('101')),
  pg_temp.id('2'), 'a client''s own delete names the client, whatever the command would have been told');

SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role": "service_role"}', true);
SET LOCAL ROLE service_role;
SELECT public.approve_record_deletion_request(pg_temp.id('101'), pg_temp.id('701'), 'personnel_training', pg_temp.id('421'), pg_temp.id('1'), now());
SELECT public.approve_record_deletion_request(pg_temp.id('101'), pg_temp.id('702'), 'training_type', pg_temp.id('402'), pg_temp.id('1'), now());
SELECT public.approve_record_deletion_request(pg_temp.id('101'), pg_temp.id('703'), 'rating_scheme_entry', pg_temp.id('601'), pg_temp.id('1'), now());
SELECT is(coalesce(current_setting('request.jwt.claim.sub', true), ''), '',
  'the reviewer is the signed-in member only while the command deletes');
DELETE FROM public.training_types WHERE id = pg_temp.id('401');
RESET ROLE;

SELECT bag_eq(
  $$ SELECT action, user_id, actor_label, record_label, subject_label FROM public.audit_logs
     WHERE org_id = pg_temp.id('101') AND resource_id IN (pg_temp.id('421'), pg_temp.id('402'), pg_temp.id('601'), pg_temp.id('401')) $$,
  $$ VALUES
    ('training_record.deleted', pg_temp.id('1'), 'SSG Rivera, Sam', 'Annual Safety', 'SPC Doe, Jane'),
    ('training_type.deleted', pg_temp.id('1'), 'SSG Rivera, Sam', 'Retired Course', NULL),
    ('rating_scheme.deleted', pg_temp.id('1'), 'SSG Rivera, Sam', 'NCOER', 'SPC Doe, Jane'),
    ('training_type.deleted', NULL, NULL, 'Annual Safety', NULL) $$,
  'an approved deletion of a record, a type and a Rating Scheme entry names the reviewer and their saved label, and a service-role delete with no reviewer stays System');
SELECT is(
  (SELECT count(*)::integer FROM public.deletion_requests WHERE id IN (pg_temp.id('701'), pg_temp.id('702'), pg_temp.id('703'))
    AND status = 'approved' AND reviewed_by = pg_temp.id('1')),
  3, 'each request records the same reviewer');

SELECT * FROM finish();
ROLLBACK;
