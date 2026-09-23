-- Fail before the D02 cutover if the reviewed pre-retirement boundary drifted.
-- The owner must still compare the private hosted report, drain old callers and
-- verify a restore point before releasing these migrations.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  required_name text;
  required_signature text;
  unexpected_function text;
  duty_relations regclass[];
BEGIN
  FOREACH required_name IN ARRAY ARRAY[
    'advanced_duty_run_snapshots', 'advanced_duty_revision_drafts',
    'advanced_duty_revision_change_sets', 'advanced_duty_revision_slot_changes',
    'duty_templates', 'duty_template_slots', 'duty_template_rotation_baselines',
    'duty_event_runs', 'duty_events', 'duty_event_slots', 'duty_roster_history',
    'duty_roster_templates', 'duty_roster_template_runs',
    'duty_roster_template_run_corrections', 'assignment_types',
    'daily_assignments', 'status_types', 'sign_in_rosters'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = required_name AND c.relkind = 'r'
    ) THEN
      RAISE EXCEPTION 'Missing pre-retirement table: public.%', required_name;
    END IF;
  END LOOP;

  FOREACH required_signature IN ARRAY ARRAY[
    'public.advanced_duty_revision_actor_can_manage(uuid)',
    'public.apply_advanced_duty_revision(uuid,uuid,jsonb,jsonb,jsonb,jsonb,timestamp with time zone)',
    'public.replace_advanced_duty_run_snapshot(uuid,text,jsonb)',
    'public.update_advanced_duty_event_aggregate(uuid,uuid,jsonb,jsonb)',
    'public.update_advanced_duty_template_aggregate(uuid,uuid,jsonb,jsonb,jsonb)',
    'public.delete_unused_organization_rank_catalog_entry(uuid,uuid,text)'
  ] LOOP
    IF to_regprocedure(required_signature) IS NULL THEN
      RAISE EXCEPTION 'Missing pre-retirement function: %', required_signature;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.daily_assignments'::regclass
      AND confrelid = 'public.duty_roster_template_runs'::regclass
      AND conname = 'daily_assignments_duty_roster_template_run_id_fkey'
      AND contype = 'f'
  ) THEN
    RAISE EXCEPTION 'Expected Calendar run foreign key is absent';
  END IF;

  duty_relations := ARRAY[
    'public.advanced_duty_run_snapshots'::regclass,
    'public.advanced_duty_revision_drafts'::regclass,
    'public.advanced_duty_revision_change_sets'::regclass,
    'public.advanced_duty_revision_slot_changes'::regclass,
    'public.duty_templates'::regclass,
    'public.duty_template_slots'::regclass,
    'public.duty_template_rotation_baselines'::regclass,
    'public.duty_event_runs'::regclass,
    'public.duty_events'::regclass,
    'public.duty_event_slots'::regclass,
    'public.duty_roster_history'::regclass,
    'public.duty_roster_templates'::regclass,
    'public.duty_roster_template_runs'::regclass,
    'public.duty_roster_template_run_corrections'::regclass
  ];
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = ANY (duty_relations)
      AND c.conrelid <> ALL (duty_relations)
      AND NOT (
        c.conrelid = 'public.daily_assignments'::regclass
        AND c.conname = 'daily_assignments_duty_roster_template_run_id_fkey'
      )
  ) THEN
    RAISE EXCEPTION 'Unreviewed retained foreign key references Duty schema';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.daily_assignments s
    JOIN public.assignment_types t ON t.id = s.assignment_type_id
    WHERE s.organization_id IS DISTINCT FROM t.organization_id
  ) OR EXISTS (
    SELECT 1 FROM public.duty_roster_templates d
    JOIN public.assignment_types t ON t.id = d.assignment_type_id
    WHERE d.organization_id IS DISTINCT FROM t.organization_id
  ) OR EXISTS (
    SELECT 1 FROM public.duty_roster_history h
    JOIN public.assignment_types t ON t.id = h.assignment_type_id
    WHERE h.organization_id IS DISTINCT FROM t.organization_id
  ) THEN
    RAISE EXCEPTION 'Cross-Organization Calendar type provenance requires private review';
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO unexpected_function
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'auth', 'storage')
    AND p.prokind IN ('f', 'p')
    AND pg_get_functiondef(p.oid) ~* 'duty_roster|advanced_duty|duty_event|duty_template|roster_history|da6_'
    AND p.oid <> ALL (ARRAY[
      'public.advanced_duty_revision_actor_can_manage(uuid)'::regprocedure,
      'public.apply_advanced_duty_revision(uuid,uuid,jsonb,jsonb,jsonb,jsonb,timestamp with time zone)'::regprocedure,
      'public.replace_advanced_duty_run_snapshot(uuid,text,jsonb)'::regprocedure,
      'public.update_advanced_duty_event_aggregate(uuid,uuid,jsonb,jsonb)'::regprocedure,
      'public.update_advanced_duty_template_aggregate(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure,
      'public.delete_unused_organization_rank_catalog_entry(uuid,uuid,text)'::regprocedure
    ]);
  IF unexpected_function IS NOT NULL THEN
    RAISE EXCEPTION 'Unreviewed Duty function body: %', unexpected_function;
  END IF;
END $preflight$;
COMMIT;
