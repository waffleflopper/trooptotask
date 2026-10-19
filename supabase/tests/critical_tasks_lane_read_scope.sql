-- Critical Tasks-only reads and active read models must not borrow Personnel RLS.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT ok(NOT has_function_privilege('authenticated', 'public.critical_tasks_personnel_scope_matches(uuid,uuid)', 'EXECUTE'),
          'private Personnel scope helper cannot be called through authenticated RPC');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
  WHERE p.oid IN (
    'public.latest_active_personnel_ict_completions(uuid,uuid[],uuid[])'::regprocedure,
    'public.active_personnel_ict_completion_trend(uuid,uuid[],uuid[])'::regprocedure
  ) AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
), 'Critical Tasks definer RPCs have no PUBLIC execute grant');

INSERT INTO auth.users (id, email)
SELECT ('b8000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'critical-scope-' || n || '@example.test'
FROM generate_series(1, 6) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
('b8000000-0000-4000-8000-000000000101', 'Critical Alpha', 'b8000000-0000-4000-8000-000000000001'),
('b8000000-0000-4000-8000-000000000102', 'Critical Bravo', 'b8000000-0000-4000-8000-000000000006');
INSERT INTO public.groups (id, organization_id, name) VALUES
('b8000000-0000-4000-8000-000000000201', 'b8000000-0000-4000-8000-000000000101', 'Alpha One'),
('b8000000-0000-4000-8000-000000000202', 'b8000000-0000-4000-8000-000000000101', 'Alpha Two');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) SELECT 'b8000000-0000-4000-8000-000000000101'::uuid,
  ('b8000000-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer', overrides::jsonb, scope_kind,
  CASE WHEN scope_kind = 'groups' AND actor <> 4
       THEN ARRAY['b8000000-0000-4000-8000-000000000201']::uuid[]
       ELSE ARRAY[]::uuid[] END
FROM (VALUES
  (1, '{"criticalTasks":"view","personnel":"none"}', 'groups'),
  (2, '{"criticalTasks":"operate","personnel":"none"}', 'groups'),
  (3, '{"criticalTasks":"view","personnel":"none"}', 'organization'),
  (4, '{"criticalTasks":"view","personnel":"none"}', 'groups'),
  (5, '{"criticalTasks":"none","personnel":"none"}', 'groups')
) AS actors(actor, overrides, scope_kind);
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES (
  'b8000000-0000-4000-8000-000000000102', 'b8000000-0000-4000-8000-000000000006',
  'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]
);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, mos, archived_at) VALUES
('b8000000-0000-4000-8000-000000000301', 'b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000201', 'SPC', 'Active', 'Alpha', 'critical-active', '68W', NULL),
('b8000000-0000-4000-8000-000000000302', 'b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000201', 'SPC', 'Archived', 'Alpha', 'critical-archived', '68W', '2026-01-01'),
('b8000000-0000-4000-8000-000000000303', 'b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000202', 'SPC', 'Other', 'Alpha', 'critical-other', '68W', NULL),
('b8000000-0000-4000-8000-000000000304', 'b8000000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Alpha', 'critical-unassigned', '68W', NULL),
('b8000000-0000-4000-8000-000000000305', 'b8000000-0000-4000-8000-000000000102', NULL, 'SPC', 'Other', 'Bravo', 'critical-bravo', '68W', NULL);
INSERT INTO public.ict_tasks (id, organization_id, task_code, title, mos, archived_at) VALUES
('b8000000-0000-4000-8000-000000000401', 'b8000000-0000-4000-8000-000000000101', 'A-001', 'Active task', ARRAY['68W'], NULL),
('b8000000-0000-4000-8000-000000000402', 'b8000000-0000-4000-8000-000000000101', 'A-002', 'Archived task', ARRAY['68W'], '2026-01-01'),
('b8000000-0000-4000-8000-000000000403', 'b8000000-0000-4000-8000-000000000102', 'B-001', 'Bravo task', ARRAY['68W'], NULL);
INSERT INTO public.personnel_ict_completions
  (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method) VALUES
