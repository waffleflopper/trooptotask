-- The upgrade trims returns down to what was secured, quietly, and keeps everything else about each item.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT results_eq(
  $$SELECT id, returned_quantity FROM public.calendar_tasking_equipment
    WHERE organization_id = 'e9a10000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$VALUES ('e9a10000-0000-4000-8000-000000000501'::uuid, 2),
    ('e9a10000-0000-4000-8000-000000000502'::uuid, 3),
    ('e9a10000-0000-4000-8000-000000000503'::uuid, 0)$$,
  'a return above the secured count is trimmed to it and a return within it is untouched');
SELECT results_eq(
  $$SELECT id, to_jsonb(e) - 'returned_quantity' FROM public.calendar_tasking_equipment e
    WHERE organization_id = 'e9a10000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$SELECT id, saved - 'returned_quantity' FROM upgrade_fixture.equipment_returned_before ORDER BY id$$,
  'trimming keeps every item''s name, quantities, order, authorship and update time');
SELECT results_eq(
  $$SELECT id, tasking_id, kind, actor_id, payload FROM public.calendar_tasking_activity
    WHERE organization_id = 'e9a10000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$SELECT id, tasking_id, kind, actor_id, payload FROM upgrade_fixture.equipment_returned_activity_before ORDER BY id$$,
  'trimming writes no Tasking Activity');
SELECT results_eq(
  $$SELECT details FROM public.audit_logs
    WHERE org_id = 'e9a10000-0000-4000-8000-000000000101' AND action = 'calendar_tasking.equipment_changed'
      AND user_id IS NULL ORDER BY details->>'item'$$,
  $$VALUES ('{"item": "Litters"}'::jsonb), ('{"item": "Tents"}'::jsonb)$$,
  'the audit log records each trimmed item, with no member named');
SELECT is((SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.calendar_tasking_equipment'::regclass
    AND tgname IN ('stamp_calendar_tasking_equipment', 'record_tasking_equipment_return') AND tgenabled = 'O'), 2::bigint,
  'the stamp and return Activity triggers are enabled again');
SELECT throws_ok(
  $$UPDATE public.calendar_tasking_equipment SET returned_quantity = 3 WHERE id = 'e9a10000-0000-4000-8000-000000000501'$$,
  '23514', NULL, 'a return above the secured count is refused after the upgrade');
SELECT * FROM finish();
ROLLBACK;
