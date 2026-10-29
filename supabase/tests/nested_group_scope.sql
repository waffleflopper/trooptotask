BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a510000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.ids(ns integer[]) RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg(pg_temp.id(n) ORDER BY ordinal), ARRAY[]::uuid[]) FROM unnest(ns) WITH ORDINALITY AS v(n, ordinal);
$$;
CREATE FUNCTION pg_temp.act(n integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(n)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(n), 'role', 'authenticated')::text, true);
$$;

INSERT INTO auth.users (id, email) SELECT pg_temp.id(n), 'nested-' || n || '@example.test'
FROM generate_series(1, 11) n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id(101), 'Nested scope', pg_temp.id(1)),
  (pg_temp.id(102), 'Other Organization', pg_temp.id(9));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.id(201), pg_temp.id(101), 'Platoon'),
  (pg_temp.id(206), pg_temp.id(101), 'Deleted grant'),
  (pg_temp.id(207), pg_temp.id(102), 'Foreign Group');
INSERT INTO public.groups (id, organization_id, parent_id, name, sort_order) VALUES
  (pg_temp.id(202), pg_temp.id(101), pg_temp.id(201), 'First Squad', 0),
  (pg_temp.id(203), pg_temp.id(101), pg_temp.id(201), 'Second Squad', 1);
INSERT INTO public.groups (id, organization_id, parent_id, name, sort_order) VALUES
  (pg_temp.id(204), pg_temp.id(101), pg_temp.id(202), 'Alpha Team', 0),
  (pg_temp.id(205), pg_temp.id(101), pg_temp.id(202), 'Bravo Team', 1);
INSERT INTO public.organization_memberships
  (organization_id, user_id, role, member_preset, access_scope_kind, access_scope_group_ids)
SELECT pg_temp.id(101), pg_temp.id(actor), 'member'::public.organization_role, 'editor', kind, pg_temp.ids(roots)
FROM (VALUES
  (2, 'organization', ARRAY[]::integer[]),
  (3, 'groups', ARRAY[201]),
  (4, 'groups', ARRAY[202]),
  (5, 'groups', ARRAY[204]),
  (6, 'groups', ARRAY[202,204]),
  (7, 'groups', ARRAY[]::integer[]),
  (8, 'groups', ARRAY[206]),
  (10, 'groups', ARRAY[202])
) v(actor, kind, roots);
INSERT INTO public.organization_memberships
  (organization_id, user_id, role, member_preset, access_scope_kind) VALUES
  (pg_temp.id(101), pg_temp.id(1), 'owner', 'editor', 'organization'),
  (pg_temp.id(102), pg_temp.id(9), 'member', 'editor', 'groups');
UPDATE public.organization_memberships SET access_scope_group_ids = ARRAY[pg_temp.id(207)]
WHERE organization_id = pg_temp.id(102) AND user_id = pg_temp.id(9);
INSERT INTO public.user_suspensions (user_id, suspended_by, reason)
VALUES (pg_temp.id(10), pg_temp.id(1), 'Synthetic suspension');
DELETE FROM public.groups WHERE id = pg_temp.id(206);

INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug)
SELECT pg_temp.id(n), pg_temp.id(101), pg_temp.id(g), 'SPC', 'Person', n::text, 'nested-' || n
FROM (VALUES (301,201),(302,202),(303,203),(304,204),(305,204),(306,204),(307,204),
  (308,205),(309,205),(310,205),(311,205),(312,NULL::integer)) p(n,g);
INSERT INTO public.status_types (id, organization_id, name) VALUES (pg_temp.id(501), pg_temp.id(101), 'Leave');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to) VALUES
  (pg_temp.id(502), pg_temp.id(101), 'Duty', 'D', 'personnel'),
  (pg_temp.id(503), pg_temp.id(101), 'Group duty', 'GD', 'group');
INSERT INTO public.training_types (id, organization_id, name) VALUES (pg_temp.id(504), pg_temp.id(101), 'Training');
INSERT INTO public.ict_tasks (id, organization_id, task_code, title) VALUES
  (pg_temp.id(505), pg_temp.id(101), 'NESTED', 'Critical Task');
INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES
  (pg_temp.id(506), pg_temp.id(101), 'Packet');
