-- After the rollback, each Evaluation is the entry with its id, the chain it showed and the work done since the split.
-- A scheme whose current chain no Evaluation carries becomes its own not-tracked entry, archive state follows the
-- scheme, deleted rows stay deleted, and main's entry functions run on the rebuilt rows.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.fixture(p_name text) RETURNS upgrade_fixture.rating_scheme_split_rollback_ids
LANGUAGE sql AS $$
  SELECT * FROM upgrade_fixture.rating_scheme_split_rollback_ids WHERE name = p_name;
$$;

SELECT results_eq(
  $$SELECT id, rated_person_id, eval_type, rater_person_id, rater_name, intermediate_rater_name, senior_rater_name,
      reviewer_name, rating_period_start, rating_period_end, workflow_status, report_type, notes,
      archived_at IS NOT NULL, archived_by
    FROM public.rating_scheme_entries WHERE organization_id = 'e7c50000-0000-4000-8000-000000000101'
    ORDER BY rated_person_id, rating_period_start$$,
  $$VALUES
    ('e7c50000-0000-4000-8000-000000000501'::uuid, 'e7c50000-0000-4000-8000-000000000301'::uuid, 'NCOER'::text, NULL::uuid, 'Able Rater'::text, 'Ivy External'::text, 'Able Senior'::text, NULL::text, '2026-01-01'::date, '2026-12-31'::date, 'completed'::text, 'AN'::text, 'Able notes'::text, false, NULL::text),
    ((pg_temp.fixture('able scheme')).id, 'e7c50000-0000-4000-8000-000000000301', 'NCOER', NULL, 'Able Rater', 'Ivy Next', 'Able Senior', NULL, '2027-01-01', '2027-12-31', NULL, NULL, 'Able scheme notes', false, NULL),
    ('e7c50000-0000-4000-8000-000000000502', 'e7c50000-0000-4000-8000-000000000302', 'OER', NULL, 'Old Rater', NULL, 'Old Senior', NULL, '2024-01-01', '2024-12-31', 'completed', 'AN', 'Baker first', true, 'baker-first-archiver'),
    ('e7c50000-0000-4000-8000-000000000503', 'e7c50000-0000-4000-8000-000000000302', 'OER', NULL, 'New Rater', NULL, 'New Senior', NULL, '2025-01-01', '2025-12-31', 'drafting', 'AN', 'Baker open', false, NULL),
    ('e7c50000-0000-4000-8000-000000000505', 'e7c50000-0000-4000-8000-000000000303', 'NCOER', NULL, 'Cole Rater', NULL, 'Cole Senior', NULL, '2026-01-01', '2026-12-31', 'with-rater', 'AN', 'Cole newest', true, 'e7c50000-0000-4000-8000-000000000001'),
    ('e7c50000-0000-4000-8000-000000000506', 'e7c50000-0000-4000-8000-000000000304', 'OER', NULL, NULL, NULL, 'Dana New Senior', NULL, '2026-01-01', '2026-12-31', NULL, NULL, NULL, false, NULL),
    ((pg_temp.fixture('dana started')).id, 'e7c50000-0000-4000-8000-000000000304', 'OER', NULL, NULL, NULL, 'Dana New Senior', NULL, '2027-01-01', '2027-12-31', 'with-rater', 'AN', 'Dana started', false, NULL)$$,
  'each Evaluation is the entry with its id and current work, and a chain no Evaluation carries is its own entry');

SELECT results_eq(
  $$SELECT id, created_at, archived_at FROM public.rating_scheme_entries
    WHERE id IN ('e7c50000-0000-4000-8000-000000000501', 'e7c50000-0000-4000-8000-000000000502',
      'e7c50000-0000-4000-8000-000000000505', (pg_temp.fixture('able scheme')).id, (pg_temp.fixture('dana started')).id)
    ORDER BY id$$,
  $$SELECT * FROM (VALUES
    ('e7c50000-0000-4000-8000-000000000502'::uuid, '2024-01-02Z'::timestamptz, '2025-01-10Z'::timestamptz),
    ('e7c50000-0000-4000-8000-000000000501', '2026-01-02Z', NULL),
    ((pg_temp.fixture('able scheme')).id, '2026-01-02Z', NULL),
    ('e7c50000-0000-4000-8000-000000000505', '2026-01-02Z', (pg_temp.fixture('cole archived')).at),
    ((pg_temp.fixture('dana started')).id, (pg_temp.fixture('dana started')).at, NULL)) AS expected
    ORDER BY 1$$,
  'entries keep their creation and archive times; an entry archived before the split keeps its own');

SELECT results_eq(
  $$SELECT id, resource_type, resource_id, status FROM public.deletion_requests
    WHERE organization_id = 'e7c50000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$VALUES
    ('e7c50000-0000-4000-8000-000000000701'::uuid, 'rating_scheme_entry'::text, 'e7c50000-0000-4000-8000-000000000504'::uuid, 'approved'::text),
    ('e7c50000-0000-4000-8000-000000000702', 'rating_scheme_entry', 'e7c50000-0000-4000-8000-000000000505', 'denied')$$,
  'deletion requests name the entry again and keep their outcome');

SELECT isnt_empty('SELECT 1 FROM upgrade_fixture.rating_scheme_split_rollback_foreign_links',
  'the upgrade fixtures include legacy links to another Organization''s People');
SELECT set_eq(
  $$SELECT e.id, e.rater_person_id, e.intermediate_rater_person_id, e.senior_rater_person_id, e.reviewer_person_id
    FROM public.rating_scheme_entries e JOIN upgrade_fixture.rating_scheme_split_rollback_foreign_links l ON l.id = e.id$$,
  'SELECT * FROM upgrade_fixture.rating_scheme_split_rollback_foreign_links',
  'legacy links to another Organization''s People come back as main kept them');

SELECT is(
  (SELECT count(*) FROM public.audit_logs WHERE org_id = 'e7c50000-0000-4000-8000-000000000101'),
  (pg_temp.fixture('audit rows')).n, 'the rollback writes no audit rows');
SELECT hasnt_table('public', 'rating_schemes', 'the rating schemes table is gone');
SELECT hasnt_table('public', 'evaluations', 'the evaluations table is gone');
SELECT is_empty($$SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261113120000'$$,
  'the split leaves the migration history');

SELECT set_config('request.jwt.claim.sub', 'e7c50000-0000-4000-8000-000000000001', true),
  set_config('request.jwt.claims', '{"sub":"e7c50000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is(public.transition_rating_scheme_entry('e7c50000-0000-4000-8000-000000000101',
  'e7c50000-0000-4000-8000-000000000503', 'drafting', 'with-rater') -> 'moved', 'true'::jsonb,
  'main''s transition moves a rebuilt entry');
SELECT is(public.set_rating_scheme_entry_archived('e7c50000-0000-4000-8000-000000000101',
  'e7c50000-0000-4000-8000-000000000506', true) -> 'changed', 'true'::jsonb,
  'main''s archive takes a rebuilt entry off the rating scheme');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
