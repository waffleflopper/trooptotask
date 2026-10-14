BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SET LOCAL TIME ZONE 'UTC';

CREATE FUNCTION pg_temp.u(n bigint) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('d1643a00-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.child(family integer, person integer, k integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT pg_temp.u(family * 100000 + person * 10 + k)
$$;
CREATE FUNCTION pg_temp.act(n integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', coalesce(pg_temp.u(n)::text, ''), true),
    set_config('request.jwt.claims', CASE WHEN n IS NULL THEN '{}'
      ELSE json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text END, true);
$$;

INSERT INTO auth.users (id, email)
SELECT pg_temp.u(n), 'lifecycle-atomic-' || n || '@example.test' FROM generate_series(1, 9) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.u(101), 'Lifecycle Alpha', pg_temp.u(1)),
  (pg_temp.u(102), 'Lifecycle Foreign', pg_temp.u(8));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.u(201), pg_temp.u(101), 'Alpha'),
  (pg_temp.u(202), pg_temp.u(101), 'Bravo'),
  (pg_temp.u(203), pg_temp.u(102), 'Foreign');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.u(101), pg_temp.u(1), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(2), 'admin', 'viewer',
    '{"personnel":"none","training":"none","ratingScheme":"none","onboarding":"none","calendar":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(3), 'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(4), 'member', 'viewer', '{"personnel":"configure"}', 'groups', ARRAY[pg_temp.u(201)]),
  (pg_temp.u(101), pg_temp.u(5), 'member', 'viewer', '{"personnel":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(6), 'member', 'viewer', '{"personnel":"configure"}', 'groups', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(7), 'member', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(102), pg_temp.u(8), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(9), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.user_suspensions (user_id, suspended_by, reason)
VALUES (pg_temp.u(9), pg_temp.u(1), 'Suspended lifecycle reviewer');

INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at)
SELECT pg_temp.u(person), pg_temp.u(org), CASE WHEN grp IS NULL THEN NULL ELSE pg_temp.u(grp) END,
  'SGT', 'Lifecycle', 'Person ' || person, 'lifecycle-atomic-' || person, archived_at::timestamptz
FROM (VALUES
  (301, 101, 201, NULL), (302, 101, 202, NULL), (303, 101, NULL, NULL),
  (304, 101, 201, '2029-05-01T00:00:00.123Z'), (305, 101, 201, '2029-07-01T00:00:00.5Z'),
  (306, 101, 201, NULL), (307, 101, 201, NULL), (308, 101, 201, NULL), (351, 102, 203, NULL)
) AS people(person, org, grp, archived_at);

INSERT INTO public.personnel_follow_ups (
  id, organization_id, personnel_id, title, notes, status, created_by, completed_at, archived_at, created_at, updated_at
)
SELECT pg_temp.child(1, person, k), pg_temp.u(org), pg_temp.u(person), 'Follow-up ' || person || '.' || k, 'Saved notes',
  status, 'fixture', completed_at::timestamptz, archived_at::timestamptz, '2029-01-01T00:00:00Z', '2029-01-02T00:00:00Z'
FROM (VALUES
  (301, 1, 101, 'open', NULL, NULL), (301, 2, 101, 'completed', '2029-12-01T00:00:00Z', NULL),
  (301, 3, 101, 'archived', NULL, '2029-06-01T00:00:00Z'),
  (302, 1, 101, 'open', NULL, NULL),
  (304, 1, 101, 'open', NULL, NULL), (304, 2, 101, 'archived', NULL, '2029-05-01T00:00:00.123Z'),
  (305, 1, 101, 'open', NULL, NULL), (305, 2, 101, 'archived', NULL, '2029-07-01T00:00:00.5Z'),
  (306, 1, 101, 'open', NULL, NULL), (307, 1, 101, 'open', NULL, NULL), (351, 1, 102, 'open', NULL, NULL)
) AS rows(person, k, org, status, completed_at, archived_at);
INSERT INTO public.counseling_records (
  id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path, archived_at, created_at, updated_at
)
SELECT pg_temp.child(2, person, k), pg_temp.u(101), pg_temp.u(person), '2029-02-01', 'Subject ' || person, 'Counseling ' || person || '.' || k,
  'fixture', pg_temp.u(101) || '/counseling-records/' || pg_temp.u(person) || '/c' || k || '.pdf', archived_at::timestamptz,
  '2029-01-01T00:00:00Z', '2029-01-02T00:00:00Z'
