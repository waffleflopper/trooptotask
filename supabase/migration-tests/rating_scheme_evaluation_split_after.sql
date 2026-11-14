-- The split gives each person one rating scheme with the newest listed chain and keeps every entry as an Evaluation
-- with its id, step, period, report, type and notes. A completed Evaluation, or one signed by another chain, keeps
-- that chain; the scheme is archived only when every entry was. Deletion requests name the Evaluation. The entries
-- stay behind, frozen, for the rollback.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT results_eq(
  $$SELECT rated_person_id, eval_type, rater_person_id, rater_name, intermediate_rater_name, senior_rater_person_id,
      senior_rater_name, reviewer_name, notes, created_at, updated_at, archived_at, archived_by
    FROM public.rating_schemes WHERE organization_id = 'e7c40000-0000-4000-8000-000000000101' ORDER BY rated_person_id$$,
  $$VALUES
    ('e7c40000-0000-4000-8000-000000000301'::uuid, 'NCOER'::text, 'e7c40000-0000-4000-8000-000000000312'::uuid, NULL::text, 'Ivy External'::text, 'e7c40000-0000-4000-8000-000000000313'::uuid, NULL::text, NULL::text, 'Successor'::text, '2025-01-02Z'::timestamptz, '2025-08-01Z'::timestamptz, NULL::timestamptz, NULL::text),
    ('e7c40000-0000-4000-8000-000000000302'::uuid, 'OER', NULL, 'New External', NULL, NULL, 'New Senior', 'Rex Reviewer', 'Archived while open', '2024-01-02Z', '2025-03-01Z', '2025-03-02Z', 'baker-last-archiver'),
    ('e7c40000-0000-4000-8000-000000000303'::uuid, 'WOER', NULL, 'Cole Rater', NULL, NULL, 'Cole Senior', NULL, 'Newest listed', '2025-01-02Z', '2026-02-01Z', NULL, NULL),
    ('e7c40000-0000-4000-8000-000000000304'::uuid, 'NCOER', 'e7c40000-0000-4000-8000-000000000311', NULL, NULL, 'e7c40000-0000-4000-8000-000000000313', NULL, NULL, NULL, '2026-01-02Z', '2026-01-03Z', NULL, NULL)$$,
  'each person gets one scheme with the newest listed chain, archived only when every entry was');

SELECT results_eq(
  $$SELECT e.id, to_jsonb(e) - ARRAY['rating_scheme_id', 'chain_snapshot_at', 'snapshot_rater_person_id',
      'snapshot_rater_name', 'snapshot_intermediate_rater_person_id', 'snapshot_intermediate_rater_name',
      'snapshot_senior_rater_person_id', 'snapshot_senior_rater_name', 'snapshot_reviewer_person_id',
      'snapshot_reviewer_name', 'next_rater_person_id', 'next_rater_name', 'rater_changed_at']
    FROM public.evaluations e WHERE organization_id = 'e7c40000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$SELECT id, saved - ARRAY['rater_person_id', 'rater_name', 'intermediate_rater_person_id',
      'intermediate_rater_name', 'senior_rater_person_id', 'senior_rater_name', 'reviewer_person_id', 'reviewer_name',
      'archived_at', 'archived_by']
    FROM upgrade_fixture.rating_scheme_evaluation_split_before ORDER BY id$$,
  'every entry becomes an Evaluation with its id, step, period, report, type, notes and times');

-- A completed Change of Rater already moved its scheme to the next rater, so reopening it keeps its chain and
-- completing it again changes nothing. No copied entry names a next rater.
SELECT results_eq(
  $$SELECT id, rater_changed_at FROM public.evaluations
    WHERE organization_id = 'e7c40000-0000-4000-8000-000000000101' AND (rater_changed_at IS NOT NULL
      OR next_rater_person_id IS NOT NULL OR next_rater_name IS NOT NULL) ORDER BY id$$,
  $$VALUES ('e7c40000-0000-4000-8000-000000000501'::uuid, '2025-07-01Z'::timestamptz)$$,
  'only the completed Change of Rater is marked as having changed its rater, and none names a next rater');