('b8000000-0000-4000-8000-000000000501', 'b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000301', 'b8000000-0000-4000-8000-000000000401', '2026-06-01', 'Practical Exercise'),
('b8000000-0000-4000-8000-000000000502', 'b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000301', 'b8000000-0000-4000-8000-000000000401', '2026-07-01', 'Practical Exercise'),
('b8000000-0000-4000-8000-000000000503', 'b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000302', 'b8000000-0000-4000-8000-000000000401', '2026-06-01', 'Practical Exercise'),
('b8000000-0000-4000-8000-000000000504', 'b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000303', 'b8000000-0000-4000-8000-000000000401', '2026-06-01', 'Practical Exercise'),
('b8000000-0000-4000-8000-000000000505', 'b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000304', 'b8000000-0000-4000-8000-000000000401', '2026-06-01', 'Practical Exercise'),
('b8000000-0000-4000-8000-000000000506', 'b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000301', 'b8000000-0000-4000-8000-000000000402', '2026-06-01', 'Practical Exercise'),
('b8000000-0000-4000-8000-000000000507', 'b8000000-0000-4000-8000-000000000102', 'b8000000-0000-4000-8000-000000000305', 'b8000000-0000-4000-8000-000000000403', '2026-06-01', 'Practical Exercise');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b8000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'Critical Tasks-only viewer cannot SELECT Personnel');
SELECT is((SELECT count(*)::integer FROM public.personnel_ict_completions), 4, 'Group viewer sees own active and archived completions only');
SELECT is((SELECT count(*)::integer FROM public.latest_active_personnel_ict_completions('b8000000-0000-4000-8000-000000000101')), 1, 'latest RPC returns one active in-scope pair');
SELECT is((SELECT id FROM public.latest_active_personnel_ict_completions('b8000000-0000-4000-8000-000000000101')), 'b8000000-0000-4000-8000-000000000502'::uuid, 'latest RPC chooses newest completion');
SELECT is((SELECT count(*)::integer FROM public.active_personnel_ict_completion_trend('b8000000-0000-4000-8000-000000000101')), 2, 'trend RPC includes both active in-scope months');
SELECT is((SELECT completions FROM public.active_personnel_ict_completion_trend('b8000000-0000-4000-8000-000000000101') WHERE month = '2026-06'), 1, 'trend excludes archived Personnel and tasks');
SELECT is((SELECT count(*)::integer FROM public.latest_active_personnel_ict_completions('b8000000-0000-4000-8000-000000000102')), 0, 'foreign Organization RPC returns no rows');
SELECT throws_ok($$ INSERT INTO public.personnel_ict_completions (organization_id, personnel_id, ict_task_id, completed_at, validation_method) VALUES ('b8000000-0000-4000-8000-000000000101','b8000000-0000-4000-8000-000000000301','b8000000-0000-4000-8000-000000000401','2026-08-01','Practical Exercise') $$, '42501', NULL, 'view-only member cannot insert');

SELECT set_config('request.jwt.claim.sub', 'b8000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'Critical Tasks-only operator cannot SELECT Personnel');
SELECT lives_ok($$ UPDATE public.personnel_ict_completions SET notes = 'archived allowed' WHERE id = 'b8000000-0000-4000-8000-000000000503' $$, 'operator updates archived own-Group completion');
SELECT is((SELECT notes FROM public.personnel_ict_completions WHERE id = 'b8000000-0000-4000-8000-000000000503'), 'archived allowed', 'archived completion update persists in transaction');
SELECT lives_ok($$ UPDATE public.personnel_ict_completions SET notes = 'outside blocked' WHERE id IN ('b8000000-0000-4000-8000-000000000504','b8000000-0000-4000-8000-000000000505') $$, 'out-of-Group and unassigned updates affect no visible records');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.personnel_ict_completions WHERE notes = 'outside blocked'), 0, 'out-of-Group and unassigned rows remain unchanged');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ INSERT INTO public.personnel_ict_completions (organization_id, personnel_id, ict_task_id, completed_at, validation_method) VALUES ('b8000000-0000-4000-8000-000000000101','b8000000-0000-4000-8000-000000000304','b8000000-0000-4000-8000-000000000401','2026-08-01','Practical Exercise') $$, '42501', NULL, 'Group operator cannot insert unassigned completion');

