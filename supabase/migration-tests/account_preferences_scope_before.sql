-- Populated synthetic fixtures in the database runner's owned disposable project.
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
RESET ROLE;
SET search_path = public, extensions;
SELECT set_config('request.jwt.claim.sub', '', false);

INSERT INTO auth.users (id, email) VALUES
('d2600000-0000-4000-8000-000000000001', 'saved-preferences@example.test'),
('d2600000-0000-4000-8000-000000000002', 'saved-preferences-peer@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
('d2600000-0000-4000-8000-000000000101', 'Saved preferences A', 'd2600000-0000-4000-8000-000000000001'),
('d2600000-0000-4000-8000-000000000102', 'Saved preferences B', 'd2600000-0000-4000-8000-000000000002');
INSERT INTO public.organization_memberships (
  id, organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
('d2600000-0000-4000-8000-000000000201', 'd2600000-0000-4000-8000-000000000101', 'd2600000-0000-4000-8000-000000000001', 'member', 'viewer', '{}', 'organization', '{}'),
('d2600000-0000-4000-8000-000000000202', 'd2600000-0000-4000-8000-000000000101', 'd2600000-0000-4000-8000-000000000002', 'admin', 'viewer', '{}', 'organization', '{}');
-- A's user no longer belongs to B; historical rows must remain intact and hidden.
INSERT INTO public.getting_started_progress (id, organization_id, user_id, dismissed_at, created_at) VALUES
('d2600000-0000-4000-8000-000000000301', 'd2600000-0000-4000-8000-000000000101', 'd2600000-0000-4000-8000-000000000001', '2026-09-01T01:02:03.456Z', '2026-08-01T01:02:03.456Z'),
('d2600000-0000-4000-8000-000000000302', 'd2600000-0000-4000-8000-000000000102', 'd2600000-0000-4000-8000-000000000001', '2026-09-02T01:02:03.456Z', '2026-08-02T01:02:03.456Z'),
('d2600000-0000-4000-8000-000000000303', 'd2600000-0000-4000-8000-000000000101', 'd2600000-0000-4000-8000-000000000002', NULL, '2026-08-03T01:02:03.456Z');
INSERT INTO public.user_org_preferences (id, organization_id, user_id, preferences, created_at, updated_at) VALUES
('d2600000-0000-4000-8000-000000000401', 'd2600000-0000-4000-8000-000000000101', 'd2600000-0000-4000-8000-000000000001', '{"calendar":{"showStatusText":true,"showPersonnelRoles":false},"training":{"matrixViewMode":"alphabetical","selectedGroupId":null},"historicalSentinel":"retain"}', '2026-08-01T01:02:03.456Z', '2026-09-01T01:02:03.456Z'),
('d2600000-0000-4000-8000-000000000402', 'd2600000-0000-4000-8000-000000000102', 'd2600000-0000-4000-8000-000000000001', '{"calendar":{"showPersonnelRoles":true},"historicalSentinel":"foreign"}', '2026-08-02T01:02:03.456Z', '2026-09-02T01:02:03.456Z'),
('d2600000-0000-4000-8000-000000000403', 'd2600000-0000-4000-8000-000000000101', 'd2600000-0000-4000-8000-000000000002', '{}', '2026-08-03T01:02:03.456Z', '2026-09-03T01:02:03.456Z');

CREATE VIEW upgrade_fixture.account_preferences_current_rows AS
SELECT 'auth.users'::text table_name, id::text row_id, to_jsonb(r) row_data FROM auth.users r WHERE id::text LIKE 'd2600000-%'
UNION ALL SELECT 'organizations', id::text, to_jsonb(r) FROM public.organizations r WHERE id::text LIKE 'd2600000-%'
UNION ALL SELECT 'memberships', id::text, to_jsonb(r) FROM public.organization_memberships r WHERE id::text LIKE 'd2600000-%'
UNION ALL SELECT 'progress', id::text, to_jsonb(r) FROM public.getting_started_progress r WHERE id::text LIKE 'd2600000-%'
UNION ALL SELECT 'preferences', id::text, to_jsonb(r) FROM public.user_org_preferences r WHERE id::text LIKE 'd2600000-%';
CREATE TABLE upgrade_fixture.account_preferences_before_rows AS
SELECT * FROM upgrade_fixture.account_preferences_current_rows;

-- Capture unaffected enforcement objects rather than freezing their SQL spelling.
CREATE VIEW upgrade_fixture.account_preferences_current_metadata AS
SELECT c.relname object_name, jsonb_build_object(
  'oid', c.oid, 'rls', c.relrowsecurity, 'forceRls', c.relforcerowsecurity, 'grants', c.relacl,
  'constraints', (SELECT jsonb_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid = c.oid),
  'triggers', (SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid = c.oid),
  'columns', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0)
) metadata
FROM pg_class c WHERE c.oid IN ('public.getting_started_progress'::regclass, 'public.user_org_preferences'::regclass)
UNION ALL SELECT 'is_org_member', jsonb_build_object('definition', pg_get_functiondef(p.oid), 'grants', p.proacl)
FROM pg_proc p WHERE p.oid = 'public.is_org_member(uuid)'::regprocedure
UNION ALL SELECT 'preference_policies', jsonb_agg(to_jsonb(p) ORDER BY p.polname)
FROM pg_policy p WHERE p.polrelid = 'public.user_org_preferences'::regclass;
CREATE TABLE upgrade_fixture.account_preferences_before_metadata AS
SELECT * FROM upgrade_fixture.account_preferences_current_metadata;

CREATE TEMP TABLE account_preferences_baseline_reads (progress_count integer, preference_count integer);
GRANT INSERT ON account_preferences_baseline_reads TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd2600000-0000-4000-8000-000000000001', false);
INSERT INTO account_preferences_baseline_reads
SELECT (SELECT count(*)::integer FROM public.getting_started_progress WHERE user_id = 'd2600000-0000-4000-8000-000000000001'),
       (SELECT count(*)::integer FROM public.user_org_preferences WHERE user_id = 'd2600000-0000-4000-8000-000000000001');
RESET ROLE;
CREATE TABLE upgrade_fixture.account_preferences_baseline AS
SELECT NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261004000100') migration_absent,
       progress_count, preference_count FROM account_preferences_baseline_reads;
DROP TABLE account_preferences_baseline_reads;
SELECT set_config('request.jwt.claim.sub', '', false);
