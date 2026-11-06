-- Events, Taskings, and a Tasking's equipment and checklist write their own audit entries with labels saved at the
-- time of the change. Every write below runs as an ordinary signed-in member; setup and readback are the only
-- privileged steps.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1992100-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.entries(p_record text) RETURNS TABLE (action text, record_label text, details jsonb)
LANGUAGE sql AS $$
  SELECT action, record_label, details FROM public.audit_logs
  WHERE resource_id = pg_temp.id(p_record) ORDER BY timestamp, id;
$$;
CREATE FUNCTION pg_temp.move(p_id text, p_action text, p_note text DEFAULT NULL) RETURNS boolean LANGUAGE sql AS $$
  SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id(p_id), p_action, p_note);
$$;

-- 1 owner with a profile, 2 Organization-wide Calendar operator without one.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'cal-audit-' || n || '@example.test', now()
FROM generate_series(1, 2) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('101'), 'Calendar Audit Alpha', pg_temp.id('1'));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.id('201'), pg_temp.id('101'), 'Alpha'),
  (pg_temp.id('202'), pg_temp.id('101'), 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'viewer', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[], 'ops@example.test');

-- Events.
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
INSERT INTO public.calendar_events (id, organization_id, title, starts_on, ends_on, host_name, coordinator_user_id)
VALUES (pg_temp.id('301'), pg_temp.id('101'), 'Range week', '2030-11-10', '2030-11-12', '1-1 BN', pg_temp.id('1'));
UPDATE public.calendar_events SET title = 'Range week 2', ends_on = '2030-11-13', description = 'Bring ear pro'
WHERE id = pg_temp.id('301');
UPDATE public.calendar_events SET coordinator_user_id = pg_temp.id('2') WHERE id = pg_temp.id('301');
UPDATE public.calendar_events SET title = title WHERE id = pg_temp.id('301');
SELECT public.cancel_calendar_event(pg_temp.id('101'), pg_temp.id('301'), 'Range closed for weather');
RESET ROLE;
SELECT bag_eq(
  $$ SELECT action, record_label, details FROM pg_temp.entries('301') $$,
  $$ VALUES
    ('calendar_event.created', 'Range week', '{"startsOn": "2030-11-10", "endsOn": "2030-11-12"}'::jsonb),
    ('calendar_event.updated', 'Range week 2', '{"startsOn": "2030-11-10", "endsOn": "2030-11-13",
       "change": {"title": {"from": "Range week", "to": "Range week 2"}, "endsOn": {"from": "2030-11-12", "to": "2030-11-13"},
         "description": true}}'::jsonb),
    ('calendar_event.updated', 'Range week 2', '{"startsOn": "2030-11-10", "endsOn": "2030-11-13",
       "change": {"coordinator": true}}'::jsonb),
    ('calendar_event.cancelled', 'Range week 2', '{"startsOn": "2030-11-10", "endsOn": "2030-11-13"}'::jsonb) $$,
  'an event saves its dates and the changed fields by name; free text and the cancellation reason are never saved, and an untouched save writes nothing');
SELECT results_eq(
  $$ SELECT user_id, actor_label, org_id, resource_type FROM public.audit_logs
     WHERE resource_id = pg_temp.id('301') AND action = 'calendar_event.created' $$,
  $$ VALUES (pg_temp.id('1'), 'SSG Rivera, Sam', pg_temp.id('101'), 'calendar_event') $$,
  'the actor comes from the signed-in member');

-- Taskings and their status changes.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
INSERT INTO public.calendar_taskings (id, organization_id, title, responsible_group_id, suspense_on)
VALUES (pg_temp.id('401'), pg_temp.id('101'), 'Range detail', pg_temp.id('201'), '2030-11-10');
UPDATE public.calendar_taskings
SET suspense_on = '2030-11-12', responsible_group_id = pg_temp.id('202'), instructions = 'Report to the range tower'
WHERE id = pg_temp.id('401');
UPDATE public.calendar_taskings SET title = title WHERE id = pg_temp.id('401');
SELECT pg_temp.move('401', 'start');
SELECT pg_temp.move('401', 'start');
SELECT pg_temp.move('401', 'block', 'Waiting on range control');
SELECT pg_temp.move('401', 'unblock');
SELECT pg_temp.move('401', 'complete');
SELECT pg_temp.move('401', 'reopen');
INSERT INTO public.calendar_taskings (id, organization_id, title, suspense_on)
VALUES (pg_temp.id('402'), pg_temp.id('101'), 'Spare detail', '2030-11-10');
SELECT pg_temp.move('402', 'cancel', 'Not needed');
RESET ROLE;
SELECT bag_eq(
  $$ SELECT action, record_label, details FROM pg_temp.entries('401') $$,
  $$ VALUES
    ('calendar_tasking.created', 'Range detail', '{}'::jsonb),
    ('calendar_tasking.updated', 'Range detail', '{"change": {"suspenseOn": {"from": "2030-11-10", "to": "2030-11-12"},
       "responsible": {"from": "Alpha", "to": "Bravo"}, "instructions": true}}'::jsonb),
    ('calendar_tasking.started', 'Range detail', '{}'::jsonb),
    ('calendar_tasking.blocked', 'Range detail', '{}'::jsonb),
    ('calendar_tasking.unblocked', 'Range detail', '{}'::jsonb),
    ('calendar_tasking.completed', 'Range detail', '{}'::jsonb),
    ('calendar_tasking.reopened', 'Range detail', '{}'::jsonb) $$,
  'a tasking saves its changed fields, the group names before and after, and one entry per status change; reasons and notes are never saved');
