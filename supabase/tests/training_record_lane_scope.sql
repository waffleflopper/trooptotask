-- Training-only access to scoped records without Personnel-lane SELECT.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok(NOT has_function_privilege('authenticated', 'public.training_personnel_scope_matches(uuid,uuid)', 'EXECUTE')
       AND NOT has_function_privilege('authenticated', 'public.training_record_type_matches(uuid,uuid)', 'EXECUTE'),
       'private policy helpers cannot be called through authenticated RPC');

INSERT INTO auth.users (id, email)
SELECT ('b6000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'training-scope-' || n || '@example.test'
FROM generate_series(1, 6) AS n;

INSERT INTO public.organizations (id, name, created_by) VALUES
('b6000000-0000-4000-8000-000000000101', 'Training Alpha', 'b6000000-0000-4000-8000-000000000001'),
('b6000000-0000-4000-8000-000000000102', 'Training Bravo', 'b6000000-0000-4000-8000-000000000006');
INSERT INTO public.groups (id, organization_id, name) VALUES
('b6000000-0000-4000-8000-000000000201', 'b6000000-0000-4000-8000-000000000101', 'Alpha One'),
('b6000000-0000-4000-8000-000000000202', 'b6000000-0000-4000-8000-000000000101', 'Alpha Two');

INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) SELECT 'b6000000-0000-4000-8000-000000000101'::uuid,
  ('b6000000-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer', overrides::jsonb, scope_kind,
  CASE WHEN scope_kind = 'groups' AND actor <> 3
       THEN ARRAY['b6000000-0000-4000-8000-000000000201']::uuid[]
       ELSE ARRAY[]::uuid[] END
FROM (VALUES
  (1, '{"training":"view","personnel":"none"}', 'groups'),
  (2, '{"training":"operate","personnel":"none"}', 'groups'),
  (3, '{"training":"operate","personnel":"none"}', 'groups'),
  (4, '{"training":"operate","personnel":"none"}', 'organization'),
  (5, '{"training":"none","personnel":"none"}', 'groups')
) AS actors(actor, overrides, scope_kind);
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES (
  'b6000000-0000-4000-8000-000000000102', 'b6000000-0000-4000-8000-000000000006',
  'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]
);

INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
('b6000000-0000-4000-8000-000000000301', 'b6000000-0000-4000-8000-000000000101', 'b6000000-0000-4000-8000-000000000201', 'SPC', 'Active', 'Alpha', 'training-active', NULL),
('b6000000-0000-4000-8000-000000000302', 'b6000000-0000-4000-8000-000000000101', 'b6000000-0000-4000-8000-000000000201', 'SPC', 'Archived', 'Alpha', 'training-archived', '2026-01-01'),
('b6000000-0000-4000-8000-000000000303', 'b6000000-0000-4000-8000-000000000101', 'b6000000-0000-4000-8000-000000000202', 'SPC', 'Other', 'Alpha', 'training-other', NULL),
('b6000000-0000-4000-8000-000000000304', 'b6000000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Alpha', 'training-unassigned', NULL),
('b6000000-0000-4000-8000-000000000305', 'b6000000-0000-4000-8000-000000000102', NULL, 'SPC', 'Other', 'Bravo', 'training-bravo', NULL);
INSERT INTO public.training_types (id, organization_id, name) VALUES
('b6000000-0000-4000-8000-000000000401', 'b6000000-0000-4000-8000-000000000101', 'Alpha Type'),
('b6000000-0000-4000-8000-000000000402', 'b6000000-0000-4000-8000-000000000102', 'Bravo Type'),
('b6000000-0000-4000-8000-000000000403', 'b6000000-0000-4000-8000-000000000101', 'Alpha Second Type');
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date) VALUES
('b6000000-0000-4000-8000-000000000501', 'b6000000-0000-4000-8000-000000000101', 'b6000000-0000-4000-8000-000000000301', 'b6000000-0000-4000-8000-000000000401', '2026-06-01'),
('b6000000-0000-4000-8000-000000000502', 'b6000000-0000-4000-8000-000000000101', 'b6000000-0000-4000-8000-000000000302', 'b6000000-0000-4000-8000-000000000401', '2026-06-01'),
('b6000000-0000-4000-8000-000000000503', 'b6000000-0000-4000-8000-000000000101', 'b6000000-0000-4000-8000-000000000303', 'b6000000-0000-4000-8000-000000000401', '2026-06-01'),
('b6000000-0000-4000-8000-000000000504', 'b6000000-0000-4000-8000-000000000101', 'b6000000-0000-4000-8000-000000000304', 'b6000000-0000-4000-8000-000000000401', '2026-06-01'),
('b6000000-0000-4000-8000-000000000505', 'b6000000-0000-4000-8000-000000000102', 'b6000000-0000-4000-8000-000000000305', 'b6000000-0000-4000-8000-000000000402', '2026-06-01');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b6000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'Training-only viewer cannot SELECT Personnel');
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings), 2, 'Group viewer reads own active and archived Training records only');
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings WHERE id = 'b6000000-0000-4000-8000-000000000502'), 1, 'archived own-Group record remains visible');
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings WHERE id IN ('b6000000-0000-4000-8000-000000000503','b6000000-0000-4000-8000-000000000504','b6000000-0000-4000-8000-000000000505')), 0, 'other Group, unassigned and foreign records are hidden');
SELECT throws_ok($$ INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id) VALUES ('b6000000-0000-4000-8000-000000000101','b6000000-0000-4000-8000-000000000301','b6000000-0000-4000-8000-000000000403') $$, '42501', NULL, 'view-only Training member cannot insert');