FROM (VALUES
  (301, 1, NULL), (301, 2, '2029-06-01T00:00:00Z'), (302, 1, NULL),
  (304, 1, NULL), (304, 2, '2029-05-01T00:00:00.123Z'), (305, 1, NULL), (306, 1, NULL), (307, 1, NULL)
) AS rows(person, k, archived_at);
INSERT INTO public.personnel_documents (
  id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by, archived_at, created_at, updated_at
)
SELECT pg_temp.child(3, person, k), pg_temp.u(101), pg_temp.u(person), 'Document ' || person || '.' || k,
  pg_temp.u(101) || '/personnel/' || pg_temp.u(person) || '/documents/d' || k || '.pdf', 64, 'application/pdf', 'fixture',
  archived_at::timestamptz, '2029-01-01T00:00:00Z', '2029-01-02T00:00:00Z'
FROM (VALUES
  (301, 1, NULL), (301, 2, '2029-06-01T00:00:00Z'), (302, 1, NULL),
  (304, 1, '2029-05-01T00:00:00.123Z'), (306, 1, NULL), (307, 1, NULL)
) AS rows(person, k, archived_at);
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text, created_at, archived_at)
SELECT pg_temp.child(4, person, k), pg_temp.u(org), pg_temp.u(person), 'Author ' || person, 'Saved note ' || person || '.' || k,
  '2029-01-03T00:00:00Z', archived_at::timestamptz
FROM (VALUES
  (301, 1, 101, NULL), (301, 2, 101, '2029-06-01T00:00:00Z'), (302, 1, 101, NULL), (303, 1, 101, NULL),
  (304, 1, 101, NULL), (304, 2, 101, '2029-06-01T00:00:00Z'),
  (305, 1, 101, '2029-07-01T00:00:00.5Z'), (305, 2, 101, '2029-06-01T00:00:00Z'),
  (306, 1, 101, NULL), (307, 1, 101, NULL), (308, 1, 101, NULL), (351, 1, 102, NULL)
) AS rows(person, k, org, archived_at);
INSERT INTO public.deletion_requests (
  id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description, status, created_at
)
SELECT pg_temp.u(request), pg_temp.u(org), pg_temp.u(5), 'requester@example.test', resource_type, pg_temp.u(target),
  'Archive ' || target, status, '2029-08-01T00:00:00Z'
FROM (VALUES
  (601, 101, 'personnel', 307, 'pending'), (602, 101, 'personnel', 308, 'pending'),
  (603, 101, 'personnel', 308, 'pending'), (604, 101, 'personnel', 306, 'denied'),
  (605, 101, 'training_type', 306, 'pending'), (606, 102, 'personnel', 351, 'pending')
) AS rows(request, org, resource_type, target, status);

CREATE FUNCTION pg_temp.rows() RETURNS TABLE (tbl text, id uuid, row_data jsonb) LANGUAGE sql AS $$
  SELECT 'personnel', r.id, to_jsonb(r) FROM public.personnel r WHERE r.id::text LIKE 'd1643a00-%'
  UNION ALL SELECT 'follow_up', r.id, to_jsonb(r) FROM public.personnel_follow_ups r WHERE r.id::text LIKE 'd1643a00-%'
  UNION ALL SELECT 'counseling', r.id, to_jsonb(r) FROM public.counseling_records r WHERE r.id::text LIKE 'd1643a00-%'
  UNION ALL SELECT 'document', r.id, to_jsonb(r) FROM public.personnel_documents r WHERE r.id::text LIKE 'd1643a00-%'
  UNION ALL SELECT 'note', r.id, to_jsonb(r) FROM public.leader_notes r WHERE r.id::text LIKE 'd1643a00-%'
  UNION ALL SELECT 'request', r.id, to_jsonb(r) FROM public.deletion_requests r WHERE r.id::text LIKE 'd1643a00-%'
