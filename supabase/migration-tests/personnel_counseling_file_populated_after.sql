-- The helper replacement narrows access without changing saved files or People.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20260926000800'),
  1, 'Counseling file scope migration was recorded by the local runner');
CREATE TEMP TABLE personnel_counseling_file_current_rows AS
SELECT 'auth.users'::text AS table_name, id AS row_id, to_jsonb(row_value) AS row_data FROM auth.users AS row_value WHERE id IN ('e9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000002','e9000000-0000-4000-8000-000000000003')
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
SELECT 'storage.objects', id, to_jsonb(row_value) FROM storage.objects AS row_value WHERE id IN ('e9000000-0000-4000-8000-000000000501','e9000000-0000-4000-8000-000000000502','e9000000-0000-4000-8000-000000000503');
SELECT is((SELECT count(*)::integer FROM personnel_counseling_file_current_rows), 14, 'all historical Personnel and file rows remain');
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM personnel_counseling_file_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.personnel_counseling_file_before_rows ORDER BY table_name, row_id $$,
  'migration preserves exact Auth, membership, Personnel, roster and file values');
SELECT ok(has_function_privilege('authenticated', 'public.sensitive_file_object_is_readable(text,text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.sensitive_file_object_is_writable(text,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.sensitive_file_object_is_readable(text,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.sensitive_file_object_is_writable(text,text)', 'EXECUTE'),
  'sensitive file helper grants survive');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT id FROM storage.objects), 'e9000000-0000-4000-8000-000000000501'::uuid,
  'Group member retains only assigned counseling file after upgrade');
SELECT ok(NOT public.sensitive_file_object_is_writable('counseling-files', 'e9000000-0000-4000-8000-000000000101/counseling-records/e9000000-0000-4000-8000-000000000302/unassigned.pdf'),
  'Group member cannot write retained unassigned counseling file');
SELECT set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'counseling-files'), 2,
  'Organization member retains assigned and unassigned counseling files');
SELECT set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT id FROM storage.objects), 'e9000000-0000-4000-8000-000000000503'::uuid,
  'Training viewer retains only Sign-In Roster file');
SELECT * FROM finish();
ROLLBACK;
