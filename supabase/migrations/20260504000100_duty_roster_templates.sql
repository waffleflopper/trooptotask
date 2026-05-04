CREATE TABLE IF NOT EXISTS "public"."duty_roster_templates" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "organization_id" "uuid" NOT NULL,
  "name" "text" NOT NULL,
  "slug" "text" NOT NULL,
  "short_code" "text",
  "status" "text" DEFAULT 'active'::"text" NOT NULL,
  "created_by_user_id" "uuid",
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "duty_roster_templates_name_check" CHECK ((length(btrim("name")) BETWEEN 1 AND 120)),
  CONSTRAINT "duty_roster_templates_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text")),
  CONSTRAINT "duty_roster_templates_short_code_check" CHECK (("short_code" IS NULL OR length(btrim("short_code")) BETWEEN 1 AND 12)),
  CONSTRAINT "duty_roster_templates_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);

ALTER TABLE "public"."duty_roster_templates" OWNER TO "postgres";

ALTER TABLE ONLY "public"."duty_roster_templates"
  ADD CONSTRAINT "duty_roster_templates_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."duty_roster_templates"
  ADD CONSTRAINT "duty_roster_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."duty_roster_templates"
  ADD CONSTRAINT "duty_roster_templates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "duty_roster_templates_org_slug_key" ON "public"."duty_roster_templates" USING "btree" ("organization_id", "slug");

CREATE INDEX IF NOT EXISTS "duty_roster_templates_org_status_name_idx" ON "public"."duty_roster_templates" USING "btree" ("organization_id", "status", "name");

CREATE OR REPLACE TRIGGER "duty_roster_templates_updated_at"
  BEFORE UPDATE ON "public"."duty_roster_templates"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE "public"."duty_roster_templates" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view duty roster templates if they can view calendar data" ON "public"."duty_roster_templates";
DROP POLICY IF EXISTS "Users can manage duty roster templates if they can edit calendar assignments" ON "public"."duty_roster_templates";

CREATE POLICY "Users can view duty roster templates if they can view calendar data"
  ON "public"."duty_roster_templates"
  FOR SELECT
  USING ("public"."can_view_calendar"("organization_id"));

CREATE POLICY "Users can manage duty roster templates if they can edit calendar assignments"
  ON "public"."duty_roster_templates"
  FOR ALL
  USING ("public"."can_edit_calendar"("organization_id"))
  WITH CHECK ("public"."can_edit_calendar"("organization_id"));

REVOKE ALL ON TABLE "public"."duty_roster_templates" FROM "anon";
GRANT ALL ON TABLE "public"."duty_roster_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_roster_templates" TO "service_role";
