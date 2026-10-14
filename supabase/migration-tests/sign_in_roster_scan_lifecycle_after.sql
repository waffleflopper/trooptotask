BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE FUNCTION pg_temp.key(p_roster text, p_name text) RETURNS text LANGUAGE sql AS $$
  SELECT 'b1643200-0000-4000-8000-000000000101/sign-in-rosters/b1643200-0000-4000-8000-000000000' || p_roster || '/' || p_name
$$;
CREATE FUNCTION pg_temp.retirement(p_name text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT CASE WHEN object_name IS NULL THEN 'removed' ELSE 'pending' END
  FROM organization_private.file_retirements
  WHERE key_digest = sha256(convert_to('counseling-files/' || p_name, 'UTF8'))
$$;
CREATE FUNCTION pg_temp.pointer(p_roster text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT signed_file_path FROM public.sign_in_rosters WHERE id = ('b1643200-0000-4000-8000-000000000' || p_roster)::uuid
$$;
CREATE FUNCTION pg_temp.act_as(p_user_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('role', 'authenticated', true),
    set_config('request.jwt.claim.sub', p_user_id::text, true),
    set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
$$;

SELECT ok((SELECT migration_absent FROM upgrade_fixture.sign_in_roster_scan_baseline),
  'saved rosters precede the scan lifecycle migration');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20261013000600'),
  1, 'the scan lifecycle migration is recorded after populated upgrade');
SELECT is_empty($$
  (SELECT * FROM upgrade_fixture.sign_in_roster_scan_before_rows
   EXCEPT SELECT * FROM upgrade_fixture.sign_in_roster_scan_current_rows)
  UNION ALL
  (SELECT * FROM upgrade_fixture.sign_in_roster_scan_current_rows
   EXCEPT SELECT * FROM upgrade_fixture.sign_in_roster_scan_before_rows)
$$, 'roster ids, pointers, legacy values and stored objects are unchanged');
SELECT is((SELECT count(*)::integer FROM organization_private.file_retirements WHERE object_name LIKE 'b1643200-%'), 0,
  'the upgrade retires no saved or orphaned key');
SELECT ok(
  has_function_privilege('authenticated', 'public.attach_sign_in_roster_scan(uuid,uuid,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.remove_sign_in_roster_scan(uuid,uuid,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.delete_sign_in_roster(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.delete_sign_in_roster(uuid,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.settle_sign_in_roster_scan_upload(uuid,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.settle_sign_in_roster_scan_upload(uuid,uuid,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.sensitive_file_object_is_readable(text,text)', 'EXECUTE'),
  'command and read helper grants are in place');

SELECT pg_temp.act_as('b1643200-0000-4000-8000-000000000003');
SELECT is((SELECT array_agg(id::text ORDER BY id) FROM storage.objects WHERE id::text LIKE 'b1643200-%'),
  ARRAY['b1643200-0000-4000-8000-000000000501'], 'a viewer reads the saved scan but not the orphaned upload');

SELECT pg_temp.act_as('b1643200-0000-4000-8000-000000000002');
SELECT throws_ok($$ SELECT * FROM public.delete_sign_in_roster('b1643200-0000-4000-8000-000000000101', 'b1643200-0000-4000-8000-000000000402') $$,
  '22023', NULL, 'a roster with a legacy pointer is refused before any change');
SELECT is((SELECT ARRAY[outcome, retired_object_name] FROM public.remove_sign_in_roster_scan('b1643200-0000-4000-8000-000000000101',
    'b1643200-0000-4000-8000-000000000401', pg_temp.key('401', 'current.pdf'))),
  ARRAY['removed', pg_temp.key('401', 'current.pdf')], 'a saved scan removes through the new command');
SELECT is((SELECT ARRAY[title, retired_object_name] FROM public.delete_sign_in_roster('b1643200-0000-4000-8000-000000000101', 'b1643200-0000-4000-8000-000000000403')),
  ARRAY['No scan', NULL], 'a saved roster without a scan deletes');
SELECT is(ARRAY[pg_temp.pointer('402'), pg_temp.retirement(pg_temp.key('401', 'orphan.pdf')),
    pg_temp.retirement('b1643200-0000-4000-8000-000000000101/b1643200-0000-4000-8000-000000000402/signed.pdf')],
  ARRAY['b1643200-0000-4000-8000-000000000101/b1643200-0000-4000-8000-000000000402/signed.pdf', NULL, NULL],
  'legacy and orphaned keys are preserved, not backfilled');
SELECT * FROM finish();
ROLLBACK;
