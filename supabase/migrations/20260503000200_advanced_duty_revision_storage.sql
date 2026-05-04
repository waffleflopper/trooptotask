CREATE OR REPLACE FUNCTION "public"."advanced_duty_revision_actor_can_manage"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR (
          "organization_memberships"."access_scope_kind" = 'organization'
          AND "public"."member_access_required_capability_rank"(
            "public"."member_access_lane_capability"(
              "organization_memberships"."member_preset",
              "organization_memberships"."capability_overrides",
              'calendar'
            )
          ) >= "public"."member_access_required_capability_rank"('operate')
        )
      )
  );
$$;

ALTER FUNCTION "public"."advanced_duty_revision_actor_can_manage"("p_organization_id" "uuid") OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."advanced_duty_revision_drafts" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "organization_id" "uuid" NOT NULL,
  "applied_run_id" "uuid" NOT NULL,
  "source_snapshot_id" "uuid",
  "source_snapshot_fingerprint" "text",
  "source_run_created_at" timestamp with time zone,
  "source_run_updated_at" timestamp with time zone,
  "status" "text" DEFAULT 'draft'::"text" NOT NULL,
  "slot_changes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
  "reason" "text",
  "latest_validation" "jsonb",
  "latest_error" "text",
  "conflict_summary" "jsonb",
  "draft_version" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" "uuid",
  "updated_by_user_id" "uuid",
  "applied_by_user_id" "uuid",
  "discarded_by_user_id" "uuid",
  "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
  "discard_cleanup_after" timestamp with time zone,
  "applied_at" timestamp with time zone,
  "discarded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "advanced_duty_revision_drafts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'applied'::"text", 'discarded'::"text"]))),
  CONSTRAINT "advanced_duty_revision_drafts_slot_changes_array_check" CHECK (("jsonb_typeof"("slot_changes") = 'array'::"text")),
  CONSTRAINT "advanced_duty_revision_drafts_validation_metadata_object_check" CHECK ((("latest_validation" IS NULL) OR ("jsonb_typeof"("latest_validation") = 'object'::"text"))),
  CONSTRAINT "advanced_duty_revision_drafts_conflict_summary_object_check" CHECK ((("conflict_summary" IS NULL) OR ("jsonb_typeof"("conflict_summary") = 'object'::"text"))),
  CONSTRAINT "advanced_duty_revision_drafts_version_check" CHECK (("draft_version" >= 1))
);

