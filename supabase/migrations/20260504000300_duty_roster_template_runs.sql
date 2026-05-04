CREATE TABLE IF NOT EXISTS "public"."duty_roster_template_runs" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "organization_id" "uuid" NOT NULL,
  "template_id" "uuid" NOT NULL,
  "template_name" "text" NOT NULL,
  "status" "text" DEFAULT 'accepted'::"text" NOT NULL,
  "start_date" "date" NOT NULL,
  "end_date" "date" NOT NULL,
  "snapshot_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
  "accepted_by_user_id" "uuid",
  "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "duty_roster_template_runs_status_check" CHECK (("status" = 'accepted'::"text")),
  CONSTRAINT "duty_roster_template_runs_snapshot_payload_object_check" CHECK (("jsonb_typeof"("snapshot_payload") = 'object'::"text"))
);

ALTER TABLE "public"."duty_roster_template_runs" OWNER TO "postgres";

ALTER TABLE ONLY "public"."duty_roster_template_runs"
  ADD CONSTRAINT "duty_roster_template_runs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."duty_roster_template_runs"
  ADD CONSTRAINT "duty_roster_template_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."duty_roster_template_runs"
  ADD CONSTRAINT "duty_roster_template_runs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."duty_roster_templates"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."duty_roster_template_runs"
  ADD CONSTRAINT "duty_roster_template_runs_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "duty_roster_template_runs_org_template_accepted_idx"
  ON "public"."duty_roster_template_runs" USING "btree" ("organization_id", "template_id", "accepted_at" DESC);

CREATE OR REPLACE TRIGGER "duty_roster_template_runs_updated_at"
  BEFORE UPDATE ON "public"."duty_roster_template_runs"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE "public"."duty_roster_template_runs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view accepted duty roster template runs if they can view calendar data" ON "public"."duty_roster_template_runs";
DROP POLICY IF EXISTS "Users can accept duty roster template runs if they can edit calendar assignments" ON "public"."duty_roster_template_runs";

CREATE POLICY "Users can view accepted duty roster template runs if they can view calendar data"
  ON "public"."duty_roster_template_runs"
  FOR SELECT
  USING ("public"."can_view_calendar"("organization_id"));

CREATE POLICY "Users can accept duty roster template runs if they can edit calendar assignments"
  ON "public"."duty_roster_template_runs"
  FOR INSERT
  WITH CHECK ("public"."can_edit_calendar"("organization_id"));

REVOKE ALL ON TABLE "public"."duty_roster_template_runs" FROM "anon";
GRANT ALL ON TABLE "public"."duty_roster_template_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_roster_template_runs" TO "service_role";
