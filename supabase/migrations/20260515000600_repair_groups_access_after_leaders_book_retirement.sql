CREATE OR REPLACE FUNCTION "public"."can_view_groups"("p_organization_id" uuid)
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    "public"."member_access_has_capability"("p_organization_id", 'calendar', 'view')
    OR "public"."member_access_has_capability"("p_organization_id", 'personnel', 'view')
    OR "public"."member_access_has_capability"("p_organization_id", 'training', 'view')
    OR "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'view')
    OR "public"."member_access_has_capability"("p_organization_id", 'onboarding', 'view')
    OR "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'view')
    OR EXISTS (
      SELECT 1
      FROM "public"."organization_memberships"
      WHERE "organization_memberships"."organization_id" = "p_organization_id"
        AND "organization_memberships"."user_id" = "auth"."uid"()
        AND "organization_memberships"."can_manage_members" = true
    );
$$;

ALTER FUNCTION "public"."can_view_groups"(uuid) OWNER TO "postgres";
