-- Run after the D01 fixture and forward D02 migrations in a disposable project.
-- The advanced revision store is retired while saved Calendar facts survive.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is(
  (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND c.relname IN (
        'advanced_duty_run_snapshots',
        'advanced_duty_revision_drafts',
        'advanced_duty_revision_change_sets',
        'advanced_duty_revision_slot_changes'
      )),
  0,
  'advanced snapshot and revision relations are retired'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.oid::regprocedure::text IN (
      'advanced_duty_revision_actor_can_manage(uuid)',
      'apply_advanced_duty_revision(uuid,uuid,jsonb,jsonb,jsonb,jsonb,timestamp with time zone)',
      'replace_advanced_duty_run_snapshot(uuid,text,jsonb)',
      'update_advanced_duty_event_aggregate(uuid,uuid,jsonb,jsonb)',
      'update_advanced_duty_template_aggregate(uuid,uuid,jsonb,jsonb,jsonb)'
    )),
  0,
  'the five advanced Duty RPC signatures are retired'
);
SELECT is(
  (SELECT count(*)::integer FROM public.daily_assignments
    WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000601' AND 'a6010000-0000-4000-8000-000000000609'),
  9,
  'all nine saved Calendar assignments remain'
);
SELECT is(
  (SELECT count(*)::integer FROM public.assignment_types
    WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000401' AND 'a6010000-0000-4000-8000-000000000405'),
  5,
  'all five Calendar assignment types remain'
);
SELECT is(
  (SELECT count(*)::integer FROM public.sign_in_rosters
    WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000901' AND 'a6010000-0000-4000-8000-000000000903'),
  3,
  'three independent Sign-In Rosters remain'
);

SELECT * FROM finish();
ROLLBACK;
