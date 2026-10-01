-- Retain history while rejecting new foreign links and cross-Organization delete effects.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20260930000100'), 1,
  'evaluator migration was applied');
CREATE TEMP VIEW evaluator_current_rows AS
  SELECT 'personnel'::text AS table_name, id AS row_id, to_jsonb(p) AS row_data
    FROM public.personnel p WHERE organization_id IN
      ('d1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000102')
  UNION ALL
  SELECT 'entry', id, to_jsonb(e) FROM public.rating_scheme_entries e WHERE organization_id IN
      ('d1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000102');
SELECT results_eq($$ SELECT * FROM evaluator_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT * FROM upgrade_fixture.rating_scheme_evaluator_before ORDER BY table_name, row_id $$,
  'all thirteen populated Personnel/evaluation rows retain every field after migration');
SELECT is((SELECT count(*)::integer FROM public.rating_scheme_entries e JOIN public.personnel p ON p.id = e.rater_person_id
  WHERE e.id = 'd1602000-0000-4000-8000-000000000402' AND e.organization_id <> p.organization_id), 1,
  'historical invalid evaluator links remain identifiable');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1602000-0000-4000-8000-000000000001', true);
SELECT throws_ok(format($sql$ UPDATE public.rating_scheme_entries SET %I = %L, notes = 'Denied edit'
  WHERE id = 'd1602000-0000-4000-8000-000000000401' $sql$, field, 'd1602000-0000-4000-8000-000000000305'),
  '23503', NULL, 'upgraded authenticated writes reject foreign ' || field)
FROM (VALUES ('rater_person_id'), ('senior_rater_person_id'), ('intermediate_rater_person_id'), ('reviewer_person_id')) AS fields(field);
SELECT lives_ok($$ UPDATE public.rating_scheme_entries SET notes = 'Unrelated historical edit',
  rater_person_id = 'D1602000-0000-4000-8000-000000000305', senior_rater_person_id = 'd1602000-0000-4000-8000-000000000305',
  intermediate_rater_person_id = 'd1602000-0000-4000-8000-000000000305', reviewer_person_id = 'd1602000-0000-4000-8000-000000000305'
  WHERE id = 'd1602000-0000-4000-8000-000000000402' $$,
  'full unchanged historical evaluator resubmission allows an unrelated edit');
RESET ROLE;
SELECT results_eq($$ SELECT to_jsonb(e) - 'updated_at' FROM public.rating_scheme_entries e
  WHERE id = 'd1602000-0000-4000-8000-000000000402' $$,
  $$ SELECT (row_data - 'updated_at') || jsonb_build_object('notes', 'Unrelated historical edit')
    FROM upgrade_fixture.rating_scheme_evaluator_before WHERE row_id = 'd1602000-0000-4000-8000-000000000402' $$,
  'the unrelated edit retains all four historical links and every other saved fact');
-- Capture the actual post-edit state, including the normal update timestamp,
-- so rejected deletion must restore every byte of both Organizations' rows.
CREATE TEMP TABLE evaluator_delete_before AS SELECT * FROM evaluator_current_rows;

SET LOCAL ROLE service_role;
SELECT throws_ok(format($sql$ INSERT INTO public.rating_scheme_entries
  (organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end, status, %I)
  VALUES ('d1602000-0000-4000-8000-000000000101', 'd1602000-0000-4000-8000-000000000301', 'NCOER', '2026-01-01', '2026-12-31', 'active', %L) $sql$, field, 'd1602000-0000-4000-8000-000000000305'),
  '23503', NULL, 'upgraded privileged creates reject foreign ' || field)
FROM (VALUES ('rater_person_id'), ('senior_rater_person_id'), ('intermediate_rater_person_id'), ('reviewer_person_id')) AS fields(field);
SELECT throws_ok($$ UPDATE public.rating_scheme_entries SET organization_id = 'd1602000-0000-4000-8000-000000000102'
  WHERE id = 'd1602000-0000-4000-8000-000000000401' $$,
  '23503', NULL, 'evaluation Organization changes cannot keep foreign evaluator links');
SELECT throws_ok($$ UPDATE public.personnel SET id = 'd1602000-0000-4000-8000-000000000399'
  WHERE id = 'd1602000-0000-4000-8000-000000000302' $$,
  '23503', NULL, 'referenced evaluators cannot change identity');
RESET ROLE;

