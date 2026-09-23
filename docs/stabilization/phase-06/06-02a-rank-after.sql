-- Run against 06-01c-fixture.sql after the rank RPC migration. This is a
-- focused upgrade check; the full 06-01c-after.sql runs after all D02 drops.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO public.organization_rank_catalog
  (id, organization_id, code, label, service, category, pay_grade, source)
VALUES
  ('a6010000-0000-4000-8000-000000000805', 'a6010000-0000-4000-8000-000000000101', 'TRAIN-RANK', 'Training Rank', 'army', 'enlisted', 'E-5', 'custom'),
  ('a6010000-0000-4000-8000-000000000806', 'a6010000-0000-4000-8000-000000000101', 'BUILTIN-RANK', 'Built-in Rank', 'army', 'enlisted', 'E-5', 'built-in');
INSERT INTO public.training_types
  (id, organization_id, name, applies_to_ranks)
VALUES
  ('a6010000-0000-4000-8000-000000000807', 'a6010000-0000-4000-8000-000000000101', 'Rank Training', ARRAY[' train-rank ']::text[]);

SELECT throws_ok($$SELECT public.delete_unused_organization_rank_catalog_entry('a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000801','KEEP')$$,
  '23503', NULL, 'Personnel and Sign-In references still block deleting KEEP');
SELECT throws_ok($$SELECT public.delete_unused_organization_rank_catalog_entry('a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000804','ROSTER-ONLY')$$,
  '23503', NULL, 'independent Sign-In snapshot alone still blocks deleting ROSTER-ONLY');
SELECT throws_ok($$SELECT public.delete_unused_organization_rank_catalog_entry('a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000805','TRAIN-RANK')$$,
  '23503', NULL, 'normalized Training rank reference still blocks deletion');
SELECT throws_ok($$SELECT public.delete_unused_organization_rank_catalog_entry('a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000806','BUILTIN-RANK')$$,
  '23514', NULL, 'built-in rank still cannot be deleted');
SELECT throws_ok($$SELECT public.delete_unused_organization_rank_catalog_entry('a6010000-0000-4000-8000-000000000102','a6010000-0000-4000-8000-000000000802','OLD-DUTY')$$,
  'P0002', NULL, 'foreign Organization cannot delete the Alpha rank');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a6010000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$SELECT public.delete_unused_organization_rank_catalog_entry('a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000802','OLD-DUTY')$$,
  '42501', NULL, 'authenticated owner still cannot execute the service-role-only RPC');
RESET ROLE;

SELECT lives_ok($$SELECT public.delete_unused_organization_rank_catalog_entry('a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000802','OLD-DUTY')$$,
  'former Duty-only reference no longer blocks deletion');
SELECT is((SELECT count(*)::integer FROM public.organization_rank_catalog WHERE id='a6010000-0000-4000-8000-000000000802'),0,
  'former Duty-only rank row is actually deleted');
SELECT lives_ok($$SELECT public.delete_unused_organization_rank_catalog_entry('a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000803','UNUSED')$$,
  'unreferenced rank remains deletable');
SELECT is((SELECT count(*)::integer FROM public.organization_rank_catalog WHERE id='a6010000-0000-4000-8000-000000000803'),0,
  'unreferenced rank row is actually deleted');
SELECT is((SELECT count(*)::integer FROM public.daily_assignments WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000601' AND 'a6010000-0000-4000-8000-000000000609'),9,
  'all saved Calendar assignments remain after rank RPC replacement');
SELECT is((SELECT count(*)::integer FROM public.assignment_types WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000401' AND 'a6010000-0000-4000-8000-000000000405'),5,
  'all Calendar assignment types remain after rank RPC replacement');
SELECT is((SELECT count(*)::integer FROM public.sign_in_rosters WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000901' AND 'a6010000-0000-4000-8000-000000000903'),3,
  'all independent Sign-In Rosters remain after rank RPC replacement');

SELECT * FROM finish();
ROLLBACK;
