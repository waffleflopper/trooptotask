ALTER TABLE "public"."duty_roster_templates"
  ADD COLUMN IF NOT EXISTS "assignment_type_id" "uuid";

INSERT INTO "public"."assignment_types" (
  "id",
  "organization_id",
  "name",
  "short_name",
  "assign_to",
  "color",
  "sort_order",
  "show_in_date_header",
  "exempt_personnel_ids"
)
SELECT
  "template"."id",
  "template"."organization_id",
  "template"."name",
  COALESCE(NULLIF("template"."short_code", ''), UPPER(LEFT("template"."name", 12))),
  'personnel',
  '#8a5a22',
  0,
  FALSE,
  ARRAY[]::"text"[]
FROM "public"."duty_roster_templates" AS "template"
WHERE NOT EXISTS (
  SELECT 1
  FROM "public"."assignment_types" AS "assignment_type"
  WHERE "assignment_type"."id" = "template"."id"
);

UPDATE "public"."duty_roster_templates"
   SET "assignment_type_id" = "id"
 WHERE "assignment_type_id" IS NULL;

ALTER TABLE "public"."duty_roster_templates"
  ALTER COLUMN "assignment_type_id" SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE ONLY "public"."duty_roster_templates"
    ADD CONSTRAINT "duty_roster_templates_assignment_type_id_fkey"
    FOREIGN KEY ("assignment_type_id") REFERENCES "public"."assignment_types"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."duty_roster_template_runs"
  ADD COLUMN IF NOT EXISTS "applied_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "applied_by_user_id" "uuid";

DO $$
BEGIN
  ALTER TABLE ONLY "public"."duty_roster_template_runs"
    ADD CONSTRAINT "duty_roster_template_runs_applied_by_user_id_fkey"
    FOREIGN KEY ("applied_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."daily_assignments"
  ADD COLUMN IF NOT EXISTS "duty_roster_template_run_id" "uuid",
  ADD COLUMN IF NOT EXISTS "duty_roster_template_run_row_date" "date";

DO $$
BEGIN
  ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_duty_roster_template_run_id_fkey"
    FOREIGN KEY ("duty_roster_template_run_id") REFERENCES "public"."duty_roster_template_runs"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "daily_assignments_duty_roster_template_run_idx"
  ON "public"."daily_assignments" USING "btree" ("organization_id", "duty_roster_template_run_id")
  WHERE "duty_roster_template_run_id" IS NOT NULL;