INSERT INTO public.availability_entries (organization_id, personnel_id, status_type_id, start_date, end_date)
SELECT pg_temp.id(101), pg_temp.id(n), pg_temp.id(501), '2030-01-01', '2030-01-02'
FROM generate_series(301,312) n;
INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id)
SELECT pg_temp.id(101), pg_temp.id(502), '2030-01-01'::date + n - 301, pg_temp.id(n)::text
FROM generate_series(301,312) n;
INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id)
SELECT pg_temp.id(101), pg_temp.id(503), '2030-01-01'::date + n - 201, pg_temp.id(n)::text
FROM generate_series(201,205) n;
INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id, completion_date)
SELECT pg_temp.id(101), pg_temp.id(n), pg_temp.id(504), '2030-01-01' FROM generate_series(301,312) n;
INSERT INTO public.personnel_ict_completions (organization_id, personnel_id, ict_task_id, completed_at, validation_method)
SELECT pg_temp.id(101), pg_temp.id(n), pg_temp.id(505), '2030-01-01', 'Practical Exercise' FROM generate_series(301,312) n;
INSERT INTO public.personnel_onboardings (organization_id, personnel_id, template_id)
SELECT pg_temp.id(101), pg_temp.id(n), pg_temp.id(506) FROM generate_series(301,312) n;
INSERT INTO public.rating_scheme_entries (organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end)
SELECT pg_temp.id(101), pg_temp.id(n), 'NCOER', '2030-01-01', '2030-12-31' FROM generate_series(301,312) n;
INSERT INTO public.calendar_taskings (id, organization_id, responsible_group_id, title, suspense_on, execution_starts_on, execution_ends_on)
SELECT pg_temp.id(n), pg_temp.id(101), pg_temp.id(g), 'Tasking ' || n, '2030-01-10', '2030-01-01', '2030-01-02'
FROM (VALUES (401,201),(402,202),(403,203),(404,204),(405,205),(406,NULL::integer)) t(n,g);

CREATE FUNCTION pg_temp.check_scope(actor integer, people integer[], groups integer[], taskings integer[])
RETURNS SETOF text LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  lane record;
  actual uuid[];
BEGIN
  PERFORM pg_temp.act(actor);
  RETURN NEXT is(current_user::text, 'authenticated', 'scope matrix uses an ordinary signed-in role');
  FOR lane IN SELECT * FROM (VALUES
    ('personnel','id'), ('availability_entries','personnel_id'),
    ('personnel_trainings','personnel_id'), ('personnel_ict_completions','personnel_id'),
    ('personnel_onboardings','personnel_id'), ('rating_scheme_entries','rated_person_id')
  ) v(table_name, id_column) LOOP
    EXECUTE format('SELECT coalesce(array_agg(%I ORDER BY %I), ARRAY[]::uuid[]) FROM public.%I WHERE organization_id = $1',
      lane.id_column, lane.id_column, lane.table_name) INTO actual USING pg_temp.id(101);
    RETURN NEXT is(actual, pg_temp.ids(people), 'actor ' || actor || ' reads the expected ' || lane.table_name);
  END LOOP;
  RETURN NEXT is((SELECT coalesce(array_agg(assignee_id::uuid ORDER BY assignee_id), ARRAY[]::uuid[])
    FROM public.daily_assignments WHERE organization_id = pg_temp.id(101) AND assignment_type_id = pg_temp.id(502)),
    pg_temp.ids(people), 'person-assigned Calendar rows follow coverage');
  RETURN NEXT is((SELECT coalesce(array_agg(assignee_id::uuid ORDER BY assignee_id), ARRAY[]::uuid[])
    FROM public.daily_assignments WHERE organization_id = pg_temp.id(101) AND assignment_type_id = pg_temp.id(503)),
    pg_temp.ids(groups), 'Group-assigned Calendar rows follow coverage');
  RETURN NEXT is((SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::uuid[])
    FROM public.groups WHERE organization_id = pg_temp.id(101)), pg_temp.ids(groups), 'catalog coverage reaches down only');
  RETURN NEXT is((SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::uuid[])
    FROM public.calendar_taskings WHERE organization_id = pg_temp.id(101)), pg_temp.ids(taskings), 'Taskings follow responsibility coverage');
  RETURN NEXT is((SELECT coalesce(array_agg(key::uuid ORDER BY key), ARRAY[]::uuid[])
    FROM jsonb_object_keys(public.calendar_tasking_workspace(pg_temp.id(101), '2030-01-01')->'taskings') key),
    pg_temp.ids(taskings), 'Tasking workspace uses the same coverage');
  IF actor BETWEEN 3 AND 8 THEN
    RETURN NEXT is((SELECT covered_group_ids FROM public.read_request_member_access(pg_temp.id(101))),
      pg_temp.ids(groups), 'admission returns exactly the covered Group ids once');
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT * FROM pg_temp.check_scope(1, ARRAY[301,302,303,304,305,306,307,308,309,310,311,312], ARRAY[201,202,203,204,205], ARRAY[401,402,403,404,405,406]);
SELECT * FROM pg_temp.check_scope(2, ARRAY[301,302,303,304,305,306,307,308,309,310,311,312], ARRAY[201,202,203,204,205], ARRAY[401,402,403,404,405,406]);
SELECT * FROM pg_temp.check_scope(3, ARRAY[301,302,303,304,305,306,307,308,309,310,311], ARRAY[201,202,203,204,205], ARRAY[401,402,403,404,405]);
SELECT * FROM pg_temp.check_scope(4, ARRAY[302,304,305,306,307,308,309,310,311], ARRAY[202,204,205], ARRAY[402,404,405]);
SELECT * FROM pg_temp.check_scope(5, ARRAY[304,305,306,307], ARRAY[204], ARRAY[404]);
SELECT * FROM pg_temp.check_scope(6, ARRAY[302,304,305,306,307,308,309,310,311], ARRAY[202,204,205], ARRAY[402,404,405]);
SELECT * FROM pg_temp.check_scope(7, ARRAY[]::integer[], ARRAY[]::integer[], ARRAY[]::integer[]);
SELECT * FROM pg_temp.check_scope(8, ARRAY[]::integer[], ARRAY[]::integer[], ARRAY[]::integer[]);
SELECT * FROM pg_temp.check_scope(9, ARRAY[]::integer[], ARRAY[]::integer[], ARRAY[]::integer[]);
SELECT * FROM pg_temp.check_scope(10, ARRAY[]::integer[], ARRAY[]::integer[], ARRAY[]::integer[]);
SELECT * FROM pg_temp.check_scope(11, ARRAY[]::integer[], ARRAY[]::integer[], ARRAY[]::integer[]);
SELECT pg_temp.act(10);
SELECT is((SELECT count(*)::integer FROM public.read_request_member_access(pg_temp.id(101))), 0, 'suspended admission exposes no grant');
SELECT pg_temp.act(9);
SELECT is((SELECT count(*)::integer FROM public.read_request_member_access(pg_temp.id(101))), 0, 'foreign admission exposes no grant');
SELECT results_eq($$SELECT access_scope_group_ids, covered_group_ids FROM public.read_request_member_access(pg_temp.id(102))$$,
  $$VALUES (pg_temp.ids(ARRAY[207]), pg_temp.ids(ARRAY[207]))$$, 'a flat Organization resolves coverage equal to its stored grant');
