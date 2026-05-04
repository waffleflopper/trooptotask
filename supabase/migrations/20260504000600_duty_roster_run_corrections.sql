CREATE TABLE IF NOT EXISTS "public"."duty_roster_template_run_corrections" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "organization_id" "uuid" NOT NULL,
  "run_id" "uuid" NOT NULL,
  "run_row_date" "date" NOT NULL,
  "original_assignee_id" "uuid" NOT NULL,
  "replacement_assignee_id" "uuid" NOT NULL,
  "reason" "text" NOT NULL,
  "corrected_by_user_id" "uuid",
  "corrected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "duty_roster_template_run_corrections_reason_check" CHECK (("length"("btrim"("reason")) > 0))
);

ALTER TABLE "public"."duty_roster_template_run_corrections" OWNER TO "postgres";

ALTER TABLE ONLY "public"."duty_roster_template_run_corrections"
  ADD CONSTRAINT "duty_roster_template_run_corrections_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."duty_roster_template_run_corrections"
  ADD CONSTRAINT "duty_roster_template_run_corrections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."duty_roster_template_run_corrections"
  ADD CONSTRAINT "duty_roster_template_run_corrections_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."duty_roster_template_runs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."duty_roster_template_run_corrections"
  ADD CONSTRAINT "duty_roster_template_run_corrections_original_assignee_id_fkey" FOREIGN KEY ("original_assignee_id") REFERENCES "public"."personnel"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."duty_roster_template_run_corrections"
  ADD CONSTRAINT "duty_roster_template_run_corrections_replacement_assignee_id_fkey" FOREIGN KEY ("replacement_assignee_id") REFERENCES "public"."personnel"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."duty_roster_template_run_corrections"
  ADD CONSTRAINT "duty_roster_template_run_corrections_corrected_by_user_id_fkey" FOREIGN KEY ("corrected_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "duty_roster_template_run_corrections_org_run_idx"
  ON "public"."duty_roster_template_run_corrections" USING "btree" ("organization_id", "run_id", "run_row_date", "corrected_at");

ALTER TABLE "public"."duty_roster_template_run_corrections" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view duty roster corrections if they can view calendar data" ON "public"."duty_roster_template_run_corrections";
DROP POLICY IF EXISTS "Users can record duty roster corrections if they can edit calendar assignments" ON "public"."duty_roster_template_run_corrections";

CREATE POLICY "Users can view duty roster corrections if they can view calendar data"
  ON "public"."duty_roster_template_run_corrections"
  FOR SELECT
  USING ("public"."can_view_calendar"("organization_id"));

CREATE POLICY "Users can record duty roster corrections if they can edit calendar assignments"
  ON "public"."duty_roster_template_run_corrections"
  FOR INSERT
  WITH CHECK ("public"."can_edit_calendar"("organization_id"));

REVOKE ALL ON TABLE "public"."duty_roster_template_run_corrections" FROM "anon";
GRANT ALL ON TABLE "public"."duty_roster_template_run_corrections" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_roster_template_run_corrections" TO "service_role";
