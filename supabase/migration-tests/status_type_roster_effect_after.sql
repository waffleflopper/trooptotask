-- The upgrade gives every saved status type the effect A and keeps every other
-- saved fact, so availability and the status list are unchanged.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT col_not_null('public', 'status_types', 'roster_effect', 'every status type has a roster effect');
SELECT col_default_is('public', 'status_types', 'roster_effect', 'A', 'a new status type reads A');

SELECT results_eq($$
  SELECT row_id, row_data FROM (
    SELECT id AS row_id, to_jsonb(t) - 'roster_effect' - 'short_label' AS row_data FROM public.status_types t
      WHERE organization_id::text LIKE 'e1726000-%' AND roster_effect = 'A'
    UNION ALL
    SELECT id, to_jsonb(a) FROM public.availability_entries a WHERE organization_id::text LIKE 'e1726000-%') AS current_rows
  ORDER BY row_id $$,
  $$ SELECT row_id, row_data FROM upgrade_fixture.status_type_roster_effect_before_rows ORDER BY row_id $$,
  'every saved status type reads A and keeps its details, and availability is unchanged');

SELECT throws_ok($$ UPDATE public.status_types SET roster_effect = 'X' WHERE id = 'e1726000-0000-4000-8000-000000000501' $$,
  '23514', NULL, 'an upgraded type rejects an unknown effect');
SELECT lives_ok($$ UPDATE public.status_types SET roster_effect = 'available' WHERE id = 'e1726000-0000-4000-8000-000000000502' $$,
  'an upgraded type stores Still available');
SELECT * FROM finish();
ROLLBACK;
