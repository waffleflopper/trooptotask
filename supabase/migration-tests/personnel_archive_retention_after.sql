-- Reuse the legitimate pre-evaluator legacy rows; never disable the new guards.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version='20261001000100'),1,'Personnel retention migration was applied');
CREATE TEMP VIEW retention_upgrade_rows AS
 SELECT 'personnel'::text table_name,id row_id,to_jsonb(p) row_data FROM public.personnel p WHERE organization_id IN
  ('d1602000-0000-4000-8000-000000000101','d1602000-0000-4000-8000-000000000102')
 UNION ALL SELECT 'entry',id,to_jsonb(e) FROM public.rating_scheme_entries e WHERE organization_id IN
  ('d1602000-0000-4000-8000-000000000101','d1602000-0000-4000-8000-000000000102');
SELECT results_eq($$ SELECT * FROM retention_upgrade_rows ORDER BY table_name,row_id $$,
 $$ SELECT * FROM upgrade_fixture.rating_scheme_evaluator_before ORDER BY table_name,row_id $$,
 'all thirteen predecessor Personnel/evaluation rows remain byte-for-byte unchanged after both migrations');

-- These are unrelated archive-field edits on the legitimately preserved legacy
-- people, not newly created foreign links. Snapshot their actual prepared state.
UPDATE public.personnel SET archived_at='2000-01-01Z' WHERE id IN
 ('d1602000-0000-4000-8000-000000000302','d1602000-0000-4000-8000-000000000305');
INSERT INTO public.personnel (id,organization_id,rank,first_name,last_name,slug,archived_at) VALUES
 ('d1602000-0000-4000-8000-000000000391','d1602000-0000-4000-8000-000000000102','SGT','Freely','Deletable Bravo','retention-upgrade-free-bravo','2000-01-01Z'),
 ('d1602000-0000-4000-8000-000000000392','d1602000-0000-4000-8000-000000000101','SGT','Freely','Deletable Alpha','retention-upgrade-free-alpha','2000-01-01Z');
INSERT INTO public.personnel_documents (id,organization_id,personnel_id,title,file_path,uploaded_by,file_size_bytes,content_type) VALUES
 ('d1602000-0000-4000-8000-000000000491','d1602000-0000-4000-8000-000000000102','d1602000-0000-4000-8000-000000000391','Free Bravo document','synthetic/free-bravo.pdf','fixture',1,'application/pdf'),
 ('d1602000-0000-4000-8000-000000000492','d1602000-0000-4000-8000-000000000102','d1602000-0000-4000-8000-000000000305','Legacy Bravo document','synthetic/legacy-bravo.pdf','fixture',1,'application/pdf'),
 ('d1602000-0000-4000-8000-000000000493','d1602000-0000-4000-8000-000000000101','d1602000-0000-4000-8000-000000000392','Free Alpha document','synthetic/free-alpha.pdf','fixture',1,'application/pdf'),
 ('d1602000-0000-4000-8000-000000000494','d1602000-0000-4000-8000-000000000101','d1602000-0000-4000-8000-000000000302','Mixed Alpha document','synthetic/mixed-alpha.pdf','fixture',1,'application/pdf');
INSERT INTO public.counseling_records (id,organization_id,personnel_id,date_conducted,subject,title,file_path,uploaded_by,archived_at) VALUES
 ('d1602000-0000-4000-8000-000000000495','d1602000-0000-4000-8000-000000000102','d1602000-0000-4000-8000-000000000391','2026-01-01','Free Bravo','Free Bravo','synthetic/free-bravo-counseling.pdf','fixture','2026-01-01Z'),
 ('d1602000-0000-4000-8000-000000000496','d1602000-0000-4000-8000-000000000101','d1602000-0000-4000-8000-000000000392','2026-01-01','Free Alpha','Free Alpha','synthetic/free-alpha-counseling.pdf','fixture','2026-01-01Z');
CREATE TEMP VIEW retention_upgrade_effect_rows AS
 SELECT * FROM retention_upgrade_rows
 UNION ALL SELECT 'document',id,to_jsonb(d) FROM public.personnel_documents d WHERE organization_id IN
  ('d1602000-0000-4000-8000-000000000101','d1602000-0000-4000-8000-000000000102')
 UNION ALL SELECT 'counseling',id,to_jsonb(c) FROM public.counseling_records c WHERE organization_id IN
  ('d1602000-0000-4000-8000-000000000101','d1602000-0000-4000-8000-000000000102');
CREATE TEMP TABLE retention_upgrade_before AS SELECT * FROM retention_upgrade_effect_rows;
CREATE FUNCTION pg_temp.retention_legacy_batch_rejected(org_id uuid,ids uuid[]) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
 PERFORM public.delete_expired_personnel(org_id,ids,'2025-05-30T12:00:00Z');
 -- The old global guards are deferred. Make the check happen inside this
 -- exception subtransaction so rejection rolls back the whole attempted batch.
 SET CONSTRAINTS ALL IMMEDIATE;
 RETURN false;
EXCEPTION WHEN foreign_key_violation THEN RETURN true;
END;
$$;
SET LOCAL ROLE service_role;
SELECT ok(pg_temp.retention_legacy_batch_rejected('d1602000-0000-4000-8000-000000000102',ARRAY[
 'd1602000-0000-4000-8000-000000000391','d1602000-0000-4000-8000-000000000305']::uuid[]),
 'one historical foreign evaluator link rejects the whole selected parent batch');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM retention_upgrade_effect_rows ORDER BY table_name,row_id $$,
 $$ SELECT * FROM retention_upgrade_before ORDER BY table_name,row_id $$,
 'deferred legacy rejection preserves both parents, children, four local clears, rated cascades and every timestamp');
SET LOCAL ROLE service_role;
SELECT ok(pg_temp.retention_legacy_batch_rejected('d1602000-0000-4000-8000-000000000101',ARRAY[
 'd1602000-0000-4000-8000-000000000392','d1602000-0000-4000-8000-000000000302']::uuid[]),
 'mixed local and historical foreign evaluator slots also reject the whole batch');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM retention_upgrade_effect_rows ORDER BY table_name,row_id $$,
 $$ SELECT * FROM retention_upgrade_before ORDER BY table_name,row_id $$,
 'mixed legacy rejection preserves the freely deletable parent and all other rows exactly');
SELECT * FROM finish();
ROLLBACK;
