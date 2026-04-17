ALTER TABLE "public"."ict_tasks"
  ADD COLUMN IF NOT EXISTS "description" "text";

ALTER TABLE "public"."ict_tasks"
  ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "pg_constraint"
    WHERE "conname" = 'ict_tasks_sort_order_non_negative'
  ) THEN
    ALTER TABLE "public"."ict_tasks"
      ADD CONSTRAINT "ict_tasks_sort_order_non_negative" CHECK ("sort_order" >= 0);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS "idx_ict_tasks_org_sort_code"
  ON "public"."ict_tasks" USING "btree" ("organization_id", "sort_order", "task_code");

CREATE OR REPLACE FUNCTION "public"."can_manage_ict_task_library"("p_organization_id" "uuid")
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND "organization_memberships"."role" IN ('owner', 'admin')
  );
$$;

ALTER FUNCTION "public"."can_manage_ict_task_library"("p_organization_id" "uuid") OWNER TO "postgres";

DROP POLICY IF EXISTS "Users can manage ICT tasks if they can manage training config" ON "public"."ict_tasks";
DROP POLICY IF EXISTS "Owners and admins can manage ICT task library" ON "public"."ict_tasks";

CREATE POLICY "Owners and admins can manage ICT task library" ON "public"."ict_tasks"
  USING ("public"."can_manage_ict_task_library"("organization_id"))
  WITH CHECK ("public"."can_manage_ict_task_library"("organization_id"));

GRANT ALL ON FUNCTION "public"."can_manage_ict_task_library"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_ict_task_library"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_ict_task_library"("p_organization_id" "uuid") TO "service_role";