$$;
CREATE TEMP TABLE snapshots (label text, tbl text, id uuid, row_data jsonb);
CREATE FUNCTION pg_temp.snapshot(p_label text) RETURNS void LANGUAGE sql AS $$
  DELETE FROM snapshots WHERE label = p_label;
  INSERT INTO snapshots SELECT p_label, * FROM pg_temp.rows();
$$;
CREATE FUNCTION pg_temp.changed(p_label text, p_ignored text[] DEFAULT ARRAY[]::text[])
RETURNS TABLE (tbl text, id uuid) LANGUAGE sql AS $$
  SELECT coalesce(s.tbl, r.tbl), coalesce(s.id, r.id)
  FROM (SELECT * FROM snapshots WHERE label = p_label) s
  FULL JOIN pg_temp.rows() r ON r.tbl = s.tbl AND r.id = s.id
  WHERE (s.row_data - p_ignored) IS DISTINCT FROM (r.row_data - p_ignored)
$$;
CREATE FUNCTION pg_temp.state(p_person integer)
RETURNS TABLE (family text, k integer, archived_at timestamptz, status text) LANGUAGE sql AS $$
  SELECT 'person', 0, archived_at, NULL FROM public.personnel WHERE id = pg_temp.u(p_person)
  UNION ALL SELECT 'follow_up', right(id::text, 1)::integer, archived_at, status FROM public.personnel_follow_ups WHERE personnel_id = pg_temp.u(p_person)
  UNION ALL SELECT 'counseling', right(id::text, 1)::integer, archived_at, NULL FROM public.counseling_records WHERE personnel_id = pg_temp.u(p_person)
  UNION ALL SELECT 'document', right(id::text, 1)::integer, archived_at, NULL FROM public.personnel_documents WHERE personnel_id = pg_temp.u(p_person)
  UNION ALL SELECT 'note', right(id::text, 1)::integer, archived_at, NULL FROM public.leader_notes WHERE personnel_id = pg_temp.u(p_person)
  ORDER BY 1, 2
$$;
SELECT pg_temp.snapshot('initial');

SELECT is(
  ARRAY(SELECT p.proname || ':' || has_function_privilege(role_name, p.oid, 'EXECUTE')
    FROM pg_proc p CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name)
    WHERE p.pronamespace IN ('public'::regnamespace, 'organization_private'::regnamespace)
      AND p.proname IN ('archive_personnel', 'restore_personnel', 'approve_personnel_archive_request',
        'archive_locked_personnel', 'restore_locked_personnel', 'require_configure_and_lock_personnel', 'require_configurable_personnel')
    ORDER BY p.proname, role_name),
  ARRAY['approve_personnel_archive_request:false', 'approve_personnel_archive_request:true', 'approve_personnel_archive_request:false',
    'archive_locked_personnel:false', 'archive_locked_personnel:false', 'archive_locked_personnel:false',
    'archive_personnel:false', 'archive_personnel:true', 'archive_personnel:false',
    'require_configurable_personnel:false', 'require_configurable_personnel:false', 'require_configurable_personnel:false',
    'require_configure_and_lock_personnel:false', 'require_configure_and_lock_personnel:false', 'require_configure_and_lock_personnel:false',
    'restore_locked_personnel:false', 'restore_locked_personnel:false', 'restore_locked_personnel:false',
    'restore_personnel:false', 'restore_personnel:true', 'restore_personnel:false'],
  'anon, authenticated and service_role execute only the authenticated lifecycle commands');
SELECT is(
  ARRAY(SELECT p.proname || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ',') FROM pg_proc p
    WHERE p.proname IN ('archive_personnel', 'restore_personnel', 'approve_personnel_archive_request') ORDER BY 1),
  ARRAY['approve_personnel_archive_request:true:search_path=""', 'archive_personnel:true:search_path=""',
    'restore_personnel:true:search_path=""'],
  'commands are owner-checked definers with an empty search path');

