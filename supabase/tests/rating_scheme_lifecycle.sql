-- An Evaluation jumps to any present step, as an ordinary signed-in Evals operator, and keeps the chain that signed it.
-- Each refusals row names, for the evaluators a chain has and a group of steps an Evaluation may sit at, the targets
-- that are "refused" (SQLSTATE 55000): the steps an absent evaluator leaves out, and Not tracked unless the Evaluation
-- is at drafting or completed. Every other target moves, and the current step is "unchanged" (the call returns false). The same rows
-- are asserted against isWorkflowMoveAllowed in evaluationWorkflow.test.ts, so the rule cannot change on one side alone.
--
--   none      no intermediate rater, no reviewer
--   both      an intermediate rater and a reviewer, by Person
--   reviewer  a reviewer by name only
--   legacy    left at With Intermediate Rater after the intermediate rater was cleared to a blank name
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('e7a10000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.steps() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['not tracked', 'drafting', 'command-review', 'with-rater', 'rater-signed', 'with-intermediate-rater',
    'ir-signed', 'with-senior-rater', 'sr-signed', 'with-reviewer', 'reviewer-signed', 'with-rated-soldier', 'sm-signed',
    'submitted-to-hrc', 'completed'];
$$;
CREATE FUNCTION pg_temp.step(p_label text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(p_label, 'not tracked');
$$;
-- Each Evaluation gets its own rated Person and scheme, since a scheme has at most one open Evaluation. Setup runs
-- before the signed-in role is taken.
CREATE FUNCTION pg_temp.new_entry(p_roles text, p_start date DEFAULT '2030-01-01', p_end date DEFAULT '2030-12-31')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_person uuid := gen_random_uuid();
  v_scheme uuid := gen_random_uuid();
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug)
  VALUES (v_person, pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Rated', 'Able', 'lifecycle-' || v_person);
  INSERT INTO public.rating_schemes (id, organization_id, rated_person_id, eval_type, rater_person_id,
    senior_rater_name, intermediate_rater_person_id, reviewer_person_id, reviewer_name, notes)
  VALUES (v_scheme, pg_temp.id('101'), v_person, 'NCOER', pg_temp.id('302'), 'COL Senior',
    CASE WHEN p_roles IN ('both', 'legacy') THEN pg_temp.id('303') END,
    CASE WHEN p_roles = 'both' THEN pg_temp.id('303') END,
    CASE WHEN p_roles = 'reviewer' THEN 'MAJ Reviewer' END, 'Scheme notes');
  INSERT INTO public.evaluations (id, organization_id, rating_scheme_id, rated_person_id, eval_type,
    rating_period_start, rating_period_end, report_type, notes)
  VALUES (v_id, pg_temp.id('101'), v_scheme, v_person, 'NCOER', p_start, p_end, 'AN', 'Kept notes');
  RETURN v_id;
END;
$$;
-- Puts an Evaluation at a step by one jump; the legacy one's scheme then loses its intermediate rater.
CREATE FUNCTION pg_temp.at_step(p_roles text, p_label text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := pg_temp.new_entry(p_roles);
BEGIN
  IF p_label <> 'not tracked' THEN
    PERFORM public.transition_evaluation(pg_temp.id('101'), v_id, NULL, p_label);
  END IF;
  IF p_roles = 'legacy' THEN
    UPDATE public.rating_schemes SET intermediate_rater_person_id = NULL, intermediate_rater_name = '  '
    WHERE id = (SELECT rating_scheme_id FROM public.evaluations WHERE id = v_id);
  END IF;
  RETURN v_id;
END;
$$;
CREATE FUNCTION pg_temp.scheme(p_evaluation uuid) RETURNS uuid LANGUAGE sql AS $$
  SELECT rating_scheme_id FROM public.evaluations WHERE id = p_evaluation;
$$;
CREATE FUNCTION pg_temp.row(p_evaluation uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT to_jsonb(e) FROM public.evaluations e WHERE e.id = p_evaluation;
$$;
-- Tries one move and undoes it, so every target is tried from the same starting step.
CREATE FUNCTION pg_temp.attempt(p_entry uuid, p_to text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (public.transition_evaluation(pg_temp.id('101'), p_entry,
    (SELECT workflow_status FROM public.evaluations WHERE id = p_entry), pg_temp.step(p_to)) ->> 'moved')::boolean THEN
    RETURN 'unchanged';
  END IF;
  RAISE EXCEPTION '%', COALESCE((SELECT workflow_status FROM public.evaluations WHERE id = p_entry), 'not tracked')
    USING ERRCODE = 'RSL01';
EXCEPTION
  WHEN SQLSTATE '55000' THEN RETURN 'refused';
  WHEN SQLSTATE 'RSL01' THEN RETURN SQLERRM;
END;
$$;
CREATE TEMP TABLE refusals (roles text, from_steps text[], refused text[]);
CREATE TEMP TABLE matrix (roles text, from_step text, refused text[], entry uuid);
CREATE TEMP TABLE fixture (label text PRIMARY KEY, entry uuid);
CREATE TEMP TABLE changed (entry uuid, successor uuid);
CREATE TEMP TABLE leap (entry uuid, successor uuid);
CREATE TEMP TABLE returned (label text, result jsonb);
GRANT ALL ON refusals, matrix, fixture, changed, leap, returned TO authenticated;
CREATE FUNCTION pg_temp.f(p_label text) RETURNS uuid LANGUAGE sql AS $$
  SELECT entry FROM fixture WHERE label = p_label;
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'lifecycle-' || n || '@example.test', now()
FROM generate_series(1, 4) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Lifecycle Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Lifecycle Foreign', pg_temp.id('1'));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.id('201'), pg_temp.id('101'), 'Alpha'),
  (pg_temp.id('202'), pg_temp.id('101'), 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'viewer', '{"ratingScheme":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{"ratingScheme":"operate"}', 'groups', ARRAY[pg_temp.id('202')]),
  (pg_temp.id('101'), pg_temp.id('4'), 'member', 'viewer', '{"ratingScheme":"view"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('302'), pg_temp.id('101'), pg_temp.id('201'), 'SSG', 'First', 'Rater', 'lifecycle-rater'),
  (pg_temp.id('303'), pg_temp.id('101'), pg_temp.id('201'), 'SFC', 'Next', 'Rater', 'lifecycle-next'),
  (pg_temp.id('305'), pg_temp.id('102'), NULL, 'SSG', 'Foreign', 'Rater', 'lifecycle-foreign');

SELECT ok(NOT has_function_privilege('anon', 'public.transition_evaluation(uuid,uuid,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.change_evaluation_rater(uuid,uuid,date,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.start_evaluation(uuid,uuid,text,date,date,boolean,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.set_rating_scheme_archived(uuid,uuid,boolean)', 'EXECUTE'),
  'signed-out callers cannot start, move or close an Evaluation, change its rater or archive a scheme');

INSERT INTO refusals (roles, from_steps, refused) VALUES
  ('none', ARRAY['drafting', 'completed'],
    ARRAY['with-intermediate-rater', 'ir-signed', 'with-reviewer', 'reviewer-signed']),
  ('none', ARRAY['not tracked', 'command-review', 'with-rater', 'rater-signed', 'with-senior-rater', 'sr-signed',
    'with-rated-soldier', 'sm-signed', 'submitted-to-hrc'],
    ARRAY['not tracked', 'with-intermediate-rater', 'ir-signed', 'with-reviewer', 'reviewer-signed']),
  ('both', ARRAY['drafting', 'completed'], ARRAY[]::text[]),
  ('both', ARRAY['not tracked', 'command-review', 'with-rater', 'rater-signed', 'with-intermediate-rater', 'ir-signed',
    'with-senior-rater', 'sr-signed', 'with-reviewer', 'reviewer-signed', 'with-rated-soldier', 'sm-signed',
    'submitted-to-hrc'],
    ARRAY['not tracked']),
  ('reviewer', ARRAY['drafting', 'completed'], ARRAY['with-intermediate-rater', 'ir-signed']),
  ('reviewer', ARRAY['not tracked', 'command-review', 'with-rater', 'rater-signed', 'with-senior-rater', 'sr-signed',
    'with-reviewer', 'reviewer-signed', 'with-rated-soldier', 'sm-signed', 'submitted-to-hrc'],
    ARRAY['not tracked', 'with-intermediate-rater', 'ir-signed']),
  ('legacy', ARRAY['with-intermediate-rater'],
    ARRAY['not tracked', 'with-intermediate-rater', 'ir-signed', 'with-reviewer', 'reviewer-signed']);
INSERT INTO matrix (roles, from_step, refused)
SELECT r.roles, f.from_step, r.refused FROM refusals r CROSS JOIN LATERAL unnest(r.from_steps) AS f(from_step);
SELECT pg_temp.act_as('2');
UPDATE matrix SET entry = pg_temp.at_step(roles, from_step);
INSERT INTO fixture VALUES
  ('jumped', pg_temp.at_step('none', 'sm-signed')),
  ('stale', pg_temp.new_entry('none')),
  ('probe', pg_temp.at_step('none', 'with-rater')),
  ('signed', pg_temp.at_step('both', 'with-rater')),
  ('fresh', pg_temp.new_entry('none'));
INSERT INTO changed (entry) SELECT pg_temp.at_step('both', 'with-rater');
INSERT INTO leap (entry) SELECT pg_temp.new_entry('none', '2027-03-01', '2028-03-31');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');

SELECT is((SELECT count(*)::int FROM matrix m JOIN public.evaluations r ON r.id = m.entry
    WHERE r.workflow_status IS NOT DISTINCT FROM pg_temp.step(m.from_step)), 40,
  'every starting step was reached by one jump');
SELECT is(pg_temp.attempt(m.entry, t.target),
    CASE WHEN t.target = m.from_step THEN 'unchanged' WHEN t.target = ANY (m.refused) THEN 'refused' ELSE t.target END,
    m.roles || ': ' || m.from_step || ' to ' || t.target)
FROM matrix m CROSS JOIN unnest(pg_temp.steps()) AS t(target)
ORDER BY m.roles, array_position(pg_temp.steps(), m.from_step), array_position(pg_temp.steps(), t.target);

SELECT public.transition_evaluation(pg_temp.id('101'), pg_temp.f('jumped'), 'sm-signed', 'drafting');
SELECT is((SELECT workflow_status FROM public.evaluations WHERE id = pg_temp.f('jumped')), 'drafting',
  'an Evaluation every evaluator has signed goes back to drafting in one move');
SELECT public.transition_evaluation(pg_temp.id('101'), pg_temp.f('jumped'), 'drafting', 'command-review');
SELECT is((SELECT workflow_status FROM public.evaluations WHERE id = pg_temp.f('jumped')), 'command-review',
  'an Evaluation jumps into Command Review');
SELECT throws_ok(format($$ SELECT public.transition_evaluation(%L, %L, 'command-review', 'with-reviewer') $$,
    pg_temp.id('101'), pg_temp.f('jumped')),
  '55000', 'An evaluation at command-review cannot move to with-reviewer', 'a jump to a step of an absent reviewer is refused');
SELECT throws_ok(format($$ SELECT public.transition_evaluation(%L, %L, 'drafting', 'with-rater') $$,
    pg_temp.id('101'), pg_temp.f('jumped')),
  '55000', 'The evaluation is at command-review, not drafting', 'a jump from a step the Evaluation has left is refused');
SELECT throws_ok(format($$ SELECT public.transition_evaluation(%L, %L, 'drafting', 'signed') $$,
    pg_temp.id('101'), (SELECT entry FROM matrix WHERE roles = 'none' AND from_step = 'drafting')),
  '22023', 'Unknown evaluation step', 'an unknown step is rejected');

-- Steps, chains, archive state and attribution are written only by the commands.
SELECT throws_ok(format($$ UPDATE public.evaluations SET %s WHERE id = %L $$, assignment,
    (SELECT entry FROM matrix WHERE roles = 'none' AND from_step = 'drafting')),
  '42501', NULL, 'an operator cannot write ' || label || ' directly')
FROM (VALUES ('workflow_status = ''completed''', 'the step'),
  ('chain_snapshot_at = now()', 'the signed time'),
  ('snapshot_rater_name = ''SSG Forged''', 'the signed chain'),
  ('rating_scheme_id = gen_random_uuid()', 'the scheme'),
  ('rated_person_id = gen_random_uuid()', 'the rated Person'),
  ('created_at = now()', 'the creation time')) AS w(assignment, label);
SELECT throws_ok(format($$ INSERT INTO public.evaluations (organization_id, rating_scheme_id, rated_person_id, eval_type,
    rating_period_start, rating_period_end) SELECT organization_id, rating_scheme_id, rated_person_id, eval_type,
    '2031-01-01', '2031-12-31' FROM public.evaluations WHERE id = %L $$,
    (SELECT entry FROM matrix WHERE roles = 'none' AND from_step = 'drafting')),
  '42501', NULL, 'an operator cannot create an Evaluation except by starting one');
SELECT throws_ok(format($$ UPDATE public.rating_schemes SET %s WHERE id = %L $$, assignment,
    pg_temp.scheme((SELECT entry FROM matrix WHERE roles = 'none' AND from_step = 'drafting'))),
  '42501', NULL, 'an operator cannot write the scheme''s ' || label || ' directly')
FROM (VALUES ('archived_at = now()', 'archive time'), ('archived_by = ''forged''', 'archiver'),
  ('created_at = now()', 'creation time'), ('organization_id = gen_random_uuid()', 'Organization')) AS w(assignment, label);
SELECT throws_ok(format($$ INSERT INTO public.rating_schemes (organization_id, rated_person_id, eval_type, archived_at)
    VALUES (%L, %L, 'NCOER', now()) $$, pg_temp.id('101'), pg_temp.id('303')),
  '42501', NULL, 'an operator cannot create an archived scheme');
SELECT is((SELECT workflow_status FROM public.evaluations
    WHERE id = (SELECT entry FROM matrix WHERE roles = 'none' AND from_step = 'drafting')), 'drafting',
  'the refused writes left the Evaluation at its step');

SELECT public.transition_evaluation(pg_temp.id('101'), pg_temp.f('stale'), NULL, 'drafting');
SELECT public.transition_evaluation(pg_temp.id('101'), pg_temp.f('stale'), 'drafting', 'with-rater');
SELECT throws_ok(format($$ SELECT public.transition_evaluation(%L, %L, NULL, 'drafting') $$,
    pg_temp.id('101'), pg_temp.f('stale')),
  '55000', 'The evaluation is at with-rater, not not tracked', 'a move from a step the Evaluation has left is refused');
SELECT is((SELECT workflow_status FROM public.evaluations WHERE id = pg_temp.f('stale')), 'with-rater',
  'the stale move kept the newer step');

INSERT INTO returned SELECT 'move', public.transition_evaluation(pg_temp.id('101'), pg_temp.f('stale'), 'with-rater', 'rater-signed');
INSERT INTO returned SELECT 'repeat', public.transition_evaluation(pg_temp.id('101'), pg_temp.f('stale'), 'with-rater', 'rater-signed');
SELECT is((SELECT result FROM returned WHERE label = 'move'),
  jsonb_build_object('moved', true, 'evaluation', pg_temp.row(pg_temp.f('stale'))),
  'a move returns the Evaluation as it now stands');
SELECT is((SELECT result FROM returned WHERE label = 'repeat'),
  jsonb_build_object('moved', false, 'evaluation', pg_temp.row(pg_temp.f('stale'))),
  'repeating the move returns the same Evaluation with moved false');
SELECT is((SELECT workflow_status FROM public.evaluations WHERE id = pg_temp.f('stale')), 'rater-signed',
  'the repeated move left the Evaluation where the first move put it');

-- Completing saves the chain that signed it; later scheme edits leave it, and reopening clears it.
SELECT public.transition_evaluation(pg_temp.id('101'), pg_temp.f('signed'), 'with-rater', 'completed');
SELECT results_eq(
  $$ SELECT chain_snapshot_at IS NOT NULL, snapshot_rater_person_id, snapshot_rater_name, snapshot_intermediate_rater_person_id,
       snapshot_senior_rater_person_id, snapshot_senior_rater_name, snapshot_reviewer_person_id, snapshot_reviewer_name
     FROM public.evaluations WHERE id = pg_temp.f('signed') $$,
  $$ VALUES (true, pg_temp.id('302'), NULL::text, pg_temp.id('303'), NULL::uuid, 'COL Senior'::text, pg_temp.id('303'), NULL::text) $$,
  'a completed Evaluation saves the chain that signed it');
UPDATE public.rating_schemes SET rater_person_id = NULL, rater_name = 'SSG Later', senior_rater_name = 'COL Later'
WHERE id = pg_temp.scheme(pg_temp.f('signed'));
SELECT results_eq(
  $$ SELECT snapshot_rater_person_id, snapshot_rater_name, snapshot_senior_rater_name FROM public.evaluations WHERE id = pg_temp.f('signed') $$,
  $$ VALUES (pg_temp.id('302'), NULL::text, 'COL Senior'::text) $$,
  'a later change to the scheme leaves the signed chain as it was');
SELECT public.transition_evaluation(pg_temp.id('101'), pg_temp.f('signed'), 'completed', 'with-rater');
SELECT ok((SELECT chain_snapshot_at IS NULL AND snapshot_rater_person_id IS NULL AND snapshot_senior_rater_name IS NULL
    FROM public.evaluations WHERE id = pg_temp.f('signed')),
  'reopening an Evaluation clears its signed chain, so it reads the scheme again');

-- A scheme holds one open Evaluation, and its rater changes only by Change of rater while one is open.
SELECT throws_ok(format($$ UPDATE public.rating_schemes SET rater_name = 'SSG Sneaky' WHERE id = %L $$,
    pg_temp.scheme(pg_temp.f('signed'))),
  '55000', 'Change the rater of an open evaluation with Change rater', 'an open Evaluation''s rater changes only by Change of rater');
SELECT lives_ok(format($$ UPDATE public.rating_schemes SET intermediate_rater_name = 'MSG Live', reviewer_name = 'LTC Live',
    intermediate_rater_person_id = NULL, reviewer_person_id = NULL WHERE id = %L $$, pg_temp.scheme(pg_temp.f('signed'))),
  'the intermediate rater and reviewer change on the scheme while its Evaluation is open');
INSERT INTO returned SELECT 'history', public.start_evaluation(pg_temp.id('101'), pg_temp.scheme(pg_temp.f('signed')), 'AN',
  '2029-01-01', '2029-12-31', true, 'Recorded history');
SELECT results_eq(
  $$ SELECT r.result ->> 'created', e.workflow_status, e.report_type, e.notes, e.chain_snapshot_at IS NOT NULL,
       e.snapshot_rater_name, e.snapshot_intermediate_rater_name
     FROM returned r JOIN public.evaluations e ON e.id = (r.result #>> '{evaluation,id}')::uuid WHERE r.label = 'history' $$,
  $$ VALUES ('true'::text, 'completed'::text, 'AN'::text, 'Recorded history'::text, true, 'SSG Later'::text, 'MSG Live'::text) $$,
  'a completed Evaluation is recorded beside an open one with the scheme''s chain saved');
SELECT throws_ok(format($$ SELECT public.transition_evaluation(%L, %L, 'completed', 'drafting') $$,
    pg_temp.id('101'), (SELECT (result #>> '{evaluation,id}')::uuid FROM returned WHERE label = 'history')),
  '55000', 'Another evaluation is already open on this rating scheme', 'a second Evaluation on a scheme cannot reopen');
SELECT throws_ok(format($$ SELECT public.start_evaluation(%L, %L, 'AN', '2031-01-01', '2031-12-31') $$,
    pg_temp.id('101'), pg_temp.scheme(pg_temp.f('signed'))),
  '55000', 'Another evaluation is already open on this rating scheme', 'a second Evaluation on a scheme cannot open');
SELECT is(public.start_evaluation(pg_temp.id('101'), pg_temp.scheme(pg_temp.f('signed')), 'AN', '2030-01-01', '2030-12-31'),
  jsonb_build_object('created', false, 'evaluation', pg_temp.row(pg_temp.f('signed'))),
  'starting the open Evaluation again returns it unchanged');
SELECT throws_ok(format($$ SELECT public.start_evaluation(%L, %L, 'AN', '2030-12-31', '2030-01-01') $$,
    pg_temp.id('101'), pg_temp.scheme(pg_temp.f('signed'))),
  '22023', 'Choose a rating period that ends on or after it starts', 'an Evaluation needs a period in order');

-- Out of scope and view-only members.
SELECT pg_temp.act_as('3');
SELECT throws_ok(format($$ SELECT public.transition_evaluation(%L, %L, 'with-rater', 'rater-signed') $$, pg_temp.id('101'),
    pg_temp.f('probe')), 'P0002', 'Evaluation not found', 'an operator outside the rated Person''s Group cannot find it');
SELECT throws_ok(format($$ SELECT public.change_evaluation_rater(%L, %L, '2030-06-15', %L, NULL) $$, pg_temp.id('101'),
    pg_temp.f('probe'), pg_temp.id('303')), 'P0002', 'Evaluation not found',
  'an operator outside the rated Person''s Group cannot change its rater');
SELECT throws_ok(format($$ SELECT public.start_evaluation(%L, %L, 'AN', '2031-01-01', '2031-12-31', true) $$, pg_temp.id('101'),
    pg_temp.scheme(pg_temp.f('probe'))), 'P0002', 'Rating scheme not found',
  'an operator outside the rated Person''s Group cannot start an Evaluation');
SELECT pg_temp.act_as('4');
SELECT throws_ok(format($$ SELECT public.transition_evaluation(%L, %L, 'with-rater', 'rater-signed') $$, pg_temp.id('101'),
    pg_temp.f('probe')), '42501', NULL, 'a view-only member cannot move an Evaluation');
SELECT throws_ok(format($$ SELECT public.change_evaluation_rater(%L, %L, '2030-06-15', %L, NULL) $$, pg_temp.id('101'),
    pg_temp.f('probe'), pg_temp.id('303')), '42501', NULL, 'a view-only member cannot change the rater');
SELECT throws_ok(format($$ SELECT public.start_evaluation(%L, %L, 'AN', '2031-01-01', '2031-12-31', true) $$, pg_temp.id('101'),
    pg_temp.scheme(pg_temp.f('probe'))), '42501', NULL, 'a view-only member cannot start an Evaluation');
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT throws_ok(format($$ SELECT public.transition_evaluation(%L, %L, 'with-rater', 'rater-signed') $$, pg_temp.id('101'),
    pg_temp.f('probe')), 'P0002', 'Evaluation not found', 'a request without a user finds nothing');
SELECT pg_temp.act_as('2');
SELECT results_eq(
  $$ SELECT workflow_status, (SELECT count(*)::int FROM public.evaluations e WHERE e.rating_scheme_id = pg_temp.scheme(pg_temp.f('probe')))
     FROM public.evaluations WHERE id = pg_temp.f('probe') $$,
  $$ VALUES ('with-rater'::text, 1) $$,
  'denied calls left the Evaluation where it was and started none');

-- Change of rater.
INSERT INTO returned SELECT 'change', public.change_evaluation_rater(pg_temp.id('101'), entry, '2030-06-15', pg_temp.id('303'), NULL)
FROM changed;
UPDATE changed SET successor = (SELECT (result -> 'successor' ->> 'id')::uuid FROM returned WHERE label = 'change');
SELECT is((SELECT result FROM returned WHERE label = 'change'),
    jsonb_build_object('evaluation', pg_temp.row((SELECT entry FROM changed)),
      'ratingScheme', to_jsonb((SELECT s FROM public.rating_schemes s WHERE s.id = pg_temp.scheme((SELECT entry FROM changed)))) - 'archived_by',
      'successor', pg_temp.row((SELECT successor FROM changed))),
  'a change of rater returns the completed Evaluation, the scheme with its new rater and the successor as stored');
SELECT results_eq(
  $$ SELECT rating_period_start, rating_period_end, report_type, workflow_status, notes, snapshot_rater_person_id,
       snapshot_senior_rater_name, snapshot_intermediate_rater_person_id, snapshot_reviewer_person_id
     FROM public.evaluations WHERE id = (SELECT entry FROM changed) $$,
  $$ VALUES ('2030-01-01'::date, '2030-06-15'::date, 'CR'::text, 'completed'::text, 'Kept notes'::text, pg_temp.id('302'),
       'COL Senior'::text, pg_temp.id('303'), pg_temp.id('303')) $$,
  'the Evaluation closes as a completed Change of Rater report through the change date, signed by the old chain');
SELECT results_eq(
  $$ SELECT rater_person_id, rater_name, senior_rater_name, intermediate_rater_person_id, reviewer_person_id, notes
     FROM public.rating_schemes WHERE id = pg_temp.scheme((SELECT entry FROM changed)) $$,
  $$ VALUES (pg_temp.id('303'), NULL::text, 'COL Senior'::text, pg_temp.id('303'), pg_temp.id('303'), 'Scheme notes'::text) $$,
  'the scheme takes the new rater and keeps the other evaluators');
SELECT results_eq(
  $$ SELECT organization_id, rating_scheme_id, eval_type, rating_period_start, rating_period_end, report_type, workflow_status,
       notes, chain_snapshot_at
     FROM public.evaluations WHERE id = (SELECT successor FROM changed) $$,
  $$ VALUES (pg_temp.id('101'), pg_temp.scheme((SELECT entry FROM changed)), 'NCOER'::text, '2030-06-16'::date,
       '2031-06-15'::date, 'AN'::text, 'drafting'::text, NULL::text, NULL::timestamptz) $$,
  'the successor is an Annual at drafting for the new rater from the next day, reading the scheme''s chain');
SELECT is(public.change_evaluation_rater(pg_temp.id('101'), (SELECT entry FROM changed), '2030-06-15', pg_temp.id('303'), NULL),
  jsonb_build_object('evaluation', pg_temp.row((SELECT entry FROM changed)),
      'ratingScheme', to_jsonb((SELECT s FROM public.rating_schemes s WHERE s.id = pg_temp.scheme((SELECT entry FROM changed)))) - 'archived_by',
    'successor', pg_temp.row((SELECT successor FROM changed))),
  'replaying the change of rater returns the completed Evaluation and the successor it opened');
SELECT is(public.change_evaluation_rater(pg_temp.id('101'), (SELECT entry FROM changed), '2030-06-14', pg_temp.id('303'), NULL),
  jsonb_build_object('evaluation', pg_temp.row((SELECT entry FROM changed)),
      'ratingScheme', to_jsonb((SELECT s FROM public.rating_schemes s WHERE s.id = pg_temp.scheme((SELECT entry FROM changed)))) - 'archived_by',
    'successor', NULL),
  'a different change of rater on the completed Evaluation returns it with no successor');
SELECT is((SELECT count(*)::int FROM public.evaluations WHERE rating_scheme_id = pg_temp.scheme((SELECT entry FROM changed))), 2,
  'repeating the change of rater opens no second successor');

UPDATE leap SET successor = (public.change_evaluation_rater(pg_temp.id('101'), entry, '2028-02-28', NULL, ' SSG Named Rater ')
  -> 'successor' ->> 'id')::uuid;
SELECT results_eq(
  $$ SELECT e.rating_period_start, e.rating_period_end, s.rater_person_id, s.rater_name
     FROM public.evaluations e JOIN public.rating_schemes s ON s.id = e.rating_scheme_id WHERE e.id = (SELECT successor FROM leap) $$,
  $$ VALUES ('2028-02-29'::date, '2029-02-28'::date, NULL::uuid, 'SSG Named Rater'::text) $$,
  'a successor from 29 February runs through 28 February the next year, for a new rater named outside the roster');
SELECT throws_ok(format($$ SELECT public.change_evaluation_rater(%L, %L, '2028-06-15', NULL, 'ssg named rater ') $$,
    pg_temp.id('101'), (SELECT successor FROM leap)),
  '22023', 'The new rater is already this evaluation''s rater', 'the current rater named outside the roster cannot replace themselves');
SELECT results_eq(
  $$ SELECT rating_period_end, report_type, workflow_status,
       (SELECT count(*)::int FROM public.evaluations WHERE rating_period_start = '2028-06-16')
     FROM public.evaluations WHERE id = (SELECT successor FROM leap) $$,
  $$ VALUES ('2029-02-28'::date, 'AN'::text, 'drafting'::text, 0) $$,
  'the refused change of the named rater left the Evaluation open and opened no successor');

SELECT throws_ok(format($$ SELECT public.change_evaluation_rater(%L, %L, %L, %L, NULL) $$, pg_temp.id('101'),
    pg_temp.f('fresh'), d, pg_temp.id('303')),
  '22023', 'The last day with the current rater must fall within the rating period', 'a change on ' || d || ' is refused')
FROM unnest(ARRAY['2029-12-31', '2031-01-01']) AS d;
SELECT throws_ok(format($$ SELECT public.change_evaluation_rater(%L, %L, '2030-06-15', %L, %L) $$, pg_temp.id('101'),
    pg_temp.f('fresh'), person, name),
  '22023', 'Choose one new rater', label)
FROM (VALUES (NULL, NULL, 'a change without a new rater is refused'),
  (NULL, '   ', 'a blank new rater name is refused'),
  (pg_temp.id('303')::text, 'SSG Both', 'a new rater given as both a Person and a name is refused')) AS c(person, name, label);
SELECT throws_ok(format($$ SELECT public.change_evaluation_rater(%L, %L, '2030-06-15', %L, NULL) $$, pg_temp.id('101'),
    pg_temp.f('fresh'), pg_temp.id('302')),
  '22023', 'The new rater is already this evaluation''s rater', 'the current rater cannot replace themselves');
SELECT throws_ok(format($$ SELECT public.change_evaluation_rater(%L, %L, '2030-06-15', %L, NULL) $$, pg_temp.id('101'),
    pg_temp.f('fresh'), pg_temp.id('305')),
  '23503', NULL, 'a new rater from another Organization is refused');
SELECT results_eq(
  $$ SELECT e.rating_period_end, e.report_type, e.workflow_status, s.rater_person_id
     FROM public.evaluations e JOIN public.rating_schemes s ON s.id = e.rating_scheme_id WHERE e.id = pg_temp.f('fresh') $$,
  $$ VALUES ('2030-12-31'::date, 'AN'::text, NULL::text, pg_temp.id('302')) $$,
  'a refused change of rater leaves the Evaluation open, its period whole and the scheme''s rater as it was');

SELECT * FROM finish();
ROLLBACK;