SELECT set_config('request.jwt.claim.sub', 'b8000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_ict_completions), 6, 'Organization-scoped viewer sees own Group and unassigned completions');
SELECT is((SELECT count(*)::integer FROM public.latest_active_personnel_ict_completions('b8000000-0000-4000-8000-000000000101')), 3, 'Organization-scoped latest RPC sees active Personnel and task pairs');
SELECT is((SELECT count(*)::integer FROM public.latest_active_personnel_ict_completions('b8000000-0000-4000-8000-000000000102')), 0, 'Organization-scoped viewer cannot use RPC on foreign Organization');

SELECT set_config('request.jwt.claim.sub', 'b8000000-0000-4000-8000-000000000004', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_ict_completions), 0, 'empty Group scope reads no completions');
SELECT is((SELECT count(*)::integer FROM public.latest_active_personnel_ict_completions('b8000000-0000-4000-8000-000000000101')), 0, 'empty Group scope reads no RPC rows');

SELECT set_config('request.jwt.claim.sub', 'b8000000-0000-4000-8000-000000000005', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_ict_completions), 0, 'member without Critical Tasks lane sees no completions');
SELECT is((SELECT count(*)::integer FROM public.active_personnel_ict_completion_trend('b8000000-0000-4000-8000-000000000101')), 0, 'member without lane sees no trend');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.latest_active_personnel_ict_completions('b8000000-0000-4000-8000-000000000101')), 0, 'anonymous RPC returns no rows');
SELECT is((SELECT count(*)::integer FROM public.personnel_ict_completions), 0, 'anonymous cannot read completions');
RESET ROLE;

-- Read matrix: every actor kind sees exactly these completions.
SELECT ok(NOT has_schema_privilege('anon', 'member_access_private', 'USAGE')
          AND NOT has_function_privilege('anon', 'member_access_private.viewable_personnel(text)', 'EXECUTE'),
          'anonymous callers cannot reach the visible-People helper');

INSERT INTO auth.users (id, email)
SELECT ('b8000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'critical-scope-' || n || '@example.test'
FROM generate_series(7, 13) AS n;
INSERT INTO public.organizations (id, name, created_by, suspended_at) VALUES
('b8000000-0000-4000-8000-000000000103', 'Critical Charlie', 'b8000000-0000-4000-8000-000000000011', now());
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, mos) VALUES
('b8000000-0000-4000-8000-000000000306', 'b8000000-0000-4000-8000-000000000103', NULL, 'SPC', 'Suspended', 'Charlie', 'critical-charlie', '68W');
INSERT INTO public.ict_tasks (id, organization_id, task_code, title, mos) VALUES
('b8000000-0000-4000-8000-000000000404', 'b8000000-0000-4000-8000-000000000103', 'C-001', 'Charlie task', ARRAY['68W']);
INSERT INTO public.personnel_ict_completions
  (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method) VALUES
