-- Direct Soldier Data Sheet access requires operate; the roster's badge is a
-- separate view-only, Person-scoped ID projection.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT ok(has_function_privilege('authenticated', 'public.personnel_extended_info_scope_matches(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.personnel_extended_info_scope_matches(uuid,uuid)', 'EXECUTE'),
  'extended info row predicate is callable by authenticated actors, not anonymous');
SELECT ok(has_function_privilege('authenticated', 'public.list_personnel_award_tracking_acknowledged(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.list_personnel_award_tracking_acknowledged(uuid)', 'EXECUTE'),
  'badge RPC is authenticated only');
SELECT is((SELECT pg_get_function_result('public.list_personnel_award_tracking_acknowledged(uuid)'::regprocedure)),
  'TABLE(personnel_id uuid)', 'badge RPC exposes only Person IDs');

INSERT INTO auth.users (id, email)
SELECT ('f7000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'extended-scope-' || n || '@example.test'
FROM generate_series(1, 7) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('f7000000-0000-4000-8000-000000000101', 'Extended Alpha', 'f7000000-0000-4000-8000-000000000006'),
  ('f7000000-0000-4000-8000-000000000102', 'Extended Foreign', 'f7000000-0000-4000-8000-000000000007');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('f7000000-0000-4000-8000-000000000201', 'f7000000-0000-4000-8000-000000000101', 'Alpha'),
  ('f7000000-0000-4000-8000-000000000202', 'f7000000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000001', 'member', 'viewer', '{"personnel":"operate"}', 'groups', ARRAY['f7000000-0000-4000-8000-000000000201']::uuid[]),
  ('f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000002', 'member', 'viewer', '{"personnel":"view"}', 'groups', ARRAY['f7000000-0000-4000-8000-000000000201']::uuid[]),
  ('f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000003', 'member', 'viewer', '{"personnel":"operate"}', 'organization', ARRAY[]::uuid[]),
  ('f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000004', 'member', 'viewer', '{"personnel":"operate"}', 'groups', ARRAY[]::uuid[]),
  ('f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000005', 'member', 'viewer', '{"personnel":"none"}', 'groups', ARRAY['f7000000-0000-4000-8000-000000000201']::uuid[]),
  ('f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000006', 'owner', 'viewer', '{}', 'groups', ARRAY[]::uuid[]),
  ('f7000000-0000-4000-8000-000000000102', 'f7000000-0000-4000-8000-000000000007', 'owner', 'viewer', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('f7000000-0000-4000-8000-000000000301', 'f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000201', 'SPC', 'One', 'Alpha', 'extended-alpha-active', NULL),
  ('f7000000-0000-4000-8000-000000000302', 'f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000201', 'SGT', 'Two', 'Alpha', 'extended-alpha-archived', '2029-01-01'),
  ('f7000000-0000-4000-8000-000000000303', 'f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000202', 'SSG', 'Three', 'Bravo', 'extended-bravo-active', NULL),
  ('f7000000-0000-4000-8000-000000000304', 'f7000000-0000-4000-8000-000000000101', NULL, 'PFC', 'Four', 'Unassigned', 'extended-unassigned-active', NULL),
  ('f7000000-0000-4000-8000-000000000305', 'f7000000-0000-4000-8000-000000000101', NULL, 'CPL', 'Five', 'Unassigned', 'extended-unassigned-archived', '2029-01-01'),
  ('f7000000-0000-4000-8000-000000000306', 'f7000000-0000-4000-8000-000000000102', NULL, 'SPC', 'Six', 'Foreign', 'extended-foreign-active', NULL),
  ('f7000000-0000-4000-8000-000000000307', 'f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000201', 'SPC', 'Seven', 'Alpha', 'extended-alpha-new', NULL),
  ('f7000000-0000-4000-8000-000000000308', 'f7000000-0000-4000-8000-000000000102', NULL, 'SPC', 'Eight', 'Foreign', 'extended-foreign-mismatched', NULL),
  ('f7000000-0000-4000-8000-000000000309', 'f7000000-0000-4000-8000-000000000102', NULL, 'SPC', 'Nine', 'Foreign', 'extended-foreign-new', NULL),
  ('f7000000-0000-4000-8000-000000000310', 'f7000000-0000-4000-8000-000000000101', NULL, 'SPC', 'Ten', 'Unassigned', 'extended-unassigned-new', NULL);
INSERT INTO public.personnel_extended_info
  (id, organization_id, personnel_id, emergency_contact_name, award_tracking_acknowledged_at) VALUES
  ('f7000000-0000-4000-8000-000000000401', 'f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000301', 'Alpha secret', '2029-02-01'),
  ('f7000000-0000-4000-8000-000000000402', 'f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000302', 'Archived secret', '2029-02-02'),
  ('f7000000-0000-4000-8000-000000000403', 'f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000303', 'Bravo secret', '2029-02-03'),
  ('f7000000-0000-4000-8000-000000000404', 'f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000304', 'Unassigned secret', '2029-02-04'),
  ('f7000000-0000-4000-8000-000000000405', 'f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000305', 'Unassigned archived secret', NULL),
  ('f7000000-0000-4000-8000-000000000406', 'f7000000-0000-4000-8000-000000000102', 'f7000000-0000-4000-8000-000000000306', 'Foreign secret', '2029-02-06'),
  ('f7000000-0000-4000-8000-000000000407', 'f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000308', 'Mismatched secret', '2029-02-07');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT string_agg(id::text, ',' ORDER BY id) FROM public.personnel),
  'f7000000-0000-4000-8000-000000000301,f7000000-0000-4000-8000-000000000302,f7000000-0000-4000-8000-000000000307',
  'Group viewer retains ordinary active and archived Personnel roster rows');
