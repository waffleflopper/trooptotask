-- A rating scheme stays listed until an Evals operator archives it, whatever step its Evaluations have reached, and
-- an open Evaluation under an archived scheme stays on the tracker until it is completed. Every call below is made as
-- an ordinary signed-in member; fixtures are written before the signed-in role is taken.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('e7c30000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
-- A rated Person with a listed scheme and one Evaluation that is not tracked; returns the Evaluation.
CREATE FUNCTION pg_temp.new_entry(p_person uuid DEFAULT NULL, p_start date DEFAULT '2030-01-01',
  p_end date DEFAULT '2030-12-31') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_person uuid := COALESCE(p_person, gen_random_uuid());
  v_scheme uuid := gen_random_uuid();
  v_id uuid := gen_random_uuid();
BEGIN
  IF p_person IS NULL THEN
    INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug)
    VALUES (v_person, pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Rated', 'Able', 'membership-' || v_person);
  END IF;
  INSERT INTO public.rating_schemes (id, organization_id, rated_person_id, eval_type, rater_person_id, senior_rater_name)
  VALUES (v_scheme, pg_temp.id('101'), v_person, 'NCOER', pg_temp.id('302'), 'COL Senior');
  INSERT INTO public.evaluations (id, organization_id, rating_scheme_id, rated_person_id, eval_type, rating_period_start,
    rating_period_end, report_type)
  VALUES (v_id, pg_temp.id('101'), v_scheme, v_person, 'NCOER', p_start, p_end, 'AN');
  RETURN v_id;
END;
$$;
CREATE FUNCTION pg_temp.scheme(p_evaluation uuid) RETURNS uuid LANGUAGE sql AS $$
  SELECT rating_scheme_id FROM public.evaluations WHERE id = p_evaluation;
$$;
CREATE FUNCTION pg_temp.stored(p_scheme uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT to_jsonb(s) - 'archived_by' FROM public.rating_schemes s WHERE s.id = p_scheme;
$$;
CREATE TEMP TABLE probe (label text PRIMARY KEY, entry uuid, result jsonb);
GRANT ALL ON probe TO authenticated;
CREATE FUNCTION pg_temp.f(p_label text) RETURNS uuid LANGUAGE sql AS $$
  SELECT entry FROM probe WHERE label = p_label;
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'membership-' || n || '@example.test', now()
FROM generate_series(1, 4) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Membership Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Membership Foreign', pg_temp.id('1'));
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
  (pg_temp.id('301'), pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Rated', 'Able', 'membership-rated'),
  (pg_temp.id('302'), pg_temp.id('101'), pg_temp.id('201'), 'SSG', 'First', 'Rater', 'membership-rater'),
  (pg_temp.id('303'), pg_temp.id('101'), pg_temp.id('201'), 'SFC', 'Next', 'Rater', 'membership-next'),
  (pg_temp.id('304'), pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Roster', 'Baker', 'membership-roster'),
  (pg_temp.id('305'), pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'New', 'Charlie', 'membership-new');

INSERT INTO probe (label, entry) VALUES
  ('open', pg_temp.new_entry()), ('completed', pg_temp.new_entry()), ('named', pg_temp.new_entry()),
  ('scope', pg_temp.new_entry()), ('changed', pg_temp.new_entry(NULL, '2032-01-01', '2032-12-31')),
  ('archived first', pg_temp.new_entry(NULL, '2033-01-01', '2033-12-31')), ('roster', pg_temp.new_entry(pg_temp.id('304')));

SELECT ok(NOT has_function_privilege('anon', 'public.set_rating_scheme_archived(uuid,uuid,boolean)', 'EXECUTE'),
  'signed-out callers cannot archive a rating scheme');
SELECT hasnt_column('public', 'evaluations', 'archived_at', 'an Evaluation has no archive state of its own');

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');

-- A member creates a scheme and starts its Evaluation; a Person has one listed scheme.
SELECT lives_ok(format($$ INSERT INTO public.rating_schemes (organization_id, rated_person_id, eval_type, rater_name)
    VALUES (%L, %L, 'OER', 'CPT Rater') $$, pg_temp.id('101'), pg_temp.id('305')),
  'an operator creates a rating scheme');
INSERT INTO probe (label, result) SELECT 'started', public.start_evaluation(pg_temp.id('101'), id, 'AN', '2030-01-01',
  '2030-12-31', false, 'First report') FROM public.rating_schemes WHERE rated_person_id = pg_temp.id('305');
SELECT results_eq(
  $$ SELECT p.result ->> 'created', e.workflow_status, e.eval_type, e.report_type, e.notes, e.chain_snapshot_at
     FROM probe p JOIN public.evaluations e ON e.id = (p.result #>> '{evaluation,id}')::uuid WHERE p.label = 'started' $$,
  $$ VALUES ('true'::text, 'drafting'::text, 'OER'::text, 'AN'::text, 'First report'::text, NULL::timestamptz) $$,
  'starting an Evaluation opens it at drafting with the scheme''s evaluation type and no signed chain');
SELECT throws_ok(format($$ INSERT INTO public.rating_schemes (organization_id, rated_person_id, eval_type)
    VALUES (%L, %L, 'OER') $$, pg_temp.id('101'), pg_temp.id('305')),
  '23505', NULL, 'a Person cannot have a second listed scheme');

-- Archive and restore, with the Evaluation open and then completed.
SELECT public.transition_evaluation(pg_temp.id('101'), pg_temp.f('open'), NULL, 'drafting');
SELECT public.transition_evaluation(pg_temp.id('101'), pg_temp.f('completed'), NULL, 'completed');
SELECT results_eq(
  $$ SELECT archived_at IS NULL, archived_by FROM public.rating_schemes
     WHERE id IN (pg_temp.scheme(pg_temp.f('open')), pg_temp.scheme(pg_temp.f('completed'))) $$,
  $$ VALUES (true, NULL::text), (true, NULL::text) $$,
  'a scheme with an open or completed Evaluation is listed');

UPDATE probe SET result = public.set_rating_scheme_archived(pg_temp.id('101'), pg_temp.scheme(entry), true) WHERE label = 'open';
SELECT is(result, jsonb_build_object('changed', true, 'ratingScheme', pg_temp.stored(pg_temp.scheme(entry))),
  'archiving returns the scheme as stored')
FROM probe WHERE label = 'open';
SELECT results_eq(
  $$ SELECT s.archived_at IS NOT NULL, s.archived_by, e.workflow_status
     FROM public.rating_schemes s JOIN public.evaluations e ON e.rating_scheme_id = s.id WHERE e.id = pg_temp.f('open') $$,
  $$ VALUES (true, pg_temp.id('2')::text, 'drafting'::text) $$,
  'archiving a scheme names the member and leaves its open Evaluation at its step');
SELECT throws_ok(format($$ SELECT public.start_evaluation(%L, %L, 'AN', '2031-01-01', '2031-12-31', true) $$,
    pg_temp.id('101'), pg_temp.scheme(pg_temp.f('open'))),
  '55000', 'The rating scheme is archived', 'an archived scheme starts no Evaluation');
SELECT is((public.set_rating_scheme_archived(pg_temp.id('101'), pg_temp.scheme(pg_temp.f('open')), true) ->> 'changed')::boolean,
  false, 'archiving an archived scheme again changes nothing');
UPDATE probe SET result = public.set_rating_scheme_archived(pg_temp.id('101'), pg_temp.scheme(entry), false) WHERE label = 'open';
SELECT is(result, jsonb_build_object('changed', true, 'ratingScheme', pg_temp.stored(pg_temp.scheme(entry))),
  'restoring returns the scheme listed again')
FROM probe WHERE label = 'open';
SELECT results_eq(
  $$ SELECT archived_at, archived_by FROM public.rating_schemes WHERE id = pg_temp.scheme(pg_temp.f('open')) $$,
  $$ VALUES (NULL::timestamptz, NULL::text) $$,
  'a restored scheme has no archive time or member');
SELECT is((public.set_rating_scheme_archived(pg_temp.id('101'), pg_temp.scheme(pg_temp.f('open')), false) ->> 'changed')::boolean,
  false, 'restoring a listed scheme changes nothing');

SELECT public.set_rating_scheme_archived(pg_temp.id('101'), pg_temp.scheme(pg_temp.f('completed')), true);
SELECT is((public.transition_evaluation(pg_temp.id('101'), pg_temp.f('completed'), 'completed', 'drafting') -> 'evaluation' ->> 'workflow_status'),
  'drafting', 'an Evaluation under an archived scheme still moves');
SELECT is((SELECT archived_at IS NOT NULL FROM public.rating_schemes WHERE id = pg_temp.scheme(pg_temp.f('completed'))),
  true, 'moving the Evaluation does not list its archived scheme again');

-- Restoring fails while the Person has another listed scheme.
SELECT lives_ok(format($$ INSERT INTO public.rating_schemes (organization_id, rated_person_id, eval_type)
    SELECT organization_id, rated_person_id, 'OER' FROM public.rating_schemes WHERE id = %L $$,
    pg_temp.scheme(pg_temp.f('completed'))),
  'a Person whose scheme is archived can be given a new scheme');
SELECT throws_ok(format($$ SELECT public.set_rating_scheme_archived(%L, %L, false) $$, pg_temp.id('101'),
    pg_temp.scheme(pg_temp.f('completed'))),
  '23505', 'This person already has a rating scheme', 'an archived scheme cannot be restored beside a listed one');

SELECT throws_ok(format($$ SELECT public.set_rating_scheme_archived(%L, %L, NULL) $$, pg_temp.id('101'),
    pg_temp.scheme(pg_temp.f('open'))), '22023', 'Choose whether to archive or restore the rating scheme',
  'an unnamed request is refused');

-- Direct writes to either archive column are refused, on update and on insert.
SELECT throws_ok(format($$ UPDATE public.rating_schemes SET archived_at = now() WHERE id = %L $$,
    pg_temp.scheme(pg_temp.f('open'))), '42501', NULL, 'an operator cannot write archived_at directly');
SELECT throws_ok(format($$ UPDATE public.rating_schemes SET archived_by = %L WHERE id = %L $$,
    pg_temp.id('1')::text, pg_temp.scheme(pg_temp.f('completed'))),
  '42501', NULL, 'an operator cannot name who archived a scheme');
SELECT throws_ok(format($$ INSERT INTO public.rating_schemes (organization_id, rated_person_id, eval_type, archived_by)
    VALUES (%L, %L, 'NCOER', %L) $$, pg_temp.id('101'), pg_temp.id('303'), pg_temp.id('1')::text), '42501', NULL,
  'an operator cannot create a scheme archived by someone');
SELECT is((SELECT count(*)::int FROM public.rating_schemes WHERE rated_person_id = pg_temp.id('303')), 0,
  'the refused inserts created nothing');

-- The first member to archive stays named when another member repeats it later.
SELECT public.set_rating_scheme_archived(pg_temp.id('101'), pg_temp.scheme(pg_temp.f('named')), true);
SELECT pg_temp.act_as('1');
SELECT public.set_rating_scheme_archived(pg_temp.id('101'), pg_temp.scheme(pg_temp.f('named')), true);
SELECT is((SELECT archived_by FROM public.rating_schemes WHERE id = pg_temp.scheme(pg_temp.f('named'))),
  pg_temp.id('2')::text, 'a repeated archive does not name a second member');
SELECT pg_temp.act_as('2');

-- Scope and access.
SELECT pg_temp.act_as('3');
SELECT throws_ok(format($$ SELECT public.set_rating_scheme_archived(%L, %L, true) $$, pg_temp.id('101'),
    pg_temp.scheme(pg_temp.f('scope'))), 'P0002', 'Rating scheme not found',
  'an operator outside the rated Person''s Group cannot find the scheme to archive it');
SELECT pg_temp.act_as('4');
SELECT throws_ok(format($$ SELECT public.set_rating_scheme_archived(%L, %L, true) $$, pg_temp.id('101'),
    pg_temp.scheme(pg_temp.f('scope'))), '42501', NULL, 'a view-only member cannot archive a scheme');
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT throws_ok(format($$ SELECT public.set_rating_scheme_archived(%L, %L, true) $$, pg_temp.id('101'),
    pg_temp.scheme(pg_temp.f('scope'))), 'P0002', 'Rating scheme not found', 'a request without a user finds nothing');
SELECT pg_temp.act_as('2');
SELECT throws_ok(format($$ SELECT public.set_rating_scheme_archived(%L, %L, true) $$, pg_temp.id('102'),
    pg_temp.scheme(pg_temp.f('scope'))), 'P0002', 'Rating scheme not found',
  'the scheme cannot be archived through another Organization');
SELECT throws_ok(format($$ SELECT public.set_rating_scheme_archived(%L, %L, true) $$, pg_temp.id('101'),
    gen_random_uuid()), 'P0002', 'Rating scheme not found', 'a scheme that does not exist cannot be archived');
SELECT is((SELECT archived_at FROM public.rating_schemes WHERE id = pg_temp.scheme(pg_temp.f('scope'))),
  NULL::timestamptz, 'denied calls left the scheme listed');

-- Change of rater keeps the scheme listed: the closed Evaluation keeps its chain, and the successor is the open one.
UPDATE probe SET result = public.change_evaluation_rater(pg_temp.id('101'), entry, '2032-06-15', pg_temp.id('303'), NULL)
WHERE label = 'changed';
SELECT results_eq(
  $$ SELECT e.workflow_status, e.snapshot_rater_person_id, s.archived_at, s.rater_person_id
     FROM public.evaluations e JOIN public.rating_schemes s ON s.id = e.rating_scheme_id WHERE e.id = pg_temp.f('changed') $$,
  $$ VALUES ('completed'::text, pg_temp.id('302'), NULL::timestamptz, pg_temp.id('303')) $$,
  'the closed Evaluation is completed with the old rater and its scheme stays listed with the new one');
SELECT is((SELECT workflow_status FROM public.evaluations WHERE id = (result #>> '{successor,id}')::uuid), 'drafting',
  'the successor is open on the same scheme')
FROM probe WHERE label = 'changed';

SELECT public.set_rating_scheme_archived(pg_temp.id('101'), pg_temp.scheme(pg_temp.f('archived first')), true);
SELECT throws_ok(format($$ SELECT public.change_evaluation_rater(%L, %L, '2033-06-15', %L, NULL) $$, pg_temp.id('101'),
    pg_temp.f('archived first'), pg_temp.id('303')), '55000', 'The rating scheme is archived',
  'an Evaluation under an archived scheme cannot change its rater');
SELECT results_eq(
  $$ SELECT e.workflow_status, e.rating_period_end, s.rater_person_id,
       (SELECT count(*) FROM public.evaluations o WHERE o.rating_scheme_id = e.rating_scheme_id)
     FROM public.evaluations e JOIN public.rating_schemes s ON s.id = e.rating_scheme_id WHERE e.id = pg_temp.f('archived first') $$,
  $$ VALUES (NULL::text, '2033-12-31'::date, pg_temp.id('302'), 1::bigint) $$,
  'the refused change left the Evaluation, its period and the scheme''s rater alone and opened no successor');

-- The tracker the Person's card and the roster read: a listed scheme's Evaluation, or an open one under an archived scheme.
CREATE FUNCTION pg_temp.roster_entries() RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.roster_signals(pg_temp.id('101'), '2030-06-01', '2029-06-01', ARRAY['evaluations'], ARRAY[pg_temp.id('304')])
    -> 'evaluations' -> 'entries';
$$;
SELECT is(pg_temp.roster_entries() -> 0 ->> 1, pg_temp.f('roster')::text,
  'a not-tracked Evaluation on a listed scheme is the Person''s active evaluation');
SELECT public.set_rating_scheme_archived(pg_temp.id('101'), pg_temp.scheme(pg_temp.f('roster')), true);
SELECT is(pg_temp.roster_entries(), '[]'::jsonb, 'a not-tracked Evaluation under an archived scheme is not active');
SELECT public.set_rating_scheme_archived(pg_temp.id('101'), pg_temp.scheme(pg_temp.f('roster')), false);
SELECT public.transition_evaluation(pg_temp.id('101'), pg_temp.f('roster'), NULL, 'drafting');
SELECT public.set_rating_scheme_archived(pg_temp.id('101'), pg_temp.scheme(pg_temp.f('roster')), true);
SELECT is(pg_temp.roster_entries() -> 0 ->> 1, pg_temp.f('roster')::text,
  'an open Evaluation stays active after its scheme is archived');
SELECT public.transition_evaluation(pg_temp.id('101'), pg_temp.f('roster'), 'drafting', 'completed');
SELECT is(pg_temp.roster_entries(), '[]'::jsonb, 'completing it takes it off the tracker');

-- The audit log names the member for each change.
RESET ROLE;
SELECT results_eq(
  $$ SELECT action, user_id, details -> 'change' FROM public.audit_logs
     WHERE org_id = pg_temp.id('101') AND resource_id = pg_temp.scheme(pg_temp.f('open'))
       AND action IN ('rating_scheme.archived', 'rating_scheme.restored') ORDER BY action $$,
  $$ VALUES ('rating_scheme.archived'::text, pg_temp.id('2'), NULL::jsonb),
    ('rating_scheme.restored'::text, pg_temp.id('2'), NULL::jsonb) $$,
  'archiving and restoring are recorded as their own entries with the member');
SELECT results_eq(
  $$ SELECT action, user_id, details -> 'change' FROM public.audit_logs
     WHERE org_id = pg_temp.id('101') AND resource_id IN (pg_temp.scheme(pg_temp.f('changed')), pg_temp.f('changed'))
       AND action IN ('rating_scheme.updated', 'evaluation.updated') ORDER BY action $$,
  $$ VALUES ('evaluation.updated'::text, pg_temp.id('2'),
    '{"periodEnd": {"from": "2032-12-31", "to": "2032-06-15"}, "reportType": {"from": "AN", "to": "CR"},
      "workflowStatus": {"from": null, "to": "completed"}}'::jsonb),
    ('rating_scheme.updated'::text, pg_temp.id('2'), '{"raters": true}'::jsonb) $$,
  'a change of rater records the closed Evaluation and the scheme''s new rater');
SELECT is((SELECT count(*)::int FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND action = 'evaluation.created'
    AND resource_id = (SELECT (result #>> '{successor,id}')::uuid FROM probe WHERE label = 'changed') AND user_id = pg_temp.id('2')),
  1, 'the successor is recorded as a new Evaluation by the member');

SELECT * FROM finish();
ROLLBACK;