SELECT pg_temp.act(3);
SET LOCAL ROLE authenticated;
SELECT is(public.archive_personnel(pg_temp.u(101), ARRAY[pg_temp.u(301), pg_temp.u(301)], '2030-02-03T04:05:06.789Z'),
  1, 'archive acknowledges the distinct admitted People');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM pg_temp.state(301) $$, $$ VALUES
  ('counseling', 1, '2030-02-03T04:05:06.789Z'::timestamptz, NULL::text), ('counseling', 2, '2029-06-01T00:00:00Z', NULL),
  ('document', 1, '2030-02-03T04:05:06.789Z', NULL), ('document', 2, '2029-06-01T00:00:00Z', NULL),
  ('follow_up', 1, '2030-02-03T04:05:06.789Z', 'archived'), ('follow_up', 2, NULL, 'completed'),
  ('follow_up', 3, '2029-06-01T00:00:00Z', 'archived'),
  ('note', 1, '2030-02-03T04:05:06.789Z', NULL), ('note', 2, '2029-06-01T00:00:00Z', NULL),
  ('person', 0, '2030-02-03T04:05:06.789Z', NULL) $$,
  'every active artifact shares the new event; completed history and independent archives keep their state');
SELECT is_empty($$ SELECT * FROM pg_temp.changed('initial', ARRAY['archived_at', 'status', 'updated_at'])
  WHERE id IN (SELECT pg_temp.child(f, 301, k) FROM generate_series(1, 4) f, generate_series(1, 3) k) OR id = pg_temp.u(301) $$,
  'archive changes only lifecycle fields: titles, notes, authors, files and dates are unchanged');
SELECT is_empty($$ SELECT * FROM pg_temp.changed('initial')
  WHERE id NOT IN (SELECT pg_temp.child(f, 301, k) FROM generate_series(1, 4) f, generate_series(1, 3) k) AND id <> pg_temp.u(301)
    OR id IN (pg_temp.child(1, 301, 2), pg_temp.child(1, 301, 3), pg_temp.child(2, 301, 2), pg_temp.child(3, 301, 2), pg_temp.child(4, 301, 2)) $$,
  'other People, the foreign Organization, requests and ineligible siblings are byte-identical');
SELECT is((SELECT count(*)::integer FROM organization_private.file_retirements WHERE object_name LIKE pg_temp.u(101) || '/%'),
  0, 'archiving retires no stored file key');

SELECT pg_temp.snapshot('archived-301');
SELECT pg_temp.act(3);
SET LOCAL ROLE authenticated;
SELECT is(public.archive_personnel(pg_temp.u(101), ARRAY[pg_temp.u(301)], '2031-01-01T00:00:00Z'), 1,
  'replaying an archive is acknowledged');
RESET ROLE;
SELECT is_empty($$ SELECT * FROM pg_temp.changed('archived-301') $$, 'a replay never replaces the saved event');

SELECT pg_temp.act(3);
SET LOCAL ROLE authenticated;
SELECT is(public.restore_personnel(pg_temp.u(101), pg_temp.u(301)), true, 'restore acknowledges an archived Person');
SELECT is(public.restore_personnel(pg_temp.u(101), pg_temp.u(301)), false, 'restore reports a Person that is not archived');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM pg_temp.state(301) $$, $$ VALUES
  ('counseling', 1, NULL::timestamptz, NULL::text), ('counseling', 2, '2029-06-01T00:00:00Z', NULL),
  ('document', 1, NULL, NULL), ('document', 2, '2029-06-01T00:00:00Z', NULL),
  ('follow_up', 1, NULL, 'open'), ('follow_up', 2, NULL, 'completed'), ('follow_up', 3, '2029-06-01T00:00:00Z', 'archived'),
  ('note', 1, NULL, NULL), ('note', 2, '2029-06-01T00:00:00Z', NULL), ('person', 0, NULL, NULL) $$,
  'restore keeps independently archived siblings and completed history');
SELECT is_empty($$ SELECT * FROM pg_temp.changed('initial', ARRAY['updated_at']) $$,
  'an archive and restore round trip returns every saved field except updated_at');

