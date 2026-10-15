-- #1643: a Critical Tasks library move changes every affected sort order in one
-- command, or none of them, for an Organization-scoped configurator only.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('c1643066-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act(actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', CASE WHEN actor IS NULL THEN '' ELSE pg_temp.id(actor)::text END, true);
END; $$;
CREATE FUNCTION pg_temp.change(task integer, expected integer, target integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('id', pg_temp.id(task), 'expected_sort_order', expected, 'sort_order', target);
$$;
CREATE FUNCTION pg_temp.move_sql(org integer, changes jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.reorder_ict_tasks(%L, %L)', pg_temp.id(org), changes);
$$;
CREATE FUNCTION pg_temp.swap() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_array(pg_temp.change(302, 1, 0), pg_temp.change(301, 0, 1));
$$;
CREATE FUNCTION pg_temp.tasks(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.ict_tasks t WHERE t.organization_id = pg_temp.id(org);
$$;
CREATE FUNCTION pg_temp.orders(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_object_agg(task_code, sort_order), '{}') FROM public.ict_tasks WHERE organization_id = pg_temp.id(org);
$$;
CREATE FUNCTION pg_temp.denied(actor integer, label text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.act(actor);
  RETURN throws_ok(pg_temp.move_sql(101, pg_temp.swap()), '42501',
    'Critical Tasks library configuration is not allowed', label || ' cannot move Alpha tasks');
END; $$;
CREATE TEMP TABLE snapshots(label text PRIMARY KEY, value jsonb);
CREATE TEMP TABLE returned(id uuid, task_code text, sort_order integer, organization_id uuid);
GRANT ALL ON snapshots, returned TO authenticated;

INSERT INTO auth.users (id, email)
SELECT pg_temp.id(n), 'ict-reorder-' || n || '@example.test' FROM generate_series(1, 8) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
(pg_temp.id(101), 'Reorder Alpha', pg_temp.id(1)),
(pg_temp.id(102), 'Reorder Bravo', pg_temp.id(6));
INSERT INTO public.groups (id, organization_id, name) VALUES (pg_temp.id(201), pg_temp.id(101), 'Scoped Group');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT org, pg_temp.id(actor), 'member'::public.organization_role, 'viewer',
  jsonb_build_object('criticalTasks', capability, 'training', 'configure'),
  scope_kind, CASE WHEN scope_kind = 'groups' THEN ARRAY[pg_temp.id(201)] ELSE ARRAY[]::uuid[] END
FROM (VALUES
  (pg_temp.id(101), 1, 'configure', 'organization'),
  (pg_temp.id(101), 2, 'view', 'organization'),
  (pg_temp.id(101), 3, 'operate', 'organization'),
  (pg_temp.id(101), 4, 'configure', 'groups'),
  (pg_temp.id(102), 6, 'configure', 'organization'),
  (pg_temp.id(101), 7, 'configure', 'organization'),
  (pg_temp.id(101), 8, 'none', 'organization')
) AS actors(org, actor, capability, scope_kind);
INSERT INTO public.user_suspensions (user_id, suspended_by, reason) VALUES (pg_temp.id(7), pg_temp.id(1), 'synthetic');
INSERT INTO public.ict_tasks (id, organization_id, task_code, title, sort_order, archived_at) VALUES
(pg_temp.id(301), pg_temp.id(101), 'A', 'Alpha one', 0, NULL),
(pg_temp.id(302), pg_temp.id(101), 'B', 'Alpha two', 1, NULL),
(pg_temp.id(303), pg_temp.id(101), 'C', 'Alpha three', 1, NULL),
(pg_temp.id(304), pg_temp.id(101), 'OLD', 'Alpha archived', 2, '2026-01-01T00:00:00Z'),
(pg_temp.id(311), pg_temp.id(102), 'BRAVO', 'Bravo one', 0, NULL);

SELECT ok(NOT has_function_privilege('anon', 'public.reorder_ict_tasks(uuid, jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.reorder_ict_tasks(uuid, jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.reorder_ict_tasks(uuid, jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.reorder_ict_tasks(uuid, jsonb)', 'EXECUTE'),
  'only authenticated can execute the move');
SELECT is((SELECT jsonb_build_array(prosecdef, proconfig) FROM pg_proc
  WHERE proname = 'reorder_ict_tasks' AND pronamespace = 'public'::regnamespace),
  '[false, ["search_path=\"\""]]', 'the move runs as the invoker with an empty search path');

INSERT INTO snapshots VALUES ('before-denials', jsonb_build_object('a', pg_temp.tasks(101), 'b', pg_temp.tasks(102)));
SELECT pg_temp.denied(actor, label)
FROM (VALUES
  (NULL::integer, 'no signed-in user'),
  (2, 'a Critical Tasks viewer'),
  (3, 'a Critical Tasks operator'),
  (4, 'a Group-scoped configurator'),
  (5, 'a non-member'),
  (6, 'a foreign Organization configurator'),
  (7, 'a suspended configurator'),
  (8, 'a Training configurator without Critical Tasks access')
) AS denied(actor, label);
SELECT pg_temp.act(6);
SELECT throws_ok(pg_temp.move_sql(102, jsonb_build_array(pg_temp.change(301, 0, 5))), 'P0002', 'Task not found',
  'a Bravo configurator cannot reach an Alpha task through Bravo');
RESET ROLE;
UPDATE public.organizations SET suspended_at = now() WHERE id = pg_temp.id(101);
SELECT pg_temp.act(1);
SELECT throws_ok(pg_temp.move_sql(101, pg_temp.swap()), '42501', 'Critical Tasks library configuration is not allowed',
  'a configurator of a suspended Organization cannot move tasks');
RESET ROLE;
UPDATE public.organizations SET suspended_at = NULL WHERE id = pg_temp.id(101);
SELECT is(jsonb_build_object('a', pg_temp.tasks(101), 'b', pg_temp.tasks(102)),
  (SELECT value FROM snapshots WHERE label = 'before-denials'), 'denied moves change no task in either Organization');

SELECT pg_temp.act(1);
INSERT INTO returned SELECT id, task_code, sort_order, organization_id FROM public.reorder_ict_tasks(pg_temp.id(101), pg_temp.swap());
RESET ROLE;
SELECT results_eq($$SELECT task_code, sort_order, organization_id FROM returned ORDER BY id$$,
  $$VALUES ('A'::text, 1, pg_temp.id(101)), ('B', 0, pg_temp.id(101))$$, 'the move returns exactly the two saved tasks');
SELECT is(pg_temp.orders(101), '{"A": 1, "B": 0, "C": 1, "OLD": 2}', 'both sort orders change and nothing else does');
SELECT is((SELECT jsonb_agg(jsonb_build_array(title, archived_at) ORDER BY id) FROM public.ict_tasks WHERE organization_id = pg_temp.id(101)),
  (SELECT jsonb_agg(jsonb_build_array(t->'title', t->'archived_at') ORDER BY t->>'id')
    FROM snapshots, jsonb_array_elements(value->'a') AS t WHERE label = 'before-denials'), 'every other field is kept');
SELECT is(pg_temp.tasks(102), (SELECT value->'b' FROM snapshots WHERE label = 'before-denials'), 'Bravo is untouched');

SELECT pg_temp.act(1);
SELECT throws_ok(pg_temp.move_sql(101, pg_temp.swap()), 'PT409', 'Task order changed',
  'repeating the move is refused instead of moving the tasks back');
SELECT throws_ok(pg_temp.move_sql(101, jsonb_build_array(pg_temp.change(303, 1, 2), pg_temp.change(301, 0, 3))), 'PT409',
  'Task order changed', 'one stale expectation refuses the whole move');
RESET ROLE;
SELECT is(pg_temp.orders(101), '{"A": 1, "B": 0, "C": 1, "OLD": 2}', 'refused moves leave the saved order');

SELECT pg_temp.act(1);
SELECT throws_ok(pg_temp.move_sql(101, jsonb_build_array(pg_temp.change(303, 1, 3), pg_temp.change(304, 2, 0))), 'P0002',
  'Task not found', 'an archived task cannot be moved, and its companion change rolls back');
SELECT throws_ok(pg_temp.move_sql(101, jsonb_build_array(pg_temp.change(303, 1, 3), pg_temp.change(311, 0, 1))), 'P0002',
  'Task not found', 'a foreign task cannot be moved through Alpha');
SELECT throws_ok(pg_temp.move_sql(101, jsonb_build_array(pg_temp.change(303, 1, 3), pg_temp.change(399, 0, 1))), 'P0002',
  'Task not found', 'a missing task cannot be moved');
RESET ROLE;
SELECT is(pg_temp.orders(101), '{"A": 1, "B": 0, "C": 1, "OLD": 2}', 'unavailable targets change nothing');

SELECT pg_temp.act(1);
SELECT throws_ok(pg_temp.move_sql(101, payload), '22023', 'Invalid task order', label)
FROM (VALUES
  ('null'::jsonb, 'a null payload is invalid'),
  ('{}', 'an object payload is invalid'),
  ('[]', 'an empty move is invalid'),
  ('[1]', 'a non-object change is invalid'),
  (jsonb_build_array(pg_temp.change(303, 1, 3) - 'sort_order'), 'a change without a target order is invalid'),
  (jsonb_build_array(pg_temp.change(303, 1, 3) || '{"id": 7}'), 'a numeric task id is invalid'),
  (jsonb_build_array(pg_temp.change(303, 1, -1)), 'a negative order is invalid'),
  (jsonb_build_array(pg_temp.change(303, 1, 3), pg_temp.change(303, 1, 4)), 'moving a task twice is invalid'),
  ((SELECT jsonb_agg(pg_temp.change(303, n, n + 1)) FROM generate_series(1, 1001) AS n), 'more than 1000 participants is invalid')
) AS invalid(payload, label);
SELECT throws_ok(pg_temp.move_sql(101, jsonb_build_array(pg_temp.change(303, 1, 3) || '{"sort_order": 1.5}')), '22P02', NULL,
  'a fractional order is invalid');
SELECT throws_ok(pg_temp.move_sql(101, jsonb_build_array(pg_temp.change(303, 1, 3) || '{"id": "not-a-uuid"}')), '22P02', NULL,
  'a malformed task id is invalid');
RESET ROLE;
SELECT is(pg_temp.orders(101), '{"A": 1, "B": 0, "C": 1, "OLD": 2}', 'invalid moves change nothing');

SELECT pg_temp.act(1);
SELECT is((SELECT count(*)::integer FROM public.reorder_ict_tasks(pg_temp.id(101),
  jsonb_build_array(pg_temp.change(301, 1, 2), pg_temp.change(303, 1, 2)))), 2,
  'tasks that share a sort order can be separated in one move');
RESET ROLE;
SELECT is(pg_temp.orders(101), '{"A": 2, "B": 0, "C": 2, "OLD": 2}', 'the separated order is saved');

INSERT INTO public.ict_tasks (id, organization_id, task_code, title, sort_order, updated_at)
VALUES (pg_temp.id(305), pg_temp.id(101), 'GUARD', 'Untouched boundary', 10, '2020-01-01T00:00:00Z');
INSERT INTO snapshots VALUES ('guard-before', (SELECT to_jsonb(t) FROM public.ict_tasks t WHERE id = pg_temp.id(305)));
TRUNCATE returned;
SELECT pg_temp.act(1);
INSERT INTO returned SELECT id, task_code, sort_order, organization_id
FROM public.reorder_ict_tasks(pg_temp.id(101), jsonb_build_array(pg_temp.change(301, 2, 3), pg_temp.change(305, 10, 10)));
RESET ROLE;
SELECT results_eq($$SELECT task_code, sort_order FROM returned ORDER BY id$$,
  $$VALUES ('A'::text, 3), ('GUARD', 10)$$, 'the acknowledgement contains the changed row and unchanged guard');
SELECT is((SELECT to_jsonb(t) FROM public.ict_tasks t WHERE id = pg_temp.id(305)),
  (SELECT value FROM snapshots WHERE label = 'guard-before'), 'a mixed move preserves the entire guard row including updated_at');

SELECT pg_temp.act(1);
SELECT is((SELECT count(*)::integer FROM public.reorder_ict_tasks(pg_temp.id(101),
  jsonb_build_array(pg_temp.change(305, 10, 10)))), 1, 'a guard-only command acknowledges its participant');
SELECT throws_ok(pg_temp.move_sql(101, jsonb_build_array(pg_temp.change(303, 2, 5), pg_temp.change(305, 9, 9))),
  'PT409', 'Task order changed', 'a stale unchanged boundary refuses its companion change');
SELECT throws_ok(pg_temp.move_sql(101, jsonb_build_array(pg_temp.change(303, 2, 5), pg_temp.change(304, 2, 2))),
  'P0002', 'Task not found', 'an archived guard refuses its companion change');
SELECT throws_ok(pg_temp.move_sql(101, jsonb_build_array(pg_temp.change(303, 2, 5), pg_temp.change(311, 0, 0))),
  'P0002', 'Task not found', 'a foreign guard refuses its companion change');
SELECT throws_ok(pg_temp.move_sql(101, jsonb_build_array(pg_temp.change(303, 2, 5), pg_temp.change(399, 0, 0))),
  'P0002', 'Task not found', 'a missing guard refuses its companion change');
SELECT throws_ok(pg_temp.move_sql(101, (SELECT jsonb_agg(pg_temp.change(n, 0, 0)) FROM generate_series(1000, 2000) AS n)),
  '22023', 'Invalid task order', '1001 guard participants are invalid before row lookup');
SELECT throws_ok(pg_temp.move_sql(101, jsonb_build_array(pg_temp.change(305, 10, 10) || '{"sort_order": 2147483648}')),
  '22003', NULL, 'a target above intmax is invalid');
SELECT throws_ok(pg_temp.move_sql(101, jsonb_build_array(pg_temp.change(305, 10, 10) || '{"expected_sort_order": 2147483648}')),
  '22003', NULL, 'an expectation above intmax is invalid');
RESET ROLE;
SELECT is((SELECT to_jsonb(t) FROM public.ict_tasks t WHERE id = pg_temp.id(305)),
  (SELECT value FROM snapshots WHERE label = 'guard-before'), 'guard-only and refused commands preserve the guard timestamp');
SELECT is(pg_temp.orders(101), '{"A": 3, "B": 0, "C": 2, "OLD": 2, "GUARD": 10}',
  'refused guard commands leave every order untouched');

INSERT INTO public.ict_tasks (id, organization_id, task_code, title, sort_order)
SELECT pg_temp.id(n), pg_temp.id(101), 'BOUNDED-' || n, 'Bounded participant', 0 FROM generate_series(1000, 1999) AS n;
SELECT pg_temp.act(1);
SELECT is((SELECT count(*)::integer FROM public.reorder_ict_tasks(pg_temp.id(101),
  (SELECT jsonb_agg(pg_temp.change(n, 0, CASE WHEN n = 1000 THEN 2147483647 ELSE 0 END))
   FROM generate_series(1000, 1999) AS n))), 1000, '1000 participants including 999 guards and an intmax change are acknowledged');
RESET ROLE;
SELECT is((SELECT sort_order FROM public.ict_tasks WHERE id = pg_temp.id(1000)), 2147483647, 'intmax is saved without truncation');
SELECT is((SELECT count(*)::integer FROM public.ict_tasks WHERE id BETWEEN pg_temp.id(1001) AND pg_temp.id(1999) AND sort_order = 0),
  999, 'every guard in the bounded command keeps its value');

SELECT * FROM finish();
ROLLBACK;
