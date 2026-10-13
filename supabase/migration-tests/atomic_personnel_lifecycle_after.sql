BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SET LOCAL TIME ZONE 'UTC';
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('f6432000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
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

SELECT ok((SELECT migration_absent FROM upgrade_fixture.atomic_personnel_lifecycle_baseline),
  'saved lifecycle states precede both migrations and their commands');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version IN ('20261013000200', '20261013000300')),
  2, 'both migrations are recorded after populated upgrade');
SELECT results_eq($$ SELECT * FROM upgrade_fixture.atomic_personnel_lifecycle_current_rows ORDER BY 1, 2 $$,
  $$ SELECT * FROM upgrade_fixture.atomic_personnel_lifecycle_before_rows ORDER BY 1, 2 $$,
  'installation changes no saved Person, artifact, request or membership');
SELECT is(
  ARRAY(SELECT table_name || ':' || grantee || ':' || privilege_type FROM (
    SELECT * FROM upgrade_fixture.atomic_personnel_lifecycle_before_grants
    EXCEPT ALL SELECT * FROM upgrade_fixture.atomic_personnel_lifecycle_current_grants) AS revoked ORDER BY 1),
  ARRAY['deletion_requests:anon:INSERT', 'deletion_requests:authenticated:INSERT'],
  'the only revoked table grants are the staged 20261012000600 request inserts');
SELECT is_empty($$ SELECT * FROM upgrade_fixture.atomic_personnel_lifecycle_current_grants
    EXCEPT ALL SELECT * FROM upgrade_fixture.atomic_personnel_lifecycle_before_grants $$,
  'installation adds no table grant');
SELECT is(
  ARRAY(SELECT p.proname || ':' || role_name || ':' || has_function_privilege(role_name, p.oid, 'EXECUTE')
    FROM pg_proc p CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name)
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('archive_personnel', 'restore_personnel', 'approve_personnel_archive_request', 'submit_deletion_request')
    ORDER BY 1),
  ARRAY['approve_personnel_archive_request:anon:false', 'approve_personnel_archive_request:authenticated:true',
    'approve_personnel_archive_request:service_role:false', 'archive_personnel:anon:false', 'archive_personnel:authenticated:true',
    'archive_personnel:service_role:false', 'restore_personnel:anon:false', 'restore_personnel:authenticated:true',
    'restore_personnel:service_role:false', 'submit_deletion_request:anon:false', 'submit_deletion_request:authenticated:false',
    'submit_deletion_request:service_role:true'],
  'upgraded commands are granted only to their callers');

SET LOCAL ROLE service_role;
SELECT is(public.submit_deletion_request(pg_temp.u(101), pg_temp.u(3), 'f6432-3@example.test', 'personnel', pg_temp.u(304), 'New', NULL),
  '{"outcome": "duplicate"}', 'saved duplicate pending requests block a new one');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM upgrade_fixture.atomic_personnel_lifecycle_current_rows WHERE table_name = 'deletion_requests' ORDER BY 2 $$,
  $$ SELECT * FROM upgrade_fixture.atomic_personnel_lifecycle_before_rows WHERE table_name = 'deletion_requests' ORDER BY 2 $$,
  'the duplicate submission rewrites no saved request');

SELECT set_config('request.jwt.claim.sub', pg_temp.u(2)::text, true);
SET LOCAL ROLE authenticated;
SELECT is(public.archive_personnel(pg_temp.u(101), ARRAY[pg_temp.u(301), pg_temp.u(303)], '2031-02-02T00:00:00Z'), 2,
  'a configure member archives an interrupted archive and an active Person together');
SELECT is(public.restore_personnel(pg_temp.u(101), pg_temp.u(302)), true, 'the interrupted restore finishes');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM pg_temp.state(301) $$, $$ VALUES
  ('counseling', 1, '2030-01-02T03:04:05.678Z'::timestamptz, NULL::text), ('counseling', 2, '2030-01-02T03:04:05.678Z', NULL),
  ('document', 1, '2030-01-02T03:04:05.678Z', NULL),
  ('follow_up', 1, '2030-01-02T03:04:05.678Z', 'archived'), ('follow_up', 2, '2030-01-02T03:04:05.678Z', 'archived'),
  ('note', 1, '2030-01-02T03:04:05.678Z', NULL), ('person', 0, '2030-01-02T03:04:05.678Z', NULL) $$,
  'the interrupted archive completes under its saved millisecond event');
