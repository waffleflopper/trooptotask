-- The Dashboard's Tasking attention puts each active Tasking under its most urgent kind from the viewer's
-- day, counts only picks that fill a requirement, and shows each reader only the work their scope covers.
-- Every read below runs as an ordinary signed-in member.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a5d0000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;

-- 1 owner, 2 Organization-wide Calendar operator, 3 Alpha-scoped Calendar operator,
-- 4 Organization-wide Calendar viewer, 5 member without Calendar, 6 another Organization's owner.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'parity-' || n || '@example.test', now()
FROM generate_series(1, 6) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Attention Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Attention Other', pg_temp.id('6'));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.id('201'), pg_temp.id('101'), 'Alpha'),
  (pg_temp.id('202'), pg_temp.id('101'), 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'viewer', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{"calendar":"operate"}', 'groups', ARRAY[pg_temp.id('201')]),
  (pg_temp.id('101'), pg_temp.id('4'), 'member', 'viewer', '{"calendar":"view"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('5'), 'member', 'viewer', '{"calendar":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('102'), pg_temp.id('6'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('501'), pg_temp.id('101'), pg_temp.id('201'), 'SPC', 'Ana', 'Adams', 'parity-501'),
  (pg_temp.id('502'), pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Ben', 'Baker', 'parity-502'),
  (pg_temp.id('503'), pg_temp.id('101'), pg_temp.id('202'), 'PFC', 'Cal', 'Cole', 'parity-503');
INSERT INTO public.calendar_events (id, organization_id, title, starts_on, ends_on, coordinator_user_id) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'Ranger Challenge', '2030-10-22', '2030-10-26', pg_temp.id('1'));


INSERT INTO public.user_profiles(user_id, rank, first_name, last_name)
VALUES(pg_temp.id('2'), 'SFC', 'Dana', 'Whitaker');
INSERT INTO public.status_types(id, organization_id, name, roster_effect) VALUES
  (pg_temp.id('601'), pg_temp.id('101'), 'Leave', 'A'),
  (pg_temp.id('602'), pg_temp.id('101'), 'Available', 'available');
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.workspace() RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.calendar_tasking_workspace(pg_temp.id('101'), '2030-10-19');
$$;
CREATE FUNCTION pg_temp.dashboard() RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.calendar_tasking_dashboard(pg_temp.id('101'), '2030-10-19');
$$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
INSERT INTO public.calendar_taskings(id, organization_id, event_id, title, responsible_group_id, suspense_on,
  execution_starts_on, execution_ends_on, staffing_required) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), pg_temp.id('301'), 'Alpha lane', pg_temp.id('201'), '2030-10-23', '2030-10-19', '2030-10-23', 2),
  (pg_temp.id('402'), pg_temp.id('101'), pg_temp.id('301'), 'Hidden graders', NULL, '2030-10-23', '2030-10-19', '2030-10-23', 1),
  (pg_temp.id('403'), pg_temp.id('101'), pg_temp.id('301'), 'Bravo lane', pg_temp.id('202'), '2030-10-23', '2030-10-19', '2030-10-23', 1),
  (pg_temp.id('404'), pg_temp.id('101'), NULL, 'Submit slides', pg_temp.id('201'), '2030-10-20', NULL, NULL, NULL);
SELECT public.save_calendar_tasking_people(pg_temp.id('101'), pg_temp.id('401'), ARRAY[pg_temp.id('501'),pg_temp.id('502')], '{}', false, 0);
SELECT public.save_calendar_tasking_people(pg_temp.id('101'), pg_temp.id('402'), ARRAY[pg_temp.id('501')], '{}', false, 0);
SELECT public.save_calendar_tasking_people(pg_temp.id('101'), pg_temp.id('403'), ARRAY[pg_temp.id('503')], '{}', false, 0);
INSERT INTO public.availability_entries(id, organization_id, personnel_id, status_type_id, start_date, end_date, set_for_tasking_id) VALUES
  (pg_temp.id('701'), pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), '2030-10-21', '2030-10-23', NULL),
  (pg_temp.id('702'), pg_temp.id('101'), pg_temp.id('502'), pg_temp.id('601'), '2030-10-19', '2030-10-23', pg_temp.id('401')),
  (pg_temp.id('703'), pg_temp.id('101'), pg_temp.id('502'), pg_temp.id('602'), '2030-10-19', '2030-10-23', NULL),
  (pg_temp.id('704'), pg_temp.id('101'), pg_temp.id('503'), pg_temp.id('601'), '2030-10-19', '2030-10-23', NULL),
  (pg_temp.id('705'), pg_temp.id('101'), pg_temp.id('501'), pg_temp.id('601'), '2030-12-01', '2030-12-02', pg_temp.id('402'));
