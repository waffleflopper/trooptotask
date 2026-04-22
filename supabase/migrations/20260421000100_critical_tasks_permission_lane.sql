ALTER TABLE "public"."organization_memberships"
  ADD COLUMN IF NOT EXISTS "can_view_critical_tasks" boolean,
  ADD COLUMN IF NOT EXISTS "can_edit_critical_tasks" boolean;

ALTER TABLE "public"."organization_invitations"
  ADD COLUMN IF NOT EXISTS "can_view_critical_tasks" boolean,
  ADD COLUMN IF NOT EXISTS "can_edit_critical_tasks" boolean;

UPDATE "public"."organization_memberships"
SET
  "can_view_critical_tasks" = COALESCE("can_view_critical_tasks", "can_view_training", false),
  "can_edit_critical_tasks" = COALESCE("can_edit_critical_tasks", "can_edit_training", false)
WHERE "can_view_critical_tasks" IS NULL
   OR "can_edit_critical_tasks" IS NULL;

UPDATE "public"."organization_invitations"
SET
  "can_view_critical_tasks" = COALESCE("can_view_critical_tasks", "can_view_training", false),
  "can_edit_critical_tasks" = COALESCE("can_edit_critical_tasks", "can_edit_training", false)
WHERE "can_view_critical_tasks" IS NULL
   OR "can_edit_critical_tasks" IS NULL;

ALTER TABLE "public"."organization_memberships"
  ALTER COLUMN "can_view_critical_tasks" SET DEFAULT false,
  ALTER COLUMN "can_view_critical_tasks" SET NOT NULL,
  ALTER COLUMN "can_edit_critical_tasks" SET DEFAULT false,
  ALTER COLUMN "can_edit_critical_tasks" SET NOT NULL;

ALTER TABLE "public"."organization_invitations"
  ALTER COLUMN "can_view_critical_tasks" SET DEFAULT false,
  ALTER COLUMN "can_view_critical_tasks" SET NOT NULL,
  ALTER COLUMN "can_edit_critical_tasks" SET DEFAULT false,
  ALTER COLUMN "can_edit_critical_tasks" SET NOT NULL;

CREATE OR REPLACE FUNCTION "public"."can_view_critical_tasks"("p_organization_id" "uuid")
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_view_critical_tasks" = true
      )
  );
$$;

ALTER FUNCTION "public"."can_view_critical_tasks"("p_organization_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_edit_critical_tasks"("p_organization_id" "uuid")
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_edit_critical_tasks" = true
      )
  );
$$;

ALTER FUNCTION "public"."can_edit_critical_tasks"("p_organization_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_ict_completion_record"(
  "p_organization_id" "uuid",
  "p_personnel_id" "uuid"
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    JOIN "public"."personnel"
      ON "personnel"."id" = "p_personnel_id"
     AND "personnel"."organization_id" = "p_organization_id"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_edit_critical_tasks" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("personnel"."group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "personnel"."group_id")
      )
  );
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_personnel_ict_completion_record"(
  "p_organization_id" "uuid",
  "p_personnel_id" "uuid"
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    JOIN "public"."personnel"
      ON "personnel"."id" = "p_personnel_id"
     AND "personnel"."organization_id" = "p_organization_id"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_view_critical_tasks" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("personnel"."group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "personnel"."group_id")
      )
  );
$$;

DROP POLICY IF EXISTS "Users can view ICT tasks if they can view training data" ON "public"."ict_tasks";
DROP POLICY IF EXISTS "Users can view ICT tasks if they can view critical tasks data" ON "public"."ict_tasks";

CREATE POLICY "Users can view ICT tasks if they can view critical tasks data" ON "public"."ict_tasks"
  FOR SELECT
  USING ("public"."can_view_critical_tasks"("organization_id"));

DROP POLICY IF EXISTS "Users can view personnel ICT completions if allowed by scoped training access" ON "public"."personnel_ict_completions";
DROP POLICY IF EXISTS "Users can insert personnel ICT completions if allowed by scoped training access" ON "public"."personnel_ict_completions";
DROP POLICY IF EXISTS "Users can update personnel ICT completions if allowed by scoped training access" ON "public"."personnel_ict_completions";
DROP POLICY IF EXISTS "Users can delete personnel ICT completions if allowed by scoped training access" ON "public"."personnel_ict_completions";
DROP POLICY IF EXISTS "Users can view personnel ICT completions if allowed by scoped critical tasks access" ON "public"."personnel_ict_completions";
DROP POLICY IF EXISTS "Users can insert personnel ICT completions if allowed by scoped critical tasks access" ON "public"."personnel_ict_completions";
DROP POLICY IF EXISTS "Users can update personnel ICT completions if allowed by scoped critical tasks access" ON "public"."personnel_ict_completions";
DROP POLICY IF EXISTS "Users can delete personnel ICT completions if allowed by scoped critical tasks access" ON "public"."personnel_ict_completions";

CREATE POLICY "Users can view personnel ICT completions if allowed by scoped critical tasks access" ON "public"."personnel_ict_completions"
  FOR SELECT
  USING ("public"."can_view_personnel_ict_completion_record"("organization_id", "personnel_id"));

CREATE POLICY "Users can insert personnel ICT completions if allowed by scoped critical tasks access" ON "public"."personnel_ict_completions"
  FOR INSERT
  WITH CHECK ("public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id"));

CREATE POLICY "Users can update personnel ICT completions if allowed by scoped critical tasks access" ON "public"."personnel_ict_completions"
  FOR UPDATE
  USING ("public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id"))
  WITH CHECK ("public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id"));

CREATE POLICY "Users can delete personnel ICT completions if allowed by scoped critical tasks access" ON "public"."personnel_ict_completions"
  FOR DELETE
  USING ("public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id"));

GRANT ALL ON FUNCTION "public"."can_view_critical_tasks"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_critical_tasks"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_critical_tasks"("p_organization_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."can_edit_critical_tasks"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_critical_tasks"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_critical_tasks"("p_organization_id" "uuid") TO "service_role";
