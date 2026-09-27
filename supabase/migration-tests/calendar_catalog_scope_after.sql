-- A populated upgrade preserves saved Calendar facts and historical mismatches
-- while enforcing Organization-scoped configuration and new status references.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations
           WHERE version = '20260926001300'), 1,
  'Calendar catalog migration was recorded by the local runner');
SELECT is((SELECT convalidated FROM pg_constraint
           WHERE conname = 'availability_entries_org_status_type_fkey'), false,
  'historical availability was not silently validated');
SELECT is((SELECT confdeltype::text FROM pg_constraint
           WHERE conname = 'availability_entries_status_type_id_fkey'), 'a',
  'the global status-ID foreign key no longer cascades across Organizations');
SELECT is((SELECT condeferrable FROM pg_constraint
           WHERE conname = 'availability_entries_status_type_id_fkey'), true,
  'the global status reference can wait for the scoped cascade');
SELECT is((SELECT condeferred FROM pg_constraint
           WHERE conname = 'availability_entries_status_type_id_fkey'), true,
  'the global status reference waits until transaction end by default');
SELECT is((SELECT confdeltype::text FROM pg_constraint
           WHERE conname = 'availability_entries_org_status_type_fkey'), 'c',
  'same-Organization availability still cascades with status deletion');

CREATE TEMP TABLE calendar_catalog_current_rows AS
SELECT 'status_types'::text AS table_name, id AS row_id, to_jsonb(row_value) AS row_data
  FROM public.status_types AS row_value
  WHERE id IN ('e5000000-0000-4000-8000-000000000401', 'e5000000-0000-4000-8000-000000000402')
UNION ALL
SELECT 'assignment_types', id, to_jsonb(row_value) FROM public.assignment_types AS row_value
  WHERE id = 'e5000000-0000-4000-8000-000000000501'
UNION ALL
SELECT 'special_days', id, to_jsonb(row_value) FROM public.special_days AS row_value
  WHERE id = 'e5000000-0000-4000-8000-000000000601'
UNION ALL
SELECT 'availability_entries', id, to_jsonb(row_value) FROM public.availability_entries AS row_value
  WHERE id IN ('e5000000-0000-4000-8000-000000000701', 'e5000000-0000-4000-8000-000000000702');
SELECT is((SELECT count(*)::integer FROM calendar_catalog_current_rows), 6,
  'all historical catalog and availability rows remain');
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM calendar_catalog_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.calendar_catalog_before_rows ORDER BY table_name, row_id $$,
  'upgrade preserves exact catalog and availability identities and values');
SELECT is((SELECT count(*)::integer FROM public.availability_entries a
           JOIN public.status_types s ON s.id = a.status_type_id
           WHERE a.id = 'e5000000-0000-4000-8000-000000000702'
             AND a.organization_id <> s.organization_id), 1,
  'preexisting foreign-Organization status reference remains historical');

-- A normal Bravo row would be removed by the composite cascade. The rejected
-- Bravo deletion must roll that removal back along with the parent deletion.
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug)
VALUES ('e5000000-0000-4000-8000-000000000302',
        'e5000000-0000-4000-8000-000000000102',
        'SPC', 'Catalog', 'Bravo', 'calendar-catalog-upgrade-bravo');
INSERT INTO public.availability_entries (
  id, organization_id, personnel_id, status_type_id, start_date, end_date
) VALUES (
  'e5000000-0000-4000-8000-000000000705',
  'e5000000-0000-4000-8000-000000000102',
  'e5000000-0000-4000-8000-000000000302',
  'e5000000-0000-4000-8000-000000000402',
  '2030-05-11', '2030-05-12'
);

CREATE FUNCTION pg_temp.foreign_status_delete_rejected() RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER AS $fn$
BEGIN
  DELETE FROM public.status_types
    WHERE id = 'e5000000-0000-4000-8000-000000000402';
  SET CONSTRAINTS availability_entries_status_type_id_fkey IMMEDIATE;
  RETURN false;
EXCEPTION WHEN foreign_key_violation THEN
  RETURN true;