SELECT pg_temp.act(5);
SELECT results_eq($$SELECT parent_id, depth FROM public.groups WHERE id = pg_temp.id(204)$$,
  $$VALUES (pg_temp.id(202), 3)$$, 'team depth is true even when its ancestors are hidden');
SELECT throws_ok($$INSERT INTO public.groups (organization_id, name) VALUES (pg_temp.id(101), 'Denied')$$,
  '42501', NULL, 'a scoped Personnel configurer cannot create Groups');
SELECT throws_ok($$UPDATE public.calendar_taskings SET responsible_group_id = pg_temp.id(205) WHERE id = pg_temp.id(404)$$,
  '42501', NULL, 'Responsibility moves remain Organization-wide');

SELECT pg_temp.act(4);
SELECT lives_ok($$SELECT public.save_calendar_tasking_people(pg_temp.id(101), pg_temp.id(402), pg_temp.ids(ARRAY[302,304,308]), ARRAY[]::uuid[], false, 0)$$,
  'a squad operator picks its HQ and both teams');
SELECT is((SELECT count(*)::integer FROM public.calendar_tasking_participants WHERE tasking_id = pg_temp.id(402) AND review_since IS NULL),
  3, 'descendant picks start without Needs review');
SELECT throws_ok($$SELECT public.save_calendar_tasking_people(pg_temp.id(101), pg_temp.id(402), pg_temp.ids(ARRAY[301]), ARRAY[]::uuid[], false, 1)$$,
  '23514', NULL, 'a squad Tasking cannot pick from the platoon HQ');
SELECT is((SELECT count(*)::integer FROM public.calendar_tasking_advisories(pg_temp.id(101), pg_temp.id(402)) WHERE kind = 'availability'),
  9, 'advisories include all candidates in both teams');