SELECT results_eq($$SELECT rank, first_name, last_name FROM public.organization_member_labels(pg_temp.id('101')) WHERE user_id=pg_temp.id('2')$$,
  $$VALUES ('SFC'::text,'Dana'::text,'Whitaker'::text)$$, 'ordinary members read profile labels of current Organization members');
SELECT is((SELECT count(*) FROM public.organization_member_labels(pg_temp.id('102'))), 0::bigint, 'foreign member labels are hidden');
SELECT results_eq($$SELECT is_conflict, overlap_days, execution_days FROM public.calendar_tasking_advisories(pg_temp.id('101'),pg_temp.id('401')) WHERE personnel_id=pg_temp.id('501') AND kind='availability'$$,
  $$VALUES (true,3,5)$$,'leave overlaps three of five execution days');
SELECT ok((SELECT bool_and(NOT is_conflict) FROM public.calendar_tasking_advisories(pg_temp.id('101'),pg_temp.id('401')) WHERE personnel_id=pg_temp.id('502') AND kind='availability'), 'own entries and available statuses do not conflict');
SELECT results_eq($$SELECT personnel_id,covered FROM public.calendar_tasking_availability_gaps(pg_temp.id('101'),pg_temp.id('401'))$$,
  $$VALUES (pg_temp.id('501'),false),(pg_temp.id('502'),true)$$,'leave is not coverage; the Tasking own entry is coverage');
