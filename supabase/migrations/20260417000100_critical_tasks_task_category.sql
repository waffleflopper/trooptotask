ALTER TABLE "public"."ict_tasks"
  ADD COLUMN IF NOT EXISTS "category" "text";

CREATE INDEX IF NOT EXISTS "idx_ict_tasks_org_category"
  ON "public"."ict_tasks" USING "btree" ("organization_id", "category");