SELECT bag_eq(
  $$ SELECT action, record_label, details FROM pg_temp.entries('402') $$,
  $$ VALUES ('calendar_tasking.created', 'Spare detail', '{}'::jsonb), ('calendar_tasking.cancelled', 'Spare detail', '{}'::jsonb) $$,
  'cancelling a tasking saves its own entry');
SELECT results_eq(
  $$ SELECT user_id, actor_label FROM public.audit_logs WHERE resource_id = pg_temp.id('401') AND action = 'calendar_tasking.started' $$,
  $$ VALUES (pg_temp.id('2'), 'ops@example.test') $$,
  'a member without a profile is named by email');

-- Equipment and checklist items are saved against their tasking.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
INSERT INTO public.calendar_tasking_equipment (id, organization_id, tasking_id, name, quantity)
VALUES (pg_temp.id('501'), pg_temp.id('101'), pg_temp.id('401'), 'Litters', 4);
UPDATE public.calendar_tasking_equipment SET secured_quantity = 2 WHERE id = pg_temp.id('501');
UPDATE public.calendar_tasking_equipment SET name = 'Field litters', quantity = 6 WHERE id = pg_temp.id('501');
INSERT INTO public.calendar_tasking_equipment (id, organization_id, tasking_id, name, quantity)
VALUES (pg_temp.id('502'), pg_temp.id('101'), pg_temp.id('401'), 'Radios', 2);
SELECT public.reorder_calendar_tasking_list(pg_temp.id('101'), pg_temp.id('401'), 'equipment',
  ARRAY[pg_temp.id('502'), pg_temp.id('501')]);
DELETE FROM public.calendar_tasking_equipment WHERE id = pg_temp.id('502');
INSERT INTO public.calendar_tasking_checklist_items (id, organization_id, tasking_id, label)
VALUES (pg_temp.id('601'), pg_temp.id('101'), pg_temp.id('401'), 'Confirm radios');
UPDATE public.calendar_tasking_checklist_items SET label = 'Confirm net check' WHERE id = pg_temp.id('601');
UPDATE public.calendar_tasking_checklist_items SET done = true WHERE id = pg_temp.id('601');
UPDATE public.calendar_tasking_checklist_items SET done = false WHERE id = pg_temp.id('601');
DELETE FROM public.calendar_tasking_checklist_items WHERE id = pg_temp.id('601');
RESET ROLE;
SELECT bag_eq(
  $$ SELECT action, record_label, details FROM pg_temp.entries('401') WHERE action ~ '(equipment|checklist)' $$,
  $$ VALUES
    ('calendar_tasking.equipment_added', 'Range detail', '{"item": "Litters"}'::jsonb),
    ('calendar_tasking.equipment_secured', 'Range detail', '{"item": "Litters"}'::jsonb),
    ('calendar_tasking.equipment_changed', 'Range detail', '{"item": "Field litters"}'::jsonb),
    ('calendar_tasking.equipment_added', 'Range detail', '{"item": "Radios"}'::jsonb),
    ('calendar_tasking.equipment_removed', 'Range detail', '{"item": "Radios"}'::jsonb),
    ('calendar_tasking.checklist_added', 'Range detail', '{"item": "Confirm radios"}'::jsonb),
    ('calendar_tasking.checklist_renamed', 'Range detail', '{"item": "Confirm net check"}'::jsonb),
    ('calendar_tasking.checklist_completed', 'Range detail', '{"item": "Confirm net check"}'::jsonb),
    ('calendar_tasking.checklist_reopened', 'Range detail', '{"item": "Confirm net check"}'::jsonb),
    ('calendar_tasking.checklist_removed', 'Range detail', '{"item": "Confirm net check"}'::jsonb) $$,
  'equipment and checklist changes name the item against their tasking, and a reorder writes nothing here');

