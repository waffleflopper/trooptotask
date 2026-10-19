CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claims', '{}', false);
INSERT INTO auth.users (id, email)
SELECT ('f6432000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'f6432-' || n || '@example.test' FROM generate_series(1, 3) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('f6432000-0000-4000-8000-000000000101', 'F6432 lifecycle', 'f6432000-0000-4000-8000-000000000001'),
  ('f6432000-0000-4000-8000-000000000102', 'F6432 foreign', 'f6432000-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  ('f6432000-0000-4000-8000-000000000101', 'f6432000-0000-4000-8000-000000000001', 'admin', 'viewer',
    '{"personnel":"none","training":"none","ratingScheme":"none"}', 'organization', ARRAY[]::uuid[]),
  ('f6432000-0000-4000-8000-000000000101', 'f6432000-0000-4000-8000-000000000002', 'member', 'viewer',
    '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]),
  ('f6432000-0000-4000-8000-000000000101', 'f6432000-0000-4000-8000-000000000003', 'member', 'viewer',
    '{"personnel":"operate"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug, archived_at)
SELECT ('f6432000-0000-4000-8000-' || lpad(person::text, 12, '0'))::uuid,
  ('f6432000-0000-4000-8000-' || lpad(org::text, 12, '0'))::uuid, 'SGT', 'Saved', 'Person ' || person, 'f6432-' || person, archived_at::timestamptz
FROM (VALUES (301, 101, '2030-01-02T03:04:05.678Z'), (302, 101, '2030-01-02T03:04:05.678Z'),
  (303, 101, NULL), (304, 101, NULL), (351, 102, NULL)) AS people(person, org, archived_at);
INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, notes, status, created_by, completed_at, archived_at)
SELECT ('f6432000-0000-4000-8000-' || lpad((1000 + person * 10 + k)::text, 12, '0'))::uuid,
  ('f6432000-0000-4000-8000-' || lpad(org::text, 12, '0'))::uuid, ('f6432000-0000-4000-8000-' || lpad(person::text, 12, '0'))::uuid,
  'Follow-up ' || person || '.' || k, 'Saved notes', status, 'fixture', completed_at::timestamptz, archived_at::timestamptz
FROM (VALUES
  (301, 1, 101, 'archived', NULL, '2030-01-02T03:04:05.678Z'), (301, 2, 101, 'open', NULL, NULL),
  (302, 1, 101, 'open', NULL, NULL), (302, 2, 101, 'archived', NULL, '2030-01-02T03:04:05.678Z'),
  (303, 1, 101, 'completed', '2029-12-01T00:00:00Z', NULL), (303, 2, 101, 'open', NULL, NULL),
  (304, 1, 101, 'open', NULL, NULL), (351, 1, 102, 'open', NULL, NULL)
) AS rows(person, k, org, status, completed_at, archived_at);
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path, archived_at)
SELECT ('f6432000-0000-4000-8000-' || lpad((2000 + person * 10 + k)::text, 12, '0'))::uuid,
  'f6432000-0000-4000-8000-000000000101', ('f6432000-0000-4000-8000-' || lpad(person::text, 12, '0'))::uuid,
  '2030-01-01', 'Saved subject', 'Counseling ' || person || '.' || k, 'fixture',
  'f6432000-0000-4000-8000-000000000101/counseling-records/' || ('f6432000-0000-4000-8000-' || lpad(person::text, 12, '0')) || '/c' || k || '.pdf',
  archived_at::timestamptz
FROM (VALUES (301, 1, '2030-01-02T03:04:05.678Z'), (301, 2, NULL), (302, 1, '2030-01-02T03:04:05.678Z'), (303, 1, NULL), (304, 1, NULL))
  AS rows(person, k, archived_at);
INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by, archived_at)
SELECT ('f6432000-0000-4000-8000-' || lpad((3000 + person * 10 + k)::text, 12, '0'))::uuid,
  'f6432000-0000-4000-8000-000000000101', ('f6432000-0000-4000-8000-' || lpad(person::text, 12, '0'))::uuid, 'Document ' || person || '.' || k,
  'f6432000-0000-4000-8000-000000000101/personnel/' || ('f6432000-0000-4000-8000-' || lpad(person::text, 12, '0')) || '/documents/d' || k || '.pdf',
  128, 'application/pdf', 'fixture', archived_at::timestamptz
