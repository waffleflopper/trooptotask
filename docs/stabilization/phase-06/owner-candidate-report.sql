-- Phase 06 D01 pre-retirement candidate report. Owner-run only against a
-- separately approved target; keep all output private. This file makes no
-- schema or data changes and does not authorize the D02 migration.
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

DO $$
DECLARE
  required_table text;
  required_column record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Full RLS visibility is required for the Phase 06 candidate report';
  END IF;

  FOREACH required_table IN ARRAY ARRAY[
    'advanced_duty_run_snapshots', 'advanced_duty_revision_drafts',
    'advanced_duty_revision_change_sets', 'advanced_duty_revision_slot_changes',
    'duty_templates', 'duty_template_slots', 'duty_template_rotation_baselines',
    'duty_event_runs', 'duty_events', 'duty_event_slots', 'duty_roster_history',
    'duty_roster_templates', 'duty_roster_template_runs',
    'duty_roster_template_run_corrections', 'assignment_types',
    'daily_assignments', 'organizations', 'status_types', 'sign_in_rosters'
  ] LOOP
    IF to_regclass('public.' || required_table) IS NULL OR NOT
      has_table_privilege(current_user, 'public.' || required_table, 'SELECT') THEN
      RAISE EXCEPTION 'Missing or unreadable required relation: public.%', required_table;
    END IF;
  END LOOP;

  FOR required_column IN
    SELECT * FROM (VALUES
      ('daily_assignments', 'duty_roster_template_run_id'),
      ('daily_assignments', 'duty_roster_template_run_row_date'),
      ('status_types', 'da6_availability_treatment'),
      ('status_types', 'da6_treatment_reviewed'),
      ('duty_roster_templates', 'assignment_type_id'),
      ('duty_roster_history', 'assignment_type_id')
    ) AS expected(relation_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = to_regclass('public.' || required_column.relation_name)
        AND attname = required_column.column_name AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'Missing pre-retirement column: public.%.%',
        required_column.relation_name, required_column.column_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260922000300'
  ) THEN
    RAISE EXCEPTION 'Expected Phase 05 archive guard migration is absent';
  END IF;
END $$;

-- Counts are exact, including empty tables. A timeout, permission error,
-- missing relation or unexpected nonzero count needs owner review.
SELECT relation_name, row_count FROM (
  SELECT 'advanced_duty_run_snapshots' AS relation_name, count(*) AS row_count FROM public.advanced_duty_run_snapshots
  UNION ALL SELECT 'advanced_duty_revision_drafts', count(*) FROM public.advanced_duty_revision_drafts
  UNION ALL SELECT 'advanced_duty_revision_change_sets', count(*) FROM public.advanced_duty_revision_change_sets
  UNION ALL SELECT 'advanced_duty_revision_slot_changes', count(*) FROM public.advanced_duty_revision_slot_changes
  UNION ALL SELECT 'duty_templates', count(*) FROM public.duty_templates
  UNION ALL SELECT 'duty_template_slots', count(*) FROM public.duty_template_slots
  UNION ALL SELECT 'duty_template_rotation_baselines', count(*) FROM public.duty_template_rotation_baselines
  UNION ALL SELECT 'duty_event_runs', count(*) FROM public.duty_event_runs
  UNION ALL SELECT 'duty_events', count(*) FROM public.duty_events
  UNION ALL SELECT 'duty_event_slots', count(*) FROM public.duty_event_slots
  UNION ALL SELECT 'duty_roster_history', count(*) FROM public.duty_roster_history
  UNION ALL SELECT 'duty_roster_templates', count(*) FROM public.duty_roster_templates
  UNION ALL SELECT 'duty_roster_template_runs', count(*) FROM public.duty_roster_template_runs
  UNION ALL SELECT 'duty_roster_template_run_corrections', count(*) FROM public.duty_roster_template_run_corrections
) AS duty_counts ORDER BY relation_name;

-- This deliberately reports every Calendar type, including types with no
-- surviving Duty link. A present or absent link does not prove creation
-- origin. No names, personnel records or saved assignment payloads leave SQL.
WITH saved AS (
  SELECT organization_id, assignment_type_id, count(*) AS row_count,
    count(*) FILTER (WHERE duty_roster_template_run_id IS NOT NULL) AS run_linked,
    count(*) FILTER (WHERE duty_roster_template_run_row_date IS NOT NULL) AS row_date_linked
  FROM public.daily_assignments GROUP BY organization_id, assignment_type_id
), templates AS (
  SELECT organization_id, assignment_type_id, count(*) AS row_count
  FROM public.duty_roster_templates GROUP BY organization_id, assignment_type_id
), history AS (
  SELECT organization_id, assignment_type_id, count(*) AS row_count
  FROM public.duty_roster_history GROUP BY organization_id, assignment_type_id
)
SELECT t.organization_id, t.id AS assignment_type_id,
  coalesce(s.row_count, 0) AS saved_assignments,
  coalesce(s.run_linked, 0) AS run_linked_assignments,
  coalesce(s.row_date_linked, 0) AS row_date_linked_assignments,
  coalesce(d.row_count, 0) AS template_links,
  coalesce(h.row_count, 0) AS history_links
FROM public.assignment_types AS t
LEFT JOIN saved AS s ON s.organization_id = t.organization_id AND s.assignment_type_id = t.id
LEFT JOIN templates AS d ON d.organization_id = t.organization_id AND d.assignment_type_id = t.id
LEFT JOIN history AS h ON h.organization_id = t.organization_id AND h.assignment_type_id = t.id
ORDER BY t.organization_id, t.id;

SELECT count(*) AS saved_assignment_count FROM public.daily_assignments;
SELECT count(*) AS assignment_type_count FROM public.assignment_types;
SELECT count(*) AS retained_sign_in_roster_count FROM public.sign_in_rosters;
SELECT count(*) AS retained_status_type_count FROM public.status_types;
SELECT count(*) AS retained_organization_count FROM public.organizations;
SELECT max(version) AS latest_migration_version,
  count(*) AS migration_count FROM supabase_migrations.schema_migrations;
COMMIT;
