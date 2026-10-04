BEGIN;
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','',true);
SELECT set_config('request.jwt.claims','{}',true);
SELECT set_config('request.jwt','',true);

CREATE TABLE upgrade_fixture.critical_task_archive_retention_baseline AS SELECT
  NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261003000300') AS migration_absent,
  to_regprocedure('public.delete_expired_unreferenced_critical_tasks(uuid,timestamptz)') IS NULL AS rpc_absent,
  NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='personnel_ict_completions_org_task_fkey') AS composite_fk_absent;
DO $$
BEGIN
  IF NOT (SELECT migration_absent AND rpc_absent AND composite_fk_absent FROM upgrade_fixture.critical_task_archive_retention_baseline) THEN
    RAISE EXCEPTION 'Critical task retention fixtures require the predecessor schema';
  END IF;
END;
$$;

INSERT INTO auth.users(id,email) VALUES
  ('d2550000-0000-4000-8000-000000000001','ct-retention-upgrade@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES
  ('d2550000-0000-4000-8000-000000000101','CT retention upgrade Alpha','d2550000-0000-4000-8000-000000000001'),
  ('d2550000-0000-4000-8000-000000000102','CT retention upgrade Bravo','d2550000-0000-4000-8000-000000000001');
INSERT INTO public.personnel(id,organization_id,rank,first_name,last_name,slug) VALUES
  ('d2550000-0000-4000-8000-000000000201','d2550000-0000-4000-8000-000000000101','SPC','Saved','Alpha','ct-retention-upgrade-alpha'),
  ('d2550000-0000-4000-8000-000000000202','d2550000-0000-4000-8000-000000000102','SPC','Saved','Bravo','ct-retention-upgrade-bravo');
INSERT INTO public.ict_tasks(id,organization_id,task_code,title,description,category,mos,expiration_months,sort_order,archived_at) VALUES
  ('d2550000-0000-4000-8000-000000000401','d2550000-0000-4000-8000-000000000101','UP-UNUSED-A','Expired unused Alpha','Saved predecessor text','Clinical',ARRAY['68V'],12,1,'2025-05-30T11:59:59.999Z'),
  ('d2550000-0000-4000-8000-000000000402','d2550000-0000-4000-8000-000000000101','UP-SAVED-A','Saved Alpha completion','Saved predecessor text','Clinical',ARRAY['68V'],12,2,'2020-01-01Z'),
  ('d2550000-0000-4000-8000-000000000403','d2550000-0000-4000-8000-000000000101','UP-LEGACY','Saved foreign reference','Saved predecessor text','Clinical',ARRAY['68V'],12,3,'2020-01-01Z'),
  ('d2550000-0000-4000-8000-000000000404','d2550000-0000-4000-8000-000000000101','UP-EQUAL','Exact cutoff','Saved predecessor text','Clinical',ARRAY['68V'],12,4,'2025-05-30T12:00:00Z'),
  ('d2550000-0000-4000-8000-000000000405','d2550000-0000-4000-8000-000000000101','UP-RECENT','Recent archived','Saved predecessor text','Clinical',ARRAY['68V'],12,5,'2025-05-30T12:00:00.001Z'),
  ('d2550000-0000-4000-8000-000000000406','d2550000-0000-4000-8000-000000000101','UP-ACTIVE','Active task','Saved predecessor text','Clinical',ARRAY['68V'],12,6,NULL),
  ('d2550000-0000-4000-8000-000000000407','d2550000-0000-4000-8000-000000000102','UP-UNUSED-B','Expired unused Bravo','Saved predecessor text','Clinical',ARRAY['68V'],12,7,'2020-01-01Z'),
  ('d2550000-0000-4000-8000-000000000408','d2550000-0000-4000-8000-000000000102','UP-SAVED-B','Saved Bravo completion','Saved predecessor text','Clinical',ARRAY['68V'],12,8,'2020-01-01Z');
INSERT INTO public.personnel_ict_completions(id,organization_id,personnel_id,ict_task_id,completed_at,validation_method,notes,logged_by) VALUES
  ('d2550000-0000-4000-8000-000000000501','d2550000-0000-4000-8000-000000000101','d2550000-0000-4000-8000-000000000201','d2550000-0000-4000-8000-000000000402','2025-01-02','Practical Exercise','Saved Alpha history','d2550000-0000-4000-8000-000000000001'),
  ('d2550000-0000-4000-8000-000000000502','d2550000-0000-4000-8000-000000000102','d2550000-0000-4000-8000-000000000202','d2550000-0000-4000-8000-000000000403','2025-01-03','Practical Exercise','Saved foreign predecessor history','d2550000-0000-4000-8000-000000000001'),
  ('d2550000-0000-4000-8000-000000000503','d2550000-0000-4000-8000-000000000102','d2550000-0000-4000-8000-000000000202','d2550000-0000-4000-8000-000000000408','2025-01-04','Practical Exercise','Saved Bravo history','d2550000-0000-4000-8000-000000000001');

CREATE VIEW upgrade_fixture.critical_task_archive_retention_current_rows AS
SELECT 'auth.users'::text AS table_name,id AS row_id,to_jsonb(row_value) AS row_data FROM auth.users AS row_value WHERE id='d2550000-0000-4000-8000-000000000001'
UNION ALL SELECT 'organizations',id,to_jsonb(row_value) FROM public.organizations AS row_value WHERE id IN ('d2550000-0000-4000-8000-000000000101','d2550000-0000-4000-8000-000000000102')
UNION ALL SELECT 'personnel',id,to_jsonb(row_value) FROM public.personnel AS row_value WHERE organization_id IN ('d2550000-0000-4000-8000-000000000101','d2550000-0000-4000-8000-000000000102')
UNION ALL SELECT 'tasks',id,to_jsonb(row_value) FROM public.ict_tasks AS row_value WHERE organization_id IN ('d2550000-0000-4000-8000-000000000101','d2550000-0000-4000-8000-000000000102')
UNION ALL SELECT 'completions',id,to_jsonb(row_value) FROM public.personnel_ict_completions AS row_value WHERE organization_id IN ('d2550000-0000-4000-8000-000000000101','d2550000-0000-4000-8000-000000000102');
CREATE TABLE upgrade_fixture.critical_task_archive_retention_before_rows AS
  SELECT * FROM upgrade_fixture.critical_task_archive_retention_current_rows;
COMMIT;
