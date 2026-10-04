BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is((SELECT count(*)::integer FROM public.audit_logs WHERE timestamp<now()-interval '1 year'),0,'the disposable baseline has no unrelated expired Audit rows');
INSERT INTO auth.users(id,email) VALUES
  ('d2560000-0000-4000-8000-000000000001','audit-retention-cutoff@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES
  ('d2560000-0000-4000-8000-000000000101','Audit retention Alpha','d2560000-0000-4000-8000-000000000001'),
  ('d2560000-0000-4000-8000-000000000102','Audit retention Bravo','d2560000-0000-4000-8000-000000000001');
INSERT INTO public.audit_logs(id,timestamp,user_id,org_id,action,resource_type,resource_id,ip_address,user_agent,details,severity) VALUES
  ('d2560000-0000-4000-8000-000000000301',now()-interval '1 year'-interval '1 microsecond','d2560000-0000-4000-8000-000000000001','d2560000-0000-4000-8000-000000000101','retention.cutoff.before','synthetic','d2560000-0000-4000-8000-000000000401','127.0.0.1','Synthetic Audit fixture','{"saved":"expired Alpha"}','info'),
  ('d2560000-0000-4000-8000-000000000302',now()-interval '1 year'-interval '1 microsecond','d2560000-0000-4000-8000-000000000001','d2560000-0000-4000-8000-000000000102','retention.cutoff.before','synthetic','d2560000-0000-4000-8000-000000000402','127.0.0.1','Synthetic Audit fixture','{"saved":"expired Bravo"}','warning'),
  ('d2560000-0000-4000-8000-000000000303',now()-interval '1 year'-interval '1 microsecond','d2560000-0000-4000-8000-000000000001',NULL,'retention.cutoff.before','synthetic','d2560000-0000-4000-8000-000000000403','127.0.0.1','Synthetic Audit fixture','{"saved":"expired global"}','critical'),
  ('d2560000-0000-4000-8000-000000000304',now()-interval '1 year','d2560000-0000-4000-8000-000000000001','d2560000-0000-4000-8000-000000000101','retention.cutoff.equal','synthetic','d2560000-0000-4000-8000-000000000404','127.0.0.1','Synthetic Audit fixture','{"saved":"exact cutoff","values":[1,2]}','info'),
  ('d2560000-0000-4000-8000-000000000305',now()-interval '1 year'+interval '1 microsecond','d2560000-0000-4000-8000-000000000001','d2560000-0000-4000-8000-000000000102','retention.cutoff.after','synthetic','d2560000-0000-4000-8000-000000000405','127.0.0.1','Synthetic Audit fixture','{"saved":"recent Bravo","values":[3,4]}','warning'),
  ('d2560000-0000-4000-8000-000000000306',now(),'d2560000-0000-4000-8000-000000000001',NULL,'retention.cutoff.current','synthetic','d2560000-0000-4000-8000-000000000406','127.0.0.1','Synthetic Audit fixture','{"saved":"current global","values":[5,6]}','critical');
CREATE TEMP TABLE audit_retention_before AS SELECT id,to_jsonb(log) AS row_data FROM public.audit_logs AS log;

SET LOCAL ROLE service_role;
SELECT is(public.cleanup_old_audit_logs(),3,'service cleanup deletes exactly the old Alpha, Bravo and global rows');
RESET ROLE;
SELECT results_eq($$ SELECT id,to_jsonb(log) FROM public.audit_logs AS log ORDER BY id $$,
  $$ SELECT * FROM audit_retention_before WHERE id NOT IN ('d2560000-0000-4000-8000-000000000301','d2560000-0000-4000-8000-000000000302','d2560000-0000-4000-8000-000000000303') ORDER BY id $$,
  'equal, recent, current and original logs retain every actor, scope, timestamp and detail field');
SET LOCAL ROLE service_role;
SELECT is(public.cleanup_old_audit_logs(),0,'Audit cleanup replays with no new deletions');
RESET ROLE;
SELECT results_eq($$ SELECT id,to_jsonb(log) FROM public.audit_logs AS log ORDER BY id $$,
  $$ SELECT * FROM audit_retention_before WHERE id NOT IN ('d2560000-0000-4000-8000-000000000301','d2560000-0000-4000-8000-000000000302','d2560000-0000-4000-8000-000000000303') ORDER BY id $$,
  'Audit replay leaves the complete retained history unchanged');
SELECT * FROM finish();
ROLLBACK;
