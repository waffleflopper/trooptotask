-- People records write their own audit entries with the person's roster label saved at the time of the change: the
-- person, their extended info and award flag, Groups, and pinned Groups. Every write below runs as an ordinary
-- signed-in member; setup and readback are the only privileged steps.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1993000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'people-' || n || '@example.test', now()
FROM generate_series(1, 2) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('101'), 'People Alpha', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'admin@example.test');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
INSERT INTO public.groups (id, organization_id, name, path) VALUES
  (pg_temp.id('201'), pg_temp.id('101'), 'Alpha', ARRAY[pg_temp.id('201')]),
  (pg_temp.id('202'), pg_temp.id('101'), 'Bravo', ARRAY[pg_temp.id('202')]);
UPDATE public.groups SET name = 'Alpha Platoon' WHERE id = pg_temp.id('201');
UPDATE public.groups SET parent_id = pg_temp.id('201'), path = ARRAY[pg_temp.id('201'), pg_temp.id('202')]
WHERE id = pg_temp.id('202');
UPDATE public.groups SET sort_order = 4 WHERE id = pg_temp.id('201');
INSERT INTO public.user_pinned_groups (id, user_id, organization_id, group_id)
VALUES (pg_temp.id('251'), pg_temp.id('1'), pg_temp.id('101'), pg_temp.id('201'));
DELETE FROM public.user_pinned_groups WHERE id = pg_temp.id('251');

INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, group_id, slug)
VALUES (pg_temp.id('301'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', pg_temp.id('201'), 'people-doe');
UPDATE public.personnel SET rank = 'SGT', mos = '68W' WHERE id = pg_temp.id('301');
UPDATE public.personnel SET group_id = pg_temp.id('202') WHERE id = pg_temp.id('301');
UPDATE public.personnel SET last_name = 'Smith' WHERE id = pg_temp.id('301');
UPDATE public.personnel SET slug = 'people-smith' WHERE id = pg_temp.id('301');
UPDATE public.personnel SET archived_at = now() WHERE id = pg_temp.id('301');
UPDATE public.personnel SET archived_at = NULL WHERE id = pg_temp.id('301');
INSERT INTO public.personnel_extended_info (organization_id, personnel_id, personal_phone, address_city)
VALUES (pg_temp.id('101'), pg_temp.id('301'), '555-0100', 'Tacoma');
UPDATE public.personnel_extended_info SET personal_phone = '555-0199', blood_type = 'O+',
  award_tracking_acknowledged_at = now()
WHERE personnel_id = pg_temp.id('301');
UPDATE public.personnel_extended_info SET award_tracking_acknowledged_at = NULL WHERE personnel_id = pg_temp.id('301');
UPDATE public.personnel_extended_info SET updated_by = 'someone' WHERE personnel_id = pg_temp.id('301');
RESET ROLE;

SELECT bag_eq(
  $$ SELECT action, user_id, actor_label, record_label, subject_personnel_id, subject_label
     FROM public.audit_logs WHERE resource_id = pg_temp.id('301') AND resource_type = 'personnel' ORDER BY timestamp, action $$,
  $$ VALUES
    ('personnel.created', pg_temp.id('1'), 'SSG Rivera, Sam', 'SPC Doe, Jane', pg_temp.id('301'), 'SPC Doe, Jane'),
    ('personnel.updated', pg_temp.id('1'), 'SSG Rivera, Sam', 'SGT Doe, Jane', pg_temp.id('301'), 'SGT Doe, Jane'),
    ('personnel.updated', pg_temp.id('1'), 'SSG Rivera, Sam', 'SGT Doe, Jane', pg_temp.id('301'), 'SGT Doe, Jane'),
    ('personnel.updated', pg_temp.id('1'), 'SSG Rivera, Sam', 'SGT Smith, Jane', pg_temp.id('301'), 'SGT Smith, Jane'),
    ('personnel.archived', pg_temp.id('1'), 'SSG Rivera, Sam', 'SGT Smith, Jane', pg_temp.id('301'), 'SGT Smith, Jane'),
    ('personnel.restored', pg_temp.id('1'), 'SSG Rivera, Sam', 'SGT Smith, Jane', pg_temp.id('301'), 'SGT Smith, Jane'),
    ('personnel.extended_info.updated', pg_temp.id('1'), 'SSG Rivera, Sam', 'SGT Smith, Jane', pg_temp.id('301'), 'SGT Smith, Jane'),
    ('personnel.extended_info.updated', pg_temp.id('1'), 'SSG Rivera, Sam', 'SGT Smith, Jane', pg_temp.id('301'), 'SGT Smith, Jane'),
    ('personnel.award_tracking_acknowledged', pg_temp.id('1'), 'SSG Rivera, Sam', 'SGT Smith, Jane', pg_temp.id('301'), 'SGT Smith, Jane'),
    ('personnel.award_tracking_cleared', pg_temp.id('1'), 'SSG Rivera, Sam', 'SGT Smith, Jane', pg_temp.id('301'), 'SGT Smith, Jane') $$,
  'each personnel change saves the actor and the roster label as it stood, a slug-only save, an untouched sheet save and a stamp-only sheet save write nothing');
SELECT bag_eq(
  $$ SELECT details FROM public.audit_logs WHERE action = 'personnel.updated' AND resource_id = pg_temp.id('301')
     ORDER BY timestamp $$,
  $$ VALUES
    ('{"change": {"rank": {"from": "SPC", "to": "SGT"}, "mos": {"from": "", "to": "68W"}}}'::jsonb),
    ('{"change": {"group": {"from": "Alpha Platoon", "to": "Bravo"}}}'::jsonb),
    ('{"change": {"name": {"from": "Doe, Jane", "to": "Smith, Jane"}}}'::jsonb) $$,
  'a person change saves the fields that changed, before and after, with Groups by name');
SELECT bag_eq(
  $$ SELECT details FROM public.audit_logs WHERE action = 'personnel.extended_info.updated' ORDER BY timestamp $$,
  $$ VALUES
    ('{"sections": ["Contact info", "Address"]}'::jsonb),
    ('{"sections": ["Contact info", "Blood type"]}'::jsonb) $$,
  'an extended info entry names the sections that changed and never keeps the values');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
    WHERE org_id = pg_temp.id('101') AND details::text ~ '(555-01|Tacoma|O\+)'),
  0, 'no phone number, city or blood type is saved in any entry');