ALTER TABLE "public"."advanced_duty_revision_drafts" OWNER TO "postgres";

ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
  ADD CONSTRAINT "advanced_duty_revision_drafts_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
  ADD CONSTRAINT "advanced_duty_revision_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
  ADD CONSTRAINT "advanced_duty_revision_drafts_applied_run_id_fkey" FOREIGN KEY ("applied_run_id") REFERENCES "public"."duty_event_runs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
  ADD CONSTRAINT "advanced_duty_revision_drafts_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."advanced_duty_run_snapshots"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
  ADD CONSTRAINT "advanced_duty_revision_drafts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
  ADD CONSTRAINT "advanced_duty_revision_drafts_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
  ADD CONSTRAINT "advanced_duty_revision_drafts_applied_by_user_id_fkey" FOREIGN KEY ("applied_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
  ADD CONSTRAINT "advanced_duty_revision_drafts_discarded_by_user_id_fkey" FOREIGN KEY ("discarded_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "advanced_duty_revision_drafts_one_active_run_idx" ON "public"."advanced_duty_revision_drafts" USING "btree" ("organization_id", "applied_run_id") WHERE ("status" = 'draft'::"text");

CREATE INDEX IF NOT EXISTS "advanced_duty_revision_drafts_run_status_idx" ON "public"."advanced_duty_revision_drafts" USING "btree" ("organization_id", "applied_run_id", "status");

CREATE INDEX IF NOT EXISTS "advanced_duty_revision_drafts_expiration_idx" ON "public"."advanced_duty_revision_drafts" USING "btree" ("expires_at") WHERE ("status" = 'draft'::"text");

CREATE INDEX IF NOT EXISTS "advanced_duty_revision_drafts_discard_cleanup_idx" ON "public"."advanced_duty_revision_drafts" USING "btree" ("discard_cleanup_after") WHERE ("status" = 'discarded'::"text");

CREATE OR REPLACE TRIGGER "advanced_duty_revision_drafts_updated_at"
  BEFORE UPDATE ON "public"."advanced_duty_revision_drafts"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE TABLE IF NOT EXISTS "public"."advanced_duty_revision_change_sets" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "organization_id" "uuid" NOT NULL,
  "applied_run_id" "uuid" NOT NULL,
  "source_draft_id" "uuid",
  "source_snapshot_id" "uuid",
  "source_snapshot_fingerprint" "text",
  "reason" "text" NOT NULL,
  "actor_user_id" "uuid",
  "reviewable_conflicts_confirmed" boolean DEFAULT false NOT NULL,
  "conflict_summary" "jsonb",
  "warning_summary" "jsonb",
  "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "advanced_duty_revision_change_sets_reason_check" CHECK (("length"("btrim"("reason")) > 0)),
  CONSTRAINT "advanced_duty_revision_change_sets_conflict_summary_object_check" CHECK ((("conflict_summary" IS NULL) OR ("jsonb_typeof"("conflict_summary") = 'object'::"text"))),
  CONSTRAINT "advanced_duty_revision_change_sets_warning_summary_object_check" CHECK ((("warning_summary" IS NULL) OR ("jsonb_typeof"("warning_summary") = 'object'::"text")))
);

ALTER TABLE "public"."advanced_duty_revision_change_sets" OWNER TO "postgres";

ALTER TABLE ONLY "public"."advanced_duty_revision_change_sets"
  ADD CONSTRAINT "advanced_duty_revision_change_sets_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."advanced_duty_revision_change_sets"
  ADD CONSTRAINT "advanced_duty_revision_change_sets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."advanced_duty_revision_change_sets"
  ADD CONSTRAINT "advanced_duty_revision_change_sets_applied_run_id_fkey" FOREIGN KEY ("applied_run_id") REFERENCES "public"."duty_event_runs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."advanced_duty_revision_change_sets"
  ADD CONSTRAINT "advanced_duty_revision_change_sets_source_draft_id_fkey" FOREIGN KEY ("source_draft_id") REFERENCES "public"."advanced_duty_revision_drafts"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."advanced_duty_revision_change_sets"
  ADD CONSTRAINT "advanced_duty_revision_change_sets_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."advanced_duty_run_snapshots"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."advanced_duty_revision_change_sets"
  ADD CONSTRAINT "advanced_duty_revision_change_sets_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "advanced_duty_revision_change_sets_run_applied_idx" ON "public"."advanced_duty_revision_change_sets" USING "btree" ("organization_id", "applied_run_id", "applied_at" DESC);

CREATE INDEX IF NOT EXISTS "advanced_duty_revision_change_sets_source_draft_idx" ON "public"."advanced_duty_revision_change_sets" USING "btree" ("source_draft_id");

CREATE TABLE IF NOT EXISTS "public"."advanced_duty_revision_slot_changes" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "organization_id" "uuid" NOT NULL,
  "change_set_id" "uuid" NOT NULL,
  "duty_event_id" "uuid",
  "event_date" "date" NOT NULL,
  "slot_key" "text" NOT NULL,
  "template_slot_id" "uuid",
  "role_label" "text" NOT NULL,
  "slot_index" integer NOT NULL,
  "previous_personnel_id" "uuid",
  "new_personnel_id" "uuid",
  "previous_personnel_snapshot" "jsonb",
  "new_personnel_snapshot" "jsonb",
  "previous_assignment_source" "text",
  "new_assignment_source" "text",
  "previous_warning_state" "text",
  "new_warning_state" "text",
  "change_intent" "text" NOT NULL,
  "warning_metadata" "jsonb",
  "conflict_metadata" "jsonb",
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "advanced_duty_revision_slot_changes_slot_index_check" CHECK (("slot_index" >= 0)),
  CONSTRAINT "advanced_duty_revision_slot_changes_assignment_source_check" CHECK ((("previous_assignment_source" IS NULL) OR ("previous_assignment_source" = ANY (ARRAY['generated'::"text", 'manual'::"text", 'locked'::"text"])))),
  CONSTRAINT "advanced_duty_revision_slot_changes_new_assignment_source_check" CHECK ((("new_assignment_source" IS NULL) OR ("new_assignment_source" = ANY (ARRAY['generated'::"text", 'manual'::"text", 'locked'::"text"])))),
  CONSTRAINT "advanced_duty_revision_slot_changes_warning_state_check" CHECK ((("previous_warning_state" IS NULL) OR ("previous_warning_state" = ANY (ARRAY['none'::"text", 'warning'::"text", 'conflict'::"text"])))),
  CONSTRAINT "advanced_duty_revision_slot_changes_new_warning_state_check" CHECK ((("new_warning_state" IS NULL) OR ("new_warning_state" = ANY (ARRAY['none'::"text", 'warning'::"text", 'conflict'::"text"])))),
  CONSTRAINT "advanced_duty_revision_slot_changes_change_intent_check" CHECK (("change_intent" = ANY (ARRAY['assign'::"text", 'clear'::"text", 'lock-assigned'::"text", 'lock-open'::"text"]))),
  CONSTRAINT "advanced_duty_revision_slot_changes_personnel_snapshots_object_check" CHECK ((("previous_personnel_snapshot" IS NULL) OR ("jsonb_typeof"("previous_personnel_snapshot") = 'object'::"text")) AND (("new_personnel_snapshot" IS NULL) OR ("jsonb_typeof"("new_personnel_snapshot") = 'object'::"text"))),
  CONSTRAINT "advanced_duty_revision_slot_changes_metadata_objects_check" CHECK ((("warning_metadata" IS NULL) OR ("jsonb_typeof"("warning_metadata") = 'object'::"text")) AND (("conflict_metadata" IS NULL) OR ("jsonb_typeof"("conflict_metadata") = 'object'::"text")))
);

