-- The helper replacement narrows access without changing saved files or People.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20260926000800'),
  1, 'Counseling file scope migration was recorded by the local runner');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20260926001100'),
  1, 'Sensitive artifact read migration was recorded by the local runner');
CREATE TEMP TABLE personnel_counseling_file_current_rows AS
SELECT 'auth.users'::text AS table_name, id AS row_id, to_jsonb(row_value) AS row_data FROM auth.users AS row_value WHERE id IN ('e9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000002','e9000000-0000-4000-8000-000000000003','e9000000-0000-4000-8000-000000000004')
UNION ALL
SELECT 'public.organizations', id, to_jsonb(row_value) FROM public.organizations AS row_value WHERE id = 'e9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.groups', id, to_jsonb(row_value) FROM public.groups AS row_value WHERE id = 'e9000000-0000-4000-8000-000000000201'
UNION ALL
SELECT 'public.organization_memberships', id, to_jsonb(row_value) FROM public.organization_memberships AS row_value WHERE organization_id = 'e9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel', id, to_jsonb(row_value) FROM public.personnel AS row_value WHERE organization_id = 'e9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.sign_in_rosters', id, to_jsonb(row_value) FROM public.sign_in_rosters AS row_value WHERE id = 'e9000000-0000-4000-8000-000000000401'
UNION ALL
SELECT 'storage.objects', id, to_jsonb(row_value) FROM storage.objects AS row_value WHERE id IN ('e9000000-0000-4000-8000-000000000501','e9000000-0000-4000-8000-000000000502','e9000000-0000-4000-8000-000000000503','e9000000-0000-4000-8000-000000000504','e9000000-0000-4000-8000-000000000505')
UNION ALL
SELECT 'public.counseling_records', id, to_jsonb(row_value) FROM public.counseling_records AS row_value WHERE organization_id = 'e9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.leader_notes', id, to_jsonb(row_value) FROM public.leader_notes AS row_value WHERE organization_id = 'e9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel_follow_ups', id, to_jsonb(row_value) FROM public.personnel_follow_ups AS row_value WHERE organization_id = 'e9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel_documents', id, to_jsonb(row_value) FROM public.personnel_documents AS row_value WHERE organization_id = 'e9000000-0000-4000-8000-000000000101';
SELECT is((SELECT count(*)::integer FROM personnel_counseling_file_current_rows), 26, 'all historical Personnel, artifact and file rows remain');
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM personnel_counseling_file_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.personnel_counseling_file_before_rows ORDER BY table_name, row_id $$,
  'migration preserves exact Auth, membership, Personnel, artifact, roster and file values');
SELECT ok(has_function_privilege('authenticated', 'public.sensitive_file_object_is_readable(text,text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.sensitive_file_object_is_writable(text,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.sensitive_file_object_is_readable(text,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.sensitive_file_object_is_writable(text,text)', 'EXECUTE'),
  'sensitive file helper grants survive');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM storage.objects), 0,
  'Group operator cannot directly read counseling files after sensitivity upgrade');
SELECT ok(NOT public.sensitive_file_object_is_writable('counseling-files', 'e9000000-0000-4000-8000-000000000101/counseling-records/e9000000-0000-4000-8000-000000000302/unassigned.pdf'),
  'Group member cannot write retained unassigned counseling file');
SELECT set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'counseling-files'), 0,
  'Organization operator cannot directly read counseling files after sensitivity upgrade');
SELECT is((SELECT count(*)::integer FROM public.counseling_records), 0,
  'Organization operator cannot directly read saved counseling rows');
SELECT is((SELECT count(*)::integer FROM public.leader_notes), 0,
  'Organization operator cannot directly read saved leader notes');
SELECT is((SELECT count(*)::integer FROM public.personnel_follow_ups), 0,
  'Organization operator cannot directly read saved follow-ups');
SELECT is((SELECT count(*)::integer FROM public.personnel_documents), 0,
  'Organization operator cannot directly read saved document metadata');
SELECT set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000004', true);
SELECT is((SELECT count(*)::integer FROM public.counseling_records), 1,
  'Group configurator reads only assigned saved counseling row');
SELECT is((SELECT count(*)::integer FROM public.leader_notes), 1,
  'Group configurator reads only assigned saved leader note');
SELECT is((SELECT count(*)::integer FROM public.personnel_follow_ups), 1,
  'Group configurator reads only assigned saved follow-up');
SELECT is((SELECT count(*)::integer FROM public.personnel_documents), 1,
  'Group configurator reads only assigned saved document metadata');
SELECT is((SELECT count(*)::integer FROM storage.objects WHERE bucket_id IN ('counseling-files', 'personnel-documents')), 2,
  'Group configurator reads only assigned counseling and document files');
SELECT set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT id FROM storage.objects), 'e9000000-0000-4000-8000-000000000503'::uuid,
  'Training viewer retains only Sign-In Roster file');
SELECT * FROM finish();
ROLLBACK;