CREATE FUNCTION pg_temp.evaluator_delete_rejected() RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER AS $fn$
BEGIN
  DELETE FROM public.personnel WHERE id = 'd1602000-0000-4000-8000-000000000305';
  SET CONSTRAINTS ALL IMMEDIATE;
  RETURN false;
EXCEPTION WHEN foreign_key_violation THEN RETURN true;
END; $fn$;
SET LOCAL ROLE service_role;
SELECT ok(pg_temp.evaluator_delete_rejected(), 'a legacy foreign link rejects evaluator deletion at the deferred check');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM evaluator_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT * FROM evaluator_delete_before ORDER BY table_name, row_id $$,
  'rejected deletion rolls back both Organizations, all four local clears, timestamps and the rated cascade');

-- Several SET NULL actions can recheck untouched legacy-invalid slots on the
-- same row. Preserve that row and reject deletion; do not hide this release limit.
SET LOCAL ROLE service_role;
SELECT throws_ok($$ DELETE FROM public.personnel WHERE id = 'd1602000-0000-4000-8000-000000000302'; SET CONSTRAINTS ALL IMMEDIATE $$,
  '23503', NULL, 'mixed legacy evaluator slots can block deletion of a local Person');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM evaluator_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT * FROM evaluator_delete_before ORDER BY table_name, row_id $$,
  'mixed legacy rejection retains every row, timestamp and rated cascade');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ UPDATE public.rating_scheme_entries SET rater_person_id = NULL, senior_rater_person_id = NULL
  WHERE id = 'd1602000-0000-4000-8000-000000000407' $$,
  'explicit operator correction can clear the local slots in a mixed legacy row');
RESET ROLE;
SELECT results_eq($$ SELECT to_jsonb(e) - 'updated_at' FROM public.rating_scheme_entries e
  WHERE id = 'd1602000-0000-4000-8000-000000000407' $$,
  $$ SELECT (row_data - 'updated_at') || jsonb_build_object('rater_person_id', NULL, 'senior_rater_person_id', NULL)
    FROM evaluator_delete_before WHERE row_id = 'd1602000-0000-4000-8000-000000000407' $$,
  'the explicit correction preserves foreign historical slots and every other saved fact');
CREATE TEMP TABLE evaluator_valid_delete_before AS SELECT * FROM evaluator_current_rows;

SET LOCAL ROLE service_role;
SELECT lives_ok($$ DELETE FROM public.personnel WHERE id = 'd1602000-0000-4000-8000-000000000302'; SET CONSTRAINTS ALL IMMEDIATE $$,
  'deleting a valid local evaluator completes all four null effects and rated cascade');
RESET ROLE;
SELECT results_eq($$ SELECT to_jsonb(e) - 'updated_at' FROM public.rating_scheme_entries e
  WHERE id = 'd1602000-0000-4000-8000-000000000401' $$,
  $$ SELECT (row_data - 'updated_at') || jsonb_build_object('rater_person_id', NULL, 'senior_rater_person_id', NULL,
    'intermediate_rater_person_id', NULL, 'reviewer_person_id', NULL) FROM evaluator_valid_delete_before
    WHERE row_id = 'd1602000-0000-4000-8000-000000000401' $$,
  'valid deletion retains every evaluation fact except evaluator IDs and the normal update timestamp');
SELECT is((SELECT count(*)::integer FROM public.rating_scheme_entries WHERE id = 'd1602000-0000-4000-8000-000000000405'), 0,
  'local rated-Person cascade remains effective');
SELECT results_eq($$ SELECT * FROM evaluator_current_rows WHERE row_id NOT IN
  ('d1602000-0000-4000-8000-000000000302', 'd1602000-0000-4000-8000-000000000401', 'd1602000-0000-4000-8000-000000000405') ORDER BY table_name, row_id $$,
  $$ SELECT * FROM evaluator_valid_delete_before WHERE row_id NOT IN
  ('d1602000-0000-4000-8000-000000000302', 'd1602000-0000-4000-8000-000000000401', 'd1602000-0000-4000-8000-000000000405') ORDER BY table_name, row_id $$,
  'valid deletion leaves foreign/historical links and external names unchanged');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ UPDATE public.rating_scheme_entries SET
  rater_person_id = NULL, senior_rater_person_id = NULL, intermediate_rater_person_id = NULL, reviewer_person_id = NULL
  WHERE id = 'd1602000-0000-4000-8000-000000000402' $$,
  'explicit operator correction can clear all four historical foreign links');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
