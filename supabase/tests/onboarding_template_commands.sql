BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email)
SELECT ('e1643000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'template-commands-' || n || '@example.test'
FROM generate_series(1, 8) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
('e1643000-0000-4000-8000-000000000101', 'Commands Alpha', 'e1643000-0000-4000-8000-000000000001'),
('e1643000-0000-4000-8000-000000000102', 'Commands Bravo', 'e1643000-0000-4000-8000-000000000008');
INSERT INTO public.groups (id, organization_id, name) VALUES
('e1643000-0000-4000-8000-000000000201', 'e1643000-0000-4000-8000-000000000101', 'Scoped Group');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT org::uuid, ('e1643000-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer',
  jsonb_build_object('onboarding', capability, 'personnel', 'none', 'training', 'none', 'calendar', 'none'),
  scope_kind, CASE WHEN scope_kind = 'groups' THEN ARRAY['e1643000-0000-4000-8000-000000000201']::uuid[] ELSE ARRAY[]::uuid[] END
FROM (VALUES
  ('e1643000-0000-4000-8000-000000000101', 1, 'configure', 'organization'),
  ('e1643000-0000-4000-8000-000000000101', 3, 'view', 'organization'),
  ('e1643000-0000-4000-8000-000000000101', 4, 'operate', 'organization'),
  ('e1643000-0000-4000-8000-000000000101', 5, 'configure', 'groups'),
  ('e1643000-0000-4000-8000-000000000101', 7, 'configure', 'organization'),
  ('e1643000-0000-4000-8000-000000000102', 1, 'configure', 'organization'),
  ('e1643000-0000-4000-8000-000000000102', 8, 'configure', 'organization')
) AS actors(org, actor, capability, scope_kind);
INSERT INTO public.training_types (id, organization_id, name) VALUES
('e1643000-0000-4000-8000-000000000601', 'e1643000-0000-4000-8000-000000000101', 'Alpha Training');
INSERT INTO public.onboarding_templates (id, organization_id, name, description) VALUES
('e1643000-0000-4000-8000-000000000301', 'e1643000-0000-4000-8000-000000000101', 'Source', 'Source description'),
('e1643000-0000-4000-8000-000000000302', 'e1643000-0000-4000-8000-000000000101', 'Empty', NULL),
('e1643000-0000-4000-8000-000000000303', 'e1643000-0000-4000-8000-000000000101', 'Delete me', NULL),
('e1643000-0000-4000-8000-000000000304', 'e1643000-0000-4000-8000-000000000101', 'Source Copy', 'Already taken'),
('e1643000-0000-4000-8000-000000000305', 'e1643000-0000-4000-8000-000000000101', 'Fault source', NULL),
('e1643000-0000-4000-8000-000000000306', 'e1643000-0000-4000-8000-000000000101', 'Crowded', NULL),
('e1643000-0000-4000-8000-000000000311', 'e1643000-0000-4000-8000-000000000102', 'Foreign', NULL);
INSERT INTO public.onboarding_templates (organization_id, name)
SELECT 'e1643000-0000-4000-8000-000000000101', 'Crowded Copy' || CASE WHEN n = 1 THEN '' ELSE ' ' || n END
FROM generate_series(1, 999) AS n;
INSERT INTO public.onboarding_template_steps (
  id, organization_id, template_id, name, description, step_type, training_type_id, stages, sort_order
) VALUES
('e1643000-0000-4000-8000-000000000401', 'e1643000-0000-4000-8000-000000000101', 'e1643000-0000-4000-8000-000000000301', 'Orientation', 'Meet the team', 'checkbox', NULL, NULL, 20),
('e1643000-0000-4000-8000-000000000402', 'e1643000-0000-4000-8000-000000000101', 'e1643000-0000-4000-8000-000000000301', 'Paperwork', NULL, 'paperwork', NULL, '["Draft","Reviewed"]', 10),
('e1643000-0000-4000-8000-000000000403', 'e1643000-0000-4000-8000-000000000101', 'e1643000-0000-4000-8000-000000000301', 'Training', NULL, 'training', 'e1643000-0000-4000-8000-000000000601', NULL, 10),
('e1643000-0000-4000-8000-000000000404', 'e1643000-0000-4000-8000-000000000101', 'e1643000-0000-4000-8000-000000000303', 'Delete first', NULL, 'checkbox', NULL, NULL, 0),
('e1643000-0000-4000-8000-000000000405', 'e1643000-0000-4000-8000-000000000101', 'e1643000-0000-4000-8000-000000000303', 'Delete second', NULL, 'paperwork', NULL, '["Draft"]', 1),
('e1643000-0000-4000-8000-000000000406', 'e1643000-0000-4000-8000-000000000101', 'e1643000-0000-4000-8000-000000000305', 'Fine step', NULL, 'checkbox', NULL, NULL, 0),
('e1643000-0000-4000-8000-000000000407', 'e1643000-0000-4000-8000-000000000101', 'e1643000-0000-4000-8000-000000000305', 'Fault step', NULL, 'checkbox', NULL, NULL, 1),
('e1643000-0000-4000-8000-000000000411', 'e1643000-0000-4000-8000-000000000102', 'e1643000-0000-4000-8000-000000000311', 'Foreign step', NULL, 'checkbox', NULL, NULL, 0);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
('e1643000-0000-4000-8000-000000000501', 'e1643000-0000-4000-8000-000000000101', 'SPC', 'Packet', 'Person', 'template-commands-person');
INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, template_id, status) VALUES
('e1643000-0000-4000-8000-000000000701', 'e1643000-0000-4000-8000-000000000101', 'e1643000-0000-4000-8000-000000000501', 'e1643000-0000-4000-8000-000000000303', 'in_progress');
INSERT INTO public.onboarding_step_progress (
  id, organization_id, onboarding_id, template_step_id, step_name, step_type, stages, sort_order, completed, current_stage, notes
) VALUES
('e1643000-0000-4000-8000-000000000801', 'e1643000-0000-4000-8000-000000000101', 'e1643000-0000-4000-8000-000000000701', 'e1643000-0000-4000-8000-000000000404', 'Delete first', 'checkbox', NULL, 0, true, NULL,
 '[{"text":"Kept note","timestamp":"2030-01-01T00:00:00Z","userId":"e1643000-0000-4000-8000-000000000004"}]'),
('e1643000-0000-4000-8000-000000000802', 'e1643000-0000-4000-8000-000000000101', 'e1643000-0000-4000-8000-000000000701', 'e1643000-0000-4000-8000-000000000405', 'Delete second', 'paperwork', '["Draft"]', 1, false, 'Draft', '[]');
UPDATE public.onboarding_step_progress SET progress_changed_at = '2030-01-02T00:00:00Z'
WHERE id IN ('e1643000-0000-4000-8000-000000000801', 'e1643000-0000-4000-8000-000000000802');

CREATE FUNCTION pg_temp.act(actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', 'e1643000-0000-4000-8000-' || lpad(actor::text, 12, '0'), true);
END; $$;
CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('e1643000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.alpha_rows() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'templates', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.onboarding_templates t
      WHERE t.organization_id IN (pg_temp.id(101), pg_temp.id(102)) AND t.name NOT LIKE 'Crowded Copy%'),
    'steps', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.onboarding_template_steps s
      WHERE s.organization_id IN (pg_temp.id(101), pg_temp.id(102))),
    'packets', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.personnel_onboardings p
      WHERE p.organization_id = pg_temp.id(101)),
    'progress', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.onboarding_step_progress p
      WHERE p.organization_id = pg_temp.id(101)),
    'receipts', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.organization_id, r.user_id, r.request_id), '[]')
      FROM onboarding_private.template_duplicate_receipts r
      WHERE r.organization_id IN (pg_temp.id(101), pg_temp.id(102))));
