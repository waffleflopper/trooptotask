SELECT is((SELECT count(*)::integer FROM upgrade_fixture.training_readiness_goal_current_rows),10,'all saved witnesses remain');
SELECT results_eq($$SELECT * FROM upgrade_fixture.training_readiness_goal_current_rows ORDER BY 1,2$$,
  $$SELECT * FROM upgrade_fixture.training_readiness_goal_before_rows ORDER BY 1,2$$,'upgrade preserves every saved ID and value');
SELECT col_type_is('public','organizations','training_readiness_goal_percent','smallint','goal is a smallint');
SELECT col_not_null('public','organizations','training_readiness_goal_percent','goal is required');
SELECT col_default_is('public','organizations','training_readiness_goal_percent','90','goal defaults to 90');
SELECT is((SELECT array_agg(training_readiness_goal_percent::integer ORDER BY id) FROM public.organizations WHERE id::text LIKE 'f1501000-%'),
  ARRAY[90,90],'existing Organizations read the default goal');
SELECT throws_ok($$UPDATE public.organizations SET training_readiness_goal_percent=0 WHERE id='f1501000-0000-4000-8000-000000000101'$$,
  '23514',NULL,'goal 0 is rejected');
SELECT throws_ok($$UPDATE public.organizations SET training_readiness_goal_percent=101 WHERE id='f1501000-0000-4000-8000-000000000101'$$,
  '23514',NULL,'goal 101 is rejected');
SELECT throws_ok($$UPDATE public.organizations SET training_readiness_goal_percent=NULL WHERE id='f1501000-0000-4000-8000-000000000101'$$,
  '23502',NULL,'blank goal is rejected');
SELECT lives_ok($$UPDATE public.organizations SET training_readiness_goal_percent=1 WHERE id='f1501000-0000-4000-8000-000000000101'$$,'goal 1 is accepted');
SELECT lives_ok($$UPDATE public.organizations SET training_readiness_goal_percent=100 WHERE id='f1501000-0000-4000-8000-000000000101'$$,'goal 100 is accepted');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','f1501000-0000-4000-8000-000000000003',true);
SELECT is((SELECT training_readiness_goal_percent::integer FROM public.organizations WHERE id='f1501000-0000-4000-8000-000000000101'),100,'member reads the Organization goal');
WITH changed AS (UPDATE public.organizations SET training_readiness_goal_percent=50 WHERE id='f1501000-0000-4000-8000-000000000101' RETURNING id)
SELECT is(count(*)::integer,0,'member cannot change the goal') FROM changed;
SELECT set_config('request.jwt.claim.sub','f1501000-0000-4000-8000-000000000004',true);
SELECT is_empty($$SELECT id FROM public.organizations WHERE id='f1501000-0000-4000-8000-000000000101'$$,'foreign owner cannot read the goal');
WITH changed AS (UPDATE public.organizations SET training_readiness_goal_percent=50 WHERE id='f1501000-0000-4000-8000-000000000101' RETURNING id)
SELECT is(count(*)::integer,0,'foreign owner cannot change the goal') FROM changed;
SELECT set_config('request.jwt.claim.sub','f1501000-0000-4000-8000-000000000002',true);
WITH changed AS (UPDATE public.organizations SET training_readiness_goal_percent=75 WHERE id='f1501000-0000-4000-8000-000000000101' RETURNING training_readiness_goal_percent::integer goal)
SELECT is(array_agg(goal),ARRAY[75],'admin changes the goal') FROM changed;
SELECT set_config('request.jwt.claim.sub','f1501000-0000-4000-8000-000000000001',true);
WITH changed AS (UPDATE public.organizations SET training_readiness_goal_percent=85 WHERE id='f1501000-0000-4000-8000-000000000101' RETURNING training_readiness_goal_percent::integer goal)
SELECT is(array_agg(goal),ARRAY[85],'owner changes the goal') FROM changed;
SELECT throws_ok($$UPDATE public.organizations SET training_readiness_goal_percent=101 WHERE id='f1501000-0000-4000-8000-000000000101'$$,
  '23514',NULL,'owner cannot save goal 101');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','',true);
SELECT results_eq($$SELECT id::text, training_readiness_goal_percent::integer FROM public.organizations WHERE id::text LIKE 'f1501000-%' ORDER BY id$$,
  $$VALUES ('f1501000-0000-4000-8000-000000000101',85),('f1501000-0000-4000-8000-000000000102',90)$$,
  'only the privileged Organization change persisted');