SELECT pg_temp.act(1);
SET LOCAL ROLE authenticated;
SELECT is(public.archive_personnel(pg_temp.u(101), ARRAY[pg_temp.u(304), pg_temp.u(302)], '2030-03-01T00:00:00Z'), 2,
  'a mixed bulk archive acknowledges both People');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM pg_temp.state(304) $$, $$ VALUES
  ('counseling', 1, '2029-05-01T00:00:00.123Z'::timestamptz, NULL::text), ('counseling', 2, '2029-05-01T00:00:00.123Z', NULL),
  ('document', 1, '2029-05-01T00:00:00.123Z', NULL),
  ('follow_up', 1, '2029-05-01T00:00:00.123Z', 'archived'), ('follow_up', 2, '2029-05-01T00:00:00.123Z', 'archived'),
  ('note', 1, '2029-05-01T00:00:00.123Z', NULL), ('note', 2, '2029-06-01T00:00:00Z', NULL),
  ('person', 0, '2029-05-01T00:00:00.123Z', NULL) $$,
  'legacy partial archive completes under its original millisecond event');
SELECT results_eq($$ SELECT * FROM pg_temp.state(302) $$, $$ VALUES
  ('counseling', 1, '2030-03-01T00:00:00Z'::timestamptz, NULL::text), ('document', 1, '2030-03-01T00:00:00Z', NULL),
  ('follow_up', 1, '2030-03-01T00:00:00Z', 'archived'), ('note', 1, '2030-03-01T00:00:00Z', NULL),
  ('person', 0, '2030-03-01T00:00:00Z', NULL) $$,
  'the active Person in the same command uses the proposed event');

SELECT pg_temp.act(4);
SET LOCAL ROLE authenticated;
SELECT is(public.restore_personnel(pg_temp.u(101), pg_temp.u(305)), true, 'Group-scoped configure restores in scope');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM pg_temp.state(305) $$, $$ VALUES
  ('counseling', 1, NULL::timestamptz, NULL::text), ('follow_up', 1, NULL, 'open'), ('follow_up', 2, NULL, 'open'),
  ('note', 1, NULL, NULL), ('note', 2, '2029-06-01T00:00:00Z', NULL), ('person', 0, NULL, NULL) $$,
  'legacy partial restore completes and keeps the independent note archived');

SELECT pg_temp.snapshot('before-denials');
SELECT pg_temp.act(5);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306']::uuid[], '2030-04-01T00:00:00Z') $$,
  '42501', 'Archiving or restoring Personnel requires configure access', 'operate-only members cannot archive directly');
SELECT throws_ok($$ SELECT public.restore_personnel('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000304') $$,
  '42501', 'Archiving or restoring Personnel requires configure access', 'operate-only members cannot restore');
RESET ROLE;
SELECT pg_temp.act(4);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306','d1643a00-0000-4000-8000-000000000302']::uuid[], '2030-04-01T00:00:00Z') $$,
  'P0002', 'Personnel not found', 'one out-of-scope Person rejects the whole Alpha-scoped command');
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000303']::uuid[], '2030-04-01T00:00:00Z') $$,
  'P0002', 'Personnel not found', 'Group scope cannot archive an unassigned Person');
SELECT throws_ok($$ SELECT public.restore_personnel('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000302') $$,
  'P0002', 'Personnel not found', 'Alpha scope cannot restore a Bravo Person');
RESET ROLE;
SELECT pg_temp.act(6);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306']::uuid[], '2030-04-01T00:00:00Z') $$,
  'P0002', 'Personnel not found', 'an empty Group scope archives nothing');
RESET ROLE;
SELECT pg_temp.act(9);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306']::uuid[], '2030-04-01T00:00:00Z') $$,
  '42501', 'Archiving or restoring Personnel requires configure access', 'a suspended account cannot archive');
RESET ROLE;
SELECT pg_temp.act(NULL);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.restore_personnel('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000304') $$,
  '42501', 'Archiving or restoring Personnel requires configure access', 'a request without an actor is rejected');