$$;
CREATE TEMP TABLE results(label text PRIMARY KEY, value jsonb);
CREATE TEMP TABLE snapshots(label text PRIMARY KEY, value jsonb);
GRANT ALL ON results, snapshots TO authenticated;
INSERT INTO snapshots VALUES ('initial', pg_temp.alpha_rows());

SELECT pg_temp.act(1);
INSERT INTO results SELECT 'first', public.duplicate_onboarding_template(pg_temp.id(101), pg_temp.id(301), pg_temp.id(9001));
RESET ROLE;
SELECT is((SELECT value->'template'->>'name' FROM results WHERE label = 'first'), 'Source Copy 2',
  'an existing "Source Copy" moves the copy to the next free name');
SELECT is((SELECT value->'template'->>'description' FROM results WHERE label = 'first'), 'Source description',
  'the copy keeps the source description');
SELECT is((SELECT (value->>'created')::boolean FROM results WHERE label = 'first'), true, 'a fresh request creates');
SELECT results_eq($$
  SELECT s.name, s.description, s.step_type, s.training_type_id, s.stages, s.sort_order
  FROM public.onboarding_template_steps s JOIN results r ON r.label = 'first'
  WHERE s.template_id = (r.value->'template'->>'id')::uuid ORDER BY s.sort_order
$$, $$ VALUES
  ('Paperwork'::text, NULL::text, 'paperwork'::text, NULL::uuid, '["Draft","Reviewed"]'::jsonb, 0),
  ('Training', NULL, 'training', 'e1643000-0000-4000-8000-000000000601'::uuid, NULL, 1),
  ('Orientation', 'Meet the team', 'checkbox', NULL, NULL, 2)
$$, 'copied steps keep every field in source order (sort_order, id) with positions 0..n-1');
SELECT is((SELECT jsonb_agg(step->>'name' ORDER BY (step->>'sort_order')::integer)
  FROM results, jsonb_array_elements(value->'steps') step WHERE label = 'first'),
  '["Paperwork","Training","Orientation"]'::jsonb, 'the command returns the saved copy steps in order');
