CREATE TABLE IF NOT EXISTS "public"."advanced_duty_run_snapshots" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "organization_id" "uuid" NOT NULL,
  "template_id" "uuid" NOT NULL,
  "template_name" "text" NOT NULL,
  "pattern" "text" DEFAULT 'single'::"text" NOT NULL,
  "start_date" "date" NOT NULL,
  "end_date" "date" NOT NULL,
  "event_count" integer DEFAULT 0 NOT NULL,
  "event_dates" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
  "candidate_personnel_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
  "draft_lineage_key" "text" NOT NULL,
  "snapshot_fingerprint" "text" NOT NULL,
  "snapshot_version" integer DEFAULT 1 NOT NULL,
  "status" "text" DEFAULT 'draft'::"text" NOT NULL,
  "input_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
  "snapshot_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
  "preview_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
  "export_model" "jsonb",
  "created_by_user_id" "uuid",
  "applied_run_id" "uuid",
  "apply_error" "text",
  "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
  "applied_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "advanced_duty_run_snapshots_date_order_check" CHECK (("start_date" <= "end_date")),
  CONSTRAINT "advanced_duty_run_snapshots_event_count_check" CHECK (("event_count" >= 0)),
  CONSTRAINT "advanced_duty_run_snapshots_pattern_check" CHECK (("pattern" = ANY (ARRAY['single'::"text", 'daily'::"text", 'weekday-only'::"text", 'weekend-only'::"text", 'selected-weekdays'::"text", 'holiday-closure-only'::"text", 'custom-dates'::"text"]))),
  CONSTRAINT "advanced_duty_run_snapshots_snapshot_version_check" CHECK (("snapshot_version" >= 1)),
  CONSTRAINT "advanced_duty_run_snapshots_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'applying'::"text", 'applied'::"text", 'apply-failed'::"text", 'partial-failure'::"text", 'expired'::"text"]))),
  CONSTRAINT "advanced_duty_run_snapshots_payload_arrays_check" CHECK (("jsonb_typeof"("event_dates") = 'array'::"text" AND "jsonb_typeof"("candidate_personnel_ids") = 'array'::"text")),
  CONSTRAINT "advanced_duty_run_snapshots_payload_objects_check" CHECK (("jsonb_typeof"("input_payload") = 'object'::"text" AND "jsonb_typeof"("snapshot_payload") = 'object'::"text" AND "jsonb_typeof"("preview_payload") = 'object'::"text")),
  CONSTRAINT "advanced_duty_run_snapshots_export_model_object_check" CHECK (("export_model" IS NULL OR "jsonb_typeof"("export_model") = 'object'::"text"))
);

ALTER TABLE "public"."advanced_duty_run_snapshots" OWNER TO "postgres";

ALTER TABLE ONLY "public"."advanced_duty_run_snapshots"
  ADD CONSTRAINT "advanced_duty_run_snapshots_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."advanced_duty_run_snapshots"
  ADD CONSTRAINT "advanced_duty_run_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."advanced_duty_run_snapshots"
  ADD CONSTRAINT "advanced_duty_run_snapshots_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."duty_templates"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."advanced_duty_run_snapshots"
  ADD CONSTRAINT "advanced_duty_run_snapshots_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."advanced_duty_run_snapshots"
  ADD CONSTRAINT "advanced_duty_run_snapshots_applied_run_id_fkey" FOREIGN KEY ("applied_run_id") REFERENCES "public"."duty_event_runs"("id") ON DELETE SET NULL;

CREATE INDEX "advanced_duty_run_snapshots_org_status_expires_idx" ON "public"."advanced_duty_run_snapshots" USING "btree" ("organization_id", "status", "expires_at");

CREATE INDEX "advanced_duty_run_snapshots_template_idx" ON "public"."advanced_duty_run_snapshots" USING "btree" ("template_id", "created_at" DESC);

CREATE UNIQUE INDEX "advanced_duty_run_snapshots_current_draft_lineage_key" ON "public"."advanced_duty_run_snapshots" USING "btree" ("organization_id", "draft_lineage_key") WHERE ("status" = 'draft'::"text");

CREATE INDEX "advanced_duty_run_snapshots_cleanup_idx" ON "public"."advanced_duty_run_snapshots" USING "btree" ("expires_at") WHERE ("status" = 'draft'::"text");

CREATE INDEX "advanced_duty_run_snapshots_applying_recovery_idx" ON "public"."advanced_duty_run_snapshots" USING "btree" ("organization_id", "updated_at") WHERE ("status" = 'applying'::"text");

CREATE OR REPLACE TRIGGER "advanced_duty_run_snapshots_updated_at"
  BEFORE UPDATE ON "public"."advanced_duty_run_snapshots"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

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
    "p_snapshot_data" -> 'export_model',
    NULLIF("p_snapshot_data" ->> 'created_by_user_id', '')::"uuid"
  )
  RETURNING * INTO "v_inserted";

  RETURN "v_inserted";
END;
$$;

ALTER FUNCTION "public"."replace_advanced_duty_run_snapshot"("p_org_id" "uuid", "p_draft_lineage_key" "text", "p_snapshot_data" "jsonb") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."replace_advanced_duty_run_snapshot"("p_org_id" "uuid", "p_draft_lineage_key" "text", "p_snapshot_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_advanced_duty_run_snapshot"("p_org_id" "uuid", "p_draft_lineage_key" "text", "p_snapshot_data" "jsonb") TO "service_role";

ALTER TABLE "public"."advanced_duty_run_snapshots" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins can manage advanced duty run snapshots" ON "public"."advanced_duty_run_snapshots";

CREATE POLICY "Org admins can manage advanced duty run snapshots" ON "public"."advanced_duty_run_snapshots" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "advanced_duty_run_snapshots"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "advanced_duty_run_snapshots"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"]))))));

REVOKE ALL ON TABLE "public"."advanced_duty_run_snapshots" FROM "anon";
GRANT ALL ON TABLE "public"."advanced_duty_run_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."advanced_duty_run_snapshots" TO "service_role";