ALTER TABLE "public"."advanced_duty_revision_slot_changes" OWNER TO "postgres";

ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
  ADD CONSTRAINT "advanced_duty_revision_slot_changes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
  ADD CONSTRAINT "advanced_duty_revision_slot_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
  ADD CONSTRAINT "advanced_duty_revision_slot_changes_change_set_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "public"."advanced_duty_revision_change_sets"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
  ADD CONSTRAINT "advanced_duty_revision_slot_changes_duty_event_id_fkey" FOREIGN KEY ("duty_event_id") REFERENCES "public"."duty_events"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
  ADD CONSTRAINT "advanced_duty_revision_slot_changes_template_slot_id_fkey" FOREIGN KEY ("template_slot_id") REFERENCES "public"."duty_template_slots"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
  ADD CONSTRAINT "advanced_duty_revision_slot_changes_previous_personnel_id_fkey" FOREIGN KEY ("previous_personnel_id") REFERENCES "public"."personnel"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
  ADD CONSTRAINT "advanced_duty_revision_slot_changes_new_personnel_id_fkey" FOREIGN KEY ("new_personnel_id") REFERENCES "public"."personnel"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "advanced_duty_revision_slot_changes_change_set_idx" ON "public"."advanced_duty_revision_slot_changes" USING "btree" ("change_set_id", "event_date", "slot_index");

CREATE INDEX IF NOT EXISTS "advanced_duty_revision_slot_changes_run_display_idx" ON "public"."advanced_duty_revision_slot_changes" USING "btree" ("organization_id", "event_date", "slot_key");

ALTER TABLE "public"."advanced_duty_revision_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."advanced_duty_revision_change_sets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."advanced_duty_revision_slot_changes" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Advanced duty actors can manage revision drafts" ON "public"."advanced_duty_revision_drafts";
DROP POLICY IF EXISTS "Calendar viewers can read advanced duty revision history" ON "public"."advanced_duty_revision_change_sets";
DROP POLICY IF EXISTS "Advanced duty actors can write advanced duty revision history" ON "public"."advanced_duty_revision_change_sets";
DROP POLICY IF EXISTS "Calendar viewers can read advanced duty revision slot history" ON "public"."advanced_duty_revision_slot_changes";
DROP POLICY IF EXISTS "Advanced duty actors can write advanced duty revision slot history" ON "public"."advanced_duty_revision_slot_changes";

