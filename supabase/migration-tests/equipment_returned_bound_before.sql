-- Equipment saved with more returned than secured, as the old quantity-only bound allowed.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261108220000') THEN
    RAISE EXCEPTION 'Returned equipment fixture requires the preceding schema';
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('e9a10000-0000-4000-8000-000000000001', 'returned-bound@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e9a10000-0000-4000-8000-000000000101', 'Returned Bound', 'e9a10000-0000-4000-8000-000000000001');
INSERT INTO public.calendar_taskings (id, organization_id, title, suspense_on) VALUES
  ('e9a10000-0000-4000-8000-000000000401', 'e9a10000-0000-4000-8000-000000000101', 'Return the litters', '2030-10-23');
INSERT INTO public.calendar_tasking_equipment (id, organization_id, tasking_id, name, quantity, secured_quantity, returned_quantity) VALUES
  ('e9a10000-0000-4000-8000-000000000501', 'e9a10000-0000-4000-8000-000000000101', 'e9a10000-0000-4000-8000-000000000401', 'Litters', 5, 2, 5),
  ('e9a10000-0000-4000-8000-000000000502', 'e9a10000-0000-4000-8000-000000000101', 'e9a10000-0000-4000-8000-000000000401', 'Radios', 4, 4, 3),
  ('e9a10000-0000-4000-8000-000000000503', 'e9a10000-0000-4000-8000-000000000101', 'e9a10000-0000-4000-8000-000000000401', 'Tents', 3, 0, 2);
CREATE TABLE upgrade_fixture.equipment_returned_before AS
  SELECT id, to_jsonb(e) AS saved FROM public.calendar_tasking_equipment e
  WHERE organization_id = 'e9a10000-0000-4000-8000-000000000101';
CREATE TABLE upgrade_fixture.equipment_returned_activity_before AS
  SELECT id, tasking_id, kind, actor_id, payload FROM public.calendar_tasking_activity
  WHERE organization_id = 'e9a10000-0000-4000-8000-000000000101';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.equipment_returned_before) <> 3 THEN
    RAISE EXCEPTION 'Returned equipment upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