FROM (VALUES (301, 1, '2030-01-02T03:04:05.678Z'), (302, 1, NULL), (303, 1, NULL), (304, 1, NULL)) AS rows(person, k, archived_at);
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text, archived_at)
SELECT ('f6432000-0000-4000-8000-' || lpad((4000 + person * 10 + k)::text, 12, '0'))::uuid,
  ('f6432000-0000-4000-8000-' || lpad(org::text, 12, '0'))::uuid, ('f6432000-0000-4000-8000-' || lpad(person::text, 12, '0'))::uuid,
  'Saved author', 'Saved note ' || person || '.' || k, archived_at::timestamptz
FROM (VALUES (301, 1, 101, NULL), (302, 1, 101, NULL), (302, 2, 101, '2030-01-02T03:04:05.678Z'),
  (303, 1, 101, '2029-06-01T00:00:00Z'), (303, 2, 101, NULL), (304, 1, 101, NULL), (351, 1, 102, NULL))
  AS rows(person, k, org, archived_at);
INSERT INTO public.deletion_requests (
  id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description, resource_url, status,
  reviewed_by, reviewed_at, denial_reason, created_at
) VALUES
  ('f6432000-0000-4000-8000-000000000601', 'f6432000-0000-4000-8000-000000000101', 'f6432000-0000-4000-8000-000000000003', 'f6432-3@example.test',
    'personnel', 'f6432000-0000-4000-8000-000000000304', 'Saved duplicate one', '/one', 'pending', NULL, NULL, NULL, '2030-01-01T00:00:00.111Z'),
  ('f6432000-0000-4000-8000-000000000602', 'f6432000-0000-4000-8000-000000000101', 'f6432000-0000-4000-8000-000000000003', 'f6432-3@example.test',
    'personnel', 'f6432000-0000-4000-8000-000000000304', 'Saved duplicate two', '/two', 'pending', NULL, NULL, NULL, '2030-01-01T00:00:00.222Z'),
  ('f6432000-0000-4000-8000-000000000603', 'f6432000-0000-4000-8000-000000000101', 'f6432000-0000-4000-8000-000000000003', 'f6432-3@example.test',
    'personnel', 'f6432000-0000-4000-8000-000000000304', 'Saved denial', NULL, 'denied', 'f6432000-0000-4000-8000-000000000001',
    '2030-01-01T00:00:00.333Z', 'Saved reason', '2029-12-01T00:00:00Z');

CREATE VIEW upgrade_fixture.atomic_personnel_lifecycle_current_rows AS
SELECT 'personnel'::text AS table_name, id::text AS row_id, to_jsonb(r) AS row_data FROM public.personnel r WHERE id::text LIKE 'f6432000-%'
UNION ALL SELECT 'personnel_follow_ups', id::text, to_jsonb(r) - 'completed_by' - 'archived_by' FROM public.personnel_follow_ups r WHERE id::text LIKE 'f6432000-%'
UNION ALL SELECT 'counseling_records', id::text, to_jsonb(r) - 'archived_by' FROM public.counseling_records r WHERE id::text LIKE 'f6432000-%'
UNION ALL SELECT 'personnel_documents', id::text, to_jsonb(r) - 'archived_by' FROM public.personnel_documents r WHERE id::text LIKE 'f6432000-%'
UNION ALL SELECT 'leader_notes', id::text, to_jsonb(r) - 'archived_by' - 'updated_at' FROM public.leader_notes r WHERE id::text LIKE 'f6432000-%'
UNION ALL SELECT 'deletion_requests', id::text, to_jsonb(r) FROM public.deletion_requests r WHERE id::text LIKE 'f6432000-%'
UNION ALL SELECT 'organization_memberships', id::text, to_jsonb(r) FROM public.organization_memberships r WHERE organization_id::text LIKE 'f6432000-%';
CREATE TABLE upgrade_fixture.atomic_personnel_lifecycle_before_rows AS
  SELECT * FROM upgrade_fixture.atomic_personnel_lifecycle_current_rows;
CREATE VIEW upgrade_fixture.atomic_personnel_lifecycle_current_grants AS
SELECT table_name::text, grantee::text, privilege_type::text FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name IN ('personnel', 'personnel_follow_ups', 'counseling_records', 'personnel_documents',
  'leader_notes', 'deletion_requests');
CREATE TABLE upgrade_fixture.atomic_personnel_lifecycle_before_grants AS
  SELECT * FROM upgrade_fixture.atomic_personnel_lifecycle_current_grants;
CREATE TABLE upgrade_fixture.atomic_personnel_lifecycle_baseline AS
SELECT NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20261013000300', '20261013000400'))
  AND to_regprocedure('public.archive_personnel(uuid, uuid[], timestamptz)') IS NULL
  AND to_regprocedure('public.submit_deletion_request(uuid, uuid, text, text, uuid, text, text)') IS NULL AS migration_absent;
