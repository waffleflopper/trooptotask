-- Preserve saved Rating Scheme data while tightening only access to NULL Group.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20260926000900'),
  1, 'Rating Scheme scope migration was recorded');
CREATE TEMP TABLE rating_scheme_current_rows AS
SELECT 'auth.users'::text AS table_name, id AS row_id, to_jsonb(row_value) AS row_data FROM auth.users AS row_value WHERE id IN ('f9000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000002')
UNION ALL
SELECT 'public.organizations', id, to_jsonb(row_value) FROM public.organizations AS row_value WHERE id = 'f9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.groups', id, to_jsonb(row_value) FROM public.groups AS row_value WHERE id = 'f9000000-0000-4000-8000-000000000201'
UNION ALL
SELECT 'public.organization_memberships', id, to_jsonb(row_value) FROM public.organization_memberships AS row_value WHERE organization_id = 'f9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel', id, to_jsonb(row_value) FROM public.personnel AS row_value WHERE organization_id = 'f9000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.rating_scheme_entries', id, to_jsonb(row_value) FROM public.rating_scheme_entries AS row_value WHERE organization_id = 'f9000000-0000-4000-8000-000000000101';
SELECT is((SELECT count(*)::integer FROM rating_scheme_current_rows), 14, 'all historical Rating Scheme fixture rows remain');
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM rating_scheme_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.rating_scheme_before_rows ORDER BY table_name, row_id $$,
  'migration preserves exact Auth, Organization, membership, Person and Rating Scheme values');
SELECT ok(NOT has_function_privilege('authenticated', 'public.rating_scheme_personnel_group_scope_matches(uuid,uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.list_rating_scheme_personnel_lookup(uuid)', 'EXECUTE'),
  'private helper and existing public lookup privileges survive upgrade');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'Rating-only Group member still cannot read Personnel');
SELECT is((SELECT id FROM public.list_rating_scheme_personnel_lookup('f9000000-0000-4000-8000-000000000101')),
  'f9000000-0000-4000-8000-000000000301'::uuid, 'Group lookup retains active assigned Person, excludes unassigned');
SELECT is((SELECT string_agg(id::text, ',' ORDER BY id) FROM public.rating_scheme_entries),
  'f9000000-0000-4000-8000-000000000401,f9000000-0000-4000-8000-000000000402',
  'Group member retains active and archived assigned records, loses unassigned records');
SELECT ok(NOT public.can_view_rating_scheme_record('f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000303')
  AND NOT public.can_edit_rating_scheme_record('f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000304'),
  'both record helpers deny unassigned active and archived references');
SELECT set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.list_rating_scheme_personnel_lookup('f9000000-0000-4000-8000-000000000101')),
  2, 'Organization-wide member retains active assigned and unassigned lookup');
SELECT is((SELECT count(*)::integer FROM public.rating_scheme_entries),
  4, 'Organization-wide member retains active and archived saved records');
SELECT ok(public.can_edit_rating_scheme_record('f9000000-0000-4000-8000-000000000101', 'f9000000-0000-4000-8000-000000000304'),
  'Organization-wide member retains archived unassigned edit');
SELECT * FROM finish();
ROLLBACK;
