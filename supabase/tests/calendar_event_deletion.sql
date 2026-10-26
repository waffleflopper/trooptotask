BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('de1e0000-0000-4000-8000-' || lpad(p_suffix::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n), 'authenticated', 'authenticated', 'event-delete-' || n || '@example.test', now()
FROM generate_series(1, 6) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id(101), 'Deletion Alpha', pg_temp.id(1)),
  (pg_temp.id(102), 'Deletion Other', pg_temp.id(6));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.id(201), pg_temp.id(101), 'Alpha'), (pg_temp.id(202), pg_temp.id(101), 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id(101), pg_temp.id(1), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(2), 'member', 'viewer', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(3), 'member', 'viewer', '{"calendar":"operate"}', 'groups', ARRAY[pg_temp.id(201)]),
  (pg_temp.id(101), pg_temp.id(4), 'member', 'viewer', '{"calendar":"view"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(5), 'member', 'viewer', '{"calendar":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(102), pg_temp.id(6), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id(501), pg_temp.id(101), NULL, 'SPC', 'Ana', 'Adams', 'deletion-501'),
  (pg_temp.id(502), pg_temp.id(101), pg_temp.id(201), 'SGT', 'Ben', 'Baker', 'deletion-502'),
  (pg_temp.id(503), pg_temp.id(101), pg_temp.id(202), 'PFC', 'Cal', 'Cole', 'deletion-503');
INSERT INTO public.status_types (id, organization_id, name, roster_effect)
VALUES (pg_temp.id(601), pg_temp.id(101), 'Away', 'A');

-- Observe the FK's hidden provenance column without granting clients a read or bypassing RLS.
CREATE TEMP TABLE provenance_updates (id uuid, tasking_id uuid);
GRANT SELECT, INSERT ON pg_temp.provenance_updates TO authenticated;
CREATE FUNCTION pg_temp.observe_provenance() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  INSERT INTO pg_temp.provenance_updates VALUES (NEW.id, NEW.set_for_tasking_id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER observe_deletion_provenance AFTER UPDATE OF set_for_tasking_id ON public.availability_entries
FOR EACH ROW EXECUTE FUNCTION pg_temp.observe_provenance();

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as(1);
INSERT INTO public.calendar_events (id, organization_id, title, starts_on, ends_on, coordinator_user_id)
SELECT pg_temp.id(n), pg_temp.id(101), 'Best Medic Competition', '2030-10-19', '2030-10-23', pg_temp.id(1)
FROM generate_series(301, 307) n;
INSERT INTO public.calendar_taskings (id, organization_id, event_id, title, responsible_group_id, suspense_on,
  execution_starts_on, execution_ends_on, staffing_required)
SELECT pg_temp.id(n), pg_temp.id(101), pg_temp.id(301 + (n - 401) / 10), 'Provide medics ' || n,
  CASE n % 3 WHEN 1 THEN pg_temp.id(201) WHEN 2 THEN pg_temp.id(202) END,
  '2030-10-18', '2030-10-19', '2030-10-23', 1
FROM unnest(ARRAY[401,402,403,404,405,411,412,413,414,415,421,422,423,424,425,431,432,433,434,435]) n;
INSERT INTO public.calendar_taskings (id, organization_id, event_id, title, suspense_on)
VALUES (pg_temp.id(441), pg_temp.id(101), pg_temp.id(307), 'Untouched tasking', '2030-10-18');
SELECT public.save_calendar_tasking_people(pg_temp.id(101), pg_temp.id(n), ARRAY[pg_temp.id(501 + n % 3)], '{}', false, 0)
FROM unnest(ARRAY[401,402,403,404,405,411,412,413,414,415,421,422,423,424,425,431,432,433,434,435]) n;
INSERT INTO public.calendar_tasking_equipment (id, organization_id, tasking_id, name, quantity, secured_quantity)
SELECT pg_temp.id(n + 1000), pg_temp.id(101), pg_temp.id(n), 'Aid bags', 4, 2
FROM unnest(ARRAY[401,402,403,404,405,411,412,413,414,415,421,422,423,424,425,431,432,433,434,435,441]) n;
INSERT INTO public.calendar_tasking_checklist_items (id, organization_id, tasking_id, label)
SELECT pg_temp.id(n + 2000), pg_temp.id(101), pg_temp.id(n), 'Collect bags'
FROM unnest(ARRAY[401,402,403,404,405,411,412,413,414,415,421,422,423,424,425,431,432,433,434,435,441]) n;
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date, set_for_tasking_id)
SELECT pg_temp.id(n + 3000), pg_temp.id(101), pg_temp.id(501 + n % 3), pg_temp.id(601),
  '2030-10-19', '2030-10-23', pg_temp.id(n)
FROM unnest(ARRAY[401,411,421,431]) n;
SELECT public.transition_calendar_tasking(pg_temp.id(101), pg_temp.id(n),
  CASE n % 10 WHEN 2 THEN 'start' WHEN 3 THEN 'block' WHEN 4 THEN 'complete' WHEN 5 THEN 'cancel' END,
  CASE WHEN n % 10 = 3 THEN 'Waiting for transport' END)
FROM unnest(ARRAY[402,403,404,405,412,413,414,415,422,423,424,425,432,433,434,435]) n;
SELECT public.cancel_calendar_event(pg_temp.id(101), pg_temp.id(302), 'Range closed');
SELECT public.cancel_calendar_event(pg_temp.id(101), pg_temp.id(304), 'Range closed');

CREATE TEMP TABLE before_taskings AS SELECT * FROM public.calendar_taskings;
CREATE TEMP TABLE before_picks AS SELECT * FROM public.calendar_tasking_participants;
CREATE TEMP TABLE before_equipment AS SELECT * FROM public.calendar_tasking_equipment;
CREATE TEMP TABLE before_checklist AS SELECT * FROM public.calendar_tasking_checklist_items;
CREATE TEMP TABLE before_activity AS SELECT * FROM public.read_calendar_tasking_activity(pg_temp.id(101));
CREATE TEMP TABLE before_events AS SELECT * FROM public.calendar_events;
CREATE TEMP TABLE before_event_activity AS SELECT * FROM public.calendar_event_activity;

SELECT pg_temp.act_as(6);
INSERT INTO public.calendar_events (id, organization_id, title, starts_on, ends_on, coordinator_user_id)
VALUES (pg_temp.id(308), pg_temp.id(102), 'Other Organization event', '2030-10-19', '2030-10-23', pg_temp.id(6));

SELECT pg_temp.act_as(3);
SELECT throws_ok($$SELECT public.delete_calendar_event(pg_temp.id(101), pg_temp.id(307), 'standalone')$$,
  '42501', NULL, 'a Group-scoped operator cannot unlink Taskings by deleting an Event');
SELECT throws_ok($$SELECT public.delete_calendar_event(pg_temp.id(101), pg_temp.id(307), 'delete')$$,
  '42501', NULL, 'a Group-scoped operator cannot delete an Event and its Taskings');
SELECT pg_temp.act_as(4);
SELECT throws_ok($$SELECT public.delete_calendar_event(pg_temp.id(101), pg_temp.id(307), 'delete')$$,
  '42501', NULL, 'a Calendar viewer cannot delete an Event');
SELECT pg_temp.act_as(5);
SELECT throws_ok($$SELECT public.delete_calendar_event(pg_temp.id(101), pg_temp.id(307), 'delete')$$,
  '42501', NULL, 'a member without Calendar cannot delete an Event');
SELECT pg_temp.act_as(2);
SELECT throws_ok($$SELECT public.delete_calendar_event(pg_temp.id(102), pg_temp.id(308), 'delete')$$,
  '42501', NULL, 'another Organization is refused before disclosing a real Event');
SELECT throws_ok($$SELECT public.delete_calendar_event(pg_temp.id(102), pg_temp.id(999), 'delete')$$,
  '42501', NULL, 'another Organization gets the same refusal for an unknown Event');
SELECT throws_ok($$SELECT public.delete_calendar_event(pg_temp.id(101), pg_temp.id(308), 'delete')$$,
  'P0002', 'Event not found', 'a foreign Event id under the caller''s Organization is concealed as missing');
SELECT throws_ok($$SELECT public.delete_calendar_event(pg_temp.id(101), pg_temp.id(307), 'archive')$$,
  '22023', NULL, 'an unknown mode is refused');
SELECT throws_ok($$SELECT public.delete_calendar_event(pg_temp.id(101), pg_temp.id(307), NULL)$$,
  '22023', NULL, 'a NULL mode is refused');
SELECT results_eq('TABLE public.calendar_events', 'TABLE before_events', 'refused calls leave every visible Event unchanged');
SELECT results_eq('TABLE public.calendar_taskings', 'TABLE before_taskings', 'refused calls leave all Taskings unchanged');
SELECT results_eq('TABLE public.calendar_tasking_equipment', 'TABLE before_equipment', 'refused calls retain equipment');
SELECT results_eq('TABLE public.calendar_tasking_checklist_items', 'TABLE before_checklist', 'refused calls retain checklists');
SELECT results_eq('SELECT * FROM public.read_calendar_tasking_activity(pg_temp.id(101))', 'TABLE before_activity',
  'refused calls add no Tasking Activity');
SELECT results_eq('TABLE public.calendar_event_activity', 'TABLE before_event_activity', 'refused calls retain Event Activity');
SELECT throws_ok($$UPDATE public.calendar_taskings SET event_id = NULL WHERE id = pg_temp.id(404)$$,
  '55000', NULL, 'the ordinary edit path still cannot unlink a completed Tasking');
SELECT throws_ok($$UPDATE public.calendar_taskings SET event_id = NULL WHERE id = pg_temp.id(405)$$,
  '55000', NULL, 'the ordinary edit path still cannot unlink a cancelled Tasking');

SELECT results_eq($$SELECT * FROM public.delete_calendar_event(pg_temp.id(101), pg_temp.id(301), 'standalone')$$,
  $$VALUES (5)$$, 'an operator deletes an active Event and counts all five unlinked Taskings');
SELECT results_eq($$SELECT * FROM public.delete_calendar_event(pg_temp.id(101), pg_temp.id(302), 'standalone')$$,
  $$VALUES (5)$$, 'an operator deletes a cancelled Event and counts all five unlinked Taskings');
SELECT results_eq(
  $$SELECT id, event_id, status FROM public.calendar_taskings WHERE id IN (
    pg_temp.id(401),pg_temp.id(402),pg_temp.id(403),pg_temp.id(404),pg_temp.id(405)) ORDER BY id$$,
  $$VALUES (pg_temp.id(401),NULL::uuid,'open'::text), (pg_temp.id(402),NULL::uuid,'in_progress'),
    (pg_temp.id(403),NULL::uuid,'blocked'), (pg_temp.id(404),NULL::uuid,'completed'), (pg_temp.id(405),NULL::uuid,'cancelled')$$,
  'unlinking retains every Tasking identity and status');
SELECT results_eq(
  $$SELECT to_jsonb(t) - ARRAY['event_id','updated_at','updated_by'] FROM public.calendar_taskings t
    WHERE t.id BETWEEN pg_temp.id(401) AND pg_temp.id(415) ORDER BY t.id$$,
  $$SELECT to_jsonb(t) - ARRAY['event_id','updated_at','updated_by'] FROM before_taskings t
    WHERE t.id BETWEEN pg_temp.id(401) AND pg_temp.id(415) ORDER BY t.id$$,
  'unlinking preserves all other Tasking fields, including historical attribution and dates');
SELECT results_eq(
  $$SELECT tasking_id, actor_id, kind, payload FROM public.read_calendar_tasking_activity(pg_temp.id(101))
    WHERE kind = 'event_deleted' ORDER BY tasking_id$$,
  $$SELECT pg_temp.id(n), pg_temp.id(2), 'event_deleted'::text,
    jsonb_build_object('eventId', pg_temp.id(CASE WHEN n < 410 THEN 301 ELSE 302 END), 'eventTitle', 'Best Medic Competition')
    FROM unnest(ARRAY[401,402,403,404,405,411,412,413,414,415]) n ORDER BY n$$,
  'each retained Tasking gets exactly one deletion Activity with the Event title and signed-in actor');
SELECT is((SELECT count(*) FROM public.read_calendar_tasking_activity(pg_temp.id(101)) WHERE kind = 'unlinked'), 0::bigint,
  'the FK unlink adds no duplicate generic Activity');
SELECT results_eq(
  $$SELECT id, actor_id, kind, payload FROM public.read_calendar_tasking_activity(pg_temp.id(101)) WHERE kind <> 'event_deleted' ORDER BY id$$,
  $$SELECT id, actor_id, kind, payload FROM before_activity ORDER BY id$$,
  'unlinking preserves every prior Activity entry');
SELECT results_eq('TABLE public.calendar_tasking_participants', 'TABLE before_picks', 'unlinking retains picks');
SELECT results_eq('TABLE public.calendar_tasking_equipment', 'TABLE before_equipment', 'unlinking retains equipment');
SELECT results_eq('TABLE public.calendar_tasking_checklist_items', 'TABLE before_checklist', 'unlinking retains checklists');

SELECT results_eq($$SELECT * FROM public.delete_calendar_event(pg_temp.id(101), pg_temp.id(303), 'delete')$$,
  $$VALUES (5)$$, 'an operator deletes every linked Tasking under an active Event, whatever its status');
SELECT results_eq($$SELECT * FROM public.delete_calendar_event(pg_temp.id(101), pg_temp.id(304), 'delete')$$,
  $$VALUES (5)$$, 'an operator deletes every linked Tasking under a cancelled Event, whatever its status');
SELECT is((SELECT count(*) FROM public.calendar_taskings WHERE id BETWEEN pg_temp.id(421) AND pg_temp.id(435)), 0::bigint,
  'all Taskings selected for deletion are gone');
SELECT is((SELECT count(*) FROM public.calendar_tasking_participants WHERE tasking_id BETWEEN pg_temp.id(421) AND pg_temp.id(435)), 0::bigint,
  'their picks cascade away');
SELECT is((SELECT count(*) FROM public.calendar_tasking_equipment WHERE tasking_id BETWEEN pg_temp.id(421) AND pg_temp.id(435)), 0::bigint,
  'their equipment cascades away');
SELECT is((SELECT count(*) FROM public.calendar_tasking_checklist_items WHERE tasking_id BETWEEN pg_temp.id(421) AND pg_temp.id(435)), 0::bigint,
  'their checklist items cascade away');
SELECT is((SELECT count(*) FROM public.read_calendar_tasking_activity(pg_temp.id(101)) WHERE tasking_id BETWEEN pg_temp.id(421) AND pg_temp.id(435)), 0::bigint,
  'deleted Taskings have no readable Activity');
SELECT results_eq($$SELECT * FROM public.delete_calendar_event(pg_temp.id(101), pg_temp.id(305), 'standalone')$$,
  $$VALUES (0)$$, 'standalone mode deletes an Event with no Taskings');
SELECT results_eq($$SELECT * FROM public.delete_calendar_event(pg_temp.id(101), pg_temp.id(306), 'delete')$$,
  $$VALUES (0)$$, 'delete mode deletes an Event with no Taskings');
SELECT results_eq($$SELECT id FROM public.calendar_events ORDER BY id$$, $$VALUES (pg_temp.id(307))$$,
  'only the unrelated Event remains');
SELECT results_eq($$SELECT event_id, kind FROM public.calendar_event_activity ORDER BY event_id, id$$,
  $$VALUES (pg_temp.id(307), 'created'::text)$$, 'Event Activity cascades away');
SELECT results_eq($$SELECT id, event_id, title FROM public.calendar_taskings WHERE id = pg_temp.id(441)$$,
  $$VALUES (pg_temp.id(441), pg_temp.id(307), 'Untouched tasking'::text)$$, 'the unrelated linked Tasking stays intact');
SELECT throws_ok($$SELECT public.delete_calendar_event(pg_temp.id(101), pg_temp.id(301), 'standalone')$$,
  'P0002', 'Event not found', 'a deleted Event returns not found on retry');
SELECT is(has_function_privilege('anon', 'public.delete_calendar_event(uuid,uuid,text)', 'EXECUTE'), false,
  'anon and PUBLIC have no EXECUTE grant');
SELECT is(has_function_privilege('service_role', 'public.delete_calendar_event(uuid,uuid,text)', 'EXECUTE'), false,
  'the RPC is not granted to service_role');
SELECT pg_temp.act_as(6);
SELECT results_eq($$SELECT id, title FROM public.calendar_events$$,
  $$VALUES (pg_temp.id(308), 'Other Organization event'::text)$$, 'another Organization''s Event stays unchanged');

SELECT pg_temp.act_as(2);
SELECT results_eq('SELECT * FROM pg_temp.provenance_updates ORDER BY id',
  $$VALUES (pg_temp.id(3421),NULL::uuid), (pg_temp.id(3431),NULL::uuid)$$,
  'the FK clears provenance for deleted Taskings only, leaving standalone provenance unchanged');
SELECT results_eq(
  $$SELECT id, personnel_id, status_type_id, start_date, end_date FROM public.availability_entries ORDER BY id$$,
  $$VALUES (pg_temp.id(3401),pg_temp.id(503),pg_temp.id(601),'2030-10-19'::date,'2030-10-23'::date),
    (pg_temp.id(3411),pg_temp.id(501),pg_temp.id(601),'2030-10-19'::date,'2030-10-23'::date),
    (pg_temp.id(3421),pg_temp.id(502),pg_temp.id(601),'2030-10-19'::date,'2030-10-23'::date),
    (pg_temp.id(3431),pg_temp.id(503),pg_temp.id(601),'2030-10-19'::date,'2030-10-23'::date)$$,
  'Availability retains its identities, People, statuses and dates');

SELECT * FROM finish();
ROLLBACK;