SELECT set_config('request.jwt.claim.sub', 'b6000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'Training-only operator cannot SELECT Personnel');
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings), 2, 'Group operator reads active and archived own-Group records');
SELECT lives_ok($$ UPDATE public.personnel_trainings SET notes = 'archived updated' WHERE id = 'b6000000-0000-4000-8000-000000000502' $$, 'operator updates archived own-Group record');
SELECT is((SELECT notes FROM public.personnel_trainings WHERE id = 'b6000000-0000-4000-8000-000000000502'), 'archived updated', 'archived update persists in transaction');
SELECT lives_ok($$ UPDATE public.personnel_trainings SET notes = 'forbidden' WHERE id IN ('b6000000-0000-4000-8000-000000000503','b6000000-0000-4000-8000-000000000504') $$, 'out-of-scope update affects no visible records');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings WHERE notes = 'forbidden'), 0, 'other Group and unassigned records remain unchanged');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id) VALUES ('b6000000-0000-4000-8000-000000000101','b6000000-0000-4000-8000-000000000304','b6000000-0000-4000-8000-000000000403') $$, '42501', NULL, 'Group operator cannot insert unassigned record');
SELECT throws_ok($$ INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id) VALUES ('b6000000-0000-4000-8000-000000000101','b6000000-0000-4000-8000-000000000301','b6000000-0000-4000-8000-000000000402') $$, '42501', NULL, 'Group operator cannot attach foreign Training type');
SELECT throws_ok($$ UPDATE public.personnel_trainings SET training_type_id = 'b6000000-0000-4000-8000-000000000402' WHERE id = 'b6000000-0000-4000-8000-000000000502' $$, '42501', NULL, 'Group operator cannot move record to foreign Training type');

SELECT set_config('request.jwt.claim.sub', 'b6000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings), 0, 'empty Group scope reads no records');
SELECT throws_ok($$ INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id) VALUES ('b6000000-0000-4000-8000-000000000101','b6000000-0000-4000-8000-000000000301','b6000000-0000-4000-8000-000000000403') $$, '42501', NULL, 'empty Group scope cannot insert');

