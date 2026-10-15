BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public.delete_availability_entries(uuid,uuid[])') IS NOT NULL
    OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261006000100')
  THEN
    RAISE EXCEPTION 'Availability removal fixture requires the preceding schema';
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users(id,email) VALUES
  ('e6110000-0000-4000-8000-000000000001','removal-upgrade-a@example.test'),
  ('e6110000-0000-4000-8000-000000000002','removal-upgrade-b@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES
  ('e6110000-0000-4000-8000-000000000101','Removal Upgrade A','e6110000-0000-4000-8000-000000000001'),
  ('e6110000-0000-4000-8000-000000000102','Removal Upgrade B','e6110000-0000-4000-8000-000000000002');
INSERT INTO public.organization_memberships(
  organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind
) VALUES
  ('e6110000-0000-4000-8000-000000000101','e6110000-0000-4000-8000-000000000001','member','viewer','{"calendar":"operate","personnel":"none"}','organization'),
  ('e6110000-0000-4000-8000-000000000102','e6110000-0000-4000-8000-000000000002','member','viewer','{"calendar":"operate","personnel":"none"}','organization');
INSERT INTO public.groups(id,organization_id,name,sort_order) VALUES
  ('e6110000-0000-4000-8000-000000000201','e6110000-0000-4000-8000-000000000101','Upgrade Alpha',3),
  ('e6110000-0000-4000-8000-000000000202','e6110000-0000-4000-8000-000000000102','Upgrade Bravo',7);
INSERT INTO public.personnel(id,organization_id,group_id,rank,first_name,last_name,clinic_role,slug) VALUES
  ('e6110000-0000-4000-8000-000000000301','e6110000-0000-4000-8000-000000000101','e6110000-0000-4000-8000-000000000201','SPC','Saved','Alpha','Medic','removal-upgrade-alpha'),
  ('e6110000-0000-4000-8000-000000000302','e6110000-0000-4000-8000-000000000102','e6110000-0000-4000-8000-000000000202','SGT','Saved','Bravo','NCOIC','removal-upgrade-bravo');
INSERT INTO public.status_types(id,organization_id,name,color,text_color) VALUES
  ('e6110000-0000-4000-8000-000000000401','e6110000-0000-4000-8000-000000000101','Saved Alpha','#123456','#ffffff'),
  ('e6110000-0000-4000-8000-000000000402','e6110000-0000-4000-8000-000000000102','Saved Bravo','#abcdef','#000000');
INSERT INTO public.availability_entries(
  id,organization_id,personnel_id,status_type_id,start_date,end_date,note,created_at
) VALUES
  ('e6110000-0000-4000-8000-000000000501','e6110000-0000-4000-8000-000000000101','e6110000-0000-4000-8000-000000000301','e6110000-0000-4000-8000-000000000401','2025-03-01','2025-03-04','Historical Alpha','2025-02-01T12:00:00Z'),
  ('e6110000-0000-4000-8000-000000000502','e6110000-0000-4000-8000-000000000102','e6110000-0000-4000-8000-000000000302','e6110000-0000-4000-8000-000000000402','2024-07-01','2024-07-01',NULL,'2024-06-01T09:30:00Z');
CREATE VIEW upgrade_fixture.availability_removal_current_rows AS
SELECT 'availability_entries'::text table_name,id row_id,to_jsonb(r) row_data
  FROM public.availability_entries r WHERE id::text LIKE 'e6110000-%'
UNION ALL
SELECT 'personnel',id,to_jsonb(r) FROM public.personnel r WHERE id::text LIKE 'e6110000-%'
UNION ALL
SELECT 'groups',id,to_jsonb(r) FROM public.groups r WHERE id::text LIKE 'e6110000-%'
UNION ALL
-- The later status label upgrade adds a column that these rows leave NULL.
SELECT 'status_types',id,to_jsonb(r) - 'short_label' FROM public.status_types r WHERE id::text LIKE 'e6110000-%';
CREATE TABLE upgrade_fixture.availability_removal_before_rows AS
SELECT * FROM upgrade_fixture.availability_removal_current_rows;
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.availability_removal_before_rows) <> 8 THEN
    RAISE EXCEPTION 'Availability removal upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