SELECT is((pg_temp.workspace()->'taskings'->pg_temp.id('401')::text->>'conflicts')::integer,1,'list counts picks with conflicts, not availability rows');
SELECT is((pg_temp.workspace()->'events'->pg_temp.id('301')::text->>'conflicts')::integer,3,'Event counts conflicts across Taskings');
SELECT is((SELECT count(*) FROM jsonb_array_elements(pg_temp.dashboard()->'rows') r WHERE r->>'kind'='conflict'),3::bigint,'dashboard names one conflict for each visible person and Tasking');
SELECT is((SELECT jsonb_array_length(pg_temp.dashboard()->'onTrack')),1,'on-track due-soon work has its own list');
SELECT is((SELECT count(*) FROM jsonb_array_elements(pg_temp.dashboard()->'rows') r WHERE r->>'tasking_id'=pg_temp.id('404')::text),0::bigint,'on-track work does not appear under Needs you');
SELECT ok((SELECT (r->>'conflicts')::boolean FROM jsonb_array_elements(public.calendar_range_projection(pg_temp.id('101'),'2030-10-19','2030-10-23')->'commitments') r WHERE r->>'taskingId'=pg_temp.id('401')::text AND r->>'personnelId'=pg_temp.id('501')::text),'Calendar commitment carries its conflict');
SELECT ok(NOT (SELECT (r->>'conflicts')::boolean FROM jsonb_array_elements(public.calendar_range_projection(pg_temp.id('101'),'2030-10-19','2030-10-23')->'commitments') r WHERE r->>'taskingId'=pg_temp.id('401')::text AND r->>'personnelId'=pg_temp.id('502')::text),'own availability is a clear Calendar commitment');
INSERT INTO public.calendar_tasking_equipment(id,organization_id,tasking_id,name,quantity,secured_quantity)
VALUES(pg_temp.id('801'),pg_temp.id('101'),pg_temp.id('404'),'Aid bags',4,4);
UPDATE public.calendar_tasking_equipment SET returned_quantity=2 WHERE id=pg_temp.id('801');
SELECT is((pg_temp.workspace()->'taskings'->pg_temp.id('404')::text->'equipment'->>'returnedQuantity')::integer,2,'list returns returned units independently of ready requirements');
SELECT is((SELECT actor_id FROM public.read_calendar_tasking_activity(pg_temp.id('101'),pg_temp.id('404')) WHERE kind='equipment_returned'),pg_temp.id('2'),'return attribution comes from the signed-in writer');
SELECT throws_ok($$UPDATE public.calendar_tasking_equipment SET returned_quantity=5 WHERE id=pg_temp.id('801')$$,'23514',NULL,'returned units cannot exceed required quantity');
SELECT pg_temp.act_as('3');
SELECT throws_ok($$SELECT set_for_tasking_id FROM public.availability_entries$$,'42501',NULL,'raw Availability reads cannot expose hidden Tasking provenance');
SELECT is((SELECT count(*) FROM public.user_profiles WHERE user_id=pg_temp.id('2')),0::bigint,'profile table remains self-only for ordinary members');
SELECT is((SELECT first_name FROM public.organization_member_labels(pg_temp.id('101')) WHERE user_id=pg_temp.id('2')),'Dana','Group-scoped members resolve shared Organization member names');
SELECT throws_ok($$INSERT INTO public.availability_entries(organization_id,personnel_id,status_type_id,start_date,end_date,set_for_tasking_id) VALUES(pg_temp.id('101'),pg_temp.id('501'),pg_temp.id('601'),'2030-10-19','2030-10-23',pg_temp.id('402'))$$,'42501',NULL,'scoped writer cannot attach to hidden Tasking');
SELECT throws_ok($$UPDATE public.availability_entries SET set_for_tasking_id=pg_temp.id('402') WHERE id=pg_temp.id('701')$$,'42501',NULL,'direct update cannot attach hidden provenance');
SELECT throws_ok($$UPDATE public.availability_entries SET set_for_tasking_id=pg_temp.id('402') WHERE id=pg_temp.id('705')$$,'42501',NULL,'a no-op write cannot confirm hidden provenance');
SELECT lives_ok($$UPDATE public.availability_entries SET note='Range day' WHERE id=pg_temp.id('705')$$,'scoped writer still edits an entry set for hidden work');
SELECT throws_ok($$INSERT INTO public.availability_entries(organization_id,personnel_id,status_type_id,start_date,end_date,set_for_tasking_id) VALUES(pg_temp.id('101'),pg_temp.id('501'),pg_temp.id('601'),'2030-10-19','2030-10-23',pg_temp.id('999'))$$,'42501',NULL,'unknown Tasking is refused without disclosure');
SELECT is((SELECT count(*) FROM public.calendar_tasking_advisories(pg_temp.id('101'),pg_temp.id('401')) WHERE personnel_id=pg_temp.id('503')),0::bigint,'scoped advisories never name hidden people');
SELECT ok(EXISTS(SELECT 1 FROM public.calendar_tasking_advisories(pg_temp.id('101'),pg_temp.id('401')) WHERE kind='tasking' AND label IS NULL AND other_tasking_id IS NULL AND starts_on IS NULL),'hidden commitment is generic');
SELECT ok(NOT (pg_temp.workspace()->'taskings' ? pg_temp.id('402')::text),'workspace excludes hidden Tasking facts');
SELECT is((pg_temp.workspace()->'events'->pg_temp.id('301')::text->>'total')::integer,3,'Event aggregate includes hidden work');
SELECT is((SELECT count(*) FROM jsonb_array_elements(pg_temp.dashboard()->'rows') r WHERE r->>'kind'='conflict'),1::bigint,'scoped Dashboard has only Alpha conflict');
SELECT ok(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.dashboard()->'rows') r WHERE r->>'tasking_id'=pg_temp.id('402')::text OR r->'conflict'->>'personnelId'=pg_temp.id('503')::text),'Dashboard does not disclose hidden work or people');
SELECT throws_ok($$SELECT * FROM calendar_private.tasking_conflicts(pg_temp.id('101'))$$,'42501',NULL,'unredacted conflict helper is not callable by members');
SELECT pg_temp.act_as('2');
UPDATE public.availability_entries SET set_for_tasking_id=pg_temp.id('401') WHERE id=pg_temp.id('701');
SELECT is((pg_temp.workspace()->'taskings'->pg_temp.id('401')::text->>'conflicts')::integer,0,'linking status to this Tasking clears its conflict');
SELECT is((pg_temp.workspace()->'taskings'->pg_temp.id('402')::text->>'conflicts')::integer,1,'the same entry still conflicts with another Tasking');
SELECT public.transition_calendar_tasking(pg_temp.id('101'),pg_temp.id('402'),'complete',NULL);
SELECT is((SELECT count(*) FROM public.calendar_tasking_conflict_people(pg_temp.id('101')) WHERE tasking_id=pg_temp.id('402')),0::bigint,'completed work has no conflicts');
RESET ROLE;
UPDATE public.personnel SET archived_at=now() WHERE id IN (pg_temp.id('501'),pg_temp.id('503'));
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.calendar_tasking_conflict_people(pg_temp.id('101')) WHERE personnel_id=pg_temp.id('503')),0::bigint,'archived picks never conflict');
SELECT is((pg_temp.workspace()->'taskings'->pg_temp.id('402')::text->>'picked')::integer,1,
  'a completed Tasking keeps counting a pick archived afterwards');
