ALTER TABLE "public"."duty_roster_templates"
  ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "idx_duty_roster_templates_org_archived_name"
  ON "public"."duty_roster_templates" USING "btree" ("organization_id", "archived_at", "name");
