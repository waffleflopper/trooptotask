DROP POLICY IF EXISTS "sign_in_rosters_insert" ON "public"."sign_in_rosters";


CREATE POLICY "sign_in_rosters_insert" ON "public"."sign_in_rosters"
    FOR INSERT
    WITH CHECK ("public"."can_edit_training"("organization_id"));


CREATE OR REPLACE FUNCTION "public"."can_view_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_view_personnel" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("p_group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "p_group_id")
      )
  );
$$;


ALTER FUNCTION "public"."can_view_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_edit_personnel" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("p_group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "p_group_id")
      )
  );
$$;


ALTER FUNCTION "public"."can_edit_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") OWNER TO "postgres";


DROP POLICY IF EXISTS "Members can view personnel" ON "public"."personnel";
DROP POLICY IF EXISTS "Members can insert personnel" ON "public"."personnel";
DROP POLICY IF EXISTS "Members can update personnel" ON "public"."personnel";
DROP POLICY IF EXISTS "Members can delete personnel" ON "public"."personnel";


CREATE POLICY "Users can view personnel if allowed by scoped personnel access" ON "public"."personnel"
    FOR SELECT
    USING ("public"."can_view_personnel_record"("organization_id", "group_id"));


CREATE POLICY "Users can insert personnel if allowed by scoped personnel access" ON "public"."personnel"
    FOR INSERT
    WITH CHECK ("public"."can_edit_personnel_record"("organization_id", "group_id"));


CREATE POLICY "Users can update personnel if allowed by scoped personnel access" ON "public"."personnel"
    FOR UPDATE
    USING ("public"."can_edit_personnel_record"("organization_id", "group_id"))
    WITH CHECK ("public"."can_edit_personnel_record"("organization_id", "group_id"));


CREATE POLICY "Users can delete personnel if allowed by scoped personnel access" ON "public"."personnel"
    FOR DELETE
    USING ("public"."can_edit_personnel_record"("organization_id", "group_id"));


CREATE OR REPLACE FUNCTION "public"."can_view_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") RETURNS boolean
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
        OR "organization_memberships"."can_view_training" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("personnel"."group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "personnel"."group_id")
      )
  );
$$;


ALTER FUNCTION "public"."can_view_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") RETURNS boolean
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
        OR "organization_memberships"."can_edit_training" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("personnel"."group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "personnel"."group_id")
      )
  );
$$;


ALTER FUNCTION "public"."can_edit_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") OWNER TO "postgres";


DROP POLICY IF EXISTS "Members can view personnel trainings" ON "public"."personnel_trainings";
DROP POLICY IF EXISTS "Members can insert personnel trainings" ON "public"."personnel_trainings";
DROP POLICY IF EXISTS "Members can update personnel trainings" ON "public"."personnel_trainings";
DROP POLICY IF EXISTS "Members can delete personnel trainings" ON "public"."personnel_trainings";


CREATE POLICY "Users can view personnel trainings if allowed by scoped training access" ON "public"."personnel_trainings"
    FOR SELECT
    USING ("public"."can_view_personnel_training_record"("organization_id", "personnel_id"));


CREATE POLICY "Users can insert personnel trainings if allowed by scoped training access" ON "public"."personnel_trainings"
    FOR INSERT
    WITH CHECK ("public"."can_edit_personnel_training_record"("organization_id", "personnel_id"));


CREATE POLICY "Users can update personnel trainings if allowed by scoped training access" ON "public"."personnel_trainings"
    FOR UPDATE
    USING ("public"."can_edit_personnel_training_record"("organization_id", "personnel_id"))
    WITH CHECK ("public"."can_edit_personnel_training_record"("organization_id", "personnel_id"));


CREATE POLICY "Users can delete personnel trainings if allowed by scoped training access" ON "public"."personnel_trainings"
    FOR DELETE
    USING ("public"."can_edit_personnel_training_record"("organization_id", "personnel_id"));


CREATE OR REPLACE FUNCTION "public"."can_view_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") RETURNS boolean
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
        OR "organization_memberships"."can_view_calendar" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("personnel"."group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "personnel"."group_id")
      )
  );
$$;


ALTER FUNCTION "public"."can_view_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") RETURNS boolean
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
        OR "organization_memberships"."can_edit_calendar" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("personnel"."group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "personnel"."group_id")
      )
  );
$$;


ALTER FUNCTION "public"."can_edit_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") OWNER TO "postgres";


