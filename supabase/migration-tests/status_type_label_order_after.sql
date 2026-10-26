-- The upgrade adds an empty one-day label to every saved status type and keeps
-- every saved fact, so the existing order and availability are unchanged.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT col_is_null('public', 'status_types', 'short_label', 'the one-day label is optional');
SELECT ok(has_function_privilege('authenticated', 'public.set_status_type_order(uuid, uuid[], uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.set_status_type_order(uuid, uuid[], uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.set_status_type_order(uuid, uuid[], uuid[])', 'EXECUTE'),
  'only authenticated can execute the status order command');

SELECT results_eq($$
  SELECT row_id, row_data FROM (
    SELECT id AS row_id, to_jsonb(t) - 'short_label' - 'roster_effect' AS row_data FROM public.status_types t
      WHERE organization_id::text LIKE 'e1684000-%' AND short_label IS NULL
    UNION ALL
    SELECT id, to_jsonb(a) - 'set_for_tasking_id' FROM public.availability_entries a WHERE organization_id::text LIKE 'e1684000-%') AS current_rows
  ORDER BY row_id $$,
  $$ SELECT row_id, row_data FROM upgrade_fixture.status_type_label_order_before_rows ORDER BY row_id $$,
  'every status type keeps its identity, details and position with no label, and availability is unchanged');

SELECT throws_ok($$ UPDATE public.status_types SET short_label = '' WHERE id = 'e1684000-0000-4000-8000-000000000502' $$,
  '23514', NULL, 'an upgraded type rejects a blank label');
SELECT throws_ok($$ UPDATE public.status_types SET short_label = 'SICK' WHERE id = 'e1684000-0000-4000-8000-000000000502' $$,
  '23514', NULL, 'an upgraded type rejects a four-letter label');
SELECT lives_ok($$ UPDATE public.status_types SET short_label = 'SK' WHERE id = 'e1684000-0000-4000-8000-000000000502' $$,
  'an upgraded type stores a short label');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e1684000-0000-4000-8000-000000000001', true);
SELECT lives_ok($$ SELECT public.set_status_type_order('e1684000-0000-4000-8000-000000000101',
  ARRAY['e1684000-0000-4000-8000-000000000503', 'e1684000-0000-4000-8000-000000000501',
        'e1684000-0000-4000-8000-000000000502']::uuid[],
  ARRAY['e1684000-0000-4000-8000-000000000501', 'e1684000-0000-4000-8000-000000000502',
        'e1684000-0000-4000-8000-000000000503']::uuid[]) $$,
  'a configurator orders the tied types from their id-ordered view');
SELECT is((SELECT jsonb_agg(jsonb_build_array(name, sort_order) ORDER BY sort_order, id) FROM public.status_types
  WHERE organization_id = 'e1684000-0000-4000-8000-000000000101'),
  '[["Appointment", 0], ["Leave", 1], ["Sick", 2]]', 'the upgraded Organization saves dense positions in the new order');
RESET ROLE;
SELECT is((SELECT jsonb_agg(jsonb_build_array(name, sort_order) ORDER BY sort_order, id) FROM public.status_types
  WHERE organization_id = 'e1684000-0000-4000-8000-000000000102'),
  '[["Bravo Leave", 1], ["Bravo School", 2]]', 'another Organization keeps its saved positions');
RESET ROLE;
SELECT ok(NOT EXISTS (SELECT 1 FROM public.availability_entries WHERE set_for_tasking_id IS NOT NULL),
  'historical Availability entries remain unlinked after upgrade');
SELECT * FROM finish();
ROLLBACK;
