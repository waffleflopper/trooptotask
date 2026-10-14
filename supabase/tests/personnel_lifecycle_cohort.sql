BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SET LOCAL TIME ZONE 'UTC';

CREATE FUNCTION pg_temp.u(n bigint) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('d1643d00-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
INSERT INTO auth.users (id, email) VALUES (pg_temp.u(1), 'lifecycle-cohort@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.u(101), 'Lifecycle Cohort', pg_temp.u(1)), (pg_temp.u(102), 'Lifecycle Cohort Foreign', pg_temp.u(1));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES (pg_temp.u(101), pg_temp.u(1), 'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]);

CREATE TEMP TABLE cohort AS
SELECT person, CASE WHEN person > 420 THEN 102 ELSE 101 END AS org,
  CASE WHEN person <= 50 THEN '2029-05-01T00:00:00.123Z'::timestamptz END AS archived_at
FROM generate_series(1, 440) AS person;
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug, archived_at)
SELECT pg_temp.u(person), pg_temp.u(org), 'SGT', 'Cohort', 'Person ' || person, 'lifecycle-cohort-' || person, archived_at FROM cohort;
INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, status, created_by, completed_at, archived_at)
SELECT pg_temp.u(1000000 + person * 10 + k), pg_temp.u(org), pg_temp.u(person), 'Follow-up',
  CASE WHEN k = 3 THEN 'completed' WHEN k = 1 AND archived_at IS NOT NULL THEN 'archived' ELSE 'open' END, 'fixture',
  CASE WHEN k = 3 THEN '2029-04-01T00:00:00Z'::timestamptz END, CASE WHEN k = 1 THEN archived_at END
FROM cohort CROSS JOIN generate_series(1, 3) AS k;
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, archived_at)
SELECT pg_temp.u(2000000 + person * 10 + k), pg_temp.u(org), pg_temp.u(person), '2029-02-01', 'Subject', 'Counseling', 'fixture',
  CASE k WHEN 1 THEN archived_at WHEN 3 THEN '2029-06-01T00:00:00Z' END
FROM cohort CROSS JOIN generate_series(1, 3) AS k;
INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by, archived_at)
SELECT pg_temp.u(3000000 + person * 10 + k), pg_temp.u(org), pg_temp.u(person), 'Document',
  pg_temp.u(org) || '/personnel/' || pg_temp.u(person) || '/documents/d' || k || '.pdf', 64, 'application/pdf', 'fixture',
  CASE k WHEN 1 THEN archived_at WHEN 3 THEN '2029-06-01T00:00:00Z' END
FROM cohort CROSS JOIN generate_series(1, 3) AS k;
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text, archived_at)
SELECT pg_temp.u(4000000 + person * 10 + k), pg_temp.u(org), pg_temp.u(person), 'Author', 'Note',
  CASE k WHEN 1 THEN archived_at WHEN 3 THEN '2029-06-01T00:00:00Z' END
FROM cohort CROSS JOIN generate_series(1, 3) AS k;

CREATE TEMP TABLE before_rows AS
SELECT 'personnel' AS tbl, id, to_jsonb(r) AS row_data FROM public.personnel r WHERE id::text LIKE 'd1643d00-%'
UNION ALL SELECT 'follow_up', id, to_jsonb(r) FROM public.personnel_follow_ups r WHERE id::text LIKE 'd1643d00-%'
UNION ALL SELECT 'counseling', id, to_jsonb(r) FROM public.counseling_records r WHERE id::text LIKE 'd1643d00-%'
UNION ALL SELECT 'document', id, to_jsonb(r) FROM public.personnel_documents r WHERE id::text LIKE 'd1643d00-%'
UNION ALL SELECT 'note', id, to_jsonb(r) FROM public.leader_notes r WHERE id::text LIKE 'd1643d00-%';
SELECT cmp_ok((SELECT min(count) FROM (SELECT count(*) FROM before_rows WHERE tbl <> 'personnel' GROUP BY tbl) AS families),
  '>', 1000::bigint, 'every artifact family holds more than one provider page of rows');

