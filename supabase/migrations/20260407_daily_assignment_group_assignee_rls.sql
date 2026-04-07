CREATE OR REPLACE FUNCTION "public"."can_view_daily_assignment_record"(
    "p_organization_id" "uuid",
    "p_assignment_type_id" "uuid",
    "p_assignee_id" "text"
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    JOIN "public"."assignment_types"
      ON "assignment_types"."id" = "p_assignment_type_id"
     AND "assignment_types"."organization_id" = "p_organization_id"
    LEFT JOIN "public"."personnel"
      ON "assignment_types"."assign_to" = 'personnel'
     AND ("personnel"."id")::text = "p_assignee_id"
     AND "personnel"."organization_id" = "p_organization_id"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_view_calendar" = true
      )
      AND (
        "assignment_types"."assign_to" = 'group'
        OR "personnel"."id" IS NOT NULL
      )
      AND (
        "assignment_types"."assign_to" = 'group'
        OR "organization_memberships"."scoped_group_id" IS NULL
        OR "personnel"."group_id" IS NULL
        OR "organization_memberships"."scoped_group_id" = "personnel"."group_id"
      )
  );
$$;

ALTER FUNCTION "public"."can_view_daily_assignment_record"(
    "p_organization_id" "uuid",
    "p_assignment_type_id" "uuid",
    "p_assignee_id" "text"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_edit_daily_assignment_record"(
    "p_organization_id" "uuid",
    "p_assignment_type_id" "uuid",
    "p_assignee_id" "text"
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    JOIN "public"."assignment_types"
      ON "assignment_types"."id" = "p_assignment_type_id"
     AND "assignment_types"."organization_id" = "p_organization_id"
    LEFT JOIN "public"."personnel"
      ON "assignment_types"."assign_to" = 'personnel'
     AND ("personnel"."id")::text = "p_assignee_id"
     AND "personnel"."organization_id" = "p_organization_id"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_edit_calendar" = true
      )
      AND (
        "assignment_types"."assign_to" = 'group'
        OR "personnel"."id" IS NOT NULL
      )
      AND (
        "assignment_types"."assign_to" = 'group'
        OR "organization_memberships"."scoped_group_id" IS NULL
        OR "personnel"."group_id" IS NULL
        OR "organization_memberships"."scoped_group_id" = "personnel"."group_id"
      )
  );
$$;

ALTER FUNCTION "public"."can_edit_daily_assignment_record"(
    "p_organization_id" "uuid",
    "p_assignment_type_id" "uuid",
    "p_assignee_id" "text"
) OWNER TO "postgres";

DROP POLICY IF EXISTS "Users can view daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments";
DROP POLICY IF EXISTS "Users can insert daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments";
DROP POLICY IF EXISTS "Users can update daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments";
DROP POLICY IF EXISTS "Users can delete daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments";

CREATE POLICY "Users can view daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments"
    FOR SELECT
    USING ("public"."can_view_daily_assignment_record"("organization_id", "assignment_type_id", "assignee_id"));

CREATE POLICY "Users can insert daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments"
    FOR INSERT
    WITH CHECK ("public"."can_edit_daily_assignment_record"("organization_id", "assignment_type_id", "assignee_id"));

CREATE POLICY "Users can update daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments"
    FOR UPDATE
    USING ("public"."can_edit_daily_assignment_record"("organization_id", "assignment_type_id", "assignee_id"))
    WITH CHECK ("public"."can_edit_daily_assignment_record"("organization_id", "assignment_type_id", "assignee_id"));

CREATE POLICY "Users can delete daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments"
    FOR DELETE
    USING ("public"."can_edit_daily_assignment_record"("organization_id", "assignment_type_id", "assignee_id"));
