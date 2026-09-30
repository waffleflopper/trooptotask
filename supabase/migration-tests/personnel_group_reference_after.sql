-- The #1360 upgrade retains saved facts and prevents foreign Group side effects.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations
  WHERE version = '20260929000300'), 1, 'Personnel Group migration was applied');

CREATE TEMP VIEW personnel_group_current_rows AS
  SELECT 'group'::text AS table_name, id AS row_id, to_jsonb(g) AS row_data
    FROM public.groups g WHERE id IN (
      'd1200000-0000-4000-8000-000000000201', 'd1200000-0000-4000-8000-000000000202',
      'd1200000-0000-4000-8000-000000000203')
  UNION ALL
  SELECT 'personnel', id, to_jsonb(p) FROM public.personnel p WHERE id IN (
    'd1200000-0000-4000-8000-000000000301', 'd1200000-0000-4000-8000-000000000302',
    'd1200000-0000-4000-8000-000000000303', 'd1200000-0000-4000-8000-000000000304',
    'd1200000-0000-4000-8000-000000000305', 'd1200000-0000-4000-8000-000000000306')
  UNION ALL
  SELECT 'type', id, to_jsonb(t) FROM public.training_types t
    WHERE id = 'd1200000-0000-4000-8000-000000000401'
  UNION ALL
  SELECT 'completion', id, to_jsonb(t) FROM public.personnel_trainings t
    WHERE id = 'd1200000-0000-4000-8000-000000000501'
  UNION ALL
  SELECT 'follow_up', id, to_jsonb(f) FROM public.personnel_follow_ups f
    WHERE id = 'd1200000-0000-4000-8000-000000000601';
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM personnel_group_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.personnel_group_before ORDER BY table_name, row_id $$,
  'all twelve populated Group, Personnel and dependent-history rows retain every saved field');
SELECT is((SELECT count(*)::integer FROM public.personnel p
  JOIN public.groups g ON g.id = p.group_id
  WHERE p.id = 'd1200000-0000-4000-8000-000000000304'
    AND p.organization_id <> g.organization_id), 1,
  'the historical cross-Organization Personnel link remains identifiable');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1200000-0000-4000-8000-000000000001', true);
SELECT throws_ok($$ INSERT INTO public.personnel
  (organization_id, group_id, rank, first_name, last_name, slug)
  VALUES ('d1200000-0000-4000-8000-000000000101', 'd1200000-0000-4000-8000-000000000203',
          'SPC', 'New', 'Foreign', 'personnel-upgrade-new-foreign') $$,
  '23503', NULL, 'authenticated new foreign Group links fail after upgrade');
SELECT throws_ok($$ UPDATE public.personnel
  SET group_id = 'd1200000-0000-4000-8000-000000000203', last_name = 'Denied Edit'
  WHERE id = 'd1200000-0000-4000-8000-000000000301' $$,
  '23503', NULL, 'authenticated reassignment cannot introduce a foreign Group link');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$ INSERT INTO public.personnel
  (organization_id, group_id, rank, first_name, last_name, slug)
  VALUES ('d1200000-0000-4000-8000-000000000101', 'd1200000-0000-4000-8000-000000000203',
          'SPC', 'Service', 'Foreign', 'personnel-upgrade-service-foreign') $$,
  '23503', NULL, 'privileged new foreign Group links also fail after upgrade');
SELECT throws_ok($$ UPDATE public.personnel
  SET group_id = 'd1200000-0000-4000-8000-000000000203', first_name = 'Denied Service Edit'
  WHERE id = 'd1200000-0000-4000-8000-000000000301' $$,
  '23503', NULL, 'privileged reassignment cannot bypass Group tenancy integrity');
SELECT throws_ok($$ UPDATE public.groups
  SET organization_id = 'd1200000-0000-4000-8000-000000000102'
  WHERE id = 'd1200000-0000-4000-8000-000000000201' $$,
  '23503', NULL, 'a referenced Group cannot move Organizations underneath saved Personnel');
