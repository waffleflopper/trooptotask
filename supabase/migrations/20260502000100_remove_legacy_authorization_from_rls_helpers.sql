CREATE OR REPLACE FUNCTION "public"."member_access_required_capability_rank"("p_capability" text)
RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE "p_capability"
    WHEN 'none' THEN 0
    WHEN 'view' THEN 1
    WHEN 'operate' THEN 2
    WHEN 'configure' THEN 3
    ELSE 0
  END;
$$;

ALTER FUNCTION "public"."member_access_required_capability_rank"("p_capability" text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."member_access_lane_capability"(
  "p_member_preset" text,
  "p_capability_overrides" jsonb,
  "p_lane" text
) RETURNS text
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN "p_capability_overrides" ->> "p_lane" IN ('none', 'view', 'operate', 'configure')
      THEN "p_capability_overrides" ->> "p_lane"
    WHEN "p_member_preset" = 'editor' THEN 'configure'
    WHEN "p_member_preset" = 'operator' THEN 'operate'
    WHEN "p_member_preset" = 'viewer' THEN 'view'
    ELSE 'none'
  END;
$$;

ALTER FUNCTION "public"."member_access_lane_capability"(text, jsonb, text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."member_access_has_capability"(
  "p_organization_id" uuid,
  "p_lane" text,
  "p_required_capability" text
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "public"."member_access_required_capability_rank"(
          "public"."member_access_lane_capability"(
            "organization_memberships"."member_preset",
            "organization_memberships"."capability_overrides",
            "p_lane"
          )
        ) >= "public"."member_access_required_capability_rank"("p_required_capability")
      )
  );
$$;

ALTER FUNCTION "public"."member_access_has_capability"(uuid, text, text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."member_access_group_scope_matches"(
  "p_organization_id" uuid,
  "p_group_id" uuid
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."access_scope_kind" = 'organization'
        OR "p_group_id" IS NULL
        OR (
          "organization_memberships"."access_scope_kind" = 'groups'
          AND array_length("organization_memberships"."access_scope_group_ids", 1) > 0
          AND "p_group_id" = ANY("organization_memberships"."access_scope_group_ids")
        )
      )
  );
$$;

ALTER FUNCTION "public"."member_access_group_scope_matches"(uuid, uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_view_calendar"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'view');
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_calendar"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'operate');
$$;

CREATE OR REPLACE FUNCTION "public"."can_manage_calendar_configuration"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'configure');
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_personnel"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'view');
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_personnel"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'operate');
$$;

CREATE OR REPLACE FUNCTION "public"."can_manage_groups"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'configure');
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_training"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'view');
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_training"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'operate');
$$;

CREATE OR REPLACE FUNCTION "public"."can_manage_training_configuration"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'configure');
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_onboarding"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'onboarding', 'view');
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_onboarding"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'onboarding', 'operate');
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_critical_tasks"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'view');
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_critical_tasks"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'operate');
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_rating_scheme"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'view');
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_rating_scheme"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'operate');
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_leaders_book"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'view');
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_leaders_book"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'operate');
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_personnel_record"(
  "p_organization_id" uuid,
  "p_group_id" uuid
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'view')
     AND "public"."member_access_group_scope_matches"("p_organization_id", "p_group_id");
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_record"(
  "p_organization_id" uuid,
  "p_group_id" uuid
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'operate')
     AND "public"."member_access_group_scope_matches"("p_organization_id", "p_group_id");
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_personnel_training_record"(
  "p_organization_id" uuid,
  "p_personnel_id" uuid
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'view')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_personnel_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_training_record"(
  "p_organization_id" uuid,
  "p_personnel_id" uuid
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'operate')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_personnel_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_availability_record"(
  "p_organization_id" uuid,
  "p_personnel_id" uuid
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'view')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_personnel_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_availability_record"(
  "p_organization_id" uuid,
  "p_personnel_id" uuid
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'operate')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_personnel_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_daily_assignment_record"(
  "p_organization_id" uuid,
  "p_assignment_type_id" uuid,
  "p_assignee_id" text
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'view')
     AND EXISTS (
       SELECT 1
       FROM "public"."assignment_types"
       LEFT JOIN "public"."personnel"
         ON "assignment_types"."assign_to" = 'personnel'
        AND ("personnel"."id")::text = "p_assignee_id"
        AND "personnel"."organization_id" = "p_organization_id"
       WHERE "assignment_types"."id" = "p_assignment_type_id"
         AND "assignment_types"."organization_id" = "p_organization_id"
         AND (
           "assignment_types"."assign_to" = 'group'
           OR "personnel"."id" IS NOT NULL
         )
         AND (
           "assignment_types"."assign_to" = 'group'
           OR "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
         )
     );
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_daily_assignment_record"(
  "p_organization_id" uuid,
  "p_assignment_type_id" uuid,
  "p_assignee_id" text
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'operate')
     AND EXISTS (
       SELECT 1
       FROM "public"."assignment_types"
       LEFT JOIN "public"."personnel"
         ON "assignment_types"."assign_to" = 'personnel'
        AND ("personnel"."id")::text = "p_assignee_id"
        AND "personnel"."organization_id" = "p_organization_id"
       WHERE "assignment_types"."id" = "p_assignment_type_id"
         AND "assignment_types"."organization_id" = "p_organization_id"
         AND (
           "assignment_types"."assign_to" = 'group'
           OR "personnel"."id" IS NOT NULL
         )
         AND (
           "assignment_types"."assign_to" = 'group'
           OR "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
         )
     );
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_daily_assignment_record"(
  "p_organization_id" uuid,
  "p_assignee_id" text
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'view')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE ("personnel"."id")::text = "p_assignee_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_daily_assignment_record"(
  "p_organization_id" uuid,
  "p_assignee_id" text
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'operate')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE ("personnel"."id")::text = "p_assignee_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_personnel_ict_completion_record"(
  "p_organization_id" uuid,
  "p_personnel_id" uuid
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'view')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_personnel_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_ict_completion_record"(
  "p_organization_id" uuid,
  "p_personnel_id" uuid
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'operate')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_personnel_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_rating_scheme_record"(
  "p_organization_id" uuid,
  "p_rated_person_id" uuid
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'view')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_rated_person_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_rating_scheme_record"(
  "p_organization_id" uuid,
  "p_rated_person_id" uuid
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'operate')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_rated_person_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;

