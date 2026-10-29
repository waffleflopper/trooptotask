BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email)
SELECT ('f8200000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'dod-occupancy-' || n || '@example.test'
FROM generate_series(1, 4) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('f8200000-0000-4000-8000-000000000101', 'DoD occupancy A', 'f8200000-0000-4000-8000-000000000001'),
  ('f8200000-0000-4000-8000-000000000102', 'DoD occupancy B', 'f8200000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('f8200000-0000-4000-8000-000000000201', 'f8200000-0000-4000-8000-000000000101', 'Alpha'),
  ('f8200000-0000-4000-8000-000000000202', 'f8200000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.organization_memberships
  (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids)
VALUES
  ('f8200000-0000-4000-8000-000000000101', 'f8200000-0000-4000-8000-000000000002',
   'member', 'viewer', '{"personnel":"operate"}', 'groups', ARRAY['f8200000-0000-4000-8000-000000000201']::uuid[]),
  ('f8200000-0000-4000-8000-000000000101', 'f8200000-0000-4000-8000-000000000003',
   'member', 'viewer', '{"personnel":"view"}', 'organization', ARRAY[]::uuid[]),
  ('f8200000-0000-4000-8000-000000000102', 'f8200000-0000-4000-8000-000000000004',
   'member', 'viewer', '{"personnel":"operate"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('f8200000-0000-4000-8000-000000000301', 'f8200000-0000-4000-8000-000000000101', 'f8200000-0000-4000-8000-000000000201', 'SGT', 'Visible', 'Synthetic', 'occupancy-visible', NULL),
  ('f8200000-0000-4000-8000-000000000302', 'f8200000-0000-4000-8000-000000000101', 'f8200000-0000-4000-8000-000000000202', 'SGT', 'Hidden', 'Synthetic', 'occupancy-hidden', NULL),
  ('f8200000-0000-4000-8000-000000000303', 'f8200000-0000-4000-8000-000000000101', 'f8200000-0000-4000-8000-000000000202', 'SGT', 'Archived', 'Synthetic', 'occupancy-archived', '2026-01-01'),
  ('f8200000-0000-4000-8000-000000000304', 'f8200000-0000-4000-8000-000000000102', NULL, 'SGT', 'Foreign', 'Synthetic', 'occupancy-foreign', NULL);
INSERT INTO public.personnel_extended_info (organization_id, personnel_id, dod_id) VALUES
  ('f8200000-0000-4000-8000-000000000101', 'f8200000-0000-4000-8000-000000000301', '0123456789'),
  ('f8200000-0000-4000-8000-000000000101', 'f8200000-0000-4000-8000-000000000302', '0000000001'),
  ('f8200000-0000-4000-8000-000000000101', 'f8200000-0000-4000-8000-000000000303', '0000000002'),
  ('f8200000-0000-4000-8000-000000000102', 'f8200000-0000-4000-8000-000000000304', '0000000003');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f8200000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"f8200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT is(public.personnel_dod_ids_in_use('f8200000-0000-4000-8000-000000000101',
  ARRAY['0123456789', '0000000001', '0000000002', '0000000003', '0000000004', '0000000001']),
  ARRAY['0000000001', '0000000002', '0123456789'],
  'scoped operate member sees only requested occupied IDs, including hidden and archived holders');
SELECT is((SELECT count(*)::integer FROM public.personnel_extended_info), 1,
  'occupancy lookup does not grant reads of hidden holders');
SELECT is(public.personnel_dod_ids_in_use('f8200000-0000-4000-8000-000000000101', ARRAY[]::text[]),
  ARRAY[]::text[], 'empty input reveals no IDs');
SELECT is(public.personnel_dod_ids_in_use('f8200000-0000-4000-8000-000000000102', ARRAY['0000000003']),
  ARRAY[]::text[], 'operate member cannot query an Organization they do not belong to');

SELECT set_config('request.jwt.claim.sub', 'f8200000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"sub":"f8200000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT is(public.personnel_dod_ids_in_use('f8200000-0000-4000-8000-000000000101', ARRAY['0123456789', '0000000001']),
  ARRAY[]::text[], 'view-only member learns no occupancy');

SELECT set_config('request.jwt.claim.sub', 'f8200000-0000-4000-8000-000000000004', true);
SELECT set_config('request.jwt.claims', '{"sub":"f8200000-0000-4000-8000-000000000004","role":"authenticated"}', true);
SELECT is(public.personnel_dod_ids_in_use('f8200000-0000-4000-8000-000000000101', ARRAY['0123456789', '0000000001']),
  ARRAY[]::text[], 'member of another Organization learns no occupancy');
SELECT is(public.personnel_dod_ids_in_use('f8200000-0000-4000-8000-000000000102', ARRAY['0000000003']),
  ARRAY['0000000003'], 'foreign operate member can query only their own Organization');

RESET ROLE;
SELECT ok(NOT has_function_privilege('anon', 'public.personnel_dod_ids_in_use(uuid,text[])', 'EXECUTE'),
  'anonymous role cannot execute the occupancy function');
SELECT * FROM finish();
ROLLBACK;