DROP POLICY IF EXISTS "Members can view availability" ON "public"."availability_entries";
DROP POLICY IF EXISTS "Members can insert availability" ON "public"."availability_entries";
DROP POLICY IF EXISTS "Members can update availability" ON "public"."availability_entries";
DROP POLICY IF EXISTS "Members can delete availability" ON "public"."availability_entries";


CREATE POLICY "Users can view availability if allowed by scoped calendar access" ON "public"."availability_entries"
    FOR SELECT
    USING ("public"."can_view_availability_record"("organization_id", "personnel_id"));


CREATE POLICY "Users can insert availability if allowed by scoped calendar access" ON "public"."availability_entries"
    FOR INSERT
    WITH CHECK ("public"."can_edit_availability_record"("organization_id", "personnel_id"));


CREATE POLICY "Users can update availability if allowed by scoped calendar access" ON "public"."availability_entries"
    FOR UPDATE
    USING ("public"."can_edit_availability_record"("organization_id", "personnel_id"))
    WITH CHECK ("public"."can_edit_availability_record"("organization_id", "personnel_id"));


CREATE POLICY "Users can delete availability if allowed by scoped calendar access" ON "public"."availability_entries"
    FOR DELETE
    USING ("public"."can_edit_availability_record"("organization_id", "personnel_id"));


CREATE OR REPLACE FUNCTION "public"."can_view_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    JOIN "public"."personnel"
      ON ("personnel"."id")::text = "p_assignee_id"
     AND "personnel"."organization_id" = "p_organization_id"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_view_calendar" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("personnel"."group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "personnel"."group_id")
      )
  );
$$;


ALTER FUNCTION "public"."can_view_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    JOIN "public"."personnel"
      ON ("personnel"."id")::text = "p_assignee_id"
     AND "personnel"."organization_id" = "p_organization_id"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_edit_calendar" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("personnel"."group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "personnel"."group_id")
      )
  );
$$;


ALTER FUNCTION "public"."can_edit_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") OWNER TO "postgres";


DROP POLICY IF EXISTS "Members can view daily assignments" ON "public"."daily_assignments";
DROP POLICY IF EXISTS "Members can insert daily assignments" ON "public"."daily_assignments";
DROP POLICY IF EXISTS "Members can update daily assignments" ON "public"."daily_assignments";
DROP POLICY IF EXISTS "Members can delete daily assignments" ON "public"."daily_assignments";


CREATE POLICY "Users can view daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments"
    FOR SELECT
    USING ("public"."can_view_daily_assignment_record"("organization_id", "assignee_id"));


CREATE POLICY "Users can insert daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments"
    FOR INSERT
    WITH CHECK ("public"."can_edit_daily_assignment_record"("organization_id", "assignee_id"));


CREATE POLICY "Users can update daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments"
    FOR UPDATE
    USING ("public"."can_edit_daily_assignment_record"("organization_id", "assignee_id"))
    WITH CHECK ("public"."can_edit_daily_assignment_record"("organization_id", "assignee_id"));


CREATE POLICY "Users can delete daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments"
    FOR DELETE
    USING ("public"."can_edit_daily_assignment_record"("organization_id", "assignee_id"));


CREATE OR REPLACE FUNCTION "public"."can_view_groups"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_manage_members" = true
        OR "organization_memberships"."can_view_calendar" = true
        OR "organization_memberships"."can_edit_calendar" = true
        OR "organization_memberships"."can_view_personnel" = true
        OR "organization_memberships"."can_edit_personnel" = true
        OR "organization_memberships"."can_view_training" = true
        OR "organization_memberships"."can_edit_training" = true
        OR "organization_memberships"."can_view_onboarding" = true
        OR "organization_memberships"."can_edit_onboarding" = true
        OR "organization_memberships"."can_view_leaders_book" = true
        OR "organization_memberships"."can_edit_leaders_book" = true
      )
  );
$$;


ALTER FUNCTION "public"."can_view_groups"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_groups"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_edit_personnel" = true
      )
  );
$$;


ALTER FUNCTION "public"."can_manage_groups"("p_organization_id" "uuid") OWNER TO "postgres";


DROP POLICY IF EXISTS "Members can view groups" ON "public"."groups";
DROP POLICY IF EXISTS "Members and creators can insert groups" ON "public"."groups";
DROP POLICY IF EXISTS "Members can update groups" ON "public"."groups";
DROP POLICY IF EXISTS "Members can delete groups" ON "public"."groups";


CREATE POLICY "Users can view groups if they can access related workspaces" ON "public"."groups"
    FOR SELECT
    USING ("public"."can_view_groups"("organization_id"));


