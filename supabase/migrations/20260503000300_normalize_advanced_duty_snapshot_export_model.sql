CREATE OR REPLACE FUNCTION "public"."replace_advanced_duty_run_snapshot"(
  "p_org_id" "uuid",
  "p_draft_lineage_key" "text",
  "p_snapshot_data" "jsonb"
) RETURNS "public"."advanced_duty_run_snapshots"
LANGUAGE "plpgsql"
SECURITY INVOKER
SET "search_path" = "public"
AS $$
DECLARE
  "v_inserted" "public"."advanced_duty_run_snapshots";
BEGIN
  PERFORM "pg_advisory_xact_lock"("hashtextextended"("p_org_id"::"text" || ':' || "p_draft_lineage_key", 0));

  DELETE FROM "public"."advanced_duty_run_snapshots"
   WHERE "organization_id" = "p_org_id"
     AND "status" = 'draft'::"text"
     AND "draft_lineage_key" = "p_draft_lineage_key";

  INSERT INTO "public"."advanced_duty_run_snapshots" (
    "organization_id",
    "template_id",
    "template_name",
    "pattern",
    "start_date",
    "end_date",
    "event_count",
    "event_dates",
    "candidate_personnel_ids",
    "draft_lineage_key",
    "snapshot_fingerprint",
    "snapshot_version",
    "status",
    "input_payload",
    "snapshot_payload",
    "preview_payload",
    "export_model",
    "created_by_user_id"
  )
  VALUES (
    "p_org_id",
    ("p_snapshot_data" ->> 'template_id')::"uuid",
    "p_snapshot_data" ->> 'template_name',
    COALESCE("p_snapshot_data" ->> 'pattern', 'single'),
    ("p_snapshot_data" ->> 'start_date')::"date",
    ("p_snapshot_data" ->> 'end_date')::"date",
    COALESCE(("p_snapshot_data" ->> 'event_count')::integer, 0),
    COALESCE("p_snapshot_data" -> 'event_dates', '[]'::"jsonb"),
    COALESCE("p_snapshot_data" -> 'candidate_personnel_ids', '[]'::"jsonb"),
    "p_draft_lineage_key",
    "p_snapshot_data" ->> 'snapshot_fingerprint',
    COALESCE(("p_snapshot_data" ->> 'snapshot_version')::integer, 1),
    'draft',
    COALESCE("p_snapshot_data" -> 'input_payload', '{}'::"jsonb"),
    COALESCE("p_snapshot_data" -> 'snapshot_payload', '{}'::"jsonb"),
    COALESCE("p_snapshot_data" -> 'preview_payload', '{}'::"jsonb"),
    CASE
      WHEN jsonb_typeof("p_snapshot_data" -> 'export_model') = 'null' THEN NULL
      ELSE "p_snapshot_data" -> 'export_model'
    END,
    NULLIF("p_snapshot_data" ->> 'created_by_user_id', '')::"uuid"
  )
  RETURNING * INTO "v_inserted";

  RETURN "v_inserted";
END;
$$;

ALTER FUNCTION "public"."replace_advanced_duty_run_snapshot"("p_org_id" "uuid", "p_draft_lineage_key" "text", "p_snapshot_data" "jsonb") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."replace_advanced_duty_run_snapshot"("p_org_id" "uuid", "p_draft_lineage_key" "text", "p_snapshot_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_advanced_duty_run_snapshot"("p_org_id" "uuid", "p_draft_lineage_key" "text", "p_snapshot_data" "jsonb") TO "service_role";