SELECT results_eq($$ SELECT * FROM pg_temp.state(303) $$, $$ VALUES
  ('counseling', 1, '2031-02-02T00:00:00Z'::timestamptz, NULL::text), ('document', 1, '2031-02-02T00:00:00Z', NULL),
  ('follow_up', 1, NULL, 'completed'), ('follow_up', 2, '2031-02-02T00:00:00Z', 'archived'),
  ('note', 1, '2029-06-01T00:00:00Z', NULL), ('note', 2, '2031-02-02T00:00:00Z', NULL), ('person', 0, '2031-02-02T00:00:00Z', NULL) $$,
  'the active Person keeps completed history and its independently archived note');
SELECT results_eq($$ SELECT * FROM pg_temp.state(302) $$, $$ VALUES
  ('counseling', 1, NULL::timestamptz, NULL::text), ('document', 1, NULL, NULL),
  ('follow_up', 1, NULL, 'open'), ('follow_up', 2, NULL, 'open'),
  ('note', 1, NULL, NULL), ('note', 2, NULL, NULL), ('person', 0, NULL, NULL) $$,
  'the interrupted restore returns every row of its event');

SELECT set_config('request.jwt.claim.sub', pg_temp.u(1)::text, true);
SET LOCAL ROLE authenticated;
SELECT is(public.approve_personnel_archive_request(pg_temp.u(101), pg_temp.u(601), pg_temp.u(304), '2031-03-03T00:00:00Z'), true,
  'an admin without Personnel access approves one saved duplicate');
SELECT is(public.approve_personnel_archive_request(pg_temp.u(101), pg_temp.u(602), pg_temp.u(304), '2031-03-04T00:00:00Z'), true,
  'the other saved duplicate approves against the saved event');
SELECT throws_ok($$ SELECT public.approve_personnel_archive_request('f6432000-0000-4000-8000-000000000101',
  'f6432000-0000-4000-8000-000000000603', 'f6432000-0000-4000-8000-000000000304', '2031-03-05T00:00:00Z') $$,
  'P0002', 'Pending deletion request not found', 'saved denial history cannot be approved');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM pg_temp.state(304) $$, $$ VALUES
  ('counseling', 1, '2031-03-03T00:00:00Z'::timestamptz, NULL::text), ('document', 1, '2031-03-03T00:00:00Z', NULL),
  ('follow_up', 1, '2031-03-03T00:00:00Z', 'archived'), ('note', 1, '2031-03-03T00:00:00Z', NULL),
  ('person', 0, '2031-03-03T00:00:00Z', NULL) $$, 'the first approval owns the event');
SELECT results_eq($$ SELECT id, status, reviewed_by, reviewed_at, denial_reason FROM public.deletion_requests WHERE id::text LIKE 'f6432000-%' ORDER BY id $$,
  $$ VALUES (pg_temp.u(601), 'approved', pg_temp.u(1), '2031-03-03T00:00:00Z'::timestamptz, NULL::text),
    (pg_temp.u(602), 'approved', pg_temp.u(1), '2031-03-04T00:00:00Z', NULL),
    (pg_temp.u(603), 'denied', pg_temp.u(1), '2030-01-01T00:00:00.333Z', 'Saved reason') $$,
  'each saved request keeps its own history');
SELECT results_eq($$ SELECT * FROM upgrade_fixture.atomic_personnel_lifecycle_current_rows WHERE row_data ->> 'organization_id' = 'f6432000-0000-4000-8000-000000000102' ORDER BY 1, 2 $$,
  $$ SELECT * FROM upgrade_fixture.atomic_personnel_lifecycle_before_rows WHERE row_data ->> 'organization_id' = 'f6432000-0000-4000-8000-000000000102' ORDER BY 1, 2 $$,
  'the foreign Organization is unchanged');
SELECT * FROM finish();
ROLLBACK;