UPDATE public.personnel SET group_id = pg_temp.id(205) WHERE id = pg_temp.id(304);
SELECT is((SELECT count(*)::integer FROM public.calendar_tasking_participants WHERE tasking_id = pg_temp.id(402) AND review_since IS NULL),
  3, 'moving between teams in the responsible squad keeps picks qualified');

SELECT pg_temp.act(1);
UPDATE public.groups SET parent_id = pg_temp.id(203) WHERE id = pg_temp.id(205);
SELECT pg_temp.act(4);
SELECT is((SELECT covered_group_ids FROM public.read_request_member_access(pg_temp.id(101))), pg_temp.ids(ARRAY[202,204]),
  'a reparent immediately changes request coverage');
SELECT is((SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::uuid[]) FROM public.personnel), pg_temp.ids(ARRAY[302,305,306,307]),
  'a reparent immediately changes Personnel RLS');
SELECT pg_temp.act(1);
SELECT is((SELECT count(*)::integer FROM public.calendar_tasking_participants WHERE tasking_id = pg_temp.id(402) AND review_since IS NOT NULL),
  2, 'a moved team puts its picks outside the responsible squad under review');
SELECT throws_ok($$UPDATE public.groups SET parent_id = pg_temp.id(204) WHERE id = pg_temp.id(201)$$,
  '22023', NULL, 'a move beneath a descendant rejects a cycle');
SELECT throws_ok($$INSERT INTO public.groups (organization_id, parent_id, name) VALUES (pg_temp.id(101), pg_temp.id(204), 'Fourth level')$$,
  '23514', NULL, 'a fourth level is rejected');
SELECT throws_ok($$UPDATE public.groups SET parent_id = pg_temp.id(202) WHERE id = pg_temp.id(203)$$,
  '23514', NULL, 'a move whose descendants exceed level three rolls back');
SELECT results_eq($$SELECT parent_id, depth FROM public.groups WHERE id = pg_temp.id(203)$$,
  $$VALUES (pg_temp.id(201), 2)$$, 'a rejected move keeps its old parent and depth');
SELECT is((SELECT path FROM public.groups WHERE id = pg_temp.id(205)), pg_temp.ids(ARRAY[201,203,205]),
  'a descendant depth failure retains the old descendant path too');
UPDATE public.groups SET path = ARRAY[pg_temp.id(203)] WHERE id = pg_temp.id(204);
SELECT is((SELECT path FROM public.groups WHERE id = pg_temp.id(204)), pg_temp.ids(ARRAY[201,202,204]),
  'a client-sent path is overwritten from the parent');
INSERT INTO public.groups (id, organization_id, name) VALUES (pg_temp.id(209), pg_temp.id(101), 'Other Platoon');
SELECT public.save_calendar_tasking_people(pg_temp.id(101), pg_temp.id(401), pg_temp.ids(ARRAY[305]), ARRAY[]::uuid[], false, 0);
UPDATE public.groups SET parent_id = pg_temp.id(209) WHERE id = pg_temp.id(202);
SELECT is((SELECT path FROM public.groups WHERE id = pg_temp.id(204)), pg_temp.ids(ARRAY[209,202,204]),
  'a non-leaf move cascades the new path to every descendant');
SELECT is((SELECT count(*)::integer FROM public.calendar_tasking_participants WHERE tasking_id = pg_temp.id(401) AND review_since IS NOT NULL),
  1, 'a non-leaf move reviews picks from descendant Groups that leave a responsible platoon');
SAVEPOINT return_to_responsibility;
UPDATE public.groups SET parent_id = pg_temp.id(201) WHERE id = pg_temp.id(202);
SELECT is((SELECT count(*)::integer FROM public.calendar_tasking_participants WHERE tasking_id = pg_temp.id(401) AND review_since IS NOT NULL),
  1, 'returning a Group to the responsible subtree does not clear Needs review');
ROLLBACK TO SAVEPOINT return_to_responsibility;
SELECT throws_ok($$INSERT INTO public.groups (organization_id, parent_id, name) VALUES (pg_temp.id(101), pg_temp.id(202), 'Alpha Team')$$,
  '23505', NULL, 'siblings cannot share a name');
SELECT lives_ok($$INSERT INTO public.groups (id, organization_id, parent_id, name) VALUES (pg_temp.id(208), pg_temp.id(101), pg_temp.id(203), 'Alpha Team')$$,
  'cousins may share a name');
SELECT throws_ok($$INSERT INTO public.groups (organization_id, name) VALUES (pg_temp.id(101), 'Platoon')$$,
  '23505', NULL, 'root names remain unique');