SELECT set_config('request.jwt.claim.sub', 'b6000000-0000-4000-8000-000000000004', true);
SELECT is((SELECT count(*)::integer FROM public.personnel), 0, 'Organization-scoped Training operator still cannot SELECT Personnel');
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings), 4, 'Organization-scoped operator sees own Group and unassigned records');
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings WHERE id = 'b6000000-0000-4000-8000-000000000505'), 0, 'foreign Organization remains hidden');
SELECT lives_ok($$ UPDATE public.personnel_trainings SET notes = 'unassigned updated' WHERE id = 'b6000000-0000-4000-8000-000000000504' $$, 'Organization-scoped operator can update unassigned record');
SELECT throws_ok($$ INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id) VALUES ('b6000000-0000-4000-8000-000000000101','b6000000-0000-4000-8000-000000000305','b6000000-0000-4000-8000-000000000403') $$, '42501', NULL, 'Organization operator cannot attach foreign Personnel');

SELECT set_config('request.jwt.claim.sub', 'b6000000-0000-4000-8000-000000000005', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings), 0, 'member without Training lane sees no records');
SELECT throws_ok($$ INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id) VALUES ('b6000000-0000-4000-8000-000000000101','b6000000-0000-4000-8000-000000000301','b6000000-0000-4000-8000-000000000403') $$, '42501', NULL, 'member without Training lane cannot insert');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.personnel_trainings), 0, 'anonymous cannot read Training records');
RESET ROLE;

-- Read matrix: every actor kind sees exactly these records.
SELECT ok(NOT has_schema_privilege('anon', 'member_access_private', 'USAGE')
       AND NOT has_function_privilege('anon', 'member_access_private.viewable_personnel(text)', 'EXECUTE'),
       'anonymous callers cannot reach the visible-People helper');
SELECT ok(to_regprocedure('public.can_view_personnel_training_record(uuid,uuid)') IS NULL,
       'the replaced per-row Training read helper is gone');