CREATE POLICY "Advanced duty actors can manage revision drafts" ON "public"."advanced_duty_revision_drafts" USING ("public"."advanced_duty_revision_actor_can_manage"("organization_id")) WITH CHECK ("public"."advanced_duty_revision_actor_can_manage"("organization_id"));

CREATE POLICY "Calendar viewers can read advanced duty revision history" ON "public"."advanced_duty_revision_change_sets" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));

CREATE POLICY "Advanced duty actors can write advanced duty revision history" ON "public"."advanced_duty_revision_change_sets" FOR ALL USING ("public"."advanced_duty_revision_actor_can_manage"("organization_id")) WITH CHECK ("public"."advanced_duty_revision_actor_can_manage"("organization_id"));

CREATE POLICY "Calendar viewers can read advanced duty revision slot history" ON "public"."advanced_duty_revision_slot_changes" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));

CREATE POLICY "Advanced duty actors can write advanced duty revision slot history" ON "public"."advanced_duty_revision_slot_changes" FOR ALL USING ("public"."advanced_duty_revision_actor_can_manage"("organization_id")) WITH CHECK ("public"."advanced_duty_revision_actor_can_manage"("organization_id"));

CREATE OR REPLACE FUNCTION "public"."apply_advanced_duty_revision"(
  "p_org_id" "uuid",
  "p_draft_id" "uuid",
  "p_slot_updates" "jsonb",
  "p_change_set_data" "jsonb",
  "p_slot_change_rows" "jsonb",
  "p_applied_draft_data" "jsonb",
  "p_now" timestamp with time zone
) RETURNS "jsonb"
LANGUAGE "plpgsql"
SECURITY INVOKER
SET "search_path" = "public"
AS $$
DECLARE
  "v_change_set_row" "public"."advanced_duty_revision_change_sets";
  "v_draft_row" "public"."advanced_duty_revision_drafts";
  "v_slot_change_rows" "jsonb" := '[]'::"jsonb";
  "v_requested_slot_count" integer := 0;
  "v_existing_slot_count" integer := 0;
  "v_requested_event_count" integer := 0;
  "v_existing_event_count" integer := 0;
  "v_event_id" "uuid";
