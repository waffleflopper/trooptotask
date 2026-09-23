-- Apply the preflight, retained-schema detachment, and restrictive Duty drops
-- in one migration transaction, including the migration ledger entry.

-- Fail before the D02 cutover if the reviewed pre-retirement boundary drifted.
-- The owner must still compare the private hosted report, drain old callers and
-- verify a restore point before releasing these migrations.
SET search_path = pg_catalog;
SET lock_timeout = '5s';
SET statement_timeout = '60s';

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

CREATE OR REPLACE FUNCTION "public"."delete_unused_organization_rank_catalog_entry"(
  "p_organization_id" uuid,
  "p_entry_id" uuid,
  "p_code" text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  "catalog_entry" "public"."organization_rank_catalog"%ROWTYPE;
  "allow_normalized_match" boolean;
  "reference_count" integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended("p_organization_id"::text, 1248));

  SELECT *
    INTO "catalog_entry"
    FROM "public"."organization_rank_catalog"
    WHERE "organization_id" = "p_organization_id"
      AND "id" = "p_entry_id"
      AND "code" = "p_code"
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rank catalog entry could not be removed'
      USING ERRCODE = 'P0002';
  END IF;

  IF "catalog_entry"."source" = 'built-in' THEN
    RAISE EXCEPTION 'Built-in ranks cannot be removed. Retire them instead.'
      USING ERRCODE = '23514';
  END IF;

  LOCK TABLE
    "public"."personnel",
    "public"."training_types",
    "public"."sign_in_rosters"
    IN SHARE MODE;

  SELECT NOT EXISTS (
    SELECT 1
    FROM "public"."organization_rank_catalog" AS "other_entry"
    WHERE "other_entry"."organization_id" = "p_organization_id"
      AND "other_entry"."id" <> "p_entry_id"
      AND upper(btrim(regexp_replace("other_entry"."code", '[[:space:]]+', ' ', 'g')))
        = upper(btrim(regexp_replace("p_code", '[[:space:]]+', ' ', 'g')))
  )
  INTO "allow_normalized_match";

  SELECT
    (
      SELECT count(*)::integer
      FROM "public"."personnel"
      WHERE "organization_id" = "p_organization_id"
        AND "public"."organization_rank_catalog_reference_matches"("rank", "p_code", "allow_normalized_match")
    )
    + (
      SELECT count(*)::integer
      FROM "public"."training_types"
      WHERE "organization_id" = "p_organization_id"
        AND (
          EXISTS (
            SELECT 1
            FROM unnest("applies_to_ranks") AS "rank_filter"("rank_code")
            WHERE "public"."organization_rank_catalog_reference_matches"(
              "rank_filter"."rank_code",
              "p_code",
              "allow_normalized_match"
            )
          )
          OR EXISTS (
            SELECT 1
            FROM unnest("excluded_ranks") AS "rank_filter"("rank_code")
            WHERE "public"."organization_rank_catalog_reference_matches"(
              "rank_filter"."rank_code",
              "p_code",
              "allow_normalized_match"
            )
          )
        )
    )
    + (
      SELECT count(*)::integer
      FROM "public"."sign_in_rosters"
      WHERE "organization_id" = "p_organization_id"
        AND (
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof("filter_config" -> 'ranks') = 'array'
                  THEN "filter_config" -> 'ranks'
                ELSE '[]'::jsonb
              END
            ) AS "rank_filter"("rank_code")
            WHERE "public"."organization_rank_catalog_reference_matches"(
              "rank_filter"."rank_code",
              "p_code",
              "allow_normalized_match"
            )
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof("personnel_snapshot") = 'array'
                  THEN "personnel_snapshot"
                ELSE '[]'::jsonb
              END
            ) AS "snapshot_person"("person")
            WHERE "public"."organization_rank_catalog_reference_matches"(
              "snapshot_person"."person" ->> 'rank',
              "p_code",
              "allow_normalized_match"
            )
          )
        )
    )
  INTO "reference_count";

  IF "reference_count" > 0 THEN
    RAISE EXCEPTION 'Rank is referenced by Organization data. Retire it instead.'
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM "public"."organization_rank_catalog"
  WHERE "organization_id" = "p_organization_id"
    AND "id" = "p_entry_id";
END;
$$;

-- Saved Calendar assignments are authoritative. D01 captured old run/date
-- provenance before this migration; retain every assignment and type row.
ALTER TABLE public.daily_assignments
  DROP CONSTRAINT daily_assignments_duty_roster_template_run_id_fkey;

DROP INDEX public.daily_assignments_duty_roster_template_run_idx;

ALTER TABLE public.daily_assignments
  DROP COLUMN duty_roster_template_run_id,
  DROP COLUMN duty_roster_template_run_row_date;

-- Calendar availability keeps its status rows and ordinary presentation fields.
-- The retired DA6 classifier and its check have no retained consumers.
ALTER TABLE public.status_types
  DROP CONSTRAINT status_types_da6_availability_treatment_check,
  DROP COLUMN da6_availability_treatment,
  DROP COLUMN da6_treatment_reviewed;

-- The advanced snapshot/revision model has no retained Calendar consumer.
-- Drop the typed-return RPC before its table, then child tables before parents.
-- Leave legacy event and Calendar generation relations for the next cutovers.
DROP FUNCTION public.replace_advanced_duty_run_snapshot(uuid, text, jsonb);

DROP TABLE public.advanced_duty_revision_slot_changes;
DROP TABLE public.advanced_duty_revision_change_sets;
DROP TABLE public.advanced_duty_revision_drafts;
DROP TABLE public.advanced_duty_run_snapshots;

DROP FUNCTION public.advanced_duty_revision_actor_can_manage(uuid);
DROP FUNCTION public.apply_advanced_duty_revision(uuid, uuid, jsonb, jsonb, jsonb, jsonb, timestamp with time zone);
DROP FUNCTION public.update_advanced_duty_event_aggregate(uuid, uuid, jsonb, jsonb);
DROP FUNCTION public.update_advanced_duty_template_aggregate(uuid, uuid, jsonb, jsonb, jsonb);

-- Legacy Duty event, template and history rows are no longer read by the app.
-- Calendar generation relations are retired separately after this dependent group.
-- Drop children first so retained Calendar and Personnel relations need no CASCADE.
DROP TABLE public.duty_event_slots;
DROP TABLE public.duty_events;
DROP TABLE public.duty_event_runs;
DROP TABLE public.duty_template_rotation_baselines;
DROP TABLE public.duty_template_slots;
DROP TABLE public.duty_templates;
DROP TABLE public.duty_roster_history;

-- Calendar assignments and their types are independent of these former
-- generation records. Retire children first; no retained relation is dropped.
DROP TABLE public.duty_roster_template_run_corrections;
DROP TABLE public.duty_roster_template_runs;
DROP TABLE public.duty_roster_templates;

-- Keep migration-only settings from affecting later files in the same CLI session.
RESET search_path;
RESET lock_timeout;
RESET statement_timeout;
