ALTER TABLE "public"."assignment_types"
  ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "idx_assignment_types_org_archived_sort"
  ON "public"."assignment_types" USING "btree" ("organization_id", "archived_at", "sort_order");