SELECT is((SELECT count(*)::integer FROM public.onboarding_template_steps s, results r
  WHERE r.label = 'first' AND s.template_id = (r.value->'template'->>'id')::uuid
    AND s.id IN (pg_temp.id(401), pg_temp.id(402), pg_temp.id(403))), 0, 'copied steps get new ids');
SELECT is((SELECT jsonb_build_object('t', jsonb_agg(to_jsonb(t))) FROM public.onboarding_templates t WHERE t.id = pg_temp.id(301)),
  (SELECT jsonb_build_object('t', jsonb_agg(t)) FROM snapshots, jsonb_array_elements(value->'templates') t
    WHERE label = 'initial' AND t->>'id' = 'e1643000-0000-4000-8000-000000000301'), 'the source template is unchanged');

SELECT pg_temp.act(1);
INSERT INTO results SELECT 'replay', public.duplicate_onboarding_template(pg_temp.id(101), pg_temp.id(301), pg_temp.id(9001));
RESET ROLE;
SELECT is((SELECT value FROM results WHERE label = 'replay'),
  (SELECT value || '{"created":false}' FROM results WHERE label = 'first'),
  'a replay returns the same copy and steps with created=false');
SELECT is((SELECT count(*)::integer FROM public.onboarding_templates WHERE organization_id = pg_temp.id(101) AND name LIKE 'Source Copy%'),
  2, 'the replay adds no template');
SELECT pg_temp.act(1);
SELECT throws_ok($$ SELECT public.duplicate_onboarding_template(pg_temp.id(101), pg_temp.id(302), pg_temp.id(9001)) $$,
  'OTD01', 'This duplicate request was made for another template', 'a request id reused for another source conflicts');