INSERT INTO auth.users (id, email)
SELECT ('b6000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'training-scope-' || n || '@example.test'
FROM generate_series(7, 13) AS n;
INSERT INTO public.organizations (id, name, created_by, suspended_at) VALUES
('b6000000-0000-4000-8000-000000000103', 'Training Charlie', 'b6000000-0000-4000-8000-000000000012', now());
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
('b6000000-0000-4000-8000-000000000306', 'b6000000-0000-4000-8000-000000000103', NULL, 'SPC', 'Suspended', 'Charlie', 'training-charlie');
INSERT INTO public.training_types (id, organization_id, name) VALUES
('b6000000-0000-4000-8000-000000000404', 'b6000000-0000-4000-8000-000000000103', 'Charlie Type');
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id, completion_date) VALUES
('b6000000-0000-4000-8000-000000000506', 'b6000000-0000-4000-8000-000000000103', 'b6000000-0000-4000-8000-000000000306', 'b6000000-0000-4000-8000-000000000404', '2026-06-01');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
('b6000000-0000-4000-8000-000000000101', 'b6000000-0000-4000-8000-000000000007', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
('b6000000-0000-4000-8000-000000000101', 'b6000000-0000-4000-8000-000000000008', 'admin', 'viewer', '{"training":"none"}', 'groups', ARRAY['b6000000-0000-4000-8000-000000000201']::uuid[]),
('b6000000-0000-4000-8000-000000000101', 'b6000000-0000-4000-8000-000000000009', 'member', 'viewer', '{"personnel":"none"}', 'groups', ARRAY['b6000000-0000-4000-8000-000000000201','b6000000-0000-4000-8000-000000000202']::uuid[]),
('b6000000-0000-4000-8000-000000000101', 'b6000000-0000-4000-8000-000000000010', 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[]),
('b6000000-0000-4000-8000-000000000101', 'b6000000-0000-4000-8000-000000000011', 'member', 'viewer', '{}', 'groups', ARRAY['b6000000-0000-4000-8000-000000000202']::uuid[]),
('b6000000-0000-4000-8000-000000000103', 'b6000000-0000-4000-8000-000000000011', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
('b6000000-0000-4000-8000-000000000101', 'b6000000-0000-4000-8000-000000000012', 'member', 'viewer', '{}', 'groups', ARRAY['b6000000-0000-4000-8000-000000000202']::uuid[]),
('b6000000-0000-4000-8000-000000000102', 'b6000000-0000-4000-8000-000000000012', 'member', 'operator', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.user_suspensions (user_id, suspended_by, reason) VALUES
('b6000000-0000-4000-8000-000000000010', 'b6000000-0000-4000-8000-000000000007', 'Synthetic account suspension');

-- The replaced policy's predicate, evaluated as the table owner for the current claims.
CREATE FUNCTION pg_temp.replaced_training_policy_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id FROM public.personnel_trainings t
  WHERE public.member_access_has_capability(t.organization_id, 'training', 'view')
    AND public.training_personnel_scope_matches(t.organization_id, t.personnel_id);
$$;

CREATE TEMP TABLE training_read_matrix (actor integer, label text, expected uuid[]);
INSERT INTO training_read_matrix VALUES
(1, 'Group viewer: own Group, active and archived', ARRAY['b6000000-0000-4000-8000-000000000501','b6000000-0000-4000-8000-000000000502']::uuid[]),
(2, 'Group operator: own Group, active and archived', ARRAY['b6000000-0000-4000-8000-000000000501','b6000000-0000-4000-8000-000000000502']::uuid[]),
(3, 'empty Group list: nothing', ARRAY[]::uuid[]),
(4, 'Organization scope: every Group and unassigned', ARRAY['b6000000-0000-4000-8000-000000000501','b6000000-0000-4000-8000-000000000502','b6000000-0000-4000-8000-000000000503','b6000000-0000-4000-8000-000000000504']::uuid[]),
(5, 'lane none: nothing', ARRAY[]::uuid[]),
(6, 'owner of another Organization: only its records', ARRAY['b6000000-0000-4000-8000-000000000505']::uuid[]),
(7, 'owner: every record of the Organization', ARRAY['b6000000-0000-4000-8000-000000000501','b6000000-0000-4000-8000-000000000502','b6000000-0000-4000-8000-000000000503','b6000000-0000-4000-8000-000000000504']::uuid[]),
(8, 'admin: role overrides lane none and Group scope', ARRAY['b6000000-0000-4000-8000-000000000501','b6000000-0000-4000-8000-000000000502','b6000000-0000-4000-8000-000000000503','b6000000-0000-4000-8000-000000000504']::uuid[]),
(9, 'several Groups: both Groups, not unassigned', ARRAY['b6000000-0000-4000-8000-000000000501','b6000000-0000-4000-8000-000000000502','b6000000-0000-4000-8000-000000000503']::uuid[]),
(10, 'suspended account: nothing', ARRAY[]::uuid[]),
(11, 'member of a suspended Organization: only the admitted one', ARRAY['b6000000-0000-4000-8000-000000000503']::uuid[]),
(12, 'member of two Organizations: Group scope in one, Organization scope in the other', ARRAY['b6000000-0000-4000-8000-000000000503','b6000000-0000-4000-8000-000000000505']::uuid[]),
(13, 'account with no membership: nothing', ARRAY[]::uuid[]);

CREATE FUNCTION pg_temp.training_read_matrix() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM training_read_matrix ORDER BY actor LOOP
    PERFORM set_config('request.jwt.claim.sub', 'b6000000-0000-4000-8000-' || lpad(item.actor::text, 12, '0'), true);
    SET LOCAL ROLE authenticated;
    RETURN NEXT set_eq('SELECT id FROM public.personnel_trainings', item.expected,
                       'actor ' || item.actor || ', ' || item.label);
    RETURN NEXT set_eq('SELECT id FROM public.personnel_trainings', 'SELECT pg_temp.replaced_training_policy_ids()',
                       'actor ' || item.actor || ' reads exactly what the replaced per-row policy admitted');
    RESET ROLE;
  END LOOP;
END;
$$;
SELECT * FROM pg_temp.training_read_matrix();

SELECT * FROM finish();
ROLLBACK;
