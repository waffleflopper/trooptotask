-- An Evaluation jumps to any present step, as an ordinary signed-in Evals operator.
-- Each refusals row names, for the evaluators an entry has and a group of steps it may sit at, the targets that are
-- "refused" (SQLSTATE 55000): the steps an absent evaluator leaves out, and Not tracked unless the entry is at drafting
-- or completed. Every other target moves, and the current step is "unchanged" (the call returns false). The same rows
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
CREATE FUNCTION pg_temp.new_entry(p_roles text, p_start date DEFAULT '2030-01-01', p_end date DEFAULT '2030-12-31')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rater_person_id,
    senior_rater_name, intermediate_rater_person_id, reviewer_person_id, reviewer_name, rating_period_start,
    rating_period_end, report_type, notes)
  VALUES (v_id, pg_temp.id('101'), pg_temp.id('301'), 'NCOER', pg_temp.id('302'), 'COL Senior',
    CASE WHEN p_roles IN ('both', 'legacy') THEN pg_temp.id('303') END,
    CASE WHEN p_roles = 'both' THEN pg_temp.id('303') END,
    CASE WHEN p_roles = 'reviewer' THEN 'MAJ Reviewer' END,
    p_start, p_end, 'AN', 'Kept notes');
  RETURN v_id;
END;
$$;
-- Puts an entry at a step by one jump; the legacy entry then loses its intermediate rater.
CREATE FUNCTION pg_temp.at_step(p_roles text, p_label text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := pg_temp.new_entry(p_roles);
BEGIN
  IF p_label <> 'not tracked' THEN
    PERFORM public.transition_rating_scheme_entry(pg_temp.id('101'), v_id, NULL, p_label);
  END IF;
  IF p_roles = 'legacy' THEN
    UPDATE public.rating_scheme_entries SET intermediate_rater_person_id = NULL, intermediate_rater_name = '  '
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;
-- Tries one move and undoes it, so every target is tried from the same starting step.
CREATE FUNCTION pg_temp.attempt(p_entry uuid, p_to text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (public.transition_rating_scheme_entry(pg_temp.id('101'), p_entry,
    (SELECT workflow_status FROM public.rating_scheme_entries WHERE id = p_entry), pg_temp.step(p_to)) ->> 'moved')::boolean THEN
    RETURN 'unchanged';
  END IF;
  RAISE EXCEPTION '%', COALESCE((SELECT workflow_status FROM public.rating_scheme_entries WHERE id = p_entry), 'not tracked')
    USING ERRCODE = 'RSL01';
EXCEPTION
  WHEN SQLSTATE '55000' THEN RETURN 'refused';
  WHEN SQLSTATE 'RSL01' THEN RETURN SQLERRM;
END;
$$;
CREATE TEMP TABLE refusals (roles text, from_steps text[], refused text[]);
CREATE TEMP TABLE matrix (roles text, from_step text, refused text[], entry uuid);
CREATE TEMP TABLE probe (entry uuid);
CREATE TEMP TABLE changed (entry uuid, successor uuid);
CREATE TEMP TABLE leap (entry uuid, successor uuid);
CREATE TEMP TABLE fresh (entry uuid);
CREATE TEMP TABLE jumped (entry uuid);
CREATE TEMP TABLE stale (entry uuid);
CREATE TEMP TABLE returned (label text, result jsonb);
GRANT ALL ON refusals, matrix, probe, changed, leap, fresh, jumped, stale, returned TO authenticated;

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
  (pg_temp.id('301'), pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Rated', 'Able', 'lifecycle-rated'),
  (pg_temp.id('302'), pg_temp.id('101'), pg_temp.id('201'), 'SSG', 'First', 'Rater', 'lifecycle-rater'),
  (pg_temp.id('303'), pg_temp.id('101'), pg_temp.id('201'), 'SFC', 'Next', 'Rater', 'lifecycle-next'),
  (pg_temp.id('305'), pg_temp.id('102'), NULL, 'SSG', 'Foreign', 'Rater', 'lifecycle-foreign');

SELECT ok(NOT has_function_privilege('anon', 'public.transition_rating_scheme_entry(uuid,uuid,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.change_rating_scheme_rater(uuid,uuid,date,uuid,text)', 'EXECUTE'),
  'signed-out callers cannot move an evaluation or change its rater');

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');

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
UPDATE matrix SET entry = pg_temp.at_step(roles, from_step);

SELECT is((SELECT count(*)::int FROM matrix m JOIN public.rating_scheme_entries r ON r.id = m.entry
    WHERE r.workflow_status IS NOT DISTINCT FROM pg_temp.step(m.from_step)), 40,
  'every starting step was reached by one jump');
SELECT is(pg_temp.attempt(m.entry, t.target),
    CASE WHEN t.target = m.from_step THEN 'unchanged' WHEN t.target = ANY (m.refused) THEN 'refused' ELSE t.target END,
    m.roles || ': ' || m.from_step || ' to ' || t.target)
FROM matrix m CROSS JOIN unnest(pg_temp.steps()) AS t(target)
ORDER BY m.roles, array_position(pg_temp.steps(), m.from_step), array_position(pg_temp.steps(), t.target);

INSERT INTO jumped SELECT pg_temp.at_step('none', 'sm-signed');
SELECT public.transition_rating_scheme_entry(pg_temp.id('101'), entry, 'sm-signed', 'drafting') FROM jumped;
SELECT is((SELECT workflow_status FROM public.rating_scheme_entries WHERE id = (SELECT entry FROM jumped)), 'drafting',
  'an entry every evaluator has signed goes back to drafting in one move');
SELECT public.transition_rating_scheme_entry(pg_temp.id('101'), entry, 'drafting', 'command-review') FROM jumped;
SELECT is((SELECT workflow_status FROM public.rating_scheme_entries WHERE id = (SELECT entry FROM jumped)), 'command-review',
  'an entry jumps into Command Review');
SELECT throws_ok(format($$ SELECT public.transition_rating_scheme_entry(%L, %L, 'command-review', 'with-reviewer') $$,
    pg_temp.id('101'), (SELECT entry FROM jumped)),
  '55000', 'An evaluation at command-review cannot move to with-reviewer', 'a jump to a step of an absent reviewer is refused');
SELECT throws_ok(format($$ SELECT public.transition_rating_scheme_entry(%L, %L, 'drafting', 'with-rater') $$,
    pg_temp.id('101'), (SELECT entry FROM jumped)),
  '55000', 'The evaluation is at command-review, not drafting', 'a jump from a step the entry has left is refused');
SELECT throws_ok(format($$ SELECT public.transition_rating_scheme_entry(%L, %L, 'drafting', 'signed') $$,
    pg_temp.id('101'), (SELECT entry FROM matrix WHERE roles = 'none' AND from_step = 'drafting')),
  '22023', 'Unknown evaluation step', 'an unknown step is rejected');

SELECT throws_ok(format($$ UPDATE public.rating_scheme_entries SET workflow_status = 'completed' WHERE id = %L $$,
    (SELECT entry FROM matrix WHERE roles = 'none' AND from_step = 'drafting')),
  '42501', NULL, 'an operator cannot write the step directly');
SELECT throws_ok(format($$ INSERT INTO public.rating_scheme_entries (organization_id, rated_person_id, eval_type,
    rating_period_start, rating_period_end, workflow_status) VALUES (%L, %L, 'NCOER', '2030-01-01', '2030-12-31', 'completed') $$,
    pg_temp.id('101'), pg_temp.id('301')),
  '42501', NULL, 'an operator cannot create an entry at a step');
SELECT is((SELECT workflow_status FROM public.rating_scheme_entries
    WHERE id = (SELECT entry FROM matrix WHERE roles = 'none' AND from_step = 'drafting')), 'drafting',
  'the refused writes left the entry at its step');

INSERT INTO stale SELECT pg_temp.new_entry('none');
SELECT public.transition_rating_scheme_entry(pg_temp.id('101'), entry, NULL, 'drafting') FROM stale;
SELECT public.transition_rating_scheme_entry(pg_temp.id('101'), entry, 'drafting', 'with-rater') FROM stale;
SELECT throws_ok(format($$ SELECT public.transition_rating_scheme_entry(%L, %L, NULL, 'drafting') $$,
    pg_temp.id('101'), (SELECT entry FROM stale)),
  '55000', 'The evaluation is at with-rater, not not tracked', 'a move from a step the entry has left is refused');
SELECT is((SELECT workflow_status FROM public.rating_scheme_entries WHERE id = (SELECT entry FROM stale)), 'with-rater',
  'the stale move kept the newer step');

INSERT INTO returned SELECT 'move', public.transition_rating_scheme_entry(pg_temp.id('101'), entry, 'with-rater', 'rater-signed') FROM stale;
INSERT INTO returned SELECT 'repeat', public.transition_rating_scheme_entry(pg_temp.id('101'), entry, 'with-rater', 'rater-signed') FROM stale;
SELECT is((SELECT result FROM returned WHERE label = 'move'),
  jsonb_build_object('moved', true, 'entry', (SELECT to_jsonb(r) FROM public.rating_scheme_entries r WHERE r.id = (SELECT entry FROM stale))),
  'a move returns the entry as it now stands');
SELECT is((SELECT result FROM returned WHERE label = 'repeat'),
  jsonb_build_object('moved', false, 'entry', (SELECT to_jsonb(r) FROM public.rating_scheme_entries r WHERE r.id = (SELECT entry FROM stale))),
  'repeating the move returns the same entry with moved false');
SELECT is((SELECT workflow_status FROM public.rating_scheme_entries WHERE id = (SELECT entry FROM stale)), 'rater-signed',
  'the repeated move left the entry where the first move put it');

-- Out of scope and view-only members.
INSERT INTO probe SELECT pg_temp.at_step('none', 'with-rater');
SELECT pg_temp.act_as('3');
SELECT throws_ok(format($$ SELECT public.transition_rating_scheme_entry(%L, %L, 'with-rater', 'rater-signed') $$, pg_temp.id('101'),
    (SELECT entry FROM probe)), 'P0002', 'Evaluation not found', 'an operator outside the rated Person''s Group cannot find it');
SELECT throws_ok(format($$ SELECT public.change_rating_scheme_rater(%L, %L, '2030-06-15', %L, NULL) $$, pg_temp.id('101'),
    (SELECT entry FROM probe), pg_temp.id('303')), 'P0002', 'Evaluation not found',
  'an operator outside the rated Person''s Group cannot change its rater');
SELECT pg_temp.act_as('4');
SELECT throws_ok(format($$ SELECT public.transition_rating_scheme_entry(%L, %L, 'with-rater', 'rater-signed') $$, pg_temp.id('101'),
    (SELECT entry FROM probe)), '42501', NULL, 'a view-only member cannot move an evaluation');
SELECT throws_ok(format($$ SELECT public.change_rating_scheme_rater(%L, %L, '2030-06-15', %L, NULL) $$, pg_temp.id('101'),
    (SELECT entry FROM probe), pg_temp.id('303')), '42501', NULL, 'a view-only member cannot change the rater');
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT throws_ok(format($$ SELECT public.transition_rating_scheme_entry(%L, %L, 'with-rater', 'rater-signed') $$, pg_temp.id('101'),
    (SELECT entry FROM probe)), 'P0002', 'Evaluation not found', 'a request without a user finds nothing');
SELECT pg_temp.act_as('2');
SELECT is((SELECT workflow_status FROM public.rating_scheme_entries WHERE id = (SELECT entry FROM probe)), 'with-rater',
  'denied calls left the entry where it was');

-- Change of rater.
INSERT INTO changed (entry) SELECT pg_temp.at_step('both', 'with-rater');
INSERT INTO returned SELECT 'change', public.change_rating_scheme_rater(pg_temp.id('101'), entry, '2030-06-15', pg_temp.id('303'), NULL)
FROM changed;
UPDATE changed SET successor = (SELECT (result -> 'successor' ->> 'id')::uuid FROM returned WHERE label = 'change');
SELECT is((SELECT result FROM returned WHERE label = 'change'),
    jsonb_build_object(
      'entry', (SELECT to_jsonb(r) FROM public.rating_scheme_entries r WHERE r.id = (SELECT entry FROM changed)),
      'successor', (SELECT to_jsonb(r) FROM public.rating_scheme_entries r WHERE r.id = (SELECT successor FROM changed))),
  'a change of rater returns the completed entry and its successor as stored');
SELECT results_eq(
  $$ SELECT rating_period_start, rating_period_end, report_type, workflow_status, rater_person_id, notes
     FROM public.rating_scheme_entries WHERE id = (SELECT entry FROM changed) $$,
  $$ VALUES ('2030-01-01'::date, '2030-06-15'::date, 'CR'::text, 'completed'::text, pg_temp.id('302'), 'Kept notes'::text) $$,
  'the current entry closes as a completed Change of Rater report through the change date');
SELECT results_eq(
  $$ SELECT organization_id, rated_person_id, eval_type, rater_person_id, rater_name, senior_rater_person_id,
       senior_rater_name, intermediate_rater_person_id, intermediate_rater_name, reviewer_person_id, reviewer_name,
       rating_period_start, rating_period_end, report_type, workflow_status, notes
     FROM public.rating_scheme_entries WHERE id = (SELECT successor FROM changed) $$,
  $$ VALUES (pg_temp.id('101'), pg_temp.id('301'), 'NCOER'::text, pg_temp.id('303'), NULL::text, NULL::uuid,
       'COL Senior'::text, pg_temp.id('303'), NULL::text, pg_temp.id('303'), NULL::text,
       '2030-06-16'::date, '2031-06-15'::date, 'AN'::text, NULL::text, NULL::text) $$,
  'the successor is an untracked Annual for the new rater from the next day, with the other evaluators kept');
SELECT is(public.change_rating_scheme_rater(pg_temp.id('101'), (SELECT entry FROM changed), '2030-06-15', pg_temp.id('303'), NULL),
  jsonb_build_object('entry', (SELECT to_jsonb(r) FROM public.rating_scheme_entries r WHERE r.id = (SELECT entry FROM changed)),
    'successor', (SELECT to_jsonb(r) FROM public.rating_scheme_entries r WHERE r.id = (SELECT successor FROM changed))),
  'replaying the change of rater returns the completed entry and the successor it opened');
SELECT is(public.change_rating_scheme_rater(pg_temp.id('101'), (SELECT entry FROM changed), '2030-06-14', pg_temp.id('303'), NULL),
  jsonb_build_object('entry', (SELECT to_jsonb(r) FROM public.rating_scheme_entries r WHERE r.id = (SELECT entry FROM changed)),
    'successor', NULL),
  'a different change of rater on the completed entry returns it with no successor');
SELECT is((SELECT count(*)::int FROM public.rating_scheme_entries WHERE rating_period_start = '2030-06-16'), 1,
  'repeating the change of rater opens no second successor');

INSERT INTO leap (entry) SELECT pg_temp.new_entry('none', '2027-03-01', '2028-03-31');
UPDATE leap SET successor = (public.change_rating_scheme_rater(pg_temp.id('101'), entry, '2028-02-28', NULL, ' SSG Named Rater ')
  -> 'successor' ->> 'id')::uuid;
SELECT results_eq(
  $$ SELECT rating_period_start, rating_period_end, rater_person_id, rater_name
     FROM public.rating_scheme_entries WHERE id = (SELECT successor FROM leap) $$,
  $$ VALUES ('2028-02-29'::date, '2029-02-28'::date, NULL::uuid, 'SSG Named Rater'::text) $$,
  'a successor from 29 February runs through 28 February the next year, for a new rater named outside the roster');
SELECT throws_ok(format($$ SELECT public.change_rating_scheme_rater(%L, %L, '2028-06-15', NULL, 'ssg named rater ') $$,
    pg_temp.id('101'), (SELECT successor FROM leap)),
  '22023', 'The new rater is already this evaluation''s rater', 'the current rater named outside the roster cannot replace themselves');
SELECT results_eq(
  $$ SELECT rating_period_end, report_type, workflow_status,
       (SELECT count(*)::int FROM public.rating_scheme_entries WHERE rating_period_start = '2028-06-16')
     FROM public.rating_scheme_entries WHERE id = (SELECT successor FROM leap) $$,
  $$ VALUES ('2029-02-28'::date, 'AN'::text, NULL::text, 0) $$,
  'the refused change of the named rater left the entry open and opened no successor');

INSERT INTO fresh SELECT pg_temp.new_entry('none');
SELECT throws_ok(format($$ SELECT public.change_rating_scheme_rater(%L, %L, %L, %L, NULL) $$, pg_temp.id('101'),
    (SELECT entry FROM fresh), d, pg_temp.id('303')),
  '22023', 'The last day with the current rater must fall within the rating period', 'a change on ' || d || ' is refused')
FROM unnest(ARRAY['2029-12-31', '2031-01-01']) AS d;
SELECT throws_ok(format($$ SELECT public.change_rating_scheme_rater(%L, %L, '2030-06-15', %L, %L) $$, pg_temp.id('101'),
    (SELECT entry FROM fresh), person, name),
  '22023', 'Choose one new rater', label)
FROM (VALUES (NULL, NULL, 'a change without a new rater is refused'),
  (NULL, '   ', 'a blank new rater name is refused'),
  (pg_temp.id('303')::text, 'SSG Both', 'a new rater given as both a Person and a name is refused')) AS c(person, name, label);
SELECT throws_ok(format($$ SELECT public.change_rating_scheme_rater(%L, %L, '2030-06-15', %L, NULL) $$, pg_temp.id('101'),
    (SELECT entry FROM fresh), pg_temp.id('302')),
  '22023', 'The new rater is already this evaluation''s rater', 'the current rater cannot replace themselves');
SELECT throws_ok(format($$ SELECT public.change_rating_scheme_rater(%L, %L, '2030-06-15', %L, NULL) $$, pg_temp.id('101'),
    (SELECT entry FROM fresh), pg_temp.id('305')),
  '23503', NULL, 'a new rater from another Organization is refused');
SELECT results_eq(
  $$ SELECT rating_period_end, report_type, workflow_status FROM public.rating_scheme_entries WHERE id = (SELECT entry FROM fresh) $$,
  $$ VALUES ('2030-12-31'::date, 'AN'::text, NULL::text) $$,
  'a refused change of rater leaves the entry open and its period whole');

SELECT * FROM finish();
ROLLBACK;