END;
$fn$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000001', true);
SELECT throws_ok($$ INSERT INTO public.special_days (organization_id, date, name, type)
  VALUES ('e5000000-0000-4000-8000-000000000101', '2030-05-06', 'Denied Closure', 'org-closure') $$,
  '42501', NULL, 'Organization-scoped operate cannot configure special days after upgrade');
SELECT lives_ok($$ INSERT INTO public.availability_entries
  (id, organization_id, personnel_id, status_type_id, start_date, end_date)
  VALUES ('e5000000-0000-4000-8000-000000000703', 'e5000000-0000-4000-8000-000000000101',
          'e5000000-0000-4000-8000-000000000301', 'e5000000-0000-4000-8000-000000000401',
          '2030-05-07', '2030-05-08') $$,
  'same-Organization status remains writable after upgrade');
SELECT throws_ok($$ INSERT INTO public.availability_entries
  (id, organization_id, personnel_id, status_type_id, start_date, end_date)
  VALUES ('e5000000-0000-4000-8000-000000000704', 'e5000000-0000-4000-8000-000000000101',
          'e5000000-0000-4000-8000-000000000301', 'e5000000-0000-4000-8000-000000000402',
          '2030-05-09', '2030-05-10') $$,
  '23503', NULL, 'new foreign-Organization status reference fails after upgrade');
SELECT throws_ok($$ UPDATE public.availability_entries
  SET status_type_id = 'e5000000-0000-4000-8000-000000000402'
  WHERE id = 'e5000000-0000-4000-8000-000000000703' $$,
  '23503', NULL, 'changed foreign-Organization status reference fails after upgrade');
SELECT is((SELECT status_type_id FROM public.availability_entries
           WHERE id = 'e5000000-0000-4000-8000-000000000703'),
  'e5000000-0000-4000-8000-000000000401'::uuid,
  'failed status reassignment leaves the saved row unchanged');

SELECT set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.status_types), 1,
  'Group-scoped configurator retains own Organization catalog reads');
SELECT throws_ok($$ INSERT INTO public.status_types (organization_id, name)
  VALUES ('e5000000-0000-4000-8000-000000000101', 'Denied Status') $$,
  '42501', NULL, 'Group-scoped configure cannot mutate Organization catalog after upgrade');

-- This configurator can delete Bravo statuses but cannot see Alpha's
-- historical availability. The deferred global FK must still stop the delete.
SELECT set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.availability_entries
           WHERE id = 'e5000000-0000-4000-8000-000000000702'), 0,
  'Bravo configurator cannot read the historical Alpha availability');
SELECT ok(pg_temp.foreign_status_delete_rejected(),
  'Bravo configurator cannot delete a status referenced by historical Alpha availability');
SELECT is((SELECT count(*)::integer FROM public.status_types
           WHERE id = 'e5000000-0000-4000-8000-000000000402'), 1,
  'rejected Bravo status deletion leaves the status available');

RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.availability_entries
           WHERE id = 'e5000000-0000-4000-8000-000000000702'), 1,
  'rejected Bravo status deletion preserves historical Alpha availability');
SELECT is((SELECT count(*)::integer FROM public.availability_entries
           WHERE id = 'e5000000-0000-4000-8000-000000000705'), 1,
  'rejected Bravo status deletion rolls back its own scoped availability cascade');
SELECT lives_ok($$ DELETE FROM public.status_types
  WHERE id = 'e5000000-0000-4000-8000-000000000401' $$,
  'deleting an Alpha status with only Alpha availability succeeds');
SELECT lives_ok($$ SET CONSTRAINTS availability_entries_status_type_id_fkey IMMEDIATE $$,
  'scoped cascade satisfies the deferred global reference');
SELECT is((SELECT count(*)::integer FROM public.availability_entries
           WHERE id IN ('e5000000-0000-4000-8000-000000000701',
                        'e5000000-0000-4000-8000-000000000703')), 0,
  'same-Organization status deletion removes only its linked Alpha availability');
SELECT is((SELECT count(*)::integer FROM public.availability_entries
           WHERE id = 'e5000000-0000-4000-8000-000000000702'), 1,
  'Alpha deletion does not remove the historical row linked to Bravo');
SELECT * FROM finish();
ROLLBACK;