SELECT is((SELECT count(*)::integer FROM public.personnel_extended_info), 0,
  'Group viewer cannot read Soldier Data Sheet');
SELECT is((SELECT string_agg(personnel_id::text, ',' ORDER BY personnel_id)
  FROM public.list_personnel_award_tracking_acknowledged('f7000000-0000-4000-8000-000000000101')),
  'f7000000-0000-4000-8000-000000000301,f7000000-0000-4000-8000-000000000302',
  'Group viewer gets only in-Group active and archived badge IDs');
SELECT is((SELECT count(*)::integer FROM public.list_personnel_award_tracking_acknowledged('f7000000-0000-4000-8000-000000000102')),
  0, 'badge RPC rejects foreign Organization');
WITH changed AS (UPDATE public.personnel_extended_info SET emergency_contact_name = 'denied'
  WHERE id = 'f7000000-0000-4000-8000-000000000401' RETURNING id)
SELECT is(count(*)::integer, 0, 'viewer cannot write in-Group Soldier Data Sheet') FROM changed;

SELECT set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT string_agg(id::text, ',' ORDER BY id) FROM public.personnel_extended_info),
  'f7000000-0000-4000-8000-000000000401,f7000000-0000-4000-8000-000000000402',
  'Group operator reads only active and archived in-Group Soldier Data Sheet rows');
WITH changed AS (UPDATE public.personnel_extended_info SET emergency_contact_name = 'Edited archived'
  WHERE id = 'f7000000-0000-4000-8000-000000000402' RETURNING id)
SELECT is(count(*)::integer, 1, 'Group operator updates archived in-Group row') FROM changed;
WITH changed AS (UPDATE public.personnel_extended_info SET emergency_contact_name = 'denied'
  WHERE id IN ('f7000000-0000-4000-8000-000000000403', 'f7000000-0000-4000-8000-000000000404',
    'f7000000-0000-4000-8000-000000000405', 'f7000000-0000-4000-8000-000000000407') RETURNING id)
SELECT is(count(*)::integer, 0, 'Group operator cannot update out-of-Group, unassigned or mismatched row') FROM changed;
SELECT throws_ok($$ INSERT INTO public.personnel_extended_info
  (organization_id, personnel_id, emergency_contact_name) VALUES
  ('f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000309', 'Denied') $$,
  '42501', NULL, 'Group operator cannot insert extended info for foreign Person');
