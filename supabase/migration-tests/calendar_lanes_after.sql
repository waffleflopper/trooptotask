-- The upgrade makes each former date header the first Calendar lane and keeps
-- every other saved assignment-type fact and daily assignment.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT hasnt_column('public', 'assignment_types', 'show_in_date_header', 'the date-header column is gone');
SELECT has_column('public', 'assignment_types', 'show_on_calendar', 'the calendar visibility column exists');
SELECT hasnt_index('public', 'assignment_types', 'assignment_types_one_header_per_org', 'the one-header index is gone');
SELECT hasnt_function('public', 'set_assignment_type_date_header', 'the single date-header command is gone');
SELECT ok(has_function_privilege('authenticated', 'public.set_calendar_lanes(uuid, uuid[], uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.set_calendar_lanes(uuid, uuid[], uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.set_calendar_lanes(uuid, uuid[], uuid[])', 'EXECUTE'),
  'only authenticated can execute the lane command');

SELECT results_eq($$
  SELECT o.name, coalesce((SELECT jsonb_agg(t.name ORDER BY t.sort_order, t.id) FROM public.assignment_types t
    WHERE t.organization_id = o.id AND t.show_on_calendar AND t.archived_at IS NULL), '[]')
  FROM public.organizations o WHERE o.id::text LIKE 'e1683000-%' ORDER BY o.name $$,
  $$ VALUES ('Lanes Archived Header'::text, '[]'::jsonb), ('Lanes Header', '["Header"]'),
            ('Lanes No Header', '[]'), ('Lanes No Types', '[]') $$,
  'each Organization''s former active header is its only lane');
SELECT results_eq($$
  SELECT name, show_on_calendar, sort_order FROM public.assignment_types
  WHERE organization_id::text LIKE 'e1683000-%' ORDER BY organization_id, sort_order $$,
  $$ VALUES ('Header'::text, true, 0), ('First', false, 1), ('Tied Low Id', false, 2), ('Tied High Id', false, 3),
            ('Bravo One', false, 0), ('Bravo Two', false, 1),
            ('Archived Header', false, 0), ('Charlie Active', false, 1) $$,
  'the header ranks first and the others keep their (sort_order, id) order');
SELECT results_eq($$
  SELECT row_id, row_data - 'show_on_calendar' - 'sort_order' FROM (
    SELECT id AS row_id, to_jsonb(t) AS row_data FROM public.assignment_types t WHERE organization_id::text LIKE 'e1683000-%'
    UNION ALL
    SELECT id, to_jsonb(d) FROM public.daily_assignments d WHERE organization_id::text LIKE 'e1683000-%') AS current_rows
  ORDER BY row_id $$,
  $$ SELECT row_id, row_data - 'show_in_date_header' - 'sort_order'
     FROM upgrade_fixture.calendar_lanes_before_rows ORDER BY row_id $$,
  'every type keeps its identity, details and exemptions, and every daily assignment is unchanged');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e1683000-0000-4000-8000-000000000001', true);
SELECT lives_ok($$ SELECT public.set_calendar_lanes('e1683000-0000-4000-8000-000000000101',
  ARRAY['e1683000-0000-4000-8000-000000000503', 'e1683000-0000-4000-8000-000000000501']::uuid[],
  ARRAY['e1683000-0000-4000-8000-000000000501']::uuid[]) $$,
  'a configurator adds a lane ahead of the migrated header');
SELECT is((SELECT jsonb_agg(name ORDER BY sort_order, id) FROM public.assignment_types
  WHERE organization_id = 'e1683000-0000-4000-8000-000000000101' AND show_on_calendar),
  '["Tied Low Id", "Header"]', 'the upgraded Organization saves the new lane order');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