CREATE OR REPLACE FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" uuid)
RETURNS TABLE("id" uuid, "rank" text, "last_name" text, "first_name" text)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    "personnel"."id",
    "personnel"."rank",
    "personnel"."last_name",
    "personnel"."first_name"
  FROM "public"."personnel"
  WHERE "personnel"."organization_id" = "p_organization_id"
    AND "personnel"."archived_at" IS NULL
    AND "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'view')
    AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
  ORDER BY "personnel"."last_name" ASC, "personnel"."first_name" ASC;
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_sensitive_file_object"("bucket_name" text, "object_name" text)
RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
DECLARE
  org_id uuid;
  object_scope text;
BEGIN
  IF NOT public.is_valid_sensitive_file_path(bucket_name, object_name) THEN
    RETURN FALSE;
  END IF;

  org_id := public.storage_object_org_id(object_name);
  object_scope := public.storage_object_scope(object_name);

  CASE object_scope
    WHEN 'sign-in-rosters' THEN
      RETURN public.can_view_personnel(org_id);
    WHEN 'counseling-records' THEN
      RETURN public.can_view_leaders_book(org_id);
    WHEN 'counseling-templates' THEN
      RETURN public.can_view_leaders_book(org_id);
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_sensitive_file_object"("bucket_name" text, "object_name" text)
RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
DECLARE
  org_id uuid;
  object_scope text;
BEGIN
  IF NOT public.is_valid_sensitive_file_path(bucket_name, object_name) THEN
    RETURN FALSE;
  END IF;

  org_id := public.storage_object_org_id(object_name);
  object_scope := public.storage_object_scope(object_name);

  CASE object_scope
    WHEN 'sign-in-rosters' THEN
      RETURN public.can_edit_training(org_id);
    WHEN 'counseling-records' THEN
      RETURN public.can_edit_leaders_book(org_id);
    WHEN 'counseling-templates' THEN
      RETURN public.can_edit_leaders_book(org_id);
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

ALTER FUNCTION "public"."can_view_calendar"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_edit_calendar"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_manage_calendar_configuration"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_view_personnel"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_edit_personnel"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_manage_groups"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_view_training"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_edit_training"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_manage_training_configuration"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_view_onboarding"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_edit_onboarding"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_view_critical_tasks"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_edit_critical_tasks"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_view_rating_scheme"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_edit_rating_scheme"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_view_leaders_book"(uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."can_edit_leaders_book"(uuid) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."member_access_required_capability_rank"(text) TO "anon";
GRANT ALL ON FUNCTION "public"."member_access_required_capability_rank"(text) TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_access_required_capability_rank"(text) TO "service_role";

GRANT ALL ON FUNCTION "public"."member_access_lane_capability"(text, jsonb, text) TO "anon";
GRANT ALL ON FUNCTION "public"."member_access_lane_capability"(text, jsonb, text) TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_access_lane_capability"(text, jsonb, text) TO "service_role";

GRANT ALL ON FUNCTION "public"."member_access_has_capability"(uuid, text, text) TO "anon";
GRANT ALL ON FUNCTION "public"."member_access_has_capability"(uuid, text, text) TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_access_has_capability"(uuid, text, text) TO "service_role";

GRANT ALL ON FUNCTION "public"."member_access_group_scope_matches"(uuid, uuid) TO "anon";
GRANT ALL ON FUNCTION "public"."member_access_group_scope_matches"(uuid, uuid) TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_access_group_scope_matches"(uuid, uuid) TO "service_role";