SELECT pg_temp.act(7);
INSERT INTO results SELECT 'other-actor', public.duplicate_onboarding_template(pg_temp.id(101), pg_temp.id(301), pg_temp.id(9001));
SELECT pg_temp.act(1);
INSERT INTO results SELECT 'other-org', public.duplicate_onboarding_template(pg_temp.id(102), pg_temp.id(311), pg_temp.id(9001));
RESET ROLE;
SELECT results_eq($$ SELECT label, value->'template'->>'name', (value->>'created')::boolean, jsonb_array_length(value->'steps')
  FROM results WHERE label IN ('other-actor', 'other-org') ORDER BY label $$,
  $$ VALUES ('other-actor'::text, 'Source Copy 3'::text, true, 3), ('other-org', 'Foreign Copy', true, 1) $$,
  'the same request id from another actor or Organization is a separate copy');

SELECT pg_temp.act(1);
INSERT INTO results SELECT 'empty', public.duplicate_onboarding_template(pg_temp.id(101), pg_temp.id(302), pg_temp.id(9002));
SELECT is(public.delete_onboarding_template(pg_temp.id(101), pg_temp.id(302)), true, 'the empty source is deleted');
INSERT INTO results SELECT 'empty-replay', public.duplicate_onboarding_template(pg_temp.id(101), pg_temp.id(302), pg_temp.id(9002));
RESET ROLE;
SELECT results_eq($$ SELECT label, value->'template'->>'name', value->'steps', (value->>'created')::boolean
  FROM results WHERE label IN ('empty', 'empty-replay') ORDER BY label $$,
  $$ VALUES ('empty'::text, 'Empty Copy'::text, '[]'::jsonb, true), ('empty-replay', 'Empty Copy', '[]', false) $$,
  'an empty source copies to an empty template, and its receipt replays after the source is gone');

SELECT pg_temp.act(1);
SELECT is(public.delete_onboarding_template(pg_temp.id(101), (SELECT (value->'template'->>'id')::uuid FROM results WHERE label = 'first')),
  true, 'the first copy is deleted');
SELECT throws_ok($$ SELECT public.duplicate_onboarding_template(pg_temp.id(101), pg_temp.id(301), pg_temp.id(9001)) $$,
  'OTD02', 'The copy from this request was deleted', 'an old retry after the copy was deleted resolves without a copy');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.onboarding_templates WHERE organization_id = pg_temp.id(101) AND name = 'Source Copy 2'),
  0, 'no replacement copy appears');
SELECT is((SELECT count(*)::integer FROM onboarding_private.template_duplicate_receipts
  WHERE organization_id = pg_temp.id(101) AND user_id = pg_temp.id(1) AND request_id = pg_temp.id(9001)),
  1, 'the receipt survives deletion of its copy');

SELECT pg_temp.act(1);
SELECT throws_ok($$ SELECT public.duplicate_onboarding_template(pg_temp.id(101), pg_temp.id(311), pg_temp.id(9003)) $$,
  'P0002', 'Onboarding template not found', 'a foreign source is not found');
SELECT throws_ok($$ SELECT public.duplicate_onboarding_template(pg_temp.id(101), pg_temp.id(399), pg_temp.id(9003)) $$,
  'P0002', 'Onboarding template not found', 'a missing source gets the identical result');
SELECT throws_ok($$ SELECT public.duplicate_onboarding_template(pg_temp.id(101), pg_temp.id(301), NULL) $$,
  '22023', 'Duplicating a template needs the template and a request id', 'a missing request id is rejected');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM onboarding_private.template_duplicate_receipts WHERE request_id = pg_temp.id(9003)),
  0, 'a not-found source leaves no receipt');

SELECT pg_temp.act(1);
INSERT INTO results SELECT 'crowded', public.duplicate_onboarding_template(pg_temp.id(101), pg_temp.id(306), pg_temp.id(9004));
RESET ROLE;
SELECT matches((SELECT value->'template'->>'name' FROM results WHERE label = 'crowded'), '^Crowded Copy [0-9a-f]{8}$',
  'names fall back to a random suffix after Copy 999');