SELECT throws_ok($$ UPDATE public.groups SET id = 'd1200000-0000-4000-8000-000000000204'
  WHERE id = 'd1200000-0000-4000-8000-000000000201' $$,
  '23503', NULL, 'a referenced Group cannot change identity underneath saved Personnel');
RESET ROLE;

-- Checking the deferred global reference at transaction end must roll back
-- both the Group deletion and the valid Bravo links it would otherwise clear.
CREATE FUNCTION pg_temp.personnel_foreign_group_delete_rejected() RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER AS $fn$
BEGIN
  DELETE FROM public.groups WHERE id = 'd1200000-0000-4000-8000-000000000203';
  SET CONSTRAINTS personnel_group_id_fkey IMMEDIATE;
  RETURN false;
EXCEPTION WHEN foreign_key_violation THEN
  RETURN true;
END;
$fn$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1200000-0000-4000-8000-000000000002', true);
SELECT ok(pg_temp.personnel_foreign_group_delete_rejected(),
  'Bravo configurator cannot delete a Group referenced by historical Alpha Personnel');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT ok(pg_temp.personnel_foreign_group_delete_rejected(),
  'privileged Group deletion also rejects the historical foreign link');
RESET ROLE;
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM personnel_group_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.personnel_group_before ORDER BY table_name, row_id $$,
  'rejected writes, parent changes and deletions leave both Organizations and all history unchanged');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1200000-0000-4000-8000-000000000001', true);
SELECT lives_ok($$ DELETE FROM public.groups WHERE id = 'd1200000-0000-4000-8000-000000000202' $$,
  'a Group with only same-Organization Personnel remains deletable');
SELECT lives_ok($$ SET CONSTRAINTS personnel_group_id_fkey IMMEDIATE $$,
  'same-Organization Group unassignment satisfies the deferred global reference');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.groups
  WHERE id = 'd1200000-0000-4000-8000-000000000202'), 0, 'valid Group deletion removes its parent row');
SELECT results_eq(
  $$ SELECT id, to_jsonb(p) FROM public.personnel p
     WHERE id IN ('d1200000-0000-4000-8000-000000000302', 'd1200000-0000-4000-8000-000000000303')
     ORDER BY id $$,
  $$ SELECT row_id, row_data || jsonb_build_object('group_id', NULL)
     FROM upgrade_fixture.personnel_group_before WHERE table_name = 'personnel'
       AND row_id IN ('d1200000-0000-4000-8000-000000000302', 'd1200000-0000-4000-8000-000000000303')
     ORDER BY row_id $$,
  'active and archived Personnel retain identity, slug, dates and every value except the cleared Group');
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM personnel_group_current_rows
     WHERE row_id NOT IN ('d1200000-0000-4000-8000-000000000202', 'd1200000-0000-4000-8000-000000000302',
                         'd1200000-0000-4000-8000-000000000303') ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.personnel_group_before
     WHERE row_id NOT IN ('d1200000-0000-4000-8000-000000000202', 'd1200000-0000-4000-8000-000000000302',
                         'd1200000-0000-4000-8000-000000000303') ORDER BY table_name, row_id $$,
  'valid unassignment leaves other Personnel, the legacy link, Training and follow-up history unchanged');

SET LOCAL ROLE authenticated;
SELECT lives_ok($$ UPDATE public.personnel SET last_name = 'Historical Edit'
  WHERE id = 'd1200000-0000-4000-8000-000000000304' $$,
  'unrelated edits to retained historical Personnel remain possible');
RESET ROLE;
SELECT is((SELECT last_name FROM public.personnel WHERE id = 'd1200000-0000-4000-8000-000000000304'),
  'Historical Edit', 'an unrelated historical edit actually persists');
SELECT is((SELECT group_id FROM public.personnel WHERE id = 'd1200000-0000-4000-8000-000000000304'),
  'd1200000-0000-4000-8000-000000000203'::uuid, 'unrelated edits do not silently repair historical Group links');
SELECT * FROM finish();
ROLLBACK;
