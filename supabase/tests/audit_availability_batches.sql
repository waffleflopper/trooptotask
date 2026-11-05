-- Each bulk availability action writes one audit entry per row, all sharing one batch id that the database assigns
-- per transaction. The actions commit through a separate signed-in member connection, so each is its own transaction.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();

SELECT dblink_connect('audit_batches', 'hostaddr=' || host(inet_server_addr()) ||
  ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() ||
  ' application_name=t3_audit_batches');
SELECT dblink_exec('audit_batches', $$SET statement_timeout='10s'$$);

CREATE FUNCTION pg_temp.cleanup() RETURNS void LANGUAGE sql AS $$
  SELECT dblink_exec('audit_batches', $cleanup$
    DELETE FROM public.audit_logs WHERE org_id = 'a1991000-0000-4000-8000-000000000101';
    DELETE FROM public.organizations WHERE id = 'a1991000-0000-4000-8000-000000000101';
    DELETE FROM auth.users WHERE id = 'a1991000-0000-4000-8000-000000000001';
  $cleanup$);
$$;
SELECT pg_temp.cleanup();
SELECT dblink_exec('audit_batches', $fixture$
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
  VALUES ('a1991000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'batch-operator@example.test', now());
  INSERT INTO public.organizations (id, name, created_by)
  VALUES ('a1991000-0000-4000-8000-000000000101', 'Audit Batches', 'a1991000-0000-4000-8000-000000000001');
  INSERT INTO public.organization_memberships (
    organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
  ) VALUES ('a1991000-0000-4000-8000-000000000101', 'a1991000-0000-4000-8000-000000000001', 'member', 'viewer',
    '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[]);
  INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
    ('a1991000-0000-4000-8000-000000000301', 'a1991000-0000-4000-8000-000000000101', 'SPC', 'Jane', 'Doe', 'batch-doe'),
    ('a1991000-0000-4000-8000-000000000302', 'a1991000-0000-4000-8000-000000000101', 'PFC', 'Rich', 'Roe', 'batch-roe');
  INSERT INTO public.status_types (id, organization_id, name)
  VALUES ('a1991000-0000-4000-8000-000000000401', 'a1991000-0000-4000-8000-000000000101', 'Leave');
$fixture$);

SELECT dblink_exec('audit_batches', $$SET ROLE authenticated$$);
SELECT dblink_exec('audit_batches', $$SET request.jwt.claim.sub = 'a1991000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('audit_batches', $$
  INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date)
  VALUES
    ('a1991000-0000-4000-8000-000000000501', 'a1991000-0000-4000-8000-000000000101',
     'a1991000-0000-4000-8000-000000000301', 'a1991000-0000-4000-8000-000000000401', '2030-11-10', '2030-11-20'),
    ('a1991000-0000-4000-8000-000000000502', 'a1991000-0000-4000-8000-000000000101',
     'a1991000-0000-4000-8000-000000000302', 'a1991000-0000-4000-8000-000000000401', '2030-11-10', '2030-11-20')
$$);
SELECT dblink_exec('audit_batches', $$
  INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date)
  VALUES ('a1991000-0000-4000-8000-000000000503', 'a1991000-0000-4000-8000-000000000101',
    'a1991000-0000-4000-8000-000000000301', 'a1991000-0000-4000-8000-000000000401', '2030-12-01', '2030-12-02')
$$);
SELECT dblink_exec('audit_batches', $$ DO $do$ BEGIN
  PERFORM public.import_availability_entries('a1991000-0000-4000-8000-000000000101', '[
    {"personnel_id": "a1991000-0000-4000-8000-000000000301", "status_type_id": "a1991000-0000-4000-8000-000000000401",
     "start_date": "2030-12-01", "end_date": "2030-12-03", "note": null, "overlap": "replace",
     "replaces": [{"id": "a1991000-0000-4000-8000-000000000503", "status_type_id": "a1991000-0000-4000-8000-000000000401",
       "start_date": "2030-12-01", "end_date": "2030-12-02", "note": null}]},
    {"personnel_id": "a1991000-0000-4000-8000-000000000302", "status_type_id": "a1991000-0000-4000-8000-000000000401",
     "start_date": "2031-01-05", "end_date": "2031-01-06", "note": null, "overlap": "none"}
  ]'::jsonb);
END $do$ $$);
SELECT dblink_exec('audit_batches', $$ DO $do$ BEGIN
  PERFORM public.delete_availability_entries('a1991000-0000-4000-8000-000000000101', ARRAY[
    'a1991000-0000-4000-8000-000000000501', 'a1991000-0000-4000-8000-000000000502']::uuid[]);
END $do$ $$);
SELECT dblink_exec('audit_batches', 'RESET ROLE');

CREATE TEMP TABLE batch_entries AS
SELECT batch_id, array_agg(action || ' ' || subject_label ORDER BY action, subject_label) AS entries
FROM public.audit_logs
WHERE org_id = 'a1991000-0000-4000-8000-000000000101'
GROUP BY batch_id;

SELECT is((SELECT count(*)::integer FROM batch_entries WHERE batch_id IS NULL), 0, 'every entry carries a batch id');
SELECT bag_eq(
  $$ SELECT entries FROM batch_entries $$,
  $$ VALUES
    (ARRAY['availability.created PFC Roe, Rich', 'availability.created SPC Doe, Jane']),
    (ARRAY['availability.created SPC Doe, Jane']),
    (ARRAY['availability.created PFC Roe, Rich', 'availability.created SPC Doe, Jane', 'availability.deleted SPC Doe, Jane']),
    (ARRAY['availability.deleted PFC Roe, Rich', 'availability.deleted SPC Doe, Jane']) $$,
  'a multi-row add, an import and a bulk removal each write one entry per row under one batch id; separate actions do not share one');

SELECT pg_temp.cleanup();
SELECT dblink_disconnect('audit_batches');

SELECT * FROM finish();
ROLLBACK;