CREATE FUNCTION public.t1643_fail_step() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.name = 'Fault step' AND NEW.template_id <> 'e1643000-0000-4000-8000-000000000305')
    OR (TG_OP = 'UPDATE' AND NEW.id = 'e1643000-0000-4000-8000-000000000403' AND NEW.sort_order = 2) THEN
    RAISE EXCEPTION 'synthetic template step failure' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER t1643_fail_step BEFORE INSERT OR UPDATE ON public.onboarding_template_steps
  FOR EACH ROW EXECUTE FUNCTION public.t1643_fail_step();
INSERT INTO snapshots VALUES ('before-faults', pg_temp.alpha_rows());
SELECT pg_temp.act(1);
SELECT throws_ok($$ SELECT public.duplicate_onboarding_template(pg_temp.id(101), pg_temp.id(305), pg_temp.id(9005)) $$,
  '23514', 'synthetic template step failure', 'the second copied step fails inside the command');
SELECT throws_ok($$ SELECT public.reorder_onboarding_template_steps(pg_temp.id(101), pg_temp.id(301),
    ARRAY[pg_temp.id(401), pg_temp.id(402), pg_temp.id(403)]) $$,
  '23514', 'synthetic template step failure', 'the last reordered row fails inside the command');
RESET ROLE;
DROP TRIGGER t1643_fail_step ON public.onboarding_template_steps;
CREATE FUNCTION public.t1643_fail_progress() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = 'e1643000-0000-4000-8000-000000000802' AND NEW.template_step_id IS NULL THEN
    RAISE EXCEPTION 'synthetic progress unlink failure' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER t1643_fail_progress BEFORE UPDATE ON public.onboarding_step_progress
  FOR EACH ROW EXECUTE FUNCTION public.t1643_fail_progress();
SELECT pg_temp.act(1);
SELECT throws_ok($$ SELECT public.delete_onboarding_template(pg_temp.id(101), pg_temp.id(303)) $$,
  '23514', 'synthetic progress unlink failure', 'unlinking the second progress row fails inside the delete cascade');
RESET ROLE;
DROP TRIGGER t1643_fail_progress ON public.onboarding_step_progress;
SELECT is(pg_temp.alpha_rows(), (SELECT value FROM snapshots WHERE label = 'before-faults'),
  'each failed command leaves every template, step, packet, progress and receipt row unchanged');

INSERT INTO snapshots VALUES ('before-reorder', pg_temp.alpha_rows());
SELECT pg_temp.act(1);
SELECT throws_ok(format('SELECT public.reorder_onboarding_template_steps(%L, %L, %L)', pg_temp.id(101), pg_temp.id(301), ids),
  'OTR01', 'Step order does not match the selected onboarding template', label)
FROM (VALUES
  (ARRAY[pg_temp.id(401), pg_temp.id(402)], 'a missing step conflicts'),
  (ARRAY[pg_temp.id(401), pg_temp.id(402), pg_temp.id(403), pg_temp.id(404)], 'a step from another template conflicts'),
  (ARRAY[pg_temp.id(401), pg_temp.id(402), pg_temp.id(411)], 'a foreign step conflicts'),
  (ARRAY[pg_temp.id(401), pg_temp.id(402), pg_temp.id(402)], 'a repeated step conflicts'),
  (ARRAY[pg_temp.id(401), pg_temp.id(402), pg_temp.id(403), pg_temp.id(403)], 'a repeated extra step conflicts'),
  (ARRAY[]::uuid[], 'an empty order for a template with steps conflicts')
) AS cases(ids, label);
SELECT throws_ok(format('SELECT public.reorder_onboarding_template_steps(%L, %L, %L)', pg_temp.id(101), pg_temp.id(301), ids),
  '22023', 'Reordering steps needs the template and its step ids', label)