-- A return is recorded on a completed tasking too.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
INSERT INTO public.calendar_taskings (id, organization_id, title, suspense_on)
VALUES (pg_temp.id('405'), pg_temp.id('101'), 'Returns detail', '2030-11-10');
INSERT INTO public.calendar_tasking_equipment (id, organization_id, tasking_id, name, quantity, secured_quantity)
VALUES (pg_temp.id('503'), pg_temp.id('101'), pg_temp.id('405'), 'Tents', 3, 3);
SELECT pg_temp.move('405', 'start');
SELECT pg_temp.move('405', 'complete');
UPDATE public.calendar_tasking_equipment SET returned_quantity = 2 WHERE id = pg_temp.id('503');
RESET ROLE;
SELECT bag_eq(
  $$ SELECT action, details FROM pg_temp.entries('405') WHERE action ~ 'equipment' $$,
  $$ VALUES ('calendar_tasking.equipment_added', '{"item": "Tents"}'::jsonb),
            ('calendar_tasking.equipment_changed', '{"item": "Tents"}'::jsonb) $$,
  'a return recorded on a completed tasking writes its own entry');

-- A renamed tasking leaves earlier entries as they were written.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
UPDATE public.calendar_taskings SET title = 'Range detail (final)' WHERE id = pg_temp.id('401');
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE resource_id = pg_temp.id('401') AND record_label = 'Range detail'),
  17, 'a rename leaves the labels already saved untouched');
SELECT is(
  (SELECT record_label FROM public.audit_logs
   WHERE resource_id = pg_temp.id('401') AND action = 'calendar_tasking.updated' AND details -> 'change' ? 'title'),
  'Range detail (final)', 'and the new entry carries the new name');

-- Deleting an event with its taskings writes one entry for each.
INSERT INTO public.calendar_events (id, organization_id, title, starts_on, ends_on, coordinator_user_id)
VALUES (pg_temp.id('302'), pg_temp.id('101'), 'Dropped event', '2030-12-01', '2030-12-01', pg_temp.id('1'));
INSERT INTO public.calendar_taskings (id, organization_id, title, event_id, suspense_on)
VALUES (pg_temp.id('403'), pg_temp.id('101'), 'Dropped detail', pg_temp.id('302'), '2030-12-01');
UPDATE public.calendar_events SET cancelled_at = now(), cancelled_by = pg_temp.id('1') WHERE id = pg_temp.id('302');
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT public.delete_calendar_event(pg_temp.id('101'), pg_temp.id('302'), 'delete');
RESET ROLE;
SELECT results_eq(
  $$ SELECT action, user_id, actor_label FROM public.audit_logs
     WHERE resource_id IN (pg_temp.id('302'), pg_temp.id('403')) AND action LIKE '%.deleted' ORDER BY action $$,
  $$ VALUES
    ('calendar_event.deleted', pg_temp.id('1'), 'SSG Rivera, Sam'),
    ('calendar_tasking.deleted', pg_temp.id('1'), 'SSG Rivera, Sam') $$,
  'deleting an event and its taskings saves the actor on both entries');

-- A failed audit write fails the change.
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_test_rejects_tasking CHECK (action <> 'calendar_tasking.created') NOT VALID;
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.calendar_taskings (id, organization_id, title, suspense_on)
     VALUES (pg_temp.id('404'), pg_temp.id('101'), 'Rejected', '2030-12-02') $$,
  '23514', NULL, 'a tasking whose audit write fails raises the failure');
RESET ROLE;
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_test_rejects_tasking;
SELECT is((SELECT count(*)::integer FROM public.calendar_taskings WHERE id = pg_temp.id('404')), 0, 'and the change is rolled back');

-- A client cannot forge the actor or label.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.audit_logs (user_id, actor_label, org_id, action, resource_type, record_label)
     VALUES (pg_temp.id('1'), 'GEN Forged, Actor', pg_temp.id('101'), 'calendar_event.created', 'calendar_event', 'Range week') $$,
  '42501', NULL, 'a member cannot write an event entry with a forged actor or label');
RESET ROLE;

-- Rows removed with their unit leave the unit deletion as the audited event.
SELECT pg_temp.act_as('1');
SELECT lives_ok($$ DELETE FROM public.organizations WHERE id = pg_temp.id('101') $$,
  'a unit with events and taskings can still be deleted');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
    WHERE action IN ('calendar_event.deleted', 'calendar_tasking.deleted') AND resource_id = pg_temp.id('301')),
  0, 'events removed with their unit leave no deleted entry');

SELECT * FROM finish();
ROLLBACK;
