BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email)
SELECT ('f8100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'dod-id-' || n || '@example.test'
FROM generate_series(1, 3) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('f8100000-0000-4000-8000-000000000101', 'DoD Alpha', 'f8100000-0000-4000-8000-000000000001'),
  ('f8100000-0000-4000-8000-000000000102', 'DoD Bravo', 'f8100000-0000-4000-8000-000000000001');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('f8100000-0000-4000-8000-000000000201', 'f8100000-0000-4000-8000-000000000101', 'Alpha'),
  ('f8100000-0000-4000-8000-000000000202', 'f8100000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.organization_memberships
  (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids)
VALUES
  ('f8100000-0000-4000-8000-000000000101', 'f8100000-0000-4000-8000-000000000002',
   'member', 'viewer', '{"personnel":"operate"}', 'groups', ARRAY['f8100000-0000-4000-8000-000000000201']::uuid[]),
  ('f8100000-0000-4000-8000-000000000102', 'f8100000-0000-4000-8000-000000000002',
   'member', 'viewer', '{"personnel":"operate"}', 'organization', ARRAY[]::uuid[]),
  ('f8100000-0000-4000-8000-000000000101', 'f8100000-0000-4000-8000-000000000003',
   'member', 'viewer', '{"personnel":"view"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('f8100000-0000-4000-8000-000000000301', 'f8100000-0000-4000-8000-000000000101', 'f8100000-0000-4000-8000-000000000201', 'SGT', 'One', 'Alpha', 'dod-one', NULL),
  ('f8100000-0000-4000-8000-000000000302', 'f8100000-0000-4000-8000-000000000101', 'f8100000-0000-4000-8000-000000000201', 'SPC', 'Two', 'Alpha', 'dod-two', NULL),
  ('f8100000-0000-4000-8000-000000000303', 'f8100000-0000-4000-8000-000000000101', 'f8100000-0000-4000-8000-000000000202', 'SGT', 'Archived', 'Bravo', 'dod-archived', '2026-01-01'),
  ('f8100000-0000-4000-8000-000000000304', 'f8100000-0000-4000-8000-000000000102', NULL, 'SPC', 'Other', 'Organization', 'dod-other', NULL);
INSERT INTO public.personnel_extended_info (organization_id, personnel_id, dod_id) VALUES
  ('f8100000-0000-4000-8000-000000000101', 'f8100000-0000-4000-8000-000000000303', '9876543210');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f8100000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"f8100000-0000-4000-8000-000000000002","role":"authenticated"}', true);

INSERT INTO public.personnel_extended_info (organization_id, personnel_id, dod_id) VALUES
  ('f8100000-0000-4000-8000-000000000101', 'f8100000-0000-4000-8000-000000000301', '0123456789'),
  ('f8100000-0000-4000-8000-000000000101', 'f8100000-0000-4000-8000-000000000302', NULL);
SELECT is((SELECT dod_id FROM public.personnel_extended_info WHERE personnel_id = 'f8100000-0000-4000-8000-000000000301'),
  '0123456789', 'ordinary operate member inserts and reads a DoD ID, retaining its leading zero');
UPDATE public.personnel_extended_info SET dod_id = '1234567890'
WHERE personnel_id = 'f8100000-0000-4000-8000-000000000301';
SELECT is((SELECT dod_id FROM public.personnel_extended_info WHERE personnel_id = 'f8100000-0000-4000-8000-000000000301'),
  '1234567890', 'ordinary operate member updates and reads a DoD ID');
SELECT throws_ok($$ UPDATE public.personnel_extended_info SET dod_id = '1234567890'
  WHERE personnel_id = 'f8100000-0000-4000-8000-000000000302' $$,
  '23505', NULL, 'duplicate DoD ID in the same Organization is rejected');
SELECT throws_ok($$ UPDATE public.personnel_extended_info SET dod_id = '9876543210'
  WHERE personnel_id = 'f8100000-0000-4000-8000-000000000302' $$,
  '23505', NULL, 'archived Person outside the Group still reserves their DoD ID');
SELECT throws_ok($$ UPDATE public.personnel_extended_info SET dod_id = '123-45-6789'
  WHERE personnel_id = 'f8100000-0000-4000-8000-000000000302' $$,
  '23514', NULL, 'database rejects unnormalized DoD ID');
SELECT throws_ok($$ UPDATE public.personnel_extended_info SET dod_id = '123456789a'
  WHERE personnel_id = 'f8100000-0000-4000-8000-000000000302' $$,
  '23514', NULL, 'database rejects a non-digit DoD ID');
SELECT throws_ok($$ UPDATE public.personnel_extended_info SET dod_id = '123456789'
  WHERE personnel_id = 'f8100000-0000-4000-8000-000000000302' $$,
  '23514', NULL, 'database rejects a short DoD ID');
SELECT throws_ok($$ UPDATE public.personnel_extended_info SET dod_id = '12345678901'
  WHERE personnel_id = 'f8100000-0000-4000-8000-000000000302' $$,
  '23514', NULL, 'database rejects a long DoD ID');
INSERT INTO public.personnel_extended_info (organization_id, personnel_id, dod_id) VALUES
  ('f8100000-0000-4000-8000-000000000102', 'f8100000-0000-4000-8000-000000000304', '1234567890');
SELECT is((SELECT dod_id FROM public.personnel_extended_info WHERE personnel_id = 'f8100000-0000-4000-8000-000000000304'),
  '1234567890', 'the same DoD ID is allowed in another Organization');
SELECT is((SELECT count(dod_id)::integer FROM public.personnel_extended_info WHERE personnel_id = 'f8100000-0000-4000-8000-000000000303'),
  0, 'operate member cannot read a DoD ID outside their Groups');
WITH changed AS (UPDATE public.personnel_extended_info SET dod_id = '1111111111'
  WHERE personnel_id = 'f8100000-0000-4000-8000-000000000303' RETURNING dod_id)
SELECT is(count(*)::integer, 0, 'operate member cannot change a DoD ID outside their Groups') FROM changed;
UPDATE public.personnel_extended_info SET dod_id = NULL
WHERE personnel_id = 'f8100000-0000-4000-8000-000000000301';
SELECT is((SELECT count(*)::integer FROM public.personnel_extended_info WHERE dod_id IS NULL),
  2, 'multiple unset DoD IDs are allowed and clearing persists null');

SELECT set_config('request.jwt.claim.sub', 'f8100000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"sub":"f8100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT is((SELECT count(dod_id)::integer FROM public.personnel_extended_info),
  0, 'view-only member cannot read DoD IDs');
WITH changed AS (UPDATE public.personnel_extended_info SET dod_id = '1111111111' RETURNING dod_id)
SELECT is(count(*)::integer, 0, 'view-only member cannot update DoD IDs') FROM changed;
SELECT throws_ok($$ INSERT INTO public.personnel_extended_info (organization_id, personnel_id, dod_id) VALUES
  ('f8100000-0000-4000-8000-000000000101', 'f8100000-0000-4000-8000-000000000301', '1111111111') $$,
  '42501', NULL, 'view-only member cannot insert DoD IDs');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