BEGIN
  IF "jsonb_typeof"(COALESCE("p_slot_updates", '[]'::"jsonb")) <> 'array' THEN
    RAISE EXCEPTION 'Advanced Duty revision slot updates must be an array.' USING ERRCODE = '22023';
  END IF;

  IF "jsonb_typeof"(COALESCE("p_slot_change_rows", '[]'::"jsonb")) <> 'array' THEN
    RAISE EXCEPTION 'Advanced Duty revision slot change rows must be an array.' USING ERRCODE = '22023';
  END IF;

  WITH "requested_slots" AS (
    SELECT DISTINCT ("value" ->> 'id')::"uuid" AS "id"
    FROM "jsonb_array_elements"(COALESCE("p_slot_updates", '[]'::"jsonb")) AS "value"
  )
  SELECT COUNT(*) INTO "v_requested_slot_count" FROM "requested_slots";

  WITH "requested_slots" AS (
    SELECT DISTINCT ("value" ->> 'id')::"uuid" AS "id"
    FROM "jsonb_array_elements"(COALESCE("p_slot_updates", '[]'::"jsonb")) AS "value"
  )
  SELECT COUNT(*) INTO "v_existing_slot_count"
  FROM "public"."duty_event_slots"
  JOIN "requested_slots" ON "requested_slots"."id" = "duty_event_slots"."id"
  WHERE "duty_event_slots"."organization_id" = "p_org_id";

  IF "v_existing_slot_count" <> "v_requested_slot_count" THEN
    RAISE EXCEPTION 'The applied duty slot no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  WITH "requested_events" AS (
    SELECT DISTINCT ("value" ->> 'duty_event_id')::"uuid" AS "id"
    FROM "jsonb_array_elements"(COALESCE("p_slot_updates", '[]'::"jsonb")) AS "value"
  )
  SELECT COUNT(*) INTO "v_requested_event_count" FROM "requested_events";

  WITH "requested_events" AS (
    SELECT DISTINCT ("value" ->> 'duty_event_id')::"uuid" AS "id"
    FROM "jsonb_array_elements"(COALESCE("p_slot_updates", '[]'::"jsonb")) AS "value"
  )
  SELECT COUNT(*) INTO "v_existing_event_count"
  FROM "public"."duty_events"
  JOIN "requested_events" ON "requested_events"."id" = "duty_events"."id"
  WHERE "duty_events"."organization_id" = "p_org_id";

  IF "v_existing_event_count" <> "v_requested_event_count" THEN
    RAISE EXCEPTION 'The applied duty event no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE "public"."duty_event_slots"
  SET
    "assignee_id" = "slot_updates"."assignee_id",
    "assignment_source" = "slot_updates"."assignment_source",
    "warning_state" = "slot_updates"."warning_state",
    "selection_reason" = "slot_updates"."selection_reason",
    "unfilled_reason" = "slot_updates"."unfilled_reason"
  FROM "jsonb_to_recordset"(COALESCE("p_slot_updates", '[]'::"jsonb")) AS "slot_updates"(
    "id" "uuid",
    "duty_event_id" "uuid",
    "assignee_id" "uuid",
    "assignment_source" "text",
    "warning_state" "text",
    "selection_reason" "text",
    "unfilled_reason" "text"
  )
  WHERE "duty_event_slots"."organization_id" = "p_org_id"
    AND "duty_event_slots"."id" = "slot_updates"."id"
    AND "duty_event_slots"."duty_event_id" = "slot_updates"."duty_event_id";

  FOR "v_event_id" IN
    SELECT DISTINCT ("value" ->> 'duty_event_id')::"uuid"
    FROM "jsonb_array_elements"(COALESCE("p_slot_updates", '[]'::"jsonb")) AS "value"
  LOOP
    UPDATE "public"."duty_events"
    SET
      "fill_summary" = (
        SELECT "jsonb_build_object"(
          'totalSlots', COUNT(*),
          'filledSlots', COUNT(*) FILTER (WHERE "duty_event_slots"."assignee_id" IS NOT NULL),
          'unfilledSlots', COUNT(*) FILTER (WHERE "duty_event_slots"."assignee_id" IS NULL)
        )
        FROM "public"."duty_event_slots"
        WHERE "duty_event_slots"."organization_id" = "p_org_id"
          AND "duty_event_slots"."duty_event_id" = "v_event_id"
      ),
      "updated_at" = "p_now"
    WHERE "duty_events"."organization_id" = "p_org_id"
      AND "duty_events"."id" = "v_event_id";
  END LOOP;

  INSERT INTO "public"."advanced_duty_revision_change_sets"
  SELECT * FROM "jsonb_populate_record"(NULL::"public"."advanced_duty_revision_change_sets", "p_change_set_data")
  RETURNING * INTO "v_change_set_row";

  WITH "inserted_slot_changes" AS (
    INSERT INTO "public"."advanced_duty_revision_slot_changes"
    SELECT * FROM "jsonb_populate_recordset"(
      NULL::"public"."advanced_duty_revision_slot_changes",
      COALESCE("p_slot_change_rows", '[]'::"jsonb")
    )
    RETURNING *
  )
  SELECT COALESCE("jsonb_agg"("to_jsonb"("inserted_slot_changes")), '[]'::"jsonb")
  INTO "v_slot_change_rows"
  FROM "inserted_slot_changes";

  UPDATE "public"."advanced_duty_revision_drafts"
  SET
    "source_snapshot_id" = ("p_applied_draft_data" ->> 'source_snapshot_id')::"uuid",
    "source_snapshot_fingerprint" = "p_applied_draft_data" ->> 'source_snapshot_fingerprint',
    "source_run_created_at" = ("p_applied_draft_data" ->> 'source_run_created_at')::timestamp with time zone,
    "source_run_updated_at" = ("p_applied_draft_data" ->> 'source_run_updated_at')::timestamp with time zone,
    "status" = "p_applied_draft_data" ->> 'status',
    "slot_changes" = COALESCE("p_applied_draft_data" -> 'slot_changes', '[]'::"jsonb"),
    "reason" = "p_applied_draft_data" ->> 'reason',
    "latest_validation" = NULLIF("p_applied_draft_data" -> 'latest_validation', 'null'::"jsonb"),
    "latest_error" = "p_applied_draft_data" ->> 'latest_error',
    "conflict_summary" = NULLIF("p_applied_draft_data" -> 'conflict_summary', 'null'::"jsonb"),
    "draft_version" = ("p_applied_draft_data" ->> 'draft_version')::integer,
    "updated_by_user_id" = ("p_applied_draft_data" ->> 'updated_by_user_id')::"uuid",
    "applied_by_user_id" = ("p_applied_draft_data" ->> 'applied_by_user_id')::"uuid",
    "expires_at" = ("p_applied_draft_data" ->> 'expires_at')::timestamp with time zone,
    "applied_at" = "p_now",
    "updated_at" = "p_now"
  WHERE "advanced_duty_revision_drafts"."organization_id" = "p_org_id"
    AND "advanced_duty_revision_drafts"."id" = "p_draft_id"
    AND "advanced_duty_revision_drafts"."status" = 'draft'::"text"
  RETURNING * INTO "v_draft_row";

  IF "v_draft_row"."id" IS NULL THEN
    RAISE EXCEPTION 'Advanced Duty revision draft not found.' USING ERRCODE = 'P0002';
  END IF;

  RETURN "jsonb_build_object"(
    'changeSetRow', "to_jsonb"("v_change_set_row"),
    'slotChangeRows', "v_slot_change_rows",
    'draftRow', "to_jsonb"("v_draft_row")
  );
