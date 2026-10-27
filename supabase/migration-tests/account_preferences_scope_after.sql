BEGIN;
SET LOCAL search_path = public, extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is((SELECT preference_count FROM upgrade_fixture.account_preferences_baseline), 1, 'preference policy hid the historical foreign row before upgrade');
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.account_preferences_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT * FROM upgrade_fixture.account_preferences_before_rows ORDER BY table_name, row_id $$,
  'upgrade preserves preference and roster identities, saved values and timestamps'
);
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.account_preferences_current_metadata ORDER BY object_name $$,
  $$ SELECT * FROM upgrade_fixture.account_preferences_before_metadata ORDER BY object_name $$,
  'upgrade preserves preference grants, RLS flags, columns, constraints, triggers and membership helper grants'
);
SELECT hasnt_table('public', 'getting_started_progress', 'setup retires the old checklist on populated upgrade');
SELECT results_eq(
  $$ SELECT organization_id, branch, answers, finished_at FROM public.organization_setup
     WHERE organization_id::text LIKE 'd2600000-%' ORDER BY organization_id $$,
  $$ VALUES ('d2600000-0000-4000-8000-000000000101'::uuid, NULL::text,
     '{"groups":"reviewed","ranks":"reviewed","calendar":"reviewed"}'::jsonb, NULL::timestamptz) $$,
  'only an existing active roster receives the three reviewed-default marks'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd2600000-0000-4000-8000-000000000001', true);
SELECT results_eq(
  $$ SELECT id FROM public.user_org_preferences ORDER BY id $$,
  $$ VALUES ('d2600000-0000-4000-8000-000000000401'::uuid) $$,
  'upgraded actor still sees only its saved preferences in current membership'
);
WITH changed AS (
  UPDATE public.user_org_preferences SET preferences = jsonb_set(preferences, '{calendar,showStatusText}', 'false')
  WHERE id = 'd2600000-0000-4000-8000-000000000401' RETURNING preferences
)
SELECT is((SELECT preferences FROM changed),
  '{"calendar":{"showStatusText":false,"showPersonnelRoles":false},"training":{"matrixViewMode":"alphabetical","selectedGroupId":null},"historicalSentinel":"retain"}'::jsonb,
  'upgraded member can update its own saved preferences without losing neighboring keys');
WITH changed AS (
  UPDATE public.user_org_preferences SET preferences = '{}'
  WHERE id = 'd2600000-0000-4000-8000-000000000402' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM changed), 0, 'upgraded member cannot change its historical foreign preferences');
WITH removed AS (
  DELETE FROM public.user_org_preferences WHERE id = 'd2600000-0000-4000-8000-000000000403' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'upgraded member cannot delete peer preferences');
SELECT throws_ok(
  $$ UPDATE public.user_org_preferences SET organization_id = 'd2600000-0000-4000-8000-000000000102'
     WHERE id = 'd2600000-0000-4000-8000-000000000401' $$,
  '42501', NULL, 'upgraded member cannot move preferences outside membership'
);

RESET ROLE;
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.account_preferences_current_rows
     WHERE row_id <> 'd2600000-0000-4000-8000-000000000401' ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.account_preferences_before_rows
     WHERE row_id <> 'd2600000-0000-4000-8000-000000000401' ORDER BY table_name, row_id $$,
  'ordinary preference update changes no neighboring rows'
);
SELECT is((SELECT to_jsonb(r) - 'preferences' - 'updated_at' FROM public.user_org_preferences r WHERE id = 'd2600000-0000-4000-8000-000000000401'),
  (SELECT row_data - 'preferences' - 'updated_at' FROM upgrade_fixture.account_preferences_before_rows WHERE row_id = 'd2600000-0000-4000-8000-000000000401'),
  'preference update preserves saved identity, Organization, user and creation timestamp');

SELECT * FROM finish();
ROLLBACK;