SELECT throws_ok($$ INSERT INTO public.personnel_extended_info
  (organization_id, personnel_id, emergency_contact_name) VALUES
  ('f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000310', 'Denied') $$,
  '42501', NULL, 'Group operator cannot insert extended info for unassigned Person');
SAVEPOINT allowed_group_insert;
SELECT lives_ok($$ INSERT INTO public.personnel_extended_info
  (organization_id, personnel_id, emergency_contact_name) VALUES
  ('f7000000-0000-4000-8000-000000000101', 'f7000000-0000-4000-8000-000000000307', 'New in-Group') $$,
  'Group operator can insert in-Group Soldier Data Sheet');
SELECT is((SELECT emergency_contact_name FROM public.personnel_extended_info
  WHERE personnel_id = 'f7000000-0000-4000-8000-000000000307'), 'New in-Group',
  'new in-Group row is readable through operate scope');
ROLLBACK TO SAVEPOINT allowed_group_insert;
SAVEPOINT allowed_group_delete;
WITH removed AS (DELETE FROM public.personnel_extended_info
  WHERE id = 'f7000000-0000-4000-8000-000000000402' RETURNING id)
SELECT is(count(*)::integer, 1, 'Group operator can delete archived in-Group row') FROM removed;
WITH removed AS (DELETE FROM public.personnel_extended_info
  WHERE id = 'f7000000-0000-4000-8000-000000000404' RETURNING id)
SELECT is(count(*)::integer, 0, 'Group operator cannot delete unassigned row') FROM removed;
ROLLBACK TO SAVEPOINT allowed_group_delete;

SELECT set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000004', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_extended_info), 0,
  'empty Group scope reads no Soldier Data Sheet rows');
SELECT is((SELECT count(*)::integer FROM public.list_personnel_award_tracking_acknowledged('f7000000-0000-4000-8000-000000000101')),
  0, 'empty Group scope receives no badges');
SELECT set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000005', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_extended_info), 0,
  'member without Personnel lane reads no Soldier Data Sheet rows');
SELECT is((SELECT count(*)::integer FROM public.list_personnel_award_tracking_acknowledged('f7000000-0000-4000-8000-000000000101')),
  0, 'member without Personnel lane receives no badges');

SELECT set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT string_agg(id::text, ',' ORDER BY id) FROM public.personnel_extended_info),
  'f7000000-0000-4000-8000-000000000401,f7000000-0000-4000-8000-000000000402,f7000000-0000-4000-8000-000000000403,f7000000-0000-4000-8000-000000000404,f7000000-0000-4000-8000-000000000405',
  'Organization operator reads assigned and unassigned local rows, not mismatched or foreign');
SELECT is((SELECT string_agg(personnel_id::text, ',' ORDER BY personnel_id)
  FROM public.list_personnel_award_tracking_acknowledged('f7000000-0000-4000-8000-000000000101')),
  'f7000000-0000-4000-8000-000000000301,f7000000-0000-4000-8000-000000000302,f7000000-0000-4000-8000-000000000303,f7000000-0000-4000-8000-000000000304',
  'Organization operator badges exclude only unacknowledged and mismatched rows');
WITH changed AS (UPDATE public.personnel_extended_info SET emergency_contact_name = 'Edited unassigned'
  WHERE id = 'f7000000-0000-4000-8000-000000000404' RETURNING id)
SELECT is(count(*)::integer, 1, 'Organization operator can update unassigned row') FROM changed;
SELECT throws_ok($$ UPDATE public.personnel_extended_info
  SET personnel_id = 'f7000000-0000-4000-8000-000000000309'
  WHERE id = 'f7000000-0000-4000-8000-000000000401' $$,
  '42501', NULL, 'Organization operator cannot move extended info to foreign Person');

SELECT set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000006', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_extended_info), 5,
  'owner with empty Group list retains local assigned and unassigned Soldier Data Sheet');
SELECT set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000007', true);
SELECT is((SELECT id FROM public.personnel_extended_info),
  'f7000000-0000-4000-8000-000000000406'::uuid, 'foreign owner reads only foreign own-Organization row');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.personnel_extended_info), 0,
  'anonymous cannot read Soldier Data Sheet');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