SELECT bag_eq(
  $$ SELECT action, record_label, details FROM public.audit_logs
     WHERE resource_type = 'group' AND org_id = pg_temp.id('101') ORDER BY timestamp, action $$,
  $$ VALUES
    ('group.created', 'Alpha', '{"parent": null}'::jsonb),
    ('group.created', 'Bravo', '{"parent": null}'::jsonb),
    ('group.updated', 'Alpha Platoon', '{"parent": null, "change": {"name": {"from": "Alpha", "to": "Alpha Platoon"}}}'::jsonb),
    ('group.moved', 'Bravo', '{"parent": "Alpha Platoon", "change": {"parent": {"from": null, "to": "Alpha Platoon"}}}'::jsonb) $$,
  'a Group saves its name and parent, a rename and a move save the change, and a reorder writes nothing');
SELECT bag_eq(
  $$ SELECT action, user_id, record_label FROM public.audit_logs
     WHERE resource_type = 'pinned_group' ORDER BY timestamp $$,
  $$ VALUES ('pinned_group.created', pg_temp.id('1'), 'Alpha Platoon'), ('pinned_group.deleted', pg_temp.id('1'), 'Alpha Platoon') $$,
  'a pin and an unpin save who did it and the Group name');

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
UPDATE public.personnel SET archived_at = now() WHERE id = pg_temp.id('301');
DELETE FROM public.personnel WHERE id = pg_temp.id('301');
DELETE FROM public.groups WHERE id = pg_temp.id('202');
RESET ROLE;
SELECT bag_eq(
  $$ SELECT action, user_id, actor_label, record_label, subject_personnel_id, subject_label FROM public.audit_logs
     WHERE action IN ('personnel.permanently_deleted', 'group.deleted') ORDER BY action $$,
  $$ VALUES
    ('group.deleted', pg_temp.id('2'), 'admin@example.test', 'Bravo', NULL::uuid, NULL::text),
    ('personnel.permanently_deleted', pg_temp.id('2'), 'admin@example.test', 'SGT Smith, Jane', pg_temp.id('301'), 'SGT Smith, Jane') $$,
  'a deletion saves the actor and the last label, and the earlier entries still read with the name they were written with');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE action = 'personnel.created' AND subject_label = 'SPC Doe, Jane'),
  1, 'a renamed and deleted person keeps the label of every earlier entry');

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_test_rejects_person CHECK (action <> 'personnel.created') NOT VALID;
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug)
     VALUES (pg_temp.id('302'), pg_temp.id('101'), 'PFC', 'Rich', 'Roe', 'people-roe') $$,
  '23514', NULL, 'a person change whose audit write fails raises the failure');
RESET ROLE;
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_test_rejects_person;
SELECT is((SELECT count(*)::integer FROM public.personnel WHERE id = pg_temp.id('302')), 0, 'and the change is rolled back');

SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.audit_logs (user_id, actor_label, org_id, action, resource_type, record_label, subject_label)
     VALUES (pg_temp.id('2'), 'GEN Forged, Actor', pg_temp.id('101'), 'personnel.created', 'personnel', 'GEN Forged, Name',
       'GEN Forged, Name') $$,
  '42501', NULL, 'an owner cannot write a person entry with a forged actor or label');
RESET ROLE;

INSERT INTO public.groups (id, organization_id, name, path) VALUES (pg_temp.id('203'), pg_temp.id('101'), 'Charlie', ARRAY[pg_temp.id('203')]);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug)
VALUES (pg_temp.id('303'), pg_temp.id('101'), 'SGT', 'Pat', 'Poe', 'people-poe');
SELECT lives_ok($$ DELETE FROM public.organizations WHERE id = pg_temp.id('101') $$,
  'a unit with people and Groups can still be deleted');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
    WHERE action IN ('personnel.permanently_deleted', 'group.deleted') AND resource_id IN (pg_temp.id('303'), pg_temp.id('203'))),
  0, 'people and Groups removed with their unit leave the unit deletion as the audited event');

SELECT * FROM finish();
ROLLBACK;
