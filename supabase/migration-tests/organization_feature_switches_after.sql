BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(3);
SELECT ok((SELECT migration_absent FROM upgrade_fixture.organization_feature_switches_baseline),
  'the saved Organization precedes the feature switch migration');
SELECT is(
  (SELECT jsonb_build_array(disabled_features, strength_floor_percent) FROM public.organizations
    WHERE id='f1521000-0000-4000-8000-000000000101'),
  '[[], 80]'::jsonb,
  'an existing Organization keeps every feature on with an 80 percent strength floor');
SELECT is(
  (SELECT jsonb_object_agg(k, to_jsonb(r)->k)
    FROM public.organizations r, upgrade_fixture.organization_feature_switches_baseline b,
      jsonb_object_keys(b.organization_row) k
    WHERE r.id='f1521000-0000-4000-8000-000000000101'),
  (SELECT organization_row FROM upgrade_fixture.organization_feature_switches_baseline),
  'the upgrade leaves every Organization column that existed before it as it was');
SELECT * FROM finish();
ROLLBACK;