END;
$$;

ALTER FUNCTION "public"."apply_advanced_duty_revision"("p_org_id" "uuid", "p_draft_id" "uuid", "p_slot_updates" "jsonb", "p_change_set_data" "jsonb", "p_slot_change_rows" "jsonb", "p_applied_draft_data" "jsonb", "p_now" timestamp with time zone) OWNER TO "postgres";

REVOKE ALL ON TABLE "public"."advanced_duty_revision_drafts" FROM "anon";
REVOKE ALL ON TABLE "public"."advanced_duty_revision_change_sets" FROM "anon";
REVOKE ALL ON TABLE "public"."advanced_duty_revision_slot_changes" FROM "anon";

GRANT ALL ON TABLE "public"."advanced_duty_revision_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."advanced_duty_revision_drafts" TO "service_role";
GRANT ALL ON TABLE "public"."advanced_duty_revision_change_sets" TO "authenticated";
GRANT ALL ON TABLE "public"."advanced_duty_revision_change_sets" TO "service_role";
GRANT ALL ON TABLE "public"."advanced_duty_revision_slot_changes" TO "authenticated";
GRANT ALL ON TABLE "public"."advanced_duty_revision_slot_changes" TO "service_role";

GRANT ALL ON FUNCTION "public"."advanced_duty_revision_actor_can_manage"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."advanced_duty_revision_actor_can_manage"("p_organization_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."apply_advanced_duty_revision"("p_org_id" "uuid", "p_draft_id" "uuid", "p_slot_updates" "jsonb", "p_change_set_data" "jsonb", "p_slot_change_rows" "jsonb", "p_applied_draft_data" "jsonb", "p_now" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_advanced_duty_revision"("p_org_id" "uuid", "p_draft_id" "uuid", "p_slot_updates" "jsonb", "p_change_set_data" "jsonb", "p_slot_change_rows" "jsonb", "p_applied_draft_data" "jsonb", "p_now" timestamp with time zone) TO "service_role";