FROM (VALUES
  (ARRAY[pg_temp.id(401), NULL, pg_temp.id(403)], 'a null step id is malformed'),
  (ARRAY[[pg_temp.id(401), pg_temp.id(402)], [pg_temp.id(403), pg_temp.id(404)]], 'a nested order is malformed'),
  (NULL::uuid[], 'a missing order is malformed')
) AS cases(ids, label);
SELECT throws_ok(format('SELECT public.reorder_onboarding_template_steps(%L, %L, %L)', pg_temp.id(101), template_id, ARRAY[]::uuid[]),
  'P0002', 'Onboarding template not found', label)
FROM (VALUES (pg_temp.id(311), 'a foreign template is not found'), (pg_temp.id(399), 'a missing template is not found')) AS cases(template_id, label);
SELECT throws_ok(format('SELECT public.reorder_onboarding_template_steps(%L, %L, %L)', pg_temp.id(101),
    (SELECT (value->'template'->>'id')::uuid FROM results WHERE label = 'empty'), ARRAY[pg_temp.id(401)]),
  'OTR01', 'Step order does not match the selected onboarding template', 'a step order for an empty template conflicts');
RESET ROLE;
SELECT is(pg_temp.alpha_rows(), (SELECT value FROM snapshots WHERE label = 'before-reorder'),
  'rejected orders change no row');
SELECT pg_temp.act(1);
SELECT is(public.reorder_onboarding_template_steps(pg_temp.id(101),
    (SELECT (value->'template'->>'id')::uuid FROM results WHERE label = 'empty'), ARRAY[]::uuid[]),
  '[]'::jsonb, 'an empty template accepts an empty order');
INSERT INTO results SELECT 'reordered', public.reorder_onboarding_template_steps(pg_temp.id(101), pg_temp.id(301),
  ARRAY[pg_temp.id(401), pg_temp.id(403), pg_temp.id(402)]);
RESET ROLE;
SELECT results_eq($$ SELECT step->>'id', (step->>'sort_order')::integer FROM results,
    jsonb_array_elements(value) WITH ORDINALITY AS rows(step, ordinal) WHERE label = 'reordered' ORDER BY ordinal $$,
  $$ VALUES ('e1643000-0000-4000-8000-000000000401'::text, 0), ('e1643000-0000-4000-8000-000000000403', 1),
    ('e1643000-0000-4000-8000-000000000402', 2) $$, 'a complete order is saved as 0..n-1 and returned in that order');
SELECT results_eq($$ SELECT id, sort_order FROM public.onboarding_template_steps WHERE template_id = pg_temp.id(301) ORDER BY sort_order $$,
  $$ VALUES (pg_temp.id(401), 0), (pg_temp.id(403), 1), (pg_temp.id(402), 2) $$, 'the saved positions match the order');

INSERT INTO snapshots VALUES ('before-delete', pg_temp.alpha_rows());
SELECT pg_temp.act(1);
SELECT is(public.delete_onboarding_template(pg_temp.id(101), pg_temp.id(303)), true, 'a configurator deletes the template');
SELECT is(public.delete_onboarding_template(pg_temp.id(101), pg_temp.id(303)), false, 'deleting it again reports nothing deleted');
SELECT is(public.delete_onboarding_template(pg_temp.id(101), pg_temp.id(311)), false, 'a foreign id deletes nothing');
SELECT is(public.delete_onboarding_template(pg_temp.id(101), pg_temp.id(399)), false, 'a missing id deletes nothing');
SELECT throws_ok($$ SELECT public.delete_onboarding_template(pg_temp.id(101), NULL) $$, '22023',
  'Deleting a template needs its id', 'a missing id is malformed');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.onboarding_template_steps WHERE template_id = pg_temp.id(303)), 0,
  'the template steps are deleted with it');
