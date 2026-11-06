-- Opening a counseling record, a leader note or a document writes one entry that names the member who opened it and
-- the person it belongs to, and never the title, text or file name. Only the server writes it, a repeat within ten
-- minutes writes nothing, and a client can neither write nor forge one.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1997000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.as_server() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role": "service_role"}', true);
$$;
CREATE FUNCTION pg_temp.open(p_kind text, p_actor text, p_person text, p_record text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
  SELECT public.record_personnel_record_open(
    p_kind, pg_temp.id(p_actor), pg_temp.id('101'), pg_temp.id(p_person), CASE WHEN p_record IS NULL THEN NULL ELSE pg_temp.id(p_record) END,
    '127.0.0.1', 'synthetic agent');
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'record-opens-' || n || '@example.test', now()
FROM generate_series(1, 3) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Record Opens Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Record Opens Bravo', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'admin@example.test'),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], 'viewer@example.test');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'record-opens-doe'),
  (pg_temp.id('302'), pg_temp.id('101'), 'PFC', 'Rich', 'Roe', 'record-opens-roe'),
  (pg_temp.id('303'), pg_temp.id('102'), 'SGT', 'Other', 'Unit', 'record-opens-other');

SELECT ok(NOT has_function_privilege('authenticated', 'public.record_personnel_record_open(text,uuid,uuid,uuid,uuid,inet,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.record_personnel_record_open(text,uuid,uuid,uuid,uuid,inet,text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.record_personnel_record_open(text,uuid,uuid,uuid,uuid,inet,text)', 'EXECUTE'),
  'only the server records an open');

SELECT pg_temp.as_server();
SET LOCAL ROLE service_role;
SELECT pg_temp.open('personnel.counseling_record.opened', '1', '301', '401');
SELECT pg_temp.open('personnel.document.opened', '2', '301', '402');
SELECT pg_temp.open('personnel.leader_note.opened', '2', '301');
RESET ROLE;

SELECT bag_eq(
  $$ SELECT action, resource_type, resource_id, user_id, actor_label, record_label, subject_personnel_id, subject_label, details,
       severity, org_id
     FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND action LIKE '%.opened' $$,
  $$ VALUES
    ('personnel.counseling_record.opened', 'counseling_record', pg_temp.id('401'), pg_temp.id('1'), 'SSG Rivera, Sam', NULL::text,
      pg_temp.id('301'), 'SPC Doe, Jane', '{}'::jsonb, 'info', pg_temp.id('101')),
    ('personnel.document.opened', 'personnel_document', pg_temp.id('402'), pg_temp.id('2'), 'admin@example.test', NULL,
      pg_temp.id('301'), 'SPC Doe, Jane', '{}', 'info', pg_temp.id('101')),
    ('personnel.leader_note.opened', 'leader_note', NULL, pg_temp.id('2'), 'admin@example.test', NULL,
      pg_temp.id('301'), 'SPC Doe, Jane', '{}', 'info', pg_temp.id('101')) $$,
  'each open names the member, the person as the roster writes them and the type of record, and nothing of its content');

SET LOCAL ROLE service_role;
SELECT pg_temp.open('personnel.counseling_record.opened', '1', '301', '401');
SELECT pg_temp.open('personnel.document.opened', '2', '301', '402');
SELECT pg_temp.open('personnel.leader_note.opened', '2', '301');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND action LIKE '%.opened'), 3,
  'the same member opening the same record again within ten minutes writes nothing');

SET LOCAL ROLE service_role;
SELECT pg_temp.open('personnel.counseling_record.opened', '1', '301', '403');
SELECT pg_temp.open('personnel.counseling_record.opened', '2', '301', '401');
SELECT pg_temp.open('personnel.leader_note.opened', '2', '302');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND action LIKE '%.opened'), 6,
  'another record, another member and another person each write their own entry');

UPDATE public.audit_logs SET "timestamp" = now() - interval '10 minutes'
WHERE org_id = pg_temp.id('101') AND action = 'personnel.document.opened';
UPDATE public.audit_logs SET "timestamp" = now() - interval '10 minutes' + interval '1 second'
WHERE org_id = pg_temp.id('101') AND action = 'personnel.leader_note.opened' AND subject_personnel_id = pg_temp.id('301');
SET LOCAL ROLE service_role;
SELECT pg_temp.open('personnel.document.opened', '2', '301', '402');
SELECT pg_temp.open('personnel.leader_note.opened', '2', '301');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND action = 'personnel.document.opened'), 2,
  'an open after the ten minutes writes a new entry');
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND action = 'personnel.leader_note.opened'
  AND subject_personnel_id = pg_temp.id('301')), 1, 'and an open just inside them still collapses');

SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT pg_temp.open('personnel.follow_up.opened', '1', '301') $$, '22023', NULL, 'only the three open kinds can be written');
SELECT throws_ok($$ SELECT pg_temp.open('personnel.document.created', '1', '301', '402') $$, '22023', NULL, 'and no other kind passes through it');
SELECT throws_ok(
  format($$ SELECT public.record_personnel_record_open('personnel.document.opened', NULL, %L, %L) $$, pg_temp.id('101'), pg_temp.id('301')),
  '22023', NULL, 'an open must name a member');
SELECT throws_ok($$ SELECT pg_temp.open('personnel.document.opened', '1', '303', '402') $$, '22023', NULL,
  'a person in another unit cannot be named, so no other unit''s label reaches this log');
RESET ROLE;

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_test_rejects_open CHECK (action <> 'personnel.document.opened') NOT VALID;
SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT pg_temp.open('personnel.document.opened', '1', '302', '404') $$, '23514', NULL,
  'an open whose audit write fails raises the failure, so the server hands out no file');
RESET ROLE;
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_test_rejects_open;

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$ SELECT public.record_personnel_record_open('personnel.document.opened', %L, %L, %L, %L) $$,
    pg_temp.id('1'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('402')),
  '42501', NULL, 'a signed-in member cannot record an open, so cannot write one in another member''s name');
SELECT throws_ok(
  format($$ SELECT public.record_app_audit_entry('personnel.document.opened', 'personnel_document', 'info', '{}', %L, %L) $$,
    pg_temp.id('1'), pg_temp.id('101')),
  '42501', NULL, 'nor through the general entry writer');
SELECT throws_ok(
  $$ INSERT INTO public.audit_logs (user_id, actor_label, org_id, action, resource_type, subject_label)
     VALUES (pg_temp.id('1'), 'GEN Forged, Actor', pg_temp.id('101'), 'personnel.document.opened', 'personnel_document', 'SPC Doe, Jane') $$,
  '42501', NULL, 'nor by inserting the entry');
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND action = 'personnel.document.opened'), 2,
  'an admin reads the opens of the unit');
RESET ROLE;

SELECT pg_temp.act_as('3');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101')), 0,
  'a member without admin reads none of them');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