RESET ROLE;
SELECT pg_temp.act(8);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306','d1643a00-0000-4000-8000-000000000999']::uuid[], '2030-04-01T00:00:00Z') $$,
  '42501', 'Archiving or restoring Personnel requires configure access', 'a foreign owner learns nothing about Alpha People');
RESET ROLE;
SELECT pg_temp.act(3);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306','d1643a00-0000-4000-8000-000000000351']::uuid[], '2030-04-01T00:00:00Z') $$,
  'P0002', 'Personnel not found', 'a foreign Person rejects the whole command');
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY[]::uuid[], '2030-04-01T00:00:00Z') $$,
  '22023', 'Personnel lifecycle change needs Personnel', 'an empty command is rejected');
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306', NULL]::uuid[], '2030-04-01T00:00:00Z') $$,
  '22023', 'Personnel lifecycle change needs Personnel', 'a null Person is rejected');
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306']::uuid[], NULL) $$,
  '22023', 'Personnel archive needs an event time', 'an archive needs an event');
SELECT throws_ok($$ SELECT public.restore_personnel('d1643a00-0000-4000-8000-000000000102', 'd1643a00-0000-4000-8000-000000000351') $$,
  '42501', 'Archiving or restoring Personnel requires configure access', 'a member cannot address another Organization');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306']::uuid[], '2030-04-01T00:00:00Z') $$,
  '42501', NULL, 'anon cannot execute the archive command');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT public.restore_personnel('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000304') $$,
  '42501', NULL, 'service_role cannot bypass the authenticated actor');
RESET ROLE;
SELECT pg_temp.act(3);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT organization_private.archive_locked_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306']::uuid[], '2030-04-01T00:00:00Z') $$,
  '42501', NULL, 'the private cascade is not callable by API roles');
RESET ROLE;
SELECT pg_temp.act(6);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306']::uuid[], '2030-04-01T00:00:00Z') $$,
  'P0002', 'Personnel not found', 'an empty Group scope gets the same response for an existing Person as for a missing one (archive)');
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000999']::uuid[], '2030-04-01T00:00:00Z') $$,
  'P0002', 'Personnel not found', 'an empty Group scope gets the same response for a missing Person (archive)');
SELECT throws_ok($$ SELECT public.restore_personnel('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000304') $$,
  'P0002', 'Personnel not found', 'an empty Group scope gets the same response for an archived existing Person as for a missing one (restore)');
SELECT throws_ok($$ SELECT public.restore_personnel('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000999') $$,
  'P0002', 'Personnel not found', 'an empty Group scope gets the same response for a missing Person (restore)');
RESET ROLE;
SELECT pg_temp.act(4);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000302']::uuid[], '2030-04-01T00:00:00Z') $$,
  'P0002', 'Personnel not found', 'an Alpha-scoped member gets the same response for a Bravo Person (archive)');
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000303']::uuid[], '2030-04-01T00:00:00Z') $$,
  'P0002', 'Personnel not found', 'an Alpha-scoped member gets the same response for an unassigned Person (archive)');
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306','d1643a00-0000-4000-8000-000000000302']::uuid[], '2030-04-01T00:00:00Z') $$,
  'P0002', 'Personnel not found', 'one hidden Person rejects the whole command with the same response (archive)');
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306','d1643a00-0000-4000-8000-000000000999']::uuid[], '2030-04-01T00:00:00Z') $$,
  'P0002', 'Personnel not found', 'one missing Person rejects the whole command with the same response (archive)');
SELECT throws_ok($$ SELECT public.restore_personnel('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000302') $$,
  'P0002', 'Personnel not found', 'an Alpha-scoped member gets the same response for an archived Bravo Person (restore)');
SELECT throws_ok($$ SELECT public.restore_personnel('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000999') $$,
  'P0002', 'Personnel not found', 'an Alpha-scoped member gets the same response for a missing Person (restore)');
RESET ROLE;
SELECT is_empty($$ SELECT * FROM pg_temp.changed('before-denials') $$, 'every denied or invalid command left all rows unchanged');