SELECT is((SELECT to_jsonb(p) FROM public.personnel_onboardings p WHERE id = pg_temp.id(701)),
  (SELECT p || '{"template_id":null}' FROM snapshots, jsonb_array_elements(value->'packets') p
    WHERE label = 'before-delete' AND p->>'id' = 'e1643000-0000-4000-8000-000000000701'),
  'the packet keeps every field except its template link');
SELECT is((SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.onboarding_step_progress p WHERE onboarding_id = pg_temp.id(701)),
  (SELECT jsonb_agg(p || '{"template_step_id":null}' ORDER BY p->>'id') FROM snapshots, jsonb_array_elements(value->'progress') p
    WHERE label = 'before-delete' AND p->>'onboarding_id' = 'e1643000-0000-4000-8000-000000000701'),
  'progress keeps names, order, completion, stage, notes and progress_changed_at, only unlinked');
SELECT is((SELECT jsonb_agg(t) FROM snapshots, jsonb_array_elements(value->'templates') t
    WHERE label = 'before-delete' AND t->>'organization_id' = 'e1643000-0000-4000-8000-000000000102'),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.onboarding_templates t WHERE organization_id = pg_temp.id(102)),
  'Bravo templates are unchanged');

INSERT INTO snapshots VALUES ('before-denied', pg_temp.alpha_rows());
CREATE FUNCTION pg_temp.denied(actor integer, command text, label text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.act(actor);
  RETURN throws_ok(command, '42501', 'Onboarding configuration is not allowed', label);
END; $$;
SELECT pg_temp.denied(actor, format(command, pg_temp.id(101), target, pg_temp.id(9100 + actor)),
  format('actor %s %s %s denied', actor, split_part(command, '(', 1), target))
FROM (VALUES (3), (4), (5), (6), (8)) AS actors(actor),
  (VALUES (pg_temp.id(301)), (pg_temp.id(311)), (pg_temp.id(399))) AS targets(target),
  (VALUES ('SELECT public.duplicate_onboarding_template(%L, %L, %L)'),
    ('SELECT public.reorder_onboarding_template_steps(%L, %L, ''{}''::uuid[])'),
    ('SELECT public.delete_onboarding_template(%L, %L)')) AS commands(command)
ORDER BY actor, target, command;
RESET ROLE;
SELECT is(pg_temp.alpha_rows(), (SELECT value FROM snapshots WHERE label = 'before-denied'),
  'View, Operate, Group-scoped Configure, non-members and other Organizations change nothing');

SELECT ok(has_function_privilege('authenticated', proc, 'EXECUTE') AND NOT has_function_privilege('anon', proc, 'EXECUTE')
    AND NOT has_function_privilege('service_role', proc, 'EXECUTE'), proc || ' executes for authenticated only')
FROM (VALUES ('public.duplicate_onboarding_template(uuid,uuid,uuid)'), ('public.reorder_onboarding_template_steps(uuid,uuid,uuid[])'),
  ('public.delete_onboarding_template(uuid,uuid)')) AS procs(proc);
SELECT ok(NOT has_function_privilege(role, proc, 'EXECUTE'), role || ' cannot run ' || proc)
FROM (VALUES ('onboarding_private.require_template_configuration(uuid)'), ('onboarding_private.admit_template_command(uuid)')) AS procs(proc),
  (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role);
SELECT ok(NOT has_table_privilege(role, 'onboarding_private.template_duplicate_receipts', privilege),
  role || ' has no ' || privilege || ' on receipts')
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role),
  (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS privileges(privilege);
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'onboarding_private.template_duplicate_receipts'::regclass),
  'receipts have row level security enabled');

DELETE FROM public.organizations WHERE id = pg_temp.id(102);
SELECT is((SELECT count(*)::integer FROM onboarding_private.template_duplicate_receipts WHERE organization_id = pg_temp.id(102)),
  0, 'Organization deletion removes its receipts');

SELECT * FROM finish();
ROLLBACK;