SELECT throws_ok($$INSERT INTO public.groups (organization_id, name) VALUES (pg_temp.id(101), 'Bad / name')$$,
  '23514', NULL, 'new names cannot use the path separator');
SELECT throws_ok($$INSERT INTO public.groups (organization_id, parent_id, name) VALUES (pg_temp.id(101), pg_temp.id(207), 'Cross Organization')$$,
  '23503', NULL, 'a parent must belong to the same Organization');

SELECT lives_ok($$SELECT public.set_group_order(pg_temp.id(101), pg_temp.ids(ARRAY[205,208]), pg_temp.ids(ARRAY[208,205]), pg_temp.id(203))$$,
  'ordering one sibling set succeeds');
SELECT results_eq($$SELECT id, sort_order FROM public.groups WHERE parent_id = pg_temp.id(203) ORDER BY sort_order$$,
  $$VALUES (pg_temp.id(205), 0), (pg_temp.id(208), 1)$$, 'only the chosen siblings receive the requested order');
SELECT throws_ok($$SELECT public.set_group_order(pg_temp.id(101), pg_temp.ids(ARRAY[204]), pg_temp.ids(ARRAY[205,208]), pg_temp.id(203))$$,
  '22023', NULL, 'a reorder cannot draw Groups from another parent');
SELECT throws_ok($$SELECT public.delete_group_with_reassignment(pg_temp.id(101), pg_temp.id(202), pg_temp.id(204))$$,
  '22023', NULL, 'subtree reassignment must target a Group outside the subtree');
SELECT throws_ok($$SELECT public.delete_group_with_reassignment(pg_temp.id(101), pg_temp.id(201), NULL)$$,
  '23503', NULL, 'a Tasking owned anywhere in the subtree blocks deletion');

INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.id(210), pg_temp.id(101), 'Delete root'), (pg_temp.id(213), pg_temp.id(101), 'Target');
INSERT INTO public.groups (id, organization_id, parent_id, name) VALUES (pg_temp.id(211), pg_temp.id(101), pg_temp.id(210), 'Delete child');
INSERT INTO public.groups (id, organization_id, parent_id, name) VALUES (pg_temp.id(212), pg_temp.id(101), pg_temp.id(211), 'Delete leaf');
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug)
SELECT pg_temp.id(n), pg_temp.id(101), pg_temp.id(g), 'SPC', 'Delete', n::text, 'nested-delete-' || n
FROM (VALUES (313,210),(314,211),(315,212)) p(n,g);
INSERT INTO public.user_pinned_groups (user_id, organization_id, group_id) VALUES (pg_temp.id(1), pg_temp.id(101), pg_temp.id(210));
SELECT is(public.delete_group_with_reassignment(pg_temp.id(101), pg_temp.id(210), pg_temp.id(213)), 3,
  'subtree delete moves all three levels of People to the target');
SELECT results_eq($$SELECT group_id FROM public.personnel WHERE id = ANY(pg_temp.ids(ARRAY[313,314,315]))$$,
  $$VALUES (pg_temp.id(213)), (pg_temp.id(213)), (pg_temp.id(213))$$, 'every Person keeps identity and the chosen target');
SELECT is((SELECT count(*)::integer FROM public.groups WHERE id = ANY(pg_temp.ids(ARRAY[210,211,212]))), 0,
  'the whole subtree is removed deepest first');
SELECT is((SELECT count(*)::integer FROM public.user_pinned_groups WHERE group_id = pg_temp.id(210)), 0,
  'subtree deletion cascades its pins');
INSERT INTO public.user_pinned_groups (user_id, organization_id, group_id) VALUES (pg_temp.id(1), pg_temp.id(101), pg_temp.id(213));
SELECT throws_ok($$INSERT INTO public.user_pinned_groups (user_id, organization_id, group_id) VALUES (pg_temp.id(1), pg_temp.id(101), pg_temp.id(202))$$,
  '23514', NULL, 'a sub-group cannot be pinned');
SELECT throws_ok($$UPDATE public.user_pinned_groups SET group_id = pg_temp.id(202) WHERE group_id = pg_temp.id(213)$$,
  '23514', NULL, 'a pin cannot be changed to a sub-group');
UPDATE public.groups SET parent_id = pg_temp.id(201) WHERE id = pg_temp.id(213);
SELECT is((SELECT count(*)::integer FROM public.user_pinned_groups WHERE group_id = pg_temp.id(213)), 0,
  'moving a pinned Group below a parent removes its pins');

SELECT * FROM finish();
ROLLBACK;