CREATE FUNCTION pg_temp.fail_when_armed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('t3.fail_' || TG_TABLE_NAME, true) = 'on' THEN
    RAISE EXCEPTION 'Injected % failure', TG_TABLE_NAME USING ERRCODE = 'XX001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER t3_fail_when_armed BEFORE UPDATE ON public.leader_notes FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_when_armed();
CREATE TRIGGER t3_fail_when_armed BEFORE UPDATE ON public.personnel FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_when_armed();
CREATE TRIGGER t3_fail_when_armed BEFORE UPDATE ON public.deletion_requests FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_when_armed();
SET LOCAL t3.fail_leader_notes = 'on';
SELECT pg_temp.act(3);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.archive_personnel('d1643a00-0000-4000-8000-000000000101', ARRAY['d1643a00-0000-4000-8000-000000000306']::uuid[], '2030-04-01T00:00:00Z') $$,
  'XX001', 'Injected leader_notes failure', 'a late Leader Note failure fails the archive');
RESET ROLE;
SELECT is_empty($$ SELECT * FROM pg_temp.changed('before-denials') $$,
  'the Person, Follow-up, counseling record and document stay active after the late failure');
SET LOCAL t3.fail_leader_notes = 'off';
SELECT pg_temp.act(3);
SET LOCAL ROLE authenticated;
SELECT is(public.archive_personnel(pg_temp.u(101), ARRAY[pg_temp.u(306)], '2030-04-02T00:00:00Z'), 1, 'retry after the failure archives');
RESET ROLE;
SELECT pg_temp.snapshot('archived-306');
SET LOCAL t3.fail_personnel = 'on';
SELECT pg_temp.act(3);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.restore_personnel('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000306') $$,
  'XX001', 'Injected personnel failure', 'a failing parent clear fails the restore');
RESET ROLE;
SELECT is_empty($$ SELECT * FROM pg_temp.changed('archived-306') $$, 'restore rolls back every already-restored artifact');
SET LOCAL t3.fail_personnel = 'off';

SELECT pg_temp.snapshot('before-approval');
SET LOCAL t3.fail_deletion_requests = 'on';
SELECT pg_temp.act(2);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.approve_personnel_archive_request('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000601', 'd1643a00-0000-4000-8000-000000000307', '2030-05-01T00:00:00.321Z') $$,
  'XX001', 'Injected deletion_requests failure', 'a rejected status write fails the approval');
RESET ROLE;
SELECT is_empty($$ SELECT * FROM pg_temp.changed('before-approval') $$,
  'after the rejected status write the request stays pending and the Person and all artifacts stay active');
SET LOCAL t3.fail_deletion_requests = 'off';

SELECT pg_temp.act(2);
SET LOCAL ROLE authenticated;
SELECT is(public.approve_personnel_archive_request(pg_temp.u(101), pg_temp.u(601), pg_temp.u(307), '2030-05-01T00:00:00.321Z'),
  true, 'an admin without any source lane approves');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM pg_temp.state(307) $$, $$ VALUES
  ('counseling', 1, '2030-05-01T00:00:00.321Z'::timestamptz, NULL::text), ('document', 1, '2030-05-01T00:00:00.321Z', NULL),
  ('follow_up', 1, '2030-05-01T00:00:00.321Z', 'archived'), ('note', 1, '2030-05-01T00:00:00.321Z', NULL),
  ('person', 0, '2030-05-01T00:00:00.321Z', NULL) $$, 'approval archives the Person and all four families at the review time');
SELECT is((SELECT row_data FROM pg_temp.rows() WHERE id = pg_temp.u(601)),
  (SELECT row_data || jsonb_build_object('status', 'approved', 'reviewed_by', pg_temp.u(2), 'reviewed_at', '2030-05-01T00:00:00.321+00:00', 'denial_reason', NULL)
    FROM snapshots WHERE label = 'initial' AND id = pg_temp.u(601)),
  'the request records the authenticated reviewer and review time and keeps every saved field');

SELECT pg_temp.snapshot('before-review-denials');
SELECT pg_temp.act(7);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.approve_personnel_archive_request('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000602', 'd1643a00-0000-4000-8000-000000000308', '2030-05-02T00:00:00Z') $$,
  '42501', 'Deletion request review is not allowed', 'an editor member cannot approve');