SELECT is(
  (SELECT count(*)::integer FROM public.evaluations e JOIN public.rating_schemes s ON s.id = e.rating_scheme_id
    WHERE e.organization_id = 'e7c40000-0000-4000-8000-000000000101' AND s.rated_person_id <> e.rated_person_id),
  0, 'each Evaluation sits on its rated person''s scheme');

SELECT results_eq(
  $$SELECT id, chain_snapshot_at, snapshot_rater_person_id, snapshot_rater_name, snapshot_intermediate_rater_name,
      snapshot_senior_rater_person_id, snapshot_senior_rater_name, snapshot_reviewer_name
    FROM public.evaluations WHERE organization_id = 'e7c40000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$VALUES
    ('e7c40000-0000-4000-8000-000000000501'::uuid, '2025-07-01Z'::timestamptz, 'e7c40000-0000-4000-8000-000000000311'::uuid, NULL::text, NULL::text, 'e7c40000-0000-4000-8000-000000000313'::uuid, NULL::text, NULL::text),
    ('e7c40000-0000-4000-8000-000000000502'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('e7c40000-0000-4000-8000-000000000503'::uuid, '2025-01-05Z', NULL, 'Old External', NULL, NULL, 'Old Senior', NULL),
    ('e7c40000-0000-4000-8000-000000000504'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('e7c40000-0000-4000-8000-000000000505'::uuid, '2025-02-01Z', NULL, 'Cole Old Rater', NULL, NULL, 'Cole Senior', NULL),
    ('e7c40000-0000-4000-8000-000000000506'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('e7c40000-0000-4000-8000-000000000507'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, NULL)$$,
  'a completed Evaluation or one signed by another chain keeps its chain, and the rest read the scheme');

SELECT results_eq(
  $$SELECT id, resource_type, resource_id, status FROM public.deletion_requests
    WHERE organization_id = 'e7c40000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$VALUES
    ('e7c40000-0000-4000-8000-000000000701'::uuid, 'evaluation'::text, 'e7c40000-0000-4000-8000-000000000505'::uuid, 'pending'::text),
    ('e7c40000-0000-4000-8000-000000000702'::uuid, 'evaluation', 'e7c40000-0000-4000-8000-000000000501', 'denied')$$,
  'deletion requests name the Evaluation the entry became');

SELECT is_empty(
  $$SELECT id FROM public.audit_logs WHERE org_id = 'e7c40000-0000-4000-8000-000000000101'
    EXCEPT SELECT id FROM upgrade_fixture.rating_scheme_evaluation_split_audit$$,
  'the split writes no audit rows');
SELECT results_eq(
  $$SELECT id, to_jsonb(e) FROM public.rating_scheme_entries e
    WHERE organization_id = 'e7c40000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$SELECT id, saved FROM upgrade_fixture.rating_scheme_evaluation_split_before ORDER BY id$$,
  'the entries table stays, frozen with every row as the split found it');
SELECT ok(NOT has_table_privilege(role, 'public.rating_scheme_entries', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'),
  role || ' can neither read nor write the frozen entries')
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role;
SELECT is_empty(
  $$SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.rating_scheme_entries'::regclass AND NOT tgisinternal
    AND tgfoid = 'audit_private.audit_rating_scheme()'::regprocedure$$,
  'no audit trigger reads a frozen entry as a rating scheme');
SELECT is_empty(
  $$SELECT conname FROM pg_constraint WHERE conrelid = 'public.rating_scheme_entries'::regclass AND contype = 'f'
    AND confrelid = 'public.personnel'::regclass AND confdeltype NOT IN ('c', 'n')$$,
  'no frozen entry can block a Person''s deletion');
SELECT * FROM finish();
ROLLBACK;
