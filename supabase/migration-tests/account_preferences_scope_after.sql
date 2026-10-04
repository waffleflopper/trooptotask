BEGIN;
SET LOCAL search_path = public, extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

SELECT ok((SELECT migration_absent FROM upgrade_fixture.account_preferences_baseline), 'saved rows preceded the progress-scope migration');
SELECT is((SELECT progress_count FROM upgrade_fixture.account_preferences_baseline), 2, 'old policy exposed own historical progress outside membership');
SELECT is((SELECT preference_count FROM upgrade_fixture.account_preferences_baseline), 1, 'old preference policy already hid the historical foreign row');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20261004000100'), 1, 'scope migration is recorded after populated upgrade');
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.account_preferences_current_rows ORDER BY table_name, row_id $$,
  $$ SELECT * FROM upgrade_fixture.account_preferences_before_rows ORDER BY table_name, row_id $$,
  'upgrade preserves every saved ID, value and timestamp, including hidden historical rows'
);
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.account_preferences_current_metadata ORDER BY object_name $$,
  $$ SELECT * FROM upgrade_fixture.account_preferences_before_metadata ORDER BY object_name $$,
  'upgrade preserves table grants, RLS flags, columns, constraints, triggers, membership helper and preference policies'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd2600000-0000-4000-8000-000000000001', true);
SELECT results_eq(
  $$ SELECT id FROM public.getting_started_progress ORDER BY id $$,
  $$ VALUES ('d2600000-0000-4000-8000-000000000301'::uuid) $$,
  'upgraded actor sees only its saved progress in current membership'
);
SELECT results_eq(
  $$ SELECT id FROM public.user_org_preferences ORDER BY id $$,
  $$ VALUES ('d2600000-0000-4000-8000-000000000401'::uuid) $$,
  'upgraded actor still sees only its saved preferences in current membership'
);
WITH changed AS (
  UPDATE public.getting_started_progress SET dismissed_at = NULL
  WHERE id = 'd2600000-0000-4000-8000-000000000301' RETURNING dismissed_at
)
SELECT ok((SELECT dismissed_at IS NULL FROM changed), 'upgraded member can reset its saved dismissal');
WITH changed AS (
  UPDATE public.getting_started_progress SET dismissed_at = NULL
  WHERE id = 'd2600000-0000-4000-8000-000000000302' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM changed), 0, 'upgraded member cannot change its historical foreign dismissal');
WITH removed AS (
  DELETE FROM public.getting_started_progress WHERE id = 'd2600000-0000-4000-8000-000000000303' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'upgraded member cannot delete its peer progress');
SELECT throws_ok(
  $$ UPDATE public.getting_started_progress SET organization_id = 'd2600000-0000-4000-8000-000000000102'
     WHERE id = 'd2600000-0000-4000-8000-000000000301' $$,
  '42501', NULL, 'upgraded member cannot move progress outside membership'
);

RESET ROLE;
SELECT results_eq(
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.account_preferences_current_rows
     WHERE row_id <> 'd2600000-0000-4000-8000-000000000301' ORDER BY table_name, row_id $$,
  $$ SELECT table_name, row_id, row_data FROM upgrade_fixture.account_preferences_before_rows
     WHERE row_id <> 'd2600000-0000-4000-8000-000000000301' ORDER BY table_name, row_id $$,
  'ordinary reset changes no neighboring saved rows or preference values'
);
SELECT is((SELECT to_jsonb(r) - 'dismissed_at' FROM public.getting_started_progress r WHERE id = 'd2600000-0000-4000-8000-000000000301'),
  (SELECT row_data - 'dismissed_at' FROM upgrade_fixture.account_preferences_before_rows WHERE row_id = 'd2600000-0000-4000-8000-000000000301'),
  'reset preserves its saved identity, Organization, user and creation timestamp');

SELECT * FROM finish();
ROLLBACK;
