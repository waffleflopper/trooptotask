-- Run after the populated D01 fixture and forward D02 migrations in a disposable project.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is(
  (SELECT count(*)::integer
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     AND c.relname IN (
       'duty_event_slots', 'duty_events', 'duty_event_runs',
       'duty_template_rotation_baselines', 'duty_template_slots',
       'duty_templates', 'duty_roster_history'
     )),
  0,
  'all seven legacy Duty relations are retired'
);
SELECT is(
  (SELECT count(*)::integer
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     AND c.relname IN (
       'duty_roster_templates', 'duty_roster_template_runs',
       'duty_roster_template_run_corrections'
     )),
  3,
  'Calendar generation relations remain for the final cutover'
);
SELECT is(
  (SELECT count(*)::integer FROM public.daily_assignments
   WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000601'
                AND 'a6010000-0000-4000-8000-000000000609'),
  9,
  'all nine saved Calendar assignments remain'
);
SELECT is(
  (SELECT count(*)::integer FROM public.assignment_types
   WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000401'
                AND 'a6010000-0000-4000-8000-000000000405'),
  5,
  'all five Calendar assignment types remain'
);
SELECT is(
  (SELECT count(*)::integer FROM public.sign_in_rosters
   WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000901'
                AND 'a6010000-0000-4000-8000-000000000903'),
  3,
  'three independent Sign-In Rosters remain'
);

SELECT * FROM finish();
ROLLBACK;