CREATE TEMP TABLE timing (started timestamptz, finished timestamptz, acknowledged integer, timeout text);
SELECT set_config('request.jwt.claim.sub', pg_temp.u(1)::text, true);
SELECT set_config('statement_timeout', (SELECT split_part(c, '=', 2) FROM pg_roles, unnest(rolconfig) AS c
  WHERE rolname = 'authenticated' AND c LIKE 'statement_timeout=%'), true);
INSERT INTO timing (started, timeout) VALUES (clock_timestamp(), current_setting('statement_timeout'));
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE acknowledged AS
SELECT public.archive_personnel(pg_temp.u(101), ARRAY(SELECT pg_temp.u(n) FROM generate_series(400, 1, -1) AS n), '2030-07-01T00:00:00Z') AS count;
RESET ROLE;
UPDATE timing SET finished = clock_timestamp(), acknowledged = (SELECT count FROM acknowledged);
SELECT is((SELECT acknowledged FROM timing), 400, 'the command acknowledges 400 People with one integer');
SELECT diag('cohort archive: ' || round(extract(epoch FROM finished - started) * 1000) || ' ms locally under statement_timeout ' || timeout)
FROM timing;

CREATE TEMP TABLE after_rows AS
SELECT 'personnel' AS tbl, id, to_jsonb(r) AS row_data FROM public.personnel r WHERE id::text LIKE 'd1643d00-%'
UNION ALL SELECT 'follow_up', id, to_jsonb(r) FROM public.personnel_follow_ups r WHERE id::text LIKE 'd1643d00-%'
UNION ALL SELECT 'counseling', id, to_jsonb(r) FROM public.counseling_records r WHERE id::text LIKE 'd1643d00-%'
UNION ALL SELECT 'document', id, to_jsonb(r) FROM public.personnel_documents r WHERE id::text LIKE 'd1643d00-%'
UNION ALL SELECT 'note', id, to_jsonb(r) FROM public.leader_notes r WHERE id::text LIKE 'd1643d00-%';
CREATE TEMP TABLE expected AS
SELECT b.tbl, b.id, CASE
    WHEN person.n BETWEEN 51 AND 400 AND (b.row_data ->> 'archived_at') IS NULL
      AND (b.tbl <> 'follow_up' OR b.row_data ->> 'status' = 'open')
    THEN b.row_data || jsonb_build_object('archived_at', '2030-07-01T00:00:00+00:00')
      || CASE WHEN b.tbl = 'follow_up' THEN jsonb_build_object('status', 'archived') ELSE '{}' END
    WHEN person.n BETWEEN 1 AND 50 AND (b.row_data ->> 'archived_at') IS NULL
      AND (b.tbl <> 'follow_up' OR b.row_data ->> 'status' = 'open')
    THEN b.row_data || jsonb_build_object('archived_at', '2029-05-01T00:00:00.123+00:00')
      || CASE WHEN b.tbl = 'follow_up' THEN jsonb_build_object('status', 'archived') ELSE '{}' END
    ELSE b.row_data END AS row_data
FROM before_rows b
CROSS JOIN LATERAL (SELECT right(coalesce(b.row_data ->> 'personnel_id', b.id::text), 12)::integer AS n) AS person;
SELECT is_empty($$ SELECT tbl, id, row_data - 'updated_at' FROM expected EXCEPT SELECT tbl, id, row_data - 'updated_at' FROM after_rows $$,
  'every row matches its expected lifecycle state');
SELECT is_empty($$ SELECT tbl, id FROM after_rows EXCEPT SELECT tbl, id FROM expected $$, 'no row was added');
SELECT results_eq($$ SELECT tbl, count(*) FILTER (WHERE (row_data ->> 'archived_at') = '2030-07-01T00:00:00+00:00')::integer
    FROM after_rows GROUP BY tbl ORDER BY tbl $$,
  $$ VALUES ('counseling', 700), ('document', 700), ('follow_up', 700), ('note', 700), ('personnel', 350) $$,
  'the new event covers exactly the 350 active People and their two active rows per family');
SELECT * FROM finish();
ROLLBACK;
