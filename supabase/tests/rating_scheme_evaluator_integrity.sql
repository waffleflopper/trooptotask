-- Evaluator integrity is independent of the rated Person's existing access scope.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('d1601000-0000-4000-8000-000000000001', 'eval-integrity@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('d1601000-0000-4000-8000-000000000101', 'Eval Integrity Alpha', 'd1601000-0000-4000-8000-000000000001'),
  ('d1601000-0000-4000-8000-000000000102', 'Eval Integrity Bravo', 'd1601000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('d1601000-0000-4000-8000-000000000201', 'd1601000-0000-4000-8000-000000000101', 'Alpha'),
  ('d1601000-0000-4000-8000-000000000202', 'd1601000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES (
  'd1601000-0000-4000-8000-000000000101', 'd1601000-0000-4000-8000-000000000001',
  'member', 'viewer', '{"ratingScheme":"operate","personnel":"none","calendar":"none","training":"none","criticalTasks":"none","onboarding":"none"}', 'groups', ARRAY['d1601000-0000-4000-8000-000000000201']::uuid[]
);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('d1601000-0000-4000-8000-000000000301', 'd1601000-0000-4000-8000-000000000101', 'd1601000-0000-4000-8000-000000000201', 'SGT', 'Rated', 'Alpha', 'eval-integrity-rated', NULL),
  ('d1601000-0000-4000-8000-000000000302', 'd1601000-0000-4000-8000-000000000101', 'd1601000-0000-4000-8000-000000000201', 'SSG', 'Rater', 'Alpha', 'eval-integrity-rater', NULL),
  ('d1601000-0000-4000-8000-000000000303', 'd1601000-0000-4000-8000-000000000101', 'd1601000-0000-4000-8000-000000000202', 'SSG', 'Archived', 'Bravo', 'eval-integrity-archived', '2026-01-01T00:00:00Z'),
  ('d1601000-0000-4000-8000-000000000304', 'd1601000-0000-4000-8000-000000000101', NULL, 'SSG', 'Unassigned', 'Local', 'eval-integrity-unassigned', NULL),
  ('d1601000-0000-4000-8000-000000000305', 'd1601000-0000-4000-8000-000000000102', NULL, 'SSG', 'Foreign', 'Bravo', 'eval-integrity-foreign', NULL);
INSERT INTO public.rating_scheme_entries (
  id, organization_id, rated_person_id, eval_type, rater_person_id, senior_rater_person_id,
  intermediate_rater_person_id, reviewer_person_id, rater_name, senior_rater_name,
  intermediate_rater_name, reviewer_name, rating_period_start, rating_period_end,
  status, report_type, workflow_status, notes
) VALUES (
  'd1601000-0000-4000-8000-000000000401', 'd1601000-0000-4000-8000-000000000101', 'd1601000-0000-4000-8000-000000000301', 'NCOER',
  'd1601000-0000-4000-8000-000000000302', 'd1601000-0000-4000-8000-000000000302',
  'd1601000-0000-4000-8000-000000000302', 'd1601000-0000-4000-8000-000000000302',
  'Retained Rater', 'Retained Senior', 'Retained Intermediate', 'Retained Reviewer',
  '2026-01-01', '2026-12-31', 'change-of-rater', 'CR', 'with-rater', 'Retained evaluation history'
);
CREATE TEMP TABLE evaluator_write_before AS SELECT to_jsonb(e) AS row_data
  FROM public.rating_scheme_entries e WHERE id = 'd1601000-0000-4000-8000-000000000401';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1601000-0000-4000-8000-000000000001', true);
SELECT throws_ok(format($sql$ INSERT INTO public.rating_scheme_entries
  (organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end, status, %I)
  VALUES ('d1601000-0000-4000-8000-000000000101', 'd1601000-0000-4000-8000-000000000301', 'NCOER', '2026-01-01', '2026-12-31', 'active', %L) $sql$, field, person_id),
  '23503', NULL, 'authenticated create rejects ' || label || ' in ' || field)
FROM (VALUES ('rater_person_id'), ('senior_rater_person_id'), ('intermediate_rater_person_id'), ('reviewer_person_id')) AS fields(field)
CROSS JOIN (VALUES ('d1601000-0000-4000-8000-000000000305', 'foreign'), ('d1601000-0000-4000-8000-000000000399', 'missing')) AS people(person_id, label);
SELECT throws_ok(format($sql$ UPDATE public.rating_scheme_entries SET %I = %L, notes = 'Must not persist'
  WHERE id = 'd1601000-0000-4000-8000-000000000401' $sql$, field, person_id),
  '23503', NULL, 'authenticated update rejects ' || label || ' ' || field)
FROM (VALUES ('rater_person_id'), ('senior_rater_person_id'), ('intermediate_rater_person_id'), ('reviewer_person_id')) AS fields(field)
CROSS JOIN (VALUES ('d1601000-0000-4000-8000-000000000305', 'foreign'), ('d1601000-0000-4000-8000-000000000399', 'missing')) AS people(person_id, label);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok(format($sql$ UPDATE public.rating_scheme_entries SET %I = %L
  WHERE id = 'd1601000-0000-4000-8000-000000000401' $sql$, field, person_id),
  '23503', NULL, 'privileged update rejects ' || label || ' ' || field)
FROM (VALUES ('rater_person_id'), ('senior_rater_person_id'), ('intermediate_rater_person_id'), ('reviewer_person_id')) AS fields(field)
CROSS JOIN (VALUES ('d1601000-0000-4000-8000-000000000305', 'foreign'), ('d1601000-0000-4000-8000-000000000399', 'missing')) AS people(person_id, label);
SELECT throws_ok(format($sql$ INSERT INTO public.rating_scheme_entries
  (organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end, status, %I)
  VALUES ('d1601000-0000-4000-8000-000000000101', 'd1601000-0000-4000-8000-000000000301', 'NCOER', '2026-01-01', '2026-12-31', 'active', %L) $sql$, field, person_id),
  '23503', NULL, 'privileged create rejects ' || label || ' ' || field)
FROM (VALUES ('rater_person_id'), ('senior_rater_person_id'), ('intermediate_rater_person_id'), ('reviewer_person_id')) AS fields(field)
CROSS JOIN (VALUES ('d1601000-0000-4000-8000-000000000305', 'foreign'), ('d1601000-0000-4000-8000-000000000399', 'missing')) AS people(person_id, label);
SELECT throws_ok($$ INSERT INTO public.rating_scheme_entries
  (id, organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end, status, rater_person_id) VALUES
  ('d1601000-0000-4000-8000-000000000411', 'd1601000-0000-4000-8000-000000000101', 'd1601000-0000-4000-8000-000000000301', 'NCOER', '2026-01-01', '2026-12-31', 'active', 'd1601000-0000-4000-8000-000000000302'),
  ('d1601000-0000-4000-8000-000000000412', 'd1601000-0000-4000-8000-000000000101', 'd1601000-0000-4000-8000-000000000301', 'NCOER', '2026-01-01', '2026-12-31', 'active', 'd1601000-0000-4000-8000-000000000305') $$,
  '23503', NULL, 'a mixed multirow statement rejects its foreign evaluator');
SELECT is((SELECT count(*)::integer FROM public.rating_scheme_entries WHERE id IN
  ('d1601000-0000-4000-8000-000000000411', 'd1601000-0000-4000-8000-000000000412')), 0,
  'a rejected multirow statement leaves no valid prefix');
SELECT throws_ok($$ UPDATE public.personnel SET id = 'd1601000-0000-4000-8000-000000000399'
  WHERE id = 'd1601000-0000-4000-8000-000000000302' $$,
  '23503', NULL, 'a referenced evaluator cannot change identity');
SELECT throws_ok($$ UPDATE public.personnel SET organization_id = 'd1601000-0000-4000-8000-000000000102', group_id = NULL
  WHERE id = 'd1601000-0000-4000-8000-000000000302' $$,
  '23503', NULL, 'a referenced evaluator cannot move Organizations');
RESET ROLE;
SELECT results_eq($$ SELECT to_jsonb(e) FROM public.rating_scheme_entries e
  WHERE id = 'd1601000-0000-4000-8000-000000000401' $$,
  $$ SELECT row_data FROM evaluator_write_before $$, 'rejected writes preserve every evaluation field');

SET LOCAL ROLE authenticated;
SELECT lives_ok($$ UPDATE public.rating_scheme_entries SET
  rater_person_id = 'd1601000-0000-4000-8000-000000000303', senior_rater_person_id = 'd1601000-0000-4000-8000-000000000304'
  WHERE id = 'd1601000-0000-4000-8000-000000000401' $$,
  'Group-scoped operators may use local archived/cross-Group and unassigned evaluators');
SELECT lives_ok($$ UPDATE public.rating_scheme_entries SET
  rater_person_id = NULL, senior_rater_person_id = NULL, intermediate_rater_person_id = NULL, reviewer_person_id = NULL
  WHERE id = 'd1601000-0000-4000-8000-000000000401' $$, 'all evaluator relationships remain optional');
SELECT lives_ok($$ UPDATE public.rating_scheme_entries SET
  rater_person_id = 'd1601000-0000-4000-8000-000000000302', senior_rater_person_id = 'd1601000-0000-4000-8000-000000000302',
  intermediate_rater_person_id = 'd1601000-0000-4000-8000-000000000302', reviewer_person_id = 'd1601000-0000-4000-8000-000000000302'
  WHERE id = 'd1601000-0000-4000-8000-000000000401' $$, 'one local Person may fill all four evaluator roles');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok($$ DELETE FROM public.personnel WHERE id = 'd1601000-0000-4000-8000-000000000302'; SET CONSTRAINTS ALL IMMEDIATE $$,
  'local evaluator deletion completes all four SET NULL effects before ID checks');
RESET ROLE;
SELECT results_eq($$ SELECT to_jsonb(e) - 'updated_at' FROM public.rating_scheme_entries e
  WHERE id = 'd1601000-0000-4000-8000-000000000401' $$,
  $$ SELECT (row_data - 'updated_at') || jsonb_build_object('rater_person_id', NULL, 'senior_rater_person_id', NULL,
    'intermediate_rater_person_id', NULL, 'reviewer_person_id', NULL) FROM evaluator_write_before $$,
  'local evaluator deletion retains identity, Organization, names, dates, status, workflow and notes');
SET LOCAL ROLE service_role;
SELECT lives_ok($$ DELETE FROM public.personnel WHERE id = 'd1601000-0000-4000-8000-000000000301' $$,
  'rated-Person deletion retains its existing evaluation cascade');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.rating_scheme_entries WHERE id = 'd1601000-0000-4000-8000-000000000401'), 0,
  'the rated-Person evaluation is removed by the retained cascade');
SELECT * FROM finish();
ROLLBACK;