CREATE POLICY "Users can manage groups if they can edit personnel" ON "public"."groups"
    FOR ALL
    USING ("public"."can_manage_groups"("organization_id"))
    WITH CHECK ("public"."can_manage_groups"("organization_id"));


DROP POLICY IF EXISTS "Members can view special days" ON "public"."special_days";
DROP POLICY IF EXISTS "Members and creators can insert special days" ON "public"."special_days";
DROP POLICY IF EXISTS "Members can update special days" ON "public"."special_days";
DROP POLICY IF EXISTS "Members can delete special days" ON "public"."special_days";


CREATE POLICY "Users can view special days if they can view calendar data" ON "public"."special_days"
    FOR SELECT
    USING ("public"."can_view_calendar"("organization_id"));


CREATE POLICY "Users can manage special days if they can edit calendar data" ON "public"."special_days"
    FOR ALL
    USING ("public"."can_edit_calendar"("organization_id"))
    WITH CHECK ("public"."can_edit_calendar"("organization_id"));


CREATE OR REPLACE FUNCTION "public"."is_full_editor_for_org"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND "organization_memberships"."role" NOT IN ('owner', 'admin')
      AND "organization_memberships"."scoped_group_id" IS NULL
      AND "organization_memberships"."can_view_calendar" = true
      AND "organization_memberships"."can_edit_calendar" = true
      AND "organization_memberships"."can_view_personnel" = true
      AND "organization_memberships"."can_edit_personnel" = true
      AND "organization_memberships"."can_view_training" = true
      AND "organization_memberships"."can_edit_training" = true
      AND "organization_memberships"."can_view_onboarding" = true
      AND "organization_memberships"."can_edit_onboarding" = true
      AND "organization_memberships"."can_view_leaders_book" = true
      AND "organization_memberships"."can_edit_leaders_book" = true
  );
$$;


ALTER FUNCTION "public"."is_full_editor_for_org"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_calendar_configuration"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "public"."is_full_editor_for_org"("p_organization_id")
      )
  );
$$;


ALTER FUNCTION "public"."can_manage_calendar_configuration"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_training_configuration"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "public"."is_full_editor_for_org"("p_organization_id")
      )
  );
$$;


ALTER FUNCTION "public"."can_manage_training_configuration"("p_organization_id" "uuid") OWNER TO "postgres";


DROP POLICY IF EXISTS "Members can view assignment types" ON "public"."assignment_types";
DROP POLICY IF EXISTS "Members and creators can insert assignment types" ON "public"."assignment_types";
DROP POLICY IF EXISTS "Members can update assignment types" ON "public"."assignment_types";
DROP POLICY IF EXISTS "Members can delete assignment types" ON "public"."assignment_types";


CREATE POLICY "Users can view assignment types if they can view calendar data" ON "public"."assignment_types"
    FOR SELECT
    USING ("public"."can_view_calendar"("organization_id"));


CREATE POLICY "Users can manage assignment types if they are full editors" ON "public"."assignment_types"
    FOR ALL
    USING ("public"."can_manage_calendar_configuration"("organization_id"))
    WITH CHECK ("public"."can_manage_calendar_configuration"("organization_id"));


DROP POLICY IF EXISTS "Members can view status types" ON "public"."status_types";
DROP POLICY IF EXISTS "Members and creators can insert status types" ON "public"."status_types";
DROP POLICY IF EXISTS "Members can update status types" ON "public"."status_types";
DROP POLICY IF EXISTS "Members can delete status types" ON "public"."status_types";


CREATE POLICY "Users can view status types if they can view calendar data" ON "public"."status_types"
    FOR SELECT
    USING ("public"."can_view_calendar"("organization_id"));


CREATE POLICY "Users can manage status types if they are full editors" ON "public"."status_types"
    FOR ALL
    USING ("public"."can_manage_calendar_configuration"("organization_id"))
    WITH CHECK ("public"."can_manage_calendar_configuration"("organization_id"));


DROP POLICY IF EXISTS "Members can view training types" ON "public"."training_types";
DROP POLICY IF EXISTS "Members and creators can insert training types" ON "public"."training_types";
DROP POLICY IF EXISTS "Members can update training types" ON "public"."training_types";
DROP POLICY IF EXISTS "Members can delete training types" ON "public"."training_types";


CREATE POLICY "Users can view training types if they can view training data" ON "public"."training_types"
    FOR SELECT
    USING ("public"."can_view_training"("organization_id"));


CREATE POLICY "Users can manage training types if they are full editors" ON "public"."training_types"
    FOR ALL
    USING ("public"."can_manage_training_configuration"("organization_id"))
    WITH CHECK ("public"."can_manage_training_configuration"("organization_id"));