SELECT is((SELECT picked FROM public.calendar_tasking_staffing(pg_temp.id('101'),ARRAY[pg_temp.id('402')])),1,
  'its detail count agrees');
SELECT pg_temp.act_as('6');
INSERT INTO public.calendar_taskings(id,organization_id,title,responsible_group_id,suspense_on)
VALUES(pg_temp.id('405'),pg_temp.id('102'),'Foreign',NULL,'2030-10-23');
SELECT pg_temp.act_as('2');
SELECT throws_ok($$UPDATE public.availability_entries SET set_for_tasking_id=pg_temp.id('405') WHERE id=pg_temp.id('701')$$,'42501',NULL,'Organization-wide writer cannot attach foreign Tasking');
RESET ROLE;
DELETE FROM public.calendar_taskings WHERE id=pg_temp.id('401');
SELECT is((SELECT set_for_tasking_id FROM public.availability_entries WHERE id=pg_temp.id('702')),NULL::uuid,'foreign key clears only the Tasking reference');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
SELECT results_eq($$SELECT id,organization_id,personnel_id,status_type_id,start_date,end_date FROM public.availability_entries WHERE id=pg_temp.id('702')$$,
  $$VALUES (pg_temp.id('702'),pg_temp.id('101'),pg_temp.id('502'),pg_temp.id('601'),'2030-10-19'::date,'2030-10-23'::date)$$,
  'Tasking deletion clears provenance only and retains the Availability identity, Organization, Person, status and dates');
SELECT pg_temp.act_as('5');
SELECT is(pg_temp.workspace()->'taskings','{}'::jsonb,'no Calendar grant returns no Tasking facts');
SELECT is(pg_temp.workspace()->'events','{}'::jsonb,'no Calendar grant returns no Event aggregates');
SELECT is(pg_temp.dashboard()->'rows','[]'::jsonb,'no Calendar grant returns no attention rows');
SELECT * FROM finish();
ROLLBACK;