RESET ROLE;
SELECT pg_temp.act(9);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.approve_personnel_archive_request('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000602', 'd1643a00-0000-4000-8000-000000000308', '2030-05-02T00:00:00Z') $$,
  '42501', 'Deletion request review is not allowed', 'a suspended admin cannot approve');
RESET ROLE;
SELECT pg_temp.act(8);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.approve_personnel_archive_request('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000602', 'd1643a00-0000-4000-8000-000000000308', '2030-05-02T00:00:00Z') $$,
  '42501', 'Deletion request review is not allowed', 'a foreign owner cannot approve or probe Alpha requests');
RESET ROLE;
SELECT pg_temp.act(1);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.approve_personnel_archive_request('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000601', 'd1643a00-0000-4000-8000-000000000307', '2030-05-02T00:00:00Z') $$,
  'P0002', 'Pending deletion request not found', 'an approved request cannot be approved again');
SELECT throws_ok($$ SELECT public.approve_personnel_archive_request('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000604', 'd1643a00-0000-4000-8000-000000000306', '2030-05-02T00:00:00Z') $$,
  'P0002', 'Pending deletion request not found', 'a denied request cannot be approved');
SELECT throws_ok($$ SELECT public.approve_personnel_archive_request('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000602', 'd1643a00-0000-4000-8000-000000000306', '2030-05-02T00:00:00Z') $$,
  'P0002', 'Pending deletion request not found', 'a request cannot be bound to another Person');
SELECT throws_ok($$ SELECT public.approve_personnel_archive_request('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000605', 'd1643a00-0000-4000-8000-000000000306', '2030-05-02T00:00:00Z') $$,
  'P0002', 'Pending deletion request not found', 'a non-Personnel request cannot archive a Person');
SELECT throws_ok($$ SELECT public.approve_personnel_archive_request('d1643a00-0000-4000-8000-000000000101', 'd1643a00-0000-4000-8000-000000000606', 'd1643a00-0000-4000-8000-000000000351', '2030-05-02T00:00:00Z') $$,
  'P0002', 'Pending deletion request not found', 'a foreign request is not reviewable through Alpha');
RESET ROLE;
SELECT is_empty($$ SELECT * FROM pg_temp.changed('before-review-denials') $$, 'denied and unmatched approvals change nothing');

SELECT pg_temp.act(1);
SET LOCAL ROLE authenticated;
SELECT is(public.approve_personnel_archive_request(pg_temp.u(101), pg_temp.u(602), pg_temp.u(308), '2030-06-01T00:00:00Z'), true,
  'the first historical request approves');
SELECT is(public.approve_personnel_archive_request(pg_temp.u(101), pg_temp.u(603), pg_temp.u(308), '2030-06-02T00:00:00Z'), true,
  'the second historical request approves against the saved event');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM pg_temp.state(308) $$, $$ VALUES
  ('note', 1, '2030-06-01T00:00:00Z'::timestamptz, NULL::text), ('person', 0, '2030-06-01T00:00:00Z', NULL) $$,
  'the later approval keeps the first event');
SELECT results_eq($$ SELECT id, status, reviewed_at FROM public.deletion_requests WHERE id IN (pg_temp.u(602), pg_temp.u(603)) ORDER BY id $$,
  $$ VALUES (pg_temp.u(602), 'approved', '2030-06-01T00:00:00Z'::timestamptz), (pg_temp.u(603), 'approved', '2030-06-02T00:00:00Z') $$,
  'each request records its own review');
SELECT is_empty($$ SELECT * FROM pg_temp.changed('initial')
  WHERE id IN (pg_temp.u(102), pg_temp.u(351), pg_temp.u(606), pg_temp.child(1, 351, 1), pg_temp.child(4, 351, 1), pg_temp.u(303), pg_temp.child(4, 303, 1)) $$,
  'foreign and unaddressed rows are unchanged after every command');

SELECT * FROM finish();
ROLLBACK;
