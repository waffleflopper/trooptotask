BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(id,email) VALUES
  ('d2530000-0000-4000-8000-000000000001','ct-retention-guard@example.test');
INSERT INTO public.organizations(id,name,created_by,url_slug) VALUES
  ('d2530000-0000-4000-8000-000000000101','CT Retention Alpha','d2530000-0000-4000-8000-000000000001','ct-retention-alpha'),
  ('d2530000-0000-4000-8000-000000000102','CT Retention Bravo','d2530000-0000-4000-8000-000000000001','ct-retention-bravo');
INSERT INTO public.personnel(id,organization_id,rank,first_name,last_name,slug) VALUES
  ('d2530000-0000-4000-8000-000000000201','d2530000-0000-4000-8000-000000000101','SPC','Retention','Alpha','ct-retention-alpha-person'),
  ('d2530000-0000-4000-8000-000000000202','d2530000-0000-4000-8000-000000000102','SPC','Retention','Bravo','ct-retention-bravo-person');
INSERT INTO public.ict_tasks(id,organization_id,task_code,title,archived_at) VALUES
  ('d2530000-0000-4000-8000-000000000301','d2530000-0000-4000-8000-000000000101','CT-BEFORE','Expired unused','2025-05-30T11:59:59.999Z'),
  ('d2530000-0000-4000-8000-000000000302','d2530000-0000-4000-8000-000000000101','CT-EQUAL','Cutoff equality','2025-05-30T12:00:00Z'),
  ('d2530000-0000-4000-8000-000000000303','d2530000-0000-4000-8000-000000000101','CT-AFTER','Recent archived','2025-05-30T12:00:00.001Z'),
  ('d2530000-0000-4000-8000-000000000304','d2530000-0000-4000-8000-000000000101','CT-ACTIVE','Active task',NULL),
  ('d2530000-0000-4000-8000-000000000305','d2530000-0000-4000-8000-000000000101','CT-HISTORY','Saved same-Organization history','2020-01-01Z'),
  ('d2530000-0000-4000-8000-000000000306','d2530000-0000-4000-8000-000000000101','CT-LEGACY','Saved foreign historical reference','2020-01-01Z'),
  ('d2530000-0000-4000-8000-000000000307','d2530000-0000-4000-8000-000000000102','CT-FOREIGN','Foreign expired task','2020-01-01Z');
INSERT INTO public.personnel_ict_completions(id,organization_id,personnel_id,ict_task_id,completed_at,validation_method,notes) VALUES
  ('d2530000-0000-4000-8000-000000000401','d2530000-0000-4000-8000-000000000101','d2530000-0000-4000-8000-000000000201','d2530000-0000-4000-8000-000000000305','2025-01-02','Practical Exercise','Retained same-Organization history');

ALTER TABLE public.personnel_ict_completions DROP CONSTRAINT personnel_ict_completions_org_task_fkey;
INSERT INTO public.personnel_ict_completions(id,organization_id,personnel_id,ict_task_id,completed_at,validation_method,notes) VALUES
  ('d2530000-0000-4000-8000-000000000402','d2530000-0000-4000-8000-000000000102','d2530000-0000-4000-8000-000000000202','d2530000-0000-4000-8000-000000000306','2025-01-03','Practical Exercise','Preserved predecessor history');
ALTER TABLE public.personnel_ict_completions
  ADD CONSTRAINT personnel_ict_completions_org_task_fkey
  FOREIGN KEY (organization_id, ict_task_id) REFERENCES public.ict_tasks (organization_id, id)
  ON DELETE CASCADE NOT VALID;

CREATE TEMP TABLE ct_retention_tasks_before AS
  SELECT id,to_jsonb(task) AS row_data FROM public.ict_tasks AS task
  WHERE organization_id IN ('d2530000-0000-4000-8000-000000000101','d2530000-0000-4000-8000-000000000102');
CREATE TEMP TABLE ct_retention_history_before AS
  SELECT id,to_jsonb(completion) AS row_data FROM public.personnel_ict_completions AS completion
  WHERE organization_id IN ('d2530000-0000-4000-8000-000000000101','d2530000-0000-4000-8000-000000000102');

SELECT ok(NOT has_function_privilege('anon','public.delete_expired_unreferenced_critical_tasks(uuid,timestamptz)','EXECUTE'),'anonymous role has no retention grant');
SELECT ok(NOT has_function_privilege('authenticated','public.delete_expired_unreferenced_critical_tasks(uuid,timestamptz)','EXECUTE'),'members have no retention grant');
SELECT ok(has_function_privilege('service_role','public.delete_expired_unreferenced_critical_tasks(uuid,timestamptz)','EXECUTE'),'service role has the retention grant');
SELECT ok(NOT prosecdef AND provolatile='v' AND proconfig @> ARRAY['search_path=""'],'retention uses invoker authority, volatile snapshots and an empty search path')
  FROM pg_proc WHERE oid='public.delete_expired_unreferenced_critical_tasks(uuid,timestamptz)'::regprocedure;
SELECT is((SELECT convalidated FROM pg_constraint WHERE conname='personnel_ict_completions_org_task_fkey'),false,'the predecessor reference survives the restored NOT VALID constraint');

SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.delete_expired_unreferenced_critical_tasks('d2530000-0000-4000-8000-000000000101','2025-05-30T12:00:00Z') $$,'42501',NULL,'anonymous execution rejects');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.delete_expired_unreferenced_critical_tasks('d2530000-0000-4000-8000-000000000101','2025-05-30T12:00:00Z') $$,'42501',NULL,'member execution rejects');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT public.delete_expired_unreferenced_critical_tasks(NULL,'2025-05-30T12:00:00Z') $$,'22023','Organization and cutoff are required','NULL Organization rejects');
SELECT throws_ok($$ SELECT public.delete_expired_unreferenced_critical_tasks('d2530000-0000-4000-8000-000000000101',NULL) $$,'22023','Organization and cutoff are required','NULL cutoff rejects');
SELECT is(public.delete_expired_unreferenced_critical_tasks('d2530000-0000-4000-8000-000000000199','2025-05-30T12:00:00Z'),0,'an absent Organization has no effects');
RESET ROLE;
SELECT results_eq($$ SELECT id,to_jsonb(task) FROM public.ict_tasks AS task WHERE organization_id IN ('d2530000-0000-4000-8000-000000000101','d2530000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT * FROM ct_retention_tasks_before ORDER BY id $$,'denied and invalid calls preserve all task fields');

SET LOCAL ROLE service_role;
SELECT is(public.delete_expired_unreferenced_critical_tasks('d2530000-0000-4000-8000-000000000101','2025-05-30T12:00:00Z'),1,'only the strictly expired unreferenced task is deleted');
RESET ROLE;
SELECT results_eq($$ SELECT id,to_jsonb(task) FROM public.ict_tasks AS task WHERE organization_id IN ('d2530000-0000-4000-8000-000000000101','d2530000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT * FROM ct_retention_tasks_before WHERE id<>'d2530000-0000-4000-8000-000000000301' ORDER BY id $$,'equal, recent, active, referenced and foreign tasks retain every field');
SELECT results_eq($$ SELECT id,to_jsonb(completion) FROM public.personnel_ict_completions AS completion WHERE organization_id IN ('d2530000-0000-4000-8000-000000000101','d2530000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT * FROM ct_retention_history_before ORDER BY id $$,'both same-Organization and foreign predecessor completions remain exact');

INSERT INTO public.ict_tasks(id,organization_id,task_code,title,archived_at)
  SELECT ('d2531000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    'd2530000-0000-4000-8000-000000000101','CT-BULK-'||n,'Bulk expired task '||n,'2020-01-01Z'::timestamptz
  FROM generate_series(1,1001) AS n;
SET LOCAL ROLE service_role;
SELECT is(public.delete_expired_unreferenced_critical_tasks('d2530000-0000-4000-8000-000000000101','2025-05-30T12:00:00Z'),1001,'the actual deletion count exceeds the returned-row cap');
SELECT is(public.delete_expired_unreferenced_critical_tasks('d2530000-0000-4000-8000-000000000101','2025-05-30T12:00:00Z'),0,'replay reports no new deletion');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.ict_tasks WHERE organization_id='d2530000-0000-4000-8000-000000000101' AND task_code LIKE 'CT-BULK-%'),0,'all 1001 expired bulk tasks are absent');
SELECT results_eq($$ SELECT id,to_jsonb(task) FROM public.ict_tasks AS task WHERE organization_id IN ('d2530000-0000-4000-8000-000000000101','d2530000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT * FROM ct_retention_tasks_before WHERE id<>'d2530000-0000-4000-8000-000000000301' ORDER BY id $$,'bulk cleanup and replay retain the exact original witnesses');
SELECT results_eq($$ SELECT id,to_jsonb(completion) FROM public.personnel_ict_completions AS completion WHERE organization_id IN ('d2530000-0000-4000-8000-000000000101','d2530000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT * FROM ct_retention_history_before ORDER BY id $$,'bulk cleanup and replay leave both saved histories exact');

INSERT INTO public.ict_tasks(id,organization_id,task_code,title,archived_at) VALUES
  ('d2532000-0000-4000-8000-000000000001','d2530000-0000-4000-8000-000000000101','CT-ROLLBACK-1','Earlier deletion','2020-01-01Z'),
  ('d2532000-0000-4000-8000-000000000002','d2530000-0000-4000-8000-000000000101','CT-ROLLBACK-2','Rejected later deletion','2020-01-01Z');
CREATE TEMP TABLE ct_retention_rollback_before AS
  SELECT id,to_jsonb(task) AS row_data FROM public.ict_tasks AS task
  WHERE organization_id='d2530000-0000-4000-8000-000000000101';
CREATE FUNCTION pg_temp.reject_later_ct_retention_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id='d2532000-0000-4000-8000-000000000002' THEN
    IF EXISTS (SELECT 1 FROM public.ict_tasks WHERE id='d2532000-0000-4000-8000-000000000001') THEN
      RAISE EXCEPTION 'Earlier task was not deleted before the fault' USING ERRCODE='P0002';
    END IF;
    RAISE EXCEPTION 'Synthetic later task deletion failure' USING ERRCODE='P0001';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER ct_retention_delete_failure BEFORE DELETE ON public.ict_tasks
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_later_ct_retention_delete();
SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT public.delete_expired_unreferenced_critical_tasks('d2530000-0000-4000-8000-000000000101','2025-05-30T12:00:00Z') $$,
  'P0001','Synthetic later task deletion failure','a later failure aborts the complete CT operation');
RESET ROLE;
SELECT results_eq($$ SELECT id,to_jsonb(task) FROM public.ict_tasks AS task WHERE organization_id='d2530000-0000-4000-8000-000000000101' ORDER BY id $$,
  $$ SELECT * FROM ct_retention_rollback_before ORDER BY id $$,'the earlier deleted task and every retained field roll back');

SELECT * FROM finish();
ROLLBACK;