('b8000000-0000-4000-8000-000000000508', 'b8000000-0000-4000-8000-000000000103', 'b8000000-0000-4000-8000-000000000306', 'b8000000-0000-4000-8000-000000000404', '2026-06-01', 'Practical Exercise');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
('b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000007', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
('b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000008', 'admin', 'viewer', '{"criticalTasks":"none"}', 'groups', ARRAY['b8000000-0000-4000-8000-000000000201']::uuid[]),
('b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000009', 'member', 'viewer', '{"personnel":"none"}', 'groups', ARRAY['b8000000-0000-4000-8000-000000000201','b8000000-0000-4000-8000-000000000202']::uuid[]),
('b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000010', 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[]),
('b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000011', 'member', 'viewer', '{}', 'groups', ARRAY['b8000000-0000-4000-8000-000000000202']::uuid[]),
('b8000000-0000-4000-8000-000000000103', 'b8000000-0000-4000-8000-000000000011', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
('b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000012', 'member', 'viewer', '{}', 'groups', ARRAY['b8000000-0000-4000-8000-000000000202']::uuid[]),
('b8000000-0000-4000-8000-000000000102', 'b8000000-0000-4000-8000-000000000012', 'member', 'operator', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.user_suspensions (user_id, suspended_by, reason) VALUES
('b8000000-0000-4000-8000-000000000010', 'b8000000-0000-4000-8000-000000000007', 'Synthetic account suspension');

-- The replaced policy's predicate, evaluated as the table owner for the current claims.
CREATE FUNCTION pg_temp.replaced_completion_policy_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id FROM public.personnel_ict_completions c
  WHERE public.can_view_personnel_ict_completion_record(c.organization_id, c.personnel_id);
$$;

CREATE TEMP TABLE completion_read_matrix (actor integer, label text, expected uuid[]);
INSERT INTO completion_read_matrix VALUES
(1, 'Group viewer: own Group, archived Person and archived task', ARRAY['b8000000-0000-4000-8000-000000000501','b8000000-0000-4000-8000-000000000502','b8000000-0000-4000-8000-000000000503','b8000000-0000-4000-8000-000000000506']::uuid[]),
(2, 'Group operator: own Group', ARRAY['b8000000-0000-4000-8000-000000000501','b8000000-0000-4000-8000-000000000502','b8000000-0000-4000-8000-000000000503','b8000000-0000-4000-8000-000000000506']::uuid[]),
(3, 'Organization scope: every Group and unassigned', ARRAY['b8000000-0000-4000-8000-000000000501','b8000000-0000-4000-8000-000000000502','b8000000-0000-4000-8000-000000000503','b8000000-0000-4000-8000-000000000504','b8000000-0000-4000-8000-000000000505','b8000000-0000-4000-8000-000000000506']::uuid[]),
(4, 'empty Group list: nothing', ARRAY[]::uuid[]),
(5, 'lane none: nothing', ARRAY[]::uuid[]),
(6, 'owner of another Organization: only its completions', ARRAY['b8000000-0000-4000-8000-000000000507']::uuid[]),
(7, 'owner: every completion of the Organization', ARRAY['b8000000-0000-4000-8000-000000000501','b8000000-0000-4000-8000-000000000502','b8000000-0000-4000-8000-000000000503','b8000000-0000-4000-8000-000000000504','b8000000-0000-4000-8000-000000000505','b8000000-0000-4000-8000-000000000506']::uuid[]),
(8, 'admin: role overrides lane none and Group scope', ARRAY['b8000000-0000-4000-8000-000000000501','b8000000-0000-4000-8000-000000000502','b8000000-0000-4000-8000-000000000503','b8000000-0000-4000-8000-000000000504','b8000000-0000-4000-8000-000000000505','b8000000-0000-4000-8000-000000000506']::uuid[]),
(9, 'several Groups: both Groups, not unassigned', ARRAY['b8000000-0000-4000-8000-000000000501','b8000000-0000-4000-8000-000000000502','b8000000-0000-4000-8000-000000000503','b8000000-0000-4000-8000-000000000504','b8000000-0000-4000-8000-000000000506']::uuid[]),
(10, 'suspended account: nothing', ARRAY[]::uuid[]),
(11, 'member of a suspended Organization: only the admitted one', ARRAY['b8000000-0000-4000-8000-000000000504']::uuid[]),
(12, 'member of two Organizations: Group scope in one, Organization scope in the other', ARRAY['b8000000-0000-4000-8000-000000000504','b8000000-0000-4000-8000-000000000507']::uuid[]),
(13, 'account with no membership: nothing', ARRAY[]::uuid[]);

CREATE FUNCTION pg_temp.completion_read_matrix() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM completion_read_matrix ORDER BY actor LOOP
    PERFORM set_config('request.jwt.claim.sub', 'b8000000-0000-4000-8000-' || lpad(item.actor::text, 12, '0'), true);
    SET LOCAL ROLE authenticated;
    RETURN NEXT set_eq('SELECT id FROM public.personnel_ict_completions', item.expected,
                       'actor ' || item.actor || ', ' || item.label);
    RETURN NEXT set_eq('SELECT id FROM public.personnel_ict_completions', 'SELECT pg_temp.replaced_completion_policy_ids()',
                       'actor ' || item.actor || ' reads exactly what the replaced per-row policy admitted');
    RESET ROLE;
  END LOOP;
END;
$$;
SELECT * FROM pg_temp.completion_read_matrix();

SELECT * FROM finish();
ROLLBACK;
